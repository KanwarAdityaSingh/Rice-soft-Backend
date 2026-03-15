-- Allow total_weight and no_of_packets to be 0 when a row is fully consumed by dispatch/return.
-- Enables multi-batch deduction: first batch can be updated to 0 instead of violating CHECK.

ALTER TABLE finished_goods_inventory
  DROP CONSTRAINT IF EXISTS finished_goods_inventory_total_weight_check;

ALTER TABLE finished_goods_inventory
  DROP CONSTRAINT IF EXISTS finished_goods_inventory_no_of_packets_check;

ALTER TABLE finished_goods_inventory
  ADD CONSTRAINT finished_goods_inventory_total_weight_check CHECK (total_weight >= 0);

ALTER TABLE finished_goods_inventory
  ADD CONSTRAINT finished_goods_inventory_no_of_packets_check CHECK (no_of_packets >= 0);

COMMENT ON COLUMN finished_goods_inventory.total_weight IS 'Weight in kg; 0 when row fully consumed by sales/return';
COMMENT ON COLUMN finished_goods_inventory.no_of_packets IS 'Packet count; 0 when row fully consumed';
