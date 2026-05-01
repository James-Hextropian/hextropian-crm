-- Seed core sales reps and link them to their user accounts

CREATE TABLE IF NOT EXISTS sales_reps (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sales_reps (name, email) VALUES
  ('James Wright',  'james@hextropian.systems'),
  ('Paul Camacho',  'paul@hextropian.systems'),
  ('Ramiro Salas',  'ramiro@hextropian.systems')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;

-- Link users to their rep record by email
UPDATE users
SET rep_id = sr.id
FROM sales_reps sr
WHERE users.email = sr.email
  AND users.rep_id IS DISTINCT FROM sr.id;
