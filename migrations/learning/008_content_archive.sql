BEGIN;
CREATE TABLE IF NOT EXISTS content_archive (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  archived_by TEXT NOT NULL,
  archived_by_name TEXT NOT NULL DEFAULT '',
  archived_by_role TEXT NOT NULL DEFAULT 'ADMIN',
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  teacher_hidden_at INTEGER,
  teacher_hidden_by TEXT,
  PRIMARY KEY(entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS content_archive_by_time ON content_archive(archived_at DESC);
CREATE TABLE IF NOT EXISTS content_archive_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
INSERT OR IGNORE INTO content_archive_state(id,revision) VALUES(1,1);
COMMIT;
