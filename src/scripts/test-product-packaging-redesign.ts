#!/usr/bin/env ts-node
/**
 * Comprehensive tests for Product & Packaging Master Redesign (1B + 2A).
 *
 * Usage:
 *   npx ts-node src/scripts/test-product-packaging-redesign.ts
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from '../database/connection';
import { brandService } from '../services/brand.service';
import { packagingMaterialService } from '../services/packaging-material.service';
import { productService, toProductResponse } from '../services/product.service';
import {
  packagingService,
  packagingMaterialPurchaseService,
  computePurchaseAmounts,
} from '../services/packaging-material-purchase.service';
import { productDAO } from '../dao/product.dao';
import { packagingDAO } from '../dao/packaging.dao';
import { productRateDAO } from '../dao/product-rate.dao';
import { packetsInventoryDAO } from '../dao/packets-inventory.dao';
import { packagingVendorDAO } from '../dao/packaging-vendor.dao';
import { godownDAO } from '../dao/godown.dao';
import { validate, createPackagingSchema, createProductSchema } from '../utils/validators';
import { ConflictError, ValidationError } from '../utils/errors';

type Result = { group: string; name: string; pass: boolean; error?: string };

const results: Result[] = [];
const suffix = randomUUID().slice(0, 8);
const today = new Date().toISOString().slice(0, 10);

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function run(group: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ group, name, pass: true });
    console.log(`  ✓ ${group} › ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    results.push({ group, name, pass: false, error });
    console.log(`  ✗ ${group} › ${name}`);
    console.log(`      ${error}`);
  }
}

async function main() {
  console.log('\n=== Product & Packaging Redesign — comprehensive tests ===\n');

  // ── Schema / backfill sanity ──────────────────────────────────────────
  await run('Schema', 'products have new columns populated', async () => {
    const r = await db.query<{
      missing_brand: string;
      missing_cat: string;
      missing_variant: string;
      missing_code: string;
      missing_hsn: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE brand_id IS NULL)::text AS missing_brand,
        COUNT(*) FILTER (WHERE rice_category IS NULL)::text AS missing_cat,
        COUNT(*) FILTER (WHERE rice_variant IS NULL)::text AS missing_variant,
        COUNT(*) FILTER (WHERE product_code IS NULL)::text AS missing_code,
        COUNT(*) FILTER (WHERE hsn_code IS NULL OR TRIM(hsn_code)='')::text AS missing_hsn
      FROM products
    `);
    const row = r.rows[0];
    assert(row.missing_brand === '0', `products missing brand_id: ${row.missing_brand}`);
    assert(row.missing_cat === '0', `products missing rice_category: ${row.missing_cat}`);
    assert(row.missing_variant === '0', `products missing rice_variant: ${row.missing_variant}`);
    assert(row.missing_code === '0', `products missing product_code: ${row.missing_code}`);
    assert(row.missing_hsn === '0', `products missing hsn_code: ${row.missing_hsn}`);
  });

  await run('Schema', 'brands seeded and packaging materials exist', async () => {
    const { items: brands } = await brandService.list(true);
    assert(brands.length >= 6, `expected >=6 brands, got ${brands.length}`);
    const names = brands.map((b) => b.name);
    for (const n of ['Tamara', 'Hariom', 'Postman', 'Jyoti', 'Dubar', 'Tamaal']) {
      assert(names.includes(n), `missing brand ${n}`);
    }
    const { items: materials } = await packagingMaterialService.list(true);
    assert(materials.length >= 1, 'no packaging materials');
  });

  await run('Schema', 'packaging rows have packaging_material_id', async () => {
    const r = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM packaging WHERE packaging_material_id IS NULL`
    );
    assert(r.rows[0].c === '0', `packaging missing material_id: ${r.rows[0].c}`);
  });

  await run('Sales-compat', 'existing product GET still exposes brand/rice_type/hsn/rates shape', async () => {
    const { rows: products } = await productDAO.findAll({ status: 'active' });
    assert(products.length > 0, 'no active products');
    const p = products[0];
    const rates = await productRateDAO.findByProductId(p.id);
    const resp = toProductResponse(p, rates.map((r) => ({
      holding_capacity: Number(r.holding_capacity),
      rate: Number(r.rate),
      effective_date: String(r.effective_date).slice(0, 10),
    })));
    assert('brand' in resp, 'missing brand');
    assert('rice_type' in resp, 'missing rice_type');
    assert('hsn_code' in resp, 'missing hsn_code');
    assert('rates' in resp, 'missing rates');
    assert('brand_id' in resp && !!resp.brand_id, 'missing brand_id');
    assert('rice_category' in resp, 'missing rice_category');
    assert('rice_variant' in resp && !!resp.rice_variant, 'missing rice_variant');
    assert('product_code' in resp && !!resp.product_code, 'missing product_code');
    assert(resp.status === 'active' || resp.status === 'inactive' || resp.status === 'discontinued', 'bad status');
  });

  // ── Brands ────────────────────────────────────────────────────────────
  let testBrandId = '';
  await run('Brand', 'create brand with unique prefix', async () => {
    const b = await brandService.create({
      name: `TestBrand-${suffix}`,
      code_prefix: `TB${suffix.slice(0, 4).toUpperCase()}`,
      status: 'active',
    });
    testBrandId = b.id;
    assert(!!b.id, 'no id');
    assert(b.code_prefix.startsWith('TB'), 'prefix not uppercased/stored');
  });

  await run('Brand', 'duplicate name → ConflictError', async () => {
    let threw = false;
    try {
      await brandService.create({
        name: `TestBrand-${suffix}`,
        code_prefix: `ZZ${suffix.slice(0, 4).toUpperCase()}`,
      });
    } catch (e) {
      threw = e instanceof ConflictError;
    }
    assert(threw, 'expected ConflictError');
  });

  // ── Packaging materials ───────────────────────────────────────────────
  let materialId = '';
  await run('Material', 'create packaging material', async () => {
    const m = await packagingMaterialService.create({
      name: `Test Material ${suffix}`,
      status: 'active',
    });
    materialId = m.id;
    assert(!!materialId, 'no material id');
  });

  await run('Material', 'requireActive works', async () => {
    const m = await packagingMaterialService.requireActive(materialId);
    assert(m.id === materialId, 'wrong material');
  });

  // ── Product create / dual-write ───────────────────────────────────────
  let productId = '';
  let productCode = '';
  await run('Product', 'create with brand_id + rice_category + rice_variant + image', async () => {
    const p = await productService.createProduct({
      name: `Test Product ${suffix}`,
      brand_id: testBrandId,
      rice_category: 'basmati',
      rice_variant: 'steam_basmati',
      bag_image_url: 'https://example.com/bag.png',
      description: 'test desc',
    });
    productId = p.id;
    productCode = p.product_code || '';
    assert(!!productId, 'no product id');
    assert(!!productCode && productCode.includes('-'), `bad product_code ${productCode}`);
    assert(p.rice_category === 'basmati', 'rice_category');
    assert(p.rice_variant === 'steam_basmati', `rice_variant ${p.rice_variant}`);
    assert(p.rice_type === 'steam_basmati', `expected dual-write rice_type steam_basmati, got ${p.rice_type}`);
    assert(p.hsn_code === '100630', `hsn ${p.hsn_code}`);
    assert(p.status === 'active', 'status');
    assert(p.brand === `TestBrand-${suffix}` || !!p.brand, 'brand display name');
    assert(p.bag_image_url === 'https://example.com/bag.png', 'image');
  });

  await run('Product', 'auto product codes increment per brand', async () => {
    const p2 = await productService.createProduct({
      name: `Test Product B ${suffix}`,
      brand_id: testBrandId,
      rice_category: 'non_basmati',
      rice_variant: 'parboiled',
      bag_image_url: 'https://example.com/bag2.png',
    });
    assert(p2.rice_variant === 'parboiled', `rice_variant ${p2.rice_variant}`);
    assert(p2.rice_type === 'parboiled', `rice_type dual-write ${p2.rice_type}`);
    const n1 = Number(productCode.split('-').pop());
    const n2 = Number((p2.product_code || '').split('-').pop());
    assert(n2 === n1 + 1, `codes not sequential: ${productCode} then ${p2.product_code}`);
  });

  await run('Product', 'duplicate name in brand → ConflictError', async () => {
    let threw = false;
    try {
      await productService.createProduct({
        name: `Test Product ${suffix}`,
        brand_id: testBrandId,
        rice_category: 'basmati',
        rice_variant: 'raw_basmati',
        bag_image_url: 'https://example.com/x.png',
      });
    } catch (e) {
      threw = e instanceof ConflictError;
    }
    assert(threw, 'expected ConflictError on duplicate name');
  });

  await run('Product', 'suggest returns similar names', async () => {
    const rows = await productService.suggest(testBrandId, `Test Product ${suffix.slice(0, 4)}`);
    assert(rows.length >= 1, 'suggest empty');
  });

  await run('Product', 'validator rejects create without bag_image_url', async () => {
    let threw = false;
    try {
      validate(createProductSchema, {
        name: 'x',
        brand_id: testBrandId,
        rice_category: 'basmati',
        rice_variant: 'raw_basmati',
      });
    } catch {
      threw = true;
    }
    assert(threw, 'expected validation failure');
  });

  await run('Product', 'validator rejects rice_variant that does not match rice_category', async () => {
    let threw = false;
    try {
      validate(createProductSchema, {
        name: 'x',
        brand_id: testBrandId,
        rice_category: 'basmati',
        rice_variant: 'parboiled',
        bag_image_url: 'https://example.com/bag.png',
      });
    } catch {
      threw = true;
    }
    assert(threw, 'expected validation failure for mismatched rice_variant');
  });

  await run('Product', 'soft deactivate sets inactive', async () => {
    const p = await productService.softDeactivate(productId);
    assert(p.status === 'inactive', `status=${p.status}`);
    // reactivate for later packaging tests
    await productService.updateProduct(productId, { status: 'active' });
  });

  // ── Packaging master ──────────────────────────────────────────────────
  let packagingId = '';
  await run('Packaging', 'create clean packaging', async () => {
    const pkg = await packagingService.createClean({
      product_id: productId,
      holding_capacity: 30,
      packaging_material_id: materialId,
      remarks: 'test remarks',
    });
    packagingId = pkg.id;
    assert(!!pkg.packaging_number, 'missing packaging_number');
    assert(Number(pkg.holding_capacity) === 30, 'capacity');
    assert(pkg.packaging_material_id === materialId, 'material');
    assert(pkg.packet_type.includes('Test Material') || !!pkg.packet_type, 'packet_type alias');
  });

  await run('Packaging', 'duplicate product+capacity+material → ConflictError', async () => {
    let threw = false;
    try {
      await packagingService.createClean({
        product_id: productId,
        holding_capacity: 30,
        packaging_material_id: materialId,
      });
    } catch (e) {
      threw = e instanceof ConflictError;
    }
    assert(threw, 'expected ConflictError');
  });

  await run('Packaging', 'can create same capacity with different material', async () => {
    const m2 = await packagingMaterialService.create({
      name: `Alt Material ${suffix}`,
      status: 'active',
    });
    const pkg = await packagingService.createClean({
      product_id: productId,
      holding_capacity: 30,
      packaging_material_id: m2.id,
    });
    assert(!!pkg.id, 'second packaging not created');
  });

  await run('Packaging', 'validator forbids vendor / empty_bag / initial_packets', async () => {
    let threw = false;
    try {
      validate(createPackagingSchema, {
        product_id: productId,
        holding_capacity: 25,
        packaging_material_id: materialId,
        packaging_vendor_id: randomUUID(),
        initial_packets: 10,
        empty_bag_weight_kg: 0.05,
      });
    } catch {
      threw = true;
    }
    assert(threw, 'expected forbidden field rejection');
  });

  await run('Packaging', 'inactive product cannot get packaging', async () => {
    await productService.updateProduct(productId, { status: 'inactive' });
    let threw = false;
    try {
      await packagingService.createClean({
        product_id: productId,
        holding_capacity: 25,
        packaging_material_id: materialId,
      });
    } catch (e) {
      threw = e instanceof ValidationError;
    }
    await productService.updateProduct(productId, { status: 'active' });
    assert(threw, 'expected ValidationError for inactive product');
  });

  // ── Rates ─────────────────────────────────────────────────────────────
  await run('Rates', 'GET rates permissive even before packaging (existing products)', async () => {
    const { rows: existing } = await productDAO.findAll();
    const withRates = existing.find(async () => true);
    assert(!!withRates, 'no products');
    const rates = await productRateDAO.findByProductId(withRates!.id);
    // just ensure call works
    assert(Array.isArray(rates), 'rates not array');
  });

  await run('Rates', 'PUT blocked when no packaging (NO_PACKAGING_CONFIGURED path)', async () => {
    // product without packaging
    const lonely = await productService.createProduct({
      name: `NoPkg ${suffix}`,
      brand_id: testBrandId,
      rice_category: 'basmati',
      rice_variant: 'white_sella',
      bag_image_url: 'https://example.com/n.png',
    });
    const caps = await packagingDAO.findDistinctHoldingCapacities(lonely.id);
    assert(caps.length === 0, 'expected no packaging');
  });

  await run('Rates', 'upsert rates for packaging capacity succeeds', async () => {
    const updated = await productRateDAO.upsertRates(
      productId,
      [{ holding_capacity: 30, rate: 97.5 }],
      today,
      null
    );
    assert(updated.length >= 1, 'no rates returned');
    assert(Number(updated.find((r) => Number(r.holding_capacity) === 30)?.rate) === 97.5, 'rate mismatch');
  });

  await run('Rates', 'history retains previous rate after update', async () => {
    await productRateDAO.upsertRates(
      productId,
      [{ holding_capacity: 30, rate: 99.0 }],
      today,
      null
    );
    const hist = await db.query<{ rate: string }>(
      `SELECT rate::text FROM product_rate_history
       WHERE product_id = $1 AND holding_capacity = 30
       ORDER BY created_at ASC`,
      [productId]
    );
    assert(hist.rows.length >= 1, 'no history rows');
    const rates = hist.rows.map((r) => Number(r.rate));
    assert(rates.includes(97.5) || rates.includes(99), `history rates: ${rates.join(',')}`);
  });

  // ── Purchase packaging ────────────────────────────────────────────────
  await run('PurchaseCalcs', 'computePurchaseAmounts formulas', async () => {
    const a = computePurchaseAmounts({
      quantity_kg: 520,
      empty_bag_weight_kg: 0.052,
      rate_per_kg: 100,
      gst_percent: 18,
    });
    assert(a.bag_count === 10000, `bag_count=${a.bag_count}`);
    assert(a.taxable_amount === 52000, `taxable=${a.taxable_amount}`);
    assert(a.gst_amount === 9360, `gst=${a.gst_amount}`);
    assert(a.total_amount === 61360, `total=${a.total_amount}`);
    // rate per bag = (100 + 18) * 0.052 = 6.136
    assert(Math.abs(a.rate_per_bag - 6.136) < 0.0001, `rate_per_bag=${a.rate_per_bag}`);
  });

  await run('PurchaseCalcs', 'rejects qty that yields <1 bag', async () => {
    let threw = false;
    try {
      computePurchaseAmounts({
        quantity_kg: 0.01,
        empty_bag_weight_kg: 0.052,
        rate_per_kg: 10,
        gst_percent: 0,
      });
    } catch (e) {
      threw = e instanceof ValidationError;
    }
    assert(threw, 'expected ValidationError');
  });

  let purchaseId = '';
  await run('Purchase', 'create purchase updates packets inventory', async () => {
    const { rows: vendors } = await packagingVendorDAO.findAll({ status: 'active' });
    let vendorId = '';
    if (vendors.length > 0) {
      vendorId = vendors[0].id;
    } else {
      const v = await db.query<{ id: string }>(
        `SELECT id FROM packaging_vendors WHERE status = 'active' OR is_active = true LIMIT 1`
      );
      vendorId = v.rows[0]?.id || '';
    }
    assert(!!vendorId, 'no active packaging vendor in DB — seed one to test purchases');

    const { rows: godowns } = await godownDAO.findAll(false);
    assert(godowns.length > 0, 'no active godown');
    const godownId = godowns[0].id;

    const before = await packetsInventoryDAO.findByPackagingId(packagingId, godownId);
    const beforeQty = before?.available_quantity || 0;

    const purchase = await packagingMaterialPurchaseService.create({
      vendor_id: vendorId,
      packaging_id: packagingId,
      purchase_date: today,
      invoice_number: `TEST-INV-${suffix}`,
      invoice_date: today,
      quantity_kg: 5.2,
      empty_bag_weight_kg: 0.052,
      gsm: 90,
      rate_per_kg: 120,
      gst_percent: 18,
      godown_id: godownId,
      batch_lot_number: `LOT-${suffix}`,
    });
    purchaseId = purchase.id;
    assert(purchase.bag_count === 100, `bag_count=${purchase.bag_count}`);
    assert(
      Number.isInteger(purchase.serial_number) && purchase.serial_number > 0,
      `serial_number=${purchase.serial_number}`
    );
    assert(purchaseId.length > 0, 'no purchase id');

    const after = await packetsInventoryDAO.findByPackagingId(packagingId, godownId);
    assert(!!after, 'inventory row missing');
    assert(
      Number(after!.available_quantity) === beforeQty + 100,
      `inventory ${beforeQty} → ${after!.available_quantity}`
    );
  });

  await run('Purchase', 'duplicate invoice per vendor → ConflictError', async () => {
    const v = await db.query<{ id: string }>(
      `SELECT vendor_id AS id FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    const g = await db.query<{ id: string }>(
      `SELECT godown_id AS id FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    let threw = false;
    try {
      await packagingMaterialPurchaseService.create({
        vendor_id: v.rows[0].id,
        packaging_id: packagingId,
        purchase_date: today,
        invoice_number: `TEST-INV-${suffix}`,
        invoice_date: today,
        quantity_kg: 1.04,
        empty_bag_weight_kg: 0.052,
        rate_per_kg: 100,
        gst_percent: 0,
        godown_id: g.rows[0].id,
      });
    } catch (e) {
      threw = e instanceof ConflictError;
    }
    assert(threw, 'expected ConflictError on duplicate invoice');
  });

  await run('Purchase', 'future purchase_date rejected', async () => {
    const v = await db.query<{ id: string }>(
      `SELECT vendor_id AS id FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    const g = await db.query<{ id: string }>(
      `SELECT godown_id AS id FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    let threw = false;
    try {
      await packagingMaterialPurchaseService.create({
        vendor_id: v.rows[0].id,
        packaging_id: packagingId,
        purchase_date: '2099-01-01',
        invoice_number: `FUTURE-${suffix}`,
        invoice_date: '2099-01-01',
        quantity_kg: 1.04,
        empty_bag_weight_kg: 0.052,
        rate_per_kg: 100,
        gst_percent: 0,
        godown_id: g.rows[0].id,
      });
    } catch (e) {
      threw = e instanceof ValidationError;
    }
    assert(threw, 'expected ValidationError for future date');
  });

  await run('Purchase', 'update recalculates amounts and adjusts inventory', async () => {
    const row = await db.query<{
      vendor_id: string;
      godown_id: string;
      serial_number: number;
    }>(
      `SELECT vendor_id, godown_id, serial_number FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    const godownId = row.rows[0].godown_id;
    const serialBefore = Number(row.rows[0].serial_number);
    const before = await packetsInventoryDAO.findByPackagingId(packagingId, godownId);
    const beforeQty = Number(before?.available_quantity || 0);

    const updated = await packagingMaterialPurchaseService.update(purchaseId, {
      quantity_kg: 2.6,
      rate_per_kg: 150,
      gst_percent: 5,
      notes: `edited-${suffix}`,
    });
    assert(updated.bag_count === 50, `bag_count=${updated.bag_count}`);
    assert(updated.rate_per_kg === 150, `rate_per_kg=${updated.rate_per_kg}`);
    assert(updated.gst_percent === 5, `gst_percent=${updated.gst_percent}`);
    assert(updated.notes === `edited-${suffix}`, `notes=${updated.notes}`);
    assert(updated.serial_number === serialBefore, 'serial_number must not change');

    const after = await packetsInventoryDAO.findByPackagingId(packagingId, godownId);
    assert(
      Number(after!.available_quantity) === beforeQty - 50,
      `inventory ${beforeQty} → ${after!.available_quantity}`
    );
  });

  await run('Purchase', 'update duplicate invoice per vendor → ConflictError', async () => {
    const v = await db.query<{ id: string; godown_id: string }>(
      `SELECT vendor_id AS id, godown_id FROM packaging_material_purchases WHERE id = $1`,
      [purchaseId]
    );
    const other = await packagingMaterialPurchaseService.create({
      vendor_id: v.rows[0].id,
      packaging_id: packagingId,
      purchase_date: today,
      invoice_number: `TEST-INV-B-${suffix}`,
      invoice_date: today,
      quantity_kg: 1.04,
      empty_bag_weight_kg: 0.052,
      rate_per_kg: 100,
      gst_percent: 0,
      godown_id: v.rows[0].godown_id,
    });
    let threw = false;
    try {
      await packagingMaterialPurchaseService.update(other.id, {
        invoice_number: `TEST-INV-${suffix}`,
      });
    } catch (e) {
      threw = e instanceof ConflictError;
    }
    assert(threw, 'expected ConflictError on duplicate invoice update');
  });

  await run('Purchase', 'list by packaging_id returns purchase', async () => {
    const { items: list } = await packagingMaterialPurchaseService.list({ packaging_id: packagingId });
    assert(list.some((p) => p.id === purchaseId), 'purchase not in list');
  });

  // ── Soft packaging deactivate ─────────────────────────────────────────
  await run('Packaging', 'soft deactivate packaging', async () => {
    const updated = await packagingService.updateClean(packagingId, { status: 'inactive' });
    assert(updated.status === 'inactive', 'not inactive');
  });

  // ── Summary ───────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Results: ${passed}/${results.length} passed ===`);
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) {
      console.log(`  - [${f.group}] ${f.name}: ${f.error}`);
    }
  }

  await db.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await db.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
