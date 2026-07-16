PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_number TEXT UNIQUE,
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
  next_of_kin_email TEXT,
  next_of_kin_phone TEXT,
  next_of_kin_relationship TEXT,
  application_signed_at TEXT,
  signature_name TEXT,
  preferred_payment_method TEXT NOT NULL DEFAULT 'Zelle',
  zelle_bank_name TEXT,
  cooperative_account_status TEXT NOT NULL DEFAULT 'active',
  membership_status_changed_at TEXT,
  membership_status_note TEXT,
  membership_status_document_path TEXT,
  membership_status_document_name TEXT,
  membership_status_document_mime TEXT,
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
  guarantor_document_id TEXT,
  guarantor_sign_url TEXT,
  guarantor_embed_url TEXT,
  guarantor_doc_status TEXT,
  borrower_document_id TEXT,
  borrower_sign_url TEXT,
  borrower_embed_url TEXT,
  borrower_doc_status TEXT,
  repayment_policy TEXT NOT NULL DEFAULT 'flexible',
  late_fee_amount REAL NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (borrower_id) REFERENCES members(id),
  FOREIGN KEY (guarantor1_id) REFERENCES members(id),
  FOREIGN KEY (guarantor2_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS loan_policy_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disbursement_tx_id INTEGER UNIQUE,
  loan_id INTEGER,
  member_id INTEGER,
  disbursement_date TEXT NOT NULL,
  principal REAL NOT NULL,
  repayment_policy TEXT NOT NULL DEFAULT 'flexible',
  late_fee_amount REAL NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_late_fee_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER,
  installment_id INTEGER,
  disbursement_tx_id INTEGER,
  period_due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  transaction_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flexxforms_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  flexxforms_submission_id TEXT,
  form_id TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  member_id INTEGER,
  loan_id INTEGER,
  applicant_name TEXT,
  applicant_email TEXT,
  processed_at TEXT,
  approved_at TEXT,
  approved_by_user_id INTEGER,
  processing_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS expense_report_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  category TEXT,
  report_label_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (report_label_id) REFERENCES expense_report_labels(id)
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

CREATE TABLE IF NOT EXISTS ledger_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ledger_key TEXT NOT NULL UNIQUE,
  transaction_date TEXT NOT NULL,
  original_amount REAL NOT NULL,
  description TEXT,
  adjustment_kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS ledger_adjustment_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_id INTEGER NOT NULL,
  line_order INTEGER NOT NULL,
  ledger_type TEXT NOT NULL,
  member_name TEXT,
  amount REAL NOT NULL,
  description_note TEXT,
  FOREIGN KEY (adjustment_id) REFERENCES ledger_adjustments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ledger_adjustments_date ON ledger_adjustments(transaction_date);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_label TEXT NOT NULL,
  institution_name TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'USD',
  statement_format TEXT NOT NULL DEFAULT 'auto',
  column_mapping_json TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  active_from TEXT,
  active_to TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_primary ON bank_accounts(is_primary);
CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loan_installments_loan ON loan_installments(loan_id);


CREATE TABLE IF NOT EXISTS cooperative_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cooperative_status_reports (
  period_slug TEXT PRIMARY KEY,
  as_of_date TEXT NOT NULL,
  file_name TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  published_at TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  performance_overview TEXT
);

CREATE TABLE IF NOT EXISTS cooperative_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  meeting_date TEXT NOT NULL,
  meeting_time TEXT NOT NULL,
  location TEXT,
  virtual_link TEXT,
  agenda TEXT,
  admin_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  announced_at TEXT,
  cancelled_at TEXT,
  reminder_sent_at TEXT,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cooperative_meetings_date ON cooperative_meetings(meeting_date, meeting_time);
CREATE INDEX IF NOT EXISTS idx_cooperative_meetings_status ON cooperative_meetings(status);

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
