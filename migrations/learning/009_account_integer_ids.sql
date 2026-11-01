-- Migration 009: Convert Study Database (STUDY_DB) account references to integers.
-- Requires table legacy_account_ids (old_id TEXT PRIMARY KEY, new_id INTEGER UNIQUE) populated from account database migration.

PRAGMA foreign_keys = OFF;

-- 1. account_refs
CREATE TABLE IF NOT EXISTS account_refs_v9 (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO account_refs_v9(id, created_at)
SELECT m.new_id, a.created_at
FROM account_refs a
JOIN legacy_account_ids m ON m.old_id = a.id;

-- 2. profile_members
CREATE TABLE IF NOT EXISTS profile_members_v9 (
  account_id INTEGER PRIMARY KEY NOT NULL REFERENCES account_refs_v9(id),
  profile_id INTEGER NOT NULL REFERENCES study_profiles(id)
);
INSERT OR IGNORE INTO profile_members_v9(account_id, profile_id)
SELECT m.new_id, p.profile_id
FROM profile_members p
JOIN legacy_account_ids m ON m.old_id = p.account_id;

-- 3. account_settings
CREATE TABLE IF NOT EXISTS account_settings_v9 (
  account_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (account_id, key)
);
INSERT OR IGNORE INTO account_settings_v9(account_id, key, value_json, revision)
SELECT m.new_id, s.key, s.value_json, s.revision
FROM account_settings s
JOIN legacy_account_ids m ON m.old_id = s.account_id;

-- 4. lesson_access
CREATE TABLE IF NOT EXISTS lesson_access_v9 (
  account_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  allow_hidden INTEGER NOT NULL DEFAULT 0 CHECK (allow_hidden IN (0, 1)),
  personal_hidden INTEGER NOT NULL DEFAULT 0 CHECK (personal_hidden IN (0, 1)),
  PRIMARY KEY (account_id, lesson_id)
);
INSERT OR IGNORE INTO lesson_access_v9(account_id, lesson_id, allow_hidden, personal_hidden)
SELECT m.new_id, a.lesson_id, a.allow_hidden, a.personal_hidden
FROM lesson_access a
JOIN legacy_account_ids m ON m.old_id = a.account_id;

-- 5. operation_receipts
CREATE TABLE IF NOT EXISTS operation_receipts_v9 (
  account_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  mutation_id TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, mutation_id)
);
INSERT OR IGNORE INTO operation_receipts_v9(account_id, mutation_id, request_sha256, result_json, expires_at)
SELECT m.new_id, r.mutation_id, r.request_sha256, r.result_json, r.expires_at
FROM operation_receipts r
JOIN legacy_account_ids m ON m.old_id = r.account_id;

-- 6. class_group_students
CREATE TABLE IF NOT EXISTS class_group_students_v9 (
  account_id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES class_groups(id),
  assigned_by INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO class_group_students_v9(account_id, group_id, assigned_by, updated_at)
SELECT sm.new_id, c.group_id, COALESCE(am.new_id, CAST(c.assigned_by AS INTEGER)), c.updated_at
FROM class_group_students c
JOIN legacy_account_ids sm ON sm.old_id = c.account_id
LEFT JOIN legacy_account_ids am ON am.old_id = c.assigned_by;

-- 7. exam_work
CREATE TABLE IF NOT EXISTS exam_work_v9 (
  account_id INTEGER NOT NULL,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  block_id INTEGER NOT NULL REFERENCES exam_blocks(id),
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json) AND json_type(answers_json) = 'object'),
  corrections_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(corrections_json) AND json_type(corrections_json) = 'object'),
  points_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(points_json) AND json_type(points_json) = 'object'),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, exam_id, block_id)
);
INSERT OR IGNORE INTO exam_work_v9(account_id, exam_id, block_id, saved, answers_json, corrections_json, points_json, updated_at)
SELECT m.new_id, w.exam_id, w.block_id, w.saved, w.answers_json, w.corrections_json, w.points_json, w.updated_at
FROM exam_work w
JOIN legacy_account_ids m ON m.old_id = w.account_id;

