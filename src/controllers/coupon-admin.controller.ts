import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseHandler } from '../utils/response';
import { validate, uuidSchema } from '../utils/validators';
import { couponBatchService } from '../services/coupon-batch.service';
import { couponExportService } from '../services/coupon-export.service';
import { couponAdminService } from '../services/coupon-admin.service';
import { couponPayoutService } from '../services/coupon-payout.service';
import { promotionRuleService } from '../services/promotion-rule.service';
import { razorpayPayoutService } from '../services/razorpay-payout.service';
import { PayoutAttemptDAO } from '../dao/payout-attempt.dao';
import {
  createCouponBatchSchema,
  markRedemptionPaidSchema,
  createPromotionRuleSchema,
  updatePromotionRuleSchema,
  togglePromotionRuleSchema,
  bulkMarkRedemptionsPaidSchema,
  unmarkRedemptionPaidSchema,
  redemptionAttemptListQuerySchema,
  previewPromotionRuleStackSchema,
  promotionRuleStatsQuerySchema,
  couponListQuerySchema,
  redemptionListQuerySchema,
} from '../utils/coupon.validators';
import { CreateCouponBatchDTO, CreatePromotionRuleDTO, UpdatePromotionRuleDTO } from '../models/coupon.model';
import type { CouponStatus } from '../constants/coupon-status';
import { appConfig } from '../config/app.config';
import { createHmac, timingSafeEqual } from 'crypto';
import { BadRequestError } from '../utils/errors';

