-- Coupon promotion rules (Phase 2)

CREATE TABLE IF NOT EXISTS promotion_rules (
    promotion_rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(64) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '{}',
    reward JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    priority INT NOT NULL DEFAULT 100,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotion_rules_active ON promotion_rules(is_active, priority);

DROP TRIGGER IF EXISTS update_promotion_rules_updated_at ON promotion_rules;
CREATE TRIGGER update_promotion_rules_updated_at
    BEFORE UPDATE ON promotion_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS rule_applications (
    rule_application_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    redemption_id UUID NOT NULL REFERENCES redemptions(redemption_id) ON DELETE CASCADE,
    promotion_rule_id UUID NOT NULL REFERENCES promotion_rules(promotion_rule_id) ON DELETE RESTRICT,
    rule_name VARCHAR(255) NOT NULL,
    bonus_paise INT NOT NULL CHECK (bonus_paise >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rule_applications_redemption ON rule_applications(redemption_id);

COMMENT ON TABLE promotion_rules IS 'Configurable bonus rules evaluated at coupon redeem';
COMMENT ON TABLE rule_applications IS 'Audit of which rules fired on each redemption';
