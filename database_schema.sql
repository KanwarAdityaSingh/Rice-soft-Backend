-- =====================================================
-- Rice Soft Database Schema Script
-- =====================================================
-- This script creates the complete database architecture
-- (structure only, no data)
-- 
-- To use: psql -U <username> -d <database_name> -f database_schema.sql
-- =====================================================

-- =====================================================
-- 1. EXTENSIONS
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Note: gen_random_uuid() is available natively in PostgreSQL 13+
-- If using PostgreSQL < 13, uncomment the line below:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1.1. ENUMS
-- =====================================================

-- Rice type enum
CREATE TYPE rice_type_enum AS ENUM ('basmati', 'non_basmati', 'parboiled', 'raw');

-- =====================================================
-- 2. FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to audit user changes
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs(user_id, action, entity_type, entity_id, old_values)
        VALUES (OLD.updated_by, 'DELETE', 'users', OLD.id, row_to_json(OLD));
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs(user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.updated_by, 'UPDATE', 'users', NEW.id, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs(user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.created_by, 'INSERT', 'users', NEW.id, row_to_json(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

-- Function to get user with entity data
CREATE OR REPLACE FUNCTION get_user_with_entity(user_uuid UUID)
RETURNS TABLE (
    user_id UUID,
    username VARCHAR,
    email VARCHAR,
    full_name VARCHAR,
    user_type VARCHAR,
    is_active BOOLEAN,
    entity_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.user_type,
        u.is_active,
        CASE 
            WHEN u.user_type = 'salesman' THEN 
                jsonb_build_object(
                    'type', 'salesman',
                    'data', jsonb_build_object(
                        'id', s.id,
                        'name', s.name,
                        'phone', s.phone,
                        'email', s.email
                    )
                )
            WHEN u.user_type = 'vendor' THEN 
                jsonb_build_object(
                    'type', 'vendor',
                    'data', jsonb_build_object(
                        'id', v.id,
                        'business_name', v.business_name,
                        'contact_person', v.contact_person,
                        'email', v.email,
                        'phone', v.phone,
                        'type', v.type,
                        'address', v.address,
                        'business_details', v.business_details
                    )
                )
            WHEN u.user_type = 'broker' THEN 
                jsonb_build_object(
                    'type', 'broker',
                    'data', jsonb_build_object(
                        'id', b.id,
                        'business_name', b.business_name,
                        'contact_person', b.contact_person,
                        'email', b.email,
                        'phone', b.phone,
                        'type', b.type,
                        'address', b.address,
                        'business_details', b.business_details,
                        'broker_details', b.broker_details
                    )
                )
            ELSE 
                jsonb_build_object('type', u.user_type, 'data', NULL)
        END as entity_data
    FROM users u
    LEFT JOIN salesmen s ON u.id = s.user_id AND u.user_type = 'salesman'
    LEFT JOIN vendors v ON u.id = v.user_id AND u.user_type = 'vendor'
    LEFT JOIN brokers b ON u.id = b.user_id AND u.user_type = 'broker'
    WHERE u.id = user_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. TABLES
-- =====================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    user_type VARCHAR(20) DEFAULT 'custom' CHECK (user_type IN ('admin', 'vendor', 'salesman', 'broker', 'custom')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Salesmen table
CREATE TABLE IF NOT EXISTS salesmen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_salesman_user UNIQUE (user_id)
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address JSONB NOT NULL DEFAULT '{}',
    business_details JSONB NOT NULL DEFAULT '{}',
    bank_details JSONB DEFAULT '{}',
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchaser', 'seller', 'both')),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    lead_id UUID,
    last_enquiry_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_vendor_user UNIQUE (user_id)
);

-- Brokers table
CREATE TABLE IF NOT EXISTS brokers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address JSONB NOT NULL DEFAULT '{}',
    business_details JSONB NOT NULL DEFAULT '{}',
    broker_details JSONB DEFAULT '{}',
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'sale', 'both')),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT unique_broker_user UNIQUE (user_id)
);

-- Rice codes table
CREATE TABLE IF NOT EXISTS rice_codes (
    rice_code_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rice_code_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    address JSONB,
    business_details JSONB,
    is_existing_customer BOOLEAN NOT NULL DEFAULT false,
    lead_status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'engaged', 'converted', 'rejected')),
    customer_status VARCHAR(50),
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    rice_code_id UUID NOT NULL REFERENCES rice_codes(rice_code_id) ON DELETE RESTRICT,
    rice_type rice_type_enum NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    source VARCHAR(100),
    estimated_value DECIMAL(15,2),
    expected_close_date DATE,
    revenue DECIMAL(15,2) DEFAULT 0,
    CONSTRAINT chk_lead_status_valid CHECK (lead_status IN ('new', 'contacted', 'engaged', 'converted', 'rejected')),
    CONSTRAINT chk_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- Lead events table
