import { Response, NextFunction } from 'express';
import { saudaDAO } from '../dao/sauda.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { brokerDAO } from '../dao/broker.dao';
import { riceCodeDAO } from '../dao/rice-code.dao';
import { ResponseHandler } from '../utils/response';
import {
  validate,
  createSaudaSchema,
  updateSaudaSchema,
  uuidSchema,
} from '../utils/validators';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  InternalServerError,
} from '../utils/errors';
import { CreateSaudaDTO, UpdateSaudaDTO, Sauda, SaudaResponse, SaudaStatus, SaudaType } from '../models/sauda.model';
import { formatSaudaDisplayId } from '../utils/sauda-display';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { whatsAppService } from '../services/whatsapp.service';
import { emailService } from '../services/email.service';
import { logger } from '../utils/logger';
/**
 * Format a Date object to YYYY-MM-DD string using UTC
 * When PostgreSQL returns a DATE column, it's a Date object at midnight UTC,
 * so we need to use UTC methods to get the correct date value
 */
function formatDateToLocalString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  // If it's already a string, return it directly (from TO_CHAR in SQL)
  if (typeof date === 'string') return date;
  // Format using UTC components (PostgreSQL DATE columns are at midnight UTC)
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Matches DB trigger: ROUND((received_until_now / quantity) * 100, 2); NULL if quantity missing or zero */
const MIN_COMPLETION_PERCENT_FOR_COMPLETED_STATUS = 95;

function computeSaudaCompletionPercentage(
  receivedUntilNow: number,
  quantity: number | string | null | undefined
): number | null {
  const q = quantity === null || quantity === undefined ? NaN : parseFloat(String(quantity));
  if (Number.isNaN(q) || q === 0) return null;
  const received = parseFloat(String(receivedUntilNow ?? 0));
  return Math.round((received / q) * 100 * 100) / 100;
}

/**
 * Enforces that workflow "completed" is only allowed when physical completion is at least 95%.
 * When updating quantity in the same request, uses the post-update quantity with current received_until_now.
 */
function assertCanSetSaudaStatusCompleted(existing: Sauda, quantityAfterUpdate?: number | null): void {
  const q =
    quantityAfterUpdate !== undefined ? quantityAfterUpdate : existing.quantity;
  const pct = computeSaudaCompletionPercentage(
    parseFloat(String(existing.received_until_now ?? 0)),
    q
  );
  if (pct === null || pct < MIN_COMPLETION_PERCENT_FOR_COMPLETED_STATUS) {
    const detail =
      pct === null
        ? 'Quantity is missing or zero, so completion cannot be determined.'
        : `Current completion is ${pct}%.`;
    throw new ValidationError(
      `Cannot set status to completed unless completion is at least ${MIN_COMPLETION_PERCENT_FOR_COMPLETED_STATUS}%. ${detail}`
    );
  }
}

function toSaudaResponse(sauda: Sauda): SaudaResponse {
  return {
    id: sauda.id,
    display_id: formatSaudaDisplayId(sauda.id),
    sauda_type: sauda.sauda_type,
    rice_type: sauda.rice_type,
    rice_length: sauda.rice_length,
    rice_code_id: sauda.rice_code_id,
    rate: parseFloat(sauda.rate.toString()),
    broker_id: sauda.broker_id,
    broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
    broker_commission_type: sauda.broker_commission_type,
    quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
    received_until_now: parseFloat(sauda.received_until_now.toString()),
    completion_percentage: sauda.completion_percentage ? parseFloat(sauda.completion_percentage.toString()) : null,
    cash_discount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : null,
    cash_discount_type: sauda.cash_discount_type,
    estimated_delivery_time: sauda.estimated_delivery_time,
    purchaser_id: sauda.purchaser_id,
    cooked_rice_image_url: sauda.cooked_rice_image_url,
    uncooked_rice_image_url: sauda.uncooked_rice_image_url,
    status: sauda.status,
    notes: sauda.notes,
    is_dana_required: sauda.is_dana_required,
    sauda_date: formatDateToLocalString(sauda.sauda_date),
    created_at: sauda.created_at.toISOString(),
    updated_at: sauda.updated_at.toISOString(),
  };
}

