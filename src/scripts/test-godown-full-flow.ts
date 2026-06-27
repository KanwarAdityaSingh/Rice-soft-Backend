import 'dotenv/config';
import { db } from '../database/connection';
import { clearPurchaseModuleData } from './clear-purchase-module-data';
import { vendorDAO } from '../dao/vendor.dao';
import { brokerDAO } from '../dao/broker.dao';
import { transporterDAO } from '../dao/transporter.dao';
import { vehicleDAO } from '../dao/vehicle.dao';

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

type TestResult = {
  name: string;
  pass: boolean;
  details?: string;
};

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/v1';
const ADMIN_USERNAME = process.env.TEST_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'admin123';

async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  token?: string,
  body?: Record<string, unknown>,
  expectedStatus?: number
): Promise<{ status: number; json: ApiEnvelope<T> | any }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (expectedStatus !== undefined && response.status !== expectedStatus) {
    throw new Error(
      `${method} ${path} expected status ${expectedStatus}, got ${response.status}. Body: ${JSON.stringify(
        json
      )}`
    );
  }
  return { status: response.status, json };
}

async function ensureMasterData() {
  const adminResult = await db.query(
    `SELECT id FROM users WHERE username = 'admin' LIMIT 1`
  );
  if (adminResult.rows.length === 0) {
    throw new Error('Admin user not found. Run create-admin first.');
  }
  const adminId = adminResult.rows[0].id as string;

  const vendor = await vendorDAO.create({
    business_name: `Godown Test Purchaser ${Date.now()}`,
    contact_persons: [
      { name: 'Purchaser Contact', phones: ['9999999991'], emails: [`purchaser.${Date.now()}@test.local`] },
    ],
    address: {
      street: 'Street 1',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      country: 'India',
    },
    business_details: {
      gst_number: '27AABCT1234A1Z5',
      pan_number: 'AABCT1234A',
    },
    registration_type: 'registered',
    type: 'purchaser',
    is_active: true,
    created_by: adminId,
  });
  const purchaserId = vendor.id;

  const riceCodeName = `GODOWN_RICE_${Date.now()}`;
  const riceCodeResult = await db.query(
    `INSERT INTO rice_codes (rice_code_name, created_by) VALUES ($1, $2) RETURNING rice_code_id`,
    [riceCodeName, adminId]
  );
  const riceCodeId = riceCodeResult.rows[0].rice_code_id as string;

  const broker = await brokerDAO.create({
    business_name: `Godown Test Broker ${Date.now()}`,
    contact_persons: [
      { name: 'Broker Contact', phones: ['9999999992'], emails: [`broker.${Date.now()}@test.local`] },
    ],
    address: {
      street: 'Street 2',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      country: 'India',
    },
    business_details: {
      gst_number: '27AABCB1234C1Z3',
      pan_number: 'AABCB1234C',
    },
    type: 'purchase',
    is_active: true,
    created_by: adminId,
  });
  const brokerId = broker.id;

  const transporter = await transporterDAO.create({
    business_name: `Godown Test Transporter ${Date.now()}`,
    contact_persons: [
      { name: 'Transporter Contact', phones: ['9999999993'], emails: [`transporter.${Date.now()}@test.local`] },
    ],
    address: {
      street: 'Street 3',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      country: 'India',
    },
    transport_type: 'registered',
    is_active: true,
    created_by: adminId,
  });
  const transporterId = transporter.id;

  const vehicle = await vehicleDAO.create({
    vehicle_number: `MH12${Date.now().toString().slice(-6)}`,
    transporter_ids: [transporterId],
    is_active: true,
    created_by: adminId,
  });
  const vehicleId = vehicle.id;

  const recipeNameA = `GODOWN_RECIPE_A_${Date.now()}`;
  const recipeNameB = `GODOWN_RECIPE_B_${Date.now()}`;

  return {
    purchaserId,
    riceCodeId,
    brokerId,
    transporterId,
    vehicleId,
    recipeNameA,
    recipeNameB,
  };
}

