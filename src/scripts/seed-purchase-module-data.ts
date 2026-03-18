import { db } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Seed script for purchase + production test data.
 *
 * Phase 1 – Purchase: vendors (purchaser), rice_codes, brokers, transporters, vehicles,
 * saudas, inward_slip_passes, inward_slip_pass_saudas, inward_slip_lots,
 * lot_inventory (via trigger), kaantas, payment_advices, payment_advice_charges.
 *
 * Phase 2 – Production: packaging_vendors, products, packaging, recipes (from lots),
 * packets_inventory, batches (with batch_lot_usage, batch_rice_code_usage),
 * batch_products, batch_packaging, finished_goods_inventory.
 *
 * Requires at least one admin user.
 */

type Client = { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

async function getAdminUserId(client: Client): Promise<string | null> {
  const result = await client.query('SELECT id FROM users WHERE username = $1 LIMIT 1', ['admin']);
  const row = result.rows[0] as { id: string } | undefined;
  return row?.id || null;
}

async function getOrCreateVendorPurchaser(client: Client, adminId: string): Promise<string> {
  let r = await client.query(
    `SELECT id FROM vendors WHERE type IN ('purchaser', 'both') AND is_active = true LIMIT 1`
  );
  if (r.rows[0]) return (r.rows[0] as { id: string }).id;
  r = await client.query(
    `INSERT INTO vendors (business_name, contact_person, email, phone, address, business_details, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      'Test Purchaser Pvt Ltd',
      'Purchase Contact',
      'purchaser-test@example.com',
      '9876543210',
      JSON.stringify({ street: '1 Main St', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' }),
      JSON.stringify({ gst_number: '27AABCT1234A1Z5', pan_number: 'AABCT1234A' }),
      'purchaser',
      adminId,
    ]
  );
  logger.info('Created test purchaser vendor');
  return (r.rows[0] as { id: string }).id;
}

async function getOrCreateRiceCodes(client: Client, adminId: string): Promise<string[]> {
  const r = await client.query('SELECT rice_code_id FROM rice_codes ORDER BY rice_code_name LIMIT 5');
  if (r.rows.length >= 2) return r.rows.map((x) => (x as { rice_code_id: string }).rice_code_id);
  const names = ['PR-1121', 'PR-1509', 'Sharbati', 'Sona Masoori', 'Ponni'];
  const ids: string[] = [];
  for (const name of names) {
    const existing = await client.query('SELECT rice_code_id FROM rice_codes WHERE rice_code_name = $1', [name]);
    const ex = existing.rows[0] as { rice_code_id: string } | undefined;
    if (ex) {
      ids.push(ex.rice_code_id);
    } else {
      const ins = await client.query(
        'INSERT INTO rice_codes (rice_code_name, created_by) VALUES ($1, $2) RETURNING rice_code_id',
        [name, adminId]
      );
      ids.push((ins.rows[0] as { rice_code_id: string }).rice_code_id);
    }
  }
  logger.info('Ensured rice_codes exist');
  return ids;
}

async function getOrCreateBroker(client: Client, adminId: string): Promise<string | null> {
  let r = await client.query('SELECT id FROM brokers WHERE is_active = true LIMIT 1');
  const row = r.rows[0] as { id: string } | undefined;
  if (row) return row.id;
  r = await client.query(
    `INSERT INTO brokers (business_name, contact_person, email, phone, address, business_details, type, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      'Test Broker Agency',
      'Broker Contact',
      'broker-test@example.com',
      '9876543211',
      '{}',
      '{}',
      'purchase',
      adminId,
    ]
  );
  logger.info('Created test broker');
  return (r.rows[0] as { id: string }).id;
}

async function getOrCreateTransporter(client: Client, adminId: string): Promise<string | null> {
  let r = await client.query('SELECT id FROM transporters WHERE is_active = true LIMIT 1');
  const row = r.rows[0] as { id: string } | undefined;
  if (row) return row.id;
  r = await client.query(
    `INSERT INTO transporters (business_name, contact_person, phone, address, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    ['Test Transport Co', 'Transporter Contact', '9876543212', '{}', adminId]
  );
  logger.info('Created test transporter');
  return (r.rows[0] as { id: string }).id;
}

async function getOrCreateVehicle(client: Client, adminId: string): Promise<string> {
  let r = await client.query("SELECT id FROM vehicles WHERE vehicle_number = $1", ['MH02AB1234']);
  const row = r.rows[0] as { id: string } | undefined;
  if (row) return row.id;
  r = await client.query(
    `INSERT INTO vehicles (vehicle_number, is_active, created_by) VALUES ($1, $2, $3) RETURNING id`,
    ['MH02AB1234', true, adminId]
  );
  logger.info('Created test vehicle');
  return (r.rows[0] as { id: string }).id;
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function seedPurchaseModuleData() {
  logger.info('Seeding purchase module data...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const adminId = await getAdminUserId(client);
    if (!adminId) {
      throw new Error('Admin user not found. Create admin first (e.g. npm run create-admin).');
    }

    const purchaserId = await getOrCreateVendorPurchaser(client, adminId);
    const riceCodeIds = await getOrCreateRiceCodes(client, adminId);
    const brokerId = await getOrCreateBroker(client, adminId);
    const transporterId = await getOrCreateTransporter(client, adminId);
    const vehicleId = await getOrCreateVehicle(client, adminId);

    // ---------- Saudas ----------
    logger.info('Creating saudas...');
    const saudaRows = await client.query(
      `INSERT INTO saudas (sauda_type, rice_type, rice_code_id, rate, broker_id, broker_commission, broker_commission_type,
                           quantity, cash_discount, cash_discount_type, estimated_delivery_time, purchaser_id, status, sauda_date, created_by)
       VALUES
         ('exgodown', 'basmati', $1, 45.50, $2, 1.5, 'percentage', 500, 100, 'rupees', 7, $3, 'active', $4::date, $5),
         ('for', 'non_basmati', $6, 38.00, $2, 500, 'rupees', 300, 50, 'rupees', 5, $3, 'active', $7::date, $5),
         ('exgodown', 'parboiled', $8, 42.00, $2, 2, 'percentage', 400, 0, 'rupees', 10, $3, 'draft', $9::date, $5)
       RETURNING id`,
      [riceCodeIds[0], brokerId, purchaserId, dateStr(14), adminId, riceCodeIds[1] || riceCodeIds[0], dateStr(10), riceCodeIds[2] || riceCodeIds[0], dateStr(5)]
    );
    const saudaIds = saudaRows.rows.map((r) => (r as { id: string }).id);

    // ---------- Inward slip passes ----------
    logger.info('Creating inward slip passes...');
    const ispRows = await client.query(
      `INSERT INTO inward_slip_passes (slip_number, date, vehicle_id, party_name, transporter_id, transportation_cost, status, created_by)
       VALUES
         (NULL, $1::date, $2, 'Test Party One', $3, 2500, 'completed', $4),
         (NULL, $5::date, $2, 'Test Party Two', $3, 3000, 'completed', $4)
       RETURNING id`,
      [dateStr(12), vehicleId, transporterId, adminId, dateStr(8)]
    );
    const ispIds = ispRows.rows.map((r) => (r as { id: string }).id);

    // ---------- Link ISP ↔ Sauda ----------
    logger.info('Linking inward slip passes to saudas...');
    await client.query(
      `INSERT INTO inward_slip_pass_saudas (inward_slip_pass_id, sauda_id) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING`,
      [ispIds[0], saudaIds[0], ispIds[1], saudaIds[1]]
    );

    // ---------- Inward slip lots (per sauda; trigger creates lot_inventory) ----------
    logger.info('Creating inward slip lots...');
    await client.query(
      `INSERT INTO inward_slip_lots (sauda_id, lot_number, rice_code_id, rice_type, no_of_bags, bag_weight, bill_weight, received_weight, rate, created_by)
       VALUES ($1, 'LOT-001', $2, 'basmati', 100, 50, 5000, 4980, 45.50, $3),
              ($1, 'LOT-002', $2, 'basmati', 60, 50, 3000, 2990, 45.50, $3)
       RETURNING id`,
      [saudaIds[0], riceCodeIds[0], adminId]
    );
    await client.query(
      `INSERT INTO inward_slip_lots (sauda_id, lot_number, rice_code_id, rice_type, no_of_bags, bag_weight, bill_weight, received_weight, rate, created_by)
       VALUES ($1, 'LOT-003', $2, 'non_basmati', 80, 50, 4000, 3980, 38.00, $3)
       RETURNING id`,
      [saudaIds[1], riceCodeIds[1] || riceCodeIds[0], adminId]
    );

    // ---------- Kaantas ----------
    logger.info('Creating kaantas...');
    await client.query(
      `INSERT INTO kaantas (sauda_id, inward_slip_pass_id, full_truck_weight, empty_truck_weight, bag_weight, no_of_bags, bag_type, created_by)
       VALUES ($1, $2, 250, 100, 50, 100, 'jute', $3),
              ($4, $5, 200, 90, 50, 80, 'pp', $3)`,
      [saudaIds[0], ispIds[0], adminId, saudaIds[1], ispIds[1]]
    );

    // ---------- Payment advices (one by sauda, one by ISP) ----------
    logger.info('Creating payment advices...');
    const paRows = await client.query(
      `INSERT INTO payment_advices (sauda_id, inward_slip_pass_id, party_name, amount, date_of_payment, status, created_by)
       VALUES ($1, NULL, 'Test Party One', 225000, $2::date, 'pending', $3),
              (NULL, $4, 'Test Party Two', 151240, $5::date, 'completed', $3)
       RETURNING id`,
      [saudaIds[0], dateStr(2), adminId, ispIds[1], dateStr(1)]
    );
    const paymentAdviceIds = paRows.rows.map((r) => (r as { id: string }).id);

    // ---------- Payment advice charges ----------
    logger.info('Creating payment advice charges...');
    await client.query(
      `INSERT INTO payment_advice_charges (payment_advice_id, charge_name, charge_value, charge_type)
       VALUES ($1, 'Cash Discount', 100, 'fixed'),
              ($1, 'RTGS Charges', 25, 'fixed')`,
      [paymentAdviceIds[0]]
    );

    // ========== Phase 2: Production ==========
    type LotRow = { id: string; lot_number: string; available_quantity: number; rice_code_id: string; rice_type: string };
    const lotsResult = await client.query(
      `SELECT l.id, l.lot_number, COALESCE(li.available_quantity, 0)::numeric as available_quantity, l.rice_code_id, l.rice_type
       FROM inward_slip_lots l
       LEFT JOIN lot_inventory li ON l.id = li.lot_id
       WHERE COALESCE(li.available_quantity, 0) > 0
       ORDER BY l.lot_number LIMIT 10`
    );
    const availableLots = lotsResult.rows as LotRow[];
    if (availableLots.length < 2) {
      logger.warn('Skipping production seed: need at least 2 lots with available quantity.');
    } else {
      // Packaging vendors (contact_persons and address are NOT NULL per migration 089)
      logger.info('Creating packaging vendors...');
      const pvNames = ['ABC Packaging', 'XYZ Pack Solutions', 'Premium Pack Ltd'];
      const contactPersons = JSON.stringify([{ name: 'Contact', phones: ['9876543210'], emails: ['contact@vendor.com'] }]);
      const addressJson = JSON.stringify({ street: '1 Pack St', city: 'Mumbai', state: 'MH', pincode: '400001', country: 'India' });
      const pvIds: string[] = [];
      for (const name of pvNames) {
        let r = await client.query('SELECT id FROM packaging_vendors WHERE name = $1', [name]);
        if (r.rows[0]) {
          pvIds.push((r.rows[0] as { id: string }).id);
        } else {
          r = await client.query(
            `INSERT INTO packaging_vendors (name, contact_persons, address, created_by) VALUES ($1, $2::jsonb, $3::jsonb, $4) RETURNING id`,
            [name, contactPersons, addressJson, adminId]
          );
          pvIds.push((r.rows[0] as { id: string }).id);
        }
      }

      // Products
      logger.info('Creating products...');
      const productRows = [
        { name: 'Premium Basmati Rice', brand: 'Tamara', rice_type: 'basmati', description: 'Premium basmati' },
        { name: 'Standard White Rice', brand: 'Tamara', rice_type: 'non_basmati', description: 'Standard white' },
        { name: 'Parboiled Rice', brand: 'Tamara', rice_type: 'parboiled', description: 'Parboiled rice' },
        { name: 'Hariom Basmati', brand: 'Hariom', rice_type: 'basmati', description: 'Hariom basmati' },
      ];
      const productIds: string[] = [];
      for (const p of productRows) {
        const r = await client.query(
          `INSERT INTO products (name, description, brand, rice_type, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [p.name, p.description, p.brand, p.rice_type, adminId]
        );
        productIds.push((r.rows[0] as { id: string }).id);
      }

      // Packaging (2 per product: 10kg and 25kg)
      logger.info('Creating packaging...');
      type PkgRow = { id: string; product_id: string; capacity: number };
      const packagingRows: PkgRow[] = [];
      const capacities = [10, 25];
      const packetTypes = ['HDPE Bag', 'PP Bag'];
      for (let i = 0; i < productIds.length; i++) {
        for (let j = 0; j < 2; j++) {
          const r = await client.query(
            `INSERT INTO packaging (product_id, holding_capacity, packet_type, packaging_vendor_id, ordered_weight, created_by)
             VALUES ($1, $2, $3, $4, 1000, $5) RETURNING id, product_id`,
            [productIds[i], capacities[j], packetTypes[j], pvIds[i % pvIds.length], adminId]
          );
          const row = r.rows[0] as { id: string; product_id: string };
          packagingRows.push({ id: row.id, product_id: row.product_id, capacity: capacities[j] });
        }
      }

      // Recipes (using available lots; formula sums to 100)
      logger.info('Creating recipes...');
      const recipeFormulas = [
        { name: 'Premium Mix', formula: [{ lot_id: availableLots[0].id, percentage: 60 }, { lot_id: availableLots[1].id, percentage: 40 }] },
        { name: 'Classic Blend', formula: [{ lot_id: availableLots[0].id, percentage: 50 }, { lot_id: availableLots[1].id, percentage: 50 }] },
      ];
      const recipeIds: string[] = [];
      for (const rec of recipeFormulas) {
        const r = await client.query(
          `INSERT INTO recipes (recipe_name, formula, created_by) VALUES ($1, $2::jsonb, $3) RETURNING id`,
          [rec.name, JSON.stringify(rec.formula), adminId]
        );
        recipeIds.push((r.rows[0] as { id: string }).id);
      }

      // Packets inventory for packaging
      logger.info('Creating packets inventory...');
      for (const pkg of packagingRows) {
        await client.query(
          `INSERT INTO packets_inventory (packaging_id, available_quantity, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (packaging_id) DO UPDATE SET available_quantity = packets_inventory.available_quantity + EXCLUDED.available_quantity`,
          [pkg.id, 200, adminId]
        );
      }

      // Batches with lot usage
      logger.info('Creating batches...');
      const batchQuantities = [500, 750];
      const batchIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const recipeId = recipeIds[i % recipeIds.length];
        const quantity = batchQuantities[i];
        const batchR = await client.query(
          `INSERT INTO batches (recipe_id, quantity, status, created_by) VALUES ($1, $2, 'recipe_attached', $3) RETURNING id, batch_number`,
          [recipeId, quantity, adminId]
        );
        const batch = batchR.rows[0] as { id: string; batch_number: string };
        batchIds.push(batch.id);

        const formulaR = await client.query<{ formula: Array<{ lot_id: string; percentage: number }> }>(
          'SELECT formula FROM recipes WHERE id = $1',
          [recipeId]
        );
        const formula = formulaR.rows[0]?.formula || [];
        const riceCodeMap = new Map<string, { riceCodeId: string; riceType: string; totalQty: number }>();

        for (const item of formula) {
          const lot = availableLots.find((l) => l.id === item.lot_id);
          if (!lot) continue;
          const qtyUsed = (quantity * item.percentage) / 100;
          await client.query(
            `UPDATE lot_inventory SET available_quantity = GREATEST(0, available_quantity - $1) WHERE lot_id = $2`,
            [qtyUsed, lot.id]
          );
          await client.query(
            `INSERT INTO batch_lot_usage (batch_id, lot_id, quantity_used, percentage_used, created_by) VALUES ($1, $2, $3, $4, $5)`,
            [batch.id, lot.id, qtyUsed, item.percentage, adminId]
          );
          const key = lot.rice_code_id || 'unknown';
          if (riceCodeMap.has(key)) {
            const u = riceCodeMap.get(key)!;
            u.totalQty += qtyUsed;
          } else {
            riceCodeMap.set(key, { riceCodeId: lot.rice_code_id, riceType: lot.rice_type, totalQty: qtyUsed });
          }
        }
        for (const u of riceCodeMap.values()) {
          if (!u.riceCodeId) continue;
          await client.query(
            `INSERT INTO batch_rice_code_usage (batch_id, rice_code_id, rice_type, total_quantity_used, created_by)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (batch_id, rice_code_id) DO UPDATE SET total_quantity_used = EXCLUDED.total_quantity_used`,
            [batch.id, u.riceCodeId, u.riceType, u.totalQty, adminId]
          );
        }
      }

      // Batch products (Stage 2)
      logger.info('Adding products to batches...');
      for (let i = 0; i < batchIds.length; i++) {
        await client.query(
          `INSERT INTO batch_products (batch_id, product_id, created_by) VALUES ($1, $2, $3)`,
          [batchIds[i], productIds[i % productIds.length], adminId]
        );
        await client.query(`UPDATE batches SET status = 'ready_to_pack' WHERE id = $1`, [batchIds[i]]);
      }

      // Batch packaging (Stage 3): add packaging, deduct packets, create finished goods
      logger.info('Adding packaging to batches...');
      for (let i = 0; i < batchIds.length; i++) {
        const batchId = batchIds[i];
        const productId = productIds[i % productIds.length];
        const pkgList = packagingRows.filter((p) => p.product_id === productId);
        if (pkgList.length === 0) continue;
        const pkg = pkgList[0];
        const quantity = 200;
        const packetsNeeded = Math.ceil(quantity / pkg.capacity);
        await client.query(
          `INSERT INTO batch_packaging (batch_id, product_id, packaging_id, quantity, created_by) VALUES ($1, $2, $3, $4, $5)`,
          [batchId, productId, pkg.id, quantity, adminId]
        );
        await client.query(
          `UPDATE packets_inventory SET available_quantity = GREATEST(0, available_quantity - $1) WHERE packaging_id = $2`,
          [packetsNeeded, pkg.id]
        );
        const totalWeight = packetsNeeded * pkg.capacity;
        await client.query(
          `INSERT INTO finished_goods_inventory (product_id, batch_id, packaging_id, no_of_packets, total_weight, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [productId, batchId, pkg.id, packetsNeeded, totalWeight, adminId]
        );
        await client.query(`UPDATE batches SET status = 'packaged' WHERE id = $1`, [batchId]);
      }

      logger.info('Production seed (recipes, products, packaging, batches) completed.');
    }

    await client.query('COMMIT');
    logger.info('Purchase + production seed completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await seedPurchaseModuleData();
    process.exit(0);
  } catch (error) {
    logger.error('seed-purchase-module-data failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedPurchaseModuleData };
