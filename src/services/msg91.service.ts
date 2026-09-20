import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

export interface Msg91FlowRecipient {
  mobiles: string;
  [variable: string]: string;
}

export class Msg91Service {
  isConfigured(): boolean {
    const { authKey, templateId } = appConfig.apis.msg91;
    return Boolean(authKey && templateId);
  }

  /** 10-digit local or 91XXXXXXXXXX → MSG91 international digits (no +). */
  toMsg91Mobile(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    throw new InternalServerError('Invalid phone for MSG91 SMS');
  }

  /**
   * Send one coupon OTP via MSG91 Flow (POST /api/v5/flow).
   * Recipient keys must match the flow's ##variable## names exactly.
   */
  async sendCouponOtp(phone: string, otp: string, expiryMinutes: number): Promise<void> {
    const { url, authKey, templateId, senderId, otpVar, expiryVar, shortUrl } = appConfig.apis.msg91;

    if (!authKey || !templateId) {
      throw new InternalServerError('MSG91 is not configured');
    }

    const mobiles = this.toMsg91Mobile(phone);
    const recipient: Msg91FlowRecipient = {
      mobiles,
      [otpVar]: otp,
    };
    if (expiryVar) {
      recipient[expiryVar] = String(expiryMinutes);
    }

    const body: Record<string, unknown> = {
      template_id: templateId,
      short_url: shortUrl,
      realTimeResponse: '1',
      recipients: [recipient],
    };
    if (senderId) {
      body.sender = senderId;
    }

    logger.info('Sending coupon OTP via MSG91 Flow', {
      to: `${mobiles.slice(0, 4)}****${mobiles.slice(-4)}`,
      templateId,
      otpVar,
      expiryVar: expiryVar || undefined,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authkey: authKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('MSG91 Flow request failed', { error: message });
      throw new InternalServerError('Failed to send OTP SMS');
    }

    const responseText = await response.text();
    let responseData: { type?: string; message?: string } | string = responseText;
    try {
      responseData = JSON.parse(responseText) as { type?: string; message?: string };
    } catch {
      // keep raw text
    }

    const type =
      typeof responseData === 'object' && responseData ? responseData.type : undefined;
    if (!response.ok || type === 'error') {
      logger.error('MSG91 Flow send failed', {
        status: response.status,
        response: responseData,
      });
      throw new InternalServerError('Failed to send OTP SMS');
    }

    logger.info('MSG91 coupon OTP sent', {
      status: response.status,
      type: type || 'ok',
    });
  }
}

export const msg91Service = new Msg91Service();
