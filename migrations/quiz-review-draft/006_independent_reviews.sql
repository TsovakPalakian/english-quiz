-- ISOLATED DRAFT ONLY. No production bootstrap or deployment imports this schema.
CREATE TABLE qr_independent_requests (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  version_id TEXT NOT NULL REFERENCES qr_versions(id),
  revision INTEGER NOT NULL CHECK(revision>0),
  requested_by TEXT NOT NULL REFERENCES account_refs(id),
  mutation_id TEXT NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  checked_json TEXT NOT NULL CHECK(json_valid(checked_json)),
  requested_at INTEGER NOT NULL CHECK(requested_at>=0),
  UNIQUE(requested_by,mutation_id)
);
CREATE INDEX qr_independent_history ON qr_independent_requests(version_id,sequence DESC);
CREATE TABLE qr_independent_outcomes (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES qr_independent_requests(id),
  finished_at INTEGER NOT NULL CHECK(finished_at>=0),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  CHECK((result_json IS NOT NULL AND error_code IS NULL) OR (result_json IS NULL AND error_code IS NOT NULL))
);
CREATE TRIGGER qr_independent_request_no_update BEFORE UPDATE ON qr_independent_requests
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
CREATE TRIGGER qr_independent_request_no_delete BEFORE DELETE ON qr_independent_requests
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
CREATE TRIGGER qr_independent_outcome_no_update BEFORE UPDATE ON qr_independent_outcomes
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
CREATE TRIGGER qr_independent_outcome_no_delete BEFORE DELETE ON qr_independent_outcomes
BEGIN SELECT RAISE(ABORT,'Independent review history is append only'); END;
