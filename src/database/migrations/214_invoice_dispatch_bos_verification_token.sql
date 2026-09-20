-- Public Bill of Supply verification (QR on printed PDF)
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS bos_verification_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS bos_verification_token_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_dispatches_bos_verification_token
  ON invoice_dispatches (bos_verification_token)
  WHERE bos_verification_token IS NOT NULL;
