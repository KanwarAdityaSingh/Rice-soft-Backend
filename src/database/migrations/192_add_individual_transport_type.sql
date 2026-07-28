-- Individual transporters: lightweight (no GST/PAN/Aadhaar KYC), same idea as sales_parties.retail.
ALTER TYPE transport_type_enum ADD VALUE IF NOT EXISTS 'individual';

COMMENT ON COLUMN transporters.transport_type IS
  'registered (GST/PAN KYC), unregistered (Aadhaar KYC), or individual (no KYC)';
