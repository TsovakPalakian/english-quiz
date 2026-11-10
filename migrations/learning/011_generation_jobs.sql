-- Local draft only. Not a production migration.
CREATE TABLE qr_generation_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  group_id INTEGER NOT NULL REFERENCES class_groups(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  sense_id TEXT NOT NULL REFERENCES qr_senses(id),
  type TEXT NOT NULL,
  requested_by TEXT NOT NULL REFERENCES account_refs(id),
  state TEXT NOT NULL CHECK(state IN ('queued','running','retry','review','submitted','context','skipped')),
  revision INTEGER NOT NULL DEFAULT 1,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  cycle INTEGER NOT NULL DEFAULT 0 CHECK(cycle BETWEEN 0 AND 2),
  next_at INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  candidate_json TEXT CHECK(candidate_json IS NULL OR json_valid(candidate_json)),
  candidate_generation_json TEXT CHECK(candidate_generation_json IS NULL OR (candidate_json IS NOT NULL AND json_valid(candidate_generation_json) AND json_type(candidate_generation_json)='object')),
  version_id TEXT REFERENCES qr_versions(id),
  issue TEXT NOT NULL DEFAULT '',
  UNIQUE(group_id,lesson_id,card_id,sense_id,type)
);
CREATE INDEX qr_generation_due ON qr_generation_jobs(state,next_at,lease_until);

CREATE TABLE qr_generation_attempts (
  job_id TEXT NOT NULL REFERENCES qr_generation_jobs(id),
  cycle INTEGER NOT NULL CHECK(cycle BETWEEN 0 AND 2),
  attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 3),
  lease_token TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','accepted','rejected','error','interrupted')),
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  issue TEXT NOT NULL DEFAULT '',
  source_json TEXT CHECK(source_json IS NULL OR (json_valid(source_json) AND json_type(source_json)='object')),
  usage_json TEXT CHECK(usage_json IS NULL OR (json_valid(usage_json) AND json_type(usage_json)='object')),
  PRIMARY KEY(job_id,cycle,attempt),
  CHECK((state='running' AND finished_at IS NULL) OR (state<>'running' AND finished_at IS NOT NULL AND finished_at>=started_at))
);
CREATE TRIGGER qr_attempt_no_delete BEFORE DELETE ON qr_generation_attempts
BEGIN SELECT RAISE(ABORT,'Generation attempts are append only'); END;
CREATE TRIGGER qr_attempt_final_once BEFORE UPDATE ON qr_generation_attempts
WHEN OLD.state<>'running' OR NEW.state='running' OR NEW.job_id<>OLD.job_id OR NEW.cycle<>OLD.cycle
  OR NEW.attempt<>OLD.attempt OR NEW.lease_token<>OLD.lease_token OR NEW.started_at<>OLD.started_at
BEGIN SELECT RAISE(ABORT,'Generation attempt identity and final results are immutable'); END;
