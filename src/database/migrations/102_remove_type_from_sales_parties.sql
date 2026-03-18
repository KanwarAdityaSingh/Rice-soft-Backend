-- Remove type column from sales_parties (sales parties are always buyers; type is vendor-specific)

DROP INDEX IF EXISTS idx_sales_parties_type;
ALTER TABLE sales_parties DROP COLUMN IF EXISTS type;
