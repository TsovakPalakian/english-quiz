import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {neonConfig} from '@neondatabase/serverless';
import {createDatabase,withDatabase,DatabaseError} from '../db/index.js';
import {compile} from '../db/sql.js';
import {encodeJson,decodeJson,encodeBoolean,decodeBoolean,timestamp} from '../db/values.js';
import {createQuizWithQuestion} from '../examples/db-transaction.js';
import {quizQuestionsEndpoint,createQuizExampleWorker} from '../examples/db-endpoint.js';

const environments={
  neon:{DB_PROVIDER:'neon',DATABASE_URL:'postgresql://fixture:fake-secret@ep-fixture-pooler.eu-central-1.aws.neon.tech/english?sslmode=require'},
  d1:{DB_PROVIDER:'d1',DB:{prepare(){},batch(){}}}
};
const silent={log:()=>{},sleep:async()=>{}};
const emptyNeon=()=>({rows:[],fields:[],rowCount:0,command:'SELECT'});
function fake(provider,{failures=[],events=[]}={}){
  let calls=0;const configurations=[];
  async function attempt(value){calls++;const error=failures.shift();if(error)throw error;return value;}
  const options=provider==='neon'?{createNeon:connection=>{
    configurations.push(connection);
    return {query(sql,args,options){const command={sql,args};events.push({query:command,options});return options?attempt(emptyNeon()):command;},
      transaction(commands,options){events.push({batch:commands,options});return attempt(commands.map(emptyNeon));}};
  }}:{createD1:binding=>{
    configurations.push(binding);
    return {prepare(sql){return {sql,args:[],bind(...args){return {sql,args};}};},batch(commands){
      events.push({batch:commands,mode:commands.some(c=>!c.sql.startsWith('SELECT'))?'write':'read'});
      return attempt(commands.map(()=>({success:true,results:[],meta:{changes:0}})));
    }};
  }};
  return {options:{...silent,...options},events,configurations,get calls(){return calls;}};
}
test('provider is explicit, invalid configuration never falls back or exposes secrets',()=>{
  for(const DB_PROVIDER of [undefined,'','postgres','NEON',' neon','learning '])assert.throws(()=>createDatabase({DB_PROVIDER}),error=>error.code==='DB_PROVIDER');
  for(const DATABASE_URL of ['secret',environments.neon.DATABASE_URL.replace('-pooler',''),environments.neon.DATABASE_URL.replace('sslmode=require','sslmode=disable'),environments.neon.DATABASE_URL+'&sslmode=disable',environments.neon.DATABASE_URL+'&host=other.example'])assert.throws(()=>createDatabase({...environments.neon,DATABASE_URL}),error=>error.code==='DB_CONFIG'&&!error.message.includes('fake-secret'));
  for(const DB of [null,{}, {prepare(){}}])assert.throws(()=>createDatabase({...environments.d1,DB}),error=>error.code==='DB_CONFIG');
});
test('placeholder lexer preserves literals/comments and never interpolates bound values',()=>{
  const text="SELECT '?' literal, \"?\" FROM things /* ? */ WHERE name=? AND value='it''s ?' -- ?\n AND id=?;";
  const value="' OR 1=1; DROP TABLE users; --";
  const query=compile(text,[value,1],'neon','query');assert.ok(query.sql.includes('name=$1'));assert.ok(query.sql.includes('id=$2'));assert.ok(query.sql.includes("'it''s ?'"));assert.equal(query.args[0],value);assert.ok(!query.sql.includes(value));
  assert.equal(compile('SELECT id FROM things WHERE id=?',[1],'d1','query').sql,'SELECT id FROM things WHERE id=?');
  for(const sql of ['SELECT 1; DELETE FROM users','SELECT 1; -- comment\r DELETE FROM users','SELECT $1','SELECT :id','SELECT @id','SELECT ?1','SELECT $$?$$','SELECT 1 /*','SELECT \'oops','SELECT 1 /* nested /* x */ */'])assert.throws(()=>compile(sql,[],'neon','query'),sql);
  assert.throws(()=>compile('SELECT ?',[],'neon','query'));assert.throws(()=>compile('SELECT 1',[1],'neon','query'));
});
test('SQL subset rejects transaction control, migrations and unsupported dialect features',()=>{
  for(const sql of ['BEGIN','PRAGMA foreign_keys=ON','CREATE TABLE x(id INT)','WITH x AS (SELECT 1) SELECT * FROM x','SELECT NOW()','SELECT changes()','SELECT json_extract(data,?)','SELECT * INTO copy FROM things'])assert.throws(()=>compile(sql,[],'d1','query'));
  assert.throws(()=>compile('SELECT 1',[],'neon','execute'));
  assert.throws(()=>compile('DELETE FROM things',[],'neon','query'));
  assert.doesNotThrow(()=>compile('INSERT INTO things(id) VALUES(?) RETURNING id',['x'],'neon','execute'));
});
test('parameter and value helpers preserve zero, null, flags, JSON and ISO dates',()=>{
  assert.deepEqual(compile('SELECT ?,?,?,?',[0,false,null,true],'neon','query').args,[0,0,null,1]);
  for(const value of [undefined,{},[],new Date(),NaN,Infinity,Number.MAX_SAFE_INTEGER+1,1n])assert.throws(()=>compile('SELECT ?',[value],'neon','query'));
  assert.deepEqual(decodeJson(encodeJson({name:'one',list:[1]})),{name:'one',list:[1]});assert.throws(()=>encodeJson(1n));assert.throws(()=>decodeJson('{'));
  assert.equal(encodeBoolean(true),1);assert.equal(decodeBoolean(0),false);assert.throws(()=>decodeBoolean(2));assert.throws(()=>encodeBoolean(1));
  assert.equal(timestamp('2026-10-15T10:00:00Z'),'2026-10-15T10:00:00.000Z');assert.throws(()=>timestamp('invalid'));
});
for(const provider of ['neon','d1']){
  test(provider+': factory is per request, cleanup runs after success and failure',async()=>{
    const f=fake(provider);await withDatabase(environments[provider],db=>db.query('SELECT 1'),f.options);
    await assert.rejects(withDatabase(environments[provider],async()=>{throw Error('business error');},f.options),/business error/);
    assert.equal(f.configurations.length,2);if(provider==='d1')assert.equal(f.configurations[0],environments.d1.DB);
  });
  test(provider+': synchronous plan is one atomic batch; invalid/async plans do no I/O',async()=>{
    const f=fake(provider),db=createDatabase(environments[provider],f.options);
    const result=await db.transaction(tx=>{tx.execute('INSERT INTO things(id) VALUES(?)',['one']);tx.query('SELECT id FROM things WHERE id=?',['one']);});
    assert.equal(result.length,2);assert.equal(f.calls,1);const batch=f.events.find(event=>event.batch);assert.equal(batch.batch.length,2);
    if(provider==='neon'){assert.equal(batch.options.fullResults,true);assert.equal(batch.options.readOnly,false);assert.equal(batch.options.isolationLevel,'Serializable');}else assert.equal(batch.mode,'write');
    assert.throws(()=>db.transaction(async tx=>{await tx.query('SELECT 1');}),error=>error.code==='DB_TRANSACTION_CALLBACK');
    assert.throws(()=>db.transaction(()=>Promise.resolve()),error=>error.code==='DB_TRANSACTION_CALLBACK');
    assert.throws(()=>db.transaction(()=>{}),error=>error.code==='DB_TRANSACTION_SIZE');
    assert.throws(()=>db.transaction(()=>db.execute('DELETE FROM things')),error=>error.code==='DB_TRANSACTION_CALLBACK');
    assert.throws(()=>db.transaction(tx=>{tx.execute('INSERT INTO things(id) VALUES(?)',['two']);throw Error('cancel');}),/cancel/);
    assert.equal(f.calls,1);await db.close();assert.throws(()=>db.query('SELECT 1'),error=>error.code==='DB_CLOSED');
  });
  test(provider+': transaction handle cannot be awaited and read-only mode is explicit',async()=>{
    const f=fake(provider),db=createDatabase(environments[provider],f.options);let saved;
    await db.transaction(tx=>{saved=tx;const handle=tx.query('SELECT 1');assert.throws(()=>handle.then(),error=>error.code==='DB_TRANSACTION_CALLBACK');});
    assert.throws(()=>saved.query('SELECT 1'),error=>error.code==='DB_TRANSACTION_CALLBACK');
    const event=f.events.find(event=>event.batch);assert.equal(provider==='neon'?event.options.readOnly:event.mode,provider==='neon'?true:'read');await db.close();
  });
  test(provider+': cold/network read retries once; writes with unknown outcome are never replayed',async()=>{
    const metrics=[],failure=Object.assign(new TypeError('fetch failed: fake-secret'),{cause:Error('fake-token')});
    const f=fake(provider,{failures:[failure]}),db=createDatabase(environments[provider],{...f.options,onMetric:event=>metrics.push(event)});
    await db.query('SELECT ?',['sensitive-parameter']);assert.equal(f.calls,2);assert.equal(metrics[0].willRetry,true);assert.ok(!JSON.stringify(metrics).includes('sensitive'));assert.ok(!JSON.stringify(metrics).includes('fake-secret'));await db.close();
    const w=fake(provider,{failures:[failure]}),write=createDatabase(environments[provider],w.options);
    await assert.rejects(write.execute('DELETE FROM things WHERE id=?',['one']),error=>error.code==='DB_COMMIT_UNKNOWN'&&error.mayHaveCommitted&&!error.retryable);
    assert.equal(w.calls,1);await write.close();
    const b=fake(provider,{failures:[failure]}),batch=createDatabase(environments[provider],b.options);
    await assert.rejects(batch.transaction(tx=>{tx.execute('DELETE FROM things');tx.execute('DELETE FROM others');}),error=>error.code==='DB_COMMIT_UNKNOWN'&&error.mayHaveCommitted);assert.equal(b.calls,1);await batch.close();
  });
  test(provider+': known rolled-back conflicts retry the batch without re-running its callback',async()=>{
    const failure=Object.assign(Error('private'),{code:provider==='neon'?'40001':'SQLITE_BUSY'}),f=fake(provider,{failures:[failure]});
    const db=createDatabase(environments[provider],f.options);let callbacks=0;
    await db.transaction(tx=>{callbacks++;tx.execute('UPDATE things SET name=? WHERE id=?',['one',1]);});assert.equal(callbacks,1);assert.equal(f.calls,2);await db.close();
  });
  test(provider+': quota and constraints are not retried; logger exceptions cannot change a successful write',async()=>{
    for(const [code,expected] of [[provider==='neon'?'23505':'SQLITE_CONSTRAINT_UNIQUE','DB_CONFLICT'],['BLOCKED','DB_QUOTA']]){
      const f=fake(provider,{failures:[Object.assign(Error('sensitive'),{code})]}),db=createDatabase(environments[provider],f.options);
      await assert.rejects(db.execute('DELETE FROM things'),error=>error.code===expected&&!error.message.includes('sensitive'));assert.equal(f.calls,1);await db.close();
    }
    const f=fake(provider,{closeThrows:true}),db=createDatabase(environments[provider],{...f.options,onMetric(){throw Error('observer');},log(){throw Error('logger');}});
    assert.equal((await db.execute('DELETE FROM things')).rowsAffected,0);await db.close();
  });
}

