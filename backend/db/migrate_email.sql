CREATE TABLE IF NOT EXISTS email_logs (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  to_email        VARCHAR(255) NOT NULL,
  subject         VARCHAR(500),
  body            TEXT,
  gmail_message_id VARCHAR(255),
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);
