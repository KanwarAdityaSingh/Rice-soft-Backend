import { db } from '../database/connection';
import { Document, CreateDocumentDTO, UpdateDocumentDTO } from '../models/document.model';
import { logger } from '../utils/logger';

export class DocumentDAO {
  async findAll(userId?: string, documentType?: string): Promise<Document[]> {
    let query = `
      SELECT id, user_id, document_type, document_number, document_name, issued_date, expiry_date,
             issuing_authority, status, file_path, file_url, notes, is_primary, verified,
             verified_at, verified_by, created_at, updated_at, created_by, updated_by
      FROM documents
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramCount = 1;

    if (userId) {
      query += ` AND user_id = $${paramCount++}`;
      params.push(userId);
    }

    if (documentType) {
      query += ` AND document_type = $${paramCount++}`;
      params.push(documentType);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query<Document>(query, params);
    return result.rows;
  }

  async findById(id: string): Promise<Document | null> {
    const query = `
      SELECT id, user_id, document_type, document_number, document_name, issued_date, expiry_date,
             issuing_authority, status, file_path, file_url, notes, is_primary, verified,
             verified_at, verified_by, created_at, updated_at, created_by, updated_by
      FROM documents
      WHERE id = $1
    `;
    const result = await db.query<Document>(query, [id]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: string): Promise<Document[]> {
    const query = `
      SELECT id, user_id, document_type, document_number, document_name, issued_date, expiry_date,
             issuing_authority, status, file_path, file_url, notes, is_primary, verified,
             verified_at, verified_by, created_at, updated_at, created_by, updated_by
      FROM documents
      WHERE user_id = $1
      ORDER BY document_type, created_at DESC
    `;
    const result = await db.query<Document>(query, [userId]);
    return result.rows;
  }

  async findByDocumentNumber(documentNumber: string, excludeId?: string): Promise<Document | null> {
    const query = excludeId
      ? 'SELECT id, user_id, document_type, document_number, document_name, issued_date, expiry_date, issuing_authority, status, file_path, file_url, notes, is_primary, verified, verified_at, verified_by, created_at, updated_at, created_by, updated_by FROM documents WHERE document_number = $1 AND id != $2 LIMIT 1'
      : 'SELECT id, user_id, document_type, document_number, document_name, issued_date, expiry_date, issuing_authority, status, file_path, file_url, notes, is_primary, verified, verified_at, verified_by, created_at, updated_at, created_by, updated_by FROM documents WHERE document_number = $1 LIMIT 1';
    
    const values = excludeId ? [documentNumber, excludeId] : [documentNumber];
    const result = await db.query<Document>(query, values);
    return result.rows[0] || null;
  }

  async create(documentData: CreateDocumentDTO): Promise<Document> {
    const query = `
      INSERT INTO documents (user_id, document_type, document_number, document_name,
                            issued_date, expiry_date, issuing_authority, status,
                            file_path, file_url, notes, is_primary, verified, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id, user_id, document_type, document_number, document_name, issued_date, expiry_date,
                issuing_authority, status, file_path, file_url, notes, is_primary, verified,
                verified_at, verified_by, created_at, updated_at, created_by, updated_by
    `;
    
    const values = [
      documentData.user_id,
      documentData.document_type,
      documentData.document_number,
      documentData.document_name || null,
      documentData.issued_date || null,
      documentData.expiry_date || null,
      documentData.issuing_authority || null,
      documentData.status || 'pending_verification',
      documentData.file_path || null,
      documentData.file_url || null,
      documentData.notes || null,
      documentData.is_primary !== undefined ? documentData.is_primary : false,
      documentData.verified !== undefined ? documentData.verified : false,
      documentData.created_by || null
    ];

    const result = await db.query<Document>(query, values);
    const document = result.rows[0];

    logger.info('Document created', {
      documentId: document.id,
      userId: document.user_id,
      documentType: document.document_type
    });

    return document;
  }

  async update(id: string, documentData: UpdateDocumentDTO): Promise<Document | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (documentData.document_number !== undefined) {
      fields.push(`document_number = $${paramCount++}`);
      values.push(documentData.document_number);
    }
    if (documentData.document_name !== undefined) {
      fields.push(`document_name = $${paramCount++}`);
      values.push(documentData.document_name);
    }
    if (documentData.issued_date !== undefined) {
      fields.push(`issued_date = $${paramCount++}`);
      values.push(documentData.issued_date);
    }
    if (documentData.expiry_date !== undefined) {
      fields.push(`expiry_date = $${paramCount++}`);
      values.push(documentData.expiry_date);
    }
    if (documentData.issuing_authority !== undefined) {
      fields.push(`issuing_authority = $${paramCount++}`);
      values.push(documentData.issuing_authority);
    }
    if (documentData.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(documentData.status);
    }
    if (documentData.file_path !== undefined) {
      fields.push(`file_path = $${paramCount++}`);
      values.push(documentData.file_path);
    }
    if (documentData.file_url !== undefined) {
      fields.push(`file_url = $${paramCount++}`);
      values.push(documentData.file_url);
    }
    if (documentData.notes !== undefined) {
      fields.push(`notes = $${paramCount++}`);
      values.push(documentData.notes);
    }
    if (documentData.is_primary !== undefined) {
      fields.push(`is_primary = $${paramCount++}`);
      values.push(documentData.is_primary);
    }
    if (documentData.verified !== undefined) {
      fields.push(`verified = $${paramCount++}`);
      values.push(documentData.verified);
      if (documentData.verified && documentData.verified_by) {
        fields.push(`verified_at = CURRENT_TIMESTAMP`);
        fields.push(`verified_by = $${paramCount++}`);
        values.push(documentData.verified_by);
      }
    }
    if (documentData.verified_by !== undefined) {
      fields.push(`verified_by = $${paramCount++}`);
      values.push(documentData.verified_by);
    }
    if (documentData.updated_by !== undefined) {
      fields.push(`updated_by = $${paramCount++}`);
      values.push(documentData.updated_by);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE documents
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, user_id, document_type, document_number, document_name, issued_date, expiry_date,
                issuing_authority, status, file_path, file_url, notes, is_primary, verified,
                verified_at, verified_by, created_at, updated_at, created_by, updated_by
    `;

    const result = await db.query<Document>(query, values);
    logger.info('Document updated', { documentId: id });
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM documents WHERE id = $1';
    const result = await db.query(query, [id]);
    logger.info('Document deleted', { documentId: id });
    return (result.rowCount || 0) > 0;
  }

  async documentExists(documentNumber: string, excludeId?: string): Promise<boolean> {
    const document = await this.findByDocumentNumber(documentNumber, excludeId);
    return document !== null;
  }
}

export const documentDAO = new DocumentDAO();

