-- Migration: Drop purchase-related tables
-- Description: Removes purchase module tables as they are replaced by on-the-fly summary calculations

-- Drop junction tables first (due to foreign key constraints)
DROP TABLE IF EXISTS purchase_lots CASCADE;
DROP TABLE IF EXISTS purchase_inward_slip_passes CASCADE;
DROP TABLE IF EXISTS purchase_saudas CASCADE;

-- Drop main purchases table
DROP TABLE IF EXISTS purchases CASCADE;

