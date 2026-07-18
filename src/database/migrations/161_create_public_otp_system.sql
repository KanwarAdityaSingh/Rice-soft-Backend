-- OTP verification for public coupon redemption portal
-- Allows customers to login with phone + OTP to view redemption history

CREATE TABLE IF NOT EXISTS public_otp_verifications (
    otp_verification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    purpose VARCHAR(32) NOT NULL DEFAULT 'login',
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    ip INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_otp_phone_purpose ON public_otp_verifications(phone, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_otp_expires ON public_otp_verifications(expires_at) WHERE verified = FALSE;

COMMENT ON TABLE public_otp_verifications IS 'OTP verification for public customer login';
COMMENT ON COLUMN public_otp_verifications.purpose IS 'login, status_check, etc.';
COMMENT ON COLUMN public_otp_verifications.attempts IS 'Failed verification attempts';
