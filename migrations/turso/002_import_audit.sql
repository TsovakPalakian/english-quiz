-- Preserve unmapped content and provenance without publishing private answers.
BEGIN IMMEDIATE;
ALTER TABLE lessons ADD COLUMN extra_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(extra_json) AND json_type(extra_json) = 'object');
CREATE TABLE catalog_documents (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  PRIMARY KEY(namespace, key)
);
CREATE TABLE migration_sources (
  migration_id TEXT NOT NULL REFERENCES migration_runs(id),
  source_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  etag TEXT,
  bytes INTEGER NOT NULL CHECK(bytes >= 0),
  PRIMARY KEY(migration_id, source_key)
);
-- Internal migration audit only; not a public lesson/content API.
CREATE TABLE migration_issues (
  id TEXT PRIMARY KEY NOT NULL,
  migration_id TEXT NOT NULL REFERENCES migration_runs(id),
  source_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),
  sensitive INTEGER NOT NULL DEFAULT 0 CHECK(sensitive IN (0, 1)),
  resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0, 1))
);
CREATE INDEX migration_issues_by_run ON migration_issues(migration_id, resolved);
INSERT INTO schema_migrations(version) VALUES(2);
COMMIT;