let pg,sqlite;
before(async()=>{
  pg=new PGlite();await pg.exec(readFileSync(new URL('../db/migrations/neon/001_example.sql',import.meta.url),'utf8'));
  sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(readFileSync(new URL('../db/migrations/learning/001_example.sql',import.meta.url),'utf8'));
});
after(async()=>{await pg?.close();sqlite?.close();});
function postgresDriver(engine){
  const run=async(engine,text,args)=>{const value=await engine.query(text,args);return {rows:value.rows,fields:value.fields,rowCount:value.affectedRows||0};};
  return {query(sql,args,options){return {sql,args,then(resolve,reject){return run(engine,sql,args).then(resolve,reject);}};},
    transaction(commands,options){return engine.transaction(async tx=>{if(options.readOnly)await tx.exec('SET TRANSACTION READ ONLY');const results=[];for(const command of commands)results.push(await run(tx,command.sql,command.args));return results;});}};
}
function sqliteClient(engine){
  return {prepare(sql){return {sql,args:[],bind(...args){return {sql,args};}};},async batch(commands){
    engine.exec('BEGIN');try{
      const results=commands.map(command=>{
        try{const query=engine.prepare(command.sql),rows=query.all(...command.args);return {success:true,results:rows,meta:{changes:engine.prepare('SELECT changes() n').get().n}};}
        catch(error){if([1555,2067].includes(error.errcode))error.code='SQLITE_CONSTRAINT_UNIQUE';else if(error.errcode===787)error.code='SQLITE_CONSTRAINT_FOREIGNKEY';throw error;}
      });engine.exec('COMMIT');return results;
    }catch(error){engine.exec('ROLLBACK');throw error;}
  }};
}
for(const provider of ['neon','d1']){
  test(provider+': identical SQL, endpoint and atomic example work on the actual database engine',async()=>{
    const options={...silent,...(provider==='neon'?{createNeon:()=>postgresDriver(pg)}:{createD1:()=>sqliteClient(sqlite)})};
    await withDatabase(environments[provider],async db=>{
      const value=await createQuizWithQuestion(db,{ownerId:'owner',title:"It's a quiz",prompt:'Which one?',choices:['one','two'],createdAt:timestamp('2026-10-15T10:00:00Z')});
      const request=new Request('https://app.example/api/db-example/quizzes/'+value.quizId+'/questions');
      const response=await quizQuestionsEndpoint(request,db,{id:'owner'});assert.equal(response.status,200);
      const data=await response.json();assert.deepEqual(data.questions,[{id:value.questionId,prompt:'Which one?',choices:['one','two']}]);
      assert.deepEqual((await (await quizQuestionsEndpoint(request,db,{id:'outsider'})).json()).questions,[]);
      assert.equal((await quizQuestionsEndpoint(request,db,null)).status,401);
      const inserted=await db.execute('INSERT INTO db_example_quizzes(id,owner_id,title,created_at) VALUES(?,?,?,?) RETURNING id',['returning-'+provider,'owner','test',timestamp()]);
      assert.deepEqual(inserted.rows,[{id:'returning-'+provider}]);assert.equal(inserted.rowsAffected,1);
      await assert.rejects(db.transaction(tx=>{tx.execute('INSERT INTO db_example_quizzes(id,owner_id,title,created_at) VALUES(?,?,?,?)',['rollback-'+provider,'owner','test',timestamp()]);tx.execute('INSERT INTO db_example_quizzes(id,owner_id,title,created_at) VALUES(?,?,?,?)',[value.quizId,'owner','duplicate',timestamp()]);}),error=>error.code==='DB_CONFLICT');
      assert.deepEqual(await db.query('SELECT id FROM db_example_quizzes WHERE id=?',['rollback-'+provider]),[]);
      assert.deepEqual(await db.query('SELECT id FROM db_example_quizzes WHERE id=?',["' OR 1=1 --"]),[]);
    },options);
  });
}
test('unconfigured example authenticates before constructing any database client',async()=>{
  const response=await createQuizExampleWorker().fetch(new Request('https://app.example/api/db-example/quizzes/one/questions'),{});assert.equal(response.status,401);
});

