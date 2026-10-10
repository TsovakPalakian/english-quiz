-- Own entity ids become database-assigned positive integers.
-- Account ids, mutation ids, catalog keys, places and quiz types stay text.
-- Requires migrations 001 through 005. JSON rewrite follows in
-- scripts/migrate-turso-integer-ids.mjs and can resume from entity_id_legacy.
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE entity_id_legacy (
  entity_kind TEXT NOT NULL,
  old_id TEXT NOT NULL,
  new_id INTEGER NOT NULL CHECK (new_id > 0),
  PRIMARY KEY (entity_kind, old_id),
  UNIQUE (entity_kind, new_id)
);
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'profile', id, row_number() OVER (ORDER BY id) FROM study_profiles;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'lesson', id, row_number() OVER (ORDER BY id) FROM lessons;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'card', id, row_number() OVER (ORDER BY id) FROM cards;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'quiz_collection', id, row_number() OVER (ORDER BY id) FROM quiz_collections;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'quiz', id, row_number() OVER (ORDER BY id) FROM quizzes;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'library', id, row_number() OVER (ORDER BY id) FROM library_items;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'lesson_block', lesson_id || char(31) || id, row_number() OVER (ORDER BY lesson_id, id) FROM lesson_blocks;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'exam', id, row_number() OVER (ORDER BY id) FROM exams;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'exam_block', exam_id || char(31) || id, row_number() OVER (ORDER BY exam_id, id) FROM exam_blocks;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'exam_material', exam_id || char(31) || block_id || char(31) || id, row_number() OVER (ORDER BY exam_id, block_id, id) FROM exam_materials;
INSERT INTO entity_id_legacy(entity_kind, old_id, new_id)
SELECT 'group', id, row_number() OVER (ORDER BY id) FROM class_groups;

CREATE TABLE study_profiles_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO study_profiles_v6(id, kind, created_at)
SELECT m.new_id, p.kind, p.created_at
FROM study_profiles p JOIN entity_id_legacy m ON m.entity_kind='profile' AND m.old_id=p.id;

CREATE TABLE lessons_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
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
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  extra_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_json) AND json_type(extra_json) = 'object')
);
INSERT INTO lessons_v6(id, title, description, class_name, unit, lesson, lesson_date, mode, published, hidden_from_students, revision, deleted_at, created_at, updated_at, extra_json)
SELECT m.new_id, l.title, l.description, l.class_name, l.unit, l.lesson, l.lesson_date, l.mode, l.published, l.hidden_from_students, l.revision, l.deleted_at, l.created_at, l.updated_at, l.extra_json
FROM lessons l JOIN entity_id_legacy m ON m.entity_kind='lesson' AND m.old_id=l.id;

CREATE TABLE cards_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  scope TEXT NOT NULL CHECK (scope IN ('shared', 'profile')),
  owner_profile_id INTEGER REFERENCES study_profiles_v6(id),
  en TEXT NOT NULL,
  word_key TEXT NOT NULL,
  ru TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  extra_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_json) AND json_type(extra_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK ((scope = 'shared' AND owner_profile_id IS NULL) OR (scope = 'profile' AND owner_profile_id IS NOT NULL))
);
INSERT INTO cards_v6(id, scope, owner_profile_id, en, word_key, ru, part_of_speech, extra_json, revision, deleted_at, created_at, updated_at)
SELECT cnew.new_id, c.scope, pnew.new_id, c.en, c.word_key, c.ru, c.part_of_speech, c.extra_json, c.revision, c.deleted_at, c.created_at, c.updated_at
FROM cards c
JOIN entity_id_legacy cnew ON cnew.entity_kind='card' AND cnew.old_id=c.id
LEFT JOIN entity_id_legacy pnew ON pnew.entity_kind='profile' AND pnew.old_id=c.owner_profile_id;

