-- Lorry Receipt (LR) copy on invoice dispatch — separate from bilti.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS lr_image_url TEXT,
  ADD COLUMN IF NOT EXISTS lr_pdf_url TEXT;

COMMENT ON COLUMN invoice_dispatches.lr_image_url IS 'S3 URL of uploaded LR (lorry receipt) image';
COMMENT ON COLUMN invoice_dispatches.lr_pdf_url IS 'S3 URL of uploaded LR (lorry receipt) PDF';
