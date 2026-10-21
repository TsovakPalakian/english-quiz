-- ISOLATED DRAFT ONLY. Not part of migrations/learning or a deployment command.
-- Apply to a local test database AFTER the existing learning schema.
CREATE TABLE qr_senses (
  id TEXT PRIMARY KEY NOT NULL,
  en TEXT NOT NULL,
  word_key TEXT NOT NULL,
  part_of_speech TEXT NOT NULL,
  translation TEXT NOT NULL,
  definition TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES account_refs(id),
  created_date TEXT NOT NULL
);
CREATE TABLE qr_card_senses (
  card_id INTEGER NOT NULL REFERENCES cards(id),
  sense_id TEXT NOT NULL REFERENCES qr_senses(id),
  PRIMARY KEY(card_id,sense_id)
);
CREATE INDEX qr_sense_cards ON qr_card_senses(sense_id,card_id);
CREATE TABLE qr_versions (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  parent_id TEXT REFERENCES qr_versions(id),
  version INTEGER NOT NULL CHECK(version>0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  sense_id TEXT NOT NULL REFERENCES qr_senses(id),
  type TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json) AND json_type(content_json)='object'),
  state TEXT NOT NULL CHECK(state IN ('draft','submitted','returned','approved')),
  author_id TEXT NOT NULL REFERENCES account_refs(id),
  author_kind TEXT NOT NULL DEFAULT 'human' CHECK(author_kind IN ('human','automatic')),
  generation_json TEXT CHECK(generation_json IS NULL OR (author_kind='automatic' AND json_valid(generation_json) AND json_type(generation_json)='object')),
  author_name TEXT NOT NULL,
  author_group TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES class_groups(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  created_date TEXT NOT NULL,
  submitted_date TEXT,
  reviewer_id TEXT REFERENCES account_refs(id),
  reviewer_name TEXT,
  approved_date TEXT,
  feedback TEXT NOT NULL DEFAULT '',
  UNIQUE(family_id,version),
  CHECK((state='approved' AND reviewer_id IS NOT NULL AND reviewer_name IS NOT NULL AND approved_date IS NOT NULL AND reviewer_id<>author_id)
    OR (state<>'approved' AND reviewer_id IS NULL AND reviewer_name IS NULL AND approved_date IS NULL))
);
CREATE INDEX qr_queue ON qr_versions(group_id,state,lesson_id,sense_id,type);
CREATE INDEX qr_shared ON qr_versions(sense_id,state,family_id,version);
CREATE TABLE qr_events (
  id TEXT PRIMARY KEY NOT NULL,
  version_id TEXT NOT NULL REFERENCES qr_versions(id),
  revision INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES account_refs(id),
  actor_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  UNIQUE(version_id,revision)
);
CREATE TRIGGER qr_approved_no_update BEFORE UPDATE ON qr_versions WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'Approved quiz versions are immutable'); END;
CREATE TRIGGER qr_generation_no_update BEFORE UPDATE OF generation_json ON qr_versions WHEN NEW.generation_json IS NOT OLD.generation_json
BEGIN SELECT RAISE(ABORT,'Generation provenance is immutable'); END;
CREATE TRIGGER qr_approved_no_delete BEFORE DELETE ON qr_versions WHEN OLD.state='approved'
BEGIN SELECT RAISE(ABORT,'Approved quiz versions are immutable'); END;
CREATE TRIGGER qr_event_no_update BEFORE UPDATE ON qr_events
BEGIN SELECT RAISE(ABORT,'Quiz history is append only'); END;
CREATE TRIGGER qr_event_no_delete BEFORE DELETE ON qr_events
BEGIN SELECT RAISE(ABORT,'Quiz history is append only'); END;
CREATE TRIGGER qr_sense_no_update BEFORE UPDATE ON qr_senses
BEGIN SELECT RAISE(ABORT,'Create a new sense instead of changing its identity'); END;
CREATE TRIGGER qr_sense_no_delete BEFORE DELETE ON qr_senses
BEGIN SELECT RAISE(ABORT,'Sense identity is immutable'); END;
