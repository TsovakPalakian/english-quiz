-- Local opt-in. No external service is activated by this migration.
CREATE TABLE qr_speech_dialogues(
 id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES qr_speech_tasks(id),owner_id TEXT NOT NULL REFERENCES account_refs(id),
 scenario_json TEXT NOT NULL CHECK(json_valid(scenario_json)),source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 state TEXT NOT NULL CHECK(state IN('open','complete','cancelled')),revision INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,deleted_at INTEGER
);
CREATE TABLE qr_speech_dialogue_turns(
 id TEXT PRIMARY KEY,dialogue_id TEXT NOT NULL REFERENCES qr_speech_dialogues(id),sequence INTEGER NOT NULL,
 attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),transcript_revision INTEGER NOT NULL,user_text TEXT NOT NULL,reply TEXT,
 state TEXT NOT NULL CHECK(state IN('reserved','started','complete','failed')),error_code TEXT,
 created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,finished_at INTEGER,deleted_at INTEGER,
 day TEXT NOT NULL,month TEXT NOT NULL,provider TEXT NOT NULL,UNIQUE(dialogue_id,sequence)
);
CREATE UNIQUE INDEX qr_dialogue_active_turn ON qr_speech_dialogue_turns(dialogue_id) WHERE state IN('reserved','started') AND deleted_at IS NULL;
CREATE INDEX qr_dialogue_budget ON qr_speech_dialogue_turns(provider,month,day);
CREATE TRIGGER qr_dialogue_identity BEFORE UPDATE ON qr_speech_dialogues WHEN
 NEW.id<>OLD.id OR NEW.task_id<>OLD.task_id OR NEW.owner_id<>OLD.owner_id OR NEW.scenario_json<>OLD.scenario_json OR NEW.source_json<>OLD.source_json OR NEW.created_at<>OLD.created_at
 OR OLD.deleted_at IS NOT NULL OR NEW.revision<>OLD.revision+1 OR (NEW.deleted_at IS NULL AND OLD.state<>'open')
BEGIN SELECT RAISE(ABORT,'Dialogue identity is immutable'); END;
CREATE TRIGGER qr_dialogue_no_delete BEFORE DELETE ON qr_speech_dialogues BEGIN SELECT RAISE(ABORT,'Use private dialogue deletion'); END;
CREATE TRIGGER qr_dialogue_turn_identity BEFORE UPDATE ON qr_speech_dialogue_turns WHEN
 NEW.id<>OLD.id OR NEW.dialogue_id<>OLD.dialogue_id OR NEW.sequence<>OLD.sequence OR NEW.attempt_id<>OLD.attempt_id OR NEW.transcript_revision<>OLD.transcript_revision
 OR NEW.created_at<>OLD.created_at OR NEW.deadline_at<>OLD.deadline_at OR NEW.day<>OLD.day OR NEW.month<>OLD.month OR NEW.provider<>OLD.provider OR OLD.deleted_at IS NOT NULL
 OR NOT ((NEW.deleted_at IS NOT NULL AND NEW.user_text='' AND NEW.reply IS NULL) OR
 (NEW.user_text=OLD.user_text AND ((OLD.state='reserved' AND NEW.state='started' AND NEW.reply IS NULL) OR (OLD.state IN('reserved','started') AND NEW.state IN('complete','failed') AND NEW.finished_at IS NOT NULL))))
BEGIN SELECT RAISE(ABORT,'Dialogue turns are immutable'); END;
CREATE TRIGGER qr_dialogue_turn_no_delete BEFORE DELETE ON qr_speech_dialogue_turns BEGIN SELECT RAISE(ABORT,'Use private dialogue deletion'); END;
CREATE TABLE qr_speech_disputes(
 id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL REFERENCES qr_speech_attempts(id),owner_id TEXT NOT NULL REFERENCES account_refs(id),teacher_id TEXT NOT NULL,
 reason TEXT NOT NULL,created_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,
 decision TEXT CHECK(decision IS NULL OR decision IN('upheld','needs_reassessment')),comment TEXT,teacher_score REAL CHECK(teacher_score IS NULL OR teacher_score BETWEEN 0 AND 100),
 reviewer_id TEXT,decided_at INTEGER,deleted_at INTEGER,UNIQUE(attempt_id)
);
CREATE TRIGGER qr_speech_dispute_identity BEFORE UPDATE ON qr_speech_disputes WHEN
 NEW.id<>OLD.id OR NEW.attempt_id<>OLD.attempt_id OR NEW.owner_id<>OLD.owner_id OR NEW.teacher_id<>OLD.teacher_id OR NEW.created_at<>OLD.created_at OR OLD.deleted_at IS NOT NULL OR NEW.revision<>OLD.revision+1
 OR NOT ((NEW.deleted_at IS NOT NULL AND NEW.reason='' AND NEW.comment IS NULL AND NEW.teacher_score IS NULL) OR
 (NEW.reason=OLD.reason AND OLD.decision IS NULL AND NEW.decision IS NOT NULL AND NEW.reviewer_id IS NOT NULL AND NEW.decided_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Dispute history is immutable'); END;
CREATE TRIGGER qr_speech_dispute_no_delete BEFORE DELETE ON qr_speech_disputes BEGIN SELECT RAISE(ABORT,'Use private dispute deletion'); END;
