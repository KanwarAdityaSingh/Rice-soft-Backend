-- Optional USP field on invoice dispatches.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS usp TEXT;

COMMENT ON COLUMN invoice_dispatches.usp IS 'Optional USP (free-text) on invoice dispatch';
