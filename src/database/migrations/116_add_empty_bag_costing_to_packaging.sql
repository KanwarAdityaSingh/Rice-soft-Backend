-- Empty-bag purchase snapshot + master fields (weight per bag, rate, GST) for spend tracking on packaging create with initial_packets.

ALTER TABLE packaging
  ADD COLUMN IF NOT EXISTS empty_bag_weight_kg DECIMAL(15, 4)
    CHECK (empty_bag_weight_kg IS NULL OR empty_bag_weight_kg > 0),
  ADD COLUMN IF NOT EXISTS empty_bag_rate_per_kg DECIMAL(15, 4)
    CHECK (empty_bag_rate_per_kg IS NULL OR empty_bag_rate_per_kg >= 0),
  ADD COLUMN IF NOT EXISTS empty_bag_gst_percent DECIMAL(5, 2)
    CHECK (empty_bag_gst_percent IS NULL OR (empty_bag_gst_percent >= 0 AND empty_bag_gst_percent <= 100)),
  ADD COLUMN IF NOT EXISTS empty_bags_total_weight_kg DECIMAL(15, 4)
    CHECK (empty_bags_total_weight_kg IS NULL OR empty_bags_total_weight_kg >= 0),
  ADD COLUMN IF NOT EXISTS empty_bags_taxable_amount DECIMAL(15, 2)
    CHECK (empty_bags_taxable_amount IS NULL OR empty_bags_taxable_amount >= 0),
  ADD COLUMN IF NOT EXISTS empty_bags_gst_amount DECIMAL(15, 2)
    CHECK (empty_bags_gst_amount IS NULL OR empty_bags_gst_amount >= 0),
  ADD COLUMN IF NOT EXISTS empty_bags_total_amount DECIMAL(15, 2)
    CHECK (empty_bags_total_amount IS NULL OR empty_bags_total_amount >= 0);

COMMENT ON COLUMN packaging.empty_bag_weight_kg IS 'Weight of one empty bag (kg); used with initial_packets for total weight and spend';
COMMENT ON COLUMN packaging.empty_bag_rate_per_kg IS 'Purchase rate per kg for empty bags';
COMMENT ON COLUMN packaging.empty_bag_gst_percent IS 'GST % on empty-bag purchase (0–100)';
COMMENT ON COLUMN packaging.empty_bags_total_weight_kg IS 'Snapshot: bag_count × empty_bag_weight_kg at first stock-in';
COMMENT ON COLUMN packaging.empty_bags_taxable_amount IS 'Snapshot: taxable amount before GST at first stock-in';
COMMENT ON COLUMN packaging.empty_bags_gst_amount IS 'Snapshot: GST amount at first stock-in';
COMMENT ON COLUMN packaging.empty_bags_total_amount IS 'Snapshot: total amount including GST at first stock-in';