CREATE TABLE quiz_collections_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  legacy_word_key TEXT UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
);
INSERT INTO quiz_collections_v6(id, legacy_word_key, revision)
SELECT m.new_id, q.legacy_word_key, q.revision
FROM quiz_collections q JOIN entity_id_legacy m ON m.entity_kind='quiz_collection' AND m.old_id=q.id;

CREATE TABLE quizzes_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  collection_id INTEGER NOT NULL REFERENCES quiz_collections_v6(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  items_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items_json) AND json_type(items_json) = 'array'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO quizzes_v6(id, collection_id, position, type, items_json, revision, deleted_at, updated_at)
SELECT qnew.new_id, cnew.new_id, q.position, q.type, q.items_json, q.revision, q.deleted_at, q.updated_at
FROM quizzes q
JOIN entity_id_legacy qnew ON qnew.entity_kind='quiz' AND qnew.old_id=q.id
JOIN entity_id_legacy cnew ON cnew.entity_kind='quiz_collection' AND cnew.old_id=q.collection_id;

CREATE TABLE library_items_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  kind TEXT NOT NULL CHECK (kind IN ('text', 'song')),
  scope TEXT NOT NULL CHECK (scope IN ('shared', 'profile')),
  owner_profile_id INTEGER REFERENCES study_profiles_v6(id),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  media_key TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  CHECK ((scope = 'shared' AND owner_profile_id IS NULL) OR (scope = 'profile' AND owner_profile_id IS NOT NULL))
);
INSERT INTO library_items_v6(id, kind, scope, owner_profile_id, content_json, media_key, revision, deleted_at)
SELECT m.new_id, l.kind, l.scope, p.new_id, l.content_json, l.media_key, l.revision, l.deleted_at
FROM library_items l
JOIN entity_id_legacy m ON m.entity_kind='library' AND m.old_id=l.id
LEFT JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=l.owner_profile_id;

CREATE TABLE exams_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  title TEXT NOT NULL DEFAULT 'Exam',
  lesson_date TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO exams_v6(id, title, lesson_date, published, hidden_from_students, revision, deleted_at, created_at, updated_at)
SELECT m.new_id, e.title, e.lesson_date, e.published, e.hidden_from_students, e.revision, e.deleted_at, e.created_at, e.updated_at
FROM exams e JOIN entity_id_legacy m ON m.entity_kind='exam' AND m.old_id=e.id;

CREATE TABLE class_groups_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  title TEXT NOT NULL,
  lesson_date TEXT NOT NULL DEFAULT '',
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO class_groups_v6(id, title, lesson_date, hidden_from_students, position, revision, deleted_at, created_at, updated_at)
SELECT m.new_id, g.title, g.lesson_date, g.hidden_from_students, g.position, g.revision, g.deleted_at, g.created_at, g.updated_at
FROM class_groups g JOIN entity_id_legacy m ON m.entity_kind='group' AND m.old_id=g.id;

