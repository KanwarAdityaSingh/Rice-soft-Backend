import { PoolClient } from 'pg';
import type { CouponStatus } from '../constants/coupon-status';
import { BadRequestError } from '../utils/errors';
import { CouponStatusHistoryDAO } from '../dao/coupon-status-history.dao';
import { CouponDAO } from '../dao/coupon.dao';
import { Coupon } from '../models/coupon.model';

const ALLOWED_TRANSITIONS: Record<CouponStatus, CouponStatus[]> = {
  created: ['printed', 'void'],
  printed: ['allotted', 'void', 'expired'],
  allotted: ['redeemed', 'void', 'expired'],
  redeemed: [],
  expired: [],
  void: [],
};

export class CouponStateMachine {
  constructor(
    private couponDAO = new CouponDAO(),
    private historyDAO = new CouponStatusHistoryDAO()
  ) {}

  assertTransition(from: CouponStatus, to: CouponStatus): void {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestError(`Cannot transition coupon from ${from} to ${to}`);
    }
  }

  async transition(
    coupon: Coupon,
    toStatus: CouponStatus,
    options: {
      changedBy?: string | null;
      reason?: string;
      metadata?: Record<string, unknown>;
      redeemedAt?: Date | null;
    },
    client: PoolClient
  ): Promise<Coupon> {
    this.assertTransition(coupon.status, toStatus);

    const redeemedAt =
      toStatus === 'redeemed' ? (options.redeemedAt ?? new Date()) : coupon.redeemed_at;

    const updated = await this.couponDAO.updateStatusIf(
      coupon.coupon_id,
      coupon.status,
      toStatus,
      redeemedAt,
      client
    );
    if (!updated) {
      throw new BadRequestError(
        `Cannot transition coupon from ${coupon.status} to ${toStatus} (status changed concurrently)`
      );
    }

    await this.historyDAO.insert(
      {
        coupon_id: coupon.coupon_id,
        from_status: coupon.status,
        to_status: toStatus,
        changed_by: options.changedBy ?? null,
        reason: options.reason ?? null,
        metadata: options.metadata ?? null,
      },
      client
    );

    return updated;
  }

  async bulkTransition(
    coupons: Coupon[],
    toStatus: CouponStatus,
    options: { changedBy?: string | null; reason?: string },
    client: PoolClient
  ): Promise<Coupon[]> {
    const updated: Coupon[] = [];

    for (const coupon of coupons) {
      updated.push(
        await this.transition(
          coupon,
          toStatus,
          { changedBy: options.changedBy, reason: options.reason },
          client
        )
      );
    }

    return updated;
  }
}
