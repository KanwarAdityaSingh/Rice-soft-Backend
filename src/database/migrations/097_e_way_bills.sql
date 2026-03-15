-- Migration: E-Way Bills table for dispatch and return transport

CREATE TABLE IF NOT EXISTS e_way_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_dispatch_id UUID REFERENCES invoice_dispatches(id) ON DELETE SET NULL,
    credit_note_id UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
    eway_bill_number VARCHAR(100),
    vehicle_number VARCHAR(50),
    distance_km DECIMAL(10,2),
    route TEXT,
    transporter_id UUID REFERENCES transporters(id) ON DELETE SET NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT e_way_bills_source_check CHECK (invoice_dispatch_id IS NOT NULL OR credit_note_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_e_way_bills_invoice_dispatch_id ON e_way_bills(invoice_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_e_way_bills_credit_note_id ON e_way_bills(credit_note_id);

CREATE TRIGGER update_e_way_bills_updated_at
    BEFORE UPDATE ON e_way_bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE e_way_bills IS 'E-Way Bill for dispatch or return (MasterIndia)';
