PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  joined_at TEXT,
  membership_fee_paid INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS member_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL UNIQUE,
  photo_path TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  display_name TEXT,
  gender TEXT,
  date_of_birth TEXT,
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
  application_signed_at TEXT,
  signature_name TEXT,
  preferred_payment_method TEXT NOT NULL DEFAULT 'Zelle',
  zelle_bank_name TEXT,
  cooperative_account_status TEXT NOT NULL DEFAULT 'active',
  application_source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  credited_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrower_id INTEGER NOT NULL,
  principal REAL NOT NULL,
  annual_rate REAL NOT NULL DEFAULT 0.08,
  term_months INTEGER NOT NULL DEFAULT 12,
  start_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  guarantor1_id INTEGER,
  guarantor2_id INTEGER,
  schedule_imported INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (borrower_id) REFERENCES members(id),
  FOREIGN KEY (guarantor1_id) REFERENCES members(id),
  FOREIGN KEY (guarantor2_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS loan_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  principal_due REAL NOT NULL DEFAULT 0,
  interest_due REAL NOT NULL DEFAULT 0,
  total_due REAL NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  paid_date TEXT,
  late_fee_applied REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (loan_id) REFERENCES loans(id),
  UNIQUE (loan_id, installment_number)
);

CREATE TABLE IF NOT EXISTS bank_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  transaction_date TEXT NOT NULL,
  period_year INTEGER,
  period_month INTEGER,
  description TEXT,
  reference TEXT,
  loan_id INTEGER,
  bank_import_id INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (loan_id) REFERENCES loans(id),
  FOREIGN KEY (bank_import_id) REFERENCES bank_imports(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON loan_installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_member_profiles_member ON member_profiles(member_id);

CREATE TABLE IF NOT EXISTS cooperative_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cd_balance_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  balance REAL NOT NULL,
  as_of_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cd_balance_updates_date ON cd_balance_updates(as_of_date);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'member')),
  member_id INTEGER,
  display_name TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_member ON users(member_id);
