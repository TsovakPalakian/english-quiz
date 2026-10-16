import assert from 'node:assert/strict';
import {readNeonSecret} from './neon-secret-input.mjs';
import {neonClient} from '../src/neon-connection.mjs';
import {studyMigrationFor,studyNamespace} from '../src/neon-study-migration.mjs';
import {NeonStudyClient} from '../src/neon-study.mjs';
import {ensureStudyProfile} from '../src/learning-profile.mjs';
import {StudyService,statement as s} from '../src/learning-study.mjs';
import {PersonalService} from '../src/learning-personal.mjs';
import {GroupService} from '../src/learning-groups.mjs';
import {ExamService} from '../src/learning-exams.mjs';
import {accountBootstrap} from '../src/learning-legacy-read.mjs';

const namespace=studyNamespace('english_study_check_'+crypto.randomUUID().replaceAll('-','').slice(0,16));
let env,created=false;
try{
  if(process.argv.length!==2)throw Error('Run without arguments; the URL is read from hidden stdin.');
  env={NEON_DATABASE_URL:await readNeonSecret()};
  const sql=neonClient(env);created=true;
  await sql.transaction(studyMigrationFor(namespace).map(text=>sql.query(text,[])),{fetchOptions:{redirect:'error',signal:AbortSignal.timeout(45000)}});
  const db=new NeonStudyClient(env,{namespace}),teacher={id:'1'.repeat(32),role:'DEVELOPER'},student={id:'2'.repeat(32),role:'USER'};
  await ensureStudyProfile(db,teacher);await ensureStudyProfile(db,student);
  const personal=new PersonalService(db),body={mutationId:crypto.randomUUID(),expectedRevision:0,card:{en:'live fixture',ru:'temporary fixture',place:'mine'}};
  const card=await personal.createOwnCard(student,body);assert.ok(Number.isSafeInteger(card.id));assert.deepEqual(await personal.createOwnCard(student,body),card);
  const lessons=new StudyService(db),lesson=await lessons.createLesson(teacher,{mutationId:crypto.randomUUID(),changes:{title:'Temporary live verification',published:true},blocks:[{type:'text',tab:'overview',expectedRevision:0,cardId:null,content:{text:'Temporary question'}}]});
  assert.ok(Number.isSafeInteger(lesson.blocks[0].id));
  const groups=new GroupService(db);assert.equal((await groups.list(teacher)).length,9);
  const exams=new ExamService(db),exam=await exams.save(teacher,{exam:{title:'Temporary live exam',published:true,blocks:[{title:'Temporary block',published:true,materials:[{type:'text',text:'Temporary material'}]}]}});
  assert.ok(Number.isSafeInteger(exam.id));assert.equal(exam.blocks.length,1);
  const [before]=await db.read('SELECT count(*) n FROM lessons');
  await assert.rejects(db.atomic([s('CREATE TEMP TABLE mutation_guard(ok INTEGER NOT NULL CHECK(ok=1))'),s("INSERT INTO lessons(title) VALUES('rollback fixture')"),s('INSERT INTO mutation_guard SELECT changes()=0')]),error=>error.status===409);
  assert.equal((await db.read('SELECT count(*) n FROM lessons'))[0].n,before.n);
  assert.equal((await accountBootstrap(db,student)).counts.cards,1);
  console.log(JSON.stringify({status:'verified',transport:'neon-http',isolatedNamespace:namespace,profileIsolation:true,idempotentCardCreation:true,numericLessonBlockIds:true,groups:true,exams:true,atomicRollback:true,bootstrap:true,productionRowsChanged:0,siteSwitched:false}));
}catch{
  console.error('Neon runtime verification failed. The active database was not changed.');process.exitCode=1;
}finally{
  if(created&&env){
    try{await neonClient(env).query('DROP SCHEMA IF EXISTS "'+namespace+'" CASCADE',[]);console.log(JSON.stringify({temporaryNamespaceRemoved:namespace}));}
    catch{console.error('Temporary verification schema could not be removed: '+namespace);process.exitCode=1;}
  }
}
