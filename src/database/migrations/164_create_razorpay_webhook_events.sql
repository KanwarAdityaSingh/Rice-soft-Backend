-- Persist Razorpay payout webhooks for audit, debugging, and idempotent replay

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
    webhook_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razorpay_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(128) NOT NULL,
    razorpay_payout_id VARCHAR(255),
    payout_attempt_id UUID REFERENCES payout_attempts(payout_attempt_id) ON DELETE SET NULL,
    redemption_id UUID REFERENCES redemptions(redemption_id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'received',
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    CONSTRAINT razorpay_webhook_events_status_check
        CHECK (status IN ('received', 'processed', 'ignored', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_payout
    ON razorpay_webhook_events(razorpay_payout_id)
    WHERE razorpay_payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_redemption
    ON razorpay_webhook_events(redemption_id, received_at DESC)
    WHERE redemption_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_received
    ON razorpay_webhook_events(received_at DESC);

COMMENT ON TABLE razorpay_webhook_events IS 'Raw Razorpay webhook payloads and processing outcome';
