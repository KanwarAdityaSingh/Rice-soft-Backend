-- Lorry Receipt (LR) / transporter document number for dispatch + e-way bill
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS lr_number VARCHAR(100);

COMMENT ON COLUMN invoice_dispatches.lr_number IS
  'Lorry Receipt / transporter document number; sent as transporter_document_number on e-way bill';
