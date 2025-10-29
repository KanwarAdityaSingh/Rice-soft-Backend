-- Sales Module Migration
-- Creates leads, lead_events, conversions tables and updates vendors table

-- Create leads table
CREATE TABLE leads (
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
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    source VARCHAR(100),
    estimated_value DECIMAL(15,2),
    expected_close_date DATE
);

-- Create lead_events table for audit trail
CREATE TABLE lead_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Create conversions table
CREATE TABLE conversions (
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

-- Add lead_id field to vendors table
ALTER TABLE vendors ADD COLUMN lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_leads_assigned_to ON leads (assigned_to);
CREATE INDEX idx_leads_created_by ON leads (created_by);
CREATE INDEX idx_leads_lead_status ON leads (lead_status);
CREATE INDEX idx_leads_is_existing_customer ON leads (is_existing_customer);
CREATE INDEX idx_leads_created_at ON leads (created_at);
CREATE INDEX idx_leads_priority ON leads (priority);

CREATE INDEX idx_lead_events_lead_id ON lead_events (lead_id);
CREATE INDEX idx_lead_events_created_at ON lead_events (created_at);
CREATE INDEX idx_lead_events_event_type ON lead_events (event_type);

CREATE INDEX idx_conversions_lead_id ON conversions (lead_id);
CREATE INDEX idx_conversions_vendor_id ON conversions (vendor_id);
CREATE INDEX idx_conversions_broker_id ON conversions (broker_id);
CREATE INDEX idx_conversions_conversion_date ON conversions (conversion_date);

CREATE INDEX idx_vendors_lead_id ON vendors (lead_id);

-- Add constraints
ALTER TABLE leads ADD CONSTRAINT chk_lead_status_valid CHECK (lead_status IN ('new', 'contacted', 'engaged', 'converted', 'rejected'));
ALTER TABLE leads ADD CONSTRAINT chk_priority_valid CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Add comments
COMMENT ON TABLE leads IS 'Stores potential customer leads for sales tracking';
COMMENT ON TABLE lead_events IS 'Audit trail for all lead activities and status changes';
COMMENT ON TABLE conversions IS 'Tracks successful lead-to-vendor conversions';

COMMENT ON COLUMN leads.is_existing_customer IS 'True if this lead is already a customer in the system';
COMMENT ON COLUMN leads.lead_status IS 'Current status of the lead in the sales pipeline';
COMMENT ON COLUMN leads.assigned_to IS 'Salesman assigned to handle this lead';
COMMENT ON COLUMN leads.priority IS 'Priority level of the lead';
COMMENT ON COLUMN leads.estimated_value IS 'Estimated deal value';
COMMENT ON COLUMN leads.expected_close_date IS 'Expected date to close the deal';

COMMENT ON COLUMN lead_events.event_type IS 'Type of event (status_change, note_added, call_made, etc.)';
COMMENT ON COLUMN lead_events.metadata IS 'Additional event data in JSON format';

COMMENT ON COLUMN conversions.lead_id IS 'Reference to the original lead';
COMMENT ON COLUMN conversions.vendor_id IS 'Reference to the converted vendor';
COMMENT ON COLUMN conversions.broker_id IS 'Broker involved in the conversion';
COMMENT ON COLUMN conversions.conversion_value IS 'Final deal value';
COMMENT ON COLUMN conversions.commission_rate IS 'Commission rate percentage';
COMMENT ON COLUMN conversions.commission_amount IS 'Calculated commission amount';

COMMENT ON COLUMN vendors.lead_id IS 'Reference to the original lead if this vendor came from a lead';

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO leads (company_name, contact_person, email, phone, address, business_details, is_existing_customer, lead_status, assigned_to, created_by, priority, source, estimated_value) VALUES
('Sample Lead Company', 'John Lead Manager', 'john.lead@sample.com', '+91-9876543001', 
 '{"street": "123 Lead Street", "city": "Mumbai", "state": "Maharashtra", "pincode": "400001", "country": "India"}',
 '{"pan_number": "LEAD1234F", "gst_number": "27LEAD1234F1Z5"}',
 false, 'new', 
 (SELECT id FROM users WHERE user_type = 'salesman' LIMIT 1),
 (SELECT id FROM users WHERE user_type = 'admin' LIMIT 1),
 'high', 'website', 50000.00);

-- Create a view for lead analytics
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

COMMENT ON VIEW lead_analytics IS 'Comprehensive view of leads with analytics data';
