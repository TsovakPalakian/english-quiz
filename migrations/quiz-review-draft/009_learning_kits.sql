-- Local draft extension. No production migration or legacy quiz rewrite.
CREATE TABLE qr_sense_metadata (
  sense_id TEXT PRIMARY KEY REFERENCES qr_senses(id),
  revision INTEGER NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json))
);
CREATE TABLE qr_sense_metadata_events (
  sense_id TEXT NOT NULL REFERENCES qr_senses(id),revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL REFERENCES account_refs(id),value_json TEXT NOT NULL,changed_at INTEGER NOT NULL,
  PRIMARY KEY(sense_id,revision)
);
CREATE TABLE qr_publication (
  version_id TEXT PRIMARY KEY REFERENCES qr_versions(id),revision INTEGER NOT NULL,
  available INTEGER NOT NULL CHECK(available IN (0,1))
);
CREATE TABLE qr_publication_events (
  version_id TEXT NOT NULL REFERENCES qr_versions(id),revision INTEGER NOT NULL,
  available INTEGER NOT NULL,actor_id TEXT NOT NULL REFERENCES account_refs(id),reason TEXT NOT NULL,changed_at INTEGER NOT NULL,
  PRIMARY KEY(version_id,revision)
);
CREATE TABLE qr_opinions (
  id TEXT PRIMARY KEY,version_id TEXT NOT NULL REFERENCES qr_versions(id),content_revision INTEGER NOT NULL,
  requester_id TEXT NOT NULL REFERENCES account_refs(id),comment TEXT NOT NULL,created_at INTEGER NOT NULL,
  UNIQUE(version_id,content_revision)
);
CREATE TABLE qr_opinion_decisions (
  opinion_id TEXT PRIMARY KEY REFERENCES qr_opinions(id),reviewer_id TEXT NOT NULL REFERENCES account_refs(id),
  decision TEXT NOT NULL CHECK(decision IN ('confirm','needs_changes')),comment TEXT NOT NULL,created_at INTEGER NOT NULL
);
CREATE TABLE qr_session_snapshots (
  id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES account_refs(id),card_id INTEGER NOT NULL REFERENCES cards(id),
  version_id TEXT NOT NULL REFERENCES qr_versions(id),type TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('practice','exam')),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  state TEXT NOT NULL CHECK(state IN ('open','submitted','released')),revision INTEGER NOT NULL DEFAULT 1,
  responses_json TEXT,created_at INTEGER NOT NULL
);
CREATE TRIGGER qr_snapshot_immutable BEFORE UPDATE ON qr_session_snapshots
WHEN NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.card_id<>OLD.card_id OR NEW.version_id<>OLD.version_id
 OR NEW.type<>OLD.type OR NEW.mode<>OLD.mode OR NEW.content_json<>OLD.content_json OR NEW.metadata_json<>OLD.metadata_json
 OR NEW.created_at<>OLD.created_at OR NEW.revision<>OLD.revision+1
 OR NOT ((OLD.state='open' AND NEW.state='submitted') OR (OLD.state='submitted' AND NEW.state='released' AND NEW.responses_json IS OLD.responses_json))
BEGIN SELECT RAISE(ABORT,'Session snapshot is immutable'); END;
CREATE TRIGGER qr_snapshot_no_delete BEFORE DELETE ON qr_session_snapshots
BEGIN SELECT RAISE(ABORT,'Session snapshot is immutable'); END;
CREATE TRIGGER qr_metadata_history_no_update BEFORE UPDATE ON qr_sense_metadata_events BEGIN SELECT RAISE(ABORT,'Metadata history is append only'); END;
CREATE TRIGGER qr_metadata_history_no_delete BEFORE DELETE ON qr_sense_metadata_events BEGIN SELECT RAISE(ABORT,'Metadata history is append only'); END;
CREATE TRIGGER qr_publication_history_no_update BEFORE UPDATE ON qr_publication_events BEGIN SELECT RAISE(ABORT,'Publication history is append only'); END;
CREATE TRIGGER qr_publication_history_no_delete BEFORE DELETE ON qr_publication_events BEGIN SELECT RAISE(ABORT,'Publication history is append only'); END;
CREATE TRIGGER qr_opinion_no_update BEFORE UPDATE ON qr_opinions BEGIN SELECT RAISE(ABORT,'Opinion history is append only'); END;
CREATE TRIGGER qr_opinion_no_delete BEFORE DELETE ON qr_opinions BEGIN SELECT RAISE(ABORT,'Opinion history is append only'); END;
CREATE TRIGGER qr_opinion_decision_no_update BEFORE UPDATE ON qr_opinion_decisions BEGIN SELECT RAISE(ABORT,'Opinion history is append only'); END;
CREATE TRIGGER qr_opinion_decision_no_delete BEFORE DELETE ON qr_opinion_decisions BEGIN SELECT RAISE(ABORT,'Opinion history is append only'); END;
