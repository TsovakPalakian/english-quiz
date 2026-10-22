-- Apply as one transaction on an isolated clone; verify foreign keys before release.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE qr_speech_tasks_expanded (
 id TEXT PRIMARY KEY,group_id INTEGER NOT NULL,lesson_id INTEGER NOT NULL,card_id INTEGER,sense_id TEXT REFERENCES qr_senses(id),
 author_id TEXT NOT NULL,created_at INTEGER NOT NULL,value_json TEXT NOT NULL CHECK(json_valid(value_json)),
 CHECK((card_id IS NULL AND sense_id IS NULL) OR (card_id IS NOT NULL AND sense_id IS NOT NULL))
);
INSERT INTO qr_speech_tasks_expanded SELECT id,group_id,lesson_id,card_id,sense_id,author_id,created_at,value_json FROM qr_speech_tasks;
DROP TABLE qr_speech_tasks;
ALTER TABLE qr_speech_tasks_expanded RENAME TO qr_speech_tasks;
CREATE TRIGGER qr_speech_tasks_no_update BEFORE UPDATE ON qr_speech_tasks BEGIN SELECT RAISE(ABORT,'Speech tasks are immutable'); END;
CREATE TRIGGER qr_speech_tasks_no_delete BEFORE DELETE ON qr_speech_tasks BEGIN SELECT RAISE(ABORT,'Speech tasks are immutable'); END;
