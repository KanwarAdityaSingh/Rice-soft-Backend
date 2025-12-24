-- Migration: Replace bill image columns with other_bills JSONB array
-- Description: Removes inward_slip_bill_image_url and transportation_bill_image_url, adds other_bills JSONB column to store multiple bills with names

-- =====================================================
-- STEP 1: Add other_bills column
-- =====================================================

-- Add other_bills column as JSONB array
ALTER TABLE inward_slip_passes
ADD COLUMN IF NOT EXISTS other_bills JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN inward_slip_passes.other_bills IS 'Array of bill objects with name and url. Format: [{"name": "Bill Name", "url": "https://...", "uploaded_at": "2024-01-01T00:00:00Z"}]';

-- =====================================================
-- STEP 2: Migrate existing data
-- =====================================================

-- Migrate inward_slip_bill_image_url to other_bills if it exists
UPDATE inward_slip_passes
SET other_bills = CASE
  WHEN inward_slip_bill_image_url IS NOT NULL AND inward_slip_bill_image_url != '' THEN
    jsonb_build_array(
      jsonb_build_object(
        'name', 'Inward Slip Bill',
        'url', inward_slip_bill_image_url,
        'uploaded_at', updated_at::text
      )
    )
  ELSE '[]'::jsonb
END
WHERE other_bills = '[]'::jsonb OR other_bills IS NULL;

-- Migrate transportation_bill_image_url to other_bills if it exists
UPDATE inward_slip_passes
SET other_bills = CASE
  WHEN transportation_bill_image_url IS NOT NULL AND transportation_bill_image_url != '' THEN
    CASE
      WHEN other_bills = '[]'::jsonb OR other_bills IS NULL THEN
        jsonb_build_array(
          jsonb_build_object(
            'name', 'Transportation Bill',
            'url', transportation_bill_image_url,
            'uploaded_at', updated_at::text
          )
        )
      ELSE
        other_bills || jsonb_build_array(
          jsonb_build_object(
            'name', 'Transportation Bill',
            'url', transportation_bill_image_url,
            'uploaded_at', updated_at::text
          )
        )
    END
  ELSE other_bills
END
WHERE (transportation_bill_image_url IS NOT NULL AND transportation_bill_image_url != '');

-- =====================================================
-- STEP 3: Remove old columns
-- =====================================================

-- Drop the old columns
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS inward_slip_bill_image_url;
ALTER TABLE inward_slip_passes DROP COLUMN IF EXISTS transportation_bill_image_url;

-- Create index for JSONB queries (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_inward_slip_passes_other_bills ON inward_slip_passes USING GIN(other_bills);

