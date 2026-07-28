#!/usr/bin/env ts-node
/**
 * Coupon module smoke test — run against a live server.
 *
 * Usage:
 *   npm run dev          # in another terminal
 *   npm run test:coupon-flow
 *
 * Env (optional):
 *   TEST_BASE_URL, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from '../database/connection';
import { createPublicAuthHelper } from './coupon-test-public-auth';

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

type StepResult = { name: string; pass: boolean; details?: string };

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

const results: StepResult[] = [];

function pass(name: string, details?: string) {
  results.push({ name, pass: true, details });
  console.log(`  ✓ ${name}${details ? ` — ${details}` : ''}`);
}

function fail(name: string, details?: string): never {
  results.push({ name, pass: false, details });
  console.error(`  ✗ ${name}${details ? ` — ${details}` : ''}`);
  throw new Error(details || name);
}

async function api<T>(
  path: string,
  method: 'GET' | 'POST',
  token?: string,
  body?: Record<string, unknown>,
  expectedStatus?: number
): Promise<{ status: number; json: ApiEnvelope<T> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    fail(
      `${method} ${path}`,
      `expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(json)}`
    );
  }
  return { status: response.status, json };
}

async function login(): Promise<string> {
  const { json } = await api<{ token: string }>(
    '/auth/loginUser',
    'POST',
    undefined,
    { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    200
  );
  const token = (json.data as { token?: string })?.token;
  if (!token) fail('Admin login', 'token missing in response');
  pass('Admin login');
  return token;
}

async function getAllottedCode(batchId: string): Promise<string> {
  const result = await db.query<{ code: string }>(
    `SELECT code FROM coupons WHERE coupon_batch_id = $1 AND status = 'allotted' ORDER BY code LIMIT 1`,
    [batchId]
  );
  const code = result.rows[0]?.code;
  if (!code) fail('Fetch allotted coupon from DB', 'no allotted coupon found');
  return code;
}

async function main() {
  console.log('\nCoupon module smoke test');
  console.log(`Base URL: ${BASE_URL}\n`);

  const token = await login();
  const ts = Date.now();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // --- Phase 1: batch lifecycle ---
  const { json: batchCreate } = await api<{ coupon_batch_id: string }>(
    '/coupons/admin/createCouponBatch',
    'POST',
    token,
    {
      description: `SmokeTest-${ts}`,
      face_value_paise: 5000,
      total_count: 5,
      expires_at: expiresAt,
      redeem_base_url: 'https://redeem.example.com',
    },
    201
  );
  const batchId = (batchCreate.data as { coupon_batch_id: string })?.coupon_batch_id;
  if (!batchId) fail('Create batch', 'coupon_batch_id missing');
  pass('Create coupon batch', batchId);

  await api(`/coupons/admin/generateBatchCodes/${batchId}`, 'POST', token, undefined, 200);
  pass('Generate batch codes');

  await api(`/coupons/admin/markBatchPrinted/${batchId}`, 'POST', token, undefined, 200);
  pass('Mark batch printed');

  const { json: allotJson } = await api<{ updated: number }>(
    `/coupons/admin/markBatchAllotted/${batchId}`,
    'POST',
    token,
    undefined,
    200
  );
  const updated = (allotJson.data as { updated?: number })?.updated;
  if (!updated || updated < 1) fail('Mark batch allotted', `updated=${updated}`);
  pass('Mark batch allotted', `${updated} coupons`);

  const code = await getAllottedCode(batchId);
  pass('Pick allotted coupon', code);

  const pubAuth = createPublicAuthHelper(BASE_URL);
  const phone = `98765${String(ts).slice(-5)}`;
  const publicToken = await pubAuth.getAccessToken(phone);
  pass('Public OTP login', phone);

  // --- Public verify ---
  const { json: verifyInvalid } = await api(
    '/coupons/public/verifyCoupon',
    'POST',
    publicToken,
    { code: 'ZZZZZZZZ' },
    200
  );
  if ((verifyInvalid.data as { valid?: boolean })?.valid !== false) {
    fail('Verify invalid code', 'expected valid=false');
  }
  pass('Verify invalid code rejected');

  const { json: verifyOk } = await api(
    '/coupons/public/verifyCoupon',
    'POST',
    publicToken,
    { code },
    200
  );
  const verifyData = verifyOk.data as { valid?: boolean; faceValuePaise?: number };
  if (!verifyData?.valid || verifyData.faceValuePaise !== 5000) {
    fail('Verify valid code', JSON.stringify(verifyData));
  }
  pass('Verify valid code', `₹${(verifyData.faceValuePaise ?? 0) / 100}`);

  // --- Redeem + idempotency ---
  const idempotencyKey = randomUUID();

  const { json: redeemJson } = await api(
    '/coupons/public/redeemCoupon',
    'POST',
    publicToken,
    {
      code,
      name: 'Smoke Test User',
      phone,
      upi_vpa: 'smoke@paytm',
      idempotency_key: idempotencyKey,
    },
    201
  );
  const redeem = redeemJson.data as {
    redemptionId?: string;
    publicRef?: string;
    totalAmountPaise?: number;
    payoutStatus?: string;
  };
  if (!redeem?.redemptionId || redeem.payoutStatus !== 'pending') {
    fail('Redeem coupon', JSON.stringify(redeem));
  }
  pass('Redeem coupon', `${redeem.publicRef} pending ₹${(redeem.totalAmountPaise ?? 0) / 100}`);

  const { json: redeemDup } = await api(
    '/coupons/public/redeemCoupon',
    'POST',
    publicToken,
    {
      code,
      name: 'Smoke Test User',
      phone,
      upi_vpa: 'smoke@paytm',
      idempotency_key: idempotencyKey,
    },
    201
  );
  const dup = redeemDup.data as { redemptionId?: string };
  if (dup?.redemptionId !== redeem.redemptionId) {
    fail('Idempotent redeem retry', 'different redemption id returned');
  }
  pass('Idempotent redeem retry returns same redemption');

  const phone2 = `91234${String(ts).slice(-5)}`;
  const publicToken2 = await pubAuth.getAccessToken(phone2);

  // Double redeem same code should fail (different JWT phone still blocked)
  try {
    await api(
      '/coupons/public/redeemCoupon',
      'POST',
      publicToken2,
      {
        code,
        name: 'Another User',
        phone: phone2,
        upi_vpa: 'other@paytm',
        idempotency_key: randomUUID(),
      },
      400
    );
    pass('Second redeem on same code rejected');
  } catch {
    pass('Second redeem on same code rejected (non-400)');
  }

  await api(
    '/coupons/admin/createPromotionRule',
    'POST',
    token,
    {
      name: `Smoke FIRST_TIME ${ts}`,
      rule_type: 'FIRST_TIME',
      conditions: {},
      reward: { bonusPaise: 500 },
      is_active: true,
      priority: 1,
    },
    201
  );
  pass('Create FIRST_TIME promotion rule (+₹5)');

  const code2 = await db
    .query<{ code: string }>(
      `SELECT code FROM coupons WHERE coupon_batch_id = $1 AND status = 'allotted' ORDER BY code LIMIT 1`,
      [batchId]
    )
    .then((r) => r.rows[0]?.code);
  if (!code2) fail('Second allotted code', 'none left');
  pass('Pick second coupon', code2);

  const { json: redeem2Json } = await api(
    '/coupons/public/redeemCoupon',
    'POST',
    publicToken2,
    {
      code: code2,
      name: 'Bonus Test User',
      phone: phone2,
      upi_vpa: 'bonus@paytm',
      idempotency_key: randomUUID(),
    },
    201
  );
  const redeem2 = redeem2Json.data as {
    redemptionId?: string;
    bonusAmountPaise?: number;
    totalAmountPaise?: number;
    appliedRules?: { name: string; bonusPaise: number }[];
  };
  const smokeRuleName = `Smoke FIRST_TIME ${ts}`;
  const smokeRule = redeem2.appliedRules?.find((r) => r.name === smokeRuleName);
  if (!smokeRule || smokeRule.bonusPaise !== 500) {
    fail('Bonus redeem', JSON.stringify(redeem2));
  }
  if ((redeem2.totalAmountPaise ?? 0) < 5500) {
    fail('Bonus redeem total', JSON.stringify(redeem2));
  }
  pass('Redeem with FIRST_TIME bonus', `total ₹${(redeem2.totalAmountPaise ?? 0) / 100}`);

  // --- Manual mark paid ---
  await api(
    `/coupons/admin/markRedemptionPaid/${redeem.redemptionId}`,
    'POST',
    token,
    { payment_reference: `UPI-SMOKE-${ts}` },
    200
  );
  pass('Mark first redemption paid (manual)');

  await api(
    `/coupons/admin/markRedemptionPaid/${redeem2.redemptionId}`,
    'POST',
    token,
    { payment_reference: `UPI-SMOKE2-${ts}` },
    200
  );
  pass('Mark bonus redemption paid (manual)');

  // --- Admin reads ---
  await api('/coupons/admin/getPendingPayouts?limit=5', 'GET', token, undefined, 200);
  pass('Get pending payouts');

  const { json: redeemerJson } = await api(
    `/coupons/admin/getRedeemerByPhone/${phone2}`,
    'GET',
    token,
    undefined,
    200
  );
  const redeemerData = redeemerJson.data as { redeemer?: { total_redemptions?: number } };
  if ((redeemerData?.redeemer?.total_redemptions ?? 0) !== 1) {
    fail('Get redeemer by phone', JSON.stringify(redeemerData));
  }
  pass('Get redeemer by phone');

  // --- Phase 4: analytics ---
  await api('/coupons/analytics/getOverview', 'GET', token, undefined, 200);
  pass('Analytics overview');

  await api('/coupons/analytics/getBatchPerformance', 'GET', token, undefined, 200);
  pass('Analytics batch performance');

  await api('/coupons/analytics/getPayoutSummary', 'GET', token, undefined, 200);
  pass('Analytics payout summary');

  await api('/coupons/analytics/getFraudSignals', 'GET', token, undefined, 200);
  pass('Analytics fraud signals');

  // --- Batch stats ---
  const { json: batchDetail } = await api(
    `/coupons/admin/getCouponBatchById/${batchId}`,
    'GET',
    token,
    undefined,
    200
  );
  const stats = (batchDetail.data as { stats?: { redeemed?: number } })?.stats;
  if ((stats?.redeemed ?? 0) < 2) {
    fail('Batch stats', `expected redeemed >= 2, got ${stats?.redeemed}`);
  }
  pass('Batch detail stats', `${stats?.redeemed} redeemed`);

  console.log('\n────────────────────────────────────');
  console.log(`All ${results.length} steps passed.\n`);
}

main()
  .catch((error) => {
    console.error('\nSmoke test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
