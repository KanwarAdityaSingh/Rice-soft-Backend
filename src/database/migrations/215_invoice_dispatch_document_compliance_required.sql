-- Opt-in document gate for invoices created after this policy.
-- Existing rows stay false so historical bills never block the next invoice.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS document_compliance_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN invoice_dispatches.document_compliance_required IS
  'When true, 100km receiving-doc / bilti rules and the 3-day next-bill block apply. Set on create; existing invoices remain false.';
