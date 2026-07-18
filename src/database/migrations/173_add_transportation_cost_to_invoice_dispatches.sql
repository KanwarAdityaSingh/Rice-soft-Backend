-- Optional transportation cost on invoice dispatch (same idea as inward slip passes).
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS transportation_cost DECIMAL(12, 2);

COMMENT ON COLUMN invoice_dispatches.transportation_cost IS 'Transportation / freight cost for this dispatch';
