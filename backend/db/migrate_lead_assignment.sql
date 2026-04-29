-- Lead assignment migration: adds rep ownership to contacts

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_rep_id INTEGER REFERENCES sales_reps(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_owner_rep_idx ON contacts(owner_rep_id);
