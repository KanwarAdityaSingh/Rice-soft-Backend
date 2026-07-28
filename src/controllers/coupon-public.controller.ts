import { Request, Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/response';
import { validate } from '../utils/validators';
import { couponRedeemService } from '../services/coupon-redeem.service';
import { couponBankVerifyService } from '../services/coupon-bank-verify.service';
import {
  verifyCouponSchema,
  redeemCouponSchema,
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  verifyCouponBankAccountSchema,
} from '../utils/coupon.validators';
import { RedeemCouponDTO, SendOtpRequest, VerifyOtpRequest } from '../models/coupon.model';
import { publicOtpService } from '../services/public-otp.service';
import { PublicAuthRequest } from '../middleware/public-auth.middleware';
import { couponAdminService } from '../services/coupon-admin.service';
import { refreshTokenService } from '../services/refresh-token.service';

export class CouponPublicController {
  async verifyCoupon(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const { code } = validate<{ code: string }>(verifyCouponSchema, req.body);
      const result = await couponRedeemService.verify(code, {
        ip: req.ip,
        phone: req.publicUser.phone, // Use authenticated phone from JWT
      });
      return ResponseHandler.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  async verifyBankAccount(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const { account_number, ifsc_code } = validate<{
        account_number: string;
        ifsc_code: string;
      }>(verifyCouponBankAccountSchema, req.query);

      const result = await couponBankVerifyService.verifyBankAccount(account_number, ifsc_code);

      return ResponseHandler.success(
        res,
        result,
        'Bank account verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async redeemCoupon(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const body = validate<RedeemCouponDTO>(redeemCouponSchema, req.body);
      
      // Use authenticated phone from JWT token
      const result = await couponRedeemService.redeem({
        ...body,
        phone: req.publicUser.phone, // Override with authenticated phone
        redeemed_ip: req.ip,
        redeemed_user_agent: req.headers['user-agent'],
      });
      return ResponseHandler.created(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  async sendOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { phone } = validate<SendOtpRequest>(sendOtpSchema, req.body);
      const result = await publicOtpService.sendOtp(phone, 'login', {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      });
      return ResponseHandler.success(res, result, 'OTP sent successfully');
    } catch (error) {
      next(error);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { phone, otp } = validate<VerifyOtpRequest>(verifyOtpSchema, req.body);
      const verification = await publicOtpService.verifyOtp(phone, otp, 'login');

      // Generate token pair (access + refresh tokens)
      const tokenPair = await refreshTokenService.issueTokenPair(verification.phone, {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      });

      return ResponseHandler.success(
        res,
        {
          ...tokenPair,
          phone: verification.phone,
        },
        'OTP verified successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async getMyRedemptions(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const result = await couponAdminService.getRedeemerByPhone(req.publicUser.phone);
      
      return ResponseHandler.success(res, {
        phone: result.redeemer.phone,
        name: result.redeemer.name,
        totalRedemptions: result.redeemer.total_redemptions,
        lifetimeEarnedPaise: result.redeemer.lifetime_earned_paise,
        redemptions: result.redemptions.map(r => ({
          publicRef: r.public_ref,
          code: r.code,
          baseAmountPaise: r.base_amount_paise,
          bonusAmountPaise: r.bonus_amount_paise,
          totalAmountPaise: r.total_amount_paise,
          payoutStatus: r.payout_status,
          paidAt: r.paid_at,
          paidVia: r.paid_via,
          redeemedAt: r.created_at,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyProfile(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const result = await couponAdminService.getRedeemerByPhone(req.publicUser.phone);
      const r = result.redeemer;
      const hasBank =
        Boolean(r.account_holder_name?.trim()) ||
        Boolean(r.account_number?.trim()) ||
        Boolean(r.ifsc?.trim()) ||
        Boolean(r.bank_name?.trim());

      return ResponseHandler.success(res, {
        phone: r.phone,
        name: r.name,
        upiVpa: r.upi_vpa,
        bankDetails: hasBank
          ? {
              accountHolderName: r.account_holder_name,
              accountNumber: r.account_number,
              ifsc: r.ifsc,
              bankName: r.bank_name,
              verified: Boolean(r.bank_details_verified_at),
              verifiedAt: r.bank_details_verified_at,
            }
          : null,
        totalRedemptions: r.total_redemptions,
        lifetimeEarnedPaise: r.lifetime_earned_paise,
        firstRedeemedAt: r.first_redeemed_at,
        lastRedeemedAt: r.last_redeemed_at,
      });
    } catch (error) {
      next(error);
    }
  }

  async checkPayoutStatus(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const { publicRef } = req.params;
      
      const result = await couponAdminService.getRedeemerByPhone(req.publicUser.phone);
      
      // Find the specific redemption by publicRef
      const redemption = result.redemptions.find(r => r.public_ref === publicRef);
      
      if (!redemption) {
        return ResponseHandler.error(res, 'Redemption not found or does not belong to you', 404);
      }
      
      return ResponseHandler.success(res, {
        publicRef: redemption.public_ref,
        code: redemption.code,
        totalAmountPaise: redemption.total_amount_paise,
        payoutStatus: redemption.payout_status,
        paidAt: redemption.paid_at,
        paidVia: redemption.paid_via,
        lastPayoutError: redemption.last_payout_error,
        redeemedAt: redemption.created_at,
      });
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { refreshToken } = validate<{ refreshToken: string }>(refreshTokenSchema, req.body);
      
      const tokenPair = await refreshTokenService.refreshAccessToken(refreshToken, {
        ip: req.ip,
        user_agent: req.headers['user-agent'],
      });

      return ResponseHandler.success(res, tokenPair, 'Token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  async logout(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const { refreshToken } = validate<{ refreshToken: string }>(refreshTokenSchema, req.body);
      
      await refreshTokenService.revokeToken(refreshToken, 'user_logout');

      return ResponseHandler.success(res, { loggedOut: true }, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const count = await refreshTokenService.revokeAllTokens(
        req.publicUser.phone,
        'logout_all_devices'
      );

      return ResponseHandler.success(
        res,
        { loggedOut: true, sessionsRevoked: count },
        'Logged out from all devices'
      );
    } catch (error) {
      next(error);
    }
  }

  async getSessions(req: PublicAuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      if (!req.publicUser?.phone) {
        throw new Error('Unauthorized');
      }

      const sessions = await refreshTokenService.getActiveSessions(req.publicUser.phone);

      return ResponseHandler.success(res, { sessions });
    } catch (error) {
      next(error);
    }
  }
}

export const couponPublicController = new CouponPublicController();
