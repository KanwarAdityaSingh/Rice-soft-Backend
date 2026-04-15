-- Additional addresses per sales party (primary address remains on sales_parties.address)

CREATE TABLE IF NOT EXISTS sales_party_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sales_party_id UUID NOT NULL REFERENCES sales_parties(id) ON DELETE CASCADE,
    name VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{}',
    google_location_link TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_party_sites_sales_party_id ON sales_party_sites(sales_party_id);
CREATE INDEX IF NOT EXISTS idx_sales_party_sites_is_active ON sales_party_sites(is_active);

CREATE TRIGGER update_sales_party_sites_updated_at
    BEFORE UPDATE ON sales_party_sites
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sales_party_sites IS 'Additional delivery or site addresses for a sales party; primary address is sales_parties.address';
COMMENT ON COLUMN sales_party_sites.name IS 'Optional label e.g. branch or warehouse name';
COMMENT ON COLUMN sales_party_sites.address IS 'JSONB: street, city, state, pincode, country (same shape as sales_parties.address)';
