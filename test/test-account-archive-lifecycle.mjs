import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AccountArchive} from '../src/account-archive.mjs';
import {purgeStudyAccount} from '../src/account-study-purge.mjs';
import {GroupService} from '../src/learning-groups.mjs';
import {mayReviewInstance} from '../src/learning-exam-instances.mjs';

const student='a'.repeat(32),other='b'.repeat(32),teacher={id:'c'.repeat(32),name:'Teacher',role:'ADMIN'},second={id:'d'.repeat(32),role:'ADMIN'},developer={id:'e'.repeat(32),role:'DEVELOPER'};
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  const args=command=>command.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value);
  const db={async read(query,args=[]){return sql.prepare(query).all(...args);},async atomic(commands){sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  sql.exec('CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT,name TEXT,login TEXT,email TEXT,active INTEGER,hidden INTEGER,is_personal_data_revoked INTEGER DEFAULT 0)');
  for(const id of [student,other])sql.prepare('INSERT INTO users(id,role,name,login,email,active,hidden) VALUES(?,?,?,?,?,1,0)').run(id,'USER',id,id,id+'@example.test');
  const accounts={prepare(query){let values=[];const statement={bind(...args){values=args;return statement;},async first(){return sql.prepare(query).get(...values);},async run(){return sql.prepare(query).run(...values);}};return statement;}};
  return {sql,db,service:new AccountArchive(db,accounts)};
}
test('Account archives are teacher-owned, hiding is global, and only developer can recover hidden accounts',async()=>{
  const f=fixture();try{
    await f.service.archive(teacher,student);
    assert.equal(f.sql.prepare('SELECT active FROM users WHERE id=?').get(student).active,0);
    assert.equal((await f.service.list(teacher)).length,1);
    assert.equal((await f.service.list(second)).length,0);
    assert.equal((await f.service.list(developer))[0].archivedBy,teacher.id);
    await assert.rejects(f.service.restore(second,student),error=>error.status===404);
    await f.service.hide(teacher,student);
    assert.equal((await f.service.list(teacher)).length,0);
    assert.equal((await f.service.list(developer)).length,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM users').get().n,2,'Teacher did not delete any account');
    await assert.rejects(f.service.restore(teacher,student),error=>error.status===404);
    await f.service.restore(developer,student);
    assert.equal(f.sql.prepare('SELECT active,hidden FROM users WHERE id=?').get(student).active,1);
    await assert.rejects(f.service.archive({id:other,role:'USER'},student),error=>error.status===403);
    await f.service.archive(teacher,student);
    await assert.rejects(f.service.beginPurge(teacher,student),error=>error.status===403);
    await f.service.beginPurge(developer,student);
    await assert.rejects(f.service.restore(developer,student),error=>error.status===409);
  }finally{f.sql.close();}
});
test('Transfer commands move both completed and active copies without changing answers or statuses',async()=>{
  const f=fixture();try{
    f.sql.exec("CREATE TABLE class_groups(id INTEGER PRIMARY KEY,title TEXT);INSERT INTO class_groups VALUES(1,'A1 Old'),(2,'A2 New');CREATE TABLE exam_instances(exam_id INTEGER PRIMARY KEY,account_id TEXT,status TEXT,group_id INTEGER,group_title TEXT,answers_json TEXT)");
    for(const [id,status] of [[1,'active'],[2,'completed']])f.sql.prepare('INSERT INTO exam_instances VALUES(?,?,?,?,?,?)').run(id,student,status,1,'A1 Old','{"answer":"kept"}');
    const service=new GroupService(f.db);
    await f.db.atomic(await service.studentExamTransferCommands(student,2));
    const rows=await f.db.read('SELECT * FROM exam_instances');
    assert.deepEqual(rows.map(r=>r.group_id),[2,2]);assert.deepEqual(rows.map(r=>r.status),['active','completed']);
    assert.ok(rows.every(r=>r.group_title==='A2 New'&&r.answers_json==='{"answer":"kept"}'));
    await f.db.atomic(await service.studentExamTransferCommands(student,null));
    assert.ok((await f.db.read('SELECT * FROM exam_instances')).every(r=>r.group_id===null&&r.group_title===''));
  }finally{f.sql.close();}
});
test('Physical purge removes own exam copies, profile data and dependent rows; preserves other accounts and shared profiles',async()=>{
  const f=fixture();try{
    f.sql.exec(`CREATE TABLE account_refs(id TEXT PRIMARY KEY);
      CREATE TABLE study_profiles(id INTEGER PRIMARY KEY);
      CREATE TABLE profile_members(account_id TEXT PRIMARY KEY REFERENCES account_refs(id),profile_id INTEGER REFERENCES study_profiles(id));
      CREATE TABLE cards(id INTEGER PRIMARY KEY,owner_profile_id INTEGER REFERENCES study_profiles(id));
      CREATE TABLE exams(id INTEGER PRIMARY KEY);
      CREATE TABLE exam_instances(exam_id INTEGER PRIMARY KEY REFERENCES exams(id),account_id TEXT,group_id INTEGER,status TEXT);
      CREATE TABLE exam_blocks(id INTEGER PRIMARY KEY,exam_id INTEGER REFERENCES exams(id));
      CREATE TABLE exam_work(account_id TEXT,block_id INTEGER REFERENCES exam_blocks(id),answers_json TEXT,PRIMARY KEY(account_id,block_id));
      CREATE TABLE assessment_recordings(account_id TEXT PRIMARY KEY,object_key TEXT);
      CREATE TABLE content_archive(entity_type TEXT,entity_id TEXT,PRIMARY KEY(entity_type,entity_id));
      INSERT INTO study_profiles VALUES(1),(2);INSERT INTO cards VALUES(1,1),(2,2);
      INSERT INTO exams VALUES(10),(11),(12);INSERT INTO exam_blocks VALUES(110,10),(111,11),(112,12);
      INSERT INTO content_archive VALUES('exam','10'),('exam','12');`);
    for(const [id,profile,exam] of [[student,1,10],[other,2,12]]){
      f.sql.prepare('INSERT INTO account_refs VALUES(?)').run(id);
      f.sql.prepare('INSERT INTO profile_members VALUES(?,?)').run(id,profile);
      f.sql.prepare('INSERT INTO exam_instances VALUES(?,?,1,?)').run(exam,id,'completed');
      f.sql.prepare('INSERT INTO exam_work VALUES(?,?,?)').run(id,100+exam,'{"kept":true}');
    }
    const key='stage-local/recordings/user/item/'+'1'.repeat(64);
    f.sql.prepare('INSERT INTO assessment_recordings VALUES(?,?)').run(student,key);
    const removed=[];await purgeStudyAccount(f.db,student,{delete:async key=>removed.push(key)});
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM exam_instances WHERE account_id=?').get(student).n,0);
    assert.deepEqual((await f.db.read('SELECT id FROM exams ORDER BY id')).map(r=>r.id),[11,12]);
    assert.deepEqual((await f.db.read('SELECT id FROM cards')).map(r=>r.id),[2]);
    assert.equal((await f.db.read('SELECT * FROM exam_work'))[0].account_id,other);
    assert.deepEqual(removed,[key]);
    assert.deepEqual((await f.db.read('SELECT entity_id FROM content_archive')).map(r=>r.entity_id),['12']);
    await purgeStudyAccount(f.db,student,{delete:async()=>{throw Error('Unexpected duplicate deletion');}});
  }finally{f.sql.close();}
});
test('A failed media wipe retains retriable rows; a shared profile is preserved',async()=>{
  const f=fixture();try{
    f.sql.exec('CREATE TABLE study_profiles(id INTEGER PRIMARY KEY);CREATE TABLE profile_members(account_id TEXT PRIMARY KEY,profile_id INTEGER REFERENCES study_profiles(id));CREATE TABLE cards(id INTEGER PRIMARY KEY,owner_profile_id INTEGER REFERENCES study_profiles(id));CREATE TABLE assessment_recordings(account_id TEXT PRIMARY KEY,object_key TEXT);INSERT INTO study_profiles VALUES(1);INSERT INTO cards VALUES(1,1)');
    for(const id of [student,other])f.sql.prepare('INSERT INTO profile_members VALUES(?,1)').run(id);
    f.sql.prepare('INSERT INTO assessment_recordings VALUES(?,?)').run(student,'stage-local/recordings/user/item/'+'1'.repeat(64));
    await assert.rejects(purgeStudyAccount(f.db,student,{delete:async()=>{throw Error('Storage unavailable');}}),/Storage unavailable/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profile_members').get().n,2);
    await purgeStudyAccount(f.db,student,{delete:async()=>{}});
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM cards').get().n,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profile_members').get().n,1);
  }finally{f.sql.close();}
});
test('Transferred work is reviewed by the destination group teachers, with original reviewer metadata preserved',async()=>{
  const f=fixture();try{
    f.sql.exec('CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key))');
    f.sql.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('accounts-group-teachers','2',JSON.stringify({teacherIds:[second.id]}));
    const instance={group_id:2,reviewer_id:teacher.id};
    assert.equal(await mayReviewInstance(f.db,instance,second),true);
    assert.equal(await mayReviewInstance(f.db,instance,teacher),false);
    assert.equal(await mayReviewInstance(f.db,instance,developer),true);
    assert.equal(instance.reviewer_id,teacher.id);
  }finally{f.sql.close();}
});
