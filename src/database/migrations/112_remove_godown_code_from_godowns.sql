-- Remove godown_code; triggers and app defaults use the earliest godown by created_at.

ALTER TABLE godowns DROP COLUMN IF EXISTS godown_code;

-- Default godown for trigger bodies (replaces lookup by code 'MAIN')
CREATE OR REPLACE FUNCTION initialize_lot_inventory()
RETURNS TRIGGER AS $$
DECLARE
    v_default_godown UUID;
BEGIN
    SELECT id INTO v_default_godown FROM godowns ORDER BY created_at ASC LIMIT 1;

    INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by)
    VALUES (NEW.id, COALESCE(NEW.godown_id, v_default_godown), NEW.received_weight, NEW.created_by)
    ON CONFLICT (lot_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create()
RETURNS TRIGGER AS $$
DECLARE
    v_default_godown UUID;
BEGIN
    SELECT id INTO v_default_godown FROM godowns ORDER BY created_at ASC LIMIT 1;

    INSERT INTO bags_inventory (godown_id, bag_type, bag_capacity, filled_bags, created_by)
    VALUES (COALESCE(NEW.godown_id, v_default_godown), NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
    ON CONFLICT (godown_id, bag_type, bag_capacity)
    DO UPDATE SET
        filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = NEW.created_by;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION initialize_lot_inventory_with_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_lot_inventory_id UUID;
    v_default_godown UUID;
    v_effective_godown UUID;
BEGIN
    SELECT id INTO v_default_godown
    FROM godowns
    ORDER BY created_at ASC
    LIMIT 1;

    v_effective_godown := COALESCE(NEW.godown_id, v_default_godown);

    INSERT INTO lot_inventory (lot_id, godown_id, available_quantity, created_by)
    VALUES (NEW.id, v_effective_godown, NEW.received_weight, NEW.created_by)
    ON CONFLICT (lot_id) DO NOTHING
    RETURNING id INTO v_lot_inventory_id;

    IF v_lot_inventory_id IS NOT NULL THEN
        INSERT INTO lot_inventory_audit (
            lot_inventory_id,
            lot_id,
            operation_type,
            quantity_change,
            quantity_before,
            quantity_after,
            reason,
            reference_type,
            reference_id,
            notes,
            created_by
        )
        VALUES (
            v_lot_inventory_id,
            NEW.id,
            'addition',
            NEW.received_weight,
            0,
            NEW.received_weight,
            'Lot created from inward slip',
            'inward_slip_lot',
            NEW.id,
            'Initial Stock | Lot: ' || NEW.lot_number || ' | Received Weight: ' || NEW.received_weight || ' kg',
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_bags_inventory_on_kaanta_create_with_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_bags_inventory_id UUID;
    v_old_filled_bags INTEGER;
    v_default_godown UUID;
    v_effective_godown UUID;
BEGIN
    SELECT id INTO v_default_godown
    FROM godowns
    ORDER BY created_at ASC
    LIMIT 1;

    v_effective_godown := COALESCE(NEW.godown_id, v_default_godown);

    SELECT id, filled_bags
    INTO v_bags_inventory_id, v_old_filled_bags
    FROM bags_inventory
    WHERE godown_id = v_effective_godown
      AND bag_type = NEW.bag_type
      AND bag_capacity = NEW.bag_weight;

    IF v_bags_inventory_id IS NULL THEN
        v_old_filled_bags := 0;
    END IF;

    INSERT INTO bags_inventory (godown_id, bag_type, bag_capacity, filled_bags, created_by)
    VALUES (v_effective_godown, NEW.bag_type, NEW.bag_weight, NEW.no_of_bags, NEW.created_by)
    ON CONFLICT (godown_id, bag_type, bag_capacity)
    DO UPDATE SET
        filled_bags = bags_inventory.filled_bags + NEW.no_of_bags,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = NEW.created_by
    RETURNING id INTO v_bags_inventory_id;

    INSERT INTO bags_inventory_audit (
        bags_inventory_id,
        bag_type,
        bag_capacity,
        operation_type,
        field_changed,
        quantity_change,
        quantity_before,
        quantity_after,
        reason,
        reference_type,
        reference_id,
        kaanta_id,
        notes,
        created_by
    )
    VALUES (
        v_bags_inventory_id,
        NEW.bag_type,
        NEW.bag_weight,
        'addition',
        'filled_bags',
        NEW.no_of_bags,
        v_old_filled_bags,
        v_old_filled_bags + NEW.no_of_bags,
        'Filled bags received from kaanta weighing',
        'kaanta',
        NEW.id,
        NEW.id,
        'Kaanta Weighing | Bags Received: ' || NEW.no_of_bags || ' | Type: ' || UPPER(NEW.bag_type) || ' | Capacity: ' || NEW.bag_weight || ' kg',
        NEW.created_by
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
