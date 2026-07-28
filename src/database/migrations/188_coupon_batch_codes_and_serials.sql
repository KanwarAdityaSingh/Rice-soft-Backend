-- Coupon batch codes (MON-YYYY-DDMM-SSS) + per-batch coupon serials ({batch_code}-NNNNNN)
-- Day series counter never decreases (delete does not reuse series).

-- ---------------------------------------------------------------------------
-- Per-calendar-day series allocator (Asia/Kolkata date key stored as DATE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_batch_day_series (
    series_date DATE PRIMARY KEY,
    last_series INT NOT NULL DEFAULT 0
        CHECK (last_series >= 0 AND last_series <= 999),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE coupon_batch_day_series IS
  'Monotonic per-day series for coupon batch_code; never decremented on batch delete';

-- ---------------------------------------------------------------------------
-- coupon_batches: replace free-text name with auto batch_code
-- ---------------------------------------------------------------------------
ALTER TABLE coupon_batches
    ADD COLUMN IF NOT EXISTS batch_code VARCHAR(32);

-- Backfill existing batches from created_at in IST, ordered within each day
WITH ranked AS (
    SELECT
        coupon_batch_id,
        (created_at AT TIME ZONE 'Asia/Kolkata')::date AS series_date,
        UPPER(TRIM(TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'MON'))) AS mon,
        TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY') AS yyyy,
        TO_CHAR(created_at AT TIME ZONE 'Asia/Kolkata', 'DDMM') AS ddmm,
        ROW_NUMBER() OVER (
            PARTITION BY (created_at AT TIME ZONE 'Asia/Kolkata')::date
            ORDER BY created_at ASC, coupon_batch_id ASC
        ) AS series
    FROM coupon_batches
    WHERE batch_code IS NULL
)
UPDATE coupon_batches cb
SET batch_code = ranked.mon || '-' || ranked.yyyy || '-' || ranked.ddmm || '-' || LPAD(ranked.series::text, 3, '0')
FROM ranked
WHERE cb.coupon_batch_id = ranked.coupon_batch_id;

-- Seed day counters from backfilled max (so new batches continue, no reuse)
INSERT INTO coupon_batch_day_series (series_date, last_series)
SELECT
    (created_at AT TIME ZONE 'Asia/Kolkata')::date AS series_date,
    MAX(
        NULLIF(SUBSTRING(batch_code FROM '[0-9]{3}$'), '')::int
    ) AS last_series
FROM coupon_batches
WHERE batch_code IS NOT NULL
GROUP BY (created_at AT TIME ZONE 'Asia/Kolkata')::date
ON CONFLICT (series_date) DO UPDATE
SET last_series = GREATEST(coupon_batch_day_series.last_series, EXCLUDED.last_series),
    updated_at = CURRENT_TIMESTAMP;

ALTER TABLE coupon_batches
    ALTER COLUMN batch_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_batches_batch_code
    ON coupon_batches (batch_code);

ALTER TABLE coupon_batches
    DROP COLUMN IF EXISTS name;

COMMENT ON COLUMN coupon_batches.batch_code IS
  'Auto batch code MON-YYYY-DDMM-SSS (IST date + 3-digit day series)';

-- ---------------------------------------------------------------------------
-- coupons: serial_number + batch_sequence
-- ---------------------------------------------------------------------------
ALTER TABLE coupons
    ADD COLUMN IF NOT EXISTS batch_sequence INT,
    ADD COLUMN IF NOT EXISTS serial_number VARCHAR(48);

-- Backfill sequences / serials per batch (creation order)
WITH numbered AS (
    SELECT
        c.coupon_id,
        cb.batch_code,
        ROW_NUMBER() OVER (
            PARTITION BY c.coupon_batch_id
            ORDER BY c.created_at ASC, c.coupon_id ASC
        ) AS seq
    FROM coupons c
    JOIN coupon_batches cb ON cb.coupon_batch_id = c.coupon_batch_id
    WHERE c.serial_number IS NULL
)
UPDATE coupons c
SET
    batch_sequence = numbered.seq,
    serial_number = numbered.batch_code || '-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered
WHERE c.coupon_id = numbered.coupon_id;

-- Empty batches have no coupons; generated batches should all have serials now.
-- Allow NULL only if somehow orphaned — enforce NOT NULL when any coupon exists via CHECK later.
-- New inserts always set both columns.

ALTER TABLE coupons
    ALTER COLUMN batch_sequence SET NOT NULL,
    ALTER COLUMN serial_number SET NOT NULL;

ALTER TABLE coupons
    DROP CONSTRAINT IF EXISTS coupons_batch_sequence_unique,
    DROP CONSTRAINT IF EXISTS coupons_serial_number_unique;

ALTER TABLE coupons
    ADD CONSTRAINT coupons_batch_sequence_unique UNIQUE (coupon_batch_id, batch_sequence),
    ADD CONSTRAINT coupons_serial_number_unique UNIQUE (serial_number);

CREATE INDEX IF NOT EXISTS idx_coupons_batch_sequence
    ON coupons (coupon_batch_id, batch_sequence);

COMMENT ON COLUMN coupons.batch_sequence IS
  '1..N within batch (up to 500000); may have gaps on rare code collisions';
COMMENT ON COLUMN coupons.serial_number IS
  'Printable serial: {batch_code}-NNNNNN (6-digit sequence)';
