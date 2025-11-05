-- Unified User System Migration
-- Connect all entities (salesman, vendor, broker) to users table

-- 1. Add user_type column to users table
ALTER TABLE users ADD COLUMN user_type VARCHAR(20) DEFAULT 'custom' CHECK (user_type IN ('admin', 'vendor', 'salesman', 'broker', 'custom'));

-- 2. Add user_id foreign keys to business entities
ALTER TABLE salesmen ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vendors ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE brokers ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_salesmen_user_id ON salesmen(user_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_brokers_user_id ON brokers(user_id);

-- 4. Add unique constraints to ensure one-to-one relationships
ALTER TABLE salesmen ADD CONSTRAINT unique_salesman_user UNIQUE (user_id);
ALTER TABLE vendors ADD CONSTRAINT unique_vendor_user UNIQUE (user_id);
ALTER TABLE brokers ADD CONSTRAINT unique_broker_user UNIQUE (user_id);

-- 5. Update existing admin user to have admin type
UPDATE users SET user_type = 'admin' WHERE username = 'admin';

-- 6. Add comments for documentation
COMMENT ON COLUMN users.user_type IS 'Type of user: admin, vendor, salesman, broker, or custom';
COMMENT ON COLUMN salesmen.user_id IS 'Reference to users table - one-to-one relationship';
COMMENT ON COLUMN vendors.user_id IS 'Reference to users table - one-to-one relationship';
COMMENT ON COLUMN brokers.user_id IS 'Reference to users table - one-to-one relationship';

-- 7. Create a view for unified user management
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

COMMENT ON VIEW user_entities IS 'Unified view showing all users with their associated business entity data';

-- 8. Create function to get user with entity data
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

COMMENT ON FUNCTION get_user_with_entity IS 'Get user with their associated business entity data as JSONB';
