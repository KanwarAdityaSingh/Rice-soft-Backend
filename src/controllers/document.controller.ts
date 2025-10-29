import { Response, NextFunction } from 'express';
import { documentService } from '../services/document.service';
import { ResponseHandler } from '../utils/response';
import { validate } from '../utils/validators';
import { AuthRequest } from '../middleware/auth.middleware';
import { CreateDocumentDTO, UpdateDocumentDTO, DocumentResponse } from '../models/document.model';
import Joi from 'joi';

// Validation schemas
const createDocumentSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  document_type: Joi.string().valid('aadhar', 'pan', 'driving_license', 'passport', 'voter_id', 'bank_account', 'gst_certificate', 'business_license', 'other').required(),
  document_number: Joi.string().required(),
  document_name: Joi.string().optional(),
  issued_date: Joi.date().optional(),
  expiry_date: Joi.date().optional(),
  issuing_authority: Joi.string().optional(),
  status: Joi.string().valid('active', 'expired', 'cancelled', 'pending_verification').optional(),
  file_path: Joi.string().optional(),
  file_url: Joi.string().uri().optional(),
  notes: Joi.string().optional(),
  is_primary: Joi.boolean().optional(),
  verified: Joi.boolean().optional(),
  created_by: Joi.string().uuid().optional()
});

const updateDocumentSchema = Joi.object({
  document_number: Joi.string().optional(),
  document_name: Joi.string().optional(),
  issued_date: Joi.date().optional(),
  expiry_date: Joi.date().optional(),
  issuing_authority: Joi.string().optional(),
  status: Joi.string().valid('active', 'expired', 'cancelled', 'pending_verification').optional(),
  file_path: Joi.string().optional(),
  file_url: Joi.string().uri().optional(),
  notes: Joi.string().optional(),
  is_primary: Joi.boolean().optional(),
  verified: Joi.boolean().optional(),
  verified_by: Joi.string().uuid().optional(),
  updated_by: Joi.string().uuid().optional()
});

