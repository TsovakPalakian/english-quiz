-- Local integration candidate only; never applied by an HTTP request.
CREATE TABLE qr_speech_text_reviews (
 id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),owner_id TEXT NOT NULL,
 transcript_revision INTEGER NOT NULL,transcript TEXT NOT NULL,consent_at INTEGER NOT NULL,
 source_json TEXT NOT NULL CHECK(json_valid(source_json)),rubric_json TEXT NOT NULL CHECK(json_valid(rubric_json)),
 sequence INTEGER NOT NULL,created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('reserved','started','complete','failed','cancelled')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),error_code TEXT,finished_at INTEGER,deleted_at INTEGER,UNIQUE(attempt_id,sequence)
);
CREATE INDEX qr_speech_text_history ON qr_speech_text_reviews(attempt_id,created_at,id);
CREATE UNIQUE INDEX qr_speech_text_active ON qr_speech_text_reviews(attempt_id,transcript_revision) WHERE state IN ('reserved','started') AND deleted_at IS NULL;
CREATE TRIGGER qr_speech_text_immutable BEFORE UPDATE ON qr_speech_text_reviews WHEN
 NEW.id<>OLD.id OR NEW.attempt_id<>OLD.attempt_id OR NEW.owner_id<>OLD.owner_id OR NEW.transcript_revision<>OLD.transcript_revision
 OR NEW.consent_at<>OLD.consent_at OR NEW.source_json<>OLD.source_json OR NEW.rubric_json<>OLD.rubric_json
 OR NEW.sequence<>OLD.sequence OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at OR OLD.deleted_at IS NOT NULL
 OR NOT ((NEW.deleted_at IS NOT NULL AND NEW.transcript='' AND NEW.result_json IS NULL)
 OR (NEW.deleted_at IS NULL AND NEW.transcript=OLD.transcript AND OLD.state='reserved' AND NEW.state='started' AND NEW.result_json IS NULL AND NEW.finished_at IS NULL)
 OR (NEW.deleted_at IS NULL AND NEW.transcript=OLD.transcript AND OLD.state IN ('reserved','started') AND NEW.state IN ('complete','failed','cancelled') AND NEW.finished_at IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'Confirmed transcript review history is immutable'); END;
CREATE TRIGGER qr_speech_text_no_delete BEFORE DELETE ON qr_speech_text_reviews BEGIN SELECT RAISE(ABORT,'Use private attempt deletion'); END;
