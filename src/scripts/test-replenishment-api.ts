/**
 * End-to-end HTTP tests for godown replenishment.
 *
 * Requires the API (default http://localhost:3000/api/v1) and admin login.
 * Seeds isolated FGI for a new product so existing stock is not used as the baseline.
 *
 *   npm run test:replenishment-api
 */
import dotenv from 'dotenv';
dotenv.config();

import { db } from '../database/connection';

const BASE = process.env.TEST_BASE_URL || process.env.API_BASE || 'http://localhost:3000/api/v1';
const ADMIN_USER = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORDS = [
  process.env.TEST_ADMIN_PASSWORD,
  process.env.ADMIN_PASSWORD,
  'admin123',
].filter((p): p is string => Boolean(p));

type Result = { status: number; data: any };
type Case = { name: string; ok: boolean; detail?: string };

const results: Case[] = [];
const RECEIVING_PLACEHOLDER = 'https://example.com/repl-e2e-receiving-placeholder';

const created = {
  fgiIds: [] as string[],
  dispatchIds: [] as string[],
  saudaIds: [] as string[],
  planIds: [] as string[],
  gatePatchIds: [] as string[],
};

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

function almostEqual(a: number, b: number, eps = 1): boolean {
  return Math.abs(a - b) <= eps;
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function unwrap(res: Result): any {
  const d = res.data?.data ?? res.data;
  if (Array.isArray(d)) return d;
  return d;
}

function itemsOf(res: Result): any[] {
  const d = unwrap(res);
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
}

function msgOf(res: Result): string {
  return (
    res.data?.message ||
    res.data?.error ||
    (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)?.slice(0, 500))
  );
}

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object
): Promise<Result> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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

function gst07(): string {
  const core = Date.now().toString().slice(-10).replace(/[6-9]/g, 'A');
  const pan = `AAAAA${core.slice(0, 4)}A`.slice(0, 10);
  return `07${pan}1Z5`;
}

