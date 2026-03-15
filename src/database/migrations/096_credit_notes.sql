-- Migration: Credit Notes and Credit Note Lines (sale return)

CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_dispatch_id UUID NOT NULL REFERENCES invoice_dispatches(id) ON DELETE RESTRICT,
    sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
    credit_note_number VARCHAR(100) NOT NULL UNIQUE,
    credit_note_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_dispatch_id ON credit_notes(invoice_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_sales_sauda_id ON credit_notes(sales_sauda_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_notes_credit_note_number ON credit_notes(credit_note_number);

CREATE TRIGGER update_credit_notes_updated_at
    BEFORE UPDATE ON credit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE credit_notes IS 'Sale return: links to invoice dispatch; inventory restored on confirm';

CREATE TABLE IF NOT EXISTS credit_note_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
    invoice_dispatch_line_id UUID NOT NULL REFERENCES invoice_dispatch_lines(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity_returned DECIMAL(12,3) NOT NULL CHECK (quantity_returned > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note_id ON credit_note_lines(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_invoice_dispatch_line_id ON credit_note_lines(invoice_dispatch_line_id);

CREATE TRIGGER update_credit_note_lines_updated_at
    BEFORE UPDATE ON credit_note_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE credit_note_lines IS 'Returned quantities per invoice dispatch line';
