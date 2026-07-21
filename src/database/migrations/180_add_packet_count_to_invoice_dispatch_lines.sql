-- Migration: Add packet_count to invoice_dispatch_lines
-- Description: Store bags/packets when partial dispatch is created via packet_count

ALTER TABLE invoice_dispatch_lines
ADD COLUMN IF NOT EXISTS packet_count INTEGER NULL;

COMMENT ON COLUMN invoice_dispatch_lines.packet_count IS
  'Number of bags/packets dispatched; quantity is derived as packet_count × packaging.holding_capacity when set';