test('cleanup waits for in-flight binding operations without closing a shared D1 binding',async()=>{
  let finish;
  const db=createDatabase(environments.d1,{...silent,createD1:()=>({prepare(){return {};},batch:()=>new Promise(resolve=>{finish=()=>resolve([{success:true,results:[],meta:{changes:0}}]);})})});
  const query=db.query('SELECT 1'),closing=db.close();assert.throws(()=>db.query('SELECT 1'),error=>error.code==='DB_CLOSED');
  finish();await query;await closing;await db.close();
});
test('per-request backpressure caps active binding work and drains queued work before closing',async()=>{
  let active=0,peak=0;const finish=[];
  const db=createDatabase(environments.d1,{...silent,concurrency:2,maxPending:3,createD1:()=>({prepare(){return {};},batch(){
    active++;peak=Math.max(peak,active);return new Promise(resolve=>finish.push(()=>{active--;resolve([{success:true,results:[],meta:{changes:0}}]);}));
  }})});
  const first=db.query('SELECT 1'),second=db.query('SELECT 2'),third=db.query('SELECT 3');
  assert.throws(()=>db.query('SELECT 4'),error=>error.code==='DB_BACKPRESSURE');assert.equal(active,2);
  finish.shift()();await first;assert.equal(active,2);finish.shift()();finish.shift()();await Promise.all([second,third]);await db.close();assert.equal(peak,2);
});
test('actual Neon HTTP driver binds placeholders and returns normalized rows without WebSockets',async()=>{
  const previous=neonConfig.fetchFunction,requests=[];
  neonConfig.fetchFunction=async(url,options)=>{
    assert.equal(new URL(url).protocol,'https:');assert.equal(options.method,'POST');assert.ok(options.signal instanceof AbortSignal);
    const body=JSON.parse(options.body);requests.push(body);
    const result=query=>({fields:[{name:'id',dataTypeID:20}],rows:[['9007199254740993']],rowCount:1,command:query.query.startsWith('SELECT')?'SELECT':'INSERT',rowAsArray:true});
    return Response.json(body.queries?{results:body.queries.map(result)}:result(body));
  };
  try{
    const value="' OR 1=1 --";
    await withDatabase(environments.neon,async db=>{
      assert.deepEqual(await db.query('SELECT id FROM things WHERE name=?',[value]),[{id:'9007199254740993'}]);
      const result=await db.execute('INSERT INTO things(name) VALUES(?) RETURNING id',[value]);assert.deepEqual(result,{rows:[{id:'9007199254740993'}],rowsAffected:1});
    },silent);
    assert.equal(requests.length,2);assert.equal(requests[0].queries[0].query,'SELECT id FROM things WHERE name=$1');assert.deepEqual(requests[0].queries[0].params,[value]);
  }finally{neonConfig.fetchFunction=previous;}
});
