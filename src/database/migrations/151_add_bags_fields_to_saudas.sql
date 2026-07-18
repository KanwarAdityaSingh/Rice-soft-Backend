-- Migration: Add bag count and per-bag weight to saudas

ALTER TABLE saudas
    ADD COLUMN IF NOT EXISTS no_of_bags INTEGER;

ALTER TABLE saudas
    ADD COLUMN IF NOT EXISTS bag_weight DECIMAL(10, 2);

COMMENT ON COLUMN saudas.no_of_bags IS 'Expected number of bags for this sauda (optional)';
COMMENT ON COLUMN saudas.bag_weight IS 'Expected weight per bag in kg (optional)';
