-- Migration: Create purchases table
-- Description: Creates purchases table for storing purchase execution records

-- Create purchase_status enum
DO $$ BEGIN
    CREATE TYPE purchase_status_enum AS ENUM ('pending', 'in_transit', 'received', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create purchases table
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    sauda_id UUID NOT NULL REFERENCES saudas(id) ON DELETE RESTRICT,
    broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
    broker_commission DECIMAL(5,2),
    payment_advice_id UUID, -- Will add FK constraint after payment_advices table is created
    invoice_number VARCHAR(255),
    invoice_date DATE,
    rate DECIMAL(10,2) NOT NULL,
    total_bags INTEGER,
    total_weight DECIMAL(10,2),
    total_amount DECIMAL(15,2),
    igst_amount DECIMAL(15,2),
    igst_percentage DECIMAL(5,2),
    freight_status VARCHAR(50),
    transportation_bill_image_url TEXT,
    bill_pdf_url TEXT,
    bilti_image_url TEXT,
    bilti_pdf_url TEXT,
    eway_bill_number VARCHAR(255),
    eway_bill_url TEXT,
    truck_number VARCHAR(50),
    transport_name VARCHAR(255),
    goods_dispatched_from VARCHAR(255),
    goods_dispatched_to VARCHAR(255),
    purchase_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'completed')),
    expected_quantity DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_purchases_vendor_id ON purchases(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchases_sauda_id ON purchases(sauda_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_broker_id ON purchases(broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_payment_advice_id ON purchases(payment_advice_id) WHERE payment_advice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON purchases(invoice_number) WHERE invoice_number IS NOT NULL;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_purchases_updated_at 
    BEFORE UPDATE ON purchases
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE purchases IS 'Stores purchase execution records';
COMMENT ON COLUMN purchases.status IS 'Status of purchase: pending (initiated), in_transit, received (delivered), completed';
COMMENT ON COLUMN purchases.payment_advice_id IS 'Reference to payment advice - one-to-one relationship';

