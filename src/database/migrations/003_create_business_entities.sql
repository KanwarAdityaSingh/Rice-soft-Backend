-- Create Salesman, Vendor, and Broker entities

-- 1. SALESMEN TABLE
CREATE TABLE IF NOT EXISTS salesmen (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for salesmen
CREATE INDEX IF NOT EXISTS idx_salesmen_email ON salesmen(email);
CREATE INDEX IF NOT EXISTS idx_salesmen_is_active ON salesmen(is_active);
CREATE INDEX IF NOT EXISTS idx_salesmen_name ON salesmen(name);

-- 2. VENDORS TABLE
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for vendors
CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_business_name ON vendors(business_name);
CREATE INDEX IF NOT EXISTS idx_vendors_type ON vendors(type);
CREATE INDEX IF NOT EXISTS idx_vendors_gst ON vendors((business_details->>'gst_number'));
CREATE INDEX IF NOT EXISTS idx_vendors_pan ON vendors((business_details->>'pan_number'));

-- 3. BROKERS TABLE
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for brokers
CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_brokers_is_active ON brokers(is_active);
CREATE INDEX IF NOT EXISTS idx_brokers_business_name ON brokers(business_name);
CREATE INDEX IF NOT EXISTS idx_brokers_type ON brokers(type);
CREATE INDEX IF NOT EXISTS idx_brokers_gst ON brokers((business_details->>'gst_number'));
CREATE INDEX IF NOT EXISTS idx_brokers_pan ON brokers((business_details->>'pan_number'));

-- Create triggers for updated_at
CREATE TRIGGER update_salesmen_updated_at BEFORE UPDATE ON salesmen
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brokers_updated_at BEFORE UPDATE ON brokers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE salesmen IS 'Stores information about salesmen with basic contact details';
COMMENT ON TABLE vendors IS 'Stores comprehensive vendor information including business and bank details';
COMMENT ON TABLE brokers IS 'Stores comprehensive broker information including commission and specialization';

COMMENT ON COLUMN vendors.type IS 'Indicates if vendor is purchaser, seller, or both';
COMMENT ON COLUMN vendors.address IS 'JSONB containing street, city, state, pincode, country';
COMMENT ON COLUMN vendors.business_details IS 'JSONB containing pan_number, gst_number, registration_number, business_type';
COMMENT ON COLUMN vendors.bank_details IS 'JSONB containing account details for payments';

COMMENT ON COLUMN brokers.type IS 'Indicates if broker handles purchase, sale, or both';
COMMENT ON COLUMN brokers.broker_details IS 'JSONB containing commission_rate, specialization, experience_years';

