-- Optional local preparation extension; legacy jobs do not require a snapshot.
CREATE TABLE qr_generation_contexts (
  job_id TEXT NOT NULL REFERENCES qr_generation_jobs(id),
  cycle INTEGER NOT NULL CHECK(cycle BETWEEN 0 AND 2),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  PRIMARY KEY(job_id,cycle)
);
CREATE TRIGGER qr_generation_contexts_no_update BEFORE UPDATE ON qr_generation_contexts
BEGIN SELECT RAISE(ABORT,'Generation context is immutable'); END;
CREATE TRIGGER qr_generation_contexts_no_delete BEFORE DELETE ON qr_generation_contexts
BEGIN SELECT RAISE(ABORT,'Generation context is append only'); END;
