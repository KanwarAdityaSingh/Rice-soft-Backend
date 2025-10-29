import { documentDAO } from '../dao/document.dao';
import { NotFoundError, ConflictError } from '../utils/errors';
import { CreateDocumentDTO, UpdateDocumentDTO, Document } from '../models/document.model';
import { logger } from '../utils/logger';

export class DocumentService {
  async getAllDocuments(userId?: string, documentType?: string): Promise<Document[]> {
    return await documentDAO.findAll(userId, documentType);
  }

  async getDocumentById(id: string): Promise<Document> {
    const document = await documentDAO.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }
    return document;
  }

  async getDocumentsByUserId(userId: string): Promise<Document[]> {
    return await documentDAO.findByUserId(userId);
  }

  async createDocument(documentData: CreateDocumentDTO): Promise<Document> {
    // Check if document number already exists
    const existingDocument = await documentDAO.documentExists(documentData.document_number);
    if (existingDocument) {
      throw new ConflictError('Document with this number already exists');
    }

    logger.info('Creating document', {
      userId: documentData.user_id,
      documentType: documentData.document_type,
      documentNumber: documentData.document_number
    });

    return await documentDAO.create(documentData);
  }

  async updateDocument(id: string, documentData: UpdateDocumentDTO): Promise<Document> {
    // Check if document exists
    const existingDocument = await documentDAO.findById(id);
    if (!existingDocument) {
      throw new NotFoundError('Document not found');
    }

    // Check if document number conflicts (if being updated)
    if (documentData.document_number && documentData.document_number !== existingDocument.document_number) {
      const documentExists = await documentDAO.documentExists(documentData.document_number, id);
      if (documentExists) {
        throw new ConflictError('Document with this number already exists');
      }
    }

    logger.info('Updating document', { documentId: id });

    const updatedDocument = await documentDAO.update(id, documentData);
    if (!updatedDocument) {
      throw new NotFoundError('Document not found');
    }

    return updatedDocument;
  }

  async deleteDocument(id: string): Promise<void> {
    const document = await documentDAO.findById(id);
    if (!document) {
      throw new NotFoundError('Document not found');
    }

    logger.info('Deleting document', { documentId: id });
    await documentDAO.delete(id);
  }
}

export const documentService = new DocumentService();

