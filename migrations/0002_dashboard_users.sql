-- Dashboard account and session storage for the D1 proof of concept.
-- Passwords are stored as PBKDF2-SHA-256 hashes; no plaintext passwords are stored here.
CREATE TABLE IF NOT EXISTS dashboard_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('need', 'food-bank', 'food-supplier')),
  display_name TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS dashboard_users_role_idx ON dashboard_users (role, status);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES dashboard_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry_idx ON dashboard_sessions (expires_at);

INSERT OR IGNORE INTO dashboard_users
  (id, email, password_hash, role, display_name, organization_name, status)
VALUES
  ('user-demo-food-bank', 'demo.foodbank@carespace.dev', 'pbkdf2$sha256$100000$B0pj7oKI3ZRfxqDGBXpEiQ$Lc3O9tUZkXwvmLbe07JIvzllksXmYauylr5XPMsMRBE', 'food-bank', 'Avery Martinez', 'Central Care Food Bank', 'active'),
  ('user-demo-food-supplier', 'demo.supplier@carespace.dev', 'pbkdf2$sha256$100000$iB7ssNsFE3Dy9PP8RsKehQ$4mzz9WJtNZWn0FmhfGlFZ3HGHkjd3aUxe_Fowdm5uik', 'food-supplier', 'Jordan Rivera', 'Northside Market', 'active');
