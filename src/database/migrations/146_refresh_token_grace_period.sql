-- Grace window for concurrent refresh requests (same token in flight twice)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS previous_refresh_token_valid_until TIMESTAMPTZ;

COMMENT ON COLUMN users.previous_refresh_token_hash IS 'Prior refresh hash accepted briefly for concurrent /retry refresh calls';
COMMENT ON COLUMN users.previous_refresh_token_valid_until IS 'Until when previous_refresh_token_hash remains valid';
