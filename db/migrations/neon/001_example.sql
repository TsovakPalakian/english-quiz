-- Example-only schema. Not applied to the application's existing tables.
CREATE TABLE db_example_quizzes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE db_example_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES db_example_quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position >= 0),
  prompt TEXT NOT NULL,
  choices_json TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1))
);
CREATE INDEX db_example_questions_quiz ON db_example_questions(quiz_id,published,position,id);
