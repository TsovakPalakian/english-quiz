import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {NeonStudyClient} from '../src/neon-study.mjs';
import {neonStudyMigration} from '../src/neon-study-migration.mjs';
import {observeSession,listSessions,endSession,finishSessionRecord,pruneSessionHistory,requestSessionMetadata,sessionRecordId} from '../src/security-sessions.mjs';

function sqliteStore(){
  const sql=new DatabaseSync(':memory:');
  return {close:()=>sql.close(),async read(query,args=[]){return sql.prepare(query).all(...args);},async atomic(commands){
    sql.exec('BEGIN');try{const results=commands.map(command=>{const args=command.args.map(v=>v.type==='null'?null:['integer','float'].includes(v.type)?Number(v.value):v.value);return {affected_row_count:sql.prepare(command.sql).run(...args).changes};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}
  }};
}
function request(){const req=new Request('https://app.example',{headers:{'User-Agent':'Mozilla/5.0 (Macintosh) Version/18.6 Safari/605.1.15','CF-Connecting-IP':'192.0.2.1'}});Object.defineProperty(req,'cf',{value:{country:'AM',city:'Yerevan',latitude:'40.18',longitude:'44.51',asn:123,tlsVersion:'TLSv1.3'}});return req;}
function identity(extra={}){return {id:'alice',sid:'a'.repeat(32),sortAt:Date.now(),exp:Math.floor(Date.now()/1000)+10800,pwdv:'version1',databaseRevision:1,...extra};}
async function exercise(db){
  const own=identity(),other=identity({sid:'b'.repeat(32)}),bucket={markers:new Map(),async put(key,value){this.markers.set(key,value);}};
  await observeSession(db,request(),own);await observeSession(db,request(),own);await observeSession(db,request(),other);
  let active=await listSessions(db,own);assert.equal(active.sessions.length,2);assert.equal(active.sessions.filter(row=>row.current).length,1);
  const mine=active.sessions.find(row=>row.current);assert.match(mine.mapsUrl,/40.18%2C44.51/);assert.equal(mine.ip,'192.0.2.1');assert.equal(mine.browser,'Safari 18.6');assert.equal(mine.sid,undefined);assert.equal(mine.credential,undefined);
  assert.equal((await listSessions(db,{...own,id:'bob'})).sessions.length,0);
  await assert.rejects(endSession(db,bucket,{...own,id:'bob'},mine.id),/not found/);
  const target=active.sessions.find(row=>!row.current);await endSession(db,bucket,own,target.id);
  assert.ok(bucket.markers.has('revoked-sid/'+other.sid));await observeSession(db,request(),other);
  assert.equal((await listSessions(db,own)).sessions.length,1);
  assert.equal((await listSessions(db,own,{view:'history'})).sessions[0].endReason,'terminated');
  await finishSessionRecord(db,own,'logout');assert.equal((await listSessions(db,own)).sessions.length,0);
  const legacy=identity({sid:'c'.repeat(40),legacy:true});await observeSession(db,request(),legacy);
  assert.equal((await listSessions(db,legacy)).sessions[0].startedAt,null);
  assert.equal((await listSessions(db,{...legacy,pwdv:'changed'})).sessions.length,0);
  assert.equal((await listSessions(db,{...legacy,databaseRevision:2})).sessions.length,0);
  const stale=identity({id:'old',sid:'d'.repeat(32),sortAt:Date.now()-100*86400000,exp:Math.floor(Date.now()/1000)-95*86400});await observeSession(db,request(),stale);await pruneSessionHistory(db);
  assert.equal((await db.read('SELECT id FROM security_sessions WHERE account_id=?',['old'])).length,0);
  await assert.rejects(listSessions(db,own,{cursor:"' OR 1=1"}),/Invalid session ID/);
  const before=await db.read('SELECT id FROM security_sessions');await observeSession(db,request(),legacy);assert.equal((await db.read('SELECT id FROM security_sessions')).length,before.length);
}
test('Session history persists in SQLite with ownership, lifecycle and retention',async()=>{const db=sqliteStore();try{await exercise(db);}finally{db.close();}});
test('The same session repository works with PostgreSQL and its real SQL compiler',async()=>{
  const pg=new PGlite();try{
    for(const sql of neonStudyMigration)await pg.exec(sql);
    const db=new NeonStudyClient({}, {createSql:()=>({query:(text,params)=>({text,params}),async transaction(commands){return pg.transaction(async tx=>{const results=[];for(const cmd of commands){const result=await tx.query(cmd.text,cmd.params);results.push({...result,command:cmd.text.split(/\s/)[0],rowCount:result.affectedRows||0});}return results;});}})});
    await exercise(db);
  }finally{await pg.close();}
});
test('Location is taken only from trusted Cloudflare metadata',()=>{
  const origin=requestSessionMetadata(new Request('https://app.example',{headers:{'CF-Connecting-IP':'forged','X-Forwarded-For':'forged'}}));assert.equal(origin.ip,'');assert.equal(origin.latitude,null);assert.equal(origin.longitude,null);
  assert.throws(()=>sessionRecordId(identity({sid:'invalid'})),/Invalid session/);
});
test('A failed history update cannot undo the security revocation',async()=>{
  const db=sqliteStore();try{
    const session=identity(),keys=[];await observeSession(db,request(),session);
    const unavailable={read:db.read,atomic:async()=>{throw Error('Database unavailable');}};
    await assert.rejects(endSession(unavailable,{put:async key=>keys.push(key)},session,sessionRecordId(session)),/Database unavailable/);
    assert.deepEqual(keys,['revoked-sid/'+session.sid]);
  }finally{db.close();}
});