CREATE TABLE lesson_blocks_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  lesson_id INTEGER NOT NULL REFERENCES lessons_v6(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT '',
  card_id INTEGER REFERENCES cards_v6(id),
  content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
INSERT INTO lesson_blocks_v6(id, lesson_id, position, type, tab, card_id, content_json, revision, deleted_at)
SELECT bnew.new_id, lnew.new_id, b.position, b.type, b.tab, cnew.new_id, b.content_json, b.revision, b.deleted_at
FROM lesson_blocks b
JOIN entity_id_legacy bnew ON bnew.entity_kind='lesson_block' AND bnew.old_id=b.lesson_id || char(31) || b.id
JOIN entity_id_legacy lnew ON lnew.entity_kind='lesson' AND lnew.old_id=b.lesson_id
LEFT JOIN entity_id_legacy cnew ON cnew.entity_kind='card' AND cnew.old_id=b.card_id;

CREATE TABLE exam_blocks_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  exam_id INTEGER NOT NULL REFERENCES exams_v6(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  title TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
INSERT INTO exam_blocks_v6(id, exam_id, position, title, published, hidden_from_students, revision, deleted_at)
SELECT bnew.new_id, enew.new_id, b.position, b.title, b.published, b.hidden_from_students, b.revision, b.deleted_at
FROM exam_blocks b
JOIN entity_id_legacy bnew ON bnew.entity_kind='exam_block' AND bnew.old_id=b.exam_id || char(31) || b.id
JOIN entity_id_legacy enew ON enew.entity_kind='exam' AND enew.old_id=b.exam_id;

CREATE TABLE exam_materials_v6 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  exam_id INTEGER NOT NULL,
  block_id INTEGER NOT NULL REFERENCES exam_blocks_v6(id),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER
);
INSERT INTO exam_materials_v6(id, exam_id, block_id, position, type, tab, content_json, revision, deleted_at)
SELECT m.new_id, enew.new_id, bnew.new_id, x.position, x.type, x.tab, x.content_json, x.revision, x.deleted_at
FROM exam_materials x
JOIN entity_id_legacy m ON m.entity_kind='exam_material' AND m.old_id=x.exam_id || char(31) || x.block_id || char(31) || x.id
JOIN entity_id_legacy enew ON enew.entity_kind='exam' AND enew.old_id=x.exam_id
JOIN entity_id_legacy bnew ON bnew.entity_kind='exam_block' AND bnew.old_id=x.exam_id || char(31) || x.block_id;

CREATE TABLE exam_work_v6 (
  account_id TEXT NOT NULL,
  exam_id INTEGER NOT NULL REFERENCES exams_v6(id),
  block_id INTEGER NOT NULL REFERENCES exam_blocks_v6(id),
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json) AND json_type(answers_json) = 'object'),
  corrections_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(corrections_json) AND json_type(corrections_json) = 'object'),
  points_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(points_json) AND json_type(points_json) = 'object'),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, exam_id, block_id)
);
INSERT INTO exam_work_v6(account_id, exam_id, block_id, saved, answers_json, corrections_json, points_json, updated_at)
SELECT w.account_id, enew.new_id, bnew.new_id, w.saved, w.answers_json, w.corrections_json, w.points_json, w.updated_at
FROM exam_work w
JOIN entity_id_legacy enew ON enew.entity_kind='exam' AND enew.old_id=w.exam_id
JOIN entity_id_legacy bnew ON bnew.entity_kind='exam_block' AND bnew.old_id=w.exam_id || char(31) || w.block_id;

CREATE TABLE profile_members_v6 (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES account_refs(id),
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id)
);
INSERT INTO profile_members_v6(account_id, profile_id)
SELECT p.account_id, m.new_id FROM profile_members p
JOIN entity_id_legacy m ON m.entity_kind='profile' AND m.old_id=p.profile_id;

CREATE TABLE lesson_access_v6 (
  account_id TEXT NOT NULL REFERENCES account_refs(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons_v6(id),
  allow_hidden INTEGER NOT NULL DEFAULT 0 CHECK (allow_hidden IN (0, 1)),
  personal_hidden INTEGER NOT NULL DEFAULT 0 CHECK (personal_hidden IN (0, 1)),
  PRIMARY KEY (account_id, lesson_id)
);
INSERT INTO lesson_access_v6(account_id, lesson_id, allow_hidden, personal_hidden)
SELECT a.account_id, m.new_id, a.allow_hidden, a.personal_hidden FROM lesson_access a
JOIN entity_id_legacy m ON m.entity_kind='lesson' AND m.old_id=a.lesson_id;

CREATE TABLE card_quiz_collections_v6 (
  card_id INTEGER NOT NULL REFERENCES cards_v6(id),
  collection_id INTEGER NOT NULL REFERENCES quiz_collections_v6(id),
  PRIMARY KEY (card_id, collection_id)
);
INSERT INTO card_quiz_collections_v6(card_id, collection_id)
SELECT c.new_id, q.new_id FROM card_quiz_collections x
JOIN entity_id_legacy c ON c.entity_kind='card' AND c.old_id=x.card_id
JOIN entity_id_legacy q ON q.entity_kind='quiz_collection' AND q.old_id=x.collection_id;

CREATE TABLE profile_cards_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  card_id INTEGER NOT NULL REFERENCES cards_v6(id),
  place TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, card_id, place)
);
INSERT INTO profile_cards_v6(profile_id, card_id, place, position)
SELECT p.new_id, c.new_id, x.place, x.position FROM profile_cards x
JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=x.profile_id
JOIN entity_id_legacy c ON c.entity_kind='card' AND c.old_id=x.card_id;

