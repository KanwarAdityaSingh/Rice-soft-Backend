-- Add packet_count to sales_sauda_lines so quantity can be derived from packets × packaging holding_capacity.
ALTER TABLE sales_sauda_lines
ADD COLUMN IF NOT EXISTS packet_count INTEGER CHECK (packet_count > 0);

COMMENT ON COLUMN sales_sauda_lines.packet_count IS 'Optional number of packets; when present quantity is derived in kg from packaging holding_capacity';
