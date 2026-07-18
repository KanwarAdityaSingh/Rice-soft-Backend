-- Bilti (lorry receipt) document on invoice dispatch.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS bilti_image_url TEXT,
  ADD COLUMN IF NOT EXISTS bilti_pdf_url TEXT;

COMMENT ON COLUMN invoice_dispatches.bilti_image_url IS 'S3 URL of uploaded bilti image';
COMMENT ON COLUMN invoice_dispatches.bilti_pdf_url IS 'S3 URL of uploaded bilti PDF';
