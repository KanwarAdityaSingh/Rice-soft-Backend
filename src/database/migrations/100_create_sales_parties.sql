-- Migration: Sales Parties module (same structure as vendors)
-- Description: Creates sales_parties table for sales-side customers; repoints sales_saudas.customer_id to sales_parties.

-- =====================================================
-- STEP 1: Create sales_parties table (mirror vendors)
-- =====================================================

CREATE TABLE IF NOT EXISTS sales_parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20) NOT NULL,
    address JSONB NOT NULL DEFAULT '{}',
    business_details JSONB NOT NULL DEFAULT '{}',
    bank_details JSONB DEFAULT '{}',
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchaser', 'seller', 'both')),
    is_active BOOLEAN DEFAULT true,
    contact_persons JSONB NOT NULL DEFAULT '[]',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    last_enquiry_date TIMESTAMP WITH TIME ZONE,
    google_location_link TEXT,
    business_card_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_parties_email_unique_idx ON sales_parties(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_parties_email ON sales_parties(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_parties_is_active ON sales_parties(is_active);
CREATE INDEX IF NOT EXISTS idx_sales_parties_business_name ON sales_parties(business_name);
CREATE INDEX IF NOT EXISTS idx_sales_parties_type ON sales_parties(type);
CREATE INDEX IF NOT EXISTS idx_sales_parties_gst ON sales_parties((business_details->>'gst_number')) WHERE business_details->>'gst_number' IS NOT NULL AND business_details->>'gst_number' != '';
CREATE INDEX IF NOT EXISTS idx_sales_parties_pan ON sales_parties((business_details->>'pan_number')) WHERE business_details->>'pan_number' IS NOT NULL AND business_details->>'pan_number' != '';
CREATE INDEX IF NOT EXISTS idx_sales_parties_contact_persons ON sales_parties USING GIN (contact_persons);
CREATE INDEX IF NOT EXISTS idx_sales_parties_user_id ON sales_parties(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_parties_lead_id ON sales_parties(lead_id) WHERE lead_id IS NOT NULL;

CREATE TRIGGER update_sales_parties_updated_at
    BEFORE UPDATE ON sales_parties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sales_parties IS 'Sales-side parties (customers); same structure as vendors. Referenced by sales_saudas.customer_id.';

-- =====================================================
-- STEP 2: Migrate existing sales_saudas customers into sales_parties
-- Copy vendors that are referenced by sales_saudas.customer_id, preserving id so customer_id stays valid.
-- =====================================================

INSERT INTO sales_parties (
    id, business_name, contact_persons, contact_person, email, phone, address, business_details,
    bank_details, type, is_active, user_id, lead_id, created_at, updated_at, created_by, updated_by,
    last_enquiry_date, google_location_link, business_card_url
)
SELECT
    v.id, v.business_name, v.contact_persons, v.contact_person, v.email, v.phone, v.address, v.business_details,
    v.bank_details, v.type, v.is_active, v.user_id, v.lead_id, v.created_at, v.updated_at, v.created_by, v.updated_by,
    v.last_enquiry_date, v.google_location_link, v.business_card_url
FROM vendors v
WHERE v.id IN (SELECT DISTINCT customer_id FROM sales_saudas)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 3: Repoint sales_saudas.customer_id to sales_parties
-- =====================================================

ALTER TABLE sales_saudas DROP CONSTRAINT IF EXISTS sales_saudas_customer_id_fkey;
ALTER TABLE sales_saudas
    ADD CONSTRAINT sales_saudas_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES sales_parties(id) ON DELETE RESTRICT;

COMMENT ON COLUMN sales_saudas.customer_id IS 'Reference to sales party (customer)';
