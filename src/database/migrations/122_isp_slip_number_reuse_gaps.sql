-- Migration: Reuse lowest available ISP-### after deletions
-- Description: Replace sequence-based slip assignment with smallest unused ISP-NNN number
--              so deleting ISP-002 allows the next insert to receive ISP-002 again.

CREATE OR REPLACE FUNCTION generate_slip_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INTEGER;
    formatted_num TEXT;
BEGIN
    IF NEW.slip_number IS NULL OR TRIM(NEW.slip_number) = '' THEN
        -- Serialize slip assignment in this transaction to avoid duplicate numbers under concurrency
        PERFORM pg_advisory_xact_lock(872344011);

        WITH used AS (
            SELECT DISTINCT (regexp_match(slip_number, '^ISP-(\d+)$', 'i'))[1]::int AS n
            FROM inward_slip_passes
            WHERE slip_number ~* '^ISP-\d+$'
        ),
        bound AS (
            SELECT COALESCE((SELECT MAX(n) FROM used), 0) + 1 AS upper
        )
        SELECT MIN(gs.i)
        INTO next_num
        FROM bound b
        CROSS JOIN generate_series(1, b.upper) AS gs(i)
        WHERE NOT EXISTS (SELECT 1 FROM used WHERE used.n = gs.i);

        IF next_num IS NULL THEN
            next_num := 1;
        END IF;

        formatted_num := 'ISP-' || LPAD(next_num::TEXT, 3, '0');
        NEW.slip_number := formatted_num;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_slip_number() IS 'Assigns lowest unused ISP-NNN slip number (reuses gaps after deletion).';
COMMENT ON COLUMN inward_slip_passes.slip_number IS 'Auto-generated as lowest unused ISP-NNN (reuses gaps; can be manually overridden).';
