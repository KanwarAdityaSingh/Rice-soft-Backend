-- Migration: Payment advice FY calculation policy snapshot
-- Adds financial_year + calculation_policy_id on payment_advices.
-- Backfill sets labels from sauda_date / ISP date only — does NOT recalculate amounts.

ALTER TABLE payment_advices
  ADD COLUMN IF NOT EXISTS financial_year VARCHAR(9),
  ADD COLUMN IF NOT EXISTS calculation_policy_id VARCHAR(32);

COMMENT ON COLUMN payment_advices.financial_year IS
  'Indian financial year label (Apr–Mar), e.g. 2024-2025, derived from sauda_date or inward slip pass date';

COMMENT ON COLUMN payment_advices.calculation_policy_id IS
  'Snapshot of purchase calculation rules: legacy_fy (through FY 2025-26) or current_fy (FY 2026-27 onward)';

CREATE INDEX IF NOT EXISTS idx_payment_advices_calculation_policy_id
  ON payment_advices(calculation_policy_id)
  WHERE calculation_policy_id IS NOT NULL;

-- Sauda-linked PAs: prefer sauda_date
UPDATE payment_advices pa
SET
  financial_year = (
    CASE
      WHEN EXTRACT(MONTH FROM s.sauda_date) >= 4 THEN EXTRACT(YEAR FROM s.sauda_date)::int
      ELSE EXTRACT(YEAR FROM s.sauda_date)::int - 1
    END
  )::text || '-' || (
    CASE
      WHEN EXTRACT(MONTH FROM s.sauda_date) >= 4 THEN EXTRACT(YEAR FROM s.sauda_date)::int + 1
      ELSE EXTRACT(YEAR FROM s.sauda_date)::int
    END
  )::text,
  calculation_policy_id = CASE
    WHEN (
      CASE
        WHEN EXTRACT(MONTH FROM s.sauda_date) >= 4 THEN EXTRACT(YEAR FROM s.sauda_date)::int
        ELSE EXTRACT(YEAR FROM s.sauda_date)::int - 1
      END
    ) >= 2026 THEN 'current_fy'
    ELSE 'legacy_fy'
  END
FROM saudas s
WHERE pa.sauda_id = s.id
  AND pa.financial_year IS NULL
  AND s.sauda_date IS NOT NULL;

-- ISP-linked PAs without sauda_date snapshot (or ISP-only rows still missing FY)
UPDATE payment_advices pa
SET
  financial_year = (
    CASE
      WHEN EXTRACT(MONTH FROM isp.date) >= 4 THEN EXTRACT(YEAR FROM isp.date)::int
      ELSE EXTRACT(YEAR FROM isp.date)::int - 1
    END
  )::text || '-' || (
    CASE
      WHEN EXTRACT(MONTH FROM isp.date) >= 4 THEN EXTRACT(YEAR FROM isp.date)::int + 1
      ELSE EXTRACT(YEAR FROM isp.date)::int
    END
  )::text,
  calculation_policy_id = CASE
    WHEN (
      CASE
        WHEN EXTRACT(MONTH FROM isp.date) >= 4 THEN EXTRACT(YEAR FROM isp.date)::int
        ELSE EXTRACT(YEAR FROM isp.date)::int - 1
      END
    ) >= 2026 THEN 'current_fy'
    ELSE 'legacy_fy'
  END
FROM inward_slip_passes isp
WHERE pa.inward_slip_pass_id = isp.id
  AND pa.financial_year IS NULL
  AND isp.date IS NOT NULL;
