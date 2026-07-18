-- Concurrency guards for coupon payouts and promotion evaluation

-- At most one in-flight Razorpay attempt per redemption
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_attempts_one_initiated_per_redemption
    ON payout_attempts (redemption_id)
    WHERE status = 'initiated';

COMMENT ON INDEX idx_payout_attempts_one_initiated_per_redemption IS
    'Prevents duplicate concurrent Razorpay payout attempts for the same redemption';
