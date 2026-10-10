import {readFileSync} from 'node:fs';
const names=['001_content_schema.sql','002_import_audit.sql','003_exams.sql','004_groups.sql','005_exam_titles.sql','006_integer_entity_ids.sql'];
export function applyTursoSchema(sqlite){
  for(const name of names)sqlite.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
}