CREATE TABLE card_progress_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  card_id INTEGER NOT NULL REFERENCES cards_v6(id),
  learned INTEGER NOT NULL DEFAULT 0 CHECK (learned IN (0, 1)),
  variants_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(variants_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, card_id)
);
INSERT INTO card_progress_v6(profile_id, card_id, learned, variants_json, revision, updated_at)
SELECT p.new_id, c.new_id, x.learned, x.variants_json, x.revision, x.updated_at FROM card_progress x
JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=x.profile_id
JOIN entity_id_legacy c ON c.entity_kind='card' AND c.old_id=x.card_id;

CREATE TABLE quiz_progress_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  card_id INTEGER NOT NULL REFERENCES cards_v6(id),
  quiz_type TEXT NOT NULL,
  progress_json TEXT NOT NULL CHECK (json_valid(progress_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, card_id, quiz_type)
);
INSERT INTO quiz_progress_v6(profile_id, card_id, quiz_type, progress_json, revision, updated_at)
SELECT p.new_id, c.new_id, x.quiz_type, x.progress_json, x.revision, x.updated_at FROM quiz_progress x
JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=x.profile_id
JOIN entity_id_legacy c ON c.entity_kind='card' AND c.old_id=x.card_id;

CREATE TABLE lesson_responses_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons_v6(id),
  block_id INTEGER NOT NULL REFERENCES lesson_blocks_v6(id),
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (profile_id, lesson_id, block_id)
);
INSERT INTO lesson_responses_v6(profile_id, lesson_id, block_id, response_json, revision, updated_at)
SELECT p.new_id, l.new_id, b.new_id, x.response_json, x.revision, x.updated_at FROM lesson_responses x
JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=x.profile_id
JOIN entity_id_legacy l ON l.entity_kind='lesson' AND l.old_id=x.lesson_id
JOIN entity_id_legacy b ON b.entity_kind='lesson_block' AND b.old_id=x.lesson_id || char(31) || x.block_id;

CREATE TABLE profile_library_items_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  item_id INTEGER NOT NULL REFERENCES library_items_v6(id),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id, item_id)
);
INSERT INTO profile_library_items_v6(profile_id, item_id, position)
SELECT p.new_id, i.new_id, x.position FROM profile_library_items x
JOIN entity_id_legacy p ON p.entity_kind='profile' AND p.old_id=x.profile_id
JOIN entity_id_legacy i ON i.entity_kind='library' AND i.old_id=x.item_id;

