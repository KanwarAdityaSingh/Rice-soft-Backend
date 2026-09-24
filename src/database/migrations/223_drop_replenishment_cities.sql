-- Remove delivery-city matching from replenishment. Demand is only the sales saudas the user selects.

DROP TABLE IF EXISTS godown_replenishment_cities;

ALTER TABLE replenishment_plans
  DROP COLUMN IF EXISTS include_open_for_godown;
