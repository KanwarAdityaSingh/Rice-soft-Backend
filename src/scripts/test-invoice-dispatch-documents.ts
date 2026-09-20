/**
 * Invoice-dispatch document policy: 100 km split, 3-day grace, either-file gate.
 *
 *   npx ts-node src/scripts/test-invoice-dispatch-documents.ts
 *
 * HTTP tests need the API on API_BASE (default http://localhost:3000/api/v1).
 * Confirmed test dispatches are cancelled in finally so they cannot leave billing blocked.
 */
import dotenv from 'dotenv';
dotenv.config();

import type { InvoiceDispatch } from '../models/invoice-dispatch.model';
import {
  buildDocumentCompliance,
  dueDateFromDispatch,
  distanceBandFromKm,
  requiredDocumentForBand,
} from '../services/invoice-dispatch-document-compliance';
import {
  DISPATCH_DISTANCE_KM_THRESHOLD,
  DISPATCH_DOCUMENT_GRACE_DAYS,
} from '../constants/invoice-dispatch-documents';

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const ADMIN_USER = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORDS = [
  process.env.TEST_ADMIN_PASSWORD,
  process.env.ADMIN_PASSWORD,
  'admin123',
].filter((p): p is string => Boolean(p));

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

type Result = { status: number; data: any };
type Case = { name: string; ok: boolean; detail?: string };

const results: Case[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function run(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftYmd(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function unwrap(res: Result): any {
  const d = res.data?.data ?? res.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  return d;
}

function msgOf(res: Result): string {
  return (
    res.data?.error ||
    res.data?.message ||
    (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)?.slice(0, 400))
  );
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object | FormData
): Promise<Result> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, data };
}

function fakeDispatch(overrides: Partial<InvoiceDispatch> = {}): InvoiceDispatch {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    sales_sauda_id: '00000000-0000-0000-0000-000000000002',
    godown_id: '00000000-0000-0000-0000-000000000003',
    to_godown_id: null,
    serial_number: 1,
    internal_invoice_number: 'PB/2026-2027/BOS/1',
    dispatch_date: '2026-08-10',
    financial_year: '2026-2027',
    party_name: 'Test Party',
    party_address: null,
    party_gst_number: null,
    party_pan_number: null,
    transporter_id: null,
    vehicle_id: null,
    driver_id: null,
    lr_number: null,
    transportation_cost: null,
    distance_km: 50,
    route_description: null,
    usp: null,
    bilti_image_url: null,
    bilti_pdf_url: null,
    lr_image_url: null,
    lr_pdf_url: null,
    receiving_doc_image_url: null,
    receiving_doc_pdf_url: null,
    document_compliance_required: true,
    status: 'confirmed',
    bos_verification_token: null,
    bos_verification_token_created_at: null,
    cancel_reason: null,
    created_at: new Date('2026-08-10T06:00:00.000Z'),
    updated_at: new Date('2026-08-10T06:00:00.000Z'),
    created_by: null,
    updated_by: null,
    ...overrides,
  };
}

