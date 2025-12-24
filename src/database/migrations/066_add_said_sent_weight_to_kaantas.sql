-- Migration: Add said_sent_weight to kaantas table
-- Description: Adds said_sent_weight field to store the weight mentioned in the bill/said document

-- Add said_sent_weight column
ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS said_sent_weight DECIMAL(10,2);

-- Add comment for documentation
COMMENT ON COLUMN kaantas.said_sent_weight IS 'Weight mentioned in the bill/said document (in kg). Used for Dana deduction calculation in payment advice.';

