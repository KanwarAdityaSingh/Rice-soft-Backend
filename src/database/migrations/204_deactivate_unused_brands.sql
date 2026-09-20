-- Migration 204: Hide Tamara, Jyoti, Dubar from brand dropdowns (soft-inactive).
-- Brands master is a table (not brand_enum). Active-only APIs omit these.

UPDATE brands
SET status = 'inactive',
    updated_at = CURRENT_TIMESTAMP
WHERE name IN ('Tamara', 'Jyoti', 'Dubar')
  AND status <> 'inactive';

COMMENT ON TABLE brands IS
  'Brand master. Dropdowns use status=active only. Legacy products.brand enum (Tamara/Hariom) is dual-write only.';
