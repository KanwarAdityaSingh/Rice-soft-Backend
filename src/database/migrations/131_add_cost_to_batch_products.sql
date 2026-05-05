-- Migration: Add optional cost to batch_products (per batch–product link, stage 2)

ALTER TABLE batch_products
    ADD COLUMN IF NOT EXISTS cost DECIMAL(15, 2);

COMMENT ON COLUMN batch_products.cost IS 'Optional cost amount captured when attaching a product to a batch (same currency as other purchase amounts)';
