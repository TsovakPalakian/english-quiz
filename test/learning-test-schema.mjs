import {readFileSync} from 'node:fs';
const names=['001_content_schema.sql','002_import_audit.sql','003_exams.sql','004_groups.sql','005_exam_titles.sql','006_integer_entity_ids.sql'];
export function applyLearningSchema(sqlite){
  for(const name of names)sqlite.exec(readFileSync(new URL('../migrations/learning/'+name,import.meta.url),'utf8'));
  sqlite.exec('CREATE TABLE IF NOT EXISTS class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER NOT NULL REFERENCES class_groups(id),assigned_by TEXT NOT NULL,updated_at INTEGER NOT NULL DEFAULT(unixepoch()))');
  sqlite.exec('CREATE TABLE IF NOT EXISTS class_group_exams(group_id INTEGER NOT NULL REFERENCES class_groups(id),exam_id INTEGER NOT NULL UNIQUE REFERENCES exams(id),PRIMARY KEY(group_id,exam_id))');
}
