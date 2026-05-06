import { SESClient, SendRawEmailCommand } from '@aws-sdk/client-ses';
import { appConfig } from '../config/app.config';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

export interface EmailAttachment {
  filename: string;
  content?: Buffer;
  path?: string;
  contentType?: string;
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  cc?: string | string[];
  bcc?: string | string[];
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type SaudaEmailAttachmentInput =
  | Buffer
  | {
      buffer: Buffer;
      contentType: string;
      filename?: string;
    };

export class EmailService {
  private sesClient: SESClient;

  constructor() {
    this.sesClient = new SESClient({
      region: appConfig.aws.region,
      credentials: {
        accessKeyId: appConfig.aws.accessKeyId,
        secretAccessKey: appConfig.aws.secretAccessKey,
      },
    });
  }

  /**
   * Create MIME email with attachments
   */
  private createRawEmail(
    from: string,
    to: string[],
    subject: string,
    html: string,
    text: string,
    attachments?: EmailAttachment[],
    cc?: string[],
    bcc?: string[]
  ): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const mixedBoundary = `----=_Mixed_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    let rawEmail = '';

    // Headers
    rawEmail += `From: ${from}\r\n`;
    rawEmail += `To: ${to.join(', ')}\r\n`;
    if (cc && cc.length > 0) {
      rawEmail += `Cc: ${cc.join(', ')}\r\n`;
    }
    if (bcc && bcc.length > 0) {
      rawEmail += `Bcc: ${bcc.join(', ')}\r\n`;
    }
    rawEmail += `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n`;
    rawEmail += `MIME-Version: 1.0\r\n`;

    if (attachments && attachments.length > 0) {
      // Multipart/mixed for attachments
      rawEmail += `Content-Type: multipart/mixed; boundary="${mixedBoundary}"\r\n\r\n`;
      rawEmail += `--${mixedBoundary}\r\n`;
      rawEmail += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    } else {
      rawEmail += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
    }

    // Text part
    rawEmail += `--${boundary}\r\n`;
    rawEmail += `Content-Type: text/plain; charset=UTF-8\r\n`;
    rawEmail += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    rawEmail += `${text}\r\n\r\n`;

    // HTML part
    rawEmail += `--${boundary}\r\n`;
    rawEmail += `Content-Type: text/html; charset=UTF-8\r\n`;
    rawEmail += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    rawEmail += `${html}\r\n\r\n`;
    rawEmail += `--${boundary}--\r\n`;

    // Attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.content) {
          rawEmail += `--${mixedBoundary}\r\n`;
          rawEmail += `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"\r\n`;
          rawEmail += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
          rawEmail += `Content-Transfer-Encoding: base64\r\n\r\n`;
          rawEmail += attachment.content.toString('base64').replace(/(.{76})/g, '$1\r\n');
          rawEmail += `\r\n`;
        }
      }
      rawEmail += `--${mixedBoundary}--\r\n`;
    }

    return rawEmail;
  }

  /**
   * Send an email using AWS SES
   */
  async sendEmail(payload: EmailPayload): Promise<EmailResponse> {
    const { fromEmail, fromName } = appConfig.aws.ses;

    if (!appConfig.aws.accessKeyId || !appConfig.aws.secretAccessKey) {
      logger.error('AWS credentials not configured');
      throw new InternalServerError('Email service is not configured');
    }

    try {
      const toAddresses = Array.isArray(payload.to) ? payload.to : [payload.to];
      const ccAddresses = payload.cc ? (Array.isArray(payload.cc) ? payload.cc : [payload.cc]) : undefined;
      const bccAddresses = payload.bcc ? (Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc]) : undefined;

      const from = `"${fromName}" <${fromEmail}>`;
      const rawEmail = this.createRawEmail(
        from,
        toAddresses,
        payload.subject,
        payload.html || '',
        payload.text || '',
        payload.attachments,
        ccAddresses,
        bccAddresses
      );

      logger.info('Sending email via AWS SES', {
        to: payload.to,
        subject: payload.subject,
        hasAttachments: !!payload.attachments?.length,
      });

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawEmail),
        },
      });

      const response = await this.sesClient.send(command);

      logger.info('Email sent successfully via AWS SES', {
        messageId: response.MessageId,
        to: payload.to,
      });

      return {
        success: true,
        messageId: response.MessageId,
      };
    } catch (error: any) {
      logger.error('AWS SES email send error', {
        error: error.message || error,
        stack: error.stack,
        to: payload.to,
      });
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Generate Sauda email preview content (for editing before sending)
   */
  generateSaudaEmailPreview(saudaDetails: {
    saudaId: string;
    saudaType: string;
    riceType: string;
    rate: number;
    quantity?: number;
    cashDiscount?: number;
    cashDiscountType?: string;
    purchaserName: string;
    brokerName?: string;
    brokerCommission?: number;
    brokerCommissionType?: string;
    estimatedDeliveryTime?: number;
    notes?: string;
  }): { subject: string; html: string; text: string } {
    return {
      subject: `Sauda Confirmation - ${saudaDetails.saudaId} | ${saudaDetails.riceType}`,
      html: this.formatSaudaEmailHtml(saudaDetails),
      text: this.formatSaudaEmailText(saudaDetails),
    };
  }

  /**
   * Send Sauda notification via Email
   * Supports custom content override for edited messages
   * @param attachment - Optional PDF buffer, or HTML/PDF with explicit metadata for the file part
   */
  async sendSaudaNotification(
    to: string | string[],
    saudaDetails: {
      saudaId: string;
      saudaType: string;
      riceType: string;
      rate: number;
      quantity?: number;
      cashDiscount?: number;
      cashDiscountType?: string;
      purchaserName: string;
      brokerName?: string;
      brokerCommission?: number;
      brokerCommissionType?: string;
      estimatedDeliveryTime?: number;
      notes?: string;
    },
    attachment?: SaudaEmailAttachmentInput,
    customContent?: { subject?: string; html?: string; text?: string }
  ): Promise<EmailResponse> {
    const defaultContent = this.generateSaudaEmailPreview(saudaDetails);
    
    const subject = customContent?.subject || defaultContent.subject;
    const html = customContent?.html || defaultContent.html;
    const text = customContent?.text || defaultContent.text;

    const attachments: EmailAttachment[] = [];
    if (attachment) {
      if (Buffer.isBuffer(attachment)) {
        attachments.push({
          filename: `Sauda_${saudaDetails.saudaId}.pdf`,
          content: attachment,
          contentType: 'application/pdf',
        });
      } else {
        const contentType = attachment.contentType.split(';')[0].trim();
        const isHtml = contentType.toLowerCase() === 'text/html';
        const defaultFilename = isHtml
          ? `Sauda_${saudaDetails.saudaId}.html`
          : `Sauda_${saudaDetails.saudaId}.pdf`;
        attachments.push({
          filename: attachment.filename || defaultFilename,
          content: attachment.buffer,
          contentType,
        });
      }
    }

    return this.sendEmail({
      to,
      subject,
      html,
      text,
      attachments,
    });
  }

  /**
   * Generate Payment Advice email preview content (for editing before sending)
   */
  generatePaymentAdviceEmailPreview(paymentDetails: {
    adviceNumber: string;
    vendorName: string;
    amount: number;
    date: string;
    bankDetails?: {
      bankName?: string;
      accountNumber?: string;
      ifscCode?: string;
    };
  }): { subject: string; html: string; text: string } {
    return {
      subject: `Payment Advice - ${paymentDetails.adviceNumber} | ₹${paymentDetails.amount.toLocaleString('en-IN')}`,
      html: this.formatPaymentAdviceEmailHtml(paymentDetails),
      text: this.formatPaymentAdviceEmailText(paymentDetails),
    };
  }

  /**
   * Send Payment Advice notification via Email
   * Supports custom content override for edited messages
   */
  async sendPaymentAdviceNotification(
    to: string | string[],
    paymentDetails: {
      adviceNumber: string;
      vendorName: string;
      amount: number;
      date: string;
      bankDetails?: {
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
      };
    },
    pdfBuffer: Buffer,
    customContent?: { subject?: string; html?: string; text?: string }
  ): Promise<EmailResponse> {
    const defaultContent = this.generatePaymentAdviceEmailPreview(paymentDetails);
    
    const subject = customContent?.subject || defaultContent.subject;
    const html = customContent?.html || defaultContent.html;
    const text = customContent?.text || defaultContent.text;

    const attachments: EmailAttachment[] = [
      {
        filename: `Payment_Advice_${paymentDetails.adviceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ];

    return this.sendEmail({
      to,
      subject,
      html,
      text,
      attachments,
    });
  }

  private formatSaudaEmailHtml(saudaDetails: {
    saudaId: string;
    saudaType: string;
    riceType: string;
    rate: number;
    quantity?: number;
    cashDiscount?: number;
    cashDiscountType?: string;
    purchaserName: string;
    brokerName?: string;
    brokerCommission?: number;
    brokerCommissionType?: string;
    estimatedDeliveryTime?: number;
    notes?: string;
  }): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sauda Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a5f2a 0%, #2d8f43 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Sauda Confirmation</h1>
    <p style="color: #e8f5e9; margin: 10px 0 0;">SantKripa Equipments Pvt. Ltd.</p>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #1a5f2a; margin: 0 0 15px; font-size: 18px;">📋 Sauda Details</h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold; width: 40%;">Sauda ID:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.saudaId}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Type:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.saudaType.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Rice Type:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.riceType}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Rate:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; color: #1a5f2a; font-weight: bold;">₹${saudaDetails.rate.toLocaleString('en-IN')}</td>
        </tr>
        ${saudaDetails.quantity ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Quantity:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.quantity} Qtl</td>
        </tr>` : ''}
        ${saudaDetails.cashDiscount ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Cash Discount:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.cashDiscount}${saudaDetails.cashDiscountType === 'percentage' ? '%' : ' Rs'}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Purchaser:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.purchaserName}</td>
        </tr>
        ${saudaDetails.brokerName ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Broker:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.brokerName}</td>
        </tr>` : ''}
        ${saudaDetails.brokerCommission ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Broker Commission:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.brokerCommission}${saudaDetails.brokerCommissionType === 'percentage' ? '%' : saudaDetails.brokerCommissionType === 'weight' ? ' Rs/Qtl' : ' Rs'}</td>
        </tr>` : ''}
        ${saudaDetails.estimatedDeliveryTime ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Est. Delivery:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${saudaDetails.estimatedDeliveryTime} days</td>
        </tr>` : ''}
        ${saudaDetails.notes ? `
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Notes:</td>
          <td style="padding: 8px 0;">${saudaDetails.notes}</td>
        </tr>` : ''}
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px; margin-bottom: 0;">
      This is an automated notification. Please find the detailed Sauda document attached.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} SantKripa Equipments Pvt. Ltd.</p>
    <p style="margin: 5px 0 0;">All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private formatSaudaEmailText(saudaDetails: {
    saudaId: string;
    saudaType: string;
    riceType: string;
    rate: number;
    quantity?: number;
    purchaserName: string;
    brokerName?: string;
  }): string {
    let text = `SAUDA CONFIRMATION\n`;
    text += `===================\n\n`;
    text += `Sauda ID: ${saudaDetails.saudaId}\n`;
    text += `Type: ${saudaDetails.saudaType.toUpperCase()}\n`;
    text += `Rice Type: ${saudaDetails.riceType}\n`;
    text += `Rate: ₹${saudaDetails.rate.toLocaleString('en-IN')}\n`;
    if (saudaDetails.quantity) {
      text += `Quantity: ${saudaDetails.quantity} Qtl\n`;
    }
    text += `Purchaser: ${saudaDetails.purchaserName}\n`;
    if (saudaDetails.brokerName) {
      text += `Broker: ${saudaDetails.brokerName}\n`;
    }
    text += `\n---\nSantKripa Equipments Pvt. Ltd.`;
    return text;
  }

  private formatPaymentAdviceEmailHtml(paymentDetails: {
    adviceNumber: string;
    vendorName: string;
    amount: number;
    date: string;
    bankDetails?: {
      bankName?: string;
      accountNumber?: string;
      ifscCode?: string;
    };
  }): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Advice</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a5f2a 0%, #2d8f43 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Payment Advice</h1>
    <p style="color: #e8f5e9; margin: 10px 0 0;">SantKripa Equipments Pvt. Ltd.</p>
  </div>
  
  <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #1a5f2a; margin: 0 0 15px; font-size: 18px;">💰 Payment Details</h2>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold; width: 40%;">Advice Number:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${paymentDetails.adviceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Vendor:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${paymentDetails.vendorName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Amount:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; color: #1a5f2a; font-weight: bold; font-size: 18px;">₹${paymentDetails.amount.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Date:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${paymentDetails.date}</td>
        </tr>
        ${paymentDetails.bankDetails?.bankName ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Bank:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">${paymentDetails.bankDetails.bankName}</td>
        </tr>` : ''}
        ${paymentDetails.bankDetails?.accountNumber ? `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0; font-weight: bold;">Account:</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #e0e0e0;">****${paymentDetails.bankDetails.accountNumber.slice(-4)}</td>
        </tr>` : ''}
      </table>
    </div>
    
    <p style="color: #666; font-size: 14px; margin-bottom: 0;">
      This is an automated notification. Please find the detailed Payment Advice document attached.
    </p>
  </div>
  
  <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">
    <p style="margin: 0;">© ${new Date().getFullYear()} SantKripa Equipments Pvt. Ltd.</p>
    <p style="margin: 5px 0 0;">All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private formatPaymentAdviceEmailText(paymentDetails: {
    adviceNumber: string;
    vendorName: string;
    amount: number;
    date: string;
  }): string {
    let text = `PAYMENT ADVICE\n`;
    text += `==============\n\n`;
    text += `Advice Number: ${paymentDetails.adviceNumber}\n`;
    text += `Vendor: ${paymentDetails.vendorName}\n`;
    text += `Amount: ₹${paymentDetails.amount.toLocaleString('en-IN')}\n`;
    text += `Date: ${paymentDetails.date}\n`;
    text += `\n---\nSantKripa Equipments Pvt. Ltd.`;
    return text;
  }
}

export const emailService = new EmailService();

