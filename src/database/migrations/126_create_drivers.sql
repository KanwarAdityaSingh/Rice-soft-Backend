-- Drivers (driving license holders); Surepass DL verification fields reserved for upcoming integration

CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_number VARCHAR(50) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_details JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_drivers_license_number UNIQUE (license_number)
);

CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone);
CREATE INDEX IF NOT EXISTS idx_drivers_is_active ON drivers(is_active);
CREATE INDEX IF NOT EXISTS idx_drivers_is_verified ON drivers(is_verified);

CREATE TRIGGER update_drivers_updated_at
    BEFORE UPDATE ON drivers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE drivers IS 'Driving license holders; DL verification via Surepass to be integrated';
COMMENT ON COLUMN drivers.license_number IS 'Normalized unique driving license number (Indian DL format)';
COMMENT ON COLUMN drivers.verification_details IS 'Last successful Surepass (or provider) verification payload snapshot';
