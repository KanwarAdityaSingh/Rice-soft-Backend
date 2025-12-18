-- Migration: Add new rice types to rice_type_enum
-- This adds: raw_basmati, steam_basmati, white_sella, golden_sella

-- Add new values to the rice_type_enum
ALTER TYPE rice_type_enum ADD VALUE IF NOT EXISTS 'raw_basmati';
ALTER TYPE rice_type_enum ADD VALUE IF NOT EXISTS 'steam_basmati';
ALTER TYPE rice_type_enum ADD VALUE IF NOT EXISTS 'white_sella';
ALTER TYPE rice_type_enum ADD VALUE IF NOT EXISTS 'golden_sella';

-- Update comments
COMMENT ON COLUMN saudas.rice_type IS 'Type of rice: basmati, non_basmati, parboiled, raw, raw_basmati, steam_basmati, white_sella, golden_sella';

