-- Migration: Drop contact_person column from brokers table
-- Description: Since we've migrated to contact_persons, we need to drop the old contact_person column

-- 1. Drop the view first to avoid type conflicts
DROP VIEW IF EXISTS user_entities;

-- 2. Recreate the view with the new structure using contact_persons
-- Extract the first contact person's name from the JSONB array for backward compatibility
-- Cast to VARCHAR(255) to maintain the same type as before
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
    CASE 
        WHEN b.contact_persons IS NOT NULL AND jsonb_array_length(b.contact_persons) > 0 
        THEN (b.contact_persons->0->>'name')::VARCHAR(255)
        ELSE NULL::VARCHAR(255)
    END as broker_contact_person,
    b.contact_persons as broker_contact_persons,
    b.type as broker_type
FROM users u
LEFT JOIN salesmen s ON u.id = s.user_id
LEFT JOIN vendors v ON u.id = v.user_id
LEFT JOIN brokers b ON u.id = b.user_id;

-- 3. Now drop the column (view no longer depends on it)
ALTER TABLE brokers DROP COLUMN IF EXISTS contact_person;

