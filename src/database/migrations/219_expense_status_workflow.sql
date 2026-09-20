-- Align expense status values with the frontend workflow.
-- Existing rows: confirmed → approved, cancelled → rejected.

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;

UPDATE expenses SET status = 'approved' WHERE status = 'confirmed';
UPDATE expenses SET status = 'rejected' WHERE status = 'cancelled';

ALTER TABLE expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected'));
