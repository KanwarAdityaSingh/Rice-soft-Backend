/**
 * Test Sales Party module and Sales Sauda with fresh data.
 * 1. Clears sales module data + sales_parties
 * 2. Tests Sales Party CRUD (create, list, getById, update)
 * 3. Creates a Sales Sauda using that sales party
 * Run: npx ts-node src/scripts/test-sales-party-and-sauda.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { clearSalesModuleData } from './clear-sales-module-data';

const BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

async function request(
  method: string,
  path: string,
  token?: string,
  body?: object
): Promise<{ status: number; data: any }> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
  logStep('=== Sales Party + Sales Sauda test (fresh data) ===');

  // --- 1. Clear existing sales module + sales_parties ---
  logStep('Step 1: Clearing sales module data and sales_parties...');
  await clearSalesModuleData();
  logStep('Cleared successfully.');

  // --- 2. Login ---
  logStep('Step 2: Login');
  const loginRes = await request('POST', '/auth/loginUser', undefined, {
    username: 'admin',
    password: 'admin123',
  });
  if (loginRes.status !== 200 || !loginRes.data?.data?.token) {
    logStep('LOGIN FAILED', loginRes);
    throw new Error('Login failed');
  }
  const token = loginRes.data.data.token;
  logStep('Logged in.');

  // --- 3. Sales Party: Create ---
  logStep('Step 3: Create Sales Party');
  const createPartyBody = {
    business_name: 'Fresh Test Sales Party Ltd',
    contact_persons: [
      { name: 'Primary Contact', phones: ['9999888877'], emails: ['freshparty@test.com'] },
    ],
    address: {
      street: '100 Test Avenue',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      country: 'India',
    },
    business_details: {
      pan_number: 'AABCF1234E',
      gst_number: '07AABCF1234E1Z5',
      business_type: 'company',
    },
    is_active: true,
  };
  const createPartyRes = await request('POST', '/sales-parties', token, createPartyBody);
  if (createPartyRes.status !== 200 && createPartyRes.status !== 201) {
    logStep('Create Sales Party FAILED', createPartyRes);
    throw new Error('Create sales party failed');
  }
  const salesPartyId = createPartyRes.data?.data?.id;
  if (!salesPartyId) {
    logStep('No id in create response', createPartyRes.data);
    throw new Error('Sales party id missing');
  }
  logStep('Sales Party created', { id: salesPartyId, business_name: createPartyBody.business_name });

  // --- 4. Sales Party: List ---
  logStep('Step 4: List Sales Parties');
  const listRes = await request('GET', '/sales-parties', token);
  if (listRes.status !== 200) {
    logStep('List Sales Parties FAILED', listRes);
    throw new Error('List sales parties failed');
  }
  const parties = listRes.data?.data || [];
  if (parties.length !== 1) {
    logStep('Expected 1 sales party, got', parties.length);
    throw new Error('List count mismatch');
  }
  if (parties[0].id !== salesPartyId) {
    logStep('List id mismatch', { expected: salesPartyId, got: parties[0].id });
    throw new Error('List id mismatch');
  }
  logStep('List OK', { count: parties.length });

  // --- 5. Sales Party: GetById ---
  logStep('Step 5: Get Sales Party by ID');
  const getRes = await request('GET', `/sales-parties/${salesPartyId}`, token);
  if (getRes.status !== 200) {
    logStep('Get Sales Party FAILED', getRes);
    throw new Error('Get sales party failed');
  }
  const party = getRes.data?.data;
  if (!party || party.business_name !== createPartyBody.business_name) {
    logStep('Get response mismatch', party);
    throw new Error('Get response mismatch');
  }
  logStep('GetById OK', { business_name: party.business_name });

  // --- 6. Sales Party: Update ---
  logStep('Step 6: Update Sales Party');
  const updatedName = 'Fresh Test Sales Party Ltd (Updated)';
  const updateRes = await request('PATCH', `/sales-parties/${salesPartyId}`, token, {
    business_name: updatedName,
  });
  if (updateRes.status !== 200) {
    logStep('Update Sales Party FAILED', updateRes);
    throw new Error('Update sales party failed');
  }
  const getAfterRes = await request('GET', `/sales-parties/${salesPartyId}`, token);
  if (getAfterRes.data?.data?.business_name !== updatedName) {
    logStep('Update not reflected', getAfterRes.data?.data);
    throw new Error('Update not reflected');
  }
  logStep('Update OK', { business_name: updatedName });

  // --- 7. Products (required for sales sauda) ---
  logStep('Step 7: Fetch products for Sales Sauda');
  const productsRes = await request('GET', '/products', token);
  const products = productsRes.data?.data || [];
  if (products.length === 0) {
    logStep('No products in DB. Skipping Sales Sauda creation (Sales Party test is complete).');
    logStep('=== Test completed: Sales Party CRUD OK ===');
    return;
  }
  const productId = products[0].id;
  logStep('Using product', { productId, name: products[0].name || products[0].id });

  // --- 8. Create Sales Sauda using the Sales Party ---
  logStep('Step 8: Create Sales Sauda with sales_party_id');
  const createSaudaRes = await request('POST', '/sales-saudas', token, {
    sales_party_id: salesPartyId,
    sauda_date: new Date().toISOString().split('T')[0],
    notes: 'Test sauda from sales-party test script',
    lines: [
      { product_id: productId, quantity: 1, quantity_unit: 'kg', rate: 100 },
    ],
  });
  if (createSaudaRes.status !== 201) {
    logStep('Create Sales Sauda FAILED', createSaudaRes);
    throw new Error('Create sales sauda failed');
  }
  const sauda = createSaudaRes.data?.data;
  const salesSaudaId = sauda?.id;
  if (!salesSaudaId) {
    logStep('No sales sauda id in response', createSaudaRes.data);
    throw new Error('Sales sauda id missing');
  }
  if (sauda?.sales_party_id !== salesPartyId) {
    logStep('Sales sauda sales_party_id mismatch', { expected: salesPartyId, got: sauda?.sales_party_id });
    throw new Error('sales_party_id mismatch');
  }
  logStep('Sales Sauda created', { id: salesSaudaId, sales_party_id: sauda?.sales_party_id, status: sauda?.status });

  // --- 9. Get Sales Sauda by ID ---
  logStep('Step 9: Get Sales Sauda by ID');
  const getSaudaRes = await request('GET', `/sales-saudas/${salesSaudaId}`, token);
  if (getSaudaRes.status !== 200) {
    logStep('Get Sales Sauda FAILED', getSaudaRes);
    throw new Error('Get sales sauda failed');
  }
  const saudaDetail = getSaudaRes.data?.data;
  if (saudaDetail?.sales_party_id !== salesPartyId || saudaDetail?.lines?.length !== 1) {
    logStep('Get sauda mismatch', saudaDetail);
    throw new Error('Get sauda mismatch');
  }
  logStep('Get Sales Sauda OK', { lines: saudaDetail?.lines?.length });

  // --- 10. Finalize Sales Sauda ---
  logStep('Step 10: Finalize Sales Sauda');
  const finalizeRes = await request('POST', `/sales-saudas/${salesSaudaId}/finalize`, token);
  if (finalizeRes.status !== 200) {
    logStep('Finalize FAILED', finalizeRes);
    throw new Error('Finalize failed');
  }
  const finalized = finalizeRes.data?.data;
  logStep('Sales Sauda finalized', { order_number: finalized?.order_number, status: finalized?.status });

  logStep('=== Test completed: Sales Party CRUD + Sales Sauda with Sales Party OK ===');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