CREATE TABLE IF NOT EXISTS lead_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Conversions table
CREATE TABLE IF NOT EXISTS conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL,
    conversion_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    conversion_value DECIMAL(15,2),
    commission_rate DECIMAL(5,2),
    commission_amount DECIMAL(15,2),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT
);

-- Lead vendor mapping table
CREATE TABLE IF NOT EXISTS lead_vendor_mapping (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    converted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    conversion_value DECIMAL(15,2),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(lead_id, vendor_id)
);

-- Login history table
CREATE TABLE IF NOT EXISTS login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    operating_system VARCHAR(100),
    login_status VARCHAR(20) NOT NULL CHECK (login_status IN ('success', 'failed', 'blocked')),
    failure_reason VARCHAR(255),
    login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_login_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Documents table
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

-- Add foreign key constraint for vendors.lead_id
ALTER TABLE vendors ADD CONSTRAINT IF NOT EXISTS vendors_lead_id_fkey 
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;

-- Add foreign key constraint for leads.rice_code_id (already added in table definition, but ensuring it exists)
-- Note: Foreign key is already defined in the CREATE TABLE statement above

-- =====================================================
-- 4. INDEXES
-- =====================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Salesmen indexes
CREATE INDEX IF NOT EXISTS idx_salesmen_email ON salesmen(email);
CREATE INDEX IF NOT EXISTS idx_salesmen_is_active ON salesmen(is_active);
CREATE INDEX IF NOT EXISTS idx_salesmen_name ON salesmen(name);
CREATE INDEX IF NOT EXISTS idx_salesmen_user_id ON salesmen(user_id);

-- Vendors indexes
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_business_name ON vendors(business_name);
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(type);
CREATE INDEX IF NOT EXISTS idx_vendors_gst ON vendors((business_details->>'gst_number'));
CREATE INDEX IF NOT EXISTS idx_vendors_pan ON vendors((business_details->>'pan_number'));
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_lead_id ON vendors(lead_id);

-- Brokers indexes
CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_brokers_is_active ON brokers(is_active);
CREATE INDEX IF NOT EXISTS idx_brokers_business_name ON brokers(business_name);
CREATE INDEX IF NOT EXISTS idx_brokers_type ON brokers(type);
CREATE INDEX IF NOT EXISTS idx_brokers_gst ON brokers((business_details->>'gst_number'));
CREATE INDEX IF NOT EXISTS idx_brokers_pan ON brokers((business_details->>'pan_number'));
CREATE INDEX IF NOT EXISTS idx_brokers_user_id ON brokers(user_id);

-- Rice codes indexes
CREATE INDEX IF NOT EXISTS idx_rice_codes_name ON rice_codes(rice_code_name);