async function run() {
  const results: TestResult[] = [];
  const push = (name: string, pass: boolean, details?: string) =>
    results.push({ name, pass, details });

  try {
    await clearPurchaseModuleData();
    push('Clear existing transactional data', true);
  } catch (error: any) {
    push('Clear existing transactional data', false, error.message);
    throw error;
  }

  // Compatibility hotfix for environments where older audit trigger function
  // still conflicts on (bag_type, bag_capacity) after godown segmentation.
  await db.query(`
    CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create_with_audit()
    RETURNS TRIGGER AS $$
    DECLARE
        v_bags_inventory_id UUID;
        v_old_filled_bags INTEGER;
    BEGIN
        SELECT id, filled_bags INTO v_bags_inventory_id, v_old_filled_bags
        FROM bags_inventory
        WHERE godown_id = NEW.godown_id
          AND bag_type = NEW.bag_type
          AND bag_capacity = NEW.bag_weight;

        IF v_bags_inventory_id IS NULL THEN
            v_old_filled_bags := 0;
        END IF;

        INSERT INTO bags_inventory (godown_id, bag_type, bag_capacity, filled_bags, created_by)
        VALUES (NEW.godown_id, NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
        ON CONFLICT (godown_id, bag_type, bag_capacity)
        DO UPDATE SET
            filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = NEW.created_by
        RETURNING id INTO v_bags_inventory_id;

        INSERT INTO bags_inventory_audit (
            bags_inventory_id,
            bag_type,
            bag_capacity,
            operation_type,
            field_changed,
            quantity_change,
            quantity_before,
            quantity_after,
            reason,
            reference_type,
            reference_id,
            kaanta_id,
            notes,
            created_by
        )
        VALUES (
            v_bags_inventory_id,
            NEW.bag_type,
            NEW.bag_weight,
            'addition',
            'filled_bags',
            NEW.no_of_bags,
            v_old_filled_bags,
            v_old_filled_bags + NEW.no_of_bags,
            'Filled bags received from kaanta weighing',
            'kaanta',
            NEW.id,
            NEW.id,
            'Kaanta Weighing | Bags Received: ' || NEW.no_of_bags || ' | Type: ' || UPPER(NEW.bag_type) || ' | Capacity: ' || NEW.bag_weight || ' kg',
            NEW.created_by
        );

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  push('Apply godown-aware kaanta bags trigger compatibility patch', true);

  await db.query(`
    CREATE OR REPLACE FUNCTION initialize_lot_inventory_with_audit()
    RETURNS TRIGGER AS $$
    DECLARE
        v_lot_inventory_id UUID;
    BEGIN
        INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by)
        VALUES (NEW.id, NEW.godown_id, NEW.received_weight, NEW.created_by)
        ON CONFLICT (lot_id) DO NOTHING
        RETURNING id INTO v_lot_inventory_id;

        IF v_lot_inventory_id IS NOT NULL THEN
            INSERT INTO lot_inventory_audit (
                lot_inventory_id,
                lot_id,
                operation_type,
                quantity_change,
                quantity_before,
                quantity_after,
                reason,
                reference_type,
                reference_id,
                notes,
                created_by
            )
            VALUES (
                v_lot_inventory_id,
                NEW.id,
                'addition',
                NEW.received_weight,
                0,
                NEW.received_weight,
                'Lot created from inward slip',
                'inward_slip_lot',
                NEW.id,
                'Initial Stock | Lot: ' || NEW.lot_number || ' | Received Weight: ' || NEW.received_weight || ' kg',
                NEW.created_by
            );
        END IF;

        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  push('Apply godown-aware lot inventory trigger compatibility patch', true);

  const master = await ensureMasterData();
  push('Seed fresh master data', true);

  const loginResp = await apiRequest<{ token: string }>(
    '/auth/loginUser',
    'POST',
    undefined,
    { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    200
  );
  const token = (loginResp.json?.data as any)?.token as string;
  if (!token) {
    throw new Error('Login succeeded but token missing');
  }
  push('Authenticate admin user', true);

  const ts = Date.now();
  const gstCoreA = ts.toString().slice(-10).padStart(10, '1');
  const gstCoreB = (ts + 1).toString().slice(-10).padStart(10, '2');
  const gstA = `27${gstCoreA}1Z1`;
  const gstB = `27${gstCoreB}1Z2`;
  const godownA = await apiRequest<any>(
    '/godowns',
    'POST',
    token,
    {
      name: 'Godown A',
      gst_number: gstA,
      address: {
        street: 'A Street',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        country: 'India',
      },
      google_maps_link: 'https://www.google.com/maps?q=19.076,72.8777',
      contact_persons: [
        { name: 'Warehouse Lead', phones: ['9876500001'], emails: ['lead-a@example.com'] },
      ],
    },
    201
  );
  const godownAId = godownA.json.data.id as string;

  const godownB = await apiRequest<any>(
    '/godowns',
    'POST',
    token,
    {
      name: 'Godown B',
      gst_number: gstB,
      address: {
        street: 'B Street',
        city: 'Navi Mumbai',
        state: 'MH',
        pincode: '400705',
        country: 'India',
      },
      google_maps_link: 'https://www.google.com/maps?q=19.033,73.0297',
      contact_persons: [{ name: 'Godown B Lead', phones: ['9876500002'] }],
    },
    201
  );
  const godownBId = godownB.json.data.id as string;
  push('Create two godowns via API', Boolean(godownAId && godownBId));

  const godownsListResp = await apiRequest<any[]>(`/godowns`, 'GET', token, undefined, 200);
  const godownsList = (godownsListResp.json.data || []) as Array<{ id: string }>;
  push(
    'GET /godowns lists created warehouses',
    godownsList.some((g) => g.id === godownAId) && godownsList.some((g) => g.id === godownBId)
  );

  const saudaA = await apiRequest<any>(
    '/saudas',
    'POST',
    token,
    {
      sauda_type: 'exgodown',
      rice_type: 'basmati',
      rice_code_id: master.riceCodeId,
      rate: 45.5,
      broker_id: master.brokerId,
      broker_commission: 1.5,
      broker_commission_type: 'percentage',
      quantity: 1000,
      cash_discount: 100,
      cash_discount_type: 'rupees',
      purchaser_id: master.purchaserId,
      status: 'active',
      is_dana_required: true,
      sauda_date: new Date().toISOString().slice(0, 10),
    },
    201
  );
  const saudaAId = saudaA.json.data.id as string;

  const saudaB = await apiRequest<any>(
    '/saudas',
    'POST',
    token,
    {
      sauda_type: 'for',
      rice_type: 'non_basmati',
      rice_code_id: master.riceCodeId,
      rate: 42,
      broker_id: master.brokerId,
      broker_commission: 2,
      broker_commission_type: 'percentage',
      quantity: 800,
      cash_discount: 50,
      cash_discount_type: 'rupees',
      purchaser_id: master.purchaserId,
      status: 'active',
      is_dana_required: true,
      sauda_date: new Date().toISOString().slice(0, 10),
    },
    201
  );
  const saudaBId = saudaB.json.data.id as string;
  push('Create saudas (provisional; godown only on physical flows)', Boolean(saudaAId && saudaBId));

  const ispA = await apiRequest<any>(
    '/inward-slip-passes',
    'POST',
    token,
    {
      sauda_ids: [saudaAId],
      godown_id: godownAId,
      date: new Date().toISOString().slice(0, 10),
      vehicle_id: master.vehicleId,
      party_name: 'Party A',
      transporter_id: master.transporterId,
      transportation_cost: 1200,
      status: 'pending',
    },
    201
  );
  const ispAId = ispA.json.data.id as string;

  const ispB = await apiRequest<any>(
    '/inward-slip-passes',
    'POST',
    token,
    {
      sauda_ids: [saudaBId],
      godown_id: godownBId,
      date: new Date().toISOString().slice(0, 10),
      vehicle_id: master.vehicleId,
      party_name: 'Party B',
      transporter_id: master.transporterId,
      transportation_cost: 1400,
      status: 'pending',
    },
    201
  );
  const ispBId = ispB.json.data.id as string;
  push('Create inward slip passes in both godowns', Boolean(ispAId && ispBId));

  const kaantaA = await apiRequest<any>(
    '/kaantas',
    'POST',
    token,
    {
      sauda_id: saudaAId,
      inward_slip_pass_id: ispAId,
      full_truck_weight: 300,
      empty_truck_weight: 100,
      said_sent_weight: 190,
      bag_weight: 50,
      no_of_bags: 4,
      bag_type: 'jute',
    },
    201
  );
  const kaantaAId = kaantaA.json.data.id as string;

  const kaantaB = await apiRequest<any>(
    '/kaantas',
    'POST',
    token,
    {
      sauda_id: saudaBId,
      inward_slip_pass_id: ispBId,
      full_truck_weight: 280,
      empty_truck_weight: 90,
      said_sent_weight: 180,
      bag_weight: 50,
      no_of_bags: 3,
      bag_type: 'pp',
    },
    201
  );
  const kaantaBId = kaantaB.json.data.id as string;
  push('Create kaantas in both godowns', Boolean(kaantaAId && kaantaBId));

  const ispsA = await apiRequest<any[]>(
    `/inward-slip-passes?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const ispsAData = (ispsA.json.data || []) as Array<{ id: string; godown_id: string }>;
  const ispsB = await apiRequest<any[]>(
    `/inward-slip-passes?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const ispsBData = (ispsB.json.data || []) as Array<{ id: string; godown_id: string }>;
  push(
    'GET /inward-slip-passes?godown_id= scopes passes',
    ispsAData.length === 1 &&
      ispsAData[0].id === ispAId &&
      ispsAData.every((p) => p.godown_id === godownAId) &&
      ispsBData.length === 1 &&
      ispsBData[0].id === ispBId &&
      ispsBData.every((p) => p.godown_id === godownBId)
  );

  const kaantasA = await apiRequest<any[]>(
    `/kaantas?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const kaantasAData = (kaantasA.json.data || []) as Array<{ id: string; godown_id: string }>;
  const kaantasB = await apiRequest<any[]>(
    `/kaantas?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const kaantasBData = (kaantasB.json.data || []) as Array<{ id: string; godown_id: string }>;
  push(
    'GET /kaantas?godown_id= scopes weighments',
    kaantasAData.length === 1 &&
      kaantasAData[0].id === kaantaAId &&
      kaantasAData.every((k) => k.godown_id === godownAId) &&
      kaantasBData.length === 1 &&
      kaantasBData[0].id === kaantaBId &&
      kaantasBData.every((k) => k.godown_id === godownBId)
  );

  const bagsA = await apiRequest<any[]>(
    `/inventory/bags?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const bagsB = await apiRequest<any[]>(
    `/inventory/bags?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const bagsAData = (bagsA.json.data || []) as Array<{ godown_id: string; bag_type: string }>;
  const bagsBData = (bagsB.json.data || []) as Array<{ godown_id: string; bag_type: string }>;
  push(
    'GET /inventory/bags?godown_id= is segregated (kaanta triggers)',
    bagsAData.some((b) => b.bag_type === 'jute' && b.godown_id === godownAId) &&
      bagsBData.some((b) => b.bag_type === 'pp' && b.godown_id === godownBId) &&
      bagsAData.every((b) => b.godown_id === godownAId) &&
      bagsBData.every((b) => b.godown_id === godownBId)
  );

  const lotsAResp = await apiRequest<any[]>(
    `/lots?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const lotsA = (lotsAResp.json.data || []) as any[];
  const lotsBResp = await apiRequest<any[]>(
    `/lots?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const lotsB = (lotsBResp.json.data || []) as any[];
  const lotAId = lotsA[0]?.id as string | undefined;
  const lotBId = lotsB[0]?.id as string | undefined;
  push(
    'Auto-create lots and filter by godown',
    Boolean(lotAId && lotBId && lotsA.every((l) => l.godown_id === godownAId) && lotsB.every((l) => l.godown_id === godownBId))
  );

  const lotInvA = await apiRequest<any[]>(
    `/inventory/lots?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const lotInvB = await apiRequest<any[]>(
    `/inventory/lots?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const lotInvAData = (lotInvA.json.data || []) as Array<{ godown_id: string; lot_id: string }>;
  const lotInvBData = (lotInvB.json.data || []) as Array<{ godown_id: string; lot_id: string }>;
  push(
    'GET /inventory/lots?godown_id= matches lot stock rows',
    lotInvAData.some((r) => r.lot_id === lotAId && r.godown_id === godownAId) &&
      lotInvBData.some((r) => r.lot_id === lotBId && r.godown_id === godownBId)
  );

  const recipeA = await apiRequest<any>(
    '/recipes',
    'POST',
    token,
    {
      recipe_name: master.recipeNameA,
      formula: [{ lot_id: lotAId, percentage: 100 }],
    },
    201
  );
  const recipeAId = recipeA.json.data.id as string;

  const recipeB = await apiRequest<any>(
    '/recipes',
    'POST',
    token,
    {
      recipe_name: master.recipeNameB,
      formula: [{ lot_id: lotBId, percentage: 100 }],
    },
    201
  );
  const recipeBId = recipeB.json.data.id as string;
  push('Create recipes per godown lots', Boolean(recipeAId && recipeBId));

  const batchGood = await apiRequest<any>(
    '/batches',
    'POST',
    token,
    {
      godown_id: godownAId,
      recipe_id: recipeAId,
      quantity: 50,
    },
    201
  );
  const batchAId = batchGood.json.data.id as string;
  push('Create batch with matching godown lots', Boolean(batchAId));

  const batchB = await apiRequest<any>(
    '/batches',
    'POST',
    token,
    {
      godown_id: godownBId,
      recipe_id: recipeBId,
      quantity: 40,
    },
    201
  );
  const batchBId = batchB.json.data.id as string;
  push('Create second batch in godown B', Boolean(batchBId));

  const batchBad = await apiRequest<any>(
    '/batches',
    'POST',
    token,
    {
      godown_id: godownAId,
      recipe_id: recipeBId,
      quantity: 10,
    }
  );
  push(
    'Reject batch with cross-godown lot recipe',
    batchBad.status >= 400,
    `status=${batchBad.status}`
  );

  // -------------------------
  // Sales + Dispatch + Inventory + Ledger + Credit Note
  // -------------------------
  const productA = await apiRequest<any>(
    '/products',
    'POST',
    token,
    {
      name: `GD-Product-A-${Date.now()}`,
      brand: 'Tamara',
      rice_type: 'basmati',
      description: 'Godown A product',
    },
    201
  );
  const productAId = productA.json.data.id as string;

  const productB = await apiRequest<any>(
    '/products',
    'POST',
    token,
    {
      name: `GD-Product-B-${Date.now()}`,
      brand: 'Hariom',
      rice_type: 'non_basmati',
      description: 'Godown B product',
    },
    201
  );
  const productBId = productB.json.data.id as string;
  push('Create products for sales/dispatch flow', Boolean(productAId && productBId));

  const packagingA = await apiRequest<any>(
    '/packaging',
    'POST',
    token,
    {
      product_id: productAId,
      holding_capacity: 10,
      packet_type: 'PP Bag',
      ordered_weight: 100,
      initial_packets: 200,
      godown_id: godownAId,
      empty_bag_weight_kg: 0.05,
      empty_bag_rate_per_kg: 80,
      empty_bag_gst_percent: 18,
    },
    201
  );
  const packagingAId = packagingA.json.data.id as string;
  const pkgAResp = packagingA.json.data as { packets_inventory?: Array<{ godown_id: string; available_quantity: number }> };
  const pkgAInvOk =
    Array.isArray(pkgAResp.packets_inventory) &&
    pkgAResp.packets_inventory.some(
      (p) => p.godown_id === godownAId && Number(p.available_quantity) >= 200
    );

  const packagingB = await apiRequest<any>(
    '/packaging',
    'POST',
    token,
    {
      product_id: productBId,
      holding_capacity: 10,
      packet_type: 'PP Bag',
      ordered_weight: 100,
      initial_packets: 200,
      godown_id: godownBId,
      empty_bag_weight_kg: 0.05,
      empty_bag_rate_per_kg: 80,
      empty_bag_gst_percent: 18,
    },
    201
  );
  const packagingBId = packagingB.json.data.id as string;
  const pkgBResp = packagingB.json.data as { packets_inventory?: Array<{ godown_id: string; available_quantity: number }> };
  const pkgBInvOk =
    Array.isArray(pkgBResp.packets_inventory) &&
    pkgBResp.packets_inventory.some(
      (p) => p.godown_id === godownBId && Number(p.available_quantity) >= 200
    );

  push(
    'POST /packaging with initial_packets + godown_id seeds packets_inventory',
    Boolean(packagingAId && packagingBId && pkgAInvOk && pkgBInvOk)
  );

  const packagingAGet = await apiRequest<any>(`/packaging/${packagingAId}`, 'GET', token, undefined, 200);
  const pkgGet = packagingAGet.json.data as { packets_inventory?: Array<{ godown_id: string }> };
  push(
    'GET /packaging/:id includes per-godown packets_inventory',
    Array.isArray(pkgGet.packets_inventory) && pkgGet.packets_inventory.some((p) => p.godown_id === godownAId)
  );

  const packetsInvA = await apiRequest<any[]>(
    `/inventory/packets?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const packetsInvB = await apiRequest<any[]>(
    `/inventory/packets?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const pktA = (packetsInvA.json.data || []) as Array<{ godown_id: string; packaging_id: string }>;
  const pktB = (packetsInvB.json.data || []) as Array<{ godown_id: string; packaging_id: string }>;
  push(
    'GET /inventory/packets?godown_id= lists empty-packet stock per warehouse',
    pktA.some((r) => r.packaging_id === packagingAId && r.godown_id === godownAId) &&
      pktB.some((r) => r.packaging_id === packagingBId && r.godown_id === godownBId)
  );

  await apiRequest<any>(
    `/batches/${batchAId}/products`,
    'POST',
    token,
    { product_id: productAId },
    200
  );
  await apiRequest<any>(
    `/batches/${batchBId}/products`,
    'POST',
    token,
    { product_id: productBId },
    200
  );
  push('Attach products to batches', true);

  await apiRequest<any>(
    `/batches/${batchAId}/packaging`,
    'POST',
    token,
    { product_id: productAId, packaging_id: packagingAId, quantity: 20 },
    200
  );
  await apiRequest<any>(
    `/batches/${batchBId}/packaging`,
    'POST',
    token,
    { product_id: productBId, packaging_id: packagingBId, quantity: 20 },
    200
  );
  push('Attach packaging to batches and generate finished goods', true);

  const fgAInitial = await apiRequest<any[]>(
    `/inventory/finished-goods?godown_id=${godownAId}&product_id=${productAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const fgBInitial = await apiRequest<any[]>(
    `/inventory/finished-goods?godown_id=${godownBId}&product_id=${productBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const fgAInitialWeight = Number((fgAInitial.json.data?.[0]?.total_weight ?? 0));
  const fgBInitialWeight = Number((fgBInitial.json.data?.[0]?.total_weight ?? 0));
  push('Finished goods inventory available in both godowns', fgAInitialWeight > 0 && fgBInitialWeight > 0);

  const salesPartyTs = Date.now();
  // Sales parties are not cleared by clearPurchaseModuleData — use unique GST/PAN per run.
  const gstCore = salesPartyTs.toString().slice(-10).padStart(10, '1');
  const uniqueSalesGst = `27${gstCore}1Z1`;
  const uniqueSalesPan = `A${String(salesPartyTs).slice(-9).padStart(9, '0')}`;
  const salesParty = await apiRequest<any>(
    '/sales-parties',
    'POST',
    token,
    {
      business_name: `GD Sales Party ${salesPartyTs}`,
      contact_persons: [
        {
          name: 'SP Contact',
          phones: ['9999999911'],
          emails: [`sp${salesPartyTs}@example.com`],
        },
      ],
      address: {
        street: 'Sales St',
        city: 'Mumbai',
        state: 'MH',
        pincode: '400001',
        country: 'India',
      },
      business_details: {
        gst_number: uniqueSalesGst,
        pan_number: uniqueSalesPan,
      },
      registration_type: 'registered',
    },
    201
  );
  const salesPartyId = salesParty.json.data.id as string;
  push('Create sales party', Boolean(salesPartyId));

  const salesSaudaA = await apiRequest<any>(
    '/sales-saudas',
    'POST',
    token,
    {
      sales_party_id: salesPartyId,
      status: 'draft',
      lines: [
        {
          product_id: productAId,
          packaging_id: packagingAId,
          packet_count: 1,
          rate: 60,
          discount_value: 0,
          discount_type: 'per_kg',
          gst_percent: 5,
        },
      ],
    },
    201
  );
  const salesSaudaAId = salesSaudaA.json.data.id as string;
  push('Create sales sauda (godown set at invoice dispatch)', Boolean(salesSaudaAId));

  await apiRequest<any>(`/sales-saudas/${salesSaudaAId}/finalize`, 'POST', token, {}, 200);
  push('Finalize sales sauda (order status)', true);

  const dispatchA = await apiRequest<any>(
    '/invoice-dispatches',
    'POST',
    token,
    {
      sales_sauda_id: salesSaudaAId,
      godown_id: godownAId,
      internal_invoice_number: `INV-${Date.now()}`,
      dispatch_date: new Date().toISOString().slice(0, 10),
      transporter_id: master.transporterId,
      vehicle_id: master.vehicleId,
      distance_km: 20,
      route_description: 'A route',
    },
    201
  );
  const dispatchAId = dispatchA.json.data.id as string;
  const dispatchLines = (dispatchA.json.data.lines || []) as Array<{ id: string; product_id: string; quantity: number }>;
  push('Create invoice dispatch from sales sauda', Boolean(dispatchAId && dispatchLines.length > 0));

  await apiRequest<any>(`/invoice-dispatches/${dispatchAId}/confirm`, 'POST', token, {}, 200);
  push('Confirm invoice dispatch (stock deduction)', true);

  const fgAAfterDispatch = await apiRequest<any[]>(
    `/inventory/finished-goods?godown_id=${godownAId}&product_id=${productAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const fgBAfterDispatch = await apiRequest<any[]>(
    `/inventory/finished-goods?godown_id=${godownBId}&product_id=${productBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const fgAAfterDispatchWeight = Number((fgAAfterDispatch.json.data?.[0]?.total_weight ?? 0));
  const fgBAfterDispatchWeight = Number((fgBAfterDispatch.json.data?.[0]?.total_weight ?? 0));
  push(
    'Dispatch deducts inventory only from dispatch godown',
    fgAAfterDispatchWeight < fgAInitialWeight && fgBAfterDispatchWeight === fgBInitialWeight,
    `A:${fgAInitialWeight}->${fgAAfterDispatchWeight}, B:${fgBInitialWeight}->${fgBAfterDispatchWeight}`
  );

  const ledgerAAfterDispatch = await apiRequest<any[]>(
    `/inventory-ledger?godown_id=${godownAId}&source_type=sales_dispatch`,
    'GET',
    token,
    undefined,
    200
  );
  const ledgerDispatchOk = (ledgerAAfterDispatch.json.data || []).some((x: any) => x.source_id === dispatchAId && x.godown_id === godownAId);
  push('Inventory ledger records sales_dispatch with godown_id', ledgerDispatchOk);

  const creditNote = await apiRequest<any>(
    '/credit-notes',
    'POST',
    token,
    {
      invoice_dispatch_id: dispatchAId,
      sales_sauda_id: salesSaudaAId,
      credit_note_number: `CN-${Date.now()}`,
      credit_note_date: new Date().toISOString().slice(0, 10),
      reason: 'Return test',
      lines: [
        {
          invoice_dispatch_line_id: dispatchLines[0].id,
          product_id: dispatchLines[0].product_id,
          quantity_returned: 5,
        },
      ],
    },
    201
  );
  const creditNoteId = creditNote.json.data.id as string;
  push('Create credit note for dispatch line', Boolean(creditNoteId));

  await apiRequest<any>(`/credit-notes/${creditNoteId}/confirm`, 'POST', token, {}, 200);
  push('Confirm credit note (stock restoration)', true);

  const fgAAfterReturn = await apiRequest<any[]>(
    `/inventory/finished-goods?godown_id=${godownAId}&product_id=${productAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const fgAAfterReturnWeight = Number((fgAAfterReturn.json.data?.[0]?.total_weight ?? 0));
  push(
    'Credit note restores inventory in same godown',
    fgAAfterReturnWeight > fgAAfterDispatchWeight,
    `${fgAAfterDispatchWeight}->${fgAAfterReturnWeight}`
  );

  const ledgerAAfterReturn = await apiRequest<any[]>(
    `/inventory-ledger?godown_id=${godownAId}&source_type=sale_return`,
    'GET',
    token,
    undefined,
    200
  );
  const ledgerReturnOk = (ledgerAAfterReturn.json.data || []).some((x: any) => x.source_id === creditNoteId && x.godown_id === godownAId);
  push('Inventory ledger records sale_return with godown_id', ledgerReturnOk);

  const dispatchFilterA = await apiRequest<any[]>(
    `/invoice-dispatches?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const dispatchFilterB = await apiRequest<any[]>(
    `/invoice-dispatches?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const dispatchFilterOk =
    (dispatchFilterA.json.data || []).every((d: any) => d.godown_id === godownAId) &&
    (dispatchFilterB.json.data || []).every((d: any) => d.godown_id === godownBId);
  push('Invoice dispatch list godown filters are isolated', dispatchFilterOk);

  const invSummaryA = await apiRequest<any>(
    `/inventory/summary?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const invSummaryB = await apiRequest<any>(
    `/inventory/summary?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  push(
    'Inventory summary is available and godown scoped',
    Boolean(invSummaryA.json.success && invSummaryB.json.success)
  );

  const hierA = await apiRequest<unknown>(
    `/inventory/hierarchical?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const hierB = await apiRequest<unknown>(
    `/inventory/hierarchical?godown_id=${godownBId}`,
    'GET',
    token,
    undefined,
    200
  );
  const hierAData = hierA.json.data;
  const hierBData = hierB.json.data;
  push(
    'GET /inventory/hierarchical?godown_id= returns structured stock per warehouse',
    hierA.json.success &&
      hierB.json.success &&
      hierAData != null &&
      hierBData != null
  );

  const paA = await apiRequest<any>(
    '/payment-advices',
    'POST',
    token,
    {
      sauda_id: saudaAId,
      amount: 10000,
      date_of_payment: new Date().toISOString().slice(0, 10),
      status: 'pending',
      party_name: 'PA-A',
    },
    201
  );
  const paAId = paA.json.data.id as string;

  const paB = await apiRequest<any>(
    '/payment-advices',
    'POST',
    token,
    {
      inward_slip_pass_id: ispBId,
      amount: 12000,
      date_of_payment: new Date().toISOString().slice(0, 10),
      status: 'pending',
      party_name: 'PA-B',
    },
    201
  );
  const paBId = paB.json.data.id as string;
  push('Create payment advices from sauda/ISP', Boolean(paAId && paBId));

  const paAGet = await apiRequest<any>(`/payment-advices/${paAId}`, 'GET', token, undefined, 200);
  const paBGet = await apiRequest<any>(`/payment-advices/${paBId}`, 'GET', token, undefined, 200);
  const paOk = Boolean(paAGet.json.data?.id === paAId && paBGet.json.data?.id === paBId);
  push('Payment advices retrievable without godown field', paOk);

  const paList = await apiRequest<any[]>(`/payment-advices`, 'GET', token, undefined, 200);
  const listOk = (paList.json.data || []).some((x: any) => x.id === paAId) && (paList.json.data || []).some((x: any) => x.id === paBId);
  push('List payment advices', listOk);

  const summaryGood = await apiRequest<any>(
    `/purchase-summary/sauda/${saudaAId}?godown_id=${godownAId}`,
    'GET',
    token,
    undefined,
    200
  );
  const summaryBad = await apiRequest<any>(
    `/purchase-summary/sauda/${saudaAId}?godown_id=${godownBId}`,
    'GET',
    token
  );
  const summaryBadOk =
    summaryBad.status === 200 &&
    Number(summaryGood.json.data?.total_lots ?? 0) >= 1 &&
    Number(summaryBad.json.data?.total_lots ?? 0) === 0;
  push(
    'Scope purchase summary lots by godown_id query',
    Boolean(summaryGood.json.success) && summaryBadOk,
    `badLots=${summaryBad.json?.data?.total_lots}`
  );

  const ispSummaryWrongGodown = await apiRequest<any>(
    `/purchase-summary/isp/${ispAId}?godown_id=${godownBId}`,
    'GET',
    token
  );
  push(
    'ISP purchase summary with mismatched godown_id returns 404',
    ispSummaryWrongGodown.status === 404
  );

  const passes = results.filter((r) => r.pass).length;
  const fails = results.length - passes;
  console.log('\n=== Godown Full Flow Test Report ===');
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} - ${r.name}${r.details ? ` (${r.details})` : ''}`);
  }
  console.log(`\nTotal: ${results.length}, Passed: ${passes}, Failed: ${fails}`);

  if (fails > 0) {
    process.exitCode = 1;
  }
} 

run()
  .catch((error) => {
    console.error('Test run failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });

