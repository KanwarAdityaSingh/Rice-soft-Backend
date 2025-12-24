-- Migration: Create vehicles table and update ISP/transporter relationships
-- Description: Creates vehicles entity with Surepass verification fields, adds vehicle_id to ISP, vehicle_ids to transporters, and implements auto-sync triggers

-- Create vehicles table
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_number VARCHAR(50) NOT NULL UNIQUE,
    rc_number VARCHAR(50),
    owner_name VARCHAR(255),
    vehicle_class VARCHAR(50),
    fuel_type VARCHAR(50),
    maker_model VARCHAR(255),
    registration_date DATE,
    insurance_validity DATE,
    fitness_validity DATE,
    permit_validity DATE,
    challan_details JSONB DEFAULT '[]'::jsonb,
    transporter_ids UUID[] DEFAULT ARRAY[]::UUID[],
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_number ON vehicles(vehicle_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_rc_number ON vehicles(rc_number) WHERE rc_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_transporter_ids ON vehicles USING GIN(transporter_ids);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_active ON vehicles(is_active);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_verified ON vehicles(is_verified);

-- Add updated_at trigger for vehicles
CREATE TRIGGER update_vehicles_updated_at 
    BEFORE UPDATE ON vehicles
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add vehicle_ids column to transporters table
ALTER TABLE transporters ADD COLUMN IF NOT EXISTS vehicle_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Create index for transporter vehicle_ids
CREATE INDEX IF NOT EXISTS idx_transporters_vehicle_ids ON transporters USING GIN(vehicle_ids);

-- Add vehicle_id column to inward_slip_passes table
ALTER TABLE inward_slip_passes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE RESTRICT;

-- Create index for ISP vehicle_id
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_vehicle_id ON inward_slip_passes(vehicle_id);

-- Migrate existing data: Create vehicles from unique vehicle_numbers in ISPs
INSERT INTO vehicles (vehicle_number, is_verified, is_active, created_at, updated_at)
SELECT DISTINCT 
    vehicle_number,
    false,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM inward_slip_passes
WHERE vehicle_number IS NOT NULL 
  AND vehicle_number != ''
  AND NOT EXISTS (
      SELECT 1 FROM vehicles v WHERE v.vehicle_number = inward_slip_passes.vehicle_number
  );

-- Update ISPs with vehicle_id based on vehicle_number
UPDATE inward_slip_passes isp
SET vehicle_id = v.id
FROM vehicles v
WHERE isp.vehicle_number = v.vehicle_number
  AND isp.vehicle_id IS NULL;

-- Link vehicles to transporters based on existing data
UPDATE vehicles v
SET transporter_ids = ARRAY(
    SELECT DISTINCT isp.transporter_id
    FROM inward_slip_passes isp
    WHERE isp.vehicle_id = v.id
      AND isp.transporter_id IS NOT NULL
);

-- Update transporters with vehicle_ids based on linked vehicles
UPDATE transporters t
SET vehicle_ids = ARRAY(
    SELECT DISTINCT v.id
    FROM vehicles v
    WHERE t.id = ANY(v.transporter_ids)
);

-- Create function to sync vehicle transporter_ids to transporter vehicle_ids
CREATE OR REPLACE FUNCTION sync_vehicle_to_transporter()
RETURNS TRIGGER AS $$
DECLARE
    old_transporter_id UUID;
    new_transporter_id UUID;
BEGIN
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        -- Remove vehicle from all old transporters
        FOREACH old_transporter_id IN ARRAY OLD.transporter_ids
        LOOP
            UPDATE transporters
            SET vehicle_ids = array_remove(vehicle_ids, OLD.id)
            WHERE id = old_transporter_id;
        END LOOP;
        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        -- Add vehicle to all new transporters
        FOREACH new_transporter_id IN ARRAY NEW.transporter_ids
        LOOP
            UPDATE transporters
            SET vehicle_ids = array_append(vehicle_ids, NEW.id)
            WHERE id = new_transporter_id
              AND NOT (NEW.id = ANY(vehicle_ids));
        END LOOP;
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Remove vehicle from transporters no longer in the list
        FOREACH old_transporter_id IN ARRAY OLD.transporter_ids
        LOOP
            IF NOT (old_transporter_id = ANY(NEW.transporter_ids)) THEN
                UPDATE transporters
                SET vehicle_ids = array_remove(vehicle_ids, NEW.id)
                WHERE id = old_transporter_id;
            END IF;
        END LOOP;

        -- Add vehicle to new transporters
        FOREACH new_transporter_id IN ARRAY NEW.transporter_ids
        LOOP
            IF NOT (new_transporter_id = ANY(OLD.transporter_ids)) THEN
                UPDATE transporters
                SET vehicle_ids = array_append(vehicle_ids, NEW.id)
                WHERE id = new_transporter_id
                  AND NOT (NEW.id = ANY(vehicle_ids));
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vehicle to transporter sync
CREATE TRIGGER sync_vehicle_to_transporter_trigger
    AFTER INSERT OR UPDATE OR DELETE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION sync_vehicle_to_transporter();

-- Create function to sync transporter vehicle_ids to vehicle transporter_ids
CREATE OR REPLACE FUNCTION sync_transporter_to_vehicle()
RETURNS TRIGGER AS $$
DECLARE
    old_vehicle_id UUID;
    new_vehicle_id UUID;
BEGIN
    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        -- Remove transporter from all old vehicles
        FOREACH old_vehicle_id IN ARRAY OLD.vehicle_ids
        LOOP
            UPDATE vehicles
            SET transporter_ids = array_remove(transporter_ids, OLD.id)
            WHERE id = old_vehicle_id;
        END LOOP;
        RETURN OLD;
    END IF;

    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        -- Add transporter to all new vehicles
        FOREACH new_vehicle_id IN ARRAY NEW.vehicle_ids
        LOOP
            UPDATE vehicles
            SET transporter_ids = array_append(transporter_ids, NEW.id)
            WHERE id = new_vehicle_id
              AND NOT (NEW.id = ANY(transporter_ids));
        END LOOP;
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Remove transporter from vehicles no longer in the list
        FOREACH old_vehicle_id IN ARRAY OLD.vehicle_ids
        LOOP
            IF NOT (old_vehicle_id = ANY(NEW.vehicle_ids)) THEN
                UPDATE vehicles
                SET transporter_ids = array_remove(transporter_ids, NEW.id)
                WHERE id = old_vehicle_id;
            END IF;
        END LOOP;

        -- Add transporter to new vehicles
        FOREACH new_vehicle_id IN ARRAY NEW.vehicle_ids
        LOOP
            IF NOT (new_vehicle_id = ANY(OLD.vehicle_ids)) THEN
                UPDATE vehicles
                SET transporter_ids = array_append(transporter_ids, NEW.id)
                WHERE id = new_vehicle_id
                  AND NOT (NEW.id = ANY(transporter_ids));
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for transporter to vehicle sync
CREATE TRIGGER sync_transporter_to_vehicle_trigger
    AFTER INSERT OR UPDATE OR DELETE ON transporters
    FOR EACH ROW
    EXECUTE FUNCTION sync_transporter_to_vehicle();

-- Make vehicle_id required in inward_slip_passes after migration
-- (Commented out for now to allow gradual migration - uncomment after frontend is updated)
-- ALTER TABLE inward_slip_passes ALTER COLUMN vehicle_id SET NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE vehicles IS 'Stores vehicle information with Surepass verification data';
COMMENT ON COLUMN vehicles.vehicle_number IS 'Primary vehicle identifier (registration number)';
COMMENT ON COLUMN vehicles.rc_number IS 'RC number if different from vehicle_number';
COMMENT ON COLUMN vehicles.transporter_ids IS 'Array of transporter UUIDs this vehicle belongs to';
COMMENT ON COLUMN vehicles.is_verified IS 'True if vehicle data was verified via Surepass API';
COMMENT ON COLUMN vehicles.verified_at IS 'Timestamp when vehicle was verified via Surepass';
COMMENT ON COLUMN vehicles.challan_details IS 'JSON array of traffic violations/challans';
COMMENT ON COLUMN transporters.vehicle_ids IS 'Array of vehicle UUIDs owned by this transporter';
COMMENT ON COLUMN inward_slip_passes.vehicle_id IS 'Reference to vehicle entity (replaces vehicle_number)';


