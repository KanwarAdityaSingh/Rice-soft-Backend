/**
 * Clear only Sales Module data (sales sauda, invoice dispatch, ledger, credit notes, e-invoice, e-way bill).
 * Does NOT touch production/FGI data. Run with: npx ts-node src/scripts/clear-sales-module-data.ts
 */

import { db } from '../database/connection';
import { logger } from '../utils/logger';

async function clearSalesModuleData() {
  logger.info('Clearing Sales Module data...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Order respects foreign keys: children first, then parents
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

    await client.query('COMMIT');
    logger.info('Sales Module data cleared successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error clearing Sales Module data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await clearSalesModuleData();
    process.exit(0);
  } catch (error) {
    logger.error('Clear script failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { clearSalesModuleData };
