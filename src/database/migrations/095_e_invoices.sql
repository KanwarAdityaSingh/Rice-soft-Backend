-- Migration: E-Invoices table for government e-invoice storage

CREATE TABLE IF NOT EXISTS e_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_dispatch_id UUID NOT NULL UNIQUE REFERENCES invoice_dispatches(id) ON DELETE RESTRICT,
    irn VARCHAR(255) NOT NULL UNIQUE,
    acknowledgement_number VARCHAR(255),
    ack_date TIMESTAMP WITH TIME ZONE,
    qr_code_content TEXT,
    government_response_payload JSONB,
    status VARCHAR(50) DEFAULT 'generated',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_e_invoices_invoice_dispatch_id ON e_invoices(invoice_dispatch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_e_invoices_irn ON e_invoices(irn);

CREATE TRIGGER update_e_invoices_updated_at
    BEFORE UPDATE ON e_invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE e_invoices IS 'Government e-invoice response (MasterIndia): IRN, ack, QR, payload';
