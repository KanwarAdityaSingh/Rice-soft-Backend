-- Godown replenishment planning: config + decision snapshots.
-- Live stock remains finished_goods_inventory; this module does not own balances.

-- =====================================================
-- Cities this destination godown serves (delivery_address.city match)
-- =====================================================
CREATE TABLE IF NOT EXISTS godown_replenishment_cities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    godown_id UUID NOT NULL REFERENCES godowns(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT godown_replenishment_cities_city_not_blank CHECK (length(trim(city)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_godown_replenishment_cities_godown_city
    ON godown_replenishment_cities (godown_id, lower(trim(city)));

CREATE INDEX IF NOT EXISTS idx_godown_replenishment_cities_godown_id
    ON godown_replenishment_cities (godown_id);

COMMENT ON TABLE godown_replenishment_cities IS
    'Delivery-city aliases for auto-picking open sale saudas for a destination godown';

-- =====================================================
-- Configurable truck sizes (tonnes)
-- =====================================================
CREATE TABLE IF NOT EXISTS truck_size_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tonnes DECIMAL(8,2) NOT NULL UNIQUE,
    label VARCHAR(50) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT truck_size_configs_tonnes_positive CHECK (tonnes > 0)
);

CREATE TRIGGER update_truck_size_configs_updated_at
    BEFORE UPDATE ON truck_size_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO truck_size_configs (tonnes, label, sort_order, is_active)
VALUES
    (9, '9 T', 1, true),
    (16, '16 T', 2, true),
    (21, '21 T', 3, true),
    (25, '25 T', 4, true),
    (32, '32 T', 5, true)
ON CONFLICT (tonnes) DO NOTHING;

COMMENT ON TABLE truck_size_configs IS
    'Fleet truck capacities used to snap replenishment tonne recommendations';

-- =====================================================
-- Planning snapshots (not live stock)
-- =====================================================
CREATE TABLE IF NOT EXISTS replenishment_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    godown_id UUID NOT NULL REFERENCES godowns(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'committed', 'cancelled')),
    mode VARCHAR(30) NOT NULL
        CHECK (mode IN ('recommend_truck', 'fill_truck')),
    truck_tonnes_input DECIMAL(10,3),
    tonnes_for_orders DECIMAL(12,3) NOT NULL DEFAULT 0,
    tonnes_for_orders_plus_safety DECIMAL(12,3) NOT NULL DEFAULT 0,
    snapped_truck_tonnes_orders DECIMAL(8,2),
    snapped_truck_tonnes_with_safety DECIMAL(8,2),
    trend_window_days INT NOT NULL DEFAULT 30 CHECK (trend_window_days > 0),
    safety_days INT NOT NULL DEFAULT 7 CHECK (safety_days >= 0),
    include_open_for_godown BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    preview_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    committed_at TIMESTAMP WITH TIME ZONE,
    committed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_replenishment_plans_godown_id ON replenishment_plans (godown_id);
CREATE INDEX IF NOT EXISTS idx_replenishment_plans_status ON replenishment_plans (status);
CREATE INDEX IF NOT EXISTS idx_replenishment_plans_created_at ON replenishment_plans (created_at DESC);

CREATE TRIGGER update_replenishment_plans_updated_at
    BEFORE UPDATE ON replenishment_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS replenishment_plan_saudas (
    plan_id UUID NOT NULL REFERENCES replenishment_plans(id) ON DELETE CASCADE,
    sales_sauda_id UUID NOT NULL REFERENCES sales_saudas(id) ON DELETE RESTRICT,
    PRIMARY KEY (plan_id, sales_sauda_id)
);

CREATE INDEX IF NOT EXISTS idx_replenishment_plan_saudas_sauda
    ON replenishment_plan_saudas (sales_sauda_id);

CREATE TABLE IF NOT EXISTS replenishment_plan_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES replenishment_plans(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    packaging_id UUID NOT NULL REFERENCES packaging(id) ON DELETE RESTRICT,
    holding_capacity DECIMAL(12,3) NOT NULL,
    fgi_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    draft_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    available_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    demand_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    gap_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    surplus_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    trend_sold_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    daily_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    safety_kg DECIMAL(12,3) NOT NULL DEFAULT 0,
    trend_share DECIMAL(12,6) NOT NULL DEFAULT 0,
    recommended_kg_orders DECIMAL(12,3) NOT NULL DEFAULT 0,
    recommended_packets_orders INT NOT NULL DEFAULT 0,
    recommended_kg_with_safety DECIMAL(12,3) NOT NULL DEFAULT 0,
    recommended_packets_with_safety INT NOT NULL DEFAULT 0,
    fill_truck_kg DECIMAL(12,3),
    fill_truck_packets INT,
    still_short_kg DECIMAL(12,3),
    atp_drafts JSONB NOT NULL DEFAULT '[]'::jsonb,
    demand_saudas JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_replenishment_plan_lines_plan_id
    ON replenishment_plan_lines (plan_id);

COMMENT ON TABLE replenishment_plans IS
    'Frozen replenishment decisions; live stock is always finished_goods_inventory';
COMMENT ON TABLE replenishment_plan_lines IS
    'Per product+packaging snapshot of ATP, gap, trend, and truck fill at save time';
