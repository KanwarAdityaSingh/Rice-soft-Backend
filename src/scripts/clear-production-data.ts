import { db } from '../database/connection';
import { logger } from '../utils/logger';

/**
 * Script to clear all production-related data
 */

async function clearProductionData() {
  logger.info('Clearing all production-related data...');
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Clear in order due to foreign key constraints
    logger.info('Deleting finished goods inventory...');
    await client.query('DELETE FROM finished_goods_inventory');
    
    logger.info('Deleting packets inventory...');
    await client.query('DELETE FROM packets_inventory');
    
    logger.info('Deleting batch packaging...');
    await client.query('DELETE FROM batch_packaging');
    
    logger.info('Deleting batch products...');
    await client.query('DELETE FROM batch_products');
    
    logger.info('Deleting batch lot usage...');
    await client.query('DELETE FROM batch_lot_usage');
    
    logger.info('Deleting batch rice code usage...');
    await client.query('DELETE FROM batch_rice_code_usage');
    
    logger.info('Deleting batches...');
    await client.query('DELETE FROM batches');
    
    logger.info('Deleting packaging...');
    await client.query('DELETE FROM packaging');
    
    logger.info('Deleting products...');
    await client.query('DELETE FROM products');
    
    logger.info('Deleting recipes...');
    await client.query('DELETE FROM recipes');
    
    logger.info('Deleting packaging vendors...');
    await client.query('DELETE FROM packaging_vendors');
    
    // Reset bags inventory to 0 (don't delete, just reset)
    logger.info('Resetting bags inventory...');
    await client.query('UPDATE bags_inventory SET filled_bags = 0, empty_bags = 0');
    
    await client.query('COMMIT');
    logger.info('All production data cleared successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error clearing production data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await clearProductionData();
    process.exit(0);
  } catch (error) {
    logger.error('Clear script failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { clearProductionData };

