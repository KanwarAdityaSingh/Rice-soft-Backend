-- Helper script to identify duplicate transporters by GST, PAN, or Aadhaar numbers
-- Run this to see which transporters have duplicate identification numbers

-- 1. Find transporters with duplicate GST numbers
SELECT 
    'DUPLICATE GST' as issue_type,
    t.gst_number as duplicate_value,
    t.id,
    t.business_name,
    t.contact_person,
    t.phone,
    t.email,
    t.created_at,
    t.is_active
FROM transporters t
WHERE t.gst_number IN (
    SELECT gst_number
    FROM transporters
    WHERE gst_number IS NOT NULL AND gst_number != ''
    GROUP BY gst_number
    HAVING COUNT(*) > 1
)
ORDER BY t.gst_number, t.created_at

UNION ALL

-- 2. Find transporters with duplicate PAN numbers
SELECT 
    'DUPLICATE PAN' as issue_type,
    t.pan_number as duplicate_value,
    t.id,
    t.business_name,
    t.contact_person,
    t.phone,
    t.email,
    t.created_at,
    t.is_active
FROM transporters t
WHERE t.pan_number IN (
    SELECT pan_number
    FROM transporters
    WHERE pan_number IS NOT NULL AND pan_number != ''
    GROUP BY pan_number
    HAVING COUNT(*) > 1
)
ORDER BY t.pan_number, t.created_at

UNION ALL

-- 3. Find transporters with duplicate Aadhaar numbers
SELECT 
    'DUPLICATE AADHAAR' as issue_type,
    t.aadhar_number as duplicate_value,
    t.id,
    t.business_name,
    t.contact_person,
    t.phone,
    t.email,
    t.created_at,
    t.is_active
FROM transporters t
WHERE t.aadhar_number IN (
    SELECT aadhar_number
    FROM transporters
    WHERE aadhar_number IS NOT NULL AND aadhar_number != ''
    GROUP BY aadhar_number
    HAVING COUNT(*) > 1
)
ORDER BY t.aadhar_number, t.created_at;

-- Summary of duplicates
SELECT 
    'GST Duplicates' as type,
    COUNT(*) as duplicate_groups,
    SUM(cnt - 1) as extra_records
FROM (
    SELECT gst_number, COUNT(*) as cnt
    FROM transporters
    WHERE gst_number IS NOT NULL AND gst_number != ''
    GROUP BY gst_number
    HAVING COUNT(*) > 1
) gst_dups

UNION ALL

SELECT 
    'PAN Duplicates' as type,
    COUNT(*) as duplicate_groups,
    SUM(cnt - 1) as extra_records
FROM (
    SELECT pan_number, COUNT(*) as cnt
    FROM transporters
    WHERE pan_number IS NOT NULL AND pan_number != ''
    GROUP BY pan_number
    HAVING COUNT(*) > 1
) pan_dups

UNION ALL

SELECT 
    'Aadhaar Duplicates' as type,
    COUNT(*) as duplicate_groups,
    SUM(cnt - 1) as extra_records
FROM (
    SELECT aadhar_number, COUNT(*) as cnt
    FROM transporters
    WHERE aadhar_number IS NOT NULL AND aadhar_number != ''
    GROUP BY aadhar_number
    HAVING COUNT(*) > 1
) aadhar_dups;

