-- Migration: Make contact_person nullable or drop it
-- Description: Since we've migrated to contact_persons, we need to handle the old contact_person column

-- Step 1: Drop the lead_analytics view (we'll recreate it with the new column name)
DROP VIEW IF EXISTS lead_analytics;

-- Step 2: Drop the contact_person column from the leads table
ALTER TABLE leads DROP COLUMN IF EXISTS contact_person;

-- Step 3: Recreate the lead_analytics view with contact_persons instead of contact_person
CREATE OR REPLACE VIEW lead_analytics AS
SELECT 
    l.id,
    l.company_name,
    l.contact_persons,
    l.email,
    l.lead_status,
    l.priority,
    l.estimated_value,
    l.created_at,
    u.username as assigned_salesman,
    u2.username as created_by_user,
    COUNT(le.id) as event_count,
    CASE 
        WHEN c.id IS NOT NULL THEN 'converted'
        ELSE l.lead_status
    END as actual_status
FROM leads l
LEFT JOIN users u ON l.assigned_to = u.id
LEFT JOIN users u2 ON l.created_by = u2.id
LEFT JOIN lead_events le ON l.id = le.lead_id
LEFT JOIN conversions c ON l.id = c.lead_id
GROUP BY l.id, l.company_name, l.contact_persons, l.email, l.lead_status, l.priority, l.estimated_value, l.created_at, u.username, u2.username, c.id;



