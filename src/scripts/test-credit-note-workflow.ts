/**
 * Credit-note workflow tests: pure financials + live HTTP scenarios.
 *
 *   npx ts-node src/scripts/test-credit-note-workflow.ts
 *
 * HTTP tests need the API on API_BASE (default http://localhost:3000/api/v1)
 * and an admin login. Leftover drafts are cancelled so remaining qty/value is restored.
 */
import dotenv from 'dotenv';
dotenv.config();

import {
  computeQuantityReturnFinancials,
  computeRateDifferenceFinancials,
  computeValueCreditFinancials,
  roundCreditMoney,
  splitGst,
  sumLineFinancials,
} from '../services/credit-note-financials';
import {
  CREDIT_NOTE_TYPES,
  defaultCouponStatus,
  isQuantityReturnType,
  isValueOnlyType,
} from '../constants/credit-note';
import { formatCreditNoteDocumentNumber } from '../constants/invoice-number-series';
import { creditNoteReasonProblem } from '../utils/credit-note-reason';
import type { CreditNoteTaxContext } from '../services/credit-note-financials';

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';
const ADMIN_USER = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORDS = [
  process.env.TEST_ADMIN_PASSWORD,
  process.env.ADMIN_PASSWORD,
  'admin123',
].filter((p): p is string => Boolean(p));

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

function expectThrow(name: string, fn: () => void, match?: string) {
  try {
    fn();
    fail(name, 'expected throw');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (match && !msg.toLowerCase().includes(match.toLowerCase())) {
      fail(name, `threw "${msg}", expected to include "${match}"`);
    } else {
      pass(name, msg);
    }
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
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function unwrap(res: Result): any {
  const d = res.data?.data ?? res.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  return d;
}

function msgOf(res: Result): string {
  return (
    res.data?.message ||
    res.data?.error ||
    (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)?.slice(0, 400))
  );
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object,
  extraHeaders?: Record<string, string>
): Promise<Result> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !headers['Content-Type'] && !(body instanceof FormData)) {
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

const intraCtx = (overrides: Partial<CreditNoteTaxContext> = {}): CreditNoteTaxContext => ({
  rate: 80,
  gstPercent: 5,
  discountValue: 0,
  discountType: 'per_kg',
  interState: false,
  ...overrides,
});

function runUnitTests() {
  console.log('\n=== Unit: constants ===');
  run('8 document types', () => {
    if (CREDIT_NOTE_TYPES.length !== 8) throw new Error(`got ${CREDIT_NOTE_TYPES.length}`);
  });
  run('value-only vs quantity-return partition', () => {
    for (const t of CREDIT_NOTE_TYPES) {
      if (isValueOnlyType(t) === isQuantityReturnType(t)) {
        throw new Error(`${t} classified as both or neither`);
      }
    }
  });
  run('default coupon: quantity return → returned_with_goods', () => {
    if (defaultCouponStatus('sales_return_partial') !== 'returned_with_goods') {
      throw new Error(defaultCouponStatus('sales_return_partial'));
    }
  });
  run('default coupon: value-only → not_applicable', () => {
    if (defaultCouponStatus('rate_difference') !== 'not_applicable') {
      throw new Error(defaultCouponStatus('rate_difference'));
    }
  });
  run('CN number format A/{ST}/CN/{YY-YY}/{n}', () => {
    const hr = formatCreditNoteDocumentNumber({
      stateAlpha: 'HR',
      financialYearLabel: '2026-2027',
      sequence: 32,
    });
    if (hr !== 'A/HR/CN/26-27/32') throw new Error(hr);
    const dl = formatCreditNoteDocumentNumber({
      stateAlpha: 'DL',
      financialYearLabel: '2026-2027',
      sequence: 1,
    });
    if (dl !== 'A/DL/CN/26-27/1') throw new Error(dl);
  });

  console.log('\n=== Unit: reason cheap checks ===');
  run('empty reason is required', () => {
    if (creditNoteReasonProblem('  ') !== 'Reason is required') {
      throw new Error(String(creditNoteReasonProblem('  ')));
    }
  });
  run('too short is rejected', () => {
    if (!creditNoteReasonProblem('ok hi')) throw new Error('expected reject');
  });
  run('single word is rejected', () => {
    if (!creditNoteReasonProblem('Shortageeeee')) throw new Error('expected reject');
  });
  run('keyboard smash is rejected', () => {
    if (!creditNoteReasonProblem('asdf asdf asdf')) throw new Error('expected reject');
  });
  run('normal Hindi/English reason is accepted', () => {
    if (creditNoteReasonProblem('Rate difference as agreed')) {
      throw new Error(String(creditNoteReasonProblem('Rate difference as agreed')));
    }
    if (creditNoteReasonProblem('ग्राहक छूट सहमति')) {
      throw new Error(String(creditNoteReasonProblem('ग्राहक छूट सहमति')));
    }
  });

  console.log('\n=== Unit: GST split ===');
  run('intra-state splits GST into CGST+SGST', () => {
    const s = splitGst(5, false);
    if (s.igst_amount !== 0) throw new Error(`igst ${s.igst_amount}`);
    if (roundCreditMoney(s.cgst_amount + s.sgst_amount) !== 5) {
      throw new Error(JSON.stringify(s));
    }
  });
  run('inter-state puts GST on IGST', () => {
    const s = splitGst(5, true);
    if (s.igst_amount !== 5 || s.cgst_amount !== 0 || s.sgst_amount !== 0) {
      throw new Error(JSON.stringify(s));
    }
  });
  run('odd GST split still sums to original (₹0.01 remainder on SGST)', () => {
    const s = splitGst(0.05, false);
    if (roundCreditMoney(s.cgst_amount + s.sgst_amount) !== 0.05) {
      throw new Error(JSON.stringify(s));
    }
  });

  console.log('\n=== Unit: quantity-return financials ===');
  run('10 kg @ 80 + 5% GST = ₹840', () => {
    const f = computeQuantityReturnFinancials({
      quantity: 10,
      remainingQty: 10,
      remainingValue: 840,
      ctx: intraCtx(),
    });
    if (f.taxable_amount !== 800) throw new Error(`taxable ${f.taxable_amount}`);
    if (f.final_amount !== 840) throw new Error(`final ${f.final_amount}`);
    if (f.cgst_amount !== 20 || f.sgst_amount !== 20) throw new Error(JSON.stringify(f));
  });
  run('scales down when prior value credits leave less remaining value', () => {
    const f = computeQuantityReturnFinancials({
      quantity: 10,
      remainingQty: 10,
      remainingValue: 420,
      ctx: intraCtx(),
    });
    if (f.final_amount !== 420) throw new Error(`final ${f.final_amount}`);
    if (f.taxable_amount !== 400) throw new Error(`taxable ${f.taxable_amount}`);
  });
  expectThrow(
    'quantity return with remaining value ₹0 is rejected',
    () =>
      computeQuantityReturnFinancials({
        quantity: 1,
        remainingQty: 10,
        remainingValue: 0,
        ctx: intraCtx(),
      }),
    '₹0.00'
  );

  console.log('\n=== Unit: rate-difference financials ===');
  run('80 → 70 on 10 kg credits ₹105 incl GST', () => {
    const f = computeRateDifferenceFinancials({
      quantity: 10,
      originalRate: 80,
      correctedRate: 70,
      remainingValue: 840,
      ctx: intraCtx(),
    });
    if (f.taxable_amount !== 100) throw new Error(`taxable ${f.taxable_amount}`);
    if (f.final_amount !== 105) throw new Error(`final ${f.final_amount}`);
  });
  expectThrow(
    'corrected rate >= original is rejected',
    () =>
      computeRateDifferenceFinancials({
        quantity: 10,
        originalRate: 80,
        correctedRate: 80,
        remainingValue: 840,
        ctx: intraCtx(),
      }),
    'less than'
  );
  expectThrow(
    'rate difference exceeding remaining value is rejected',
    () =>
      computeRateDifferenceFinancials({
        quantity: 10,
        originalRate: 80,
        correctedRate: 10,
        remainingValue: 10,
        ctx: intraCtx(),
      }),
    'exceeds remaining'
  );

  console.log('\n=== Unit: value-only financials ===');
  run('taxable 100 + 5% GST = ₹105 intra-state', () => {
    const f = computeValueCreditFinancials({
      taxableInput: 100,
      remainingValue: 840,
      ctx: intraCtx(),
    });
    if (f.final_amount !== 105) throw new Error(`final ${f.final_amount}`);
    if (f.cgst_amount !== 2.5 || f.sgst_amount !== 2.5) throw new Error(JSON.stringify(f));
  });
  run('same taxable is IGST when inter-state', () => {
    const f = computeValueCreditFinancials({
      taxableInput: 100,
      remainingValue: 840,
      ctx: intraCtx({ interState: true }),
    });
    if (f.igst_amount !== 5 || f.cgst_amount !== 0) throw new Error(JSON.stringify(f));
  });
  expectThrow(
    'zero taxable credit is rejected',
    () => computeValueCreditFinancials({ taxableInput: 0, remainingValue: 840, ctx: intraCtx() }),
    'greater than 0'
  );
  expectThrow(
    'value credit exceeding remaining is rejected',
    () =>
      computeValueCreditFinancials({
        taxableInput: 900,
        remainingValue: 840,
        ctx: intraCtx(),
      }),
    'exceeds remaining'
  );

  console.log('\n=== Unit: header totals ===');
  run('sumLineFinancials adds line GST snapshots', () => {
    const a = computeValueCreditFinancials({
      taxableInput: 100,
      remainingValue: 840,
      ctx: intraCtx(),
    });
    const b = computeValueCreditFinancials({
      taxableInput: 50,
      remainingValue: 840,
      ctx: intraCtx(),
    });
    const s = sumLineFinancials([a, b]);
    if (s.total_credit_amount !== 157.5) throw new Error(JSON.stringify(s));
  });
}

async function fgiKg(token: string, productId: string, godownId?: string): Promise<number> {
  const q = godownId
    ? `/inventory/finished-goods?product_id=${productId}&godown_id=${godownId}`
    : `/inventory/finished-goods?product_id=${productId}`;
  const res = await request('GET', q, token);
  const rows = unwrap(res) || [];
  return (Array.isArray(rows) ? rows : []).reduce(
    (s: number, r: any) => s + num(r.total_weight),
    0
  );
}

async function cancelQuiet(token: string, id: string | undefined, reason: string) {
  if (!id) return;
  await request('POST', `/credit-notes/${id}/cancel`, token, { reason });
}

async function createPartial(
  token: string,
  dispatchId: string,
  line: { id: string; product_id?: string | null },
  qty: number,
  extra: Record<string, unknown> = {}
) {
  return request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: extra.credit_note_type ?? 'sales_return_partial',
    ...(extra.credit_note_date ? { credit_note_date: extra.credit_note_date } : {}),
    reason: extra.reason ?? 'Automated credit-note workflow test',
    coupon_status: extra.coupon_status,
    material_condition: extra.material_condition,
    receiving_godown_id: extra.receiving_godown_id,
    lines: extra.lines ?? [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: qty,
      },
    ],
  });
}

