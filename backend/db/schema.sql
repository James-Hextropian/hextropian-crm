CREATE TABLE IF NOT EXISTS customers (
  id          SERIAL PRIMARY KEY,
  company_name    VARCHAR(255) NOT NULL,
  contact_person  VARCHAR(255),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  industry        VARCHAR(100),
  deal_stage      VARCHAR(50) CHECK (deal_stage IN ('Prospect', 'POC', 'Active Customer')),
  deal_value      NUMERIC(14, 2),
  last_contact_date DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS customer_notes (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER customer_notes_updated_at
  BEFORE UPDATE ON customer_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  first_name  VARCHAR(100),
  last_name   VARCHAR(100),
  title       VARCHAR(100),
  email       VARCHAR(255),
  phone       VARCHAR(50),
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER customer_contacts_updated_at
  BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO customers (company_name, contact_person, email, phone, industry, deal_stage, deal_value, last_contact_date, notes) VALUES
  ('Wickland Pipelines', 'David Wickland', 'david@wicklandpipelines.com', '+1-403-555-0182', 'Oil & Gas', 'POC', 125000, '2026-04-17', 'POC & Fee Agreement signed April 17. Proof of concept focused on regulatory compliance intelligence for hazardous liquid pipeline operators. Counter-position discussion ongoing. Revised financials sent March 25.'),
  ('Entel (Chilean Bank Pilot)', 'Ramiro Salas', 'ramiro.salas@entel.cl', '+56-2-555-0193', 'Financial Services', 'POC', 280000, '2026-03-15', 'Chilean bank pilot. Tiered pricing model agreed. SLA draft sent August 2025. Order form with customer details finalized. Deal in late POC stage — push for Active Customer conversion.'),
  ('Nexantia Biotherapeutics', 'Dr. Elena Varga', 'evarga@nexantia.bio', '+1-617-555-0247', 'Life Sciences', 'POC', 195000, '2026-03-10', 'LOI signed. NDA executed. Focused on QMS and regulatory compliance intelligence for biotherapeutics manufacturing. Strong interest in GRC platform.'),
  ('ABN AMRO', 'Pieter van den Berg', 'p.vandenberg@abnamro.nl', '+31-20-555-0156', 'Financial Services', 'Prospect', 350000, '2026-03-06', 'Org map reviewed March 2026. Introduction via Databricks network. Targeting compliance and AI governance use case. Early stage — need to schedule discovery call.'),
  ('Brightseed', 'Sarah Chen', 'sarah.chen@brightseed.co', '+1-415-555-0134', 'Life Sciences', 'Prospect', 90000, '2026-02-02', 'Full messaging framework canonical customer document prepared. Structured advisory proposal sent February 2026. Awaiting procurement approval.'),
  ('nLighten Data Centers', 'Marcus Webb', 'mwebb@nlighten.com', '+1-512-555-0211', 'Technology', 'Prospect', 210000, '2025-11-15', 'Hextropian solution sheet sent. Interested in AI governance and compliance monitoring for data center operations. Regulatory requirements around data sovereignty are primary driver.'),
  ('SenseiAlgo.ai', 'Priya Mehta', 'priya@senseialgoo.ai', '+1-650-555-0178', 'Technology', 'Prospect', 75000, '2025-12-01', 'NDA signed. Early conversations around AI compliance monitoring. Small initial deal but high growth potential as they scale.'),
  ('Scilife', 'Johan Lindqvist', 'j.lindqvist@scilife.com', '+46-8-555-0199', 'Life Sciences', 'Prospect', 160000, '2026-01-20', 'Mutual NDA signed. European life sciences company. Interested in GRC and quality management compliance platform.'),
  ('Karl Lagerfeld (Retail)', 'Isabelle Fontaine', 'ifontaine@karllagerfeld.com', '+33-1-555-0144', 'Retail', 'Prospect', 120000, '2026-03-18', 'Industry brief prepared for retail regulatory intelligence use case. Focused on multinational retail compliance across EU markets.'),
  ('RoughCut (Sports Cards)', 'Tyler Grant', 'tyler@roughcut.cards', '+1-972-555-0167', 'Retail', 'Active Customer', 45000, '2026-01-26', 'Active customer. Starter plan 500 cards. MDR finalized. Sales deck delivered. Focus on provenance verification and collectibles authentication compliance.');
