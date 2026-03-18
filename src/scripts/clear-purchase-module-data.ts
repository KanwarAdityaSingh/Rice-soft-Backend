import { db } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Script to clear all purchase-module and production data.
 *
 * Phase 1 – Purchase module:
 * - Payment advices and charges, kaantas, inward_slip_pass_saudas
 * - batch_lot_usage, lot_inventory_audit, lot_inventory
 * - inward_slip_lots, inward_slip_passes, saudas
 *
 * Phase 2 – Sales (so FGI can be deleted):
 * - credit_notes/lines, e_way_bills, e_invoices
 * - invoice_dispatch_allocations/lines, invoice_dispatches, inventory_ledger
 * - sales_sauda_lines, sales_saudas
 *
 * Phase 3 – Production:
 * - Inventory audit tables, then finished_goods_inventory, packets_inventory
 * - batch_packaging, batch_products, batch_rice_code_usage, batches
 * - packaging, products, recipes, packaging_vendors
 * - Reset bags_inventory to zero
 *
 * Deletion order respects foreign keys.
 */

async function clearPurchaseModuleData() {
  logger.info('Clearing all purchase-module and production data...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // ---------- Phase 1: Purchase module ----------
    logger.info('Deleting payment_advice_charges...');
    await client.query('DELETE FROM payment_advice_charges');

    logger.info('Deleting payment_advices...');
    await client.query('DELETE FROM payment_advices');

    logger.info('Deleting kaantas...');
    await client.query('DELETE FROM kaantas');

    logger.info('Deleting inward_slip_pass_saudas...');
    await client.query('DELETE FROM inward_slip_pass_saudas');

    logger.info('Deleting batch_lot_usage...');
    await client.query('DELETE FROM batch_lot_usage');

    logger.info('Deleting lot_inventory_audit...');
    await client.query('DELETE FROM lot_inventory_audit');

    logger.info('Deleting lot_inventory...');
    await client.query('DELETE FROM lot_inventory');

    logger.info('Deleting inward_slip_lots...');
    await client.query('DELETE FROM inward_slip_lots');

    logger.info('Deleting inward_slip_passes...');
    await client.query('DELETE FROM inward_slip_passes');

    logger.info('Deleting saudas...');
    await client.query('DELETE FROM saudas');

    // ---------- Phase 2: Sales (must clear before FGI so FK is satisfied) ----------
    logger.info('Deleting credit_note_lines...');
    await client.query('DELETE FROM credit_note_lines');
    logger.info('Deleting credit_notes...');
    await client.query('DELETE FROM credit_notes');
    logger.info('Deleting e_way_bills...');
    await client.query('DELETE FROM e_way_bills');
    logger.info('Deleting e_invoices...');
    await client.query('DELETE FROM e_invoices');
    logger.info('Deleting invoice_dispatch_allocations...');
    await client.query('DELETE FROM invoice_dispatch_allocations');
    logger.info('Deleting invoice_dispatch_lines...');
    await client.query('DELETE FROM invoice_dispatch_lines');
    logger.info('Deleting invoice_dispatches...');
    await client.query('DELETE FROM invoice_dispatches');
    logger.info('Deleting inventory_ledger...');
    await client.query('DELETE FROM inventory_ledger');
    logger.info('Deleting sales_sauda_lines...');
    await client.query('DELETE FROM sales_sauda_lines');
    logger.info('Deleting sales_saudas...');
    await client.query('DELETE FROM sales_saudas');

    // ---------- Phase 3: Production ----------
    logger.info('Deleting finished_goods_inventory_audit...');
    await client.query('DELETE FROM finished_goods_inventory_audit');

    logger.info('Deleting packets_inventory_audit...');
    await client.query('DELETE FROM packets_inventory_audit');

    logger.info('Deleting finished_goods_inventory...');
    await client.query('DELETE FROM finished_goods_inventory');

    logger.info('Deleting packets_inventory...');
    await client.query('DELETE FROM packets_inventory');

    logger.info('Deleting batch_packaging...');
    await client.query('DELETE FROM batch_packaging');

    logger.info('Deleting batch_products...');
    await client.query('DELETE FROM batch_products');

    logger.info('Deleting batch_rice_code_usage...');
    await client.query('DELETE FROM batch_rice_code_usage');

    logger.info('Deleting batches...');
    await client.query('DELETE FROM batches');

    logger.info('Deleting packaging...');
    await client.query('DELETE FROM packaging');

    logger.info('Deleting products...');
    await client.query('DELETE FROM products');

    logger.info('Deleting recipes...');
    await client.query('DELETE FROM recipes');

    logger.info('Deleting packaging_vendors...');
    await client.query('DELETE FROM packaging_vendors');

    logger.info('Resetting bags_inventory...');
    await client.query('UPDATE bags_inventory SET filled_bags = 0, empty_bags = 0');

    await client.query('COMMIT');
    logger.info('All purchase-module and production data cleared successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error clearing data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await clearPurchaseModuleData();
    process.exit(0);
  } catch (error) {
    logger.error('Clear purchase-module script failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { clearPurchaseModuleData };
