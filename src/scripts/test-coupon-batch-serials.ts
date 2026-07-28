/**
 * Focused test: coupon batch_code + serial_number behaviour.
 *
 * Usage (server running):
 *   npx ts-node src/scripts/test-coupon-batch-serials.ts
 */
import 'dotenv/config';
import { db } from '../database/connection';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

type Envelope<T> = { success: boolean; data?: T; error?: string; message?: string };

let passed = 0;
let failed = 0;

function ok(name: string, details?: string) {
  passed++;
  console.log(`  ✓ ${name}${details ? ` — ${details}` : ''}`);
}

function bad(name: string, details?: string) {
  failed++;
  console.error(`  ✗ ${name}${details ? ` — ${details}` : ''}`);
}

function assert(cond: unknown, name: string, details?: string): asserts cond {
  if (!cond) {
    bad(name, details);
    throw new Error(details || name);
  }
  ok(name, details);
}

async function api<T>(
  path: string,
  method: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; json: Envelope<T> }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Envelope<T>;
  return { status: res.status, json };
}

async function main() {
  console.log('\n=== Coupon batch code + serial tests ===\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  const login = await api<{ token: string }>('/auth/loginUser', 'POST', undefined, {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
  });
  const token = login.json.data?.token;
  assert(login.status === 200 && token, 'Admin login', `status=${login.status}`);

  // 1) Create draft batch — auto batch_code
  const create1 = await api<{
    coupon_batch_id: string;
    batch_code: string;
    status: string;
    generated_count: number;
  }>('/coupons/admin/createCouponBatch', 'POST', token, {
    description: 'serial-test-1',
    face_value_paise: 1000,
    total_count: 5,
    expires_at: null,
  });
  assert(create1.status === 201 && create1.json.success, 'Create batch 1');
  const batch1 = create1.json.data!;
  assert(
    /^[A-Z]{3}-\d{4}-\d{4}-\d{3}$/.test(batch1.batch_code),
    'Batch 1 code format',
    batch1.batch_code
  );
  assert(batch1.status === 'draft', 'Batch 1 is draft');

  // 2) Second batch same day — series increments
  const create2 = await api<{
    coupon_batch_id: string;
    batch_code: string;
  }>('/coupons/admin/createCouponBatch', 'POST', token, {
    description: 'serial-test-2',
    face_value_paise: 2000,
    total_count: 3,
    expires_at: null,
  });
  assert(create2.status === 201 && create2.json.success, 'Create batch 2');
  const batch2 = create2.json.data!;
  const series1 = parseInt(batch1.batch_code.slice(-3), 10);
  const series2 = parseInt(batch2.batch_code.slice(-3), 10);
  assert(
    series2 === series1 + 1,
    'Day series increments',
    `${batch1.batch_code} → ${batch2.batch_code}`
  );
  assert(
    batch1.batch_code.slice(0, -3) === batch2.batch_code.slice(0, -3),
    'Same day prefix',
    batch2.batch_code.slice(0, -4)
  );

  // 3) Reject legacy `name` field as required — omitting name is fine; sending only name should fail validation for missing face_value
  const badCreate = await api('/coupons/admin/createCouponBatch', 'POST', token, {
    name: 'should-not-work-alone',
  });
  assert(badCreate.status === 400, 'Reject create without face_value/total_count', `status=${badCreate.status}`);

  // 4) Generate codes on batch 1
  const gen = await api<{ generated: number; batch: { batch_code: string; status: string } }>(
    `/coupons/admin/generateBatchCodes/${batch1.coupon_batch_id}`,
    'POST',
    token
  );
  assert(gen.status === 200 && gen.json.data?.generated === 5, 'Generate 5 codes', `generated=${gen.json.data?.generated}`);

  const coupons = await db.query<{
    batch_sequence: number;
    serial_number: string;
    code: string;
  }>(
    `SELECT batch_sequence, serial_number, code
     FROM coupons
     WHERE coupon_batch_id = $1
     ORDER BY batch_sequence ASC`,
    [batch1.coupon_batch_id]
  );
  assert(coupons.rows.length === 5, 'DB has 5 coupons');
  assert(
    coupons.rows.every((r, i) => r.batch_sequence === i + 1),
    'batch_sequence is 1..5'
  );
  assert(
    coupons.rows.every(
      (r) => r.serial_number === `${batch1.batch_code}-${String(r.batch_sequence).padStart(6, '0')}`
    ),
    'serial_number = batch_code-NNNNNN',
    coupons.rows[0]?.serial_number
  );
  assert(
    coupons.rows[0]?.serial_number === `${batch1.batch_code}-000001`,
    'First serial ends with 000001'
  );

  // 5) CSV export includes serials
  const csvRes = await fetch(
    `${BASE_URL}/coupons/admin/exportBatchCodes/${batch1.coupon_batch_id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const csv = await csvRes.text();
  assert(csvRes.status === 200, 'Export CSV status 200');
  assert(csv.startsWith('serial_number,batch_sequence,code,'), 'CSV header has serial_number');
  assert(csv.includes(coupons.rows[0]!.serial_number), 'CSV contains first serial');
  const disposition = csvRes.headers.get('content-disposition') || '';
  assert(
    disposition.includes(batch1.batch_code),
    'CSV filename uses batch_code',
    disposition
  );

  // 6) Delete generated batch while all coupons still `created`
  const delCreated = await api<{ deleted: boolean; batch_code: string }>(
    `/coupons/admin/deleteCouponBatch/${batch1.coupon_batch_id}`,
    'POST',
    token
  );
  assert(
    delCreated.status === 200 && delCreated.json.data?.deleted === true,
    'Delete batch with only created coupons',
    delCreated.json.data?.batch_code
  );
  const gone = await db.query(
    `SELECT COUNT(*)::int AS n FROM coupons WHERE coupon_batch_id = $1`,
    [batch1.coupon_batch_id]
  );
  assert(Number(gone.rows[0]?.n) === 0, 'Coupons removed with batch');

  // 7) Delete draft batch 2 (no codes) — series not reused
  const delDraft = await api<{ coupon_batch_id: string; batch_code: string; deleted: boolean }>(
    `/coupons/admin/deleteCouponBatch/${batch2.coupon_batch_id}`,
    'POST',
    token
  );
  assert(
    delDraft.status === 200 && delDraft.json.data?.deleted === true,
    'Delete draft batch 2',
    delDraft.json.data?.batch_code
  );

  // 8) After mark printed — delete blocked
  const createPrinted = await api<{ coupon_batch_id: string; batch_code: string }>(
    '/coupons/admin/createCouponBatch',
    'POST',
    token,
    {
      description: 'serial-test-printed-block-delete',
      face_value_paise: 1000,
      total_count: 2,
      expires_at: null,
    }
  );
  assert(createPrinted.status === 201, 'Create batch for print-block test');
  const printedBatchId = createPrinted.json.data!.coupon_batch_id;
  await api(`/coupons/admin/generateBatchCodes/${printedBatchId}`, 'POST', token);
  await api(`/coupons/admin/markBatchPrinted/${printedBatchId}`, 'POST', token);
  const delPrinted = await api(
    `/coupons/admin/deleteCouponBatch/${printedBatchId}`,
    'POST',
    token
  );
  assert(
    delPrinted.status === 400,
    'Block delete after printed',
    delPrinted.json.error || delPrinted.json.message
  );
  await api(`/coupons/admin/archiveCouponBatch/${printedBatchId}`, 'POST', token);
  ok('Archive printed batch');

  const create3 = await api<{ coupon_batch_id: string; batch_code: string }>(
    '/coupons/admin/createCouponBatch',
    'POST',
    token,
    {
      description: 'serial-test-3-after-delete',
      face_value_paise: 1000,
      total_count: 1,
      expires_at: null,
    }
  );
  assert(create3.status === 201, 'Create batch 3 after delete');
  const series3 = parseInt(create3.json.data!.batch_code.slice(-3), 10);
  assert(
    series3 > series2,
    'Deleted series not reused',
    `deleted up to ${batch2.batch_code}, next ${create3.json.data!.batch_code}`
  );

  await api(
    `/coupons/admin/deleteCouponBatch/${create3.json.data!.coupon_batch_id}`,
    'POST',
    token
  );
  ok('Cleanup draft batch 3');

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  await db.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nFatal:', err);
  try {
    await db.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
