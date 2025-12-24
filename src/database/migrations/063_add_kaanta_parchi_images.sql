-- Migration: Add kaanta parchi image URLs to kaantas table
-- Description: Adds khaali_kaanta_parchi_url and bhara_kaanta_parchi_url columns to store image URLs for empty and filled kaanta receipts

-- Add khaali_kaanta_parchi_url column (empty kaanta receipt image)
ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS khaali_kaanta_parchi_url TEXT;

-- Add bhara_kaanta_parchi_url column (filled kaanta receipt image)
ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS bhara_kaanta_parchi_url TEXT;

-- Add comments for documentation
COMMENT ON COLUMN kaantas.khaali_kaanta_parchi_url IS 'S3 URL for the empty kaanta receipt (khaali kaanta parchi) image';
COMMENT ON COLUMN kaantas.bhara_kaanta_parchi_url IS 'S3 URL for the filled kaanta receipt (bhara kaanta parchi) image';

