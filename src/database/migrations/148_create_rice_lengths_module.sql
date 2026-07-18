-- Migration: Rice lengths master module + sauda FK migration

CREATE TABLE IF NOT EXISTS rice_lengths (
    rice_length_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT rice_lengths_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_rice_lengths_is_active ON rice_lengths(is_active);
CREATE INDEX IF NOT EXISTS idx_rice_lengths_code ON rice_lengths(code);

DROP TRIGGER IF EXISTS update_rice_lengths_updated_at ON rice_lengths;
CREATE TRIGGER update_rice_lengths_updated_at
    BEFORE UPDATE ON rice_lengths
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO rice_lengths (code, name)
VALUES
    ('dubar', 'Dubar (Double)'),
    ('tibar', 'Tibar'),
    ('wand', 'Wand')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE saudas
    ADD COLUMN IF NOT EXISTS rice_length_id UUID REFERENCES rice_lengths(rice_length_id) ON DELETE SET NULL;

UPDATE saudas s
SET rice_length_id = rl.rice_length_id
FROM rice_lengths rl
WHERE s.rice_length IS NOT NULL
  AND rl.code = s.rice_length::text
  AND s.rice_length_id IS NULL;

ALTER TABLE saudas DROP COLUMN IF EXISTS rice_length;

DROP TYPE IF EXISTS rice_length_enum;

CREATE INDEX IF NOT EXISTS idx_saudas_rice_length_id ON saudas(rice_length_id);

COMMENT ON TABLE rice_lengths IS 'Master list of rice length / cut grades (e.g. dubar, tibar, wand)';
COMMENT ON COLUMN rice_lengths.code IS 'Stable lowercase identifier used in integrations';
COMMENT ON COLUMN saudas.rice_length_id IS 'Optional reference to rice_lengths master row';
