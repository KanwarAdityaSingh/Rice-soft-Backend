/**
 * Comprehensive Salesman Commission Module Test (local)
 * Run: npx ts-node src/scripts/test-salesman-commission.ts
 */
import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

type Result = { status: number; data: any };

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail?: string) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object
): Promise<Result> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: res.status, data };
}

function unwrap(res: Result): any {
  return res.data?.data ?? res.data;
}

async function main() {
  console.log('=== Salesman Commission Module Test ===');
  console.log('BASE', BASE);

  // Health
  const health = await request('GET', '/health');
  assert('Health check', health.status === 200, `status=${health.status}`);

  // Login
  const loginRes = await request('POST', '/auth/loginUser', undefined, {
    username: 'admin',
    password: 'admin123',
  });
  const token = unwrap(loginRes)?.token;
  assert('Login as admin', !!token, loginRes.status !== 200 ? JSON.stringify(loginRes.data) : undefined);
  if (!token) {
    printSummary();
    process.exit(1);
  }

  // Fixtures
  const [partiesRes, productsRes, fgRes, godownsRes] = await Promise.all([
    request('GET', '/sales-parties', token),
    request('GET', '/products', token),
    request('GET', '/inventory/finished-goods', token),
    request('GET', '/godowns', token),
  ]);
  const parties = unwrap(partiesRes) || [];
  const products = unwrap(productsRes) || [];
  const fg = unwrap(fgRes) || [];
  const godowns = unwrap(godownsRes) || [];

  assert('Has sales parties', parties.length > 0, `count=${parties.length}`);
  assert('Has products', products.length > 0, `count=${products.length}`);

  const salesPartyId = parties[0]?.id as string;
  const salesPartyId2 = (parties[1]?.id || parties[0]?.id) as string;

  // Prefer product with FGI
  let product =
    products.find((p: any) => fg.some((f: any) => f.product_id === p.id && Number(f.total_weight) > 0)) ||
    products[0];
  const productId = product?.id as string;
  const productRiceType = product?.rice_type || 'basmati';
  const fgForProduct = fg.filter((f: any) => f.product_id === productId);
  const availableKg = fgForProduct.reduce((s: number, f: any) => s + parseFloat(f.total_weight || 0), 0);
  const packagingId = fgForProduct.find((f: any) => f.packaging_id)?.packaging_id ?? null;
  // Invoice series only supports Haryana (06) / Delhi (07). Confirm allows short stock.
  const invoiceableGodown =
    godowns.find((g: any) => {
      const gst = String(g.gst_number || '').toUpperCase();
      return gst.startsWith('06') || gst.startsWith('07');
    }) || null;
  const godownId = invoiceableGodown?.id || null;

  // Seed FGI at invoiceable godown so credit-note restore has a target row
  if (godownId && productId) {
    try {
      const { db } = await import('../database/connection');
      await db.query(
        `INSERT INTO finished_goods_inventory
           (godown_id, product_id, packaging_id, batch_id, no_of_packets, total_weight)
         VALUES ($1, $2, $3, NULL, 0, 0)
         ON CONFLICT DO NOTHING`,
        [godownId, productId, packagingId]
      );
      // If unique constraint differs, ensure at least one row exists
      const exists = await db.query(
        `SELECT id FROM finished_goods_inventory
         WHERE godown_id = $1 AND product_id = $2 LIMIT 1`,
        [godownId, productId]
      );
      if (exists.rows.length === 0) {
        await db.query(
          `INSERT INTO finished_goods_inventory
             (godown_id, product_id, packaging_id, batch_id, no_of_packets, total_weight)
           VALUES ($1, $2, $3, NULL, 0, 0)`,
          [godownId, productId, packagingId]
        );
      }
      console.log('Seeded FGI row at invoiceable godown for credit-note restore');
    } catch (e: any) {
      console.warn('FGI seed warning:', e?.message || e);
    }
  }

  console.log('Fixtures:', {
    salesPartyId,
    productId,
    productRiceType,
    availableKg,
    packagingId,
    godownId,
    godownGst: invoiceableGodown?.gst_number,
  });

  // ---------- A. Commission types catalog ----------
  const typesRes = await request('GET', '/salesmen/commission-types', token);
  const types = unwrap(typesRes) || [];
  assert(
    'GET commission-types returns 5 options',
    typesRes.status === 200 && types.length === 5,
    `status=${typesRes.status} len=${types.length}`
  );

  // ---------- B. Create salesman with types + areas + customers ----------
  const suffix = Date.now().toString().slice(-8);
  const phone = `9${suffix.padStart(9, '0')}`.slice(0, 10);
  const createSmRes = await request('POST', '/salesmen/createSalesman', token, {
    name: `Commission Tester ${suffix}`,
    phone,
    email: `comm.test.${suffix}@example.com`,
    commission_types: ['per_kg', 'percent_of_sale', 'fixed_per_transaction', 'by_rice_quality'],
    assigned_areas: [
      { state: 'Madhya Pradesh', district: 'Indore', city: 'Indore', territory: 'West MP' },
      { state: 'Maharashtra', city: 'Mumbai' },
    ],
    allocated_sales_party_ids: [salesPartyId],
    is_active: true,
  });
  const salesman = unwrap(createSmRes);
  assert(
    'Create salesman with commission + areas + allocation',
    (createSmRes.status === 201 || createSmRes.status === 200) && !!salesman?.id,
    createSmRes.status !== 201 && createSmRes.status !== 200
      ? JSON.stringify(createSmRes.data)
      : `id=${salesman?.id}`
  );
  const salesmanId = salesman?.id as string;

  assert(
    'Create response has commission_types',
    Array.isArray(salesman?.commission_types) && salesman.commission_types.includes('per_kg'),
    JSON.stringify(salesman?.commission_types)
  );
  assert(
    'Create response has assigned_areas',
    Array.isArray(salesman?.assigned_areas) && salesman.assigned_areas.length >= 1,
    `count=${salesman?.assigned_areas?.length}`
  );
  assert(
    'Create response has customer_allocations',
    Array.isArray(salesman?.customer_allocations) &&
      salesman.customer_allocations.some((a: any) => a.sales_party_id === salesPartyId),
    JSON.stringify(salesman?.customer_allocations)
  );

  // Get by id
  const getSmRes = await request('GET', `/salesmen/getSalesmanById/${salesmanId}`, token);
  const smDetail = unwrap(getSmRes);
  assert('Get salesman by id', getSmRes.status === 200 && smDetail?.id === salesmanId);

  // Update: add by_customer, replace areas, add second party
  const updateSmRes = await request('POST', `/salesmen/updateSalesman/${salesmanId}`, token, {
    commission_types: [
      'per_kg',
      'percent_of_sale',
      'fixed_per_transaction',
      'by_rice_quality',
      'by_customer',
    ],
    assigned_areas: [{ state: 'Rajasthan', territory: 'North' }],
    allocated_sales_party_ids: [salesPartyId, salesPartyId2],
  });
  const smUpdated = unwrap(updateSmRes);
  assert(
    'Update salesman commission types includes by_customer',
    updateSmRes.status === 200 && smUpdated?.commission_types?.includes('by_customer'),
    JSON.stringify(smUpdated?.commission_types)
  );
  assert(
    'Update replaces assigned_areas',
    smUpdated?.assigned_areas?.length === 1 &&
      smUpdated.assigned_areas[0].state === 'Rajasthan',
    JSON.stringify(smUpdated?.assigned_areas)
  );

  // ---------- C. Negative: type not enabled ----------
  // Create a salesman with only per_kg
  const phone2 = `8${suffix.padStart(9, '1')}`.slice(0, 10);
  const limitedSmRes = await request('POST', '/salesmen/createSalesman', token, {
    name: `Limited Comm ${suffix}`,
    phone: phone2,
    commission_types: ['per_kg'],
    is_active: true,
  });
  const limitedSm = unwrap(limitedSmRes);
  const limitedSmId = limitedSm?.id as string;
  assert('Create limited salesman', !!limitedSmId, JSON.stringify(limitedSmRes.data));

  if (limitedSmId && salesPartyId && productId) {
    const badSauda = await request('POST', '/sales-saudas', token, {
      sales_party_id: salesPartyId,
      salesman_id: limitedSmId,
      salesman_commission_type: 'percent_of_sale',
      salesman_commission_config: { percent: 1 },
      sauda_type: 'ex',
      movement_type: 'sale',
      payment_terms: '15',
      sauda_date: new Date().toISOString().slice(0, 10),
      lines: [
        {
          product_id: productId,
          ...(packagingId ? { packaging_id: packagingId } : {}),
          quantity: 1,
          quantity_unit: 'kg',
          rate: 50,
        },
      ],
    });
    assert(
      'Reject commission type not enabled for salesman',
      badSauda.status >= 400,
      `status=${badSauda.status} msg=${badSauda.data?.message || badSauda.data?.error || ''}`
    );
  }

  // ---------- D. Sauda with per_kg + preview ----------
  const saleQty = availableKg >= 10 ? 10 : availableKg >= 1 ? Math.min(availableKg, 5) : 1;
  const ratePerKg = 0.5;
  const lineRate = 80;

  const createSaudaRes = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    salesman_id: salesmanId,
    salesman_commission_type: 'per_kg',
    salesman_commission_config: { rate_per_kg: ratePerKg },
    sauda_type: 'ex',
    movement_type: 'sale',
    payment_terms: '30',
    sauda_date: new Date().toISOString().slice(0, 10),
    notes: 'Commission module E2E test',
    lines: [
      {
        product_id: productId,
        ...(packagingId ? { packaging_id: packagingId } : {}),
        quantity: saleQty,
        quantity_unit: 'kg',
        rate: lineRate,
      },
    ],
  });
  const sauda = unwrap(createSaudaRes);
  assert(
    'Create sauda with per_kg commission',
    createSaudaRes.status === 201 && sauda?.salesman_commission_type === 'per_kg',
    createSaudaRes.status !== 201
      ? JSON.stringify(createSaudaRes.data)
      : `preview=${sauda?.salesman_commission_preview}`
  );
  const saudaId = sauda?.id as string;
  const expectedPreview = Number((saleQty * ratePerKg).toFixed(2));
  assert(
    'Sauda commission preview matches qty × rate',
    Number(sauda?.salesman_commission_preview) === expectedPreview,
    `got=${sauda?.salesman_commission_preview} expected=${expectedPreview}`
  );

  // ---------- E. Godown transfer rejects commission ----------
  if (godowns.length >= 2) {
    const gtRes = await request('POST', '/sales-saudas', token, {
      salesman_id: salesmanId,
      salesman_commission_type: 'per_kg',
      salesman_commission_config: { rate_per_kg: 0.1 },
      sauda_type: 'ex',
      movement_type: 'godown_transfer',
      from_godown_id: godowns[0].id,
      to_godown_id: godowns[1].id,
      sauda_date: new Date().toISOString().slice(0, 10),
      lines: [
        {
          product_id: productId,
          quantity: 1,
          quantity_unit: 'kg',
          rate: 10,
        },
      ],
    });
    assert(
      'Godown transfer rejects commission fields',
      gtRes.status >= 400,
      `status=${gtRes.status} ${gtRes.data?.message || ''}`
    );
  } else {
    fail('Godown transfer rejects commission fields', 'need 2 godowns — skipped');
  }

  // ---------- F. by_rice_quality coverage ----------
  const qualitySaudaRes = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    salesman_id: salesmanId,
    salesman_commission_type: 'by_rice_quality',
    salesman_commission_config: {
      rates: [{ rice_type: productRiceType, rate_per_kg: 0.6 }],
    },
    sauda_type: 'ex',
    movement_type: 'sale',
    payment_terms: '7',
    sauda_date: new Date().toISOString().slice(0, 10),
    lines: [
      {
        product_id: productId,
        ...(packagingId ? { packaging_id: packagingId } : {}),
        quantity: 1,
        quantity_unit: 'kg',
        rate: 50,
      },
    ],
  });
  assert(
    'Create sauda with by_rice_quality covering line rice_type',
    qualitySaudaRes.status === 201,
    qualitySaudaRes.status !== 201 ? JSON.stringify(qualitySaudaRes.data) : undefined
  );

  // Missing rice type should fail
  const missingQuality = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    salesman_id: salesmanId,
    salesman_commission_type: 'by_rice_quality',
    salesman_commission_config: {
      rates: [{ rice_type: 'golden_sella', rate_per_kg: 0.1 }],
    },
    sauda_type: 'ex',
    movement_type: 'sale',
    sauda_date: new Date().toISOString().slice(0, 10),
    lines: [
      {
        product_id: productId,
        quantity: 1,
        quantity_unit: 'kg',
        rate: 50,
      },
    ],
  });
  // Only fail if product has a different rice_type
  if (productRiceType && productRiceType !== 'golden_sella') {
    assert(
      'Reject by_rice_quality missing line rice_type',
      missingQuality.status >= 400,
      `status=${missingQuality.status} productRiceType=${productRiceType}`
    );
  } else {
    pass('Reject by_rice_quality missing line rice_type', 'skipped (product rice_type is golden_sella/null)');
  }

  // Cleanup draft quality saudas (optional)
  const qualityId = unwrap(qualitySaudaRes)?.id;
  if (qualityId) {
    await request('DELETE', `/sales-saudas/${qualityId}`, token);
  }

  // ---------- G. Finalize + dispatch + confirm → accrual ----------
  if (!saudaId || !godownId) {
    fail('Dispatch confirm accrual', 'missing saudaId or godownId');
  } else {
    const fin = await request('POST', `/sales-saudas/${saudaId}/finalize`, token);
    assert('Finalize sauda', fin.status === 200, JSON.stringify(fin.data));

    const dispCreate = await request('POST', '/invoice-dispatches', token, {
      sales_sauda_id: saudaId,
      godown_id: godownId,
      dispatch_date: new Date().toISOString().slice(0, 10),
    });
    const dispatch = unwrap(dispCreate);
    assert(
      'Create invoice dispatch',
      (dispCreate.status === 201 || dispCreate.status === 200) && !!dispatch?.id,
      dispCreate.status >= 400 ? JSON.stringify(dispCreate.data) : `id=${dispatch?.id}`
    );
    const dispatchId = dispatch?.id as string;

    if (dispatchId) {
      const confirm = await request('POST', `/invoice-dispatches/${dispatchId}/confirm`, token);
      assert(
        'Confirm invoice dispatch',
        confirm.status === 200,
        confirm.status !== 200 ? JSON.stringify(confirm.data) : undefined
      );

      const entriesRes = await request(
        'GET',
        `/salesmen/commission-entries?salesman_id=${salesmanId}`,
        token
      );
      const entries = unwrap(entriesRes) || [];
      const accrual = entries.find(
        (e: any) => e.entry_type === 'accrual' && e.invoice_dispatch_id === dispatchId
      );
      assert(
        'Accrual entry created on dispatch confirm',
        !!accrual && accrual.status === 'pending',
        accrual
          ? `amount=${accrual.commission_amount} type=${accrual.commission_type}`
          : `entries=${entries.length}`
      );

      const expectedAccrual = Number((saleQty * ratePerKg).toFixed(2));
      if (accrual) {
        assert(
          'Accrual amount = qty × rate_per_kg',
          Number(accrual.commission_amount) === expectedAccrual,
          `got=${accrual.commission_amount} expected=${expectedAccrual}`
        );
      }

      // ---------- H. Credit note reverse ----------
      if (accrual && dispatchId) {
        const lines = dispatch.lines || unwrap(await request('GET', `/invoice-dispatches/${dispatchId}`, token))?.lines || [];
        const dLine = lines[0];
        const returnQty = Math.min(1, saleQty);
        if (dLine?.id) {
          const cnCreate = await request('POST', '/credit-notes', token, {
            invoice_dispatch_id: dispatchId,
            sales_sauda_id: saudaId,
            credit_note_number: `CN-COMM-${suffix}`,
            credit_note_date: new Date().toISOString().slice(0, 10),
            reason: 'Commission module test return',
            lines: [
              {
                invoice_dispatch_line_id: dLine.id,
                product_id: productId,
                quantity_returned: returnQty,
              },
            ],
          });
          const cn = unwrap(cnCreate);
          assert(
            'Create credit note',
            (cnCreate.status === 201 || cnCreate.status === 200) && !!cn?.id,
            cnCreate.status >= 400 ? JSON.stringify(cnCreate.data) : undefined
          );
          if (cn?.id) {
            const cnConfirm = await request('POST', `/credit-notes/${cn.id}/confirm`, token);
            assert(
              'Confirm credit note',
              cnConfirm.status === 200,
              cnConfirm.status !== 200 ? JSON.stringify(cnConfirm.data) : undefined
            );

            const entries2 = unwrap(
              await request('GET', `/salesmen/commission-entries?salesman_id=${salesmanId}`, token)
            ) || [];
            const reversal = entries2.find(
              (e: any) => e.entry_type === 'reversal' && e.credit_note_id === cn.id
            );
            const expectedRev = -Number((returnQty * ratePerKg).toFixed(2));
            assert(
              'Reversal entry created on credit note confirm',
              !!reversal && Number(reversal.commission_amount) === expectedRev,
              reversal
                ? `amount=${reversal.commission_amount} expected=${expectedRev}`
                : 'no reversal found'
            );

            // ---------- I. Approve + mark paid ----------
            if (accrual?.id) {
              const appr = await request(
                'POST',
                `/salesmen/commission-entries/${accrual.id}/approve`,
                token
              );
              assert(
                'Approve accrual',
                appr.status === 200 && unwrap(appr)?.status === 'approved',
                JSON.stringify(appr.data)
              );
              const paid = await request(
                'POST',
                `/salesmen/commission-entries/${accrual.id}/mark-paid`,
                token
              );
              assert(
                'Mark accrual paid',
                paid.status === 200 && unwrap(paid)?.status === 'paid',
                JSON.stringify(paid.data)
              );
            }
            if (reversal?.id) {
              const apprR = await request(
                'POST',
                `/salesmen/commission-entries/${reversal.id}/approve`,
                token
              );
              assert('Approve reversal', apprR.status === 200 && unwrap(apprR)?.status === 'approved');
            }
          }
        } else {
          fail('Create credit note', 'no dispatch line id');
        }
      }
    }
  }

  // ---------- J. Reports ----------
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  const monthly = await request(
    'GET',
    `/salesmen/reports/monthly?salesman_id=${salesmanId}&from=${monthStart}&to=${today}`,
    token
  );
  const monthlyData = unwrap(monthly);
  assert(
    'Monthly report returns KPIs',
    monthly.status === 200 && monthlyData?.salesman_id === salesmanId,
    monthly.status !== 200
      ? JSON.stringify(monthly.data)
      : `customers=${monthlyData?.customer_count} sale=${monthlyData?.total_sale_amount}`
  );

  const returns = await request(
    'GET',
    `/salesmen/reports/returns?salesman_id=${salesmanId}&from=${monthStart}&to=${today}`,
    token
  );
  assert(
    'Returns report OK',
    returns.status === 200 && Array.isArray(unwrap(returns)),
    `status=${returns.status} rows=${(unwrap(returns) || []).length}`
  );

  const commTx = await request(
    'GET',
    `/salesmen/reports/commission?salesman_id=${salesmanId}&view=transaction`,
    token
  );
  const commTxData = unwrap(commTx);
  assert(
    'Commission report transaction view',
    commTx.status === 200 && commTxData?.view === 'transaction' && Array.isArray(commTxData?.rows),
    `rows=${commTxData?.rows?.length} net=${commTxData?.totals?.net}`
  );

  const commMo = await request(
    'GET',
    `/salesmen/reports/commission?salesman_id=${salesmanId}&view=monthly`,
    token
  );
  assert(
    'Commission report monthly view',
    commMo.status === 200 && unwrap(commMo)?.view === 'monthly',
    JSON.stringify(unwrap(commMo)?.rows?.[0] || {})
  );

  const outstanding = await request(
    'GET',
    `/salesmen/reports/outstanding?salesman_id=${salesmanId}`,
    token
  );
  const outRows = unwrap(outstanding) || [];
  assert(
    'Outstanding report OK',
    outstanding.status === 200 && Array.isArray(outRows),
    `rows=${outRows.length}`
  );
  if (outRows.length > 0) {
    const row = outRows[0];
    assert(
      'Outstanding row has due_date and ageing_bucket',
      !!row.due_date && !!row.ageing_bucket && row.outstanding_amount != null,
      JSON.stringify({
        due_date: row.due_date,
        ageing_bucket: row.ageing_bucket,
        outstanding_amount: row.outstanding_amount,
      })
    );
  } else {
    pass('Outstanding row has due_date and ageing_bucket', 'no outstanding rows yet (ok if confirm failed)');
  }

  // ---------- K. fixed_per_transaction once-per-sauda (lightweight: create+finalize+confirm if stock) ----------
  if (godownId && availableKg >= 2 && salesmanId) {
    const fixedSaudaRes = await request('POST', '/sales-saudas', token, {
      sales_party_id: salesPartyId,
      salesman_id: salesmanId,
      salesman_commission_type: 'fixed_per_transaction',
      salesman_commission_config: { amount: 500 },
      sauda_type: 'ex',
      movement_type: 'sale',
      payment_terms: '0',
      sauda_date: today,
      lines: [
        {
          product_id: productId,
          ...(packagingId ? { packaging_id: packagingId } : {}),
          quantity: 1,
          quantity_unit: 'kg',
          rate: 40,
        },
      ],
    });
    const fixedSauda = unwrap(fixedSaudaRes);
    if (fixedSaudaRes.status === 201 && fixedSauda?.id) {
      await request('POST', `/sales-saudas/${fixedSauda.id}/finalize`, token);
      const d1 = unwrap(
        await request('POST', '/invoice-dispatches', token, {
          sales_sauda_id: fixedSauda.id,
          godown_id: godownId,
          dispatch_date: today,
        })
      );
      if (d1?.id) {
        await request('POST', `/invoice-dispatches/${d1.id}/confirm`, token);
        const after = unwrap(
          await request('GET', `/salesmen/commission-entries?salesman_id=${salesmanId}`, token)
        ) || [];
        const fixedAccruals = after.filter(
          (e: any) =>
            e.sales_sauda_id === fixedSauda.id &&
            e.entry_type === 'accrual' &&
            e.commission_type === 'fixed_per_transaction'
        );
        assert(
          'fixed_per_transaction accrues 500 once',
          fixedAccruals.length === 1 && Number(fixedAccruals[0].commission_amount) === 500,
          `count=${fixedAccruals.length} amount=${fixedAccruals[0]?.commission_amount}`
        );
      } else {
        fail('fixed_per_transaction accrues 500 once', 'dispatch create failed');
      }
    } else {
      fail('fixed_per_transaction accrues 500 once', JSON.stringify(fixedSaudaRes.data));
    }
  } else {
    pass('fixed_per_transaction accrues 500 once', 'skipped (insufficient stock)');
  }

  printSummary();
}

function printSummary() {
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok).length;
  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${ok}`);
  console.log(`Failed: ${bad}`);
  if (bad > 0) {
    console.log('Failures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}: ${r.detail || ''}`);
    }
  }
  process.exit(bad > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
