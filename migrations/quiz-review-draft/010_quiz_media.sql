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
 day TEXT NOT NULL,month TEXT NOT NULL,created_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('reserved','started','complete','failed')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),cache_key TEXT NOT NULL,request_json TEXT NOT NULL
);
CREATE INDEX qr_language_cache ON qr_language_usage(cache_key,state);
CREATE UNIQUE INDEX qr_language_active_cache ON qr_language_usage(cache_key) WHERE state IN ('reserved','started');
CREATE INDEX qr_language_budget ON qr_language_usage(task,provider,day,month);
CREATE TRIGGER qr_language_usage_immutable BEFORE UPDATE ON qr_language_usage WHEN
 NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.task<>OLD.task OR NEW.provider<>OLD.provider OR NEW.unit<>OLD.unit
 OR NEW.quantity<>OLD.quantity OR NEW.day<>OLD.day OR NEW.month<>OLD.month OR NEW.created_at<>OLD.created_at
 OR NEW.deadline_at<>OLD.deadline_at OR NEW.cache_key<>OLD.cache_key OR NEW.request_json<>OLD.request_json
 OR NOT ((OLD.state='reserved' AND NEW.state='started' AND NEW.result_json IS NULL)
 OR (OLD.state='started' AND NEW.state IN ('complete','failed') AND NEW.result_json IS NOT NULL)
 OR (OLD.state='reserved' AND NEW.state='failed' AND NEW.result_json IS NOT NULL))
 BEGIN SELECT RAISE(ABORT,'Material usage and result history are immutable'); END;
CREATE TRIGGER qr_language_usage_no_delete BEFORE DELETE ON qr_language_usage BEGIN SELECT RAISE(ABORT,'Material usage history is immutable'); END;
CREATE TRIGGER qr_media_no_delete BEFORE DELETE ON qr_media BEGIN SELECT RAISE(ABORT,'Media references are retained'); END;
