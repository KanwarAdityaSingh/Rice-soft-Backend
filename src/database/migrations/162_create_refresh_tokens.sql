-- Refresh token system for secure session management
-- Allows token revocation and session tracking

CREATE TABLE IF NOT EXISTS public_refresh_tokens (
    refresh_token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    device_info JSONB,
    ip INET,
    user_agent TEXT,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_phone ON public_refresh_tokens(phone);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON public_refresh_tokens(token_hash) WHERE revoked = FALSE;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON public_refresh_tokens(expires_at) WHERE revoked = FALSE;

COMMENT ON TABLE public_refresh_tokens IS 'Refresh tokens for public customer sessions';
COMMENT ON COLUMN public_refresh_tokens.token_hash IS 'SHA-256 hash of refresh token (not plaintext)';
COMMENT ON COLUMN public_refresh_tokens.revoked IS 'True if token was explicitly revoked (logout)';
COMMENT ON COLUMN public_refresh_tokens.device_info IS 'Optional device fingerprint for session tracking';
