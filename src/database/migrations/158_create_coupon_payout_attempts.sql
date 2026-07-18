-- Razorpay payout attempts (Phase 3) — Razorpay tries only, not manual payments

CREATE TABLE IF NOT EXISTS payout_attempts (
    payout_attempt_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES redemptions(redemption_id) ON DELETE RESTRICT,
    amount_paise INT NOT NULL CHECK (amount_paise > 0),
    status VARCHAR(32) NOT NULL,
    razorpay_payout_id VARCHAR(255),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payout_attempts_redemption ON payout_attempts(redemption_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payout_attempts_razorpay ON payout_attempts(razorpay_payout_id)
    WHERE razorpay_payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payout_attempts_pending ON payout_attempts(status, created_at)
    WHERE status = 'initiated';

COMMENT ON TABLE payout_attempts IS 'Razorpay payout try history; manual payments are recorded on redemptions only';
