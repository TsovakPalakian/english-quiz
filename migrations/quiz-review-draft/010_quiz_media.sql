-- Isolated draft. No production schema changes.
CREATE TABLE qr_media (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES account_refs(id),purpose TEXT NOT NULL CHECK(purpose IN ('quiz','feedback')),
 digest TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL,name TEXT NOT NULL,
 descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json)),source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 created_at INTEGER NOT NULL,deleted_at INTEGER
);
CREATE INDEX qr_media_owner ON qr_media(owner_id,purpose,created_at);
CREATE TRIGGER qr_media_immutable BEFORE UPDATE ON qr_media WHEN
 NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.purpose<>OLD.purpose OR NEW.digest<>OLD.digest
 OR NEW.mime<>OLD.mime OR NEW.bytes<>OLD.bytes OR NEW.name<>OLD.name OR NEW.descriptor_json<>OLD.descriptor_json
 OR NEW.source_json<>OLD.source_json OR NEW.created_at<>OLD.created_at OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
 BEGIN SELECT RAISE(ABORT,'Media is immutable'); END;
CREATE TABLE qr_feedback (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES account_refs(id),card_id INTEGER NOT NULL REFERENCES cards(id),
 sense_id TEXT NOT NULL REFERENCES qr_senses(id),version_id TEXT REFERENCES qr_versions(id),category TEXT NOT NULL,
 description TEXT NOT NULL,attachments_json TEXT NOT NULL CHECK(json_valid(attachments_json)),created_at INTEGER NOT NULL
);
CREATE TRIGGER qr_feedback_no_update BEFORE UPDATE ON qr_feedback BEGIN SELECT RAISE(ABORT,'Feedback is immutable'); END;
CREATE TRIGGER qr_feedback_no_delete BEFORE DELETE ON qr_feedback BEGIN SELECT RAISE(ABORT,'Feedback is immutable'); END;
CREATE TABLE qr_language_usage (
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,task TEXT NOT NULL,provider TEXT NOT NULL,unit TEXT NOT NULL,quantity INTEGER NOT NULL,
 day TEXT NOT NULL,month TEXT NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','started','complete','failed')),
 result_json TEXT,cache_key TEXT NOT NULL,request_json TEXT NOT NULL
);
CREATE INDEX qr_language_cache ON qr_language_usage(cache_key,state);
CREATE INDEX qr_language_budget ON qr_language_usage(task,provider,day,month);
