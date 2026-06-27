-- Migration: Combined kaanta parchi URL and optional slip metadata
-- Description: Stores single-slip parchi image, weighbridge ticket number, extracted vehicle number, and ISP mismatch flag

ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS combined_kaanta_parchi_url TEXT;

ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS ticket_number VARCHAR(50);

ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS parchi_vehicle_number VARCHAR(50);

ALTER TABLE kaantas
ADD COLUMN IF NOT EXISTS vehicle_number_mismatch BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN kaantas.combined_kaanta_parchi_url IS 'S3 URL for combined kaanta slip (gross, tare, net on one parchi)';
COMMENT ON COLUMN kaantas.ticket_number IS 'Weighbridge ticket number extracted from kaanta slip (optional)';
COMMENT ON COLUMN kaantas.parchi_vehicle_number IS 'Vehicle number extracted from kaanta slip (optional)';
COMMENT ON COLUMN kaantas.vehicle_number_mismatch IS 'True when parchi vehicle number differs from inward slip pass vehicle (informational only)';
