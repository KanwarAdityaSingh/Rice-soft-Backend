#!/usr/bin/env ts-node
/**
 * Comprehensive coupon module tests — happy paths, failures, duplicates, edge cases.
 *
 * Usage:
 *   npm run dev                    # terminal 1
 *   COUPON_PUBLIC_RATE_LIMIT_MAX=500 npm run dev   # raise limit for this suite
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

type TestCase = {
  group: string;
  name: string;
  run: () => Promise<void>;
};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

const results: { group: string; name: string; pass: boolean; error?: string }[] = [];

async function api(
  path: string,
  method: 'GET' | 'POST',
  token?: string,
  body?: Record<string, unknown>
): Promise<{ status: number; json: ApiEnvelope }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as ApiEnvelope;
  return { status: response.status, json };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function login(): Promise<string> {
  const { status, json } = await api('/auth/loginUser', 'POST', undefined, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  assert(status === 200 && json.success, `login failed: ${JSON.stringify(json)}`);
  const token = (json.data as { token?: string })?.token;
  assert(!!token, 'token missing');
  return token!;
}

async function createReadyBatch(
  token: string,
  ts: number,
  totalCount: number,
  opts?: { markPrinted?: boolean; markAllotted?: boolean }
): Promise<{ batchId: string; codes: string[] }> {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { json } = await api('/coupons/admin/createCouponBatch', 'POST', token, {
    description: `CompTest-${ts}-${randomUUID().slice(0, 8)}`,
    face_value_paise: 5000,
    total_count: totalCount,
    expires_at: expiresAt,
    redeem_base_url: 'https://redeem.example.com',
  });
  assert(json.success, `create batch: ${json.error}`);
  const batchId = (json.data as { coupon_batch_id: string }).coupon_batch_id;

  await api(`/coupons/admin/generateBatchCodes/${batchId}`, 'POST', token);

  if (opts?.markPrinted !== false) {
    await api(`/coupons/admin/markBatchPrinted/${batchId}`, 'POST', token);
  }
  if (opts?.markAllotted) {
    await api(`/coupons/admin/markBatchAllotted/${batchId}`, 'POST', token);
  }

  const codesRes = await db.query<{ code: string }>(
    `SELECT code FROM coupons WHERE coupon_batch_id = $1 ORDER BY code`,
    [batchId]
  );
  return { batchId, codes: codesRes.rows.map((r) => r.code) };
}

function redeemBody(code: string, phone: string, idempotencyKey: string) {
  return {
    code,
    name: 'Test User',
    phone,
    upi_vpa: 'test@paytm',
    idempotency_key: idempotencyKey,
  };
}

async function runTests(token: string, ts: number) {
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
    return api(path, method, accessToken, body);
  }

  async function pubDefault(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
    return pub(path, method, defaultPhone, body);
  }

  // ─── Verify failures ───────────────────────────────────────────────
  tests.push({
    group: 'verify',
    name: 'rejects invalid format (too short) with HTTP 400',
    run: async () => {
      const { status } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: 'ABC',
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects unknown code (valid=false, not_found)',
    run: async () => {
      const { status, json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: 'ZZZZZZZZ',
      });
      assert(status === 200, `expected 200, got ${status}`);
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'not_found', JSON.stringify(data));
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects created (not printed/allotted) coupon',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 2, {
        markPrinted: false,
        markAllotted: false,
      });
      const { json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: codes[0]!,
      });
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'not_allotted', JSON.stringify(data));
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects printed-but-not-allotted coupon',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 2, {
        markPrinted: true,
        markAllotted: false,
      });
      const { json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: codes[0]!,
      });
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'not_allotted', JSON.stringify(data));
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects expired coupon',
    run: async () => {
      const { batchId, codes } = await createReadyBatch(token, ts, 1, {
        markAllotted: true,
      });
      await db.query(
        `UPDATE coupons SET expires_at = NOW() - INTERVAL '1 day' WHERE coupon_batch_id = $1`,
        [batchId]
      );
      const { json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: codes[0]!,
      });
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'expired', JSON.stringify(data));
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects void coupon',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', token);
      const { json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: codes[0]!,
      });
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'void', JSON.stringify(data));
    },
  });

  tests.push({
    group: 'verify',
    name: 'rejects already redeemed coupon',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const code = codes[0]!;
      const phone = defaultPhone;
      await pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(code, phone, randomUUID()));
      const { json } = await pub('/coupons/public/verifyCoupon', 'POST', phone, { code });
      const data = json.data as { valid: boolean; reason?: string };
      assert(data.valid === false && data.reason === 'already_redeemed', JSON.stringify(data));
    },
  });

  // ─── Redeem validation failures ────────────────────────────────────
  tests.push({
    group: 'redeem',
    name: 'rejects missing UPI and bank account',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const { status } = await pub('/coupons/public/redeemCoupon', 'POST', phone, {
        code: codes[0],
        name: 'Test',
        idempotency_key: randomUUID(),
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'redeem',
    name: 'redeem uses JWT phone — body phone field is ignored',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const bodyPhone = '9999999999';
      const { status, json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, bodyPhone, randomUUID())
      );
      assert(status === 201 && json.success, `expected 201, got ${status}: ${json.error}`);
      const row = await db.query<{ phone: string }>(
        `SELECT rd.phone FROM redemptions r
         JOIN redeemers rd ON rd.redeemer_id = r.redeemer_id
         WHERE r.code = $1`,
        [codes[0]]
      );
      assert(row.rows[0]?.phone === phone, `redeemer phone mismatch: ${row.rows[0]?.phone}`);
      assert(row.rows[0]?.phone !== bodyPhone, 'body phone was used instead of JWT phone');
    },
  });

  tests.push({
    group: 'redeem',
    name: 'rejects redeem on non-allotted code',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, {
        markPrinted: true,
        markAllotted: false,
      });
      const phone = defaultPhone;
      const { status, json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      assert(status === 400, `expected 400, got ${status}: ${json.error}`);
    },
  });

  tests.push({
    group: 'redeem',
    name: 'rejects duplicate redeem same code (new idempotency key)',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const code = codes[0]!;
      const phone1 = defaultPhone;
      const phone2 = `98766${String(ts).slice(-5)}`;
      await pub('/coupons/public/redeemCoupon', 'POST', phone1, redeemBody(code, phone1, randomUUID()));
      const { status, json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone2,
        redeemBody(code, phone2, randomUUID())
      );
      assert(status === 400, `expected 400, got ${status}: ${json.error}`);
      assert(
        (json.error ?? '').toLowerCase().includes('already') ||
          (json.error ?? '').toLowerCase().includes('valid'),
        json.error ?? 'missing error message'
      );
    },
  });

  // ─── Idempotency & duplicates ──────────────────────────────────────
  tests.push({
    group: 'duplicate',
    name: 'idempotent retry returns same redemptionId',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const code = codes[0]!;
      const key = randomUUID();
      const phone = defaultPhone;
      const body = redeemBody(code, phone, key);
      const r1 = await pub('/coupons/public/redeemCoupon', 'POST', phone, body);
      const r2 = await pub('/coupons/public/redeemCoupon', 'POST', phone, body);
      const id1 = (r1.json.data as { redemptionId?: string })?.redemptionId;
      const id2 = (r2.json.data as { redemptionId?: string })?.redemptionId;
      assert(!!id1 && id1 === id2, `ids differ: ${id1} vs ${id2}`);
      const count = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemptions WHERE coupon_id = (SELECT coupon_id FROM coupons WHERE code = $1)`,
        [code]
      );
      assert(parseInt(count.rows[0]!.count, 10) === 1, 'more than one redemption row');
    },
  });

  tests.push({
    group: 'duplicate',
    name: 'only one redemption row per coupon in DB',
    run: async () => {
      const dupCheck = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM (
           SELECT coupon_id FROM redemptions GROUP BY coupon_id HAVING COUNT(*) > 1
         ) t`
      );
      assert(parseInt(dupCheck.rows[0]!.cnt, 10) === 0, 'duplicate coupon_id in redemptions');
    },
  });

  tests.push({
    group: 'duplicate',
    name: 'all coupon codes remain unique',
    run: async () => {
      const dupCodes = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM (
           SELECT code FROM coupons GROUP BY code HAVING COUNT(*) > 1
         ) t`
      );
      assert(parseInt(dupCodes.rows[0]!.cnt, 10) === 0, 'duplicate coupon codes exist');
    },
  });

  // ─── Admin batch failures ──────────────────────────────────────────
  tests.push({
    group: 'admin-batch',
    name: 'rejects generate when batch already fully generated',
    run: async () => {
      const { batchId } = await createReadyBatch(token, ts, 3, { markAllotted: false });
      const { status, json } = await api(
        `/coupons/admin/generateBatchCodes/${batchId}`,
        'POST',
        token
      );
      assert(status === 400, `expected 400, got ${status}: ${json.error}`);
    },
  });

  tests.push({
    group: 'admin-batch',
    name: 'rejects create batch with invalid face_value',
    run: async () => {
      const { status } = await api('/coupons/admin/createCouponBatch', 'POST', token, {
        face_value_paise: 0,
        total_count: 10,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'admin-batch',
    name: 'getCouponBatchById returns 404 for unknown batch',
    run: async () => {
      const { status } = await api(
        `/coupons/admin/getCouponBatchById/${randomUUID()}`,
        'GET',
        token
      );
      assert(status === 404, `expected 404, got ${status}`);
    },
  });

  // ─── Payout failures ───────────────────────────────────────────────
  tests.push({
    group: 'payout',
    name: 'mark paid twice on same redemption fails second time',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const code = codes[0]!;
      const phone = defaultPhone;
      const { json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(code, phone, randomUUID())
      );
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', token, {
        payment_reference: 'UPI-1',
      });
      const { status, json: j2 } = await api(
        `/coupons/admin/markRedemptionPaid/${redemptionId}`,
        'POST',
        token,
        { payment_reference: 'UPI-2' }
      );
      assert(status === 400, `expected 400, got ${status}: ${j2.error}`);
    },
  });

  tests.push({
    group: 'payout',
    name: 'mark paid on unknown redemption returns 404',
    run: async () => {
      const { status } = await api(
        `/coupons/admin/markRedemptionPaid/${randomUUID()}`,
        'POST',
        token,
        { payment_reference: 'UPI-X' }
      );
      assert(status === 404, `expected 404, got ${status}`);
    },
  });

  tests.push({
    group: 'payout',
    name: 'retry payout on already paid redemption fails',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const { json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', token, {
        payment_reference: 'UPI-PAID',
      });
      const { status, json: j2 } = await api(
        `/coupons/admin/retryPayout/${redemptionId}`,
        'POST',
        token
      );
      assert(status === 400, `expected 400, got ${status}: ${j2.error}`);
    },
  });

  // ─── Promotion rules ───────────────────────────────────────────────
  tests.push({
    group: 'rules',
    name: 'FIRST_TIME bonus only on first redeem for phone',
    run: async () => {
      const ruleName = `FIRST_ONLY_${ts}`;
      await api('/coupons/admin/createPromotionRule', 'POST', token, {
        name: ruleName,
        rule_type: 'FIRST_TIME',
        conditions: {},
        reward: { bonusPaise: 300 },
        is_active: true,
        priority: 1,
      });

      const { codes } = await createReadyBatch(token, ts, 2, { markAllotted: true });
      const phone = `98555${String(ts).slice(-5)}`;

      const r1 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const rules1 = (r1.json.data as { appliedRules?: { name: string; bonusPaise: number }[] })
        ?.appliedRules ?? [];
      const firstRule = rules1.find((r) => r.name === ruleName);
      assert(!!firstRule && firstRule.bonusPaise === 300, JSON.stringify(rules1));

      const r2 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[1]!, phone, randomUUID())
      );
      const rules2 = (r2.json.data as { appliedRules?: { name: string; bonusPaise: number }[] })
        ?.appliedRules ?? [];
      assert(!rules2.some((r) => r.name === ruleName), `rule applied twice: ${JSON.stringify(rules2)}`);
    },
  });

  tests.push({
    group: 'rules',
    name: 'REDEMPTION_COUNT fires only on exact 5th redeem',
    run: async () => {
      const ruleName = `FIFTH_${ts}`;
      await api('/coupons/admin/createPromotionRule', 'POST', token, {
        name: ruleName,
        rule_type: 'REDEMPTION_COUNT',
        conditions: { minCount: 5, maxCount: 5, countIncludesCurrent: true },
        reward: { bonusPaise: 1000 },
        is_active: true,
        priority: 5,
      });

      const { codes } = await createReadyBatch(token, ts, 6, { markAllotted: true });
      const phone = `98666${String(ts).slice(-5)}`;

      for (let i = 0; i < 4; i++) {
        const r = await pub(
          '/coupons/public/redeemCoupon',
          'POST',
          phone,
          redeemBody(codes[i]!, phone, randomUUID())
        );
        const rules = (r.json.data as { appliedRules?: { name: string }[] })?.appliedRules ?? [];
        assert(!rules.some((x) => x.name === ruleName), `rule fired early on redeem ${i + 1}`);
      }

      const r5 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[4]!, phone, randomUUID())
      );
      const rules5 = (r5.json.data as { appliedRules?: { name: string; bonusPaise: number }[] })
        ?.appliedRules ?? [];
      const fifthRule = rules5.find((r) => r.name === ruleName);
      assert(!!fifthRule && fifthRule.bonusPaise === 1000, JSON.stringify(rules5));

      const r6 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[5]!, phone, randomUUID())
      );
      const rules6 = (r6.json.data as { appliedRules?: { name: string }[] })?.appliedRules ?? [];
      assert(!rules6.some((r) => r.name === ruleName), `rule fired on 6th: ${JSON.stringify(rules6)}`);
    },
  });

  tests.push({
    group: 'rules',
    name: 'inactive rule does not apply bonus',
    run: async () => {
      const ruleName = `INACTIVE_${ts}`;
      const { json: ruleJson } = await api('/coupons/admin/createPromotionRule', 'POST', token, {
        name: ruleName,
        rule_type: 'FIRST_TIME',
        conditions: {},
        reward: { bonusPaise: 9999 },
        is_active: false,
        priority: 1,
      });
      assert(ruleJson.success, ruleJson.error ?? 'create rule failed');

      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const r = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const rules = (r.json.data as { appliedRules?: { name: string }[] })?.appliedRules ?? [];
      assert(!rules.some((x) => x.name === ruleName), `inactive rule applied: ${JSON.stringify(rules)}`);
    },
  });

  tests.push({
    group: 'rules',
    name: 'rejects invalid promotion rule (missing minCount)',
    run: async () => {
      const { status } = await api('/coupons/admin/createPromotionRule', 'POST', token, {
        name: 'Bad rule',
        rule_type: 'REDEMPTION_COUNT',
        conditions: { countIncludesCurrent: true },
        reward: { bonusPaise: 100 },
      });
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  // ─── Void & state ──────────────────────────────────────────────────
  tests.push({
    group: 'void',
    name: 'void single coupon prevents redeem',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', token);
      const phone = defaultPhone;
      const { status } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'void',
    name: 'void batch voids remaining non-terminal coupons',
    run: async () => {
      const { batchId, codes } = await createReadyBatch(token, ts, 3, { markAllotted: true });
      await api(`/coupons/admin/voidCouponBatch/${batchId}`, 'POST', token);
      const statuses = await db.query<{ code: string; status: string }>(
        `SELECT code, status FROM coupons WHERE coupon_batch_id = $1 ORDER BY code`,
        [batchId]
      );
      for (const row of statuses.rows) {
        assert(row.status === 'void', `code ${row.code} status ${row.status}`);
      }
      const { json } = await pubDefault('/coupons/public/verifyCoupon', 'POST', {
        code: codes[0]!,
      });
      assert((json.data as { reason?: string }).reason === 'void', JSON.stringify(json.data));
    },
  });

  // ─── Auth ──────────────────────────────────────────────────────────
  tests.push({
    group: 'auth',
    name: 'admin endpoint without token returns 401',
    run: async () => {
      const { status } = await api('/coupons/admin/getAllCouponBatches', 'GET');
      assert(status === 401, `expected 401, got ${status}`);
    },
  });

  tests.push({
    group: 'auth',
    name: 'public verifyCoupon without token returns 401',
    run: async () => {
      const { status } = await api('/coupons/public/verifyCoupon', 'POST', undefined, {
        code: 'AAAAAAAA',
      });
      assert(status === 401, `expected 401, got ${status}`);
    },
  });

  tests.push({
    group: 'auth',
    name: 'public redeemCoupon without token returns 401',
    run: async () => {
      const { status } = await api('/coupons/public/redeemCoupon', 'POST', undefined, {
        code: 'AAAAAAAA',
        name: 'Test',
        upi_vpa: 'test@paytm',
        idempotency_key: randomUUID(),
      });
      assert(status === 401, `expected 401, got ${status}`);
    },
  });

  tests.push({
    group: 'auth',
    name: 'admin JWT rejected on public verifyCoupon',
    run: async () => {
      const { status } = await api('/coupons/public/verifyCoupon', 'POST', token, {
        code: 'AAAAAAAA',
      });
      assert(status === 401, `expected 401, got ${status}`);
    },
  });

  tests.push({
    group: 'auth',
    name: 'refreshToken rotates access token',
    run: async () => {
      const phone = defaultPhone;
      const session = await pubAuth.login(phone);
      const refreshRes = await fetch(`${BASE_URL}/coupons/public/refreshToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      const refreshJson = (await refreshRes.json()) as ApiEnvelope & {
        data?: { accessToken?: string; refreshToken?: string };
      };
      assert(
        refreshRes.status === 200 && refreshJson.success && !!refreshJson.data?.accessToken,
        JSON.stringify(refreshJson)
      );
      assert(
        refreshJson.data?.refreshToken !== session.refreshToken,
        'refresh token should rotate'
      );
    },
  });

  tests.push({
    group: 'auth',
    name: 'myRedemptions returns redeemed coupon for logged-in phone',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      await pub('/coupons/public/redeemCoupon', 'POST', phone, redeemBody(codes[0]!, phone, randomUUID()));
      const accessToken = await pubAuth.getAccessToken(phone);
      const { status, json } = await api('/coupons/public/myRedemptions', 'GET', accessToken);
      assert(status === 200 && json.success, JSON.stringify(json));
      const list = (json.data as { redemptions?: { code: string }[] })?.redemptions ?? [];
      assert(list.some((r) => r.code === codes[0]), `missing redemption: ${JSON.stringify(list)}`);
    },
  });

  tests.push({
    group: 'auth',
    name: 'payoutStatus returns status for own redemption',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const { json: redeemJson } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const publicRef = (redeemJson.data as { publicRef?: string })?.publicRef;
      assert(!!publicRef, 'publicRef missing');
      const accessToken = await pubAuth.getAccessToken(phone);
      const { status, json } = await api(
        `/coupons/public/payoutStatus/${publicRef}`,
        'GET',
        accessToken
      );
      assert(status === 200 && json.success, JSON.stringify(json));
      assert(
        (json.data as { payoutStatus?: string })?.payoutStatus === 'pending',
        JSON.stringify(json.data)
      );
    },
  });

  // ─── Redemption attempts logged ────────────────────────────────────
  tests.push({
    group: 'fraud',
    name: 'failed verify attempts are logged',
    run: async () => {
      const before = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemption_attempts WHERE code_attempted = 'YYYYYYYY'`
      );
      const beforeCount = parseInt(before.rows[0]!.count, 10);
      await pubDefault('/coupons/public/verifyCoupon', 'POST', { code: 'YYYYYYYY' });
      const after = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM redemption_attempts WHERE code_attempted = 'YYYYYYYY'`
      );
      assert(parseInt(after.rows[0]!.count, 10) > beforeCount, 'attempt not logged');
    },
  });

  // ─── Additional edge cases ─────────────────────────────────────────
  tests.push({
    group: 'void',
    name: 'void already redeemed coupon fails',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const { status } = await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', token);
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'void',
    name: 'double void same coupon fails second time',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', token);
      const { status } = await api(`/coupons/admin/voidCoupon/${codes[0]}`, 'POST', token);
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'redeem',
    name: 'rejects redeem on expired coupon',
    run: async () => {
      const { batchId, codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      await db.query(
        `UPDATE coupons SET expires_at = NOW() - INTERVAL '1 day' WHERE coupon_batch_id = $1`,
        [batchId]
      );
      const phone = defaultPhone;
      const { status } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'duplicate',
    name: 'idempotency key returns first redemption even if code differs in retry',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 2, { markAllotted: true });
      const key = randomUUID();
      const phone = defaultPhone;
      const r1 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, key)
      );
      const id1 = (r1.json.data as { redemptionId?: string })?.redemptionId;
      const r2 = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[1]!, phone, key)
      );
      const id2 = (r2.json.data as { redemptionId?: string })?.redemptionId;
      assert(!!id1 && id1 === id2, `expected same id, got ${id1} vs ${id2}`);
      const secondCoupon = await db.query<{ status: string }>(
        `SELECT status FROM coupons WHERE code = $1`,
        [codes[1]]
      );
      assert(secondCoupon.rows[0]?.status === 'allotted', 'second coupon should remain allotted');
    },
  });

  tests.push({
    group: 'payout',
    name: 'mark paid without payment_reference fails validation',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const { json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      const { status } = await api(
        `/coupons/admin/markRedemptionPaid/${redemptionId}`,
        'POST',
        token,
        {}
      );
      assert(status === 400, `expected 400, got ${status}`);
    },
  });

  tests.push({
    group: 'payout',
    name: 'retry payout on pending redemption when Cashfree disabled is no-op success',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const phone = defaultPhone;
      const { json } = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(codes[0]!, phone, randomUUID())
      );
      const redemptionId = (json.data as { redemptionId?: string })?.redemptionId!;
      const { status, json: retryJson } = await api(
        `/coupons/admin/retryPayout/${redemptionId}`,
        'POST',
        token
      );
      assert(status === 200 && retryJson.success, JSON.stringify(retryJson));
      const row = await db.query<{ payout_status: string }>(
        `SELECT payout_status FROM redemptions WHERE redemption_id = $1`,
        [redemptionId]
      );
      assert(row.rows[0]?.payout_status === 'pending', 'should stay pending without Cashfree');
    },
  });

  // ─── Happy path sanity ─────────────────────────────────────────────
  tests.push({
    group: 'happy',
    name: 'full lifecycle: create → generate → print → allot → verify → redeem → mark paid',
    run: async () => {
      const { codes } = await createReadyBatch(token, ts, 1, { markAllotted: true });
      const code = codes[0]!;
      const v = await pubDefault('/coupons/public/verifyCoupon', 'POST', { code });
      assert((v.json.data as { valid?: boolean }).valid === true, 'verify failed');
      const phone = defaultPhone;
      const r = await pub(
        '/coupons/public/redeemCoupon',
        'POST',
        phone,
        redeemBody(code, phone, randomUUID())
      );
      const redemptionId = (r.json.data as { redemptionId?: string })?.redemptionId;
      assert(!!redemptionId, 'no redemption id');
      const paid = await api(`/coupons/admin/markRedemptionPaid/${redemptionId}`, 'POST', token, {
        payment_reference: 'UPI-HAPPY',
      });
      assert(paid.json.success, paid.json.error ?? 'mark paid failed');
      const row = await db.query<{ payout_status: string }>(
        `SELECT payout_status FROM redemptions WHERE redemption_id = $1`,
        [redemptionId]
      );
      assert(row.rows[0]?.payout_status === 'paid', 'not paid in db');
    },
  });

  return tests;
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  Coupon Module — Comprehensive Tests');
  console.log(`  ${BASE_URL}`);
  console.log('══════════════════════════════════════════\n');

  let token: string;
  try {
    token = await login();
    console.log('Logged in as admin\n');
  } catch (e) {
    console.error('Cannot reach server or login failed. Start with: npm run dev');
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
    console.log('\n  Failed tests:');
    for (const f of failed) {
      console.log(`    ✗ [${f.group}] ${f.name}`);
      console.log(`      ${f.error}`);
    }
    console.log('══════════════════════════════════════════\n');
    process.exit(1);
  }
  console.log('  All tests passed.');
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
