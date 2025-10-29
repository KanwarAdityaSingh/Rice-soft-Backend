export type DocumentType = 
  | 'aadhar'
  | 'pan'
  | 'driving_license'
  | 'passport'
  | 'voter_id'
  | 'bank_account'
  | 'gst_certificate'
  | 'business_license'
  | 'other';

export type DocumentStatus = 'active' | 'expired' | 'cancelled' | 'pending_verification';

export interface Document {
  id: string;
  user_id: string;
  document_type: DocumentType;
  document_number: string;
  document_name: string | null;
  issued_date: Date | null;
  expiry_date: Date | null;
  issuing_authority: string | null;
  status: DocumentStatus;
  file_path: string | null;
  file_url: string | null;
  notes: string | null;
  is_primary: boolean;
  verified: boolean;
  verified_at: Date | null;
  verified_by: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CreateDocumentDTO {
  user_id: string;
  document_type: DocumentType;
  document_number: string;
  document_name?: string;
  issued_date?: Date;
  expiry_date?: Date;
  issuing_authority?: string;
  status?: DocumentStatus;
  file_path?: string;
  file_url?: string;
  notes?: string;
  is_primary?: boolean;
  verified?: boolean;
  created_by?: string;
}

export interface UpdateDocumentDTO {
  document_number?: string;
  document_name?: string;
  issued_date?: Date;
  expiry_date?: Date;
  issuing_authority?: string;
  status?: DocumentStatus;
  file_path?: string;
  file_url?: string;
  notes?: string;
  is_primary?: boolean;
  verified?: boolean;
  verified_by?: string;
  updated_by?: string;
}

export interface DocumentResponse {
  id: string;
  user_id: string;
  document_type: DocumentType;
  document_number: string;
  document_name: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  issuing_authority: string | null;
  status: DocumentStatus;
  file_path: string | null;
  file_url: string | null;
  notes: string | null;
  is_primary: boolean;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// Common document types
export const DOCUMENT_TYPES = {
  AADHAR: 'aadhar',
  PAN: 'pan',
  DRIVING_LICENSE: 'driving_license',
  PASSPORT: 'passport',
  VOTER_ID: 'voter_id',
  BANK_ACCOUNT: 'bank_account',
  GST_CERTIFICATE: 'gst_certificate',
  BUSINESS_LICENSE: 'business_license',
  OTHER: 'other'
} as const;

// Document statuses
export const DOCUMENT_STATUSES = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PENDING_VERIFICATION: 'pending_verification'
} as const;

