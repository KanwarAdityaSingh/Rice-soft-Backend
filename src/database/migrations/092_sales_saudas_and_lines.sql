-- Migration: Sales Saudas and Sales Sauda Lines
-- Description: Creates sales_saudas (order header) and sales_sauda_lines (line items) for the Sales module

-- =====================================================
-- STEP 1: Create sales_saudas table
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_saudas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'order', 'cancelled')),
    order_number VARCHAR(50) UNIQUE,
    sauda_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_saudas_customer_id ON sales_saudas(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_saudas_status ON sales_saudas(status);
CREATE INDEX IF NOT EXISTS idx_sales_saudas_sauda_date ON sales_saudas(sauda_date);
CREATE INDEX IF NOT EXISTS idx_sales_saudas_order_number ON sales_saudas(order_number) WHERE order_number IS NOT NULL;

CREATE TRIGGER update_sales_saudas_updated_at
    BEFORE UPDATE ON sales_saudas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sales_saudas IS 'Sales order header - draft becomes order when finalized';
COMMENT ON COLUMN sales_saudas.customer_id IS 'Reference to vendor (customer)';
COMMENT ON COLUMN sales_saudas.order_number IS 'Set when finalized (e.g. SO-001)';

-- =====================================================
-- STEP 2: Create sales_sauda_lines table
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_sauda_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    packaging_id UUID REFERENCES packaging(id) ON DELETE SET NULL,
    quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
    quantity_unit VARCHAR(10) NOT NULL DEFAULT 'kg',
    rate DECIMAL(12,2) NOT NULL CHECK (rate >= 0),
    amount DECIMAL(14,2) NOT NULL CHECK (amount >= 0),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_sauda_lines_sales_sauda_id ON sales_sauda_lines(sales_sauda_id);
CREATE INDEX IF NOT EXISTS idx_sales_sauda_lines_product_id ON sales_sauda_lines(product_id);

CREATE TRIGGER update_sales_sauda_lines_updated_at
    BEFORE UPDATE ON sales_sauda_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sales_sauda_lines IS 'Line items for a sales sauda (product, quantity, rate, amount)';
