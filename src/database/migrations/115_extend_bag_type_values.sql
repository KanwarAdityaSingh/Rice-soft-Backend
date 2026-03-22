-- Migration: Extend allowed bag_type values (kaanta, bags_inventory, bags_inventory_audit)
-- Adds: bopp_laminated, non_woven, vacuum_pouch (keeps jute, pp)

-- Drop existing CHECK on bag_type by name (inline CHECKs get table_column_check in PG)
ALTER TABLE kaantas DROP CONSTRAINT IF EXISTS kaantas_bag_type_check;
ALTER TABLE bags_inventory DROP CONSTRAINT IF EXISTS bags_inventory_bag_type_check;
ALTER TABLE bags_inventory_audit DROP CONSTRAINT IF EXISTS bags_inventory_audit_bag_type_check;

ALTER TABLE kaantas ADD CONSTRAINT kaantas_bag_type_check CHECK (
  bag_type IN ('jute', 'pp', 'bopp_laminated', 'non_woven', 'vacuum_pouch')
);

ALTER TABLE bags_inventory ADD CONSTRAINT bags_inventory_bag_type_check CHECK (
  bag_type IN ('jute', 'pp', 'bopp_laminated', 'non_woven', 'vacuum_pouch')
);

ALTER TABLE bags_inventory_audit ADD CONSTRAINT bags_inventory_audit_bag_type_check CHECK (
  bag_type IN ('jute', 'pp', 'bopp_laminated', 'non_woven', 'vacuum_pouch')
);

COMMENT ON COLUMN kaantas.bag_type IS 'Bag type: jute, pp (PP woven), bopp_laminated, non_woven, vacuum_pouch';
