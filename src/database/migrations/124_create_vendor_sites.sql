-- Additional addresses per vendor (native address remains on vendors.address)

CREATE TABLE IF NOT EXISTS vendor_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{}',
    google_location_link TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vendor_sites_vendor_id ON vendor_sites(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_sites_is_active ON vendor_sites(is_active);

CREATE TRIGGER update_vendor_sites_updated_at
    BEFORE UPDATE ON vendor_sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vendor_sites IS 'Additional delivery or site addresses for a vendor; primary address is vendors.address';
COMMENT ON COLUMN vendor_sites.name IS 'Optional label e.g. branch or warehouse name';
COMMENT ON COLUMN vendor_sites.address IS 'JSONB: street, city, state, pincode, country (same shape as vendors.address)';
