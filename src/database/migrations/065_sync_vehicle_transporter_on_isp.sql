-- Migration: Auto-sync vehicle and transporter when ISP is created/updated
-- Description: Creates trigger to automatically sync vehicle.transporter_ids and transporter.vehicle_ids when ISP links them

-- =====================================================
-- STEP 1: Create function to sync vehicle and transporter from ISP
-- =====================================================

CREATE OR REPLACE FUNCTION sync_vehicle_transporter_from_isp()
RETURNS TRIGGER AS $$
DECLARE
    old_vehicle_id UUID;
    old_transporter_id UUID;
BEGIN
    -- Handle INSERT (ISP creation)
    IF TG_OP = 'INSERT' THEN
        -- If both vehicle_id and transporter_id are provided, sync them
        IF NEW.vehicle_id IS NOT NULL AND NEW.transporter_id IS NOT NULL THEN
            -- Add transporter to vehicle's transporter_ids (if not already present)
            UPDATE vehicles
            SET transporter_ids = array_append(transporter_ids, NEW.transporter_id)
            WHERE id = NEW.vehicle_id
              AND NOT (NEW.transporter_id = ANY(transporter_ids));
            
            -- Add vehicle to transporter's vehicle_ids (if not already present)
            UPDATE transporters
            SET vehicle_ids = array_append(vehicle_ids, NEW.vehicle_id)
            WHERE id = NEW.transporter_id
              AND NOT (NEW.vehicle_id = ANY(vehicle_ids));
        END IF;
        RETURN NEW;
    END IF;

    -- Handle UPDATE (ISP update)
    IF TG_OP = 'UPDATE' THEN
        old_vehicle_id := OLD.vehicle_id;
        old_transporter_id := OLD.transporter_id;

        -- Handle vehicle_id change
        IF NEW.vehicle_id IS DISTINCT FROM old_vehicle_id THEN
            -- Remove vehicle from old transporter (if old transporter exists)
            IF old_transporter_id IS NOT NULL AND old_vehicle_id IS NOT NULL THEN
                UPDATE transporters
                SET vehicle_ids = array_remove(vehicle_ids, old_vehicle_id)
                WHERE id = old_transporter_id;
                
                -- Remove old transporter from old vehicle
                UPDATE vehicles
                SET transporter_ids = array_remove(transporter_ids, old_transporter_id)
                WHERE id = old_vehicle_id;
            END IF;
            
            -- Add vehicle to new transporter (if new transporter exists)
            IF NEW.transporter_id IS NOT NULL AND NEW.vehicle_id IS NOT NULL THEN
                UPDATE transporters
                SET vehicle_ids = array_append(vehicle_ids, NEW.vehicle_id)
                WHERE id = NEW.transporter_id
                  AND NOT (NEW.vehicle_id = ANY(vehicle_ids));
                
                -- Add new transporter to new vehicle
                UPDATE vehicles
                SET transporter_ids = array_append(transporter_ids, NEW.transporter_id)
                WHERE id = NEW.vehicle_id
                  AND NOT (NEW.transporter_id = ANY(transporter_ids));
            END IF;
        END IF;

        -- Handle transporter_id change (when vehicle_id hasn't changed)
        IF NEW.transporter_id IS DISTINCT FROM old_transporter_id AND NEW.vehicle_id = old_vehicle_id THEN
            -- Remove transporter from vehicle (if old transporter exists)
            IF old_transporter_id IS NOT NULL AND NEW.vehicle_id IS NOT NULL THEN
                UPDATE vehicles
                SET transporter_ids = array_remove(transporter_ids, old_transporter_id)
                WHERE id = NEW.vehicle_id;
                
                -- Remove vehicle from old transporter
                UPDATE transporters
                SET vehicle_ids = array_remove(vehicle_ids, NEW.vehicle_id)
                WHERE id = old_transporter_id;
            END IF;
            
            -- Add new transporter to vehicle (if new transporter exists)
            IF NEW.transporter_id IS NOT NULL AND NEW.vehicle_id IS NOT NULL THEN
                UPDATE vehicles
                SET transporter_ids = array_append(transporter_ids, NEW.transporter_id)
                WHERE id = NEW.vehicle_id
                  AND NOT (NEW.transporter_id = ANY(transporter_ids));
                
                -- Add vehicle to new transporter
                UPDATE transporters
                SET vehicle_ids = array_append(vehicle_ids, NEW.vehicle_id)
                WHERE id = NEW.transporter_id
                  AND NOT (NEW.vehicle_id = ANY(vehicle_ids));
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- Handle DELETE (ISP deletion)
    IF TG_OP = 'DELETE' THEN
        -- Remove vehicle from transporter (if both exist)
        IF OLD.vehicle_id IS NOT NULL AND OLD.transporter_id IS NOT NULL THEN
            UPDATE transporters
            SET vehicle_ids = array_remove(vehicle_ids, OLD.vehicle_id)
            WHERE id = OLD.transporter_id;
            
            -- Remove transporter from vehicle
            UPDATE vehicles
            SET transporter_ids = array_remove(transporter_ids, OLD.transporter_id)
            WHERE id = OLD.vehicle_id;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 2: Create trigger on inward_slip_passes
-- =====================================================

CREATE TRIGGER sync_vehicle_transporter_from_isp_trigger
    AFTER INSERT OR UPDATE OF vehicle_id, transporter_id OR DELETE ON inward_slip_passes
    FOR EACH ROW
    EXECUTE FUNCTION sync_vehicle_transporter_from_isp();

-- =====================================================
-- STEP 3: Sync existing ISPs
-- =====================================================

-- Sync all existing ISPs that have both vehicle_id and transporter_id
DO $$
DECLARE
    isp_record RECORD;
BEGIN
    FOR isp_record IN 
        SELECT DISTINCT vehicle_id, transporter_id
        FROM inward_slip_passes
        WHERE vehicle_id IS NOT NULL AND transporter_id IS NOT NULL
    LOOP
        -- Add transporter to vehicle's transporter_ids (if not already present)
        UPDATE vehicles
        SET transporter_ids = array_append(transporter_ids, isp_record.transporter_id)
        WHERE id = isp_record.vehicle_id
          AND NOT (isp_record.transporter_id = ANY(transporter_ids));
        
        -- Add vehicle to transporter's vehicle_ids (if not already present)
        UPDATE transporters
        SET vehicle_ids = array_append(vehicle_ids, isp_record.vehicle_id)
        WHERE id = isp_record.transporter_id
          AND NOT (isp_record.vehicle_id = ANY(vehicle_ids));
    END LOOP;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION sync_vehicle_transporter_from_isp() IS 'Automatically syncs vehicle.transporter_ids and transporter.vehicle_ids when ISP links them together';

