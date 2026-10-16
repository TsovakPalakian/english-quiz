import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AccountGroupTeachers} from '../src/account-group-teachers.mjs';
import {PGlite} from '@electric-sql/pglite';
import {NeonStudyClient} from '../src/neon-study.mjs';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';
import {statement as s} from '../src/learning-study.mjs';
import {integratedWorker} from '../src/learning-integrated-worker.mjs';
const actor={id:'teacher',role:'ADMIN'},users=[actor,{id:'second',role:'ADMIN'},{id:'dev',role:'DEVELOPER'},{id:'student',role:'USER'},{id:'inactive',role:'ADMIN',active:false}];
function fixture(){const sql=new DatabaseSync(':memory:');sql.exec("CREATE TABLE catalog_documents(namespace TEXT,key TEXT,value_json TEXT,PRIMARY KEY(namespace,key));CREATE TABLE class_groups(id INTEGER PRIMARY KEY,deleted_at INTEGER);INSERT INTO class_groups VALUES(1,NULL),(2,NULL),(3,1);CREATE TABLE class_group_students(account_id TEXT PRIMARY KEY,group_id INTEGER);INSERT INTO class_group_students VALUES('student',1)");
 const args=c=>c.args.map(a=>a.type==='null'?null:['integer','float'].includes(a.type)?Number(a.value):a.value),db={read:async(q,a=[])=>sql.prepare(q).all(...a),atomic:async commands=>{sql.exec('BEGIN');try{for(const c of commands)sql.prepare(c.sql).run(...args(c));sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};return {sql,service:new AccountGroupTeachers(db),close:()=>sql.close()};}
test('multiple teachers persist independently of student membership and other catalog namespaces',async()=>{const f=fixture();try{
 f.sql.prepare('INSERT INTO catalog_documents VALUES(?,?,?)').run('everyday','v1','{"untouched":true}');
 let result=await f.service.save(actor,{groupId:1,teacherIds:['teacher','second'],expectedRevision:0},users);assert.equal(result.revision,1);
 assert.deepEqual((await f.service.list(actor,users)).assignments[0].teacherIds,['teacher','second']);
 result=await f.service.save(actor,{groupId:2,teacherIds:['teacher'],expectedRevision:0},users);assert.equal(result.revision,1);
 assert.equal((await f.service.list(actor,users)).assignments.length,2);assert.equal(f.sql.prepare('SELECT group_id FROM class_group_students').get().group_id,1);
 assert.equal(f.sql.prepare("SELECT value_json FROM catalog_documents WHERE namespace='everyday'").get().value_json,'{"untouched":true}');
 await f.service.save(actor,{groupId:1,teacherIds:[],expectedRevision:1},users);assert.deepEqual((await f.service.list(actor,users)).assignments.find(g=>g.groupId===1).teacherIds,[]);
 }finally{f.close();}});
test('teacher assignments enforce roles, visibility, active groups, revisions and shape',async()=>{const f=fixture();try{
 await assert.rejects(f.service.list({role:'USER'},users),e=>e.status===403);
 for(const body of [{groupId:1,teacherIds:['student'],expectedRevision:0},{groupId:1,teacherIds:['inactive'],expectedRevision:0},{groupId:1,teacherIds:['missing'],expectedRevision:0},{groupId:1,teacherIds:['teacher','teacher'],expectedRevision:0},{groupId:1,teacherIds:[],expectedRevision:-1},{groupId:1,teacherIds:[],expectedRevision:0,grantAccess:true}])await assert.rejects(f.service.save(actor,body,users),e=>e.status===400);
 await assert.rejects(f.service.save(actor,{groupId:3,teacherIds:[],expectedRevision:0},users),e=>e.status===404);
 await f.service.save(actor,{groupId:1,teacherIds:['second'],expectedRevision:0},users);
 await assert.rejects(f.service.save(actor,{groupId:1,teacherIds:[],expectedRevision:0},users),e=>e.status===409);
 assert.deepEqual((await f.service.list(actor,[actor])).assignments[0].teacherIds,[]);
 f.sql.exec('UPDATE class_groups SET deleted_at=1 WHERE id=1');assert.equal((await f.service.list(actor,users)).assignments.length,0);
 }finally{f.close();}});
test('a reviewer cannot see or accidentally remove assignments outside the visible directory',async()=>{const f=fixture();try{
 await f.service.save({id:'dev',role:'DEVELOPER'},{groupId:1,teacherIds:['second','dev'],expectedRevision:0},users);
 const result=await f.service.save(actor,{groupId:1,teacherIds:['teacher'],expectedRevision:1},[actor,users[1]]);assert.deepEqual(result.teacherIds,['teacher']);
 assert.deepEqual((await f.service.list({role:'DEVELOPER'},users)).assignments[0].teacherIds,['teacher','dev']);
 }finally{f.close();}});
test('concurrent edits cannot silently overwrite one another',async()=>{const f=fixture();try{
 const results=await Promise.allSettled(['teacher','second'].map(id=>f.service.save(actor,{groupId:1,teacherIds:[id],expectedRevision:0},users)));
 assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.status,409);
 }finally{f.close();}});
test('Accounts teacher endpoint enforces authentication, roles, CSRF, write flag and visible users',async()=>{const f=fixture();try{
 let identity=actor;const env={STAGE_ENABLED:'true',STAGE_ALLOWED_HOST:'accounts.example',STAGE_WRITES:'true',DB:{prepare(){return {};}}},ctx={waitUntil(){}};
 const app=integratedWorker({authenticate:async()=>identity,accountWorker:{fetch:async()=>Response.json({users:[actor,users[1]]})},studyDatabase:()=>f.service.db});
 const get=()=>app.fetch(new Request('https://accounts.example/api/accounts/group-teachers'),env,ctx),post=(body,origin='https://accounts.example')=>app.fetch(new Request('https://accounts.example/api/accounts/group-teachers',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}),env,ctx);
 identity=null;assert.equal((await get()).status,401);identity={role:'USER'};assert.equal((await get()).status,403);identity=actor;
 assert.equal((await get()).status,200);assert.equal((await post({groupId:1,teacherIds:['dev'],expectedRevision:0})).status,400);
 assert.equal((await post({groupId:1,teacherIds:['teacher'],expectedRevision:0},'https://other.example')).status,403);
 env.STAGE_WRITES='false';assert.equal((await post({groupId:1,teacherIds:['teacher'],expectedRevision:0})).status,503);env.STAGE_WRITES='true';
 assert.equal((await post({groupId:1,teacherIds:['teacher','second'],expectedRevision:0})).status,200);assert.equal((await (await get()).json()).assignments[0].teacherIds.length,2);
 }finally{f.close();}});
test('isolated teacher assignments work through the PostgreSQL compiler without new tables',async()=>{const pg=new PGlite();try{
 for(const sql of neonStudyMigration)await pg.exec(sql);
 const db=new NeonStudyClient({}, {createSql:()=>({query:(text,params)=>({text,params}),async transaction(commands){return pg.transaction(async tx=>{const results=[];for(const cmd of commands){const result=await tx.query(cmd.text,cmd.params);results.push({...result,command:cmd.text.split(/\s/)[0],rowCount:result.affectedRows||0});}return results;});}})});
 await db.atomic([s("INSERT INTO class_groups(id,title) VALUES(1,'A1 Demo')")]);const service=new AccountGroupTeachers(db);
 await service.save(actor,{groupId:1,teacherIds:['teacher','second'],expectedRevision:0},users);assert.equal((await service.list(actor,users)).assignments[0].teacherIds.length,2);
 await service.save(actor,{groupId:1,teacherIds:['second'],expectedRevision:1},users);assert.deepEqual((await service.list(actor,users)).assignments[0].teacherIds,['second']);
 await assert.rejects(service.save(actor,{groupId:1,teacherIds:[],expectedRevision:1},users),e=>e.status===409);
 }finally{await pg.close();}});
