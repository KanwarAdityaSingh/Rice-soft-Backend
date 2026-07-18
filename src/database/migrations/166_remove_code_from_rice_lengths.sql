-- Migration: Remove code column from rice_lengths master

DROP INDEX IF EXISTS idx_rice_lengths_code;

ALTER TABLE rice_lengths
    DROP CONSTRAINT IF EXISTS rice_lengths_code_unique;

ALTER TABLE rice_lengths
    DROP COLUMN IF EXISTS code;
