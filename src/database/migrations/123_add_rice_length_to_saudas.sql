-- Migration: Add rice_length to saudas (Dubar, Tibar, Wand)
-- Description: Optional grade field aligned with GET /riceCodes/getRiceLengths

DO $$ BEGIN
    CREATE TYPE rice_length_enum AS ENUM ('dubar', 'tibar', 'wand');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE saudas
ADD COLUMN IF NOT EXISTS rice_length rice_length_enum;

COMMENT ON COLUMN saudas.rice_length IS 'Rice length / cut grade: dubar, tibar, wand';
