import bcrypt from 'bcrypt';
import { userDAO } from '../dao/user.dao';
import { otpDAO } from '../dao/otp.dao';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';
import { smsService } from './sms.service';

export interface OtpContext {
  ipAddress?: string;
  userAgent?: string;
}

export class OtpService {
  public normalizePhone(phone: string): string {
    // Strip non-digits
    const digits = (phone || '').replace(/\D/g, '');
    // If already starts with 91 and length 12, keep; if 10 digits, prefix 91
    if (digits.startsWith('91') && digits.length === 12) {
      return digits;
    }
    if (digits.length === 10) {
      return `91${digits}`;
    }
    // Fallback: return as-is; validators should guard this
    return digits;
  }

  private maskPhone(e164Digits: string): string {
    // e.g., 91XXXXXXXXXX -> show **** last 4
    const last4 = e164Digits.slice(-4);
    return `******${last4}`;
  }

  private generateNumericOtp(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
  }

  async generateAndSend(phone: string, _context?: OtpContext): Promise<{ maskedPhone: string; resendAfterSec: number }> {
    const normalized = this.normalizePhone(phone);
    const resendCooldown = appConfig.otp.resendCooldownSec;

    // Ensure user exists and is active
    const user = await userDAO.findByPhone(normalized);
    if (!user || !user.is_active) {
      // Intentionally do not reveal enumeration; return generic success
      logger.warn('OTP requested for unknown or inactive phone', { phone: normalized });
      return { maskedPhone: this.maskPhone(normalized), resendAfterSec: resendCooldown };
    }

    // Enforce resend cooldown against last active OTP
    const latest = await otpDAO.findLatestActiveByPhone(normalized);
    if (latest) {
      const secondsSinceLastSent = (Date.now() - new Date(latest.last_sent_at).getTime()) / 1000;
      if (secondsSinceLastSent < resendCooldown) {
        // Do not send another OTP; client can show resend timer
        logger.info('OTP resend cooldown active', { phone: normalized });
        return { maskedPhone: this.maskPhone(normalized), resendAfterSec: Math.ceil(resendCooldown - secondsSinceLastSent) };
      }
    }

    const otp = this.generateNumericOtp(appConfig.otp.length);
    const otpHash = await bcrypt.hash(otp, appConfig.security.bcryptRounds);
    const expiresAt = new Date(Date.now() + appConfig.otp.ttlMinutes * 60 * 1000);

    await otpDAO.create({
      user_id: user.id,
      phone: normalized,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    // Compose message
    const message = `${otp} is the one time password for login on santkripa . This is valid only for 30 minutes.\nSantKripa Equipments Private Limited`;
    // Log OTP for non-production environments to aid testing (do not enable in production)
    try {
      // Lazy import to avoid circulars
      const { isProduction } = await import('../config/app.config');
      if (!isProduction) {
        logger.info('Generated OTP for login', { phone: this.maskPhone(normalized), otp });
      }
    } catch {
      // no-op
    }
    await smsService.sendOtpSms(normalized, message);

    return { maskedPhone: this.maskPhone(normalized), resendAfterSec: resendCooldown };
  }

  async verifyOtp(phone: string, otp: string): Promise<{ userId: string }> {
    const normalized = this.normalizePhone(phone);
    const user = await userDAO.findByPhone(normalized);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }
    if (!user.is_active) {
      throw new UnauthorizedError('Account is inactive');
    }

    const latest = await otpDAO.findLatestActiveByPhone(normalized);
    if (!latest) {
      throw new UnauthorizedError('OTP expired or not found');
    }

    if (latest.attempts >= appConfig.otp.maxAttempts) {
      await otpDAO.markUsed(latest.id);
      throw new UnauthorizedError('Too many invalid attempts');
    }

    const isValid = await bcrypt.compare(otp, latest.otp_hash);
    if (!isValid) {
      const attempts = await otpDAO.incrementAttempts(latest.id);
      logger.warn('Invalid OTP attempt', { userId: user.id, attempts });
      throw new UnauthorizedError('Invalid OTP');
    }

    // Mark used on success
    await otpDAO.markUsed(latest.id);

    return { userId: user.id };
  }
}

export const otpService = new OtpService();