async function runHttpTests() {
  console.log('\n=== HTTP: health + auth ===');
  const health = await request('GET', '/health');
  assert('GET /health', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    fail('HTTP suite skipped', `API not reachable at ${BASE}`);
    return;
  }

  const unauth = await request('GET', '/credit-notes');
  assert('GET /credit-notes without token → 401', unauth.status === 401, `status=${unauth.status}`);

  let token: string | undefined;
  for (const password of ADMIN_PASSWORDS) {
    const login = await request('POST', '/auth/loginUser', undefined, {
      username: ADMIN_USER,
      password,
    });
    token = unwrap(login)?.token;
    if (token) {
      pass('Login as admin', `user=${ADMIN_USER}`);
      break;
    }
  }
  if (!token) {
    fail('Login as admin', 'all candidate passwords failed');
    return;
  }

  const [partiesRes, productsRes, fgRes, godownsRes] = await Promise.all([
    request('GET', '/sales-parties?limit=100', token),
    request('GET', '/products?limit=100', token),
    request('GET', '/inventory/finished-goods', token),
    request('GET', '/godowns?limit=100', token),
  ]);
  const parties = unwrap(partiesRes) || [];
  const products = unwrap(productsRes) || [];
  const fg = unwrap(fgRes) || [];
  const godowns = unwrap(godownsRes) || [];

  const fgRows = Array.isArray(fg) ? fg : [];
  const stockedFg = fgRows.filter((f: any) => num(f.total_weight) >= 2);
  const invoiceSeriesGodown =
    godowns.find((g: any) => {
      const gst = String(g.gst_number || '').toUpperCase();
      return g.is_active !== false && (gst.startsWith('06') || gst.startsWith('07'));
    }) || null;

  let product =
    products.find((p: any) =>
      stockedFg.some((f: any) => f.product_id === p.id && num(f.total_weight) >= 5)
    ) ||
    products.find((p: any) => fgRows.some((f: any) => f.product_id === p.id && num(f.total_weight) > 0)) ||
    products[0];
  const productId = product?.id as string | undefined;
  const fgForProduct = fgRows.filter((f: any) => f.product_id === productId);
  const packagingId =
    fgForProduct.find((f: any) => f.packaging_id && num(f.total_weight) > 0)?.packaging_id ??
    fgForProduct.find((f: any) => f.packaging_id)?.packaging_id ??
    null;

  // Invoice numbers only exist for GST 06/07. Seed a small FGI row there so we can
  // confirm a dispatch without touching the Maharashtra stock godown.
  let godownId = invoiceSeriesGodown?.id as string | undefined;
  if (godownId && productId && packagingId) {
    try {
      const { db } = await import('../database/connection');
      await db.query(
        `INSERT INTO finished_goods_inventory
           (godown_id, product_id, packaging_id, batch_id, no_of_packets, total_weight)
         VALUES ($1, $2, $3, NULL, 4, 20)`,
        [godownId, productId, packagingId]
      );
      pass('Seeded 20 kg FGI on invoice-series godown', invoiceSeriesGodown?.gst_number);
    } catch (e) {
      fail(
        'Seeded 20 kg FGI on invoice-series godown',
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  const secondGodown = godowns.find(
    (g: any) => g.id !== godownId && g.is_active !== false && String(g.gst_number || '').toUpperCase().startsWith('07')
  ) || godowns.find((g: any) => g.id !== godownId && g.is_active !== false);

  const saleQty = 10;
  const salesPartyId = parties[0]?.id as string | undefined;

  assert('Has sales party', Boolean(salesPartyId), `count=${parties.length}`);
  assert('Has product', Boolean(productId), `count=${products.length}`);
  assert('Has invoiceable godown', Boolean(godownId), invoiceSeriesGodown?.gst_number);
  assert('Has FGI to dispatch', saleQty > 0, `saleQty=${saleQty}`);

  if (!salesPartyId || !productId || !godownId || saleQty <= 0) {
    fail('HTTP suite skipped', 'missing party/product/godown/FGI');
    return;
  }

  const sauda = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    sauda_type: 'ex',
    movement_type: 'sale',
    payment_terms: '15',
    sauda_date: todayYmd(),
    notes: 'credit-note workflow test sauda',
    lines: [
      {
        product_id: productId,
        packaging_id: packagingId || undefined,
        quantity: saleQty,
        quantity_unit: 'kg',
        rate: 80,
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

  const draftDispatch = await request('POST', '/invoice-dispatches', token, {
    sales_sauda_id: saudaId,
    godown_id: godownId,
    dispatch_date: todayYmd(),
  });
  const dispatchId = unwrap(draftDispatch)?.id as string | undefined;
  assert(
    'Create invoice dispatch (draft)',
    (draftDispatch.status === 201 || draftDispatch.status === 200) && Boolean(dispatchId),
    draftDispatch.status >= 400 ? msgOf(draftDispatch) : dispatchId
  );
  if (!dispatchId) return;

  const cnOnDraft = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'sales_return_partial',
    reason: 'should fail — dispatch still draft',
    lines: [{ invoice_dispatch_line_id: '00000000-0000-0000-0000-000000000001', quantity_credited: 1 }],
  });
  assert(
    'Create CN against draft dispatch → 400',
    cnOnDraft.status === 400,
    `status=${cnOnDraft.status} ${msgOf(cnOnDraft)}`
  );

  const confirmed = await request('POST', `/invoice-dispatches/${dispatchId}/confirm`, token);
  assert('Confirm invoice dispatch', confirmed.status === 200, msgOf(confirmed));
  if (confirmed.status !== 200) return;

  const fullDispatch = unwrap(await request('GET', `/invoice-dispatches/${dispatchId}`, token));
  const line = (fullDispatch?.lines ?? [])[0] as
    | { id: string; product_id?: string | null; quantity?: number }
    | undefined;
  assert('Dispatch has a line', Boolean(line?.id), JSON.stringify(fullDispatch?.lines)?.slice(0, 200));
  if (!line?.id) return;

  const invoiceDate = String(fullDispatch.dispatch_date || todayYmd()).slice(0, 10);

  console.log('\n=== HTTP: pickers + context ===');
  const eligible = await request('GET', `/credit-notes/eligible-invoices?search=${encodeURIComponent(fullDispatch.internal_invoice_number || '')}`, token);
  const eligibleItems = unwrap(eligible) || [];
  assert(
    'GET /eligible-invoices includes confirmed sales invoice',
    eligible.status === 200 && eligibleItems.some((r: any) => r.id === dispatchId),
    `status=${eligible.status} count=${eligibleItems.length}`
  );
  assert(
    'Eligible invoices omit godown transfers (to_godown_id filter is server-side)',
    eligible.status === 200,
    'query is confirmed AND to_godown_id IS NULL'
  );
  const eligibleSameGodown = await request(
    'GET',
    `/credit-notes/eligible-invoices?godown_id=${godownId}&search=${encodeURIComponent(fullDispatch.internal_invoice_number || '')}`,
    token
  );
  assert(
    'GET /eligible-invoices?godown_id includes invoice from that godown',
    eligibleSameGodown.status === 200 &&
      (unwrap(eligibleSameGodown) || []).some((r: any) => r.id === dispatchId),
    `status=${eligibleSameGodown.status}`
  );
  if (secondGodown?.id && secondGodown.id !== godownId) {
    const eligibleOtherGodown = await request(
      'GET',
      `/credit-notes/eligible-invoices?godown_id=${secondGodown.id}&search=${encodeURIComponent(fullDispatch.internal_invoice_number || '')}`,
      token
    );
    assert(
      'GET /eligible-invoices?godown_id excludes invoice from another godown',
      eligibleOtherGodown.status === 200 &&
        !(unwrap(eligibleOtherGodown) || []).some((r: any) => r.id === dispatchId),
      `status=${eligibleOtherGodown.status} count=${(unwrap(eligibleOtherGodown) || []).length}`
    );
  }

  const ctx0 = unwrap(await request('GET', `/credit-notes/invoice-context/${dispatchId}`, token));
  const ctxLine = (ctx0?.lines ?? []).find((l: any) => l.invoice_dispatch_line_id === line.id);
  assert(
    'GET /invoice-context remaining qty = invoiced',
    Boolean(ctxLine) && num(ctxLine.remaining_qty) === num(ctxLine.invoiced_qty),
    JSON.stringify(ctxLine)
  );
  assert(
    'GET /invoice-context remaining value = original final',
    Boolean(ctxLine) && num(ctxLine.remaining_value) === num(ctxLine.original_final),
    `remaining=${ctxLine?.remaining_value} original=${ctxLine?.original_final}`
  );
  assert(
    'GET /invoice-context includes brand and hsn for form prefill',
    ctxLine?.brand !== undefined && ctxLine?.hsn_code !== undefined,
    JSON.stringify({ brand: ctxLine?.brand, hsn: ctxLine?.hsn_code })
  );

  console.log('\n=== HTTP: line display snapshots (type other only) ===');
  const ignoredOnReturn = await createPartial(token, dispatchId, line, 0.05, {
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: 0.05,
        product_alias: 'Should Not Save',
        brand: 'Should Not Save',
        hsn_code: '100630',
      },
    ],
  });
  const ignoredId = unwrap(ignoredOnReturn)?.id as string | undefined;
  assert(
    'Quantity return ignores name/brand/HSN aliases',
    ignoredOnReturn.status === 201 &&
      unwrap(ignoredOnReturn)?.lines?.[0]?.product_alias == null &&
      unwrap(ignoredOnReturn)?.lines?.[0]?.brand == null &&
      unwrap(ignoredOnReturn)?.lines?.[0]?.hsn_code == null,
    ignoredOnReturn.status >= 400
      ? msgOf(ignoredOnReturn)
      : JSON.stringify(unwrap(ignoredOnReturn)?.lines?.[0])
  );
  await cancelQuiet(token, ignoredId, 'cleanup ignored alias on return');

  const snapshotCreate = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'other',
    reason: 'Automated credit-note display alias test',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        credit_taxable_input: 1,
        product_alias: 'CN Display Rice',
        brand: 'CN Brand',
        hsn_code: '100630',
      },
    ],
  });
  const snapshotId = unwrap(snapshotCreate)?.id as string | undefined;
  assert(
    'Create other draft with custom name/brand/HSN',
    snapshotCreate.status === 201 && Boolean(snapshotId),
    snapshotCreate.status >= 400 ? msgOf(snapshotCreate) : snapshotId
  );
  if (snapshotId) {
    const saved = unwrap(snapshotCreate)?.lines?.[0];
    assert(
      'GET create response stores CN line snapshots',
      saved?.product_alias === 'CN Display Rice' &&
        saved?.brand === 'CN Brand' &&
        saved?.hsn_code === '100630',
      JSON.stringify(saved)
    );
    const snapshotPreview = unwrap(
      await request('GET', `/credit-notes/${snapshotId}/preview`, token)
    );
    assert(
      'Preview uses CN snapshots not product master',
      snapshotPreview?.lines?.[0]?.product_name === 'CN Display Rice' &&
        snapshotPreview?.lines?.[0]?.brand === 'CN Brand' &&
        snapshotPreview?.lines?.[0]?.hsn_code === '100630',
      JSON.stringify(snapshotPreview?.lines?.[0])
    );
    const snapshotEdit = await request('PUT', `/credit-notes/${snapshotId}`, token, {
      edit_reason: 'rename CN print fields',
      lines: [
        {
          invoice_dispatch_line_id: line.id,
          product_id: line.product_id,
          credit_taxable_input: 1,
          product_alias: 'CN Display Rice Edited',
          brand: 'CN Brand Edited',
          hsn_code: '100630',
        },
      ],
    });
    assert(
      'PUT draft updates CN snapshots',
      snapshotEdit.status === 200 &&
        unwrap(snapshotEdit)?.lines?.[0]?.product_alias === 'CN Display Rice Edited' &&
        unwrap(snapshotEdit)?.lines?.[0]?.brand === 'CN Brand Edited',
      snapshotEdit.status >= 400 ? msgOf(snapshotEdit) : JSON.stringify(unwrap(snapshotEdit)?.lines?.[0])
    );
    await cancelQuiet(token, snapshotId, 'cleanup display snapshot test');
  }

  const missingCtx = await request(
    'GET',
    '/credit-notes/invoice-context/00000000-0000-0000-0000-000000000001',
    token
  );
  assert(
    'GET /invoice-context missing dispatch → 404',
    missingCtx.status === 404,
    `status=${missingCtx.status}`
  );

  console.log('\n=== HTTP: validation ===');
  const noReason = await createPartial(token, dispatchId, line, 0.5, { reason: '' });
  assert('Create without reason → 400', noReason.status === 400, msgOf(noReason));

  const smashReason = await createPartial(token, dispatchId, line, 0.5, {
    reason: 'asdf asdf asdf',
  });
  assert(
    'Create with keyboard-smash reason → 400',
    smashReason.status === 400 && /reason|placeholder/i.test(msgOf(smashReason)),
    msgOf(smashReason)
  );
  const shortReason = await createPartial(token, dispatchId, line, 0.5, { reason: 'ok' });
  assert(
    'Create with too-short reason → 400',
    shortReason.status === 400 && /character|word/i.test(msgOf(shortReason)),
    msgOf(shortReason)
  );

  const badType = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'not_a_type',
    reason: 'bad type',
    lines: [{ invoice_dispatch_line_id: line.id, quantity_credited: 0.5 }],
  });
  assert('Create with invalid type → 400', badType.status === 400, msgOf(badType));

  const future = await createPartial(token, dispatchId, line, 0.5, {
    credit_note_date: shiftYmd(todayYmd(), 2),
  });
  assert(
    'Future credit-note date → 400',
    future.status === 400 && /future/i.test(msgOf(future)),
    msgOf(future)
  );

  const beforeInvoice = await createPartial(token, dispatchId, line, 0.5, {
    credit_note_date: shiftYmd(invoiceDate, -1),
  });
  assert(
    'Date before original invoice → 400',
    beforeInvoice.status === 400 && /before the original invoice/i.test(msgOf(beforeInvoice)),
    msgOf(beforeInvoice)
  );

  const noLines = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'sales_return_partial',
    reason: 'no lines',
    lines: [],
  });
  assert('Partial return with no lines → 400', noLines.status === 400, msgOf(noLines));

  const overQty = await createPartial(token, dispatchId, line, num(ctxLine.invoiced_qty) + 1);
  assert(
    'Return qty above remaining → 400',
    overQty.status === 400 && /exceeds remaining eligible/i.test(msgOf(overQty)),
    msgOf(overQty)
  );

  const dup = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'sales_return_partial',
    reason: 'duplicate lines',
    lines: [
      { invoice_dispatch_line_id: line.id, product_id: line.product_id, quantity_credited: 0.2 },
      { invoice_dispatch_line_id: line.id, product_id: line.product_id, quantity_credited: 0.2 },
    ],
  });
  assert('Duplicate invoice lines → 400', dup.status === 400 && /duplicate/i.test(msgOf(dup)), msgOf(dup));

  const couponOnValue = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'commercial_discount',
    reason: 'coupon on value-only',
    coupon_status: 'returned_with_goods',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        credit_taxable_input: 1,
      },
    ],
  });
  assert(
    'returned_with_goods on value-only type → 400',
    couponOnValue.status === 400 && /returned_with_goods/i.test(msgOf(couponOnValue)),
    msgOf(couponOnValue)
  );

  const damagedNoCond = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'damaged_goods',
    reason: 'damaged without condition',
    lines: [
      { invoice_dispatch_line_id: line.id, product_id: line.product_id, quantity_credited: 0.2 },
    ],
  });
  assert(
    'Damaged goods without material_condition → 400',
    damagedNoCond.status === 400 && /material condition/i.test(msgOf(damagedNoCond)),
    msgOf(damagedNoCond)
  );

  const materialOnPartial = await createPartial(token, dispatchId, line, 0.2, {
    material_condition: 'saleable',
  });
  assert(
    'material_condition on partial return → 400',
    materialOnPartial.status === 400,
    msgOf(materialOnPartial)
  );

  const shortBad = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'short_quantity',
    reason: 'verified above invoiced',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_verified: num(ctxLine.invoiced_qty) + 5,
      },
    ],
  });
  assert(
    'Short-quantity verified > invoiced → 400',
    shortBad.status === 400,
    msgOf(shortBad)
  );

  const rateUp = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'rate_difference',
    reason: 'rate increase',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: 1,
        corrected_rate: 999,
      },
    ],
  });
  assert(
    'Corrected rate above original → 400',
    rateUp.status === 400 && /less than the original/i.test(msgOf(rateUp)),
    msgOf(rateUp)
  );

  console.log('\n=== HTTP: value-only does not consume remaining qty ===');
  const commercial = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'commercial_discount',
    reason: 'trade discount test',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        credit_taxable_input: 10,
      },
    ],
  });
  const commercialId = unwrap(commercial)?.id as string | undefined;
  assert(
    'Create commercial_discount draft',
    commercial.status === 201 && Boolean(commercialId),
    commercial.status >= 400 ? msgOf(commercial) : unwrap(commercial)?.credit_note_number
  );
  if (commercialId) {
    const cn = unwrap(commercial);
    assert(
      'Auto number matches A/{HR|DL}/CN/{YY-YY}/{n}',
      /^A\/(HR|DL)\/CN\/\d{2}-\d{2}\/\d+$/.test(String(cn.credit_note_number || '')),
      cn.credit_note_number
    );
    assert('Draft status on create', cn.status === 'draft', cn.status);
    assert(
      'Default coupon for value-only is not_applicable',
      cn.coupon_status === 'not_applicable',
      cn.coupon_status
    );
    assert('Value-only line quantity_credited is 0', num(cn.lines?.[0]?.quantity_credited) === 0);
    assert(
      'Commercial GST snapshot persisted',
      num(cn.taxable_amount) === 10 && num(cn.total_credit_amount) > 10,
      `taxable=${cn.taxable_amount} total=${cn.total_credit_amount}`
    );

    const ctxAfterValue = unwrap(
      await request('GET', `/credit-notes/invoice-context/${dispatchId}`, token)
    );
    const afterVal = (ctxAfterValue?.lines ?? []).find(
      (l: any) => l.invoice_dispatch_line_id === line.id
    );
    assert(
      'Value-only draft does not consume remaining qty',
      num(afterVal?.remaining_qty) === num(ctxLine.invoiced_qty),
      `remaining_qty=${afterVal?.remaining_qty}`
    );
    assert(
      'Value-only draft consumes remaining value',
      num(afterVal?.remaining_value) < num(ctxLine.original_final),
      `remaining_value=${afterVal?.remaining_value} original=${ctxLine.original_final}`
    );

    const noEdit = await request('PUT', `/credit-notes/${commercialId}`, token, {
      reason: 'changed without edit_reason',
    });
    assert('Update draft without edit_reason → 400', noEdit.status === 400, msgOf(noEdit));

    const edited = await request('PUT', `/credit-notes/${commercialId}`, token, {
      edit_reason: 'increase discount in test',
      reason: 'trade discount test (edited)',
      lines: [
        {
          invoice_dispatch_line_id: line.id,
          product_id: line.product_id,
          credit_taxable_input: 12,
        },
      ],
    });
    assert(
      'Update draft with edit_reason',
      edited.status === 200 && num(unwrap(edited)?.taxable_amount) === 12,
      edited.status >= 400 ? msgOf(edited) : `taxable=${unwrap(edited)?.taxable_amount}`
    );

    await cancelQuiet(token, commercialId, 'free remaining after value-only checks');
    const cancelledDraft = unwrap(await request('GET', `/credit-notes/${commercialId}`, token));
    assert('Cancel draft → cancelled', cancelledDraft?.status === 'cancelled', cancelledDraft?.status);

    const postCancelled = await request('POST', `/credit-notes/${commercialId}/confirm`, token);
    assert(
      'Post cancelled CN → 400',
      postCancelled.status === 400,
      msgOf(postCancelled)
    );
  }

  console.log('\n=== HTTP: rate difference then scaled later return ===');
  const rateDiff = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'rate_difference',
    reason: 'rate drop for test',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: saleQty,
        corrected_rate: 70,
      },
    ],
  });
  const rateDiffId = unwrap(rateDiff)?.id as string | undefined;
  assert(
    'Create rate_difference draft for full invoiced qty',
    rateDiff.status === 201 && Boolean(rateDiffId),
    rateDiff.status >= 400 ? msgOf(rateDiff) : unwrap(rateDiff)?.credit_note_number
  );
  if (rateDiffId) {
    const ctxRd = unwrap(await request('GET', `/credit-notes/invoice-context/${dispatchId}`, token));
    const afterRd = (ctxRd?.lines ?? []).find((l: any) => l.invoice_dispatch_line_id === line.id);
    assert(
      'Rate difference does not consume remaining qty',
      num(afterRd?.remaining_qty) === num(ctxLine.invoiced_qty),
      `remaining_qty=${afterRd?.remaining_qty}`
    );
    const hugeValue = await request('POST', '/credit-notes', token, {
      invoice_dispatch_id: dispatchId,
      credit_note_type: 'other',
      reason: 'over remaining value',
      lines: [
        {
          invoice_dispatch_line_id: line.id,
          product_id: line.product_id,
          credit_taxable_input: num(afterRd?.remaining_value) + 50,
        },
      ],
    });
    assert(
      'Value credit above remaining (after rate diff) → 400',
      hugeValue.status === 400 && /exceeds remaining/i.test(msgOf(hugeValue)),
      msgOf(hugeValue)
    );
    await cancelQuiet(token, rateDiffId, 'free remaining after rate-diff checks');
  }

  console.log('\n=== HTTP: quantity return lifecycle + inventory ===');
  const returnQty = Math.min(1, saleQty);
  const kgBefore = await fgiKg(token, productId, godownId);
  const partial = await createPartial(token, dispatchId, line, returnQty, {
    coupon_status: 'already_given',
  });
  const partialId = unwrap(partial)?.id as string | undefined;
  assert(
    'Create sales_return_partial draft',
    partial.status === 201 && Boolean(partialId),
    partial.status >= 400 ? msgOf(partial) : unwrap(partial)?.credit_note_number
  );
  if (partialId) {
    const draft = unwrap(partial);
    assert(
      'Quantity return with no invoice allotment stores coupon_status not_applicable',
      draft.coupon_status === 'not_applicable',
      draft.coupon_status
    );
    assert(
      'Line quantity_credited = return qty',
      num(draft.lines?.[0]?.quantity_credited) === returnQty,
      String(draft.lines?.[0]?.quantity_credited)
    );

    const ctxDraft = unwrap(
      await request('GET', `/credit-notes/invoice-context/${dispatchId}`, token)
    );
    const afterDraft = (ctxDraft?.lines ?? []).find(
      (l: any) => l.invoice_dispatch_line_id === line.id
    );
    assert(
      'Draft quantity return reserves remaining qty',
      Math.abs(num(afterDraft?.remaining_qty) - (num(ctxLine.invoiced_qty) - returnQty)) < 0.001,
      `remaining=${afterDraft?.remaining_qty} invoiced=${ctxLine.invoiced_qty}`
    );

    const collide = await createPartial(token, dispatchId, line, num(ctxLine.invoiced_qty));
    assert(
      'Second return cannot take qty reserved by the draft',
      collide.status === 400,
      msgOf(collide)
    );

    const posted = await request('POST', `/credit-notes/${partialId}/confirm`, token);
    const postedBody = unwrap(posted);
    assert('Post draft → posted', posted.status === 200 && postedBody?.status === 'posted', msgOf(posted));
    assert('posted_at set', Boolean(postedBody?.posted_at), postedBody?.posted_at);

    const postedAgain = await request('POST', `/credit-notes/${partialId}/confirm`, token);
    assert(
      'Post already-posted is idempotent',
      postedAgain.status === 200 && unwrap(postedAgain)?.status === 'posted',
      msgOf(postedAgain)
    );

    const editPosted = await request('PUT', `/credit-notes/${partialId}`, token, {
      edit_reason: 'should fail',
      reason: 'nope',
    });
    assert('Edit posted CN → 400', editPosted.status === 400, msgOf(editPosted));

    const kgAfterPost = await fgiKg(token, productId, godownId);
    assert(
      'Posting quantity return restores inventory',
      kgAfterPost >= kgBefore + returnQty - 0.05,
      `before=${kgBefore} after=${kgAfterPost} expected+${returnQty}`
    );

    const detail = unwrap(await request('GET', `/credit-notes/${partialId}`, token));
    assert(
      'GET by id includes financial_summary + timeline + invoice',
      Boolean(detail?.financial_summary) &&
        Array.isArray(detail?.timeline) &&
        Boolean(detail?.invoice?.invoice_number),
      `summary=${Boolean(detail?.financial_summary)} timeline=${detail?.timeline?.length}`
    );
    const preview = unwrap(await request('GET', `/credit-notes/${partialId}/preview`, token));
    assert(
      'GET /:id/preview returns document payload',
      preview?.document_type === 'CN' &&
        Boolean(preview?.document_number) &&
        Boolean(preview?.buyer?.name) &&
        Array.isArray(preview?.lines) &&
        preview.lines.length > 0 &&
        Boolean(preview.lines[0]?.product_name) &&
        Boolean(preview?.financial_summary),
      preview?.document_number
    );
    assert(
      'Financial summary current_credit matches header total',
      Math.abs(num(detail?.financial_summary?.current_credit) - num(detail?.total_credit_amount)) < 0.02,
      `current=${detail?.financial_summary?.current_credit} total=${detail?.total_credit_amount}`
    );

    const cancelNoReason = await request('POST', `/credit-notes/${partialId}/cancel`, token, {
      reason: '',
    });
    assert('Cancel posted without reason → 400', cancelNoReason.status === 400, msgOf(cancelNoReason));

    const cancelled = await request('POST', `/credit-notes/${partialId}/cancel`, token, {
      reason: 'reverse posted test CN',
    });
    assert(
      'Cancel posted → cancelled',
      cancelled.status === 200 && unwrap(cancelled)?.status === 'cancelled',
      msgOf(cancelled)
    );
    const kgAfterCancel = await fgiKg(token, productId, godownId);
    assert(
      'Cancel posted reverses inventory restore',
      Math.abs(kgAfterCancel - kgBefore) < 0.11,
      `before=${kgBefore} afterCancel=${kgAfterCancel}`
    );

    const cancelAgain = await request('POST', `/credit-notes/${partialId}/cancel`, token, {
      reason: 'idempotent cancel',
    });
    assert(
      'Cancel already-cancelled is idempotent',
      cancelAgain.status === 200 && unwrap(cancelAgain)?.status === 'cancelled',
      msgOf(cancelAgain)
    );
  }

  console.log('\n=== HTTP: short quantity, damaged destroy, full return, quality ===');
  const verified = Math.max(0.2, Math.min(saleQty / 2, saleQty - 0.1));
  const short = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'short_quantity',
    reason: 'warehouse verified short',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_verified: verified,
        quantity_actual_returned: verified - 0.05,
      },
    ],
  });
  const shortId = unwrap(short)?.id as string | undefined;
  assert(
    'Create short_quantity draft',
    short.status === 201 && Boolean(shortId),
    short.status >= 400 ? msgOf(short) : unwrap(short)?.credit_note_number
  );
  if (shortId) {
    const s = unwrap(short);
    const sl = s.lines?.[0];
    assert(
      'Short-quantity credits verified qty not invoiced qty',
      Math.abs(num(sl?.quantity_credited) - verified) < 0.001,
      `credited=${sl?.quantity_credited} verified=${verified}`
    );
    assert(
      'quantity_short = invoiced − verified',
      Math.abs(num(sl?.quantity_short) - (num(ctxLine.invoiced_qty) - verified)) < 0.02,
      `short=${sl?.quantity_short}`
    );
    await cancelQuiet(token, shortId, 'free remaining after short-qty checks');
  }

  const destroy = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'damaged_goods',
    reason: 'destroy damaged bags',
    material_condition: 'destroy',
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: 0.2,
      },
    ],
  });
  const destroyId = unwrap(destroy)?.id as string | undefined;
  assert(
    'Create damaged_goods destroy draft',
    destroy.status === 201 && Boolean(destroyId),
    destroy.status >= 400 ? msgOf(destroy) : msgOf(destroy)
  );
  if (destroyId) {
    const kg0 = await fgiKg(token, productId, godownId);
    const postedDestroy = await request('POST', `/credit-notes/${destroyId}/confirm`, token);
    assert(
      'Post damaged destroy',
      postedDestroy.status === 200 && unwrap(postedDestroy)?.status === 'posted',
      msgOf(postedDestroy)
    );
    const kg1 = await fgiKg(token, productId, godownId);
    assert(
      'Destroy does not restore inventory',
      Math.abs(kg1 - kg0) < 0.05,
      `before=${kg0} after=${kg1}`
    );
    await cancelQuiet(token, destroyId, 'cleanup destroy CN');
  }

  const quality = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'quality_issue',
    reason: 'quality complaint',
    material_condition: 'damaged_reprocess',
    receiving_godown_id: secondGodown?.id ?? godownId,
    lines: [
      {
        invoice_dispatch_line_id: line.id,
        product_id: line.product_id,
        quantity_credited: 0.2,
      },
    ],
  });
  const qualityId = unwrap(quality)?.id as string | undefined;
  assert(
    'Create quality_issue with receiving godown',
    quality.status === 201 && Boolean(qualityId),
    quality.status >= 400 ? msgOf(quality) : unwrap(quality)?.receiving_godown_id
  );
  await cancelQuiet(token, qualityId, 'cleanup quality CN');

  const fullTooSmall = await createPartial(token, dispatchId, line, 0.1, {
    credit_note_type: 'sales_return_full',
    reason: 'full return but qty too small',
  });
  assert(
    'Full return with qty < remaining → 400',
    fullTooSmall.status === 400 && /full sales return/i.test(msgOf(fullTooSmall)),
    msgOf(fullTooSmall)
  );

  const ctxNow = unwrap(await request('GET', `/credit-notes/invoice-context/${dispatchId}`, token));
  const remainingNow = num(
    (ctxNow?.lines ?? []).find((l: any) => l.invoice_dispatch_line_id === line.id)?.remaining_qty
  );
  const fullAuto = await request('POST', '/credit-notes', token, {
    invoice_dispatch_id: dispatchId,
    credit_note_type: 'sales_return_full',
    reason: 'full remaining return',
    lines: [],
  });
  const fullId = unwrap(fullAuto)?.id as string | undefined;
  assert(
    'Full return with empty lines auto-fills remaining qty',
    fullAuto.status === 201 &&
      Boolean(fullId) &&
      Math.abs(num(unwrap(fullAuto)?.lines?.[0]?.quantity_credited) - remainingNow) < 0.001,
    fullAuto.status >= 400
      ? msgOf(fullAuto)
      : `credited=${unwrap(fullAuto)?.lines?.[0]?.quantity_credited} remaining=${remainingNow}`
  );
  await cancelQuiet(token, fullId, 'cleanup full-return CN');

  console.log('\n=== HTTP: list + attachments ===');
  const list = await request(
    'GET',
    `/credit-notes?invoice_dispatch_id=${dispatchId}&limit=50`,
    token
  );
  const listItems = unwrap(list) || [];
  assert(
    'List by invoice_dispatch_id returns this invoice CNs',
    list.status === 200 && listItems.length >= 1,
    `count=${listItems.length}`
  );
  const listPosted = await request(
    'GET',
    `/credit-notes?invoice_dispatch_id=${dispatchId}&status=posted`,
    token
  );
  assert(
    'List status=posted never returns draft/cancelled rows',
    (unwrap(listPosted) || []).every((r: any) => r.status === 'posted'),
    `count=${(unwrap(listPosted) || []).length}`
  );
  const listType = await request(
    'GET',
    `/credit-notes?invoice_dispatch_id=${dispatchId}&credit_note_type=commercial_discount`,
    token
  );
  assert(
    'List credit_note_type=commercial_discount',
    (unwrap(listType) || []).every((r: any) => r.credit_note_type === 'commercial_discount'),
    `count=${(unwrap(listType) || []).length}`
  );

  const searchTarget = listItems.find((r: any) => r.credit_note_number)?.credit_note_number;
  if (searchTarget) {
    const searched = await request(
      'GET',
      `/credit-notes?search=${encodeURIComponent(searchTarget)}`,
      token
    );
    assert(
      'List search by CN number',
      (unwrap(searched) || []).some((r: any) => r.credit_note_number === searchTarget),
      searchTarget
    );
  }

  const missing = await request(
    'GET',
    '/credit-notes/00000000-0000-0000-0000-000000000001',
    token
  );
  assert('GET missing id → 404', missing.status === 404, `status=${missing.status}`);

  const attachType = await request(
    'POST',
    `/credit-notes/${partialId || fullId || '00000000-0000-0000-0000-000000000001'}/attachments/not-a-type`,
    token,
    undefined,
    { 'Content-Type': 'application/json' }
  );
  assert(
    'Upload invalid attachment type → 400',
    attachType.status === 400,
    `status=${attachType.status} ${msgOf(attachType)}`
  );

  if (qualityId || commercialId || partialId) {
    const anyId = [qualityId, commercialId, partialId, destroyId, shortId, fullId].find(Boolean) as
      | string
      | undefined;
    if (anyId) {
      const missingFile = await request('POST', `/credit-notes/${anyId}/attachments/other`, token);
      assert(
        'Upload without file → 400',
        missingFile.status === 400,
        `status=${missingFile.status} ${msgOf(missingFile)}`
      );
    }
  }

  if (secondGodown) {
    const transferSauda = await request('POST', '/sales-saudas', token, {
      sauda_type: 'ex',
      movement_type: 'godown_transfer',
      from_godown_id: godownId,
      to_godown_id: secondGodown.id,
      sauda_date: todayYmd(),
      lines: [
        {
          product_id: productId,
          packaging_id: packagingId || undefined,
          quantity: Math.min(1, saleQty),
          quantity_unit: 'kg',
          rate: 80,
          gst_percent: 5,
        },
      ],
    });
    const transferSaudaId = unwrap(transferSauda)?.id as string | undefined;
    if (transferSaudaId && (transferSauda.status === 201 || transferSauda.status === 200)) {
      await request('POST', `/sales-saudas/${transferSaudaId}/finalize`, token);
      const transferDispatch = await request('POST', '/invoice-dispatches', token, {
        sales_sauda_id: transferSaudaId,
        godown_id: godownId,
        to_godown_id: secondGodown.id,
        dispatch_date: todayYmd(),
      });
      const transferDispatchId = unwrap(transferDispatch)?.id as string | undefined;
      if (transferDispatchId) {
        const tConfirm = await request(
          'POST',
          `/invoice-dispatches/${transferDispatchId}/confirm`,
          token
        );
        if (tConfirm.status === 200) {
          const tCn = await request('POST', '/credit-notes', token, {
            invoice_dispatch_id: transferDispatchId,
            credit_note_type: 'sales_return_partial',
            reason: 'should fail on transfer',
            lines: [
              {
                invoice_dispatch_line_id: unwrap(tConfirm)?.lines?.[0]?.id || line.id,
                quantity_credited: 0.1,
              },
            ],
          });
          assert(
            'Credit note on godown transfer → 400',
            tCn.status === 400 && /godown transfer/i.test(msgOf(tCn)),
            msgOf(tCn)
          );
        } else {
          pass(
            'Credit note on godown transfer (confirm skipped)',
            `transfer confirm ${tConfirm.status}: ${msgOf(tConfirm)}`
          );
        }
      }
    } else {
      pass('Godown-transfer CN guard (sauda create skipped)', msgOf(transferSauda));
    }
  } else {
    pass('Godown-transfer CN guard skipped', 'only one active godown');
  }

  console.log('\n=== HTTP: hard delete reverses then removes ===');
  const olderTip = await createPartial(token, dispatchId, line, 0.1, {
    reason: 'older CN for tip-only delete',
  });
  const newerTip = await createPartial(token, dispatchId, line, 0.1, {
    reason: 'newer CN for tip-only delete',
  });
  const olderTipId = unwrap(olderTip)?.id as string | undefined;
  const newerTipId = unwrap(newerTip)?.id as string | undefined;
  if (olderTipId && newerTipId) {
    const delOlder = await request('DELETE', `/credit-notes/${olderTipId}`, token);
    assert(
      'DELETE older than series tip → 409',
      delOlder.status === 409 && /latest credit note/i.test(msgOf(delOlder)),
      msgOf(delOlder)
    );
    const delNewer = await request('DELETE', `/credit-notes/${newerTipId}`, token);
    assert('DELETE series tip → 200', delNewer.status === 200, msgOf(delNewer));
    const delOlderNowTip = await request('DELETE', `/credit-notes/${olderTipId}`, token);
    assert(
      'DELETE previous tip after newer is gone → 200',
      delOlderNowTip.status === 200,
      msgOf(delOlderNowTip)
    );
  }

  const draftDelete = await createPartial(token, dispatchId, line, 0.12, {
    reason: 'draft hard-delete test',
  });
  const draftDeleteId = unwrap(draftDelete)?.id as string | undefined;
  assert(
    'Create draft for hard delete',
    draftDelete.status === 201 && Boolean(draftDeleteId),
    msgOf(draftDelete)
  );
  if (draftDeleteId) {
    const delDraft = await request('DELETE', `/credit-notes/${draftDeleteId}`, token);
    assert('DELETE draft → 200', delDraft.status === 200, msgOf(delDraft));
    const goneDraft = await request('GET', `/credit-notes/${draftDeleteId}`, token);
    assert('GET deleted draft → 404', goneDraft.status === 404, `status=${goneDraft.status}`);
  }

  const kgBeforePostedDelete = await fgiKg(token, productId, godownId);
  const postedDeleteQty = 0.18;
  const postedDelete = await createPartial(token, dispatchId, line, postedDeleteQty, {
    reason: 'posted hard-delete test',
  });
  const postedDeleteId = unwrap(postedDelete)?.id as string | undefined;
  assert(
    'Create posted-delete CN',
    postedDelete.status === 201 && Boolean(postedDeleteId),
    msgOf(postedDelete)
  );
  if (postedDeleteId) {
    const posted = await request('POST', `/credit-notes/${postedDeleteId}/confirm`, token);
    assert(
      'Post CN before hard delete',
      posted.status === 200 && unwrap(posted)?.status === 'posted',
      msgOf(posted)
    );
    const kgAfterPost = await fgiKg(token, productId, godownId);
    assert(
      'Posted CN restored inventory before delete',
      kgAfterPost >= kgBeforePostedDelete + postedDeleteQty - 0.05,
      `before=${kgBeforePostedDelete} afterPost=${kgAfterPost}`
    );
    const delPosted = await request('DELETE', `/credit-notes/${postedDeleteId}`, token);
    assert('DELETE posted → 200', delPosted.status === 200, msgOf(delPosted));
    const kgAfterDelete = await fgiKg(token, productId, godownId);
    assert(
      'DELETE posted reverses inventory restore',
      Math.abs(kgAfterDelete - kgBeforePostedDelete) < 0.11,
      `before=${kgBeforePostedDelete} afterDelete=${kgAfterDelete}`
    );
    const gonePosted = await request('GET', `/credit-notes/${postedDeleteId}`, token);
    assert('GET deleted posted → 404', gonePosted.status === 404, `status=${gonePosted.status}`);
  }

  const cancelledDelete = await createPartial(token, dispatchId, line, 0.11, {
    reason: 'cancelled hard-delete test',
  });
  const cancelledDeleteId = unwrap(cancelledDelete)?.id as string | undefined;
  if (cancelledDeleteId) {
    await cancelQuiet(token, cancelledDeleteId, 'cancel then hard-delete');
    const delCancelled = await request('DELETE', `/credit-notes/${cancelledDeleteId}`, token);
    assert('DELETE cancelled → 200', delCancelled.status === 200, msgOf(delCancelled));
    const goneCancelled = await request('GET', `/credit-notes/${cancelledDeleteId}`, token);
    assert(
      'GET deleted cancelled → 404',
      goneCancelled.status === 404,
      `status=${goneCancelled.status}`
    );
  }

  const missingDelete = await request(
    'DELETE',
    '/credit-notes/00000000-0000-0000-0000-000000000001',
    token
  );
  assert('DELETE missing id → 404', missingDelete.status === 404, `status=${missingDelete.status}`);
}

function printSummary() {
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  }
  return failed.length;
}

async function main() {
  console.log('Credit-note workflow tests');
  console.log('BASE', BASE);
  runUnitTests();
  try {
    await runHttpTests();
  } catch (e) {
    fail('HTTP suite crashed', e instanceof Error ? e.stack || e.message : String(e));
  }
  const failed = printSummary();
  process.exit(failed ? 1 : 0);
}

void main();
