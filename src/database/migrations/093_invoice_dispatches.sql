-- Migration: Invoice Dispatches and Lines
-- Description: Creates invoice_dispatches, invoice_dispatch_lines, invoice_dispatch_allocations for Sales module

-- =====================================================
-- STEP 1: Create invoice_dispatches table
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_dispatches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
    internal_invoice_number VARCHAR(100) NOT NULL UNIQUE,
    dispatch_date DATE,
    party_name VARCHAR(255) NOT NULL,
    party_address TEXT,
    party_gst_number VARCHAR(20),
    party_pan_number VARCHAR(20),
    transporter_id UUID REFERENCES transporters(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
    distance_km DECIMAL(10,2),
    route_description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_sales_sauda_id ON invoice_dispatches(sales_sauda_id);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_status ON invoice_dispatches(status);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatches_dispatch_date ON invoice_dispatches(dispatch_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_dispatches_internal_invoice_number ON invoice_dispatches(internal_invoice_number);

CREATE TRIGGER update_invoice_dispatches_updated_at
    BEFORE UPDATE ON invoice_dispatches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoice_dispatches IS 'Dispatch document - snapshot of invoice and party; inventory deducted on confirm';

-- =====================================================
-- STEP 2: Create invoice_dispatch_lines table
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_dispatch_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_dispatch_id UUID NOT NULL REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
    sales_sauda_line_id UUID REFERENCES sales_sauda_lines(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    packaging_id UUID REFERENCES packaging(id) ON DELETE SET NULL,
    quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
    quantity_unit VARCHAR(10) NOT NULL DEFAULT 'kg',
    rate DECIMAL(12,2) NOT NULL CHECK (rate >= 0),
    amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_lines_invoice_dispatch_id ON invoice_dispatch_lines(invoice_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_lines_product_id ON invoice_dispatch_lines(product_id);

CREATE TRIGGER update_invoice_dispatch_lines_updated_at
    BEFORE UPDATE ON invoice_dispatch_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE invoice_dispatch_lines IS 'Line items snapshot for each invoice dispatch';

-- =====================================================
-- STEP 3: Create invoice_dispatch_allocations table
-- =====================================================

CREATE TABLE IF NOT EXISTS invoice_dispatch_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_dispatch_id UUID NOT NULL REFERENCES invoice_dispatches(id) ON DELETE CASCADE,
    invoice_dispatch_line_id UUID NOT NULL REFERENCES invoice_dispatch_lines(id) ON DELETE CASCADE,
    finished_goods_inventory_id UUID NOT NULL REFERENCES finished_goods_inventory(id) ON DELETE RESTRICT,
    quantity_deducted DECIMAL(12,3) NOT NULL CHECK (quantity_deducted > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_allocations_dispatch_id ON invoice_dispatch_allocations(invoice_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_dispatch_allocations_fgi_id ON invoice_dispatch_allocations(finished_goods_inventory_id);

COMMENT ON TABLE invoice_dispatch_allocations IS 'Which FGI rows were used to fulfill each dispatch line (FIFO allocation)';
