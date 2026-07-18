-- Coupon system Phase 1: batches, codes, redeemers, redemptions

CREATE TYPE coupon_status AS ENUM (
    'created',
    'printed',
    'allotted',
    'redeemed',
    'expired',
    'void'
);

CREATE TYPE coupon_batch_status AS ENUM (
    'draft',
    'generating',
    'ready',
    'archived'
);

CREATE TYPE redemption_payout_status AS ENUM (
    'pending',
    'paid'
);

CREATE TYPE redemption_paid_via AS ENUM (
    'manual',
    'razorpay'
);

CREATE TABLE IF NOT EXISTS coupon_batches (
    coupon_batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    face_value_paise INT NOT NULL CHECK (face_value_paise > 0),
    total_count INT NOT NULL CHECK (total_count > 0),
    generated_count INT NOT NULL DEFAULT 0 CHECK (generated_count >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    status coupon_batch_status NOT NULL DEFAULT 'draft',
    redeem_base_url VARCHAR(512),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupon_batches_status ON coupon_batches(status);
CREATE INDEX IF NOT EXISTS idx_coupon_batches_created_at ON coupon_batches(created_at DESC);

DROP TRIGGER IF EXISTS update_coupon_batches_updated_at ON coupon_batches;
CREATE TRIGGER update_coupon_batches_updated_at
    BEFORE UPDATE ON coupon_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS coupons (
    coupon_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code CHAR(8) NOT NULL,
    coupon_batch_id UUID NOT NULL REFERENCES coupon_batches(coupon_batch_id) ON DELETE RESTRICT,
    face_value_paise INT NOT NULL CHECK (face_value_paise > 0),
    status coupon_status NOT NULL DEFAULT 'created',
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT coupons_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_batch_status ON coupons(coupon_batch_id, status);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_expires_at ON coupons(expires_at)
    WHERE status IN ('printed', 'allotted');

DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons;
CREATE TRIGGER update_coupons_updated_at
    BEFORE UPDATE ON coupons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS coupon_status_history (
    coupon_status_history_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(coupon_id) ON DELETE CASCADE,
    from_status coupon_status,
    to_status coupon_status NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupon_status_history_coupon ON coupon_status_history(coupon_id, created_at);

CREATE TABLE IF NOT EXISTS redeemers (
    redeemer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) NOT NULL,
    name VARCHAR(255),
    upi_vpa VARCHAR(255),
    account_holder_name VARCHAR(255),
    account_number VARCHAR(512),
    ifsc VARCHAR(11),
    bank_name VARCHAR(255),
    total_redemptions INT NOT NULL DEFAULT 0 CHECK (total_redemptions >= 0),
    lifetime_earned_paise INT NOT NULL DEFAULT 0 CHECK (lifetime_earned_paise >= 0),
    first_redeemed_at TIMESTAMPTZ,
    last_redeemed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT redeemers_phone_unique UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS idx_redeemers_phone ON redeemers(phone);

DROP TRIGGER IF EXISTS update_redeemers_updated_at ON redeemers;
CREATE TRIGGER update_redeemers_updated_at
    BEFORE UPDATE ON redeemers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS redemptions (
    redemption_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    public_ref VARCHAR(32) NOT NULL,
    coupon_id UUID NOT NULL REFERENCES coupons(coupon_id) ON DELETE RESTRICT,
    redeemer_id UUID NOT NULL REFERENCES redeemers(redeemer_id) ON DELETE RESTRICT,
    coupon_batch_id UUID NOT NULL REFERENCES coupon_batches(coupon_batch_id) ON DELETE RESTRICT,
    code CHAR(8) NOT NULL,
    base_amount_paise INT NOT NULL CHECK (base_amount_paise > 0),
    bonus_amount_paise INT NOT NULL DEFAULT 0 CHECK (bonus_amount_paise >= 0),
    total_amount_paise INT NOT NULL CHECK (total_amount_paise > 0),
    payout_upi_vpa VARCHAR(255),
    payout_account_holder_name VARCHAR(255),
    payout_account_number VARCHAR(512),
    payout_ifsc VARCHAR(11),
    payout_status redemption_payout_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    paid_via redemption_paid_via,
    payment_reference VARCHAR(255),
    last_payout_error TEXT,
    paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    redeemed_ip INET,
    redeemed_user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT redemptions_coupon_id_unique UNIQUE (coupon_id),
    CONSTRAINT redemptions_idempotency_key_unique UNIQUE (idempotency_key),
    CONSTRAINT redemptions_public_ref_unique UNIQUE (public_ref)
);

CREATE INDEX IF NOT EXISTS idx_redemptions_payout_status ON redemptions(payout_status);
CREATE INDEX IF NOT EXISTS idx_redemptions_redeemer ON redemptions(redeemer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_batch ON redemptions(coupon_batch_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_created_at ON redemptions(created_at DESC);

CREATE TABLE IF NOT EXISTS redemption_attempts (
    redemption_attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_attempted VARCHAR(8),
    phone VARCHAR(15),
    ip INET,
    failure_reason VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redemption_attempts_ip ON redemption_attempts(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_code ON redemption_attempts(code_attempted, created_at DESC);

COMMENT ON TABLE coupon_batches IS 'Coupon print runs / generation batches';
COMMENT ON TABLE coupons IS 'Individual 8-character coupon codes';
COMMENT ON TABLE coupon_status_history IS 'Append-only audit of coupon lifecycle';
COMMENT ON TABLE redeemers IS 'End customers who redeem coupons, keyed by phone';
COMMENT ON TABLE redemptions IS 'Successful coupon redemptions and payout state';
COMMENT ON TABLE redemption_attempts IS 'Failed verify/redeem attempts for fraud tracking';
