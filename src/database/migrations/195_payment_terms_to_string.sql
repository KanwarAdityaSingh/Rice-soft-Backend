-- payment_terms: free-form string (UI-defined labels / day terms), no longer integer days only.
-- Drop the integer CHECK first — Postgres rewrites it during ALTER TYPE and fails with
-- "operator does not exist: character varying >= integer".
ALTER TABLE sales_saudas
  DROP CONSTRAINT IF EXISTS sales_saudas_payment_terms_check;

ALTER TABLE sales_saudas
  ALTER COLUMN payment_terms TYPE VARCHAR(100)
  USING payment_terms::text;

COMMENT ON COLUMN sales_saudas.payment_terms IS 'Payment terms label (e.g. day count or collection mode); values owned by frontend';
