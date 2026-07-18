import { PublicOtpDAO } from '../dao/public-otp.dao';
import { appConfig, isDevelopment } from '../config/app.config';
import { BadRequestError } from '../utils/errors';
import { normalizePhone } from '../utils/coupon.helpers';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class PublicOtpService {
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_WINDOW_MINUTES = 15;
  private readonly MAX_OTPS_PER_WINDOW = 3;

  constructor(private otpDAO = new PublicOtpDAO()) {}

  async sendOtp(
    phone: string,
    purpose: string = 'login',
    context?: { ip?: string; user_agent?: string }
  ): Promise<{ otpSent: boolean; expiresAt: Date }> {
    const normalized = normalizePhone(phone);

    // Rate limiting: max 3 OTPs per 15 minutes
    const recentCount = await this.otpDAO.countRecentOtps(
      normalized,
      this.RATE_LIMIT_WINDOW_MINUTES
    );
    if (recentCount >= this.MAX_OTPS_PER_WINDOW) {
      throw new BadRequestError(
        `Too many OTP requests. Please try again after ${this.RATE_LIMIT_WINDOW_MINUTES} minutes.`
      );
    }

    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.otpDAO.create({
      phone: normalized,
      otp,
      purpose,
      expires_at: expiresAt,
      ip: context?.ip,
      user_agent: context?.user_agent,
    });

    await this.sendSms(normalized, otp);

    logger.info('OTP sent', {
      phone: normalized,
      purpose,
      expiresAt,
      smsEnabled: appConfig.coupons.publicSmsEnabled,
    });

    return { otpSent: true, expiresAt };
  }

  async verifyOtp(
    phone: string,
    otpInput: string,
    purpose: string = 'login'
  ): Promise<{ verified: boolean; phone: string }> {
    const normalized = normalizePhone(phone);
    const otpRecord = await this.otpDAO.findLatestUnverified(normalized, purpose);

    if (!otpRecord) {
      throw new BadRequestError('No pending OTP found or OTP expired');
    }

    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestError('Maximum OTP verification attempts exceeded. Request a new OTP.');
    }

    if (otpRecord.otp !== otpInput.trim()) {
      await this.otpDAO.incrementAttempts(otpRecord.otp_verification_id);
      throw new BadRequestError('Invalid OTP');
    }

    await this.otpDAO.markVerified(otpRecord.otp_verification_id);

    logger.info('OTP verified successfully', { phone: normalized, purpose });

    return { verified: true, phone: normalized };
  }

  private generateOtp(): string {
    const num = crypto.randomInt(100000, 999999);
    return num.toString();
  }

  private async sendSms(phone: string, otp: string): Promise<void> {
    if (!appConfig.coupons.publicSmsEnabled) {
      if (isDevelopment) {
        logger.info('Public OTP SMS disabled — OTP stored in DB only', { phone, otp });
      }
      return;
    }

    const { url, apiKey, senderId, templateId } = appConfig.apis.kaleyra;

    if (!apiKey || !url) {
      logger.warn('Kaleyra SMS not configured - OTP not sent', { phone });
      if (isDevelopment) {
        logger.info(`[DEV] OTP for ${phone}: ${otp}`);
      }
      return;
    }

    // Kaleyra expects E.164 digits with country code: 91XXXXXXXXXX
    // coupon.helpers.normalizePhone stores 10-digit local form.
    const kaleyraTo = phone.length === 10 ? `91${phone}` : phone;

    try {
      // MUST match DLT registered template EXACTLY (template_id in Kaleyra config)
      const message = [
        'AAAPL Rice Rewards',
        `Your verification code is ${otp}. Enter it to access your rewards account. This code expires in 10 minutes. Never share this code with anyone.`,
      ].join('\n');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          to: kaleyraTo,
          sender: senderId,
          type: 'OTP',
          template_id: templateId,
          body: message,
        }),
      });

      if (!response.ok) {
        logger.error('Failed to send OTP via Kaleyra', {
          phone: kaleyraTo,
          status: response.status,
        });
        if (isDevelopment) {
          logger.warn('[DEV] Kaleyra SMS failed but OTP is stored in database', { phone, otp });
          return;
        }
        throw new Error('Failed to send OTP');
      }

      logger.info('OTP sent via Kaleyra', { phone: kaleyraTo });
    } catch (error) {
      logger.error('Error sending OTP', { phone: kaleyraTo, error });
      if (isDevelopment) {
        logger.warn('[DEV] SMS send error ignored — OTP is stored in database', { phone, otp });
        return;
      }
      throw new Error('Failed to send OTP. Please try again.');
    }
  }
}

export const publicOtpService = new PublicOtpService();
