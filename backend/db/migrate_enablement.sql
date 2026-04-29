-- Sales Enablement Phase 1: documents, win/loss reason, deal reviews

-- 1. Add win_loss_reason to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS win_loss_reason VARCHAR(100);

-- 2. Customer documents table
CREATE TABLE IF NOT EXISTS customer_documents (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  file_size     INTEGER,
  mime_type     VARCHAR(100),
  document_type VARCHAR(100),
  deal_stage    VARCHAR(50),
  version       INTEGER NOT NULL DEFAULT 1,
  uploaded_by   VARCHAR(100),
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id);

-- 3. Deal reviews archive
CREATE TABLE IF NOT EXISTS deal_reviews (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  review_data  JSONB NOT NULL,
  created_by   VARCHAR(100),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
