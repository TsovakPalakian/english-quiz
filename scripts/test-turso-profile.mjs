import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {ensureStudyProfile} from '../src/turso-profile.mjs';
const actor={id:'a'.repeat(32),role:'DEVELOPER',revoked:false};
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const name of ['001_content_schema.sql','002_import_audit.sql'])sqlite.exec(readFileSync(new URL('../migrations/turso/'+name,import.meta.url),'utf8'));
  const args=cmd=>cmd.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
  const db={read:async(sql,params)=>sqlite.prepare(sql).all(...params),atomic:async cmds=>{
    sqlite.exec('BEGIN');try{for(const cmd of cmds)sqlite.prepare(cmd.sql).run(...args(cmd));sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {sqlite,db};
}
test('Live new account gets one empty profile; retries/concurrent login and different users remain isolated',async()=>{
  const f=fixture();try{
    const profiles=await Promise.all([ensureStudyProfile(f.db,actor),ensureStudyProfile(f.db,actor)]);
    assert.equal(profiles[0],profiles[1]);assert.equal(await ensureStudyProfile(f.db,actor),profiles[0]);
    const other=await ensureStudyProfile(f.db,{...actor,id:'b'.repeat(32),role:'USER'});assert.notEqual(other,profiles[0]);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM account_refs').get().n,2);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM study_profiles').get().n,2);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM cards').get().n,0);assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{f.sqlite.close();}
});
test('Retained shared/former-pair profile is not replaced, split or duplicated',async()=>{
  const f=fixture();try{
    f.sqlite.prepare('INSERT INTO account_refs(id) VALUES(?)').run(actor.id);
    f.sqlite.exec("INSERT INTO study_profiles(id,kind) VALUES('retained_pair','shared');");
    f.sqlite.prepare("INSERT INTO profile_members(account_id,profile_id) VALUES(?,'retained_pair')").run(actor.id);
    assert.equal(await ensureStudyProfile(f.db,actor),'retained_pair');
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM study_profiles').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT kind FROM study_profiles').get().kind,'shared');
  }finally{f.sqlite.close();}
});
test('Missing/revoked/invalid identity or role creates no educational rows and never registers a D1 user',async()=>{
  const f=fixture();try{
    for(const value of [null,{...actor,id:'client supplied'},{...actor,revoked:true},{...actor,role:'FAKE'}])await assert.rejects(ensureStudyProfile(f.db,value),e=>e.status===401);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM account_refs').get().n,0);
  }finally{f.sqlite.close();}
});
