-- Optional per-line invoice display name for product lines.
-- Captured on sales sauda; snapshotted onto invoice dispatch at create.
-- When null/empty, e-invoice / e-way / preview continue to use products.name.

ALTER TABLE sales_sauda_lines
  ADD COLUMN IF NOT EXISTS product_alias VARCHAR(255) NULL;

ALTER TABLE invoice_dispatch_lines
  ADD COLUMN IF NOT EXISTS product_alias VARCHAR(255) NULL;

COMMENT ON COLUMN sales_sauda_lines.product_alias IS
  'Optional invoice display name for product lines; null means use product master name';

COMMENT ON COLUMN invoice_dispatch_lines.product_alias IS
  'Snapshot of sales_sauda_lines.product_alias at dispatch create; used for e-invoice/e-way description';
