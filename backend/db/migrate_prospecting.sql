-- Prospecting Engine migration

-- Main contacts table (cold prospect database)
CREATE TABLE IF NOT EXISTS contacts (
  id                   SERIAL PRIMARY KEY,
  first_name           VARCHAR(100),
  last_name            VARCHAR(100),
  email                VARCHAR(255) UNIQUE,
  linkedin_url         VARCHAR(500),
  company              VARCHAR(255),
  title                VARCHAR(255),
  vertical             VARCHAR(100),
  phone                VARCHAR(50),
  status               VARCHAR(30) NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new', 'active', 'no_interest', 'converted')),
  no_interest_reason   VARCHAR(255),
  converted_account_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_vertical_idx ON contacts(vertical);
CREATE INDEX IF NOT EXISTS contacts_status_idx   ON contacts(status);
CREATE INDEX IF NOT EXISTS contacts_company_idx  ON contacts(company);
CREATE INDEX IF NOT EXISTS contacts_email_idx    ON contacts(email);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Workqueue: one active entry per contact (globally unique)
CREATE TABLE IF NOT EXISTS workqueue (
  id               SERIAL PRIMARY KEY,
  contact_id       INTEGER NOT NULL UNIQUE REFERENCES contacts(id) ON DELETE CASCADE,
  rep_id           INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
  assigned_date    DATE DEFAULT CURRENT_DATE,
  outreach_stage   VARCHAR(50) NOT NULL DEFAULT 'linkedin_view',
  stage_entered_at TIMESTAMPTZ DEFAULT NOW(),
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workqueue_rep_active_idx ON workqueue(rep_id, completed);

CREATE TRIGGER workqueue_updated_at
  BEFORE UPDATE ON workqueue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Full outreach history per contact
CREATE TABLE IF NOT EXISTS outreach_history (
  id           SERIAL PRIMARY KEY,
  contact_id   INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  rep_id       INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
  stage        VARCHAR(50) NOT NULL,
  notes        TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS outreach_contact_idx ON outreach_history(contact_id);

-- Notes per contact (call notes, objections, follow-ups)
CREATE TABLE IF NOT EXISTS contact_notes (
  id         SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  rep_id     INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contact_notes_contact_idx ON contact_notes(contact_id);
