-- Migration: Create payment_advices table
-- Description: Creates payment_advices table for storing payment processing records

-- Create payment_advice_status enum
DO $$ BEGIN
    CREATE TYPE payment_advice_status_enum AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment_advices table
CREATE TABLE IF NOT EXISTS payment_advices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    recipient_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    sr_number VARCHAR(50),
    party_name VARCHAR(255),
    party_address TEXT,
    broker_name VARCHAR(255),
    invoice_number VARCHAR(255),
    invoice_date DATE,
    truck_number VARCHAR(50),
    item VARCHAR(100),
    total_bags INTEGER,
    due_date DATE,
    bill_weight DECIMAL(10,2),
    kanta_weight DECIMAL(10,2),
    final_weight DECIMAL(10,2),
    rate DECIMAL(10,2),
    amount DECIMAL(15,2) NOT NULL,
    transaction_id VARCHAR(255),
    date_of_payment DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    payment_slip_image_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_advices_purchase_id ON payment_advices(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_advices_payer_id ON payment_advices(payer_id);
CREATE INDEX IF NOT EXISTS idx_payment_advices_recipient_id ON payment_advices(recipient_id);
CREATE INDEX IF NOT EXISTS idx_payment_advices_status ON payment_advices(status);
CREATE INDEX IF NOT EXISTS idx_payment_advices_date_of_payment ON payment_advices(date_of_payment);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_payment_advices_updated_at 
    BEFORE UPDATE ON payment_advices
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE payment_advices IS 'Stores payment processing records';
COMMENT ON COLUMN payment_advices.status IS 'Status of payment: pending, completed, failed';
COMMENT ON COLUMN payment_advices.final_weight IS 'Final weight after deductions (bill_weight - kanta_weight - dana deduction via charges)';

