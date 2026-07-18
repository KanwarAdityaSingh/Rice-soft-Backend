-- Migration: Rice code category (basmati/non_basmati), variants per code, sauda rice_category

DO $$ BEGIN
    CREATE TYPE rice_code_category_enum AS ENUM ('basmati', 'non_basmati');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE rice_codes
    ADD COLUMN IF NOT EXISTS category rice_code_category_enum NOT NULL DEFAULT 'basmati';

CREATE INDEX IF NOT EXISTS idx_rice_codes_category ON rice_codes(category);

CREATE TABLE IF NOT EXISTS rice_code_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rice_code_id UUID NOT NULL REFERENCES rice_codes(rice_code_id) ON DELETE CASCADE,
    variant rice_type_enum NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT rice_code_variants_unique UNIQUE (rice_code_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_rice_code_variants_rice_code_id ON rice_code_variants(rice_code_id);

DROP TRIGGER IF EXISTS update_rice_code_variants_updated_at ON rice_code_variants;
CREATE TRIGGER update_rice_code_variants_updated_at
    BEFORE UPDATE ON rice_code_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Backfill variants for existing codes (all basmati processing options by default)
INSERT INTO rice_code_variants (rice_code_id, variant)
SELECT rc.rice_code_id, v.variant::rice_type_enum
FROM rice_codes rc
CROSS JOIN (
    VALUES
        ('raw_basmati'),
        ('steam_basmati'),
        ('white_sella'),
        ('golden_sella')
) AS v(variant)
WHERE rc.category = 'basmati'
ON CONFLICT (rice_code_id, variant) DO NOTHING;

INSERT INTO rice_code_variants (rice_code_id, variant)
SELECT rc.rice_code_id, v.variant::rice_type_enum
FROM rice_codes rc
CROSS JOIN (
    VALUES
        ('non_basmati'),
        ('parboiled'),
        ('raw')
) AS v(variant)
WHERE rc.category = 'non_basmati'
ON CONFLICT (rice_code_id, variant) DO NOTHING;

ALTER TABLE saudas
    ADD COLUMN IF NOT EXISTS rice_category rice_code_category_enum;

UPDATE saudas
SET rice_category = CASE
    WHEN rice_type IN ('basmati', 'raw_basmati', 'steam_basmati', 'white_sella', 'golden_sella')
        THEN 'basmati'::rice_code_category_enum
    ELSE 'non_basmati'::rice_code_category_enum
END
WHERE rice_category IS NULL;

ALTER TABLE saudas ALTER COLUMN rice_category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_saudas_rice_category ON saudas(rice_category);

COMMENT ON COLUMN rice_codes.category IS 'Top-level classification: basmati or non_basmati';
COMMENT ON TABLE rice_code_variants IS 'Allowed processing variants (rice_type_enum) for a rice code';
COMMENT ON COLUMN saudas.rice_category IS 'Top-level basmati/non_basmati selection; must align with rice_code.category';
COMMENT ON COLUMN saudas.rice_type IS 'Processing variant within category (e.g. raw_basmati, steam_basmati)';
