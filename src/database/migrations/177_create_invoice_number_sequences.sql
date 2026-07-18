-- Per (series, financial year, state) counters for internal invoice numbers.
-- Resets naturally each FY because series_key includes financial_year.

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  series_key VARCHAR(64) PRIMARY KEY,
  financial_year VARCHAR(9) NOT NULL,
  state_code VARCHAR(8) NOT NULL,
  document_type VARCHAR(16) NOT NULL DEFAULT 'BOS',
  last_value INT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_number_sequences_fy
  ON invoice_number_sequences (financial_year);

COMMENT ON TABLE invoice_number_sequences IS
  'Atomic counters for Bill of Supply internal invoice numbers (per FY + state)';

-- Seed counters from existing invoice_dispatches (best-effort parse of known formats)
INSERT INTO invoice_number_sequences (series_key, financial_year, state_code, document_type, last_value)
SELECT
  'BOS:' || m.state_code || ':' || m.financial_year AS series_key,
  m.financial_year,
  m.state_code,
  'BOS',
  MAX(m.seq)::int AS last_value
FROM (
  -- From 2026-27: A/HR/B/26-27/1 or A/DL/B/26-27/1
  SELECT
    d.financial_year,
    UPPER((regexp_match(d.internal_invoice_number, '^A/(HR|DL)/B/[0-9]{2}-[0-9]{2}/([0-9]+)$'))[1]) AS state_code,
    ((regexp_match(d.internal_invoice_number, '^A/(HR|DL)/B/[0-9]{2}-[0-9]{2}/([0-9]+)$'))[2])::int AS seq
  FROM invoice_dispatches d
  WHERE d.internal_invoice_number ~ '^A/(HR|DL)/B/[0-9]{2}-[0-9]{2}/[0-9]+$'

  UNION ALL

  -- Legacy Delhi: 2025-26/001
  SELECT
    d.financial_year,
    'DL' AS state_code,
    ((regexp_match(d.internal_invoice_number, '^[0-9]{4}-[0-9]{2}/([0-9]+)$'))[1])::int AS seq
  FROM invoice_dispatches d
  WHERE d.internal_invoice_number ~ '^[0-9]{4}-[0-9]{2}/[0-9]+$'

  UNION ALL

  -- Legacy Haryana: AAPL/2025-26/1
  SELECT
    d.financial_year,
    'HR' AS state_code,
    ((regexp_match(d.internal_invoice_number, '^AAPL/[0-9]{4}-[0-9]{2}/([0-9]+)$'))[1])::int AS seq
  FROM invoice_dispatches d
  WHERE d.internal_invoice_number ~ '^AAPL/[0-9]{4}-[0-9]{2}/[0-9]+$'
) m
WHERE m.state_code IS NOT NULL AND m.seq IS NOT NULL
GROUP BY m.financial_year, m.state_code
ON CONFLICT (series_key) DO UPDATE
SET last_value = GREATEST(invoice_number_sequences.last_value, EXCLUDED.last_value),
    updated_at = CURRENT_TIMESTAMP;
