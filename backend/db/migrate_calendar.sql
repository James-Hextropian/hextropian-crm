-- Calendar events (linked to Google Calendar and CRM accounts)
CREATE TABLE IF NOT EXISTS calendar_events (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id          INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  google_event_id      VARCHAR(255),
  title                VARCHAR(500) NOT NULL,
  description          TEXT,
  start_time           TIMESTAMPTZ NOT NULL,
  end_time             TIMESTAMPTZ NOT NULL,
  location             VARCHAR(500),
  attendees            JSONB DEFAULT '[]',
  post_meeting_notes   TEXT,
  reminders            JSONB DEFAULT '[{"minutes":15}]',
  synced_at            TIMESTAMPTZ,
  is_deleted           BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_idx
  ON calendar_events(google_event_id)
  WHERE google_event_id IS NOT NULL AND is_deleted = false;

CREATE INDEX IF NOT EXISTS calendar_events_user_time_idx
  ON calendar_events(user_id, start_time)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS calendar_events_customer_idx
  ON calendar_events(customer_id)
  WHERE is_deleted = false;

CREATE OR REPLACE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
