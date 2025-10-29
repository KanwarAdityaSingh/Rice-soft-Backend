-- Documents Module Migration
-- Creates documents table to store user documents like Aadhar, PAN, Driving License, etc.

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    document_number VARCHAR(255) NOT NULL,
    document_name VARCHAR(255),
    issued_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending_verification')),
    file_path TEXT,
    file_url TEXT,
    notes TEXT,
    is_primary BOOLEAN DEFAULT false,
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(user_id, document_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_document_number ON documents(document_number);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_verified ON documents(verified);

-- Add comments
COMMENT ON TABLE documents IS 'Stores user documents like Aadhar card, PAN card, Driving License, Passport, etc.';
COMMENT ON COLUMN documents.document_type IS 'Type of document: aadhar, pan, driving_license, passport, voter_id, etc.';
COMMENT ON COLUMN documents.document_number IS 'The unique number/ID on the document';
COMMENT ON COLUMN documents.is_primary IS 'Whether this is the primary document of this type for the user';
COMMENT ON COLUMN documents.verified IS 'Whether the document has been verified by an admin';
COMMENT ON COLUMN documents.status IS 'Current status of the document: active, expired, cancelled, pending_verification';