function runUnitTests() {
  console.log('\n=== Unit: distance bands ===');
  run('null distance is unknown', () => {
    if (distanceBandFromKm(null) !== 'unknown') throw new Error('expected unknown');
    if (requiredDocumentForBand('unknown') !== null) throw new Error('expected no document');
  });
  run('99.99 km requires receiving document', () => {
    if (distanceBandFromKm(99.99) !== 'under_100') throw new Error('expected under_100');
    if (requiredDocumentForBand('under_100') !== 'receiving_doc') {
      throw new Error('expected receiving_doc');
    }
  });
  run('100 km recommends bilti', () => {
    if (distanceBandFromKm(100) !== 'over_100') throw new Error('expected over_100');
    if (requiredDocumentForBand('over_100') !== 'bilti') throw new Error('expected bilti');
  });
  run(`threshold is ${DISPATCH_DISTANCE_KM_THRESHOLD} km / ${DISPATCH_DOCUMENT_GRACE_DAYS} days`, () => {
    if (DISPATCH_DISTANCE_KM_THRESHOLD !== 100) throw new Error('threshold');
    if (DISPATCH_DOCUMENT_GRACE_DAYS !== 3) throw new Error('grace');
  });

  console.log('\n=== Unit: grace + overdue ===');
  run('due date is dispatch_date + 3', () => {
    const due = dueDateFromDispatch(fakeDispatch({ dispatch_date: '2026-08-14' }));
    if (due !== '2026-08-17') throw new Error(`got ${due}`);
  });

  const today = '2026-08-17';
  run('confirmed under-100 is not overdue on due date', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({ dispatch_date: '2026-08-14', distance_km: 42, status: 'confirmed' }),
      today
    );
    if (c.due_date !== '2026-08-17') throw new Error(`due ${c.due_date}`);
    if (c.is_overdue || c.blocks_next_bill) throw new Error('should still be in grace');
    if (c.required_document !== 'receiving_doc') throw new Error('required');
    if (c.is_recommendation) throw new Error('receiving is not a recommendation');
    if (!c.enforced) throw new Error('enforced');
  });

  run('confirmed under-100 is overdue the day after due date', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({ dispatch_date: '2026-08-13', distance_km: 42, status: 'confirmed' }),
      today
    );
    if (c.due_date !== '2026-08-16') throw new Error(`due ${c.due_date}`);
    if (!c.is_overdue || !c.blocks_next_bill) throw new Error('should block');
  });

  run('draft under-100 past due does not block', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({ dispatch_date: '2026-08-10', distance_km: 20, status: 'draft' }),
      today
    );
    if (c.is_overdue || c.blocks_next_bill) throw new Error('draft must not block');
    if (c.required_document !== 'receiving_doc') throw new Error('still required for UI');
  });

  run('receiving document clears the under-100 block', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({
        dispatch_date: '2026-08-10',
        distance_km: 20,
        receiving_doc_image_url: 'https://example.com/pod.jpg',
      }),
      today
    );
    if (!c.has_required_document) throw new Error('uploaded');
    if (c.is_overdue || c.blocks_next_bill) throw new Error('cleared');
    if (c.is_recommendation) throw new Error('preferred is on file');
  });

  run('bilti on under-100 unblocks create but keeps recommended receiving', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({
        dispatch_date: '2026-08-10',
        distance_km: 20,
        bilti_pdf_url: 'https://example.com/bilti.pdf',
      }),
      today
    );
    if (c.blocks_next_bill) throw new Error('either file must unblock create');
    if (!c.is_overdue) throw new Error('preferred receiving is still missing');
    if (!c.is_recommendation) throw new Error('warning must be recommendation');
    if (c.required_document !== 'receiving_doc') throw new Error('still ask for receiving');
    if (c.has_required_document) throw new Error('receiving not uploaded');
  });

  run('over-100 recommends bilti and LR counts as uploaded', () => {
    const missing = buildDocumentCompliance(
      fakeDispatch({ dispatch_date: '2026-08-10', distance_km: 150 }),
      today
    );
    if (missing.required_document !== 'bilti' || !missing.is_recommendation) {
      throw new Error('expected recommended bilti');
    }
    if (!missing.is_overdue || !missing.blocks_next_bill) {
      throw new Error('missing both documents should block');
    }

    const withLr = buildDocumentCompliance(
      fakeDispatch({
        dispatch_date: '2026-08-10',
        distance_km: 150,
        lr_pdf_url: 'https://example.com/lr.pdf',
      }),
      today
    );
    if (!withLr.has_bilti || withLr.is_overdue || withLr.blocks_next_bill) {
      throw new Error('LR should satisfy bilti');
    }
  });

  run('receiving on over-100 unblocks create but keeps recommended bilti', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({
        dispatch_date: '2026-08-10',
        distance_km: 150,
        receiving_doc_image_url: 'https://example.com/pod.jpg',
      }),
      today
    );
    if (c.blocks_next_bill) throw new Error('either file must unblock create');
    if (!c.is_overdue) throw new Error('preferred bilti is still missing');
    if (!c.is_recommendation) throw new Error('warning must be recommendation');
    if (c.required_document !== 'bilti') throw new Error('still ask for bilti');
  });

  run('historical invoices are not enforced', () => {
    const c = buildDocumentCompliance(
      fakeDispatch({
        document_compliance_required: false,
        dispatch_date: '2026-01-01',
        distance_km: 10,
        status: 'confirmed',
      }),
      today
    );
    if (c.enforced) throw new Error('must not be enforced');
    if (c.required_document !== null) throw new Error('no required document');
    if (c.is_overdue || c.blocks_next_bill) throw new Error('must not block');
  });
}