-- 8. exam_instances
CREATE TABLE IF NOT EXISTS exam_instances_v9 (
  exam_id INTEGER PRIMARY KEY REFERENCES exams(id),
  source_exam_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  assignment_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  group_id INTEGER,
  group_title TEXT NOT NULL DEFAULT '',
  reviewer_id INTEGER,
  reviewer_name TEXT NOT NULL DEFAULT 'Teacher',
  student_name TEXT NOT NULL DEFAULT '',
  student_email TEXT NOT NULL DEFAULT '',
  assigned_at INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  max_points REAL,
  earned_points REAL,
  UNIQUE(assignment_id, account_id)
);
INSERT OR IGNORE INTO exam_instances_v9(
  exam_id, source_exam_id, account_id, assignment_id, active, status,
  group_id, group_title, reviewer_id, reviewer_name, student_name,
  student_email, assigned_at, completed_at, max_points, earned_points
)
SELECT
  i.exam_id, i.source_exam_id, COALESCE(sm.new_id, CAST(i.account_id AS INTEGER)),
  i.assignment_id, i.active, i.status, i.group_id, i.group_title,
  rm.new_id, i.reviewer_name, i.student_name, i.student_email,
  i.assigned_at, i.completed_at, i.max_points, i.earned_points
FROM exam_instances i
LEFT JOIN legacy_account_ids sm ON sm.old_id = i.account_id
LEFT JOIN legacy_account_ids rm ON rm.old_id = i.reviewer_id;

-- 9. exam_reviewer_hides
CREATE TABLE IF NOT EXISTS exam_reviewer_hides_v9 (
  account_id INTEGER NOT NULL,
  exam_id INTEGER NOT NULL,
  PRIMARY KEY(account_id, exam_id)
);
INSERT OR IGNORE INTO exam_reviewer_hides_v9(account_id, exam_id)
SELECT m.new_id, h.exam_id
FROM exam_reviewer_hides h
JOIN legacy_account_ids m ON m.old_id = h.account_id;

-- 10. assessment_work
CREATE TABLE IF NOT EXISTS assessment_work_v9 (
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  material_id INTEGER NOT NULL,
  exam_id INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'draft',
  answers_json TEXT NOT NULL DEFAULT '{}',
  grading_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(account_id, kind, material_id)
);
INSERT OR IGNORE INTO assessment_work_v9(
  account_id, kind, material_id, exam_id, revision, state,
  answers_json, grading_json, snapshot_json, updated_at
)
SELECT
  m.new_id, w.kind, w.material_id, w.exam_id, w.revision, w.state,
  w.answers_json, w.grading_json, w.snapshot_json, w.updated_at
FROM assessment_work w
JOIN legacy_account_ids m ON m.old_id = w.account_id;

-- 11. assessment_history
CREATE TABLE IF NOT EXISTS assessment_history_v9 (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  material_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO assessment_history_v9(
  id, account_id, kind, material_id, actor_id, action, reason, snapshot_json, created_at
)
SELECT
  h.id, sm.new_id, h.kind, h.material_id, COALESCE(am.new_id, CAST(h.actor_id AS INTEGER)),
  h.action, h.reason, h.snapshot_json, h.created_at
FROM assessment_history h
JOIN legacy_account_ids sm ON sm.old_id = h.account_id
LEFT JOIN legacy_account_ids am ON am.old_id = h.actor_id;

-- 12. assessment_recordings
CREATE TABLE IF NOT EXISTS assessment_recordings_v9 (
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  material_id INTEGER NOT NULL,
  part_id INTEGER NOT NULL,
  question_index INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY(account_id, kind, material_id, part_id, question_index)
);
INSERT OR IGNORE INTO assessment_recordings_v9(
  account_id, kind, material_id, part_id, question_index, object_key, mime, bytes
)
SELECT
  m.new_id, r.kind, r.material_id, r.part_id, r.question_index, r.object_key, r.mime, r.bytes
FROM assessment_recordings r
JOIN legacy_account_ids m ON m.old_id = r.account_id;

-- 13. account_error_items
CREATE TABLE IF NOT EXISTS account_error_items_v9 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  material_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  part_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  expected_answer TEXT NOT NULL DEFAULT '',
  given_answer TEXT NOT NULL DEFAULT '',
  error_tag TEXT NOT NULL DEFAULT 'grammar',
  error_category TEXT NOT NULL DEFAULT '',
  diagnostic_note TEXT NOT NULL DEFAULT '',
  stage INTEGER NOT NULL DEFAULT 1,
  interval_days INTEGER NOT NULL DEFAULT 1,
  next_review_at INTEGER NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 1,
  success_streak INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  stability REAL NOT NULL DEFAULT 0.0,
  difficulty REAL NOT NULL DEFAULT 0.0,
  retrievability REAL NOT NULL DEFAULT 0.0,
  last_reviewed_at INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(account_id, kind, material_id, part_id, question_index)
);
INSERT OR IGNORE INTO account_error_items_v9(
  id, account_id, material_id, kind, part_id, question_index, prompt,
  expected_answer, given_answer, error_tag, error_category, diagnostic_note,
  stage, interval_days, next_review_at, error_count, success_streak,
  status, stability, difficulty, retrievability, last_reviewed_at, reps,
  lapses, latency_ms, created_at, updated_at
)
SELECT
  e.id, m.new_id, e.material_id, e.kind, e.part_id, e.question_index, e.prompt,
  e.expected_answer, e.given_answer, e.error_tag, e.error_category, e.diagnostic_note,
  e.stage, e.interval_days, e.next_review_at, e.error_count, e.success_streak,
  e.status, e.stability, e.difficulty, e.retrievability, e.last_reviewed_at, e.reps,
  e.lapses, e.latency_ms, e.created_at, e.updated_at