export class CouponAdminController {
  async createCouponBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreateCouponBatchDTO>(createCouponBatchSchema, req.body);
      const batch = await couponBatchService.createBatch({
        ...body,
        created_by: req.user?.userId,
      });
      return ResponseHandler.created(res, batch, 'Coupon batch created');
    } catch (error) {
      next(error);
    }
  }

  async generateBatchCodes(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.generateCodes(batchId);
      return ResponseHandler.success(res, result, 'Codes generated');
    } catch (error) {
      next(error);
    }
  }

  async getAllCouponBatches(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '50'), 10);
      const result = await couponBatchService.getAllBatches(page, limit);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getCouponBatchById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.getBatchById(batchId);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async exportBatchCodes(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const csv = await couponExportService.exportBatchCsv(batchId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="coupon-batch-${batchId}.csv"`);
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  async markBatchPrinted(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.markBatchPrinted(batchId, req.user?.userId);
      return ResponseHandler.success(res, result, 'Batch marked printed');
    } catch (error) {
      next(error);
    }
  }

  async markBatchAllotted(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.markBatchAllotted(batchId, req.user?.userId);
      return ResponseHandler.success(res, result, 'Batch marked allotted');
    } catch (error) {
      next(error);
    }
  }

  async archiveCouponBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const batch = await couponBatchService.archiveBatch(batchId);
      return ResponseHandler.success(res, batch, 'Batch archived');
    } catch (error) {
      next(error);
    }
  }

  async voidCouponBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.voidBatch(batchId, req.user?.userId);
      return ResponseHandler.success(res, result, 'Batch voided');
    } catch (error) {
      next(error);
    }
  }

  async deleteCouponBatch(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const batchId = validate<string>(uuidSchema, req.params.batchId);
      const result = await couponBatchService.deleteBatch(batchId);
      return ResponseHandler.success(res, result, 'Batch deleted permanently');
    } catch (error) {
      next(error);
    }
  }

  async getAllCoupons(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{
        batchId?: string;
        status?: CouponStatus;
        code?: string;
        page?: number;
        limit?: number;
      }>(couponListQuerySchema, req.query);
      const result = await couponAdminService.getCoupons(query);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getCouponByCode(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const code = String(req.params.code).toUpperCase();
      const result = await couponAdminService.getCouponByCode(code);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async voidCoupon(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const code = String(req.params.code).toUpperCase();
      const coupon = await couponAdminService.voidCoupon(code, req.user?.userId);
      return ResponseHandler.success(res, coupon, 'Coupon voided');
    } catch (error) {
      next(error);
    }
  }

  async markCouponPrinted(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const code = String(req.params.code).toUpperCase();
      const coupon = await couponAdminService.markCouponPrinted(code, req.user?.userId);
      return ResponseHandler.success(res, coupon, 'Coupon marked printed');
    } catch (error) {
      next(error);
    }
  }

  async markCouponAllotted(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const code = String(req.params.code).toUpperCase();
      const coupon = await couponAdminService.markCouponAllotted(code, req.user?.userId);
      return ResponseHandler.success(res, coupon, 'Coupon marked allotted');
    } catch (error) {
      next(error);
    }
  }

  async getAllRedemptions(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{
        payoutStatus?: 'pending' | 'paid';
        batchId?: string;
        phone?: string;
        code?: string;
        fromDate?: string;
        toDate?: string;
        page?: number;
        limit?: number;
      }>(redemptionListQuerySchema, req.query);
      const result = await couponAdminService.getRedemptions(query);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getPendingPayouts(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '50'), 10);
      const result = await couponAdminService.getPendingPayouts(page, limit);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getRedemptionById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const result = await couponAdminService.getRedemptionById(id);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async markRedemptionPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{ payment_reference: string; notes?: string }>(
        markRedemptionPaidSchema,
        req.body
      );
      const result = await couponPayoutService.markPaid(id, {
        payment_reference: body.payment_reference,
        paid_by: req.user?.userId,
      });
      return ResponseHandler.success(res, result, 'Redemption marked paid');
    } catch (error) {
      next(error);
    }
  }

  async bulkMarkRedemptionsPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{ items: { redemption_id: string; payment_reference: string }[] }>(
        bulkMarkRedemptionsPaidSchema,
        req.body
      );
      const result = await couponPayoutService.bulkMarkPaid(body.items, req.user?.userId);
      const message =
        result.failed.length === 0
          ? `Marked ${result.succeeded.length} redemption(s) paid`
          : `Marked ${result.succeeded.length} paid, ${result.failed.length} failed`;
      return ResponseHandler.success(res, result, message);
    } catch (error) {
      next(error);
    }
  }

  async unmarkRedemptionPaid(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{ reason: string }>(unmarkRedemptionPaidSchema, req.body);
      const result = await couponPayoutService.unmarkPaid(id, body.reason);
      return ResponseHandler.success(res, result, 'Redemption reverted to pending');
    } catch (error) {
      next(error);
    }
  }

  async getRedeemerByPhone(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const phone = String(req.params.phone);
      const result = await couponAdminService.getRedeemerByPhone(phone);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getAllRedeemers(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const page = parseInt(String(req.query.page ?? '1'), 10);
      const limit = parseInt(String(req.query.limit ?? '50'), 10);
      const result = await couponAdminService.getAllRedeemers(page, limit);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async createPromotionRule(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<CreatePromotionRuleDTO>(createPromotionRuleSchema, req.body);
      const rule = await promotionRuleService.create({ ...body, created_by: req.user?.userId });
      return ResponseHandler.created(res, rule, 'Promotion rule created');
    } catch (error) {
      next(error);
    }
  }

  async getAllPromotionRules(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.includeInactive !== 'false';
      const rules = await promotionRuleService.getAll(includeInactive);
      return ResponseHandler.success(res, rules);
    } catch (error) {
      next(error);
    }
  }

  async getPromotionRuleById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const rule = await promotionRuleService.getById(id);
      return ResponseHandler.success(res, rule);
    } catch (error) {
      next(error);
    }
  }

  async updatePromotionRule(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<UpdatePromotionRuleDTO>(updatePromotionRuleSchema, req.body);
      const rule = await promotionRuleService.update(id, body);
      return ResponseHandler.success(res, rule, 'Promotion rule updated');
    } catch (error) {
      next(error);
    }
  }

  async togglePromotionRule(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const body = validate<{ is_active: boolean }>(togglePromotionRuleSchema, req.body);
      const rule = await promotionRuleService.toggle(id, body.is_active);
      return ResponseHandler.success(res, rule, 'Promotion rule updated');
    } catch (error) {
      next(error);
    }
  }

  async deletePromotionRule(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const result = await promotionRuleService.delete(id);
      return ResponseHandler.success(res, result, 'Promotion rule deleted');
    } catch (error) {
      next(error);
    }
  }

  async previewPromotionRuleStack(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const body = validate<{
        phone?: string;
        total_redemptions?: number;
        coupon_batch_id: string;
        face_value_paise?: number;
        include_inactive?: boolean;
        include_skipped?: boolean;
      }>(previewPromotionRuleStackSchema, req.body);
      const result = await promotionRuleService.previewStack(body);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getPromotionRuleStats(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const query = validate<{
        fromDate?: string;
        toDate?: string;
        recentLimit?: number;
      }>(promotionRuleStatsQuerySchema, req.query);
      const result = await promotionRuleService.getStatsById(id, query);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getRedemptionAttempts(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const query = validate<{
        code?: string;
        phone?: string;
        ip?: string;
        failureReason?: string;
        fromDate?: string;
        toDate?: string;
        page?: number;
        limit?: number;
      }>(redemptionAttemptListQuerySchema, req.query);
      const result = await couponAdminService.getRedemptionAttempts(query);
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async retryPayout(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const redemptionId = validate<string>(uuidSchema, req.params.redemptionId);
      await razorpayPayoutService.retryPayout(redemptionId);
      return ResponseHandler.success(res, { redemptionId }, 'Payout retry queued');
    } catch (error) {
      next(error);
    }
  }

  async getPayoutAttempts(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const redemptionId = validate<string>(uuidSchema, req.params.redemptionId);
      const dao = new PayoutAttemptDAO();
      const attempts = await dao.findByRedemptionId(redemptionId);
      return ResponseHandler.success(res, attempts);
    } catch (error) {
      next(error);
    }
  }

  async razorpayWebhook(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const signature = req.headers['x-razorpay-signature'];
      if (!signature || typeof signature !== 'string') {
        throw new BadRequestError('Missing Razorpay signature');
      }

      const secret = appConfig.razorpay.webhookSecret;
      if (!secret) {
        throw new BadRequestError('Razorpay webhook not configured');
      }

      const body = JSON.stringify(req.body);
      const expected = createHmac('sha256', secret).update(body).digest('hex');
      const valid =
        expected.length === signature.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

      if (!valid) {
        throw new BadRequestError('Invalid Razorpay signature');
      }

      const event = String(req.body?.event ?? '');
      await razorpayPayoutService.handleWebhook(event, req.body);
      return ResponseHandler.success(res, { received: true });
    } catch (error) {
      next(error);
    }
  }
}

export const couponAdminController = new CouponAdminController();