async function login(): Promise<string | null> {
  for (const password of ADMIN_PASSWORDS) {
    const res = await request('POST', '/auth/loginUser', undefined, {
      username: ADMIN_USER,
      password,
    });
    const token = unwrap(res)?.token;
    if (res.status === 200 && token) return token as string;
  }
  return null;
}

async function runHttpTests() {
  console.log('\n=== HTTP: next-bill block ===');
  const token = await login();
  if (!token) {
    fail('Login as admin', 'all candidate passwords failed');
    return;
  }
  pass('Login as admin');

  const [partiesRes, productsRes, fgRes, godownsRes, eligibility0] = await Promise.all([
    request('GET', '/sales-parties?limit=100', token),
    request('GET', '/products?limit=100', token),
    request('GET', '/inventory/finished-goods', token),
    request('GET', '/godowns?limit=100', token),
    request('GET', '/invoice-dispatches/next-bill-eligibility', token),
  ]);

  if (eligibility0.status !== 200) {
    fail(
      'GET next-bill-eligibility (migration 215 applied?)',
      msgOf(eligibility0)
    );
    return;
  }
  const baseline = unwrap(eligibility0);
  assert(
    'Baseline next-bill eligibility loads',
    baseline?.allowed === true || Array.isArray(baseline?.blocked_by),
    baseline?.allowed === false
      ? `already blocked by ${baseline.blocked_by?.length ?? 0}`
      : 'allowed'
  );
  if (baseline?.allowed === false) {
    fail(
      'HTTP suite skipped',
      `billing already blocked by ${JSON.stringify(baseline.blocked_by?.[0] ?? baseline)}`
    );
    return;
  }

  const parties = unwrap(partiesRes) || [];
  const products = unwrap(productsRes) || [];
  const fgRows = unwrap(fgRes) || [];
  const godowns = unwrap(godownsRes) || [];
  const invoiceSeriesGodown =
    godowns.find((g: any) => {
      const gst = String(g.gst_number || '').toUpperCase();
      return g.is_active !== false && (gst.startsWith('06') || gst.startsWith('07'));
    }) || godowns.find((g: any) => g.is_active !== false);

  const product =
    products.find((p: any) =>
      fgRows.some((f: any) => f.product_id === p.id && Number(f.total_weight) > 0)
    ) || products[0];
  const productId = product?.id as string | undefined;
  const fgForProduct = fgRows.filter((f: any) => f.product_id === productId);
  const packagingId =
    fgForProduct.find((f: any) => f.packaging_id)?.packaging_id ?? null;
  const godownId = invoiceSeriesGodown?.id as string | undefined;
  const salesPartyId = parties[0]?.id as string | undefined;

  assert('Has sales party', Boolean(salesPartyId), `count=${parties.length}`);
  assert('Has product', Boolean(productId), `count=${products.length}`);
  assert('Has invoiceable godown', Boolean(godownId), invoiceSeriesGodown?.gst_number);

  if (!salesPartyId || !productId || !godownId) {
    fail('HTTP suite skipped', 'missing party/product/godown');
    return;
  }

  const overdueDate = shiftYmd(todayYmd(), -5);
  let dispatchId: string | undefined;
  let confirmed = false;

  const sauda = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    sauda_type: 'ex',
    movement_type: 'sale',
    payment_terms: '15',
    sauda_date: todayYmd(),
    notes: 'invoice-dispatch document policy test',
    lines: [
      {
        product_id: productId,
        packaging_id: packagingId || undefined,
        quantity: 1,
        quantity_unit: 'kg',
        rate: 50,
        discount_value: 0,
        discount_type: 'per_kg',
        gst_percent: 5,
      },
    ],
  });
  const saudaId = unwrap(sauda)?.id as string | undefined;
  assert(
    'Create sales sauda',
    (sauda.status === 201 || sauda.status === 200) && Boolean(saudaId),
    sauda.status >= 400 ? msgOf(sauda) : saudaId
  );
  if (!saudaId) return;

  const finalized = await request('POST', `/sales-saudas/${saudaId}/finalize`, token);
  assert('Finalize sales sauda', finalized.status === 200, msgOf(finalized));
  if (finalized.status !== 200) return;

  try {
    const draft = await request('POST', '/invoice-dispatches', token, {
      sales_sauda_id: saudaId,
      godown_id: godownId,
      dispatch_date: overdueDate,
      distance_km: 42,
    });
    dispatchId = unwrap(draft)?.id as string | undefined;
    const compliance = unwrap(draft)?.document_compliance;
    assert(
      'Create draft with distance 42 km',
      (draft.status === 201 || draft.status === 200) && Boolean(dispatchId),
      draft.status >= 400 ? msgOf(draft) : dispatchId
    );
    if (!dispatchId) return;

    assert(
      'Draft is enforced and asks for receiving document',
      compliance?.enforced === true &&
        compliance?.required_document === 'receiving_doc' &&
        compliance?.distance_band === 'under_100' &&
        compliance?.is_overdue === false,
      JSON.stringify(compliance)
    );

    const eligDraft = unwrap(
      await request('GET', '/invoice-dispatches/next-bill-eligibility', token)
    );
    assert(
      'Draft past due does not block next create',
      eligDraft?.allowed === true,
      JSON.stringify(eligDraft)
    );

    const confirm = await request('POST', `/invoice-dispatches/${dispatchId}/confirm`, token);
    confirmed = confirm.status === 200;
    assert('Confirm overdue short-haul invoice', confirmed, msgOf(confirm));
    if (!confirmed) return;

    const afterConfirm = unwrap(
      await request('GET', `/invoice-dispatches/${dispatchId}`, token)
    )?.document_compliance;
    assert(
      'Confirmed overdue invoice blocks next bill',
      afterConfirm?.is_overdue === true && afterConfirm?.blocks_next_bill === true,
      JSON.stringify(afterConfirm)
    );

    const eligBlocked = unwrap(
      await request('GET', '/invoice-dispatches/next-bill-eligibility', token)
    );
    assert(
      'Eligibility lists the overdue receiving document',
      eligBlocked?.allowed === false &&
        eligBlocked?.blocked_by?.[0]?.id === dispatchId &&
        eligBlocked?.blocked_by?.[0]?.missing_document === 'receiving_doc',
      JSON.stringify(eligBlocked)
    );

    const blockedCreate = await request('POST', '/invoice-dispatches', token, {
      sales_sauda_id: saudaId,
      godown_id: godownId,
      dispatch_date: todayYmd(),
      distance_km: 10,
    });
    assert(
      'Creating another draft is blocked (409)',
      blockedCreate.status === 409,
      `${blockedCreate.status}: ${msgOf(blockedCreate)}`
    );

    const form = new FormData();
    form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'receiving.png');
    const upload = await request(
      'POST',
      `/invoice-dispatches/${dispatchId}/upload-receiving-doc`,
      token,
      form
    );
    assert(
      'Upload receiving document',
      upload.status === 200,
      msgOf(upload)
    );

    const eligOpen = unwrap(
      await request('GET', '/invoice-dispatches/next-bill-eligibility', token)
    );
    assert(
      'Eligibility allows create after receiving upload',
      eligOpen?.allowed === true,
      JSON.stringify(eligOpen)
    );

    const unblockedCreate = await request('POST', '/invoice-dispatches', token, {
      sales_sauda_id: '00000000-0000-0000-0000-000000000099',
      godown_id: godownId,
      dispatch_date: todayYmd(),
    });
    assert(
      'Create is no longer 409 after upload (sauda lookup may 404)',
      unblockedCreate.status !== 409,
      `${unblockedCreate.status}: ${msgOf(unblockedCreate)}`
    );
  } finally {
    if (dispatchId) {
      if (confirmed) {
        const cancel = await request('POST', `/invoice-dispatches/${dispatchId}/cancel`, token, {
          reason: 'invoice-dispatch document policy test cleanup',
        });
        assert(
          'Cancel test invoice so billing stays unblocked',
          cancel.status === 200,
          msgOf(cancel)
        );
      } else {
        const del = await request('DELETE', `/invoice-dispatches/${dispatchId}`, token);
        assert(
          'Delete unconfirmed test draft',
          del.status === 200 || del.status === 204,
          msgOf(del)
        );
      }
    }
  }
}

async function main() {
  console.log('=== Invoice dispatch document policy tests ===');
  console.log('BASE URL', BASE);
  runUnitTests();
  await runHttpTests();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? `, ${failed.length} failed` : '')
  );
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