FROM account_error_items e
JOIN legacy_account_ids m ON m.old_id = e.account_id;

-- 14. speakout_answers
CREATE TABLE IF NOT EXISTS speakout_answers_v9 (
  account_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  unit_index INTEGER NOT NULL,
  lesson_index INTEGER NOT NULL,
  definition_revision INTEGER NOT NULL,
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),
  PRIMARY KEY(account_id, level, unit_index, lesson_index)
);
INSERT OR IGNORE INTO speakout_answers_v9(account_id, level, unit_index, lesson_index, definition_revision, answers_json)
SELECT m.new_id, a.level, a.unit_index, a.lesson_index, a.definition_revision, a.answers_json
FROM speakout_answers a
JOIN legacy_account_ids m ON m.old_id = a.account_id;

-- 15. account_archives
CREATE TABLE IF NOT EXISTS account_archives_v9 (
  account_id INTEGER PRIMARY KEY,
  archived_by INTEGER NOT NULL,
  archived_by_name TEXT NOT NULL,
  title TEXT NOT NULL,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  hidden_at INTEGER,
  original_active INTEGER NOT NULL,
  original_hidden INTEGER NOT NULL,
  purge_started_at INTEGER
);
INSERT OR IGNORE INTO account_archives_v9(
  account_id, archived_by, archived_by_name, title, login, email,
  archived_at, hidden_at, original_active, original_hidden, purge_started_at
)
SELECT
  sm.new_id, COALESCE(bm.new_id, CAST(a.archived_by AS INTEGER)), a.archived_by_name,
  a.title, a.login, a.email, a.archived_at, a.hidden_at, a.original_active,
  a.original_hidden, a.purge_started_at
FROM account_archives a
JOIN legacy_account_ids sm ON sm.old_id = a.account_id
LEFT JOIN legacy_account_ids bm ON bm.old_id = a.archived_by;

-- 16. content_archive
CREATE TABLE IF NOT EXISTS content_archive_v9 (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  archived_by INTEGER NOT NULL,
  archived_by_name TEXT NOT NULL DEFAULT '',
  archived_by_role TEXT NOT NULL DEFAULT 'ADMIN',
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  teacher_hidden_at INTEGER,
  teacher_hidden_by INTEGER,
  PRIMARY KEY(entity_type, entity_id)
);
INSERT OR IGNORE INTO content_archive_v9(
  entity_type, entity_id, title, archived_by, archived_by_name,
  archived_by_role, archived_at, teacher_hidden_at, teacher_hidden_by
)
SELECT
  c.entity_type, c.entity_id, c.title, COALESCE(am.new_id, CAST(c.archived_by AS INTEGER)),
  c.archived_by_name, c.archived_by_role, c.archived_at, c.teacher_hidden_at,
  hm.new_id
FROM content_archive c
LEFT JOIN legacy_account_ids am ON am.old_id = c.archived_by
LEFT JOIN legacy_account_ids hm ON hm.old_id = c.teacher_hidden_by;

-- 17. chat_send_budget
CREATE TABLE IF NOT EXISTS chat_send_budget_v9 (
  account_id INTEGER PRIMARY KEY,
  window_start INTEGER NOT NULL,
  n INTEGER NOT NULL
);
INSERT OR IGNORE INTO chat_send_budget_v9(account_id, window_start, n)
SELECT m.new_id, b.window_start, b.n
FROM chat_send_budget b
JOIN legacy_account_ids m ON m.old_id = b.account_id;

