-- Allow finished goods without a batch (e.g. godown transfer in before batches are linked).

ALTER TABLE finished_goods_inventory
  ALTER COLUMN batch_id DROP NOT NULL;

COMMENT ON COLUMN finished_goods_inventory.batch_id IS
  'Production batch; nullable when stock is credited before batch linkage (e.g. godown transfer)';
