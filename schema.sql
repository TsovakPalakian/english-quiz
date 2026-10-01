CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  is_personal_data_revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_login_active ON users(login) WHERE is_personal_data_revoked = 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active ON users(email) WHERE is_personal_data_revoked = 0;

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  status TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  user_id TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_login_pending ON registrations(login) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_pending ON registrations(email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS account_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  from_login TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'USER',
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS account_changes_user_pending ON account_changes(user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS account_changes_login_pending ON account_changes(login) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS account_changes_email_pending ON account_changes(email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY,
  added TEXT NOT NULL DEFAULT '[]',
  songs TEXT NOT NULL DEFAULT '[]',
  learned TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '{}',
  stats TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_added (
  user_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  card TEXT NOT NULL,
  PRIMARY KEY (user_id, idx)
);
