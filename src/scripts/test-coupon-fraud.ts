#!/usr/bin/env ts-node
/**
 * Coupon module — fraud & abuse scenario tests.
 *
 * Usage:
 *   COUPON_PUBLIC_RATE_LIMIT_MAX=1000 npm run dev   # terminal 1
 *   npm run test:coupon-fraud                         # terminal 2
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from '../database/connection';
import { createPublicAuthHelper } from './coupon-test-public-auth';

type ApiEnvelope = {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
};

type TestCase = { group: string; name: string; run: () => Promise<void> };

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

const results: { group: string; name: string; pass: boolean; error?: string }[] = [];

async function api(
  path: string,
  method: 'GET' | 'POST',
  opts?: {
    token?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }
): Promise<{ status: number; json: ApiEnvelope; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts?.headers,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope;
  return { status: response.status, json, headers: response.headers };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function login(): Promise<string> {
  const { status, json } = await api('/auth/loginUser', 'POST', {
    body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  assert(status === 200 && json.success, `login failed: ${JSON.stringify(json)}`);
  const token = (json.data as { token?: string })?.token;
  assert(!!token, 'token missing');
  return token!;
}

function redeemBody(code: string, phone: string, idempotencyKey: string, extra?: Record<string, unknown>) {
  return {
    code,
    name: 'Fraud Test User',
    phone,
    upi_vpa: 'fraudtest@paytm',
    idempotency_key: idempotencyKey,
    ...extra,
  };
}

async function createReadyBatch(
  token: string,
  ts: number,
  totalCount: number
): Promise<{ batchId: string; codes: string[] }> {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { json } = await api('/coupons/admin/createCouponBatch', 'POST', {
    token,
    body: {
      description: `FraudTest-${ts}-${randomUUID().slice(0, 8)}`,
      face_value_paise: 5000,
      total_count: totalCount,
      expires_at: expiresAt,
    },
  });
  assert(json.success, json.error ?? 'create batch failed');
  const batchId = (json.data as { coupon_batch_id: string }).coupon_batch_id;
  await api(`/coupons/admin/generateBatchCodes/${batchId}`, 'POST', { token });
  await api(`/coupons/admin/markBatchPrinted/${batchId}`, 'POST', { token });
  await api(`/coupons/admin/markBatchAllotted/${batchId}`, 'POST', { token });
  const codesRes = await db.query<{ code: string }>(
    `SELECT code FROM coupons WHERE coupon_batch_id = $1 ORDER BY code`,
    [batchId]
  );
  return { batchId, codes: codesRes.rows.map((r) => r.code) };
}

async function runTests(token: string, ts: number): Promise<TestCase[]> {
  const tests: TestCase[] = [];
  const pubAuth = createPublicAuthHelper(BASE_URL);
  const defaultPhone = `98765${String(ts).slice(-5)}`;

  async function pub(
    path: string,
    method: 'GET' | 'POST',
    phone: string,
    body?: Record<string, unknown>
  ) {
    const accessToken = await pubAuth.getAccessToken(phone);
    return api(path, method, { token: accessToken, body });
  }

  async function pubDefault(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
    return pub(path, method, defaultPhone, body);
  }

  function freshPhone(): string {
    return `981${String(Date.now()).slice(-7)}`;
  }

  // ─── Brute force / code guessing ───────────────────────────────────
  tests.push({
    group: 'brute-force',
    name: 'rapid invalid verify attempts are logged with failure_reason',
    run: async () => {
      const probeCode = `ZZZZ${String(ts).slice(-4)}`;
      const before = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemption_attempts WHERE code_attempted = $1`,
        [probeCode]
      );
      for (let i = 0; i < 5; i++) {
        await pubDefault('/coupons/public/verifyCoupon', 'POST', { code: probeCode });
      }
      const after = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemption_attempts WHERE code_attempted = $1`,
        [probeCode]
      );
      assert(parseInt(after.rows[0]!.count, 10) >= parseInt(before.rows[0]!.count, 10) + 5, 'attempts not logged');
      const reasons = await db.query<{ failure_reason: string }>(
        `SELECT DISTINCT failure_reason FROM redemption_attempts WHERE code_attempted = $1`,
        [probeCode]
      );
      assert(reasons.rows.some((r) => r.failure_reason === 'not_found'), JSON.stringify(reasons.rows));
    },
  });

  tests.push({
    group: 'brute-force',
    name: 'malformed codes rejected at validation (no redeem row created)',
    run: async () => {
      const payloads = [
        { code: 'ABC' },
        { code: '123456789' },
        { code: "ABCD'; DROP TABLE coupons;--" },
        { code: '../../../etc/passwd' },
      ];
      for (const body of payloads) {
        const { status } = await pubDefault('/coupons/public/verifyCoupon', 'POST', body);
        assert(status === 400, `expected 400 for ${JSON.stringify(body)}, got ${status}`);
      }
      const redemptions = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemptions WHERE code LIKE '%DROP%'`
      );
      assert(parseInt(redemptions.rows[0]!.count, 10) === 0, 'injection created redemption');
    },
  });

  tests.push({
    group: 'brute-force',
    name: 'analytics getFraudSignals reflects failed attempts (auth required)',
    run: async () => {
      const { status, json } = await api('/coupons/analytics/getFraudSignals', 'GET', { token });
      assert(status === 200 && json.success, JSON.stringify(json));
      const data = json.data as { failedAttempts?: number };
      assert(typeof data.failedAttempts === 'number' && data.failedAttempts > 0, 'no failed attempts in analytics');
    },
  });

  // ─── Double spend ──────────────────────────────────────────────────
  tests.push({
    group: 'double-spend',
    name: 'same code with different idempotency keys — only one redemption',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const code = codes[0]!;
      const phone1 = defaultPhone;
      const phone2 = freshPhone();
      const r1 = await pub('/coupons/public/redeemCoupon', 'POST', phone1, {
        ...redeemBody(code, phone1, randomUUID()),
      });
      assert(r1.status === 201 || r1.json.success, JSON.stringify(r1.json));
      const r2 = await pub('/coupons/public/redeemCoupon', 'POST', phone2, {
        ...redeemBody(code, phone2, randomUUID()),
      });
      assert(r2.status === 400, `expected 400, got ${r2.status}`);
      const count = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemptions WHERE coupon_id = (SELECT coupon_id FROM coupons WHERE code = $1)`,
        [code]
      );
      assert(parseInt(count.rows[0]!.count, 10) === 1, 'multiple redemptions for one coupon');
    },
  });

  tests.push({
    group: 'double-spend',
    name: 'concurrent redeem race on same code — exactly one wins',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const code = codes[0]!;
      const phone = defaultPhone;
      const attempts = 8;
      const responses = await Promise.all(
        Array.from({ length: attempts }, () =>
          pub('/coupons/public/redeemCoupon', 'POST', phone, {
            ...redeemBody(code, phone, randomUUID()),
          })
        )
      );
      const successes = responses.filter((r) => r.status === 201 || r.json.success).length;
      assert(successes === 1, `expected 1 success, got ${successes}`);
      const count = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemptions WHERE code = $1`,
        [code]
      );
      assert(parseInt(count.rows[0]!.count, 10) === 1, 'DB has more than one redemption');
      const coupon = await db.query<{ status: string }>(`SELECT status FROM coupons WHERE code = $1`, [code]);
      assert(coupon.rows[0]?.status === 'redeemed', 'coupon not redeemed');
    },
  });

  // ─── Replay / idempotency abuse ────────────────────────────────────
  tests.push({
    group: 'replay',
    name: 'idempotency replay returns same redemption (no double pay row)',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const key = randomUUID();
      const phone = defaultPhone;
      const body = redeemBody(codes[0]!, phone, key);
      const r1 = await pub('/coupons/public/redeemCoupon', 'POST', phone, body);
      const r2 = await pub('/coupons/public/redeemCoupon', 'POST', phone, body);
      const id1 = (r1.json.data as { redemptionId?: string })?.redemptionId;
      const id2 = (r2.json.data as { redemptionId?: string })?.redemptionId;
      assert(!!id1 && id1 === id2, 'idempotency replay mismatch');
    },
  });

  tests.push({
    group: 'replay',
    name: 'idempotency key cannot redeem a second coupon',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 2);
      const key = randomUUID();
      const phone = defaultPhone;
      await pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(codes[0]!, phone, key));
      const r2 = await pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(codes[1]!, phone, key));
      const id2 = (r2.json.data as { redemptionId?: string })?.redemptionId;
      const secondStatus = await db.query<{ status: string }>(
        `SELECT status FROM coupons WHERE code = $1`,
        [codes[1]]
      );
      assert(secondStatus.rows[0]?.status === 'allotted', 'second coupon was redeemed via replay');
      assert(!!id2, 'expected idempotent response');
    },
  });

  // ─── Lifecycle bypass ──────────────────────────────────────────────
  tests.push({
    group: 'bypass',
    name: 'cannot redeem created/printed (not allotted) coupon',
    run: async () => {
      const expiresAt = new Date(Date.now() + 86400000 * 365).toISOString();
      const { json } = await api('/coupons/admin/createCouponBatch', 'POST', {
        token,
        body: { description: `Bypass-${ts}`, face_value_paise: 1000, total_count: 1, expires_at: expiresAt },
      });
      const batchId = (json.data as { coupon_batch_id: string }).coupon_batch_id;
      await api(`/coupons/admin/generateBatchCodes/${batchId}`, 'POST', { token });
      await api(`/coupons/admin/markBatchPrinted/${batchId}`, 'POST', { token });
      const codeRow = await db.query<{ code: string }>(
        `SELECT code FROM coupons WHERE coupon_batch_id = $1 LIMIT 1`,
        [batchId]
      );
      const phone = defaultPhone;
      const { status } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codeRow.rows[0]!.code, phone, randomUUID()),
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'bypass',
    name: 'cannot redeem void or expired coupon',
    run: async () => {
      const { batchId, codes } = await createReadyBatch(token, ts, 2);
      await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', { token });
      const phoneV = freshPhone();
      const phoneE = freshPhone();
      const v = await pub('/coupons/public/redeemCoupon', 'POST', phoneV, {
        ...redeemBody(codes[0]!, phoneV, randomUUID()),
      });
      assert(v.status === 400, 'void coupon redeemed');

      await db.query(
        `UPDATE coupons SET expires_at = NOW() - INTERVAL '1 day' WHERE coupon_batch_id = $1 AND code = $2`,
        [batchId, codes[1]]
      );
      const e = await pub('/coupons/public/redeemCoupon', 'POST', phoneE, {
        ...redeemBody(codes[1]!, phoneE, randomUUID()),
      });
      assert(e.status === 400, 'expired coupon redeemed');
    },
  });

  // ─── Bonus gaming ──────────────────────────────────────────────────
  tests.push({
    group: 'bonus-gaming',
    name: 'FIRST_TIME bonus not doubled under concurrent same-phone redeems',
    run: async () => {
      const ruleName = `FRAUD_FIRST_${ts}`;
      await api('/coupons/admin/createPromotionRule', 'POST', {
        token,
        body: {
          name: ruleName,
          rule_type: 'FIRST_TIME',
          conditions: {},
          reward: { bonusPaise: 500 },
          is_active: true,
        },
      });
      const { codes } = await createReadyBatch(token, ts, 2);
      const phone = freshPhone();
      const [r1, r2] = await Promise.all([
        pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(codes[0]!, phone, randomUUID())),
        pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(codes[1]!, phone, randomUUID())),
      ]);
      const successes = [r1, r2].filter((r) => r.status === 201 || r.json.success);
      assert(successes.length === 2, 'both redeems should succeed on different codes');
      const firstTimeCount = [r1, r2].filter((r) => {
        const rules = (r.json.data as { appliedRules?: { name: string }[] })?.appliedRules ?? [];
        return rules.some((x) => x.name === ruleName);
      }).length;
      assert(firstTimeCount === 1, `FIRST_TIME applied ${firstTimeCount} times, expected 1`);
    },
  });

  // ─── Unauthorized admin / payout fraud ─────────────────────────────
  tests.push({
    group: 'auth-abuse',
    name: 'admin payout and inventory endpoints reject missing/invalid JWT',
    run: async () => {
      const endpoints: Array<{ path: string; method: 'GET' | 'POST'; body?: Record<string, unknown> }> = [
        { path: '/coupons/admin/getAllCouponBatches', method: 'GET' },
        { path: '/coupons/admin/getPendingPayouts', method: 'GET' },
        { path: '/coupons/admin/createCouponBatch', method: 'POST', body: { face_value_paise: 1, total_count: 1, expires_at: new Date().toISOString() } },
        { path: `/coupons/admin/markRedemptionPaid/${randomUUID()}`, method: 'POST', body: { payment_reference: 'FAKE' } },
        { path: '/coupons/analytics/getFraudSignals', method: 'GET' },
      ];
      for (const ep of endpoints) {
        const noAuth = await api(ep.path, ep.method, { body: ep.body });
        assert(noAuth.status === 401, `${ep.path} without token: expected 401, got ${noAuth.status}`);
        const badAuth = await api(ep.path, ep.method, { token: 'invalid.jwt.token', body: ep.body });
        assert(badAuth.status === 401, `${ep.path} bad token: expected 401, got ${badAuth.status}`);
      }
    },
  });

  tests.push({
    group: 'auth-abuse',
    name: 'cannot mark arbitrary redemption paid without valid admin session',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const { json } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codes[0]!, phone, randomUUID()),
      });
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      const attacker = await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', {
        body: { payment_reference: 'FAKE-UPI' },
      });
      assert(attacker.status === 401, `attacker mark paid: ${attacker.status}`);
      const row = await db.query<{ payout_status: string }>(
        `SELECT payout_status FROM redemptions WHERE redemption_id = $1`,
        [redemptionId]
      );
      assert(row.rows[0]?.payout_status === 'pending', 'redemption marked paid without auth');
    },
  });

  tests.push({
    group: 'auth-abuse',
    name: 'public API cannot export batch codes or list all coupons',
    run: async () => {
      const { batchId } = await createReadyBatch(token, ts, 1);
      const exportAttempt = await api(`/coupons/admin/exportBatchCodes/${batchId}`, 'GET', {});
      assert(exportAttempt.status === 401, 'public export batch');
      const listAttempt = await api('/coupons/admin/getAllCoupons', 'GET', {});
      assert(listAttempt.status === 401, 'public list coupons');
    },
  });

  tests.push({
    group: 'auth-abuse',
    name: 'public coupon endpoints reject missing JWT',
    run: async () => {
      const noAuthVerify = await api('/coupons/public/verifyCoupon', 'POST', { body: { code: 'AAAAAAAA' } });
      assert(noAuthVerify.status === 401, `verify without token: ${noAuthVerify.status}`);
      const noAuthRedeem = await api('/coupons/public/redeemCoupon', 'POST', {
        body: redeemBody('AAAAAAAA', '9876543210', randomUUID()),
      });
      assert(noAuthRedeem.status === 401, `redeem without token: ${noAuthRedeem.status}`);
      const adminOnPublic = await api('/coupons/public/verifyCoupon', 'POST', {
        token,
        body: { code: 'AAAAAAAA' },
      });
      assert(adminOnPublic.status === 401, `admin token on public: ${adminOnPublic.status}`);
    },
  });

  // ─── Webhook fraud ─────────────────────────────────────────────────
  tests.push({
    group: 'webhook',
    name: 'cashfree webhook rejected without signature',
    run: async () => {
      const { status } = await api('/coupons/admin/webhooks/cashfree', 'POST', {
        body: { type: 'TRANSFER_SUCCESS', data: { transfer_id: 'fake' } },
      });
      assert(status === 400 || status === 401, `expected 400/401, got ${status}`);
    },
  });

  tests.push({
    group: 'webhook',
    name: 'cashfree webhook rejected with forged signature',
    run: async () => {
      const body = { type: 'TRANSFER_SUCCESS', data: { transfer_id: 'fake_transfer_id' } };
      const { status } = await api('/coupons/admin/webhooks/cashfree', 'POST', {
        body,
        headers: {
          'x-webhook-signature': 'not-a-valid-signature',
          'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)),
        },
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  // ─── Payout manipulation ───────────────────────────────────────────
  tests.push({
    group: 'payout-fraud',
    name: 'double mark-paid blocked — cannot inflate paid count',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const { json } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codes[0]!, phone, randomUUID()),
      });
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', {
        token,
        body: { payment_reference: 'UPI-REAL' },
      });
      const second = await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', {
        token,
        body: { payment_reference: 'UPI-FAKE-2' },
      });
      assert(second.status === 400, 'double mark paid succeeded');
      const row = await db.query<{ payment_reference: string }>(
        `SELECT payment_reference FROM redemptions WHERE redemption_id = $1`,
        [redemptionId]
      );
      assert(row.rows[0]?.payment_reference === 'UPI-REAL', 'payment reference overwritten');
    },
  });

  tests.push({
    group: 'payout-fraud',
    name: 'retry payout on already-paid redemption rejected',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const { json } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codes[0]!, phone, randomUUID()),
      });
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', {
        token,
        body: { payment_reference: 'UPI-PAID' },
      });
      const retry = await api(`/coupons/admin/retryPayout/${redemptionId}`, 'POST', { token });
      assert(retry.status === 400, 'retry on paid allowed');
    },
  });

  // ─── Input validation abuse ──────────────────────────────────────────
  tests.push({
    group: 'input-abuse',
    name: 'redeem without idempotency_key or payment details rejected',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const noKey = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        code: codes[0],
        name: 'X',
        phone: '9876543210',
        upi_vpa: 'x@y',
      });
      assert(noKey.status === 400, 'missing idempotency');
      const noPay = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        code: codes[0],
        name: 'X',
        phone: '9876543210',
        idempotency_key: randomUUID(),
      });
      assert(noPay.status === 400, 'missing payment details');
    },
  });

  tests.push({
    group: 'input-abuse',
    name: 'redeem uses JWT phone — invalid body phone does not block redeem',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const bodyPhone = '8888888888';
      const { status } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codes[0]!, bodyPhone, randomUUID()),
      });
      assert(status === 201, 'redeem with JWT phone should succeed');
      const row = await db.query<{ phone: string }>(
        `SELECT rd.phone FROM redemptions r
         JOIN redeemers rd ON rd.redeemer_id = r.redeemer_id
         WHERE r.code = $1`,
        [codes[0]]
      );
      assert(row.rows[0]?.phone === phone, `expected JWT phone ${phone}, got ${row.rows[0]?.phone}`);
    },
  });

  // ─── Data leakage ────────────────────────────────────────────────────
  tests.push({
    group: 'leakage',
    name: 'admin responses return full bank account numbers for payout ops',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const phone = defaultPhone;
      const { json: redeemJson } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        ...redeemBody(codes[0]!, phone, randomUUID()),
        upi_vpa: undefined,
        account_number: '1234567890123456',
        account_holder_name: 'Test',
        ifsc: 'HDFC0001234',
      });
      const redemptionId = (redeemJson.data as { redemptionId?: string })?.redemptionId!;
      const { json } = await api(`/coupons/admin/getRedemptionById/${redemptionId}`, 'GET', { token });
      const acct = (json.data as { redemption?: { payout_account_number?: string } })?.redemption
        ?.payout_account_number;
      assert(acct === '1234567890123456', `expected full account number, got: ${acct}`);
    },
  });

  tests.push({
    group: 'leakage',
    name: 'verify on valid code does not expose redeemer PII',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1);
      const code = codes[0]!;
      const phone = defaultPhone;
      await pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(code, phone, randomUUID()));
      const { json } = await pub('/coupons/public/verifyCoupon', 'POST', phone, { code });
      const data = json.data as Record<string, unknown>;
      assert(!('phone' in data) && !('upi_vpa' in data) && !('redeemer' in data), JSON.stringify(data));
    },
  });

  return tests;
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Coupon Module — Fraud & Abuse Tests');
  console.log(`  ${BASE_URL}`);
  console.log('══════════════════════════════════════════\n');

  let token: string;
  try {
    token = await login();
    console.log('Logged in as admin\n');
  } catch (e) {
    console.error('Cannot reach server. Start with: COUPON_PUBLIC_RATE_LIMIT_MAX=1000 npm run dev');
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const ts = Date.now();
  const tests = await runTests(token, ts);

  for (const test of tests) {
    process.stdout.write(`  [${test.group}] ${test.name} ... `);
    try {
      await test.run();
      results.push({ group: test.group, name: test.name, pass: true });
      console.log('PASS');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ group: test.group, name: test.name, pass: false, error: msg });
      console.log('FAIL');
      console.log(`      → ${msg}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log('\n══════════════════════════════════════════');
  console.log(`  Results: ${passed}/${results.length} passed`);
  if (failed.length > 0) {
    console.log('\n  Failed:');
    for (const f of failed) {
      console.log(`    ✗ [${f.group}] ${f.name}`);
      console.log(`      ${f.error}`);
    }
    process.exit(1);
  }
  console.log('  All fraud scenarios blocked as expected.');
  console.log('══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
