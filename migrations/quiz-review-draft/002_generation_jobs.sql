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
