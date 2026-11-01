-- Migration 001: Convert Account Database (DB) identifiers to autoincrement integers.
-- Source tables: users, registrations, sessions, account_changes, user_state, user_added, user_card_gone.
-- Mapping table legacy_account_ids records old string identifier to new database assigned integer.

PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE IF NOT EXISTS legacy_account_ids (
  old_id TEXT PRIMARY KEY,
  new_id INTEGER UNIQUE NOT NULL CHECK (new_id > 0)
);

INSERT OR IGNORE INTO legacy_account_ids (old_id, new_id)
SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC)
FROM users;

CREATE TABLE IF NOT EXISTS legacy_registration_ids (
  old_id TEXT PRIMARY KEY,
  new_id INTEGER UNIQUE NOT NULL CHECK (new_id > 0)
);

INSERT OR IGNORE INTO legacy_registration_ids (old_id, new_id)
SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC)
FROM registrations;

CREATE TABLE IF NOT EXISTS legacy_account_change_ids (
  old_id TEXT PRIMARY KEY,
  new_id INTEGER UNIQUE NOT NULL CHECK (new_id > 0)
);

INSERT OR IGNORE INTO legacy_account_change_ids (old_id, new_id)
SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC)
FROM account_changes;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

INSERT INTO users_new (
  id, login, email, name, password_salt, password_hash,
  password_iterations, role, is_personal_data_revoked, revoked_at,
  hidden, active, created_at
)
SELECT
  m.new_id, u.login, u.email, u.name, u.password_salt, u.password_hash,
  u.password_iterations, u.role, u.is_personal_data_revoked, u.revoked_at,
  u.hidden, u.active, u.created_at
FROM users u
JOIN legacy_account_ids m ON m.old_id = u.id;

CREATE TABLE registrations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  status TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  user_id INTEGER,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

INSERT INTO registrations_new (
  id, login, email, name, password_salt, password_hash,
  password_iterations, status, role, user_id, created_at, decided_at
)
SELECT
  rm.new_id, r.login, r.email, r.name, r.password_salt, r.password_hash,
  r.password_iterations, r.status, r.role, um.new_id, r.created_at, r.decided_at
FROM registrations r
JOIN legacy_registration_ids rm ON rm.old_id = r.id
LEFT JOIN legacy_account_ids um ON um.old_id = r.user_id;

CREATE TABLE account_changes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
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

INSERT INTO account_changes_new (
  id, user_id, login, email, name, from_login, from_email,
  from_name, role, status, created_at, decided_at
)
SELECT
  cm.new_id, um.new_id, c.login, c.email, c.name, c.from_login, c.from_email,
  c.from_name, c.role, c.status, c.created_at, c.decided_at
FROM account_changes c
JOIN legacy_account_change_ids cm ON cm.old_id = c.id
JOIN legacy_account_ids um ON um.old_id = c.user_id;

CREATE TABLE sessions_new (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO sessions_new (token_hash, user_id, expires_at)
SELECT s.token_hash, um.new_id, s.expires_at
FROM sessions s
JOIN legacy_account_ids um ON um.old_id = s.user_id;

CREATE TABLE user_state_new (
  user_id INTEGER PRIMARY KEY,
  added TEXT NOT NULL DEFAULT '[]',
  songs TEXT NOT NULL DEFAULT '[]',
  learned TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '{}',
  stats TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

INSERT INTO user_state_new (user_id, added, songs, learned, variants, stats, updated_at)
SELECT um.new_id, s.added, s.songs, s.learned, s.variants, s.stats, s.updated_at
FROM user_state s
JOIN legacy_account_ids um ON um.old_id = s.user_id;

CREATE TABLE user_added_new (
  user_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  card TEXT NOT NULL,
  PRIMARY KEY (user_id, idx)
);

INSERT INTO user_added_new (user_id, idx, card)
SELECT um.new_id, a.idx, a.card
FROM user_added a
JOIN legacy_account_ids um ON um.old_id = a.user_id;

CREATE TABLE IF NOT EXISTS user_card_gone (
  user_id TEXT NOT NULL,
  card_key TEXT NOT NULL,
  PRIMARY KEY (user_id, card_key)
);

CREATE TABLE user_card_gone_new (
  user_id INTEGER NOT NULL,
  card_key TEXT NOT NULL,
  PRIMARY KEY (user_id, card_key)
);

INSERT INTO user_card_gone_new (user_id, card_key)
SELECT um.new_id, g.card_key
FROM user_card_gone g
JOIN legacy_account_ids um ON um.old_id = g.user_id;

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS registrations;
DROP TABLE IF EXISTS account_changes;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS user_state;
DROP TABLE IF EXISTS user_added;
DROP TABLE IF EXISTS user_card_gone;

ALTER TABLE users_new RENAME TO users;
ALTER TABLE registrations_new RENAME TO registrations;
ALTER TABLE account_changes_new RENAME TO account_changes;
ALTER TABLE sessions_new RENAME TO sessions;
ALTER TABLE user_state_new RENAME TO user_state;
ALTER TABLE user_added_new RENAME TO user_added;
ALTER TABLE user_card_gone_new RENAME TO user_card_gone;

CREATE UNIQUE INDEX IF NOT EXISTS users_login_active ON users(login) WHERE is_personal_data_revoked = 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active ON users(email) WHERE is_personal_data_revoked = 0;
CREATE UNIQUE INDEX IF NOT EXISTS registrations_login_pending ON registrations(login) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS registrations_email_pending ON registrations(email) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS account_changes_user_pending ON account_changes(user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS account_changes_login_pending ON account_changes(login) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS account_changes_email_pending ON account_changes(email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS user_state_updated_at ON user_state(updated_at);
CREATE INDEX IF NOT EXISTS user_added_card ON user_added(card);

COMMIT;
PRAGMA foreign_keys = ON;
