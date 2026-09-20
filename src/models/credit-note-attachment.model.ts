import type { CreditNoteAttachmentType } from '../constants/credit-note';

export interface CreditNoteAttachment {
  id: string;
  credit_note_id: string;
  document_type: CreditNoteAttachmentType;
  file_url: string;
  file_name: string | null;
  mime_type: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface CreateCreditNoteAttachmentDTO {
  credit_note_id: string;
  document_type: CreditNoteAttachmentType;
  file_url: string;
  file_name?: string | null;
  mime_type?: string | null;
  created_by?: string | null;
}
