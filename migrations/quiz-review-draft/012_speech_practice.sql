-- Isolated pilot. No production migrations or real assessment enabled.
CREATE TABLE qr_speech_tasks (
 id TEXT PRIMARY KEY,group_id INTEGER NOT NULL,lesson_id INTEGER NOT NULL,card_id INTEGER NOT NULL,sense_id TEXT NOT NULL REFERENCES qr_senses(id),
 author_id TEXT NOT NULL,created_at INTEGER NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json))
);
CREATE TRIGGER qr_speech_tasks_no_update BEFORE UPDATE ON qr_speech_tasks BEGIN SELECT RAISE(ABORT,'Speech tasks are immutable'); END;
CREATE TRIGGER qr_speech_tasks_no_delete BEFORE DELETE ON qr_speech_tasks BEGIN SELECT RAISE(ABORT,'Speech tasks are immutable'); END;
CREATE TABLE qr_speech_attempts (
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES qr_speech_tasks(id),owner_id TEXT NOT NULL REFERENCES account_refs(id),media_id TEXT NOT NULL UNIQUE REFERENCES qr_media(id),
 consent_at INTEGER NOT NULL,created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),comparison_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','analyzing','complete','unusable','failed','cancelled')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),error_code TEXT,finished_at INTEGER,deleted_at INTEGER
);
CREATE INDEX qr_speech_history ON qr_speech_attempts(owner_id,created_at,id);
CREATE TRIGGER qr_speech_attempts_immutable BEFORE UPDATE ON qr_speech_attempts WHEN
 NEW.id<>OLD.id OR NEW.task_id<>OLD.task_id OR NEW.owner_id<>OLD.owner_id OR NEW.media_id<>OLD.media_id
 OR NEW.consent_at<>OLD.consent_at OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at
 OR NEW.snapshot_json<>OLD.snapshot_json OR NEW.comparison_key<>OLD.comparison_key OR OLD.deleted_at IS NOT NULL
 OR NOT ((NEW.deleted_at IS NOT NULL AND NEW.result_json IS NULL)
 OR (OLD.state='queued' AND NEW.state='analyzing' AND NEW.result_json IS NULL AND NEW.deleted_at IS NULL)
 OR (OLD.state IN ('queued','analyzing') AND NEW.state IN ('complete','unusable','failed','cancelled') AND NEW.deleted_at IS NULL AND NEW.finished_at IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'Speech attempt history is immutable'); END;
CREATE TRIGGER qr_speech_attempts_no_delete BEFORE DELETE ON qr_speech_attempts BEGIN SELECT RAISE(ABORT,'Use private attempt deletion'); END;
CREATE TABLE qr_speech_usage (
 attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),task TEXT NOT NULL,provider TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('audio','language')),
 quantity INTEGER NOT NULL CHECK(quantity>0),day TEXT NOT NULL,month TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','started','released')),
 PRIMARY KEY(attempt_id,task)
);
CREATE TRIGGER qr_speech_usage_immutable BEFORE UPDATE ON qr_speech_usage WHEN
 NEW.attempt_id<>OLD.attempt_id OR NEW.task<>OLD.task OR NEW.provider<>OLD.provider OR NEW.kind<>OLD.kind OR NEW.quantity<>OLD.quantity
 OR NEW.day<>OLD.day OR NEW.month<>OLD.month OR OLD.state<>'reserved' OR NEW.state NOT IN ('started','released')
 BEGIN SELECT RAISE(ABORT,'Speech usage is immutable'); END;
CREATE TRIGGER qr_speech_usage_no_delete BEFORE DELETE ON qr_speech_usage BEGIN SELECT RAISE(ABORT,'Speech usage is immutable'); END;
CREATE TABLE qr_speech_shares (
 attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),teacher_id TEXT NOT NULL,created_at INTEGER NOT NULL,include_audio INTEGER NOT NULL CHECK(include_audio IN (0,1)),
 PRIMARY KEY(attempt_id,teacher_id)
);
CREATE TABLE qr_speech_corrections (
 id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),created_at INTEGER NOT NULL,text TEXT NOT NULL,
 revision INTEGER NOT NULL,UNIQUE(attempt_id,revision)
);
