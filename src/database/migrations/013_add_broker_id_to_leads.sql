-- Migration: Add broker_id to leads table
-- Description: Adds broker_id column to leads table to associate leads with brokers

-- 1. Add broker_id column (nullable)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS broker_id UUID REFERENCES brokers(id) ON DELETE SET NULL;

-- 2. Create index for broker_id for performance
CREATE INDEX IF NOT EXISTS idx_leads_broker_id ON leads(broker_id);

-- 3. Add comment
COMMENT ON COLUMN leads.broker_id IS 'Foreign key reference to brokers table, indicating which broker is associated with this lead';



