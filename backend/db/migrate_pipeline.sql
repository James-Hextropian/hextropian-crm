-- Pipeline v2 migration: new stages, deal tracking fields, owner, stage history

-- 1. Create sales_reps table
CREATE TABLE IF NOT EXISTS sales_reps (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Drop old stage constraint before updating values
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_deal_stage_check;

-- 3. Migrate existing stage values to new names
UPDATE customers SET deal_stage = 'Prospecting' WHERE deal_stage = 'Prospect';
UPDATE customers SET deal_stage = 'POC Active'  WHERE deal_stage = 'POC';
UPDATE customers SET deal_stage = 'Post-Sale'   WHERE deal_stage = 'Active Customer';

-- 4. Add new pipeline columns
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS owner_id            INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_close_date DATE,
  ADD COLUMN IF NOT EXISTS probability         INTEGER,
  ADD COLUMN IF NOT EXISTS stage_entry_date    DATE,
  ADD COLUMN IF NOT EXISTS stage_exit_date     DATE;

-- 5. Backfill stage_entry_date for existing records
UPDATE customers SET stage_entry_date = created_at::date WHERE stage_entry_date IS NULL;

-- 6. New stage constraint
ALTER TABLE customers
  ADD CONSTRAINT customers_deal_stage_check
  CHECK (deal_stage IS NULL OR deal_stage IN (
    'Prospecting', 'Qualification', 'Discovery', 'Demo', 'Negotiation',
    'POC Planned', 'POC Active', 'Closed-Won', 'Closed-Lost', 'Post-Sale'
  ));

-- 7. Probability constraint (only valid bucket values)
ALTER TABLE customers
  ADD CONSTRAINT customers_probability_check
  CHECK (probability IS NULL OR probability IN (10, 25, 50, 75, 90, 100));

-- 8. Stage history — tracks every stage transition with timestamps
CREATE TABLE IF NOT EXISTS stage_history (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  from_stage  VARCHAR(50),
  to_stage    VARCHAR(50) NOT NULL,
  entered_at  TIMESTAMPTZ DEFAULT NOW(),
  exited_at   TIMESTAMPTZ
);

-- 9. Seed history from existing deals (treat created_at as stage entry)
INSERT INTO stage_history (customer_id, from_stage, to_stage, entered_at)
SELECT id, NULL, deal_stage, created_at
FROM customers
WHERE deal_stage IS NOT NULL;

-- 10. Fast metrics view
CREATE OR REPLACE VIEW pipeline_metrics AS
SELECT
  c.id,
  c.company_name,
  c.deal_stage,
  c.deal_value,
  c.expected_close_date,
  c.probability,
  c.stage_entry_date,
  c.owner_id,
  sr.name AS owner_name,
  CASE WHEN c.stage_entry_date IS NOT NULL
    THEN (CURRENT_DATE - c.stage_entry_date)
    ELSE 0
  END AS days_in_stage,
  CASE WHEN c.deal_value IS NOT NULL AND c.probability IS NOT NULL
    THEN (c.deal_value * c.probability / 100.0)
    ELSE NULL
  END AS weighted_value
FROM customers c
LEFT JOIN sales_reps sr ON c.owner_id = sr.id;
