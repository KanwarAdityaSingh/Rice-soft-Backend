-- Expense Module: Generic expense tracking with categories, entity linking, and flexible line items
-- Supports transport bills, broker commissions, office expenses, and any other expense type

-- =====================================================
-- 1. Expense Categories Master
-- =====================================================

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_expense_categories_active ON expense_categories(is_active);
CREATE INDEX idx_expense_categories_code ON expense_categories(code);

COMMENT ON TABLE expense_categories IS 
  'Master table for expense categories with unique codes used in expense numbering';

-- Seed default categories
INSERT INTO expense_categories (name, code, description) VALUES
    ('Transport', 'TRANS', 'Transportation and freight expenses'),
    ('Broker Commission', 'BROKER', 'Broker commission payments'),
    ('Office Supplies', 'OFFICE', 'Office supplies and stationery'),
    ('Utilities', 'UTIL', 'Electricity, water, internet'),
    ('Maintenance', 'MAINT', 'Equipment and facility maintenance'),
    ('Salesman Commission', 'SALES', 'Salesman commission payments'),
    ('Other', 'OTHER', 'Miscellaneous expenses');

-- =====================================================
-- 2. Expenses Header
-- =====================================================

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    expense_number VARCHAR(50) UNIQUE NOT NULL,
    financial_year VARCHAR(10) NOT NULL,
    serial_number INTEGER NOT NULL,
    expense_date DATE NOT NULL,
    
    -- Payee information (generic - vendor, broker, transporter, etc.)
    payee_type VARCHAR(20) NOT NULL CHECK (payee_type IN ('vendor', 'broker', 'transporter', 'employee', 'other')),
    payee_id UUID,
    payee_name VARCHAR(200) NOT NULL,
    payee_gst_number VARCHAR(15),
    payee_bank_name VARCHAR(100),
    payee_account_number VARCHAR(50),
    payee_ifsc VARCHAR(11),
    payee_branch VARCHAR(100),
    
    -- Amount breakdown
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    overhead_total DECIMAL(14,2) NOT NULL DEFAULT 0,
    
    -- GST breakdown (optional - use if GST applicable)
    taxable_amount DECIMAL(14,2),
    cgst_amount DECIMAL(14,2) DEFAULT 0,
    sgst_amount DECIMAL(14,2) DEFAULT 0,
    igst_amount DECIMAL(14,2) DEFAULT 0,
    
    -- Total tax (can be standalone or sum of GST components)
    tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    
    -- Final total
    total_amount DECIMAL(14,2) NOT NULL,
    
    -- Status management
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'rejected')),
    
    -- Documents
    bill_pdf_url TEXT,
    payment_proof_url TEXT,
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Serial unique per category per FY (Format: INV-{CODE}-{FY}-{SERIAL})
    CONSTRAINT expenses_fy_category_serial_unique UNIQUE(financial_year, expense_category_id, serial_number)
);

CREATE INDEX idx_expenses_category ON expenses(expense_category_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_payee_type ON expenses(payee_type);
CREATE INDEX idx_expenses_payee_id ON expenses(payee_id);
CREATE INDEX idx_expenses_fy ON expenses(financial_year);

COMMENT ON TABLE expenses IS 
  'Expense header with flexible payee and amount structure. Serial per category per FY.';

-- =====================================================
-- 3. Auto-assign Serial Number Trigger
-- =====================================================

CREATE OR REPLACE FUNCTION assign_expense_serial_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
  category_code VARCHAR(10);
BEGIN
  IF NEW.serial_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.financial_year IS NULL OR TRIM(NEW.financial_year) = '' THEN
    RAISE EXCEPTION 'financial_year is required to assign expense serial_number';
  END IF;
  
  IF NEW.expense_category_id IS NULL THEN
    RAISE EXCEPTION 'expense_category_id is required to assign expense serial_number';
  END IF;

  -- Get category code
  SELECT code INTO category_code
  FROM expense_categories
  WHERE id = NEW.expense_category_id;
  
  IF category_code IS NULL THEN
    RAISE EXCEPTION 'expense_category not found';
  END IF;

  -- Advisory lock on FY + Category to prevent race conditions
  PERFORM pg_advisory_xact_lock(
    872344031, 
    hashtext(NEW.financial_year || NEW.expense_category_id::text)
  );

  -- Gap-reuse: find lowest unused number for this category + FY
  WITH used AS (
    SELECT serial_number AS n
    FROM expenses
    WHERE financial_year = NEW.financial_year
      AND expense_category_id = NEW.expense_category_id
      AND serial_number IS NOT NULL
  ),
  bound AS (
    SELECT COALESCE((SELECT MAX(n) FROM used), 0) + 1 AS upper
  )
  SELECT MIN(gs.i)
  INTO next_num
  FROM bound b
  CROSS JOIN generate_series(1, b.upper) AS gs(i)
  WHERE NOT EXISTS (SELECT 1 FROM used WHERE used.n = gs.i);

  IF next_num IS NULL THEN
    next_num := 1;
  END IF;

  NEW.serial_number := next_num;
  -- Format: INV-{CODE}-{FY}-{SERIAL}
  NEW.expense_number := 'INV-' || category_code || '-' || NEW.financial_year || '-' || LPAD(next_num::TEXT, 3, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assign_expense_serial_number
  BEFORE INSERT ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION assign_expense_serial_number();

-- =====================================================
-- 4. Expense Entity Links (Polymorphic)
-- =====================================================

CREATE TABLE expense_entity_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent linking same entity to multiple expenses
    CONSTRAINT expense_entity_links_entity_unique UNIQUE(entity_type, entity_id)
);

CREATE INDEX idx_expense_entity_links_expense ON expense_entity_links(expense_id);
CREATE INDEX idx_expense_entity_links_entity ON expense_entity_links(entity_type, entity_id);

COMMENT ON TABLE expense_entity_links IS 
  'Links expenses to business entities (invoices, saudas, ISPs, etc). Unique constraint prevents double-linking.';

-- =====================================================
-- 5. Expense Lines (Optional itemization)
-- =====================================================

CREATE TABLE expense_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    description TEXT NOT NULL,
    
    -- Flexible quantity/rate fields (use what you need)
    quantity DECIMAL(12,3),
    unit VARCHAR(20),
    rate DECIMAL(12,4),
    amount DECIMAL(14,2) NOT NULL,
    
    -- Optional reference fields (useful for transport)
    reference_number VARCHAR(100),
    reference_date DATE,
    vehicle_number VARCHAR(50),
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT expense_lines_amount_check CHECK (amount >= 0)
);

CREATE INDEX idx_expense_lines_expense ON expense_lines(expense_id);

COMMENT ON TABLE expense_lines IS 
  'Optional line-level itemization. Transport uses location/vehicle fields, others use basic amount.';

-- =====================================================
-- 6. Expense Overheads (Additional charges)
-- =====================================================

CREATE TABLE expense_overheads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    charge_name VARCHAR(100) NOT NULL,
    charge_amount DECIMAL(14,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT expense_overheads_amount_check CHECK (charge_amount >= 0)
);

CREATE INDEX idx_expense_overheads_expense ON expense_overheads(expense_id);

COMMENT ON TABLE expense_overheads IS 
  'Additional charges beyond line items (unloading, documentation fees, service charges, etc).';
