-- Migration: Align calculation_policy_id with FY 2026-27 threshold
-- If 154 ran with the old >= 2025 rule, rows in FY 2025-26 may have current_fy incorrectly.

UPDATE payment_advices
SET calculation_policy_id = CASE
  WHEN CAST(SPLIT_PART(financial_year, '-', 1) AS INTEGER) >= 2026 THEN 'current_fy'
  ELSE 'legacy_fy'
END
WHERE financial_year IS NOT NULL;

-- Re-derive policy from sauda_date where FY label is still missing
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