-- Leads indexes
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON leads(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_is_existing_customer ON leads(is_existing_customer);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_rice_code_id ON leads(rice_code_id);
CREATE INDEX IF NOT EXISTS idx_leads_rice_type ON leads(rice_type);

-- Lead events indexes
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_events_event_type ON lead_events(event_type);

-- Conversions indexes
CREATE INDEX IF NOT EXISTS idx_conversions_lead_id ON conversions(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversions_vendor_id ON conversions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_conversions_broker_id ON conversions(broker_id);
CREATE INDEX IF NOT EXISTS idx_conversions_conversion_date ON conversions(conversion_date);

-- Lead vendor mapping indexes
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_vendor_id ON lead_vendor_mapping(vendor_id);
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_lead_id ON lead_vendor_mapping(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_vendor_mapping_converted_at ON lead_vendor_mapping(converted_at DESC);

-- Login history indexes
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_status ON login_history(login_status);
CREATE INDEX IF NOT EXISTS idx_login_history_user_status ON login_history(user_id, login_status);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_document_number ON documents(document_number);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_verified ON documents(verified);

-- =====================================================
-- 5. TRIGGERS
-- =====================================================

-- Triggers for updated_at columns
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_salesmen_updated_at 
    BEFORE UPDATE ON salesmen
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at 
    BEFORE UPDATE ON vendors
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brokers_updated_at 
    BEFORE UPDATE ON brokers
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rice_codes_updated_at 
    BEFORE UPDATE ON rice_codes
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON leads
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for audit logging on users
CREATE TRIGGER audit_users_changes
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW 
    EXECUTE FUNCTION audit_user_changes();

-- =====================================================
-- 6. VIEWS
-- =====================================================

-- Unified user entities view
CREATE OR REPLACE VIEW user_entities AS
SELECT 
    u.id as user_id,
    u.username,
    u.email as user_email,
    u.full_name as user_name,
    u.user_type,
    u.is_active as user_active,
    u.created_at as user_created_at,
    s.id as salesman_id,
    s.name as salesman_name,
    s.phone as salesman_phone,
    v.id as vendor_id,
    v.business_name as vendor_business_name,
    v.contact_person as vendor_contact_person,
    v.type as vendor_type,
    b.id as broker_id,
    b.business_name as broker_business_name,
    b.contact_person as broker_contact_person,
    b.type as broker_type
FROM users u
LEFT JOIN salesmen s ON u.id = s.user_id
LEFT JOIN vendors v ON u.id = v.user_id
LEFT JOIN brokers b ON u.id = b.user_id;

-- Lead analytics view
CREATE OR REPLACE VIEW lead_analytics AS
SELECT 
    l.id,
    l.company_name,
    l.contact_person,
    l.email,
    l.lead_status,
    l.priority,
    l.estimated_value,
    l.created_at,
    u.username as assigned_salesman,
    u2.username as created_by_user,
    COUNT(le.id) as event_count,
    CASE 
        WHEN c.id IS NOT NULL THEN 'converted'
        ELSE l.lead_status
    END as actual_status
FROM leads l
LEFT JOIN users u ON l.assigned_to = u.id
LEFT JOIN users u2 ON l.created_by = u2.id
LEFT JOIN lead_events le ON l.id = le.lead_id
LEFT JOIN conversions c ON l.id = c.lead_id
GROUP BY l.id, u.username, u2.username, c.id;

-- =====================================================
-- 7. COMMENTS
-- =====================================================

-- Table comments
COMMENT ON TABLE salesmen IS 'Stores information about salesmen with basic contact details';
COMMENT ON TABLE vendors IS 'Stores comprehensive vendor information including business and bank details';
COMMENT ON TABLE brokers IS 'Stores comprehensive broker information including commission and specialization';
COMMENT ON TABLE rice_codes IS 'Stores rice code information with unique identifiers';
COMMENT ON TABLE leads IS 'Stores potential customer leads for sales tracking';
COMMENT ON TABLE lead_events IS 'Audit trail for all lead activities and status changes';
COMMENT ON TABLE conversions IS 'Tracks successful lead-to-vendor conversions';
COMMENT ON TABLE login_history IS 'Stores all user login attempts and successful logins for security and auditing purposes';
COMMENT ON TABLE documents IS 'Stores user documents like Aadhar card, PAN card, Driving License, Passport, etc.';
COMMENT ON TABLE lead_vendor_mapping IS 'Tracks which leads were converted to this vendor';

-- Column comments
COMMENT ON COLUMN users.user_type IS 'Type of user: admin, vendor, salesman, broker, or custom';
COMMENT ON COLUMN salesmen.user_id IS 'Reference to users table - one-to-one relationship';
COMMENT ON COLUMN vendors.type IS 'Indicates if vendor is purchaser, seller, or both';
COMMENT ON COLUMN vendors.address IS 'JSONB containing street, city, state, pincode, country';
COMMENT ON COLUMN vendors.business_details IS 'JSONB containing pan_number, gst_number, registration_number, business_type';
COMMENT ON COLUMN vendors.bank_details IS 'JSONB containing account details for payments';
COMMENT ON COLUMN vendors.user_id IS 'Reference to users table - one-to-one relationship';
COMMENT ON COLUMN vendors.lead_id IS 'Reference to the original lead if this vendor came from a lead';
COMMENT ON COLUMN vendors.last_enquiry_date IS 'Date of the last enquiry/order made by this vendor';
COMMENT ON COLUMN brokers.type IS 'Indicates if broker handles purchase, sale, or both';
COMMENT ON COLUMN brokers.broker_details IS 'JSONB containing commission_rate, specialization, experience_years';
COMMENT ON COLUMN brokers.user_id IS 'Reference to users table - one-to-one relationship';
COMMENT ON COLUMN leads.is_existing_customer IS 'True if this lead is already a customer in the system';
COMMENT ON COLUMN leads.lead_status IS 'Current status of the lead in the sales pipeline';
COMMENT ON COLUMN leads.assigned_to IS 'Salesman assigned to handle this lead';
COMMENT ON COLUMN leads.rice_code_id IS 'Reference to the rice code for this lead';
COMMENT ON COLUMN leads.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, or raw';
COMMENT ON COLUMN leads.priority IS 'Priority level of the lead';
COMMENT ON COLUMN leads.estimated_value IS 'Estimated deal value';
COMMENT ON COLUMN leads.expected_close_date IS 'Expected date to close the deal';
COMMENT ON COLUMN leads.revenue IS 'Actual revenue generated from this lead after conversion';
COMMENT ON COLUMN rice_codes.rice_code_id IS 'Primary key identifier for the rice code';
COMMENT ON COLUMN rice_codes.rice_code_name IS 'Name of the rice code';
COMMENT ON COLUMN lead_events.event_type IS 'Type of event (status_change, note_added, call_made, etc.)';
COMMENT ON COLUMN lead_events.metadata IS 'Additional event data in JSON format';
COMMENT ON COLUMN conversions.lead_id IS 'Reference to the original lead';
COMMENT ON COLUMN conversions.vendor_id IS 'Reference to the converted vendor';
COMMENT ON COLUMN conversions.broker_id IS 'Broker involved in the conversion';
COMMENT ON COLUMN conversions.conversion_value IS 'Final deal value';
COMMENT ON COLUMN conversions.commission_rate IS 'Commission rate percentage';
COMMENT ON COLUMN conversions.commission_amount IS 'Calculated commission amount';
COMMENT ON COLUMN login_history.login_status IS 'Status of login attempt: success, failed, or blocked';
COMMENT ON COLUMN login_history.failure_reason IS 'Reason for failed login (e.g., Invalid password, Account locked)';
COMMENT ON COLUMN documents.document_type IS 'Type of document: aadhar, pan, driving_license, passport, voter_id, etc.';
COMMENT ON COLUMN documents.document_number IS 'The unique number/ID on the document';
COMMENT ON COLUMN documents.is_primary IS 'Whether this is the primary document of this type for the user';
COMMENT ON COLUMN documents.verified IS 'Whether the document has been verified by an admin';
COMMENT ON COLUMN documents.status IS 'Current status of the document: active, expired, cancelled, pending_verification';

-- View comments
COMMENT ON VIEW user_entities IS 'Unified view showing all users with their associated business entity data';
COMMENT ON VIEW lead_analytics IS 'Comprehensive view of leads with analytics data';

-- Function comments
COMMENT ON FUNCTION get_user_with_entity IS 'Get user with their associated business entity data as JSONB';

-- =====================================================
-- END OF SCHEMA SCRIPT
-- =====================================================
