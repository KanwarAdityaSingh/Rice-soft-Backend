/**
 * Clear all coupon-module data (batches, codes, redemptions, OTP sessions, etc.).
 * Does NOT touch admin users or other modules.
 *
 * Run: npm run clear-coupon-module-data
 */

import { db } from '../database/connection';
import { logger } from '../utils/logger';

async function clearCouponModuleData() {
  logger.info('Clearing coupon module data...');
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Child tables first (FK order), then parents
    const tables = [
      'cashfree_webhook_events',
      'payout_attempts',
      'rule_applications',
      'redemptions',
      'redemption_attempts',
      'coupon_status_history',
      'coupons',
      'coupon_batches',
      'coupon_batch_day_series',
      'redeemers',
      'promotion_rules',
      'public_otp_verifications',
      'public_refresh_tokens',
    ];

    for (const table of tables) {
      logger.info(`Truncating ${table}...`);
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }

    await client.query('COMMIT');
    logger.info('Coupon module data cleared successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error clearing coupon module data', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await clearCouponModuleData();
    process.exit(0);
  } catch (error) {
    logger.error('Clear coupon module script failed', { error });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { clearCouponModuleData };
