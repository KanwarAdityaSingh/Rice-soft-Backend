-- Add products.rice_variant using the same rice_type_enum as rice_code_variants.variant.
-- rice_type is kept in sync for salesman-commission dual-write.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS rice_variant rice_type_enum;

UPDATE products
SET rice_variant = CASE
  WHEN rice_category = 'basmati' THEN
    CASE
      WHEN rice_type::text IN ('raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella')
        THEN rice_type
      ELSE 'raw_basmati'::rice_type_enum
    END
  ELSE
    CASE
      WHEN rice_type::text IN ('non_basmati', 'parboiled', 'raw')
        THEN rice_type
      ELSE 'non_basmati'::rice_type_enum
    END
END
WHERE rice_variant IS NULL;

ALTER TABLE products
  ALTER COLUMN rice_variant SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_rice_variant ON products (rice_variant);

COMMENT ON COLUMN products.rice_variant IS
  'Processing variant within rice_category (same values as rice_code_variants.variant / GET rice-codes/getRiceVariants)';
