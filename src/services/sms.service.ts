import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

export class SmsService {
  /**
   * Send an OTP SMS using Kaleyra
   */
  async sendOtpSms(normalizedPhoneE164Digits: string, message: string): Promise<void> {
    const { url, apiKey, senderId, templateId } = appConfig.apis.kaleyra;

    if (!apiKey || !url || !senderId || !templateId) {
      logger.error('Kaleyra API not configured correctly');
      throw new InternalServerError('SMS service is not configured');
    }

    // Kaleyra expects to field like 91XXXXXXXXXX; we pass normalized digits
    const formBody = new URLSearchParams({
      source: 'API',
      to: normalizedPhoneE164Digits,
      sender: senderId,
      body: message,
      template_id: templateId,
      type: 'OTP',
    });

    const headers: Record<string, string> = {
      'api-key': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    logger.info('Sending OTP SMS via Kaleyra', {
      to: normalizedPhoneE164Digits,
      sender: senderId,
      templateId: templateId,
    });
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formBody.toString(),
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (!response.ok) {
        logger.error('Kaleyra SMS send failed', {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
          phone: normalizedPhoneE164Digits,
        });
        throw new InternalServerError('Failed to send OTP SMS');
      }

      logger.info('Kaleyra SMS sent successfully', {
        status: response.status,
        response: responseData,
        phone: normalizedPhoneE164Digits.substring(0, 4) + '****' + normalizedPhoneE164Digits.substring(8),
      });
    } catch (error: any) {
      logger.error('Kaleyra SMS send error', {
        error: error.message || error,
        stack: error.stack,
        phone: normalizedPhoneE164Digits,
      });
      throw error;
    }
  }
}

export const smsService = new SmsService();


