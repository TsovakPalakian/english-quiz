-- Draft phase 1: shared content and study data only. Authentication stays in D1.
-- Apply to a NEW staging database, never to the existing D1 database.
PRAGMA foreign_keys = ON;
BEGIN;

-- Trusted references to existing D1 IDs; no passwords or authorization roles.
CREATE TABLE account_refs (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE study_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE profile_members (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES account_refs(id),
  profile_id TEXT NOT NULL REFERENCES study_profiles(id)
);
CREATE INDEX profile_members_by_profile ON profile_members(profile_id);

CREATE TABLE lessons (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  lesson TEXT NOT NULL DEFAULT '',
  lesson_date TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX lessons_visible ON lessons(published, deleted_at, id);
CREATE TABLE lesson_access (
  account_id TEXT NOT NULL REFERENCES account_refs(id),
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  allow_hidden INTEGER NOT NULL DEFAULT 0 CHECK (allow_hidden IN (0, 1)),
  personal_hidden INTEGER NOT NULL DEFAULT 0 CHECK (personal_hidden IN (0, 1)),
  PRIMARY KEY (account_id, lesson_id)
);

-- IDs identify entities, not English spelling. Same spelling may have many meanings.
CREATE TABLE cards (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('shared', 'profile')),
  owner_profile_id TEXT REFERENCES study_profiles(id),
  en TEXT NOT NULL,
  word_key TEXT NOT NULL,
  ru TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_json) AND json_type(extra_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((scope = 'shared' AND owner_profile_id IS NULL) OR
         (scope = 'profile' AND owner_profile_id IS NOT NULL))
);
CREATE INDEX cards_by_word ON cards(word_key, deleted_at);
CREATE INDEX cards_by_owner ON cards(owner_profile_id, deleted_at);
CREATE TABLE lesson_blocks (
  lesson_id TEXT NOT NULL REFERENCES lessons(id),
  id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT '',
  card_id TEXT REFERENCES cards(id),
  content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  PRIMARY KEY (lesson_id, id)
);
CREATE INDEX lesson_blocks_order ON lesson_blocks(lesson_id, deleted_at, position);

-- Legacy quizzes are word-scoped, not card-scoped. Preserve that shared collection.
CREATE TABLE quiz_collections (
  id TEXT PRIMARY KEY NOT NULL,
  legacy_word_key TEXT UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE card_quiz_collections (
  card_id TEXT NOT NULL REFERENCES cards(id),
  collection_id TEXT NOT NULL REFERENCES quiz_collections(id),
  PRIMARY KEY (card_id, collection_id)
);
CREATE INDEX card_quiz_collections_reverse ON card_quiz_collections(collection_id);
CREATE TABLE quizzes (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES quiz_collections(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items_json) AND json_type(items_json) = 'array'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX quizzes_by_collection ON quizzes(collection_id, deleted_at, position);

CREATE TABLE profile_cards (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  place TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, card_id, place)
);
CREATE TABLE card_progress (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  learned INTEGER NOT NULL DEFAULT 0 CHECK (learned IN (0, 1)),
  variants_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(variants_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, card_id)
);
CREATE TABLE quiz_progress (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  card_id TEXT NOT NULL REFERENCES cards(id),
  quiz_type TEXT NOT NULL,
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, card_id, quiz_type)
);
CREATE TABLE lesson_responses (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  lesson_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, lesson_id, block_id),
  FOREIGN KEY (lesson_id, block_id) REFERENCES lesson_blocks(lesson_id, id)
);

-- Text/song metadata and R2 references only; never binary media.
CREATE TABLE library_items (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'song')),
  scope TEXT NOT NULL CHECK (scope IN ('shared', 'profile')),
  owner_profile_id TEXT REFERENCES study_profiles(id),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  media_key TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  CHECK ((scope = 'shared' AND owner_profile_id IS NULL) OR
         (scope = 'profile' AND owner_profile_id IS NOT NULL))
);
CREATE INDEX library_items_by_owner ON library_items(owner_profile_id, kind, deleted_at);
CREATE TABLE profile_library_items (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  item_id TEXT NOT NULL REFERENCES library_items(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, item_id)
);
CREATE TABLE account_settings (
  account_id TEXT NOT NULL REFERENCES account_refs(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (account_id, key)
);
CREATE TABLE profile_settings (
  profile_id TEXT NOT NULL REFERENCES study_profiles(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (profile_id, key)
);

-- Import audit trail and stable translations of legacy word/index identities.
CREATE TABLE migration_runs (
  id TEXT PRIMARY KEY NOT NULL,
  source_manifest_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('importing', 'verified', 'failed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE legacy_ids (
  entity_kind TEXT NOT NULL,
  source_namespace TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_id TEXT NOT NULL,
  migration_id TEXT NOT NULL REFERENCES migration_runs(id),
  PRIMARY KEY (entity_kind, source_namespace, source_key, target_id)
);
CREATE INDEX legacy_ids_by_target ON legacy_ids(entity_kind, target_id);
-- Application must validate polymorphic target_id against the entity table.
CREATE TABLE operation_receipts (
  account_id TEXT NOT NULL REFERENCES account_refs(id),
  mutation_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, mutation_id)
);
CREATE INDEX operation_receipts_expiry ON operation_receipts(expires_at);
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO schema_migrations(version) VALUES (1);
COMMIT;