export class SaudaController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const status = req.query.status as SaudaStatus | undefined;
      const saudaType = req.query.sauda_type as SaudaType | undefined;
      const purchaserId = req.query.purchaser_id as string | undefined;
      
      const saudas = await saudaDAO.findAll(includeInactive, status, saudaType, purchaserId);

      const saudaResponses: SaudaResponse[] = saudas.map(toSaudaResponse);

      return ResponseHandler.success(res, saudaResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const sauda = await saudaDAO.findById(id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      return ResponseHandler.success(res, toSaudaResponse(sauda));
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaData = validate<CreateSaudaDTO>(createSaudaSchema, req.body);

      // Validate purchaser exists
      const purchaser = await vendorDAO.findById(saudaData.purchaser_id);

      if (!purchaser) {
        throw new NotFoundError('Purchaser (vendor) not found');
      }

      // Validate broker if provided
      if (saudaData.broker_id) {
        const broker = await brokerDAO.findById(saudaData.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Validate rice_code if provided
      if (saudaData.rice_code_id) {
        const riceCode = await riceCodeDAO.findById(saudaData.rice_code_id);
        if (!riceCode) {
          throw new NotFoundError('Rice code not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        saudaData.created_by = req.user.userId;
      }

      let sauda;
      try {
        sauda = await saudaDAO.create(saudaData);
      } catch (dbError: any) {
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('A sauda with this information already exists');
        }
        if (dbError?.code === '23503') {
          throw new ValidationError('Invalid reference: purchaser, broker, or rice code does not exist');
        }
        throw new InternalServerError('Failed to create sauda. Please try again.');
      }

      return ResponseHandler.created(res, toSaudaResponse(sauda), 'Sauda created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const saudaData = validate<UpdateSaudaDTO>(updateSaudaSchema, req.body);

      // Check if sauda exists
      const existingSauda = await saudaDAO.findById(id);
      if (!existingSauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Validate purchaser if being updated
      if (saudaData.purchaser_id) {
        const purchaser = await vendorDAO.findById(saudaData.purchaser_id);
        if (!purchaser) {
          throw new NotFoundError('Purchaser (vendor) not found');
        }
      }

      // Validate broker if being updated
      if (saudaData.broker_id !== undefined && saudaData.broker_id !== null) {
        const broker = await brokerDAO.findById(saudaData.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Validate rice_code if being updated
      if (saudaData.rice_code_id !== undefined && saudaData.rice_code_id !== null) {
        const riceCode = await riceCodeDAO.findById(saudaData.rice_code_id);
        if (!riceCode) {
          throw new NotFoundError('Rice code not found');
        }
      }

      // Set updated_by from authenticated user
      if (req.user) {
        saudaData.updated_by = req.user.userId;
      }

      if (saudaData.status === 'completed') {
        assertCanSetSaudaStatusCompleted(
          existingSauda,
          saudaData.quantity !== undefined ? saudaData.quantity : undefined
        );
      }

      let sauda;
      try {
        sauda = await saudaDAO.update(id, saudaData);
        if (!sauda) {
          throw new NotFoundError('Sauda not found after update');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('A sauda with this information already exists');
        }
        if (dbError?.code === '23503') {
          throw new ValidationError('Invalid reference: purchaser, broker, or rice code does not exist');
        }
        throw new InternalServerError('Failed to update sauda. Please try again.');
      }

      return ResponseHandler.success(res, toSaudaResponse(sauda), 'Sauda updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { status } = req.body;

      if (!status || !['draft', 'active', 'completed', 'cancelled'].includes(status)) {
        throw new ValidationError('Invalid status. Must be one of: draft, active, completed, cancelled');
      }

      const existingSauda = await saudaDAO.findById(id);
      if (!existingSauda) {
        throw new NotFoundError('Sauda not found');
      }

      if (status === 'completed') {
        assertCanSetSaudaStatusCompleted(existingSauda);
      }

      const sauda = await saudaDAO.update(id, { 
        status: status as SaudaStatus,
        updated_by: req.user?.userId 
      });

      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      return ResponseHandler.success(res, toSaudaResponse(sauda), 'Sauda status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      const sauda = await saudaDAO.findById(id);
      if (!sauda) {
        throw new NotFoundError('Sauda not found');
      }

      try {
        const deleted = await saudaDAO.delete(id);
        if (!deleted) {
          throw new NotFoundError('Sauda not found after deletion');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        // Check for foreign key constraint violations (sauda might be referenced elsewhere)
        if (dbError?.code === '23503') {
          throw new ConflictError('Cannot delete sauda. It is being used in other records (lots, purchases, etc.).');
        }
        throw new InternalServerError('Failed to delete sauda. Please try again.');
      }

      return ResponseHandler.success(res, null, 'Sauda deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadCookedRiceImage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      // Validate file type (images only)
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

      // Upload to S3
      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.riceImagesFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload image. Please try again.');
      }

      // Update sauda with the image URL
      let sauda;
      try {
        sauda = await saudaDAO.update(id, {
          cooked_rice_image_url: uploadResult.url,
          updated_by: req.user?.userId,
        });

        if (!sauda) {
          throw new NotFoundError('Sauda not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update sauda with image URL. Please try again.');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Cooked rice image uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  async uploadUncookedRiceImage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);

      if (!req.file) {
        throw new ValidationError('File is required');
      }

      // Validate file type (images only)
      validateFileType(req.file.mimetype, ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']);

      // Validate file size (max 5MB for images)
      validateFileSize(req.file.size, 5);

      // Upload to S3
      let uploadResult;
      try {
        uploadResult = await uploadToS3(
          req.file.buffer,
          req.file.originalname,
          appConfig.aws.s3.riceImagesFolder
        );
      } catch (uploadError: any) {
        throw new InternalServerError('Failed to upload image. Please try again.');
      }

      // Update sauda with the image URL
      let sauda;
      try {
        sauda = await saudaDAO.update(id, {
          uncooked_rice_image_url: uploadResult.url,
          updated_by: req.user?.userId,
        });

        if (!sauda) {
          throw new NotFoundError('Sauda not found');
        }
      } catch (dbError: any) {
        if (dbError instanceof NotFoundError) {
          throw dbError;
        }
        throw new InternalServerError('Failed to update sauda with image URL. Please try again.');
      }

      return ResponseHandler.success(res, { url: uploadResult.url }, 'Uncooked rice image uploaded successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Helper method to get sauda details for notifications
   */
  private async getSaudaNotificationDetails(id: string) {
    const sauda = await saudaDAO.findById(id);
    if (!sauda) {
      throw new NotFoundError('Sauda not found');
    }

    const purchaser = await vendorDAO.findById(sauda.purchaser_id);
    const purchaserName = purchaser?.business_name || 'Unknown';

    let brokerName: string | undefined;
    if (sauda.broker_id) {
      const broker = await brokerDAO.findById(sauda.broker_id);
      brokerName = broker?.business_name || undefined;
    }

    return {
      sauda,
      saudaDetails: {
        saudaId: formatSaudaDisplayId(sauda.id),
        saudaType: sauda.sauda_type,
        riceType: sauda.rice_type,
        riceLength: sauda.rice_length ?? undefined,
        rate: parseFloat(sauda.rate.toString()),
        quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : undefined,
        cashDiscount: sauda.cash_discount ? parseFloat(sauda.cash_discount.toString()) : undefined,
        cashDiscountType: sauda.cash_discount_type,
        purchaserName,
        brokerName,
        brokerCommission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : undefined,
        brokerCommissionType: sauda.broker_commission_type,
        estimatedDeliveryTime: sauda.estimated_delivery_time || undefined,
        notes: sauda.notes || undefined,
      },
    };
  }

  /**
   * Get preview of Sauda notification content (for editing before sending)
   */
  async getNotificationPreview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { saudaDetails } = await this.getSaudaNotificationDetails(id);

      // Generate email preview
      const emailPreview = emailService.generateSaudaEmailPreview(saudaDetails);
      
      // Generate WhatsApp preview
      const whatsappPreview = whatsAppService.generateSaudaMessagePreview(saudaDetails);

      return ResponseHandler.success(res, {
        saudaId: id,
        email: {
          subject: emailPreview.subject,
          html: emailPreview.html,
          text: emailPreview.text,
        },
        whatsapp: {
          message: whatsappPreview,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send Sauda details via Email
   * Accepts email addresses, optional PDF file, and optional custom content
   */
  async sendViaEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { emails, customSubject, customHtml, customText } = req.body;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        throw new ValidationError('At least one email address is required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of emails) {
        if (!emailRegex.test(email)) {
          throw new ValidationError(`Invalid email format: ${email}`);
        }
      }

      // Fetch sauda details
      const { saudaDetails } = await this.getSaudaNotificationDetails(id);

      // Get PDF buffer if provided
      let pdfBuffer: Buffer | undefined;
      if (req.file) {
        validateFileType(req.file.mimetype, ['application/pdf']);
        validateFileSize(req.file.size, 10); // Max 10MB for PDFs
        pdfBuffer = req.file.buffer;
      }

      // Prepare custom content if provided
      const customContent = (customSubject || customHtml || customText)
        ? { subject: customSubject, html: customHtml, text: customText }
        : undefined;

      // Send email
      let result;
      try {
        result = await emailService.sendSaudaNotification(
          emails,
          saudaDetails,
          pdfBuffer,
          customContent
        );

        if (!result.success) {
          logger.error('Failed to send sauda email', {
            saudaId: id,
            emails,
            error: result.error,
          });
          throw new InternalServerError(`Failed to send email: ${result.error || 'Unknown error'}`);
        }
      } catch (emailError: any) {
        if (emailError instanceof InternalServerError || emailError instanceof ValidationError) {
          throw emailError;
        }
        throw new InternalServerError('Failed to send email. Please try again later.');
      }

      logger.info('Sauda email sent successfully', {
        saudaId: id,
        emails,
        messageId: result.messageId,
        customized: !!customContent,
      });

      return ResponseHandler.success(
        res,
        {
          sent: true,
          messageId: result.messageId,
          recipients: emails,
        },
        'Sauda details sent via email successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send Sauda details via WhatsApp
   * Accepts WhatsApp numbers, optional PDF URL, and optional custom message
   */
  async sendViaWhatsApp(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { whatsappNumbers, pdfUrl, customMessage } = req.body;

      if (!whatsappNumbers || !Array.isArray(whatsappNumbers) || whatsappNumbers.length === 0) {
        throw new ValidationError('At least one WhatsApp number is required');
      }

      // Fetch sauda details
      const { saudaDetails } = await this.getSaudaNotificationDetails(id);

      // If PDF file is provided, upload to S3 first
      let uploadedPdfUrl = pdfUrl;
      if (req.file && !pdfUrl) {
        validateFileType(req.file.mimetype, ['application/pdf']);
        validateFileSize(req.file.size, 10); // Max 10MB for PDFs
        
        try {
          const uploadResult = await uploadToS3(
            req.file.buffer,
            `sauda_${id}.pdf`,
            'sauda-documents'
          );
          uploadedPdfUrl = uploadResult.url;
        } catch (uploadError: any) {
          throw new InternalServerError('Failed to upload PDF file. Please try again.');
        }
      }

      // Send to all WhatsApp numbers
      const results: Array<{ number: string; success: boolean; error?: string; messageId?: string }> = [];
      
      for (const number of whatsappNumbers) {
        try {
          const result = await whatsAppService.sendSaudaNotification(
            number,
            saudaDetails,
            uploadedPdfUrl,
            customMessage
          );

          results.push({
            number,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
          });

          if (result.success) {
            logger.info('Sauda WhatsApp sent successfully', {
              saudaId: id,
              number,
              messageId: result.messageId,
            });
          } else {
            logger.warn('Sauda WhatsApp failed', {
              saudaId: id,
              number,
              error: result.error,
            });
          }
        } catch (whatsappError: any) {
          // Continue with other numbers even if one fails
          results.push({
            number,
            success: false,
            error: whatsappError?.message || 'Failed to send WhatsApp message',
          });
          logger.warn('Sauda WhatsApp error', {
            saudaId: id,
            number,
            error: whatsappError,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return ResponseHandler.success(
        res,
        {
          sent: successCount > 0,
          results,
          summary: {
            total: whatsappNumbers.length,
            success: successCount,
            failed: failureCount,
          },
        },
        successCount > 0
          ? `Sauda details sent via WhatsApp to ${successCount} recipient(s)`
          : 'Failed to send WhatsApp messages'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send Payment Advice via Email
   */
  async sendPaymentAdviceViaEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { emails, adviceNumber, vendorName, amount, date, bankDetails } = req.body;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        throw new ValidationError('At least one email address is required');
      }

      if (!adviceNumber || !vendorName || !amount || !date) {
        throw new ValidationError('adviceNumber, vendorName, amount, and date are required');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of emails) {
        if (!emailRegex.test(email)) {
          throw new ValidationError(`Invalid email format: ${email}`);
        }
      }

      // Get PDF buffer - required for payment advice
      if (!req.file) {
        throw new ValidationError('PDF file is required for payment advice');
      }

      validateFileType(req.file.mimetype, ['application/pdf']);
      validateFileSize(req.file.size, 10); // Max 10MB for PDFs

      const paymentDetails = {
        adviceNumber,
        vendorName,
        amount: parseFloat(amount),
        date,
        bankDetails,
      };

      // Prepare custom content if provided
      const { customSubject, customHtml, customText } = req.body;
      const customContent = (customSubject || customHtml || customText)
        ? { subject: customSubject, html: customHtml, text: customText }
        : undefined;

      // Send email
      let result;
      try {
        result = await emailService.sendPaymentAdviceNotification(
          emails,
          paymentDetails,
          req.file.buffer,
          customContent
        );

        if (!result.success) {
          logger.error('Failed to send payment advice email', {
            adviceNumber,
            emails,
            error: result.error,
          });
          throw new InternalServerError(`Failed to send email: ${result.error || 'Unknown error'}`);
        }
      } catch (emailError: any) {
        if (emailError instanceof InternalServerError || emailError instanceof ValidationError) {
          throw emailError;
        }
        throw new InternalServerError('Failed to send email. Please try again later.');
      }

      logger.info('Payment advice email sent successfully', {
        adviceNumber,
        emails,
        messageId: result.messageId,
      });

      return ResponseHandler.success(
        res,
        {
          sent: true,
          messageId: result.messageId,
          recipients: emails,
        },
        'Payment advice sent via email successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get preview of Payment Advice notification content (for editing before sending)
   */
  async getPaymentAdvicePreview(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { adviceNumber, vendorName, amount, date, bankDetails } = req.body;

      if (!adviceNumber || !vendorName || !amount || !date) {
        throw new ValidationError('adviceNumber, vendorName, amount, and date are required');
      }

      const paymentDetails = {
        adviceNumber,
        vendorName,
        amount: parseFloat(amount),
        date,
        bankDetails,
      };

      // Generate email preview
      const emailPreview = emailService.generatePaymentAdviceEmailPreview(paymentDetails);
      
      // Generate WhatsApp preview
      const whatsappPreview = whatsAppService.generatePaymentAdviceMessagePreview(paymentDetails);

      return ResponseHandler.success(res, {
        email: {
          subject: emailPreview.subject,
          html: emailPreview.html,
          text: emailPreview.text,
        },
        whatsapp: {
          message: whatsappPreview,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send Payment Advice via WhatsApp
   */
  async sendPaymentAdviceViaWhatsApp(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { whatsappNumbers, adviceNumber, vendorName, amount, date, pdfUrl, customMessage } = req.body;

      if (!whatsappNumbers || !Array.isArray(whatsappNumbers) || whatsappNumbers.length === 0) {
        throw new ValidationError('At least one WhatsApp number is required');
      }

      if (!adviceNumber || !vendorName || !amount || !date) {
        throw new ValidationError('adviceNumber, vendorName, amount, and date are required');
      }

      // If PDF file is provided, upload to S3 first
      let uploadedPdfUrl = pdfUrl;
      if (req.file && !pdfUrl) {
        validateFileType(req.file.mimetype, ['application/pdf']);
        validateFileSize(req.file.size, 10); // Max 10MB for PDFs
        
        try {
          const uploadResult = await uploadToS3(
            req.file.buffer,
            `payment_advice_${adviceNumber}.pdf`,
            'payment-advice-documents'
          );
          uploadedPdfUrl = uploadResult.url;
        } catch (uploadError: any) {
          throw new InternalServerError('Failed to upload PDF file. Please try again.');
        }
      }

      if (!uploadedPdfUrl) {
        throw new ValidationError('PDF file or pdfUrl is required for payment advice');
      }

      const paymentDetails = {
        adviceNumber,
        vendorName,
        amount: parseFloat(amount),
        date,
      };

      // Send to all WhatsApp numbers
      const results: Array<{ number: string; success: boolean; error?: string; messageId?: string }> = [];
      
      for (const number of whatsappNumbers) {
        try {
          const result = await whatsAppService.sendPaymentAdviceNotification(
            number,
            paymentDetails,
            uploadedPdfUrl,
            customMessage
          );

          results.push({
            number,
            success: result.success,
            error: result.error,
            messageId: result.messageId,
          });

          if (result.success) {
            logger.info('Payment advice WhatsApp sent successfully', {
              adviceNumber,
              number,
              messageId: result.messageId,
            });
          } else {
            logger.warn('Payment advice WhatsApp failed', {
              adviceNumber,
              number,
              error: result.error,
            });
          }
        } catch (whatsappError: any) {
          // Continue with other numbers even if one fails
          results.push({
            number,
            success: false,
            error: whatsappError?.message || 'Failed to send WhatsApp message',
          });
          logger.warn('Payment advice WhatsApp error', {
            adviceNumber,
            number,
            error: whatsappError,
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;

      return ResponseHandler.success(
        res,
        {
          sent: successCount > 0,
          results,
          summary: {
            total: whatsappNumbers.length,
            success: successCount,
            failed: failureCount,
          },
        },
        successCount > 0
          ? `Payment advice sent via WhatsApp to ${successCount} recipient(s)`
          : 'Failed to send WhatsApp messages'
      );
    } catch (error) {
      next(error);
    }
  }
}

export const saudaController = new SaudaController();

