-- Migration: Store full sauda rice snapshot on inward_slip_lots

ALTER TABLE inward_slip_lots
    ADD COLUMN IF NOT EXISTS rice_category rice_code_category_enum;

ALTER TABLE inward_slip_lots
    ADD COLUMN IF NOT EXISTS rice_length_id UUID REFERENCES rice_lengths(rice_length_id) ON DELETE SET NULL;

UPDATE inward_slip_lots l
SET
    rice_category = s.rice_category,
    rice_code_id = COALESCE(l.rice_code_id, s.rice_code_id),
    rice_type = COALESCE(l.rice_type, s.rice_type),
    rice_length_id = s.rice_length_id
FROM saudas s
WHERE l.sauda_id = s.id
  AND l.rice_category IS NULL;

UPDATE inward_slip_lots l
SET rice_category = s.rice_category
FROM saudas s
WHERE l.sauda_id = s.id
  AND l.rice_category IS NULL;

ALTER TABLE inward_slip_lots
    ALTER COLUMN rice_category SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_rice_category ON inward_slip_lots(rice_category);
CREATE INDEX IF NOT EXISTS idx_inward_slip_lots_rice_length_id ON inward_slip_lots(rice_length_id)
    WHERE rice_length_id IS NOT NULL;

COMMENT ON COLUMN inward_slip_lots.rice_category IS 'Snapshot from sauda at lot creation: basmati or non_basmati';
COMMENT ON COLUMN inward_slip_lots.rice_length_id IS 'Snapshot from sauda at lot creation (optional)';
