-- Credit notes use A/{HR|DL}/CN/{YY-YY}/{n}, independent of Bill of Supply.
-- Serial is per state (HR and DL may both have serial 1 in the same FY).

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_fy_serial_unique;

COMMENT ON TABLE invoice_number_sequences IS
  'Atomic counters for Bill of Supply and credit-note numbers (per document_type + FY + state)';

-- Seed CN series tips from numbers already in the new format. Do not parse CN-YYYY-NNNNNN leftovers.
INSERT INTO invoice_number_sequences (series_key, financial_year, state_code, document_type, last_value)
SELECT
  'CN:' || m.state_code || ':' || m.financial_year AS series_key,
  m.financial_year,
  m.state_code,
  'CN',
  MAX(m.seq)::int AS last_value
FROM (
  SELECT
    cn.financial_year,
    UPPER((regexp_match(cn.credit_note_number, '^A/(HR|DL)/CN/[0-9]{2}-[0-9]{2}/([0-9]+)$'))[1]) AS state_code,
    ((regexp_match(cn.credit_note_number, '^A/(HR|DL)/CN/[0-9]{2}-[0-9]{2}/([0-9]+)$'))[2])::int AS seq
  FROM credit_notes cn
  WHERE cn.credit_note_number ~ '^A/(HR|DL)/CN/[0-9]{2}-[0-9]{2}/[0-9]+$'
) m
WHERE m.state_code IS NOT NULL AND m.seq IS NOT NULL
GROUP BY m.financial_year, m.state_code
ON CONFLICT (series_key) DO UPDATE
SET last_value = GREATEST(invoice_number_sequences.last_value, EXCLUDED.last_value),
    updated_at = CURRENT_TIMESTAMP;

COMMENT ON TABLE credit_notes IS
  'Sales credit note: type-driven value adjustment or sale return; number A/{ST}/CN/{YY-YY}/{n}';
