-- Isolated local orchestration, never installed by production startup.
CREATE TABLE qr_pipeline_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL CHECK(revision>0)
);
CREATE TABLE qr_pipeline_setting_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL UNIQUE,
  actor_id TEXT NOT NULL REFERENCES account_refs(id),
  enabled INTEGER NOT NULL,
  reason TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);
CREATE TABLE qr_preparation_pipeline (
  id TEXT PRIMARY KEY NOT NULL,
  generation_job_id TEXT NOT NULL REFERENCES qr_generation_jobs(id),
  version_id TEXT NOT NULL UNIQUE REFERENCES qr_versions(id),
  expected_revision INTEGER NOT NULL,
  requested_by TEXT NOT NULL REFERENCES account_refs(id),
  state TEXT NOT NULL CHECK(state IN ('queued','running','teacher_review','attention','stale')),
  revision INTEGER NOT NULL DEFAULT 1,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempt_id TEXT REFERENCES qr_independent_requests(id),
  issue TEXT NOT NULL DEFAULT '',
  changed_at INTEGER NOT NULL
);
CREATE INDEX qr_pipeline_work ON qr_preparation_pipeline(state,lease_until);
CREATE TRIGGER qr_pipeline_identity BEFORE UPDATE ON qr_preparation_pipeline
WHEN NEW.id<>OLD.id OR NEW.generation_job_id<>OLD.generation_job_id OR NEW.version_id<>OLD.version_id
  OR NEW.expected_revision<>OLD.expected_revision OR NEW.requested_by<>OLD.requested_by OR NEW.revision<>OLD.revision+1
BEGIN SELECT RAISE(ABORT,'Pipeline identity is immutable'); END;
CREATE TABLE qr_pipeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES qr_preparation_pipeline(id),
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  issue TEXT NOT NULL,
  attempt_id TEXT,
  changed_at INTEGER NOT NULL,
  UNIQUE(job_id,revision)
);
CREATE TRIGGER qr_pipeline_created AFTER INSERT ON qr_preparation_pipeline
BEGIN INSERT INTO qr_pipeline_events(job_id,revision,state,issue,attempt_id,changed_at) VALUES(NEW.id,NEW.revision,NEW.state,NEW.issue,NEW.attempt_id,NEW.changed_at); END;
CREATE TRIGGER qr_pipeline_changed AFTER UPDATE ON qr_preparation_pipeline
BEGIN INSERT INTO qr_pipeline_events(job_id,revision,state,issue,attempt_id,changed_at) VALUES(NEW.id,NEW.revision,NEW.state,NEW.issue,NEW.attempt_id,NEW.changed_at); END;
CREATE TRIGGER qr_pipeline_no_delete BEFORE DELETE ON qr_preparation_pipeline
BEGIN SELECT RAISE(ABORT,'Pipeline history is append only'); END;
CREATE TRIGGER qr_pipeline_event_no_update BEFORE UPDATE ON qr_pipeline_events
BEGIN SELECT RAISE(ABORT,'Pipeline history is append only'); END;
CREATE TRIGGER qr_pipeline_event_no_delete BEFORE DELETE ON qr_pipeline_events
BEGIN SELECT RAISE(ABORT,'Pipeline history is append only'); END;
CREATE TRIGGER qr_pipeline_settings_event_no_update BEFORE UPDATE ON qr_pipeline_setting_events
BEGIN SELECT RAISE(ABORT,'Pipeline settings history is append only'); END;
CREATE TRIGGER qr_pipeline_settings_event_no_delete BEFORE DELETE ON qr_pipeline_setting_events
BEGIN SELECT RAISE(ABORT,'Pipeline settings history is append only'); END;
