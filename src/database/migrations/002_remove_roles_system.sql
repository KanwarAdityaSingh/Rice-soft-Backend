-- Remove roles system and simplify user management
-- This migration removes the roles table and updates the users table

-- First, drop the foreign key constraint from users to roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;

-- Drop the role_id column from users table
ALTER TABLE users DROP COLUMN IF EXISTS role_id;

-- Drop the roles table
DROP TABLE IF EXISTS roles CASCADE;

-- Drop the trigger and function for roles
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Recreate the update_updated_at_column function (needed for users table)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recreate the trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update audit function to remove role references
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

-- The audit trigger for users should still work
-- No need to recreate it as it's still valid
