-- Add 5, 26, and 30 kg to allowed packaging holding capacities (existing: 10, 25, 50)

ALTER TABLE packaging
  DROP CONSTRAINT IF EXISTS check_holding_capacity_valid;

ALTER TABLE packaging
  ADD CONSTRAINT check_holding_capacity_valid
  CHECK (holding_capacity IN (5, 10, 25, 26, 30, 50));

COMMENT ON COLUMN packaging.holding_capacity IS 'Weight capacity in kg per packet; allowed: 5, 10, 25, 26, 30, 50';
