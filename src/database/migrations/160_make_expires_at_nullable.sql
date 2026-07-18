-- Make expires_at nullable for coupon batches and coupons
-- Allows creating coupons that never expire

ALTER TABLE coupon_batches ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE coupons ALTER COLUMN expires_at DROP NOT NULL;

COMMENT ON COLUMN coupon_batches.expires_at IS 'Expiry date (NULL = never expires)';
COMMENT ON COLUMN coupons.expires_at IS 'Expiry date (NULL = never expires, inherited from batch)';
