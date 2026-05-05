-- Migration: Create parameters table (rice / batch quality specs)
-- Description: Nullable quality fields linked optionally to inward slip pass, batch, and product (product must be on batch when both are set)

CREATE TABLE IF NOT EXISTS parameters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inward_slip_pass_id UUID REFERENCES inward_slip_passes(id) ON DELETE SET NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
    purity TEXT,
    natural_admixture TEXT,
    average_grain_length TEXT,
    moisture TEXT,
    broken_grain TEXT,
    damage_discolour_grain TEXT,
    immature_grains TEXT,
    whiteness TEXT,
    foreign_matter TEXT,
    black_grains TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_parameters_inward_slip_pass_id ON parameters(inward_slip_pass_id);
CREATE INDEX IF NOT EXISTS idx_parameters_product_id ON parameters(product_id);
CREATE INDEX IF NOT EXISTS idx_parameters_batch_id ON parameters(batch_id);

CREATE TRIGGER update_parameters_updated_at
    BEFORE UPDATE ON parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE parameters IS 'Quality parameters for lots/batches; optional links to inward slip pass, batch, and product';
COMMENT ON COLUMN parameters.product_id IS 'When set with batch_id, must exist in batch_products for that batch';