export class DocumentController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const userId = req.query.user_id as string | undefined;
      const documentType = req.query.document_type as string | undefined;

      const documents = await documentService.getAllDocuments(userId, documentType);

      const documentResponses: DocumentResponse[] = documents.map((document) => ({
        id: document.id,
        user_id: document.user_id,
        document_type: document.document_type,
        document_number: document.document_number,
        document_name: document.document_name,
        issued_date: document.issued_date?.toISOString().split('T')[0] || null,
        expiry_date: document.expiry_date?.toISOString().split('T')[0] || null,
        issuing_authority: document.issuing_authority,
        status: document.status,
        file_path: document.file_path,
        file_url: document.file_url,
        notes: document.notes,
        is_primary: document.is_primary,
        verified: document.verified,
        verified_at: document.verified_at?.toISOString() || null,
        verified_by: document.verified_by,
        created_at: document.created_at.toISOString(),
        updated_at: document.updated_at.toISOString(),
        created_by: document.created_by,
        updated_by: document.updated_by,
      }));

      return ResponseHandler.success(res, documentResponses);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return ResponseHandler.error(res, 'Invalid UUID format', 400);
      }

      const document = await documentService.getDocumentById(id);

      const documentResponse: DocumentResponse = {
        id: document.id,
        user_id: document.user_id,
        document_type: document.document_type,
        document_number: document.document_number,
        document_name: document.document_name,
        issued_date: document.issued_date?.toISOString().split('T')[0] || null,
        expiry_date: document.expiry_date?.toISOString().split('T')[0] || null,
        issuing_authority: document.issuing_authority,
        status: document.status,
        file_path: document.file_path,
        file_url: document.file_url,
        notes: document.notes,
        is_primary: document.is_primary,
        verified: document.verified,
        verified_at: document.verified_at?.toISOString() || null,
        verified_by: document.verified_by,
        created_at: document.created_at.toISOString(),
        updated_at: document.updated_at.toISOString(),
        created_by: document.created_by,
        updated_by: document.updated_by,
      };

      return ResponseHandler.success(res, documentResponse);
    } catch (error) {
      next(error);
    }
  }

  async getByUserId(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { userId } = req.params;

      const documents = await documentService.getDocumentsByUserId(userId);

      const documentResponses: DocumentResponse[] = documents.map((document) => ({
        id: document.id,
        user_id: document.user_id,
        document_type: document.document_type,
        document_number: document.document_number,
        document_name: document.document_name,
        issued_date: document.issued_date?.toISOString().split('T')[0] || null,
        expiry_date: document.expiry_date?.toISOString().split('T')[0] || null,
        issuing_authority: document.issuing_authority,
        status: document.status,
        file_path: document.file_path,
        file_url: document.file_url,
        notes: document.notes,
        is_primary: document.is_primary,
        verified: document.verified,
        verified_at: document.verified_at?.toISOString() || null,
        verified_by: document.verified_by,
        created_at: document.created_at.toISOString(),
        updated_at: document.updated_at.toISOString(),
        created_by: document.created_by,
        updated_by: document.updated_by,
      }));

      return ResponseHandler.success(res, documentResponses);
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const documentData = validate<CreateDocumentDTO>(createDocumentSchema, req.body);

      // Set created_by if not provided
      if (req.user && !documentData.created_by) {
        documentData.created_by = req.user.userId;
      }

      const document = await documentService.createDocument(documentData);

      const documentResponse: DocumentResponse = {
        id: document.id,
        user_id: document.user_id,
        document_type: document.document_type,
        document_number: document.document_number,
        document_name: document.document_name,
        issued_date: document.issued_date?.toISOString().split('T')[0] || null,
        expiry_date: document.expiry_date?.toISOString().split('T')[0] || null,
        issuing_authority: document.issuing_authority,
        status: document.status,
        file_path: document.file_path,
        file_url: document.file_url,
        notes: document.notes,
        is_primary: document.is_primary,
        verified: document.verified,
        verified_at: document.verified_at?.toISOString() || null,
        verified_by: document.verified_by,
        created_at: document.created_at.toISOString(),
        updated_at: document.updated_at.toISOString(),
        created_by: document.created_by,
        updated_by: document.updated_by,
      };

      return ResponseHandler.created(res, documentResponse, 'Document created successfully');
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;
      const documentData = validate<UpdateDocumentDTO>(updateDocumentSchema, req.body);

      // Set updated_by
      if (req.user && !documentData.updated_by) {
        documentData.updated_by = req.user.userId;
      }

      const updatedDocument = await documentService.updateDocument(id, documentData);

      const documentResponse: DocumentResponse = {
        id: updatedDocument.id,
        user_id: updatedDocument.user_id,
        document_type: updatedDocument.document_type,
        document_number: updatedDocument.document_number,
        document_name: updatedDocument.document_name,
        issued_date: updatedDocument.issued_date?.toISOString().split('T')[0] || null,
        expiry_date: updatedDocument.expiry_date?.toISOString().split('T')[0] || null,
        issuing_authority: updatedDocument.issuing_authority,
        status: updatedDocument.status,
        file_path: updatedDocument.file_path,
        file_url: updatedDocument.file_url,
        notes: updatedDocument.notes,
        is_primary: updatedDocument.is_primary,
        verified: updatedDocument.verified,
        verified_at: updatedDocument.verified_at?.toISOString() || null,
        verified_by: updatedDocument.verified_by,
        created_at: updatedDocument.created_at.toISOString(),
        updated_at: updatedDocument.updated_at.toISOString(),
        created_by: updatedDocument.created_by,
        updated_by: updatedDocument.updated_by,
      };

      return ResponseHandler.success(res, documentResponse, 'Document updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { id } = req.params;

      await documentService.deleteDocument(id);

      return ResponseHandler.success(res, null, 'Document deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const documentController = new DocumentController();