CREATE TABLE profile_settings_v6 (
  profile_id INTEGER NOT NULL REFERENCES study_profiles_v6(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (profile_id, key)
);
INSERT INTO profile_settings_v6(profile_id, key, value_json, revision)
SELECT m.new_id, s.key, s.value_json, s.revision FROM profile_settings s
JOIN entity_id_legacy m ON m.entity_kind='profile' AND m.old_id=s.profile_id;

CREATE TABLE class_group_lessons_v6 (
  group_id INTEGER NOT NULL REFERENCES class_groups_v6(id),
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons_v6(id),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (group_id, lesson_id)
);
INSERT INTO class_group_lessons_v6(group_id, lesson_id, position)
SELECT g.new_id, l.new_id, x.position FROM class_group_lessons x
JOIN entity_id_legacy g ON g.entity_kind='group' AND g.old_id=x.group_id
JOIN entity_id_legacy l ON l.entity_kind='lesson' AND l.old_id=x.lesson_id;

CREATE TEMP TABLE migration_guard(ok INTEGER NOT NULL CHECK (ok = 1));
INSERT INTO migration_guard
SELECT
  (SELECT count(*) FROM study_profiles)=(SELECT count(*) FROM study_profiles_v6)
  AND (SELECT count(*) FROM lessons)=(SELECT count(*) FROM lessons_v6)
  AND (SELECT count(*) FROM cards)=(SELECT count(*) FROM cards_v6)
  AND (SELECT count(*) FROM quiz_collections)=(SELECT count(*) FROM quiz_collections_v6)
  AND (SELECT count(*) FROM quizzes)=(SELECT count(*) FROM quizzes_v6)
  AND (SELECT count(*) FROM library_items)=(SELECT count(*) FROM library_items_v6)
  AND (SELECT count(*) FROM lesson_blocks)=(SELECT count(*) FROM lesson_blocks_v6)
  AND (SELECT count(*) FROM exams)=(SELECT count(*) FROM exams_v6)
  AND (SELECT count(*) FROM exam_blocks)=(SELECT count(*) FROM exam_blocks_v6)
  AND (SELECT count(*) FROM exam_materials)=(SELECT count(*) FROM exam_materials_v6)
  AND (SELECT count(*) FROM exam_work)=(SELECT count(*) FROM exam_work_v6)
  AND (SELECT count(*) FROM class_groups)=(SELECT count(*) FROM class_groups_v6)
  AND (SELECT count(*) FROM class_group_lessons)=(SELECT count(*) FROM class_group_lessons_v6)
  AND (SELECT count(*) FROM profile_members)=(SELECT count(*) FROM profile_members_v6)
  AND (SELECT count(*) FROM lesson_access)=(SELECT count(*) FROM lesson_access_v6)
  AND (SELECT count(*) FROM card_quiz_collections)=(SELECT count(*) FROM card_quiz_collections_v6)
  AND (SELECT count(*) FROM profile_cards)=(SELECT count(*) FROM profile_cards_v6)
  AND (SELECT count(*) FROM card_progress)=(SELECT count(*) FROM card_progress_v6)
  AND (SELECT count(*) FROM quiz_progress)=(SELECT count(*) FROM quiz_progress_v6)
  AND (SELECT count(*) FROM lesson_responses)=(SELECT count(*) FROM lesson_responses_v6)
  AND (SELECT count(*) FROM profile_library_items)=(SELECT count(*) FROM profile_library_items_v6)
  AND (SELECT count(*) FROM profile_settings)=(SELECT count(*) FROM profile_settings_v6)
  AND NOT EXISTS(SELECT 1 FROM cards c WHERE c.owner_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_id_legacy m WHERE m.entity_kind='profile' AND m.old_id=c.owner_profile_id))
  AND NOT EXISTS(SELECT 1 FROM lesson_blocks b WHERE b.card_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM entity_id_legacy m WHERE m.entity_kind='card' AND m.old_id=b.card_id));

UPDATE legacy_ids SET target_id=(
  SELECT printf('%d', m.new_id) FROM entity_id_legacy m
  WHERE m.old_id=legacy_ids.target_id AND m.entity_kind=CASE legacy_ids.entity_kind
    WHEN 'added-card' THEN 'card' WHEN 'text' THEN 'library' WHEN 'song' THEN 'library'
    ELSE legacy_ids.entity_kind END
)
WHERE EXISTS(
  SELECT 1 FROM entity_id_legacy m
  WHERE m.old_id=legacy_ids.target_id AND m.entity_kind=CASE legacy_ids.entity_kind
    WHEN 'added-card' THEN 'card' WHEN 'text' THEN 'library' WHEN 'song' THEN 'library'
    ELSE legacy_ids.entity_kind END
);

