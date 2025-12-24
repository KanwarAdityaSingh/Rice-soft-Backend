import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

export interface WhatsAppMessagePayload {
  to: string; // WhatsApp number with country code (e.g., 919876543210)
  templateName?: string;
  templateParams?: string[];
  message?: string; // For text messages
  mediaUrl?: string; // For sending PDFs/images
  mediaType?: 'document' | 'image' | 'video';
  filename?: string; // Filename for documents
  caption?: string; // Caption for media
}

export interface WhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  private normalizePhone(phone: string): string {
    // Strip non-digits
    const digits = (phone || '').replace(/\D/g, '');
    // If 10 digits, assume India and prepend 91
    if (digits.length === 10) {
      return `91${digits}`;
    }
    return digits;
  }

  /**
   * Send a WhatsApp template message using Kaleyra
   */
  async sendTemplateMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppResponse> {
    const { whatsappUrl, apiKey, whatsappFromNumber } = appConfig.apis.kaleyra;

    if (!apiKey || !whatsappUrl || !whatsappFromNumber) {
      logger.error('Kaleyra WhatsApp API not configured correctly');
      throw new InternalServerError('WhatsApp service is not configured');
    }

    const normalizedPhone = this.normalizePhone(payload.to);

    const requestBody: Record<string, any> = {
      from: whatsappFromNumber,
      to: normalizedPhone,
      type: 'template',
      template: {
        name: payload.templateName || appConfig.apis.kaleyra.whatsappTemplateName,
        language: {
          code: 'en',
        },
      },
    };

    // Add template parameters if provided
    if (payload.templateParams && payload.templateParams.length > 0) {
      requestBody.template.components = [
        {
          type: 'body',
          parameters: payload.templateParams.map((param) => ({
            type: 'text',
            text: param,
          })),
        },
      ];
    }

    // Add media header if provided (for document/PDF)
    if (payload.mediaUrl) {
      const headerComponent: Record<string, any> = {
        type: 'header',
        parameters: [
          {
            type: payload.mediaType || 'document',
            [payload.mediaType || 'document']: {
              link: payload.mediaUrl,
            },
          },
        ],
      };

      if (payload.filename && payload.mediaType === 'document') {
        headerComponent.parameters[0].document.filename = payload.filename;
      }

      if (requestBody.template.components) {
        requestBody.template.components.unshift(headerComponent);
      } else {
        requestBody.template.components = [headerComponent];
      }
    }

    const headers: Record<string, string> = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    };

    logger.info('Sending WhatsApp template message via Kaleyra', {
      to: normalizedPhone,
      templateName: payload.templateName,
      hasMedia: !!payload.mediaUrl,
    });

    try {
      const response = await fetch(whatsappUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (!response.ok) {
        logger.error('Kaleyra WhatsApp send failed', {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
          phone: normalizedPhone,
        });
        return {
          success: false,
          error: responseData?.error?.message || 'Failed to send WhatsApp message',
        };
      }

      logger.info('Kaleyra WhatsApp sent successfully', {
        status: response.status,
        response: responseData,
        phone: normalizedPhone.substring(0, 4) + '****' + normalizedPhone.substring(8),
      });

      return {
        success: true,
        messageId: responseData?.id || responseData?.message_id,
      };
    } catch (error: any) {
      logger.error('Kaleyra WhatsApp send error', {
        error: error.message || error,
        stack: error.stack,
        phone: normalizedPhone,
      });
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a WhatsApp text message (session message)
   */
  async sendTextMessage(to: string, message: string): Promise<WhatsAppResponse> {
    const { whatsappUrl, apiKey, whatsappFromNumber } = appConfig.apis.kaleyra;

    if (!apiKey || !whatsappUrl || !whatsappFromNumber) {
      logger.error('Kaleyra WhatsApp API not configured correctly');
      throw new InternalServerError('WhatsApp service is not configured');
    }

    const normalizedPhone = this.normalizePhone(to);

    const requestBody = {
      from: whatsappFromNumber,
      to: normalizedPhone,
      type: 'text',
      text: {
        body: message,
      },
    };

    const headers: Record<string, string> = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    };

    logger.info('Sending WhatsApp text message via Kaleyra', {
      to: normalizedPhone,
      messageLength: message.length,
    });

    try {
      const response = await fetch(whatsappUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (!response.ok) {
        logger.error('Kaleyra WhatsApp text message failed', {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
          phone: normalizedPhone,
        });
        return {
          success: false,
          error: responseData?.error?.message || 'Failed to send WhatsApp message',
        };
      }

      logger.info('Kaleyra WhatsApp text sent successfully', {
        status: response.status,
        phone: normalizedPhone.substring(0, 4) + '****' + normalizedPhone.substring(8),
      });

      return {
        success: true,
        messageId: responseData?.id || responseData?.message_id,
      };
    } catch (error: any) {
      logger.error('Kaleyra WhatsApp text send error', {
        error: error.message || error,
        stack: error.stack,
        phone: normalizedPhone,
      });
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Send a WhatsApp document (PDF) message
   */
  async sendDocument(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<WhatsAppResponse> {
    const { whatsappUrl, apiKey, whatsappFromNumber } = appConfig.apis.kaleyra;

    if (!apiKey || !whatsappUrl || !whatsappFromNumber) {
      logger.error('Kaleyra WhatsApp API not configured correctly');
      throw new InternalServerError('WhatsApp service is not configured');
    }

    const normalizedPhone = this.normalizePhone(to);

    const requestBody: Record<string, any> = {
      from: whatsappFromNumber,
      to: normalizedPhone,
      type: 'document',
      document: {
        link: documentUrl,
        filename: filename,
      },
    };

    if (caption) {
      requestBody.document.caption = caption;
    }

    const headers: Record<string, string> = {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    };

    logger.info('Sending WhatsApp document via Kaleyra', {
      to: normalizedPhone,
      filename,
      hasCaption: !!caption,
    });

    try {
      const response = await fetch(whatsappUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }

      if (!response.ok) {
        logger.error('Kaleyra WhatsApp document send failed', {
          status: response.status,
          statusText: response.statusText,
          error: responseData,
          phone: normalizedPhone,
        });
        return {
          success: false,
          error: responseData?.error?.message || 'Failed to send WhatsApp document',
        };
      }

      logger.info('Kaleyra WhatsApp document sent successfully', {
        status: response.status,
        phone: normalizedPhone.substring(0, 4) + '****' + normalizedPhone.substring(8),
        filename,
      });

      return {
        success: true,
        messageId: responseData?.id || responseData?.message_id,
      };
    } catch (error: any) {
      logger.error('Kaleyra WhatsApp document send error', {
        error: error.message || error,
        stack: error.stack,
        phone: normalizedPhone,
      });
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Generate Sauda WhatsApp message preview (for editing before sending)
   */
  generateSaudaMessagePreview(saudaDetails: {
    saudaId: string;
    saudaType: string;
    riceType: string;
    rate: number;
    quantity?: number;
    purchaserName: string;
    brokerName?: string;
  }): string {
    return this.formatSaudaMessage(saudaDetails);
  }

  /**
   * Send Sauda notification via WhatsApp
   * Supports custom message override for edited messages
   */
  async sendSaudaNotification(
    to: string,
    saudaDetails: {
      saudaId: string;
      saudaType: string;
      riceType: string;
      rate: number;
      quantity?: number;
      purchaserName: string;
      brokerName?: string;
    },
    pdfUrl?: string,
    customMessage?: string
  ): Promise<WhatsAppResponse> {
    const message = customMessage || this.formatSaudaMessage(saudaDetails);

    // If PDF URL is provided, send as document
    if (pdfUrl) {
      return this.sendDocument(
        to,
        pdfUrl,
        `Sauda_${saudaDetails.saudaId}.pdf`,
        message
      );
    }

    // If custom message, send as text (templates can't be customized)
    if (customMessage) {
      return this.sendTextMessage(to, message);
    }

    // Otherwise, try to send as template message, fallback to text
    try {
      return await this.sendTemplateMessage({
        to,
        templateName: appConfig.apis.kaleyra.whatsappTemplateName,
        templateParams: [
          saudaDetails.saudaType.toUpperCase(),
          saudaDetails.riceType,
          saudaDetails.rate.toString(),
          saudaDetails.quantity?.toString() || 'N/A',
          saudaDetails.purchaserName,
        ],
      });
    } catch (error) {
      // Fallback to text message
      return this.sendTextMessage(to, message);
    }
  }

  /**
   * Generate Payment Advice WhatsApp message preview (for editing before sending)
   */
  generatePaymentAdviceMessagePreview(paymentDetails: {
    adviceNumber: string;
    vendorName: string;
    amount: number;
    date: string;
  }): string {
    return `Payment Advice: ${paymentDetails.adviceNumber}\n` +
      `Vendor: ${paymentDetails.vendorName}\n` +
      `Amount: ₹${paymentDetails.amount.toLocaleString('en-IN')}\n` +
      `Date: ${paymentDetails.date}\n\n` +
      `- SantKripa Equipments Pvt. Ltd.`;
  }

  /**
   * Send Payment Advice notification via WhatsApp
   * Supports custom message override for edited messages
   */
  async sendPaymentAdviceNotification(
    to: string,
    paymentDetails: {
      adviceNumber: string;
      vendorName: string;
      amount: number;
      date: string;
    },
    pdfUrl: string,
    customMessage?: string
  ): Promise<WhatsAppResponse> {
    const caption = customMessage || this.generatePaymentAdviceMessagePreview(paymentDetails);

    return this.sendDocument(
      to,
      pdfUrl,
      `Payment_Advice_${paymentDetails.adviceNumber}.pdf`,
      caption
    );
  }

  private formatSaudaMessage(saudaDetails: {
    saudaId: string;
    saudaType: string;
    riceType: string;
    rate: number;
    quantity?: number;
    purchaserName: string;
    brokerName?: string;
  }): string {
    let message = `📋 *Sauda Details*\n\n`;
    message += `Sauda ID: ${saudaDetails.saudaId}\n`;
    message += `Type: ${saudaDetails.saudaType.toUpperCase()}\n`;
    message += `Rice Type: ${saudaDetails.riceType}\n`;
    message += `Rate: ₹${saudaDetails.rate.toLocaleString('en-IN')}\n`;
    if (saudaDetails.quantity) {
      message += `Quantity: ${saudaDetails.quantity} Qtl\n`;
    }
    message += `Purchaser: ${saudaDetails.purchaserName}\n`;
    if (saudaDetails.brokerName) {
      message += `Broker: ${saudaDetails.brokerName}\n`;
    }
    message += `\n- SantKripa Equipments Pvt. Ltd.`;
    return message;
  }
}

export const whatsAppService = new WhatsAppService();