-- 18. chat_mutations
CREATE TABLE IF NOT EXISTS chat_mutations_v9 (
  actor_id INTEGER NOT NULL,
  client_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(actor_id, client_key)
);
INSERT OR IGNORE INTO chat_mutations_v9(actor_id, client_key, result_json, payload_json)
SELECT COALESCE(m.new_id, CAST(u.actor_id AS INTEGER)), u.client_key, u.result_json, u.payload_json
FROM chat_mutations u
LEFT JOIN legacy_account_ids m ON m.old_id = u.actor_id;

-- 19. chat_assignments
CREATE TABLE IF NOT EXISTS chat_assignments_v9 (
  id TEXT PRIMARY KEY,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('group','student')),
  target_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR IGNORE INTO chat_assignments_v9(id, exam_id, target_kind, target_id, active, created_at)
SELECT
  a.id, a.exam_id, a.target_kind,
  CASE WHEN a.target_kind = 'student' AND m.new_id IS NOT NULL THEN CAST(m.new_id AS TEXT) ELSE a.target_id END,
  a.active, a.created_at
FROM chat_assignments a
LEFT JOIN legacy_account_ids m ON m.old_id = a.target_id;

-- 20. security_sessions
CREATE TABLE IF NOT EXISTS security_sessions_v9 (
  account_id INTEGER NOT NULL,
  id TEXT NOT NULL,
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, id)
);
INSERT OR IGNORE INTO security_sessions_v9(account_id, id, value_json, revision, expires_at)
SELECT m.new_id, s.id, s.value_json, s.revision, s.expires_at
FROM security_sessions s
JOIN legacy_account_ids m ON m.old_id = s.account_id;

-- 21. qr_media
CREATE TABLE IF NOT EXISTS qr_media_v9 (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('quiz','feedback','speech')),
  digest TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  name TEXT NOT NULL,
  descriptor_json TEXT NOT NULL CHECK(json_valid(descriptor_json)),
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
INSERT OR IGNORE INTO qr_media_v9(
  id, owner_id, purpose, digest, mime, bytes, name, descriptor_json, source_json, created_at, deleted_at
)
SELECT
  q.id, m.new_id, q.purpose, q.digest, q.mime, q.bytes, q.name, q.descriptor_json, q.source_json, q.created_at, q.deleted_at
FROM qr_media q
JOIN legacy_account_ids m ON m.old_id = q.owner_id;

