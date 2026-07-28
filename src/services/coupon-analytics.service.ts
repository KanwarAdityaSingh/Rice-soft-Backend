import { db } from '../database/connection';
import { buildDateRangeClause } from '../utils/analytics-date-filter';

export class CouponAnalyticsService {
  async getOverview(fromDate?: string, toDate?: string) {
    const dateFilter = buildDateRangeClause('r.created_at', fromDate, toDate);

    const couponStats = await db.query(`
      SELECT
        COUNT(*)::int AS total_generated,
        COUNT(*) FILTER (WHERE status = 'allotted')::int AS allotted,
        COUNT(*) FILTER (WHERE status = 'redeemed')::int AS redeemed,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired
      FROM coupons
    `);

    const redemptionStats = await db.query(
      `
      SELECT
        COUNT(*)::int AS total_count,
        COALESCE(SUM(total_amount_paise), 0)::bigint AS total_amount_paise,
        COALESCE(SUM(bonus_amount_paise), 0)::bigint AS bonus_amount_paise
      FROM redemptions r
      WHERE 1=1 ${dateFilter.clause}
    `,
      dateFilter.params
    );

    const payoutStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE payout_status = 'pending')::int AS pending_count,
        COALESCE(SUM(total_amount_paise) FILTER (WHERE payout_status = 'pending'), 0)::bigint AS pending_amount_paise,
        COUNT(*) FILTER (WHERE payout_status = 'paid')::int AS paid_count,
        COALESCE(SUM(total_amount_paise) FILTER (WHERE payout_status = 'paid'), 0)::bigint AS paid_amount_paise
      FROM redemptions
    `);

    const cs = couponStats.rows[0];
    const inMarket = Number(cs.allotted) + Number(cs.redeemed);
    const redemptionRate = inMarket > 0 ? Math.round((Number(cs.redeemed) / inMarket) * 1000) / 10 : 0;

    return {
      coupons: {
        totalGenerated: Number(cs.total_generated),
        allotted: Number(cs.allotted),
        redeemed: Number(cs.redeemed),
        expired: Number(cs.expired),
        redemptionRate,
      },
      redemptions: {
        totalCount: Number(redemptionStats.rows[0].total_count),
        totalAmountPaise: Number(redemptionStats.rows[0].total_amount_paise),
        bonusAmountPaise: Number(redemptionStats.rows[0].bonus_amount_paise),
      },
      payouts: {
        pendingCount: Number(payoutStats.rows[0].pending_count),
        pendingAmountPaise: Number(payoutStats.rows[0].pending_amount_paise),
        paidCount: Number(payoutStats.rows[0].paid_count),
        paidAmountPaise: Number(payoutStats.rows[0].paid_amount_paise),
      },
    };
  }

  async getBatchPerformance(filters?: { batchId?: string; page?: number; limit?: number }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    let filter = '';
    let i = 1;

    if (filters?.batchId) {
      filter = `WHERE cb.coupon_batch_id = $${i++}`;
      params.push(filters.batchId);
    }

    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupon_batches cb ${filter}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const result = await db.query(
      `
      SELECT
        cb.coupon_batch_id,
        cb.batch_code,
        cb.face_value_paise,
        cb.total_count,
        COUNT(c.coupon_id)::int AS generated,
        COUNT(*) FILTER (WHERE c.status = 'allotted')::int AS allotted,
        COUNT(*) FILTER (WHERE c.status = 'redeemed')::int AS redeemed,
        COALESCE(SUM(r.total_amount_paise) FILTER (WHERE r.payout_status = 'pending'), 0)::bigint AS pending_payout_paise,
        COALESCE(SUM(r.total_amount_paise) FILTER (WHERE r.payout_status = 'paid'), 0)::bigint AS paid_out_paise
      FROM coupon_batches cb
      LEFT JOIN coupons c ON c.coupon_batch_id = cb.coupon_batch_id
      LEFT JOIN redemptions r ON r.coupon_batch_id = cb.coupon_batch_id
      ${filter}
      GROUP BY cb.coupon_batch_id, cb.batch_code, cb.face_value_paise, cb.total_count
      ORDER BY cb.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `,
      [...params, limit, offset]
    );

    return {
      rows: result.rows.map((row) => {
        const allotted = Number(row.allotted);
        const redeemed = Number(row.redeemed);
        const inMarket = allotted + redeemed;
        return {
          batchId: row.coupon_batch_id,
          batchCode: row.batch_code,
          faceValuePaise: Number(row.face_value_paise),
          totalCount: Number(row.total_count),
          generated: Number(row.generated),
          allotted,
          redeemed,
          redemptionRate: inMarket > 0 ? Math.round((redeemed / inMarket) * 1000) / 10 : 0,
          pendingPayoutPaise: Number(row.pending_payout_paise),
          paidOutPaise: Number(row.paid_out_paise),
        };
      }),
      page,
      limit,
      total,
    };
  }

  async getRedemptionTrends(fromDate?: string, toDate?: string, granularity: 'day' | 'week' | 'month' = 'day') {
    const trunc = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day';
    const dateFilter = buildDateRangeClause('created_at', fromDate, toDate);

    const result = await db.query(
      `
      SELECT
        DATE_TRUNC('${trunc}', created_at)::date AS date,
        COUNT(*)::int AS redemption_count,
        COALESCE(SUM(total_amount_paise), 0)::bigint AS total_amount_paise
      FROM redemptions
      WHERE 1=1 ${dateFilter.clause}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
      dateFilter.params
    );

    return {
      trends: result.rows.map((row) => ({
        date: row.date,
        redemptionCount: Number(row.redemption_count),
        totalAmountPaise: Number(row.total_amount_paise),
      })),
    };
  }

  async getPayoutSummary() {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE payout_status = 'pending')::int AS pending_count,
        COALESCE(SUM(total_amount_paise) FILTER (WHERE payout_status = 'pending'), 0)::bigint AS pending_amount_paise,
        COUNT(*) FILTER (WHERE payout_status = 'paid' AND paid_via = 'manual')::int AS paid_manual_count,
        COALESCE(SUM(total_amount_paise) FILTER (WHERE payout_status = 'paid' AND paid_via = 'manual'), 0)::bigint AS paid_manual_amount_paise,
        COUNT(*) FILTER (WHERE payout_status = 'paid' AND paid_via = 'cashfree')::int AS paid_cashfree_count,
        COALESCE(SUM(total_amount_paise) FILTER (WHERE payout_status = 'paid' AND paid_via = 'cashfree'), 0)::bigint AS paid_cashfree_amount_paise
      FROM redemptions
    `);

    const failedAttempts = await db.query(`
      SELECT COUNT(*)::int AS count FROM payout_attempts WHERE status = 'failed'
    `);

    const row = result.rows[0];
    return {
      pending: {
        count: Number(row.pending_count),
        amountPaise: Number(row.pending_amount_paise),
      },
      paidManual: {
        count: Number(row.paid_manual_count),
        amountPaise: Number(row.paid_manual_amount_paise),
      },
      paidCashfree: {
        count: Number(row.paid_cashfree_count),
        amountPaise: Number(row.paid_cashfree_amount_paise),
      },
      cashfreeFailedAttempts: Number(failedAttempts.rows[0].count),
    };
  }

  async getRedeemerLeaderboard(limit = 20, sortBy: 'count' | 'amount' = 'count') {
    const order = sortBy === 'amount' ? 'lifetime_earned_paise DESC' : 'total_redemptions DESC';
    const result = await db.query(
      `
      SELECT phone, name, total_redemptions, lifetime_earned_paise
      FROM redeemers
      ORDER BY ${order}
      LIMIT $1
    `,
      [limit]
    );

    return {
      redeemers: result.rows.map((row) => ({
        phone: row.phone,
        name: row.name,
        totalRedemptions: Number(row.total_redemptions),
        lifetimeEarnedPaise: Number(row.lifetime_earned_paise),
      })),
    };
  }

  async getFraudSignals(fromDate?: string, toDate?: string) {
    const dateFilter = buildDateRangeClause('created_at', fromDate, toDate);

    const [failed, reasonBreakdown, topCodes, topIps, highPhones] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM redemption_attempts WHERE 1=1 ${dateFilter.clause}`, dateFilter.params),
      db.query(
        `SELECT failure_reason, COUNT(*)::int AS count
         FROM redemption_attempts WHERE 1=1 ${dateFilter.clause}
         GROUP BY failure_reason ORDER BY count DESC`,
        dateFilter.params
      ),
      db.query(
        `SELECT LEFT(code_attempted, 4) AS code_prefix, COUNT(*)::int AS attempts
         FROM redemption_attempts WHERE code_attempted IS NOT NULL ${dateFilter.clause}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        dateFilter.params
      ),
      db.query(
        `SELECT ip::text, COUNT(*)::int AS attempts FROM redemption_attempts
         WHERE ip IS NOT NULL ${dateFilter.clause}
         GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
        dateFilter.params
      ),
      db.query(
        `SELECT phone, total_redemptions FROM redeemers
         WHERE total_redemptions >= 5 ORDER BY total_redemptions DESC LIMIT 10`
      ),
    ]);

    const breakdown = reasonBreakdown.rows.reduce((acc, row) => {
      acc[row.failure_reason] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      failedAttempts: Number(failed.rows[0].count),
      failureReasonBreakdown: breakdown,
      topFailedCodes: topCodes.rows.map((r) => ({
        codePrefix: r.code_prefix,
        attempts: Number(r.attempts),
      })),
      topFailedIps: topIps.rows.map((r) => ({
        ip: r.ip,
        attempts: Number(r.attempts),
      })),
      phonesWithHighRedemptions: highPhones.rows.map((r) => ({
        phone: r.phone,
        count: Number(r.total_redemptions),
      })),
    };
  }
}

export const couponAnalyticsService = new CouponAnalyticsService();
