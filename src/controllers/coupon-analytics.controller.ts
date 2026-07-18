import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseHandler } from '../utils/response';
import { validate } from '../utils/validators';
import { batchPerformanceQuerySchema } from '../utils/coupon.validators';
import { couponAnalyticsService } from '../services/coupon-analytics.service';
import { promotionRuleService } from '../services/promotion-rule.service';

export class CouponAnalyticsController {
  async getOverview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const result = await couponAnalyticsService.getOverview(fromDate, toDate);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getBatchPerformance(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{
        batchId?: string;
        page?: number;
        limit?: number;
      }>(batchPerformanceQuerySchema, req.query);
      const result = await couponAnalyticsService.getBatchPerformance(query);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getRedemptionTrends(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const granularity = (req.query.granularity as 'day' | 'week' | 'month') ?? 'day';
      const result = await couponAnalyticsService.getRedemptionTrends(fromDate, toDate, granularity);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getPayoutSummary(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const result = await couponAnalyticsService.getPayoutSummary();
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getRedeemerLeaderboard(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const limit = parseInt(String(req.query.limit ?? '20'), 10);
      const sortBy = (req.query.sortBy as 'count' | 'amount') ?? 'count';
      const result = await couponAnalyticsService.getRedeemerLeaderboard(limit, sortBy);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getFraudSignals(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const result = await couponAnalyticsService.getFraudSignals(fromDate, toDate);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getPromotionRulePerformance(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;
      const result = await promotionRuleService.getPerformance({ fromDate, toDate });
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

export const couponAnalyticsController = new CouponAnalyticsController();
