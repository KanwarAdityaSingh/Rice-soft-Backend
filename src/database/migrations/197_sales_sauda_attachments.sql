-- Optional supporting attachments on sales sauda (S3 URLs).
ALTER TABLE sales_saudas
  ADD COLUMN IF NOT EXISTS customer_po_url TEXT,
  ADD COLUMN IF NOT EXISTS email_attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS agreement_url TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_screenshot_url TEXT;

COMMENT ON COLUMN sales_saudas.customer_po_url IS 'S3 URL of customer purchase order (PO)';
COMMENT ON COLUMN sales_saudas.email_attachment_url IS 'S3 URL of email supporting document';
COMMENT ON COLUMN sales_saudas.agreement_url IS 'S3 URL of agreement document';
COMMENT ON COLUMN sales_saudas.whatsapp_screenshot_url IS 'S3 URL of WhatsApp screenshot';
