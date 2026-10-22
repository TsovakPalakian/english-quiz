-- Additive only: existing quiz/exam definitions, answers and grades are unchanged.
CREATE TABLE qr_card_sense_events (
 id TEXT PRIMARY KEY,card_id INTEGER NOT NULL REFERENCES cards(id),sense_id TEXT NOT NULL REFERENCES qr_senses(id),
 actor_id TEXT NOT NULL REFERENCES account_refs(id),previous_json TEXT NOT NULL CHECK(json_valid(previous_json)),
 reason TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE TRIGGER qr_card_sense_events_no_update BEFORE UPDATE ON qr_card_sense_events BEGIN SELECT RAISE(ABORT,'Meaning mapping audit is immutable'); END;
CREATE TRIGGER qr_card_sense_events_no_delete BEFORE DELETE ON qr_card_sense_events BEGIN SELECT RAISE(ABORT,'Meaning mapping audit is immutable'); END;
CREATE TABLE qr_exam_sessions (
 session_id TEXT PRIMARY KEY REFERENCES qr_session_snapshots(id),exam_id INTEGER NOT NULL REFERENCES exams(id),
 block_id INTEGER NOT NULL REFERENCES exam_blocks(id),version_id TEXT NOT NULL REFERENCES qr_versions(id),
 assigned_by TEXT NOT NULL REFERENCES account_refs(id),created_at INTEGER NOT NULL,
 UNIQUE(exam_id,block_id,version_id)
);
CREATE TRIGGER qr_exam_sessions_no_update BEFORE UPDATE ON qr_exam_sessions BEGIN SELECT RAISE(ABORT,'Exam quiz assignment is immutable'); END;
CREATE TRIGGER qr_exam_sessions_no_delete BEFORE DELETE ON qr_exam_sessions BEGIN SELECT RAISE(ABORT,'Exam quiz assignment is immutable'); END;
CREATE INDEX qr_session_owner_history ON qr_session_snapshots(owner_id,created_at,id);
