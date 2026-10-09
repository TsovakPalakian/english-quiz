CREATE TABLE class_groups (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  lesson_date TEXT NOT NULL DEFAULT '',
  hidden_from_students INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_students IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE class_group_lessons (
  group_id TEXT NOT NULL REFERENCES class_groups(id),
  lesson_id TEXT NOT NULL UNIQUE REFERENCES lessons(id),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (group_id, lesson_id)
);