-- 22. qr_feedback
CREATE TABLE IF NOT EXISTS qr_feedback_v9 (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  card_id INTEGER NOT NULL REFERENCES cards(id),
  sense_id TEXT NOT NULL REFERENCES qr_senses(id),
  version_id TEXT REFERENCES qr_versions(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  attachments_json TEXT NOT NULL CHECK(json_valid(attachments_json)),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  expires_at INTEGER,
  privacy_consent_at INTEGER
);
INSERT OR IGNORE INTO qr_feedback_v9(
  id, owner_id, card_id, sense_id, version_id, category, description, attachments_json, created_at, deleted_at, expires_at, privacy_consent_at
)
SELECT
  f.id, m.new_id, f.card_id, f.sense_id, f.version_id, f.category, f.description, f.attachments_json, f.created_at, f.deleted_at, f.expires_at, f.privacy_consent_at
FROM qr_feedback f
JOIN legacy_account_ids m ON m.old_id = f.owner_id;

-- 23. qr_speech_attempts
CREATE TABLE IF NOT EXISTS qr_speech_attempts_v9 (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES qr_speech_tasks(id),
  owner_id INTEGER NOT NULL REFERENCES account_refs_v9(id),
  media_id TEXT NOT NULL UNIQUE REFERENCES qr_media_v9(id),
  consent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  comparison_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','analyzing','complete','unusable','failed','cancelled')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  finished_at INTEGER,
  deleted_at INTEGER
);
INSERT OR IGNORE INTO qr_speech_attempts_v9(
  id, task_id, owner_id, media_id, consent_at, created_at, deadline_at,
  snapshot_json, comparison_key, state, result_json, error_code, finished_at, deleted_at
)
SELECT
  a.id, a.task_id, m.new_id, a.media_id, a.consent_at, a.created_at, a.deadline_at,
  a.snapshot_json, a.comparison_key, a.state, a.result_json, a.error_code, a.finished_at, a.deleted_at
FROM qr_speech_attempts a
JOIN legacy_account_ids m ON m.old_id = a.owner_id;

-- Drop obsolete immutable triggers before table replacement
DROP TRIGGER IF EXISTS qr_media_immutable;
DROP TRIGGER IF EXISTS qr_feedback_no_update;

-- Drop old tables
DROP TABLE IF EXISTS account_refs;
DROP TABLE IF EXISTS profile_members;
DROP TABLE IF EXISTS account_settings;
DROP TABLE IF EXISTS lesson_access;
DROP TABLE IF EXISTS operation_receipts;
DROP TABLE IF EXISTS class_group_students;
DROP TABLE IF EXISTS exam_work;
DROP TABLE IF EXISTS exam_instances;
DROP TABLE IF EXISTS exam_reviewer_hides;
DROP TABLE IF EXISTS assessment_work;
DROP TABLE IF EXISTS assessment_history;
DROP TABLE IF EXISTS assessment_recordings;
DROP TABLE IF EXISTS account_error_items;
DROP TABLE IF EXISTS speakout_answers;
DROP TABLE IF EXISTS account_archives;
DROP TABLE IF EXISTS content_archive;
DROP TABLE IF EXISTS chat_send_budget;
DROP TABLE IF EXISTS chat_mutations;
DROP TABLE IF EXISTS chat_assignments;
DROP TABLE IF EXISTS security_sessions;
DROP TABLE IF EXISTS qr_speech_attempts;
DROP TABLE IF EXISTS qr_feedback;
DROP TABLE IF EXISTS qr_media;

-- Rename v9 tables to active names
ALTER TABLE account_refs_v9 RENAME TO account_refs;
ALTER TABLE profile_members_v9 RENAME TO profile_members;
ALTER TABLE account_settings_v9 RENAME TO account_settings;
ALTER TABLE lesson_access_v9 RENAME TO lesson_access;
ALTER TABLE operation_receipts_v9 RENAME TO operation_receipts;
ALTER TABLE class_group_students_v9 RENAME TO class_group_students;
ALTER TABLE exam_work_v9 RENAME TO exam_work;
ALTER TABLE exam_instances_v9 RENAME TO exam_instances;
ALTER TABLE exam_reviewer_hides_v9 RENAME TO exam_reviewer_hides;
ALTER TABLE assessment_work_v9 RENAME TO assessment_work;
ALTER TABLE assessment_history_v9 RENAME TO assessment_history;
ALTER TABLE assessment_recordings_v9 RENAME TO assessment_recordings;
ALTER TABLE account_error_items_v9 RENAME TO account_error_items;
ALTER TABLE speakout_answers_v9 RENAME TO speakout_answers;
ALTER TABLE account_archives_v9 RENAME TO account_archives;
ALTER TABLE content_archive_v9 RENAME TO content_archive;
ALTER TABLE chat_send_budget_v9 RENAME TO chat_send_budget;
ALTER TABLE chat_mutations_v9 RENAME TO chat_mutations;
ALTER TABLE chat_assignments_v9 RENAME TO chat_assignments;
ALTER TABLE security_sessions_v9 RENAME TO security_sessions;
ALTER TABLE qr_media_v9 RENAME TO qr_media;
ALTER TABLE qr_feedback_v9 RENAME TO qr_feedback;
ALTER TABLE qr_speech_attempts_v9 RENAME TO qr_speech_attempts;

-- Recreate immutable triggers
CREATE TRIGGER IF NOT EXISTS qr_media_immutable BEFORE UPDATE ON qr_media
WHEN OLD.purpose IS NOT NEW.purpose OR OLD.digest IS NOT NEW.digest
BEGIN
  SELECT RAISE(ABORT, 'Media audit is immutable');
END;

CREATE TRIGGER IF NOT EXISTS qr_feedback_no_update BEFORE UPDATE ON qr_feedback
WHEN OLD.owner_id IS NOT NEW.owner_id OR OLD.card_id IS NOT NEW.card_id OR OLD.sense_id IS NOT NEW.sense_id
BEGIN
  SELECT RAISE(ABORT, 'Feedback audit is immutable');
END;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS profile_members_by_profile ON profile_members(profile_id);
CREATE INDEX IF NOT EXISTS security_sessions_expiry ON security_sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_active_assignment ON chat_assignments(exam_id, target_kind, target_id) WHERE active = 1;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT OR REPLACE INTO schema_migrations(version) VALUES (9);

PRAGMA foreign_keys = ON;
