// Browser acceptance only: synthetic accounts, in-memory SQLite, no network DB.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {pbkdf2Sync,randomUUID} from 'node:crypto';
import {StudyError,StudyService} from '../src/turso-study.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {LessonMediaService} from '../src/turso-lesson-media.mjs';
import {SongMediaService} from '../src/turso-song-media.mjs';
import {RealStageAuth} from './turso-real-auth.mjs';
import {localMediaStore} from './turso-local-media.mjs';
import {createMainServer} from './run-turso-main.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.slice(2).some(arg=>arg!=='--seed-media'))throw new Error('Only --seed-media is supported.');
const seededMedia=process.argv.includes('--seed-media');
const sqlite=new DatabaseSync(':memory:');for(const name of ['001_content_schema.sql','002_import_audit.sql'])sqlite.exec(readFileSync(resolve(root,'migrations/turso',name),'utf8'));
// Shared educational definitions/catalogs only. Never import account/profile,
// library, responses, statistics, or private card rows from the saved snapshot.
const source=new DatabaseSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/turso-verified-68hTU6/restored.sqlite',{readOnly:true});
function insert(table,row){const columns=Object.keys(row);sqlite.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
sqlite.exec("INSERT INTO migration_runs(id,source_manifest_sha256,status) VALUES('offline','offline-public-definitions','verified')");
const shared=new Set();for(const row of source.prepare("SELECT * FROM cards WHERE scope='shared'").all()){insert('cards',row);shared.add(row.id);}
for(const row of source.prepare("SELECT * FROM catalog_documents WHERE namespace='static'").all())insert('catalog_documents',row);
for(const row of source.prepare("SELECT * FROM legacy_ids WHERE entity_kind='card' AND source_namespace IN ('LESSON_DATA','GRAMMAR','IRREGULAR','TENSE_BANK','SPEAKOUT')").all())if(shared.has(row.target_id))insert('legacy_ids',{...row,migration_id:'offline'});
source.close();
const args=command=>command.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
const db={read:async(sql,params=[])=>sqlite.prepare(sql).all(...params),readMany:async commands=>commands.map(c=>sqlite.prepare(c.sql).all(...args(c))),atomic:async commands=>{
  sqlite.exec('BEGIN');try{for(const c of commands)sqlite.prepare(c.sql).run(...args(c));sqlite.exec('COMMIT');}catch{sqlite.exec('ROLLBACK');throw new StudyError(409,'Offline fixture conflict');}
}};
const salt='ab'.repeat(16),hash=pbkdf2Sync('fixture-only',Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
const rows=['ADMIN','DEVELOPER','USER'].map((role,i)=>({id:String(i+1).repeat(32),login:['offline_teacher','offline_dev','offline_student'][i],email:`fixture-${i+1}@example.invalid`,name:'OFFLINE FIXTURE',role,active:1,is_personal_data_revoked:0,password_salt:salt,password_hash:hash,password_iterations:100000,created_at:1}));
for(const [i,row] of rows.entries()){
  sqlite.prepare('INSERT INTO account_refs(id) VALUES(?)').run(row.id);sqlite.prepare("INSERT INTO study_profiles(id,kind) VALUES(?,'personal')").run('offline-p'+i);
  sqlite.prepare('INSERT INTO profile_members VALUES(?,?)').run(row.id,'offline-p'+i);
}
await new StudyService(db).createLesson(rows[0],{mutationId:randomUUID(),id:'offline_lesson',changes:{title:'OFFLINE media acceptance',published:true},blocks:[
  ...['pdf','image','audio'].map(type=>({id:'offline_'+type,type,tab:'overview',cardId:null,expectedRevision:0,content:{title:'Fixture '+type}})),
  {id:'offline_text',type:'text',tab:'overview',cardId:null,expectedRevision:0,content:{html:'<p>Untouched neighbour</p>'}}]});
await new PersonalService(db).createLibrary(rows[1],{mutationId:randomUUID(),id:'offline_song',kind:'song',changes:{title:'OFFLINE audio acceptance',artist:'Fixture',lyrics:'Temporary fixture lyrics'}});
const mediaDirectory=mkdtempSync('/private/tmp/english-quiz-stage-media-'),store=localMediaStore(mediaDirectory);
const samples=800,wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 160] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'];
const stream='BT /F1 16 Tf 20 90 Td (OFFLINE PDF fixture) Tj ET';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(resolve(mediaDirectory,'fixture.wav'),wav,{mode:0o600});writeFileSync(resolve(mediaDirectory,'fixture.pdf'),pdf,{mode:0o600});
writeFileSync(resolve(mediaDirectory,'fixture.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=','base64'),{mode:0o600});
// Optional reproducible viewer fixture; not evidence of a browser upload.
if(seededMedia){
  let expectedRevision=1;
  for(const [type,mime] of [['pdf','application/pdf'],['image','image/png'],['audio','audio/wav']]){
    const name='fixture.'+({pdf:'pdf',image:'png',audio:'wav'}[type]);
    const saved=await new LessonMediaService(db,store).upload(rows[0],'offline_lesson','offline_'+type,
      {mutationId:randomUUID(),expectedRevision,expectedBlockRevision:1,name,mime},readFileSync(resolve(mediaDirectory,name)));
    expectedRevision=saved.revision;
  }
  await new SongMediaService(db,store).upload(rows[1],'offline_song',
    {mutationId:randomUUID(),expectedRevision:1,name:'fixture.wav',mime:'audio/wav'},wav);
}
const users=new Map(rows.map(row=>[row.login,row])),sourceAuth={byLogin:async login=>users.get(login)||null,byId:async id=>rows.find(row=>row.id===id)||null,gone:async()=>false};
const server=createMainServer({db,auth:new RealStageAuth(sourceAuth),mediaStore:store,offlineFixture:true});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({origin:'http://127.0.0.1:'+server.address().port,pid:process.pid,fixtures:mediaDirectory,syntheticAccounts:true,seededMedia,externalDatabaseRequests:0})));
let stopping=false;function stop(){if(stopping)return;stopping=true;server.closeAllConnections();server.close(()=>{sqlite.close();rmSync(mediaDirectory,{recursive:true});process.exit(0);});}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
