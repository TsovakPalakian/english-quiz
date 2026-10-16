CREATE TABLE exams (
  id TEXT PRIMARY KEY NOT NULL,
  lesson_date TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX exams_visible ON exams(published, deleted_at, id);
CREATE TABLE exam_blocks (
  exam_id TEXT NOT NULL REFERENCES exams(id),
  id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  title TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  PRIMARY KEY (exam_id, id)
);
CREATE INDEX exam_blocks_order ON exam_blocks(exam_id, deleted_at, position);
CREATE TABLE exam_materials (
  exam_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL,
  tab TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(content_json) AND json_type(content_json) = 'object'),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  PRIMARY KEY (exam_id, block_id, id),
  FOREIGN KEY (exam_id, block_id) REFERENCES exam_blocks(exam_id, id)
);
CREATE INDEX exam_materials_order ON exam_materials(exam_id, block_id, deleted_at, position);
CREATE TABLE exam_work (
  account_id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json) AND json_type(answers_json) = 'object'),
  corrections_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(corrections_json) AND json_type(corrections_json) = 'object'),
  points_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(points_json) AND json_type(points_json) = 'object'),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, exam_id, block_id)
);
