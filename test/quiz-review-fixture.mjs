import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {applyLearningSchema} from './learning-test-schema.mjs';
import {D1StudyClient} from '../src/d1-study.mjs';
import {QuizReviewService} from '../src/quiz-review.mjs';
export const actors={student:{id:'u1',name:'Anna',role:'USER'},other:{id:'u2',name:'Mark',role:'USER'},teacher:{id:'teacher',name:'Elena',role:'ADMIN'},second:{id:'second',name:'Second reviewer',role:'ADMIN'},outsider:{id:'outsider',name:'Other teacher',role:'ADMIN'},dev:{id:'dev',name:'Developer',role:'DEVELOPER'}};
export const body=values=>({mutationId:crypto.randomUUID(),...values});
export const content={explanation:'Drizzle means light rain in this context.',items:[{shown:'A fine ____ started falling.',answer:'drizzle',hint:'Light rain'}]};
export async function fixture({d1=false,approval=true,filename=':memory:',extendedLifecycle=false}={}){
  const sql=new DatabaseSync(filename);applyLearningSchema(sql);
  sql.exec(`PRAGMA foreign_keys=ON;
    INSERT INTO account_refs(id) VALUES('u1'),('u2'),('teacher'),('second'),('outsider'),('dev');
    INSERT INTO study_profiles(id,kind) VALUES(1,'personal'),(2,'personal');
    INSERT INTO profile_members(account_id,profile_id) VALUES('u1',1),('u2',2);
    INSERT INTO class_groups(id,title) VALUES(1,'A1 Monday'),(2,'A2 Friday');
    INSERT INTO class_group_students(account_id,group_id,assigned_by) VALUES('u1',1,'teacher'),('u2',2,'outsider');
    INSERT INTO lessons(id,title,published) VALUES(1,'Weather',1),(2,'Money',1),(3,'Unpublished',0);
    INSERT INTO class_group_lessons(group_id,lesson_id) VALUES(1,1),(2,2),(1,3);
    INSERT INTO cards(id,scope,en,word_key,ru) VALUES(1,'shared','drizzle','drizzle','изморось'),(2,'shared','bank','bank','банк');
    INSERT INTO cards(id,scope,owner_profile_id,en,word_key,ru) VALUES(3,'profile',1,'drizzle','drizzle','изморось'),(4,'profile',2,'drizzle','drizzle','изморось');
    INSERT INTO profile_cards(profile_id,card_id,place) VALUES(1,3,'mine'),(2,4,'mine');
    INSERT INTO lesson_blocks(id,lesson_id,position,type,card_id) VALUES(1,1,0,'word',1),(2,2,0,'word',2),(3,3,0,'word',1);
    INSERT INTO catalog_documents(namespace,key,value_json) VALUES('accounts-group-teachers','1','{"revision":1,"teacherIds":["teacher","second"]}'),('accounts-group-teachers','2','{"revision":1,"teacherIds":["outsider"]}');
    INSERT INTO quiz_collections(id,legacy_word_key) VALUES(1,'drizzle');
    INSERT INTO quizzes(id,collection_id,position,type,items_json) VALUES(1,1,0,'Flip','[{"front":"drizzle","back":"изморось"}]');
  `);
  sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/001_quiz_review.sql',import.meta.url),'utf8'));
  const atomic=commands=>{sql.exec('BEGIN IMMEDIATE');try{const result=commands.map(c=>c());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}};
  const binding={prepare(query){let args=[];const prepared={bind(...values){args=values;return prepared;},exec(){const stmt=sql.prepare(query),results=stmt.all(...args);return {success:true,results,meta:{changes:sql.prepare('SELECT changes() AS n').get().n}};}};return prepared;},async batch(statements){return atomic(statements.map(stmt=>()=>stmt.exec()));}};
  const db=d1?new D1StudyClient(binding):{
    async read(query,args=[]){return sql.prepare(query).all(...args);},
    async atomic(commands){atomic(commands.map(c=>()=>sql.prepare(c.sql).run(...c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value))));},
  };
  const service=new QuizReviewService(db,{allowGlobalApproval:approval,extendedLifecycle});
  const {senseId}=await service.createSense(actors.dev,body({cardId:1,meaning:{partOfSpeech:'noun',translation:'изморось',definition:'Light rain in very small drops.'}}));
  const draft=(actor=actors.student,extra={})=>service.createDraft(actor,body({groupId:1,lessonId:1,cardId:1,senseId,type:'Gap',content,...extra}));
  return {sql,db,service,senseId,draft,close:()=>sql.close()};
}
