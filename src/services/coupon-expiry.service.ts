import { CouponDAO } from '../dao/coupon.dao';
import { CouponStatusHistoryDAO } from '../dao/coupon-status-history.dao';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

export class CouponExpiryService {
  constructor(
    private couponDAO = new CouponDAO(),
    private historyDAO = new CouponStatusHistoryDAO()
  ) {}

  async expireEligibleCoupons(): Promise<number> {
    return db.transaction(async (client) => {
      const expired = await this.couponDAO.expireEligible(client);

      if (expired.length > 0) {
        await this.historyDAO.bulkInsert(
          expired.map((c) => ({
            coupon_id: c.coupon_id,
            from_status: c.previous_status,
            to_status: 'expired' as const,
            reason: 'expiry cron',
          })),
          client
        );
      }

      if (expired.length > 0) {
        logger.info(`Expired ${expired.length} coupons`);
      }

      return expired.length;
    });
  }
}

export const couponExpiryService = new CouponExpiryService();
