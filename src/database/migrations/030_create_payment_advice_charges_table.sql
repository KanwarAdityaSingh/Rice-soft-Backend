-- Migration: Create payment_advice_charges table
-- Description: Creates payment_advice_charges table for storing flexible charges for payment advices

-- Create charge_type enum
DO $$ BEGIN
    CREATE TYPE charge_type_enum AS ENUM ('percentage', 'fixed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment_advice_charges table
CREATE TABLE IF NOT EXISTS payment_advice_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_advice_id UUID NOT NULL REFERENCES payment_advices(id) ON DELETE CASCADE,
    charge_name VARCHAR(255) NOT NULL,
    charge_value DECIMAL(15,2) NOT NULL,
    charge_type VARCHAR(20) CHECK (charge_type IN ('percentage', 'fixed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_advice_charges_payment_advice_id ON payment_advice_charges(payment_advice_id);

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_payment_advice_charges_updated_at 
    BEFORE UPDATE ON payment_advice_charges
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE payment_advice_charges IS 'Stores flexible charges for payment advices (e.g., CD 2.0%, GADI DALA PAID, RTGS Charges, KANTA CHARGES, Dana deduction)';
COMMENT ON COLUMN payment_advice_charges.charge_value IS 'Charge amount (subtracted from payment amount to calculate net payable)';

-- Now add FK constraint to purchases table for payment_advice_id
ALTER TABLE purchases 
ADD CONSTRAINT fk_purchases_payment_advice_id 
FOREIGN KEY (payment_advice_id) REFERENCES payment_advices(id) ON DELETE SET NULL;

