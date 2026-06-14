-- Peer Finance Manager — Postgres reference schema (backup / future use).
-- Live app today uses SQLite on Render. Run this in Supabase SQL Editor only.

CREATE TABLE IF NOT EXISTS organizations (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  joined_at DATE,
  membership_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS member_profiles (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  photo_path TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  gender TEXT,
  date_of_birth DATE,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  next_of_kin_first_name TEXT,
  next_of_kin_last_name TEXT,
  next_of_kin_phone TEXT,
  next_of_kin_relationship TEXT,
  application_signed_at TIMESTAMPTZ,
  signature_name TEXT,
  preferred_payment_method TEXT NOT NULL DEFAULT 'Zelle',
  zelle_bank_name TEXT,
  cooperative_account_status TEXT NOT NULL DEFAULT 'active',
  application_source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'member')),
  member_id BIGINT REFERENCES members(id) ON DELETE SET NULL,
  display_name TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  organization_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES members(id),
  type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  transaction_date DATE NOT NULL,
  period_year INTEGER,
  period_month INTEGER,
  description TEXT,
  reference TEXT,
  loan_id BIGINT,
  bank_import_id BIGINT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);

CREATE TABLE IF NOT EXISTS loans (
  id BIGSERIAL PRIMARY KEY,
  borrower_id BIGINT NOT NULL REFERENCES members(id),
  principal NUMERIC(14, 2) NOT NULL,
  annual_rate NUMERIC(8, 4) NOT NULL DEFAULT 0.08,
  term_months INTEGER NOT NULL DEFAULT 12,
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  guarantor1_id BIGINT REFERENCES members(id),
  guarantor2_id BIGINT REFERENCES members(id),
  schedule_imported BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  expense_date DATE NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS distributions (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  credited_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cooperative_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