DELETE FROM operation_receipts;

DROP TABLE class_group_lessons;
DROP TABLE class_groups;
DROP TABLE exam_work;
DROP TABLE exam_materials;
DROP TABLE exam_blocks;
DROP TABLE exams;
DROP TABLE lesson_responses;
DROP TABLE quiz_progress;
DROP TABLE card_progress;
DROP TABLE profile_cards;
DROP TABLE card_quiz_collections;
DROP TABLE profile_library_items;
DROP TABLE profile_settings;
DROP TABLE lesson_access;
DROP TABLE profile_members;
DROP TABLE lesson_blocks;
DROP TABLE quizzes;
DROP TABLE quiz_collections;
DROP TABLE library_items;
DROP TABLE cards;
DROP TABLE lessons;
DROP TABLE study_profiles;

ALTER TABLE study_profiles_v6 RENAME TO study_profiles;
ALTER TABLE lessons_v6 RENAME TO lessons;
ALTER TABLE cards_v6 RENAME TO cards;
ALTER TABLE quiz_collections_v6 RENAME TO quiz_collections;
ALTER TABLE quizzes_v6 RENAME TO quizzes;
ALTER TABLE library_items_v6 RENAME TO library_items;
ALTER TABLE exams_v6 RENAME TO exams;
ALTER TABLE class_groups_v6 RENAME TO class_groups;
ALTER TABLE lesson_blocks_v6 RENAME TO lesson_blocks;
ALTER TABLE exam_blocks_v6 RENAME TO exam_blocks;
ALTER TABLE exam_materials_v6 RENAME TO exam_materials;
ALTER TABLE exam_work_v6 RENAME TO exam_work;
ALTER TABLE profile_members_v6 RENAME TO profile_members;
ALTER TABLE lesson_access_v6 RENAME TO lesson_access;
ALTER TABLE card_quiz_collections_v6 RENAME TO card_quiz_collections;
ALTER TABLE profile_cards_v6 RENAME TO profile_cards;
ALTER TABLE card_progress_v6 RENAME TO card_progress;
ALTER TABLE quiz_progress_v6 RENAME TO quiz_progress;
ALTER TABLE lesson_responses_v6 RENAME TO lesson_responses;
ALTER TABLE profile_library_items_v6 RENAME TO profile_library_items;
ALTER TABLE profile_settings_v6 RENAME TO profile_settings;
ALTER TABLE class_group_lessons_v6 RENAME TO class_group_lessons;

CREATE INDEX profile_members_by_profile ON profile_members(profile_id);
CREATE INDEX lessons_visible ON lessons(published, deleted_at, id);
CREATE INDEX cards_by_word ON cards(word_key, deleted_at);
CREATE INDEX cards_by_owner ON cards(owner_profile_id, deleted_at);
CREATE INDEX lesson_blocks_order ON lesson_blocks(lesson_id, deleted_at, position);
CREATE INDEX card_quiz_collections_reverse ON card_quiz_collections(collection_id);
CREATE INDEX quizzes_by_collection ON quizzes(collection_id, deleted_at, position);
CREATE INDEX library_items_by_owner ON library_items(owner_profile_id, kind, deleted_at);
CREATE INDEX exams_visible ON exams(published, deleted_at, id);
CREATE INDEX exam_blocks_order ON exam_blocks(exam_id, deleted_at, position);
CREATE INDEX exam_materials_order ON exam_materials(exam_id, block_id, deleted_at, position);

CREATE TABLE entity_json_progress (
  source TEXT NOT NULL,
  row_key TEXT NOT NULL,
  PRIMARY KEY (source, row_key)
);

DROP TABLE migration_guard;
INSERT INTO schema_migrations(version) VALUES (6);
COMMIT;
PRAGMA foreign_keys = ON;
