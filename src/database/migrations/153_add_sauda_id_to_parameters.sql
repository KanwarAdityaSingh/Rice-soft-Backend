-- Migration: Link quality parameters to purchase saudas (one row per sauda)

ALTER TABLE parameters
    ADD COLUMN IF NOT EXISTS sauda_id UUID REFERENCES saudas(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parameters_sauda_id
    ON parameters (sauda_id)
    WHERE sauda_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parameters_sauda_id ON parameters(sauda_id);

COMMENT ON COLUMN parameters.sauda_id IS 'Optional link to purchase sauda; at most one parameter row per sauda';
