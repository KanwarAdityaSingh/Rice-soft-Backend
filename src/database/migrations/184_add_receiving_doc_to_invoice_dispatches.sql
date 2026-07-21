-- Receiving document (proof of delivery / acknowledgement) on invoice dispatch.
ALTER TABLE invoice_dispatches
  ADD COLUMN IF NOT EXISTS receiving_doc_image_url TEXT,
  ADD COLUMN IF NOT EXISTS receiving_doc_pdf_url TEXT;

COMMENT ON COLUMN invoice_dispatches.receiving_doc_image_url IS 'S3 URL of uploaded receiving document image';
COMMENT ON COLUMN invoice_dispatches.receiving_doc_pdf_url IS 'S3 URL of uploaded receiving document PDF';