async function cleanup() {
  for (const id of created.dispatchIds) {
    try {
      await db.query(
        `UPDATE invoice_dispatches SET status = 'cancelled' WHERE id = $1 AND status = 'draft'`,
        [id]
      );
    } catch {
      /* ignore */
    }
  }
  if (created.fgiIds.length > 0) {
    try {
      await db.query(
        `DELETE FROM invoice_dispatch_allocations
          WHERE finished_goods_inventory_id = ANY($1::uuid[])`,
        [created.fgiIds]
      );
      await db.query(`DELETE FROM finished_goods_inventory WHERE id = ANY($1::uuid[])`, [
        created.fgiIds,
      ]);
    } catch {
      /* ignore */
    }
  }
  if (created.gatePatchIds.length > 0) {
    try {
      await db.query(
        `UPDATE invoice_dispatches
            SET receiving_doc_image_url = NULL
          WHERE id = ANY($1::uuid[])
            AND receiving_doc_image_url = $2`,
        [created.gatePatchIds, RECEIVING_PLACEHOLDER]
      );
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  console.log(`\nReplenishment API tests\nBase: ${BASE}\n`);

  const health = await request('GET', '/health');
  assert('GET /health', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    fail('HTTP suite skipped', `API not reachable at ${BASE}`);
    return;
  }

  const unauthStock = await request(
    'GET',
    '/replenishment/stock?godown_id=00000000-0000-0000-0000-000000000001'
  );
  assert(
    'GET /replenishment/stock without token → 401',
    unauthStock.status === 401,
    `status=${unauthStock.status}`
  );
  const unauthLedger = await request(
    'GET',
    '/replenishment/ledger?godown_id=00000000-0000-0000-0000-000000000001'
  );
  assert(
    'GET /replenishment/ledger without token → 401',
    unauthLedger.status === 401,
    `status=${unauthLedger.status}`
  );
  const unauthPreview = await request('POST', '/replenishment/preview', undefined, {
    godown_id: '00000000-0000-0000-0000-000000000001',
    sales_sauda_ids: [],
    mode: 'recommend_truck',
  });
  assert(
    'POST /replenishment/preview without token → 401',
    unauthPreview.status === 401,
    `status=${unauthPreview.status}`
  );
  const unauthPlans = await request('POST', '/replenishment/plans', undefined, {
    godown_id: '00000000-0000-0000-0000-000000000001',
    sales_sauda_ids: [],
    mode: 'recommend_truck',
  });
  assert(
    'POST /replenishment/plans without token → 401',
    unauthPlans.status === 401,
    `status=${unauthPlans.status}`
  );

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

  const missingGodown = await request('GET', '/replenishment/stock', token);
  assert(
    'GET /stock without godown_id → 400',
    missingGodown.status === 400,
    `status=${missingGodown.status}`
  );

  const godowns = itemsOf(await request('GET', '/godowns?limit=100', token));
  const invoiceable =
    godowns.find((g: any) => {
      const gst = String(g.gst_number || '').toUpperCase();
      return g.is_active !== false && (gst.startsWith('06') || gst.startsWith('07'));
    }) || godowns.find((g: any) => g.is_active !== false);

  let destGodownId = invoiceable?.id as string | undefined;
  if (!destGodownId) {
    const createdGodown = await request('POST', '/godowns', token, {
      name: `Repl Test Dest ${Date.now()}`,
      gst_number: gst07(),
      address: {
        street: 'Repl Street',
        city: 'TestCity',
        state: 'DL',
        pincode: '110001',
        country: 'India',
      },
      contact_persons: [{ name: 'WH', phones: ['9999900001'] }],
    });
    destGodownId = unwrap(createdGodown)?.id;
    assert(
      'Create destination godown',
      createdGodown.status === 201 && Boolean(destGodownId),
      msgOf(createdGodown)
    );
  } else {
    pass('Using existing destination godown', destGodownId);
  }
  if (!destGodownId) return;

  let otherGodownId = godowns.find((g: any) => g.id !== destGodownId && g.is_active !== false)?.id as
    | string
    | undefined;
  if (!otherGodownId) {
    const g2 = await request('POST', '/godowns', token, {
      name: `Repl Test Src ${Date.now()}`,
      gst_number: gst07(),
      address: {
        street: 'Mill Street',
        city: 'TestCity',
        state: 'HR',
        pincode: '122001',
        country: 'India',
      },
      contact_persons: [{ name: 'Mill', phones: ['9999900002'] }],
    });
    otherGodownId = unwrap(g2)?.id;
  }
  assert('Has a second godown for transfer sauda', Boolean(otherGodownId));

  const parties = itemsOf(await request('GET', '/sales-parties?limit=20', token));
  let salesPartyId = parties[0]?.id as string | undefined;
  if (!salesPartyId) {
    const party = await request('POST', '/sales-parties', token, {
      business_name: `Repl Party ${Date.now()}`,
      contact_persons: [{ name: 'Buyer', phones: ['9876500111'], emails: ['repl@test.local'] }],
      address: {
        street: '1 Buyer St',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      },
      business_details: { pan_number: 'ABCDE1234F', gst_number: '27AABCU9603R1ZM', business_type: 'company' },
      registration_type: 'registered',
      is_active: true,
    });
    salesPartyId = unwrap(party)?.id;
    assert('Create sales party', Boolean(salesPartyId), msgOf(party));
  } else {
    pass('Using existing sales party', salesPartyId);
  }
  if (!salesPartyId) return;

  const brands = itemsOf(await request('GET', '/brands?status=active&limit=50', token));
  let brandId = (brands.find((b: any) => b.status === 'active') || brands[0])?.id as
    | string
    | undefined;
  if (!brandId) {
    const suffix = Date.now().toString().slice(-6);
    const brand = await request('POST', '/brands', token, {
      name: `ReplBrand${suffix}`,
      code_prefix: `RB${suffix}`.slice(0, 20),
      status: 'active',
    });
    brandId = unwrap(brand)?.id;
  }
  assert('Has active brand for product', Boolean(brandId), brandId);
  if (!brandId) return;

  const materials = itemsOf(
    await request('GET', '/packaging-materials?status=active&limit=50', token)
  );
  let materialId = (materials.find((m: any) => m.status === 'active') || materials[0])?.id as
    | string
    | undefined;
  if (!materialId) {
    const mat = await request('POST', '/packaging-materials', token, {
      name: `Repl PP ${Date.now()}`,
      status: 'active',
    });
    materialId = unwrap(mat)?.id;
  }
  assert('Has active packaging material', Boolean(materialId));
  if (!materialId) return;

  const product = await request('POST', '/products', token, {
    name: `Repl SKU ${Date.now()}`,
    brand_id: brandId,
    rice_category: 'basmati',
    rice_variant: 'raw_basmati',
    hsn_code: '100630',
    bag_image_url: 'https://example.com/replenishment-bag.png',
  });
  const productId = unwrap(product)?.id as string | undefined;
  assert('Create isolated product', product.status === 201 && Boolean(productId), msgOf(product));
  if (!productId) return;

  const pkg25 = await request('POST', '/packaging', token, {
    product_id: productId,
    holding_capacity: 25,
    packaging_material_id: materialId,
  });
  const packaging25Id = unwrap(pkg25)?.id as string | undefined;
  assert('Create 25 kg packaging', pkg25.status === 201 && Boolean(packaging25Id), msgOf(pkg25));

  const pkg50 = await request('POST', '/packaging', token, {
    product_id: productId,
    holding_capacity: 50,
    packaging_material_id: materialId,
  });
  const packaging50Id = unwrap(pkg50)?.id as string | undefined;
  assert('Create 50 kg packaging', pkg50.status === 201 && Boolean(packaging50Id), msgOf(pkg50));
  if (!packaging25Id || !packaging50Id) return;

  const seed25 = await db.query<{ id: string }>(
    `INSERT INTO finished_goods_inventory
       (godown_id, product_id, packaging_id, batch_id, no_of_packets, total_weight)
     VALUES ($1, $2, $3, NULL, 100, 2500)
     RETURNING id`,
    [destGodownId, productId, packaging25Id]
  );
  created.fgiIds.push(seed25.rows[0].id);
  const seed50 = await db.query<{ id: string }>(
    `INSERT INTO finished_goods_inventory
       (godown_id, product_id, packaging_id, batch_id, no_of_packets, total_weight)
     VALUES ($1, $2, $3, NULL, 100, 5000)
     RETURNING id`,
    [destGodownId, productId, packaging50Id]
  );
  created.fgiIds.push(seed50.rows[0].id);
  pass('Seed FGI 100×25kg (2500 kg) + 100×50kg (5000 kg)');

  const trucks = await request('GET', '/replenishment/truck-sizes', token);
  const truckList = itemsOf(trucks);
  assert(
    'GET /truck-sizes 200 with configured sizes',
    trucks.status === 200 && truckList.length > 0,
    `count=${truckList.length}`
  );

  const stock = await request('GET', `/replenishment/stock?godown_id=${destGodownId}`, token);
  const stockItems = itemsOf(stock);
  const stock25 = stockItems.find(
    (r: any) => r.product_id === productId && r.packaging_id === packaging25Id
  );
  assert(
    'GET /stock shows seeded 25 kg FGI',
    stock.status === 200 && stock25 && almostEqual(num(stock25.fgi_kg), 2500),
    stock25 ? `fgi_kg=${stock25.fgi_kg} packets=${stock25.fgi_packets}` : msgOf(stock)
  );

  const ledgerEmpty = await request('GET', `/replenishment/ledger?godown_id=${destGodownId}&product_id=${productId}`, token);
  assert('GET /ledger 200', ledgerEmpty.status === 200, `status=${ledgerEmpty.status}`);

  async function createSaleSauda(qtyKg: number, notes: string): Promise<{ id: string; lineId: string } | null> {
    const createdSauda = await request('POST', '/sales-saudas', token, {
      sales_party_id: salesPartyId,
      sauda_type: 'ex',
      movement_type: 'sale',
      payment_terms: '15',
      sauda_date: todayYmd(),
      notes,
      lines: [
        {
          product_id: productId,
          packaging_id: packaging25Id,
          quantity: qtyKg,
          quantity_unit: 'kg',
          rate: 80,
          gst_percent: 5,
        },
      ],
    });
    const id = unwrap(createdSauda)?.id as string | undefined;
    if (!id) {
      fail(`Create sauda ${notes}`, msgOf(createdSauda));
      return null;
    }
    created.saudaIds.push(id);
    const finalized = await request('POST', `/sales-saudas/${id}/finalize`, token);
    if (finalized.status !== 200) {
      fail(`Finalize sauda ${notes}`, msgOf(finalized));
      return null;
    }
    const detail = unwrap(await request('GET', `/sales-saudas/${id}`, token));
    const lineId = (detail?.lines || [])[0]?.id as string | undefined;
    if (!lineId) {
      fail(`Sauda ${notes} has a line`, JSON.stringify(detail?.lines)?.slice(0, 200));
      return null;
    }
    return { id, lineId };
  }

  const saudaY = await createSaleSauda(2750, 'Y ordered 110 bags');
  const saudaX = await createSaleSauda(1250, 'X ordered 50 bags');
  assert('Create+finalize sauda Y (2750 kg)', Boolean(saudaY));
  assert('Create+finalize sauda X (1250 kg)', Boolean(saudaX));
  if (!saudaY || !saudaX) return;

  async function draftDispatch(saudaId: string, lineId: string, qtyKg: number, label: string) {
    const res = await request('POST', '/invoice-dispatches', token, {
      sales_sauda_id: saudaId,
      godown_id: destGodownId,
      dispatch_date: todayYmd(),
      lines: [{ sales_sauda_line_id: lineId, quantity: qtyKg }],
    });
    const id = unwrap(res)?.id as string | undefined;
    if (id) created.dispatchIds.push(id);
    assert(
      `Draft dispatch ${label}`,
      (res.status === 201 || res.status === 200) && Boolean(id),
      res.status >= 400 ? msgOf(res) : id
    );
    return id;
  }

  const eligibility = unwrap(
    await request('GET', '/invoice-dispatches/next-bill-eligibility', token)
  );
  if (eligibility && eligibility.allowed === false) {
    const blockerIds = (eligibility.blocked_by || [])
      .map((b: any) => b.id)
      .filter(Boolean) as string[];
    if (blockerIds.length > 0) {
      await db.query(
        `UPDATE invoice_dispatches
            SET receiving_doc_image_url = $2
          WHERE id = ANY($1::uuid[])
            AND receiving_doc_image_url IS NULL
            AND receiving_doc_pdf_url IS NULL`,
        [blockerIds, RECEIVING_PLACEHOLDER]
      );
      created.gatePatchIds.push(...blockerIds);
    }
    const eligibilityAfter = unwrap(
      await request('GET', '/invoice-dispatches/next-bill-eligibility', token)
    );
    assert(
      'Temporarily opened next-bill gate for e2e drafts',
      eligibilityAfter?.allowed === true,
      JSON.stringify(eligibilityAfter?.blocked_by)?.slice(0, 240)
    );
    if (eligibilityAfter?.allowed !== true) return;
  } else {
    pass('Invoice create allowed (document gate open)');
  }

  const draftYId = await draftDispatch(saudaY.id, saudaY.lineId, 750, 'Y 30 bags');
  const draftXId = await draftDispatch(saudaX.id, saudaX.lineId, 1000, 'X 40 bags');
  if (!draftYId || !draftXId) return;

  const previewY = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'recommend_truck',
  });
  const py = unwrap(previewY);
  const line25 = (py?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging25Id
  );
  const line50 = (py?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging50Id
  );

  assert('POST /preview 200', previewY.status === 200, msgOf(previewY));
  assert(
    'ATP FGI 2500 kg on 25 kg SKU',
    Boolean(line25) && almostEqual(num(line25?.fgi_kg), 2500),
    `fgi=${line25?.fgi_kg}`
  );
  assert(
    'ATP drafts 1750 kg (Y 750 + X 1000)',
    Boolean(line25) && almostEqual(num(line25?.draft_kg), 1750),
    `draft=${line25?.draft_kg} drafts=${line25?.atp_drafts?.length}`
  );
  assert(
    'ATP available 750 kg (30 bags)',
    Boolean(line25) && almostEqual(num(line25?.available_kg), 750) && num(line25?.available_packets) === 30,
    `available=${line25?.available_kg}`
  );
  assert(
    'Demand remaining Y = 2000 kg (80 bags)',
    Boolean(line25) && almostEqual(num(line25?.demand_kg), 2000),
    `demand=${line25?.demand_kg}`
  );
  assert(
    'Gap 1250 kg (50 bags) — Line A',
    Boolean(line25) && almostEqual(num(line25?.gap_kg), 1250) && num(line25?.gap_packets) === 50,
    `gap=${line25?.gap_kg} tonnes_A=${py?.totals?.tonnes_for_orders}`
  );
  assert(
    '25 kg demand does not consume 50 kg stock',
    Boolean(line50) && almostEqual(num(line50?.gap_kg), 0) && num(line50?.fgi_kg) >= 5000,
    `50kg fgi=${line50?.fgi_kg} gap=${line50?.gap_kg}`
  );
  assert(
    'ATP lists both draft invoices',
    Array.isArray(line25?.atp_drafts) && line25.atp_drafts.length >= 2,
    `count=${line25?.atp_drafts?.length}`
  );
  assert(
    'Demand saudas include Y remaining',
    Array.isArray(line25?.demand_saudas) &&
      line25.demand_saudas.some((s: any) => s.sales_sauda_id === saudaY.id),
    JSON.stringify(line25?.demand_saudas)?.slice(0, 180)
  );
  assert(
    'Line A tonnes is 1.25',
    almostEqual(num(py?.totals?.tonnes_for_orders), 1.25, 0.01),
    `A=${py?.totals?.tonnes_for_orders}`
  );

  const previewBoth = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id, saudaX.id],
    mode: 'recommend_truck',
  });
  const bothLine = (unwrap(previewBoth)?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging25Id
  );
  assert(
    'Preview Y+X remaining = 2250 kg (Y 2000 + X 250)',
    previewBoth.status === 200 && Boolean(bothLine) && almostEqual(num(bothLine?.demand_kg), 2250),
    `demand=${bothLine?.demand_kg} status=${previewBoth.status}`
  );
  assert(
    'Snap-up Line A is a configured truck size',
    py?.totals?.truck_snap_orders?.snap_up_tonnes != null &&
      Array.isArray(py?.truck_sizes) &&
      py.truck_sizes.includes(py.totals.truck_snap_orders.snap_up_tonnes),
    `snap=${py?.totals?.truck_snap_orders?.snap_up_tonnes} sizes=${JSON.stringify(py?.truck_sizes)}`
  );

  const noTonnes = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'fill_truck',
  });
  assert('fill_truck without truck_tonnes → 400', noTonnes.status === 400, `status=${noTonnes.status}`);

  const fill = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'fill_truck',
    truck_tonnes: 16,
  });
  const fv = unwrap(fill);
  const fill25 = (fv?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging25Id
  );
  assert('fill_truck 16 T 200', fill.status === 200, msgOf(fill));
  assert(
    '16 T fill puts Y gap (50 bags) on the truck first',
    Boolean(fill25) && num(fill25?.for_orders_packets) === 50 && almostEqual(num(fill25?.for_orders_kg), 1250),
    `for_orders_packets=${fill25?.for_orders_packets}`
  );
  assert(
    '16 T capacity 16000 kg',
    almostEqual(num(fv?.fill_truck?.capacity_kg), 16000),
    `cap=${fv?.fill_truck?.capacity_kg}`
  );

  if (otherGodownId) {
    const transfer = await request('POST', '/sales-saudas', token, {
      sauda_type: 'ex',
      movement_type: 'godown_transfer',
      from_godown_id: otherGodownId,
      to_godown_id: destGodownId,
      sauda_date: todayYmd(),
      notes: 'replenishment transfer reject test',
      lines: [
        {
          product_id: productId,
          packaging_id: packaging25Id,
          quantity: 100,
          quantity_unit: 'kg',
          rate: 1,
          gst_percent: 0,
        },
      ],
    });
    let transferId = unwrap(transfer)?.id as string | undefined;
    if (!transferId) {
      const fy =
        unwrap(await request('GET', `/sales-saudas/${saudaY.id}`, token))?.financial_year ||
        '2026-27';
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO sales_saudas (
           sales_party_id, sauda_type, movement_type, from_godown_id, to_godown_id,
           status, sauda_date, financial_year, notes, amount
         ) VALUES ($1, 'ex', 'godown_transfer', $2, $3, 'draft', $4::date, $5, $6, 0)
         RETURNING id`,
        [
          salesPartyId,
          otherGodownId,
          destGodownId,
          todayYmd(),
          fy,
          'replenishment transfer reject test',
        ]
      );
      transferId = inserted.rows[0]?.id;
    }
    if (transferId) created.saudaIds.push(transferId);
    assert('Has godown_transfer sauda', Boolean(transferId), transferId ? transferId : msgOf(transfer));
    if (transferId) {
      const previewTransfer = await request('POST', '/replenishment/preview', token, {
        godown_id: destGodownId,
        sales_sauda_ids: [transferId],
        mode: 'recommend_truck',
      });
      assert(
        'Preview with transfer sauda → 400',
        previewTransfer.status === 400,
        `status=${previewTransfer.status} ${msgOf(previewTransfer)}`
      );
    }
  }

  const saved = await request('POST', '/replenishment/plans', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'recommend_truck',
    notes: 'e2e snapshot',
  });
  const planDetail = unwrap(saved);
  const planId = planDetail?.plan?.id as string | undefined;
  if (planId) created.planIds.push(planId);
  assert(
    'POST /plans saves snapshot',
    saved.status === 201 && Boolean(planId),
    saved.status >= 400 ? msgOf(saved) : planId
  );
  if (planId) {
    const got = await request('GET', `/replenishment/plans/${planId}`, token);
    assert(
      'GET /plans/:id returns frozen preview',
      got.status === 200 && Boolean(unwrap(got)?.preview),
      `status=${got.status}`
    );
    const committed = await request('POST', `/replenishment/plans/${planId}/commit`, token);
    assert('Commit plan', committed.status === 200, msgOf(committed));
    const recommit = await request('POST', `/replenishment/plans/${planId}/commit`, token);
    assert('Commit already-committed plan → 400', recommit.status === 400, `status=${recommit.status}`);
    const cancelled = await request('POST', `/replenishment/plans/${planId}/cancel`, token);
    assert('Cancel committed plan', cancelled.status === 200, msgOf(cancelled));
  }

  const listed = await request('GET', `/replenishment/plans?godown_id=${destGodownId}`, token);
  assert('GET /plans lists for godown', listed.status === 200, `status=${listed.status}`);

  const confirmed = await request('POST', `/invoice-dispatches/${draftYId}/confirm`, token);
  assert('Confirm Y draft (sale leaves godown)', confirmed.status === 200, msgOf(confirmed));

  const stockAfter = await request('GET', `/replenishment/stock?godown_id=${destGodownId}`, token);
  const stock25After = itemsOf(stockAfter).find(
    (r: any) => r.product_id === productId && r.packaging_id === packaging25Id
  );
  assert(
    'GET /stock after confirm is 1750 kg (70 bags)',
    Boolean(stock25After) && almostEqual(num(stock25After?.fgi_kg), 1750),
    `fgi=${stock25After?.fgi_kg}`
  );

  const previewAfter = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'recommend_truck',
  });
  const pa = unwrap(previewAfter);
  const lineAfter = (pa?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging25Id
  );
  assert(
    'After confirm: FGI 1750, only X draft 1000, available 750',
    Boolean(lineAfter) &&
      almostEqual(num(lineAfter?.fgi_kg), 1750) &&
      almostEqual(num(lineAfter?.draft_kg), 1000) &&
      almostEqual(num(lineAfter?.available_kg), 750),
    `fgi=${lineAfter?.fgi_kg} draft=${lineAfter?.draft_kg} avail=${lineAfter?.available_kg}`
  );
  assert(
    'Y remaining still 2000 (confirm does not free remaining)',
    Boolean(lineAfter) && almostEqual(num(lineAfter?.demand_kg), 2000),
    `demand=${lineAfter?.demand_kg}`
  );

  const ledgerAfter = await request(
    'GET',
    `/replenishment/ledger?godown_id=${destGodownId}&product_id=${productId}&source_type=sales_dispatch`,
    token
  );
  const list = itemsOf(ledgerAfter);
  assert(
    'Ledger shows sales_dispatch after confirm',
    ledgerAfter.status === 200 &&
      list.some((e: any) => e.source_type === 'sales_dispatch' && num(e.quantity_change) < 0),
    `rows=${list.length}`
  );

  const deleteX = await request('DELETE', `/invoice-dispatches/${draftXId}`, token);
  assert(
    'Delete leftover X draft (drafts are deleted, not cancelled)',
    deleteX.status === 200 || deleteX.status === 204,
    msgOf(deleteX)
  );
  created.dispatchIds = created.dispatchIds.filter((id) => id !== draftXId);

  const previewFreed = await request('POST', '/replenishment/preview', token, {
    godown_id: destGodownId,
    sales_sauda_ids: [saudaY.id],
    mode: 'recommend_truck',
  });
  const pf = (unwrap(previewFreed)?.lines || []).find(
    (l: any) => l.product_id === productId && l.packaging_id === packaging25Id
  );
  assert(
    'After cancel X draft: ATP draft_kg 0, available = FGI',
    Boolean(pf) && almostEqual(num(pf?.draft_kg), 0) && almostEqual(num(pf?.available_kg), num(pf?.fgi_kg)),
    `draft=${pf?.draft_kg} avail=${pf?.available_kg} fgi=${pf?.fgi_kg}`
  );

  const cancelY = await request('POST', `/invoice-dispatches/${draftYId}/cancel`, token, {
    reason: 'replenishment e2e cleanup',
  });
  assert(
    'Cancel confirmed Y so seeded FGI can be removed',
    cancelY.status === 200,
    msgOf(cancelY)
  );
}

main()
  .catch((e) => {
    fail('Unhandled error', e instanceof Error ? e.message : String(e));
  })
  .finally(async () => {
    await cleanup();
    try {
      await db.close();
    } catch {
      /* ignore */
    }
    const failed = results.filter((r) => !r.ok).length;
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
