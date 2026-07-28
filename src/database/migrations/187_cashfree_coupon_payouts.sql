-- Replace Razorpay coupon payout storage with Cashfree (bank IMPS).
-- Idempotent: safe to re-run if a previous attempt partially failed.

ALTER TYPE redemption_paid_via ADD VALUE IF NOT EXISTS 'cashfree';

-- Rename razorpay_payout_id → provider_transfer_id only if the old column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payout_attempts'
      AND column_name = 'razorpay_payout_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payout_attempts'
      AND column_name = 'provider_transfer_id'
  ) THEN
    ALTER TABLE payout_attempts
      RENAME COLUMN razorpay_payout_id TO provider_transfer_id;
  END IF;
END $$;

ALTER TABLE payout_attempts
  ADD COLUMN IF NOT EXISTS transfer_id VARCHAR(40);

-- If rename was skipped but provider_transfer_id is still missing, add it
ALTER TABLE payout_attempts
  ADD COLUMN IF NOT EXISTS provider_transfer_id VARCHAR(255);

DROP INDEX IF EXISTS idx_payout_attempts_razorpay;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_attempts_transfer_id
  ON payout_attempts(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payout_attempts_provider_transfer
  ON payout_attempts(provider_transfer_id)
  WHERE provider_transfer_id IS NOT NULL;

COMMENT ON TABLE payout_attempts IS 'Auto-payout try history (Cashfree); manual payments are recorded on redemptions only';
COMMENT ON COLUMN payout_attempts.transfer_id IS 'Merchant-generated Cashfree transfer_id (idempotent, max 40 chars)';
COMMENT ON COLUMN payout_attempts.provider_transfer_id IS 'Cashfree cf_transfer_id';

DROP TABLE IF EXISTS razorpay_webhook_events;

CREATE TABLE IF NOT EXISTS cashfree_webhook_events (
    webhook_event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashfree_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(128) NOT NULL,
    transfer_id VARCHAR(40),
    provider_transfer_id VARCHAR(255),
    payout_attempt_id UUID REFERENCES payout_attempts(payout_attempt_id) ON DELETE SET NULL,
    redemption_id UUID REFERENCES redemptions(redemption_id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'received',
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    CONSTRAINT cashfree_webhook_events_status_check
        CHECK (status IN ('received', 'processed', 'ignored', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_cashfree_webhook_events_transfer
  ON cashfree_webhook_events(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashfree_webhook_events_provider
  ON cashfree_webhook_events(provider_transfer_id)
  WHERE provider_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashfree_webhook_events_redemption
  ON cashfree_webhook_events(redemption_id, received_at DESC)
  WHERE redemption_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cashfree_webhook_events_received
  ON cashfree_webhook_events(received_at DESC);

COMMENT ON TABLE cashfree_webhook_events IS 'Raw Cashfree payout webhook payloads and processing outcome';
