import { Response, NextFunction } from 'express';
import { saudaDAO } from '../dao/sauda.dao';
import { vendorDAO } from '../dao/vendor.dao';
import { brokerDAO } from '../dao/broker.dao';
import { riceCodeService } from '../services/rice-code.service';
import { riceLengthDAO } from '../dao/rice-length.dao';
import { inwardSlipLotDAO } from '../dao/inward-slip-lot.dao';
import { saudaRiceFieldsAreChanging } from '../utils/lot-rice-from-sauda';
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
import { SAUDA_AUTO_COMPLETE_COMPLETION_PERCENT } from '../constants/sauda-completion';
import type { SaudaParametersSnapshot } from '../constants/sauda-parameters';
import { parameterService } from '../services/parameter.service';
import { saudaService } from '../services/sauda.service';
import { saudaParametersSnapshotFromRow } from '../utils/sauda-parameters';
import { AuthRequest } from '../middleware/auth.middleware';
import { uploadToS3, validateFileSize, validateFileType, normalizeMimeType } from '../utils/s3-upload';
import { appConfig } from '../config/app.config';
import { whatsAppService } from '../services/whatsapp.service';
import { emailService, SaudaEmailAttachmentInput } from '../services/email.service';
import { logger } from '../utils/logger';
import { parseStringArrayFromBody } from '../utils/parse-multipart-array';
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
const MIN_COMPLETION_PERCENT_FOR_COMPLETED_STATUS = SAUDA_AUTO_COMPLETE_COMPLETION_PERCENT;

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

function toSaudaResponse(
  sauda: Sauda,
  parameters: SaudaParametersSnapshot | null = null
): SaudaResponse {
  return {
    id: sauda.id,
    display_id: formatSaudaDisplayId(sauda.id),
    sauda_type: sauda.sauda_type,
    rice_category: sauda.rice_category,
    rice_type: sauda.rice_type,
    rice_length_id: sauda.rice_length_id,
    rice_length_name: sauda.rice_length_name ?? null,
    rice_code_id: sauda.rice_code_id,
    rate: parseFloat(sauda.rate.toString()),
    broker_id: sauda.broker_id,
    broker_commission: sauda.broker_commission ? parseFloat(sauda.broker_commission.toString()) : null,
    broker_commission_type: sauda.broker_commission_type,
    quantity: sauda.quantity ? parseFloat(sauda.quantity.toString()) : null,
    no_of_bags: sauda.no_of_bags != null ? parseInt(String(sauda.no_of_bags), 10) : null,
    bag_weight: sauda.bag_weight != null ? parseFloat(sauda.bag_weight.toString()) : null,
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
    parameters,
    created_at: sauda.created_at.toISOString(),
    updated_at: sauda.updated_at.toISOString(),
  };
}

async function buildSaudaResponses(saudas: Sauda[]): Promise<SaudaResponse[]> {
  if (saudas.length === 0) {
    return [];
  }
  const parameterRows = await parameterService.getBySaudaIds(saudas.map((s) => s.id));
  const parametersBySaudaId = new Map(
    parameterRows.map((row) => [row.sauda_id as string, saudaParametersSnapshotFromRow(row)])
  );
  return saudas.map((sauda) =>
    toSaudaResponse(sauda, parametersBySaudaId.get(sauda.id) ?? null)
  );
}

