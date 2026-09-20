import { PoolClient } from 'pg';
import { db } from '../database/connection';
import {
  CreditNoteAttachment,
  CreateCreditNoteAttachmentDTO,
} from '../models/credit-note-attachment.model';

const SELECT = `
  id, credit_note_id, document_type, file_url, file_name, mime_type, created_at, created_by
`;

export class CreditNoteAttachmentDAO {
  async findByCreditNoteId(creditNoteId: string): Promise<CreditNoteAttachment[]> {
    const result = await db.query<CreditNoteAttachment>(
      `SELECT ${SELECT} FROM credit_note_attachments
       WHERE credit_note_id = $1 ORDER BY created_at ASC`,
      [creditNoteId]
    );
    return result.rows;
  }

  async deleteByCreditNoteId(creditNoteId: string, client?: PoolClient): Promise<void> {
    const query = `DELETE FROM credit_note_attachments WHERE credit_note_id = $1`;
    if (client) await client.query(query, [creditNoteId]);
    else await db.query(query, [creditNoteId]);
  }

  async create(
    data: CreateCreditNoteAttachmentDTO,
    client?: PoolClient
  ): Promise<CreditNoteAttachment> {
    const query = `
      INSERT INTO credit_note_attachments (
        credit_note_id, document_type, file_url, file_name, mime_type, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${SELECT}
    `;
    const values = [
      data.credit_note_id,
      data.document_type,
      data.file_url,
      data.file_name ?? null,
      data.mime_type ?? null,
      data.created_by ?? null,
    ];
    const result = client
      ? await client.query<CreditNoteAttachment>(query, values)
      : await db.query<CreditNoteAttachment>(query, values);
    return result.rows[0];
  }
}

export const creditNoteAttachmentDAO = new CreditNoteAttachmentDAO();
