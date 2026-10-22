-- Local draft only. No credentials, prompts, transcripts or media are stored here.
CREATE TABLE qr_language_access (
  scope TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  policy_json TEXT NOT NULL CHECK(json_valid(policy_json))
);
CREATE TABLE qr_language_access_changes (
  mutation_id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  UNIQUE(scope,revision)
);
CREATE TABLE qr_language_access_usage (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL REFERENCES qr_language_access(scope),
  revision INTEGER NOT NULL,
  day INTEGER NOT NULL CHECK(day>=0),
  task TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  input_bytes INTEGER NOT NULL CHECK(input_bytes>0),
  admitted_at INTEGER NOT NULL
);
CREATE INDEX qr_language_access_usage_day ON qr_language_access_usage(scope,day);
CREATE TRIGGER qr_language_access_revision BEFORE UPDATE ON qr_language_access
WHEN NEW.scope<>OLD.scope OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Invalid language access revision'); END;
CREATE TRIGGER qr_language_access_no_delete BEFORE DELETE ON qr_language_access
BEGIN SELECT RAISE(ABORT,'Language access cannot be deleted'); END;
CREATE TRIGGER qr_language_access_changes_no_update BEFORE UPDATE ON qr_language_access_changes
BEGIN SELECT RAISE(ABORT,'Language access audit is immutable'); END;
CREATE TRIGGER qr_language_access_changes_no_delete BEFORE DELETE ON qr_language_access_changes
BEGIN SELECT RAISE(ABORT,'Language access audit is append only'); END;
CREATE TRIGGER qr_language_access_usage_no_update BEFORE UPDATE ON qr_language_access_usage
BEGIN SELECT RAISE(ABORT,'Admitted language requests cannot be refunded'); END;
CREATE TRIGGER qr_language_access_usage_no_delete BEFORE DELETE ON qr_language_access_usage
BEGIN SELECT RAISE(ABORT,'Admitted language requests cannot be deleted'); END;