export class SaudaController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const includeInactive = req.query.include_inactive === 'true';
      const status = req.query.status as SaudaStatus | undefined;
      const saudaType = req.query.sauda_type as SaudaType | undefined;
      const purchaserId = req.query.purchaser_id as string | undefined;
      
      const saudas = await saudaDAO.findAll(includeInactive, status, saudaType, purchaserId);
      const saudaResponses = await buildSaudaResponses(saudas);

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

      const parameterRow = await parameterService.getBySaudaId(id);
      return ResponseHandler.success(
        res,
        toSaudaResponse(sauda, parameterRow ? saudaParametersSnapshotFromRow(parameterRow) : null)
      );
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const saudaData = validate<CreateSaudaDTO>(createSaudaSchema, req.body);
      const { parameters, ...saudaFields } = saudaData;

      // Validate purchaser exists
      const purchaser = await vendorDAO.findById(saudaFields.purchaser_id);

      if (!purchaser) {
        throw new NotFoundError('Purchaser (vendor) not found');
      }

      // Validate broker if provided
      if (saudaFields.broker_id) {
        const broker = await brokerDAO.findById(saudaFields.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      // Validate rice selection hierarchy
      await riceCodeService.assertSaudaRiceSelection({
        rice_category: saudaFields.rice_category,
        rice_code_id: saudaFields.rice_code_id,
        rice_type: saudaFields.rice_type,
      });

      if (saudaFields.rice_length_id) {
        const riceLength = await riceLengthDAO.findById(saudaFields.rice_length_id);
        if (!riceLength) {
          throw new NotFoundError('Rice length not found');
        }
      }

      // Set created_by from authenticated user
      if (req.user) {
        saudaFields.created_by = req.user.userId;
      }

      let sauda;
      let parameterSnapshot: SaudaParametersSnapshot | null = null;
      try {
        const result = await saudaService.createWithParameters(
          saudaFields,
          parameters,
          req.user?.userId
        );
        sauda = result.sauda;
        parameterSnapshot = result.parameterRow
          ? saudaParametersSnapshotFromRow(result.parameterRow)
          : null;
      } catch (dbError: any) {
        // Check for database constraint violations
        if (dbError?.code === '23505') {
          throw new ConflictError('A sauda with this information already exists');
        }
        if (dbError?.code === '23503') {
          throw new ValidationError('Invalid reference: purchaser, broker, or rice code does not exist');
        }
        throw dbError instanceof NotFoundError || dbError instanceof ValidationError
          ? dbError
          : new InternalServerError('Failed to create sauda. Please try again.');
      }

      await vendorDAO.deactivatePurchaserVendorIfBankUnverified(saudaFields.purchaser_id);

      return ResponseHandler.created(
        res,
        toSaudaResponse(sauda, parameterSnapshot),
        'Sauda created successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const saudaData = validate<UpdateSaudaDTO>(updateSaudaSchema, req.body);
      const { parameters, ...saudaFields } = saudaData;

      // Check if sauda exists
      const existingSauda = await saudaDAO.findById(id);
      if (!existingSauda) {
        throw new NotFoundError('Sauda not found');
      }

      // Validate purchaser if being updated
      if (saudaFields.purchaser_id) {
        const purchaser = await vendorDAO.findById(saudaFields.purchaser_id);
        if (!purchaser) {
          throw new NotFoundError('Purchaser (vendor) not found');
        }
      }

      // Validate broker if being updated
      if (saudaFields.broker_id !== undefined && saudaFields.broker_id !== null) {
        const broker = await brokerDAO.findById(saudaFields.broker_id);
        if (!broker) {
          throw new NotFoundError('Broker not found');
        }
      }

      const effectiveCategory =
        saudaFields.rice_category ?? existingSauda.rice_category;
      const effectiveRiceType = saudaFields.rice_type ?? existingSauda.rice_type;
      const effectiveRiceCodeId =
        saudaFields.rice_code_id !== undefined
          ? saudaFields.rice_code_id
          : existingSauda.rice_code_id;

      await riceCodeService.assertSaudaRiceSelection({
        rice_category: effectiveCategory,
        rice_code_id: effectiveRiceCodeId,
        rice_type: effectiveRiceType,
      });

      if (saudaFields.rice_length_id !== undefined && saudaFields.rice_length_id !== null) {
        const riceLength = await riceLengthDAO.findById(saudaFields.rice_length_id);
        if (!riceLength) {
          throw new NotFoundError('Rice length not found');
        }
      }

      const lotCount = await inwardSlipLotDAO.countBySaudaId(id);
      if (
        lotCount > 0 &&
        saudaRiceFieldsAreChanging(
          {
            rice_category: saudaFields.rice_category,
            rice_code_id: saudaFields.rice_code_id,
            rice_type: saudaFields.rice_type,
            rice_length_id: saudaFields.rice_length_id,
          },
          existingSauda
        )
      ) {
        throw new ValidationError(
          'Cannot change rice category, code, type, or length after lots have been created for this sauda'
        );
      }

      // Set updated_by from authenticated user
      if (req.user) {
        saudaFields.updated_by = req.user.userId;
      }

      if (saudaFields.status === 'completed') {
        assertCanSetSaudaStatusCompleted(
          existingSauda,
          saudaFields.quantity !== undefined ? saudaFields.quantity : undefined
        );
      }

      let sauda;
      let parameterSnapshot: SaudaParametersSnapshot | null = null;
      try {
        const result = await saudaService.updateWithParameters(
          id,
          saudaFields,
          parameters,
          req.user?.userId
        );
        sauda = result.sauda;
        if (result.parameterRow !== undefined) {
          parameterSnapshot = result.parameterRow
            ? saudaParametersSnapshotFromRow(result.parameterRow)
            : null;
        } else {
          const existingParameter = await parameterService.getBySaudaId(sauda.id);
          parameterSnapshot = existingParameter
            ? saudaParametersSnapshotFromRow(existingParameter)
            : null;
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

      await vendorDAO.deactivatePurchaserVendorIfBankUnverified(sauda.purchaser_id);

      return ResponseHandler.success(
        res,
        toSaudaResponse(sauda, parameterSnapshot),
        'Sauda updated successfully'
      );
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

      const parameterRow = await parameterService.getBySaudaId(sauda.id);
      return ResponseHandler.success(
        res,
        toSaudaResponse(sauda, parameterRow ? saudaParametersSnapshotFromRow(parameterRow) : null),
        'Sauda status updated successfully'
      );
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
        riceCategory: sauda.rice_category,
        riceType: sauda.rice_type,
        riceLength: sauda.rice_length_name ?? undefined,
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
   * Accepts email addresses, optional PDF or HTML attachment, and optional custom content
   */
  async sendViaEmail(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const id = validate<string>(uuidSchema, req.params.id);
      const { customSubject, customHtml, customText } = req.body;
      const emails = parseStringArrayFromBody(req.body.emails);

      if (!emails || emails.length === 0) {
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

      // Optional attachment: PDF (legacy) or HTML sauda export
      let attachment: SaudaEmailAttachmentInput | undefined;
      if (req.file) {
        validateFileType(req.file.mimetype, ['application/pdf', 'text/html']);
        validateFileSize(req.file.size, 10); // Max 10MB

        const mime = normalizeMimeType(req.file.mimetype);
        if (mime === 'application/pdf') {
          attachment = req.file.buffer;
        } else {
          let filename = req.file.originalname?.trim() || '';
          if (!filename.toLowerCase().endsWith('.html') && !filename.toLowerCase().endsWith('.htm')) {
            filename = `Sauda_${id}.html`;
          } else {
            filename = filename.replace(/[^\w.\-]/g, '_');
          }
          attachment = {
            buffer: req.file.buffer,
            contentType: req.file.mimetype,
            filename,
          };
        }
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
          attachment,
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
      const { pdfUrl, customMessage } = req.body;
      const whatsappNumbers = parseStringArrayFromBody(req.body.whatsappNumbers);

      if (!whatsappNumbers || whatsappNumbers.length === 0) {
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
      const { adviceNumber, vendorName, amount, date, bankDetails } = req.body;
      const emails = parseStringArrayFromBody(req.body.emails);

      if (!emails || emails.length === 0) {
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
      const { adviceNumber, vendorName, amount, date, pdfUrl, customMessage } = req.body;
      const whatsappNumbers = parseStringArrayFromBody(req.body.whatsappNumbers);

      if (!whatsappNumbers || whatsappNumbers.length === 0) {
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

