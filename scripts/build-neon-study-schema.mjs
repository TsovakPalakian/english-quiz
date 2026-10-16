import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {applyTursoSchema} from './turso-test-schema.mjs';
import {ExamService} from '../src/turso-exams.mjs';
import {GroupService} from '../src/turso-groups.mjs';
import {ArchiveService} from '../src/turso-archive.mjs';
import {AssessmentService} from '../src/turso-assessment.mjs';
import {MessageService} from '../src/turso-messages.mjs';
import {listBugHeads} from '../src/bug-log.mjs';
import {ensureSpeakout} from '../src/turso-speakout.mjs';
import {ensureSecuritySessions} from '../src/security-sessions.mjs';
import {studyTableDDL,studyIndexDDL} from '../src/neon-study-sql.mjs';

const sqlite=new DatabaseSync(':memory:');
const decode=command=>(command.args||[]).map(item=>item.type==='null'?null:['integer','float'].includes(item.type)?Number(item.value):item.value);
const db={async read(sql,args=[]){return sqlite.prepare(sql).all(...args);},async atomic(commands){sqlite.exec('BEGIN');try{for(const command of commands)sqlite.prepare(command.sql).all(...decode(command));sqlite.exec('COMMIT');return [];}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
try{
  applyTursoSchema(sqlite);
  await ensureSecuritySessions(db);
  await new ExamService(db).ensure();await new GroupService(db).ensure();await new AssessmentService(db).ensure();
  await new MessageService(db,async()=>[]).ensure();await new ArchiveService(db).ensure();await ensureSpeakout(db);await listBugHeads(db);
  sqlite.exec('CREATE TABLE speakout_lessons(level TEXT,unit_index INTEGER,lesson_index INTEGER,lesson_id INTEGER)');
  const definitions=sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const pending=new Map(definitions.map(row=>[row.name,{...studyTableDDL(row.sql,sqlite.prepare('PRAGMA table_info('+row.name+')').all()),dependencies:new Set(sqlite.prepare('PRAGMA foreign_key_list('+row.name+')').all().map(key=>key.table).filter(name=>name!==row.name))}])),ordered=[];
  while(pending.size){
    const next=[...pending.values()].find(table=>[...table.dependencies].every(name=>!pending.has(name)));
    if(!next)throw Error('Cyclic study schema dependencies');
    ordered.push(next);pending.delete(next.name);
  }
  const indexes=sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all().map(row=>studyIndexDDL(row.sql));
  const source='// Generated from the canonical SQLite schema and service migrations.\n// Regenerate with node scripts/build-neon-study-schema.mjs; never import business rows.\nexport const neonStudyTables='+JSON.stringify(ordered.map(({name,identity,text,columns,types})=>({name,identity,columns,types,ddl:text})),null,2)+';\nexport const neonStudyIndexes='+JSON.stringify(indexes,null,2)+';\n';
  writeFileSync(new URL('../src/neon-study-schema.mjs',import.meta.url),source);
  console.log(JSON.stringify({tables:ordered.length,indexes:indexes.length,dataCopied:false}));
}finally{sqlite.close();}
