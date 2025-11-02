-- Add custom_permissions JSONB column to users for custom-role UI control
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_permissions JSONB;

-- Initialize empty permissions for existing custom users if null
UPDATE users
SET custom_permissions = '{}'::jsonb
WHERE user_type = 'custom' AND custom_permissions IS NULL;

-- Optional: index if querying by presence of keys (kept simple for now)
-- CREATE INDEX IF NOT EXISTS idx_users_custom_permissions ON users USING GIN (custom_permissions);


