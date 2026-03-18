/**
 * Comprehensive Sales Flow Test Script
 * Run: npx ts-node src/scripts/test-sales-flow.ts
 * Uses admin / admin123 to login and exercises full sales flow + documents results.
 */

import dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object
): Promise<{ status: number; data: any; headers?: Headers }> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
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

const log: string[] = [];
function logStep(msg: string, detail?: any) {
  const line = detail !== undefined ? `${msg} ${JSON.stringify(detail)}` : msg;
  log.push(line);
  console.log(line);
}

async function main() {
  logStep('=== Sales flow test started ===');
  logStep('BASE URL', BASE);

  // 1. Login
  const loginRes = await request('POST', '/auth/loginUser', undefined, {
    username: 'admin',
    password: 'admin123',
  });
  if (loginRes.status !== 200 || !loginRes.data?.data?.token) {
    logStep('LOGIN FAILED', loginRes);
    throw new Error('Login failed');
  }
  const token = loginRes.data.data.token;
  logStep('Logged in as admin, token received');

  // 2. Fetch existing data
  const [productsRes, salesPartiesRes, fgRes, transportersRes, vehiclesRes] = await Promise.all([
    request('GET', '/products', token),
    request('GET', '/sales-parties', token),
    request('GET', '/inventory/finished-goods', token),
    request('GET', '/transporters', token),
    request('GET', '/vehicles', token),
  ]);

  const products = productsRes.data?.data || [];
  const salesParties = salesPartiesRes.data?.data || [];
  const fgInventory = fgRes.data?.data || [];
  const transporters = transportersRes.data?.data || [];
  const vehicles = vehiclesRes.data?.data || [];

  logStep('Existing data:', {
    products: products.length,
    salesParties: salesParties.length,
    finishedGoodsInventoryRows: fgInventory.length,
    transporters: transporters.length,
    vehicles: vehicles.length,
  });

  let salesPartyId = salesParties[0]?.id;
  if (!salesPartyId && salesParties.length === 0) {
    logStep('No sales parties. Creating a test sales party...');
    const createPartyRes = await request('POST', '/sales-parties', token, {
      business_name: 'Test Sales Party Pvt Ltd',
      contact_persons: [{ name: 'Test Contact', phones: ['9876543210'], emails: ['test@example.com'] }],
      address: { street: '123 Test St', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', country: 'India' },
      business_details: { pan_number: 'ABCDE1234F', gst_number: '27AABCU9603R1ZM', business_type: 'company' },
      is_active: true,
    });
    if (createPartyRes.status !== 200 && createPartyRes.status !== 201) {
      logStep('Create sales party FAILED', createPartyRes);
      throw new Error('Could not create test sales party');
    }
    salesPartyId = createPartyRes.data?.data?.id;
    logStep('Test sales party created', salesPartyId);
  }
  if (!salesPartyId) {
    logStep('No sales party ID. Test cannot create sales sauda.');
    process.exit(1);
  }

  const productIds = products.map((p: any) => p.id);
  if (productIds.length === 0) {
    logStep('No products. Test cannot create sales sauda.');
    process.exit(1);
  }

  const productId = productIds[0];
  const fgForProduct = fgInventory.filter((f: any) => f.product_id === productId);
  const availableKg = fgForProduct.reduce((s: number, f: any) => s + parseFloat(f.total_weight || 0), 0);
  // Use packaging from first FGI row that has packaging_id (tests bag/packaging flow)
  const packagingId = fgForProduct.find((f: any) => f.packaging_id)?.packaging_id ?? null;
  logStep('Product and FGI:', { productId, availableKg, fgRows: fgForProduct.length, packagingId });

  const transporterId = transporters[0]?.id || null;
  const vehicleId = vehicles[0]?.id || null;

  const saleQty = availableKg >= 10 ? 10 : availableKg >= 1 ? 1 : 0;
  if (saleQty <= 0) {
    logStep('No FGI for product; cannot test dispatch confirm. Creating sales sauda only.');
  }

  // 3. Create Sales Sauda (draft) – include packaging_id when FGI has it (bag flow)
  const saudaLine: { product_id: string; packaging_id?: string; quantity: number; quantity_unit: string; rate: number } = {
    product_id: productId,
    quantity: saleQty || 1,
    quantity_unit: 'kg',
    rate: 50,
  };
  if (packagingId) saudaLine.packaging_id = packagingId;
  const createSaudaRes = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    sauda_date: new Date().toISOString().split('T')[0],
    notes: 'Test sale from automated script',
    lines: [saudaLine],
  });
  if (createSaudaRes.status !== 201) {
    logStep('Create Sales Sauda FAILED', createSaudaRes);
    throw new Error('Create sales sauda failed');
  }
  const salesSauda = createSaudaRes.data?.data;
  const salesSaudaId = salesSauda?.id;
  logStep('Sales Sauda created', { id: salesSaudaId, status: salesSauda?.status });

  // 4. Finalize (Sales Order)
  const finalizeRes = await request('POST', `/sales-saudas/${salesSaudaId}/finalize`, token);
  if (finalizeRes.status !== 200) {
    logStep('Finalize FAILED', finalizeRes);
    throw new Error('Finalize failed');
  }
  const order = finalizeRes.data?.data;
  logStep('Sales Sauda finalized', { order_number: order?.order_number, status: order?.status });

  // 5. Create Invoice Dispatch
  const createDispatchRes = await request('POST', '/invoice-dispatches', token, {
    sales_sauda_id: salesSaudaId,
    internal_invoice_number: `INV-TEST-${Date.now()}`,
    dispatch_date: new Date().toISOString().split('T')[0],
    transporter_id: transporterId,
    vehicle_id: vehicleId,
    distance_km: 100,
    route_description: 'Test route: Warehouse to sales party',
  });
  if (createDispatchRes.status !== 201) {
    logStep('Create Invoice Dispatch FAILED', createDispatchRes);
    throw new Error('Create invoice dispatch failed');
  }
  const dispatch = createDispatchRes.data?.data;
  const dispatchId = dispatch?.id;
  logStep('Invoice Dispatch created', { id: dispatchId, status: dispatch?.status, party_name: dispatch?.party_name });

  // 6. Confirm Invoice Dispatch (inventory deduction)
  const fgBeforeConfirm = fgForProduct.reduce((s: number, f: any) => s + parseFloat(f.total_weight || 0), 0);
  const confirmRes = await request('POST', `/invoice-dispatches/${dispatchId}/confirm`, token);
  if (confirmRes.status !== 200) {
    logStep('Confirm Dispatch FAILED (may be expected if no FGI)', confirmRes);
  } else {
    logStep('Invoice Dispatch confirmed – inventory should be deducted');
  }

  const fgAfterRes = await request('GET', '/inventory/finished-goods', token);
  const fgAfter = (fgAfterRes.data?.data || []).filter((f: any) => f.product_id === productId);
  const fgAfterKg = fgAfter.reduce((s: number, f: any) => s + parseFloat(f.total_weight || 0), 0);
  logStep('FGI before confirm', fgBeforeConfirm);
  logStep('FGI after confirm', fgAfterKg);
  if (confirmRes.status === 200 && saleQty > 0) {
    logStep('Inventory reduced by', fgBeforeConfirm - fgAfterKg);
  }

  // 7. E-Invoice (stub)
  const eInvRes = await request('POST', `/invoice-dispatches/${dispatchId}/e-invoice`, token);
  if (eInvRes.status === 200) {
    logStep('E-Invoice (stub) generated', { irn: eInvRes.data?.data?.irn });
  } else {
    logStep('E-Invoice response', eInvRes);
  }

  // 8. E-Way Bill (stub)
  const ewayRes = await request('POST', `/invoice-dispatches/${dispatchId}/e-way-bill`, token, {
    vehicle_number: vehicles[0]?.vehicle_number || 'DL01AB1234',
    distance_km: 100,
    route: 'Warehouse to Customer',
    transporter_id: transporterId,
  });
  if (ewayRes.status === 200) {
    logStep('E-Way Bill (stub) generated', { eway_bill_number: ewayRes.data?.data?.eway_bill_number });
  } else {
    logStep('E-Way Bill response', ewayRes);
  }

  // 9. Inventory Ledger
  const ledgerRes = await request('GET', '/inventory-ledger?source_type=sales_dispatch&limit=10', token);
  const ledgerEntries = ledgerRes.data?.data || [];
  logStep('Inventory ledger entries (sales_dispatch)', ledgerEntries.length);
  if (ledgerEntries.length > 0) {
    logStep('Sample ledger entry', ledgerEntries[0]);
  }

  // 10. Credit Note (if we had a successful dispatch)
  if (confirmRes.status === 200 && dispatch?.lines?.length > 0) {
    const firstLine = dispatch.lines[0];
    const returnQty = Math.min(5, firstLine.quantity || 0);
    if (returnQty > 0) {
      const cnCreateRes = await request('POST', '/credit-notes', token, {
        invoice_dispatch_id: dispatchId,
        sales_sauda_id: salesSaudaId,
        credit_note_number: `CN-TEST-${Date.now()}`,
        credit_note_date: new Date().toISOString().split('T')[0],
        reason: 'Test return from automated script',
        lines: [
          {
            invoice_dispatch_line_id: firstLine.id,
            product_id: firstLine.product_id,
            quantity_returned: returnQty,
          },
        ],
      });
      if (cnCreateRes.status === 201) {
        const cnId = cnCreateRes.data?.data?.id;
        logStep('Credit Note created', cnId);
        const cnConfirmRes = await request('POST', `/credit-notes/${cnId}/confirm`, token);
        if (cnConfirmRes.status === 200) {
          logStep('Credit Note confirmed – inventory restored by', returnQty);
        } else {
          logStep('Credit Note confirm response', cnConfirmRes);
        }
      } else {
        logStep('Credit Note create response', cnCreateRes);
      }
    }
  }

  logStep('=== Sales flow test completed ===');
  return { log, salesSaudaId, dispatchId, salesPartyId, productId, saleQty };
}

main()
  .then((result) => {
    if (result && (result as any).log) {
      const fs = require('fs');
      const path = require('path');
      const outPath = path.join(__dirname, '../../test-sales-flow-report.txt');
      fs.writeFileSync(outPath, (result as any).log.join('\n'), 'utf8');
      console.log('Report written to', outPath);
    }
  })
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
