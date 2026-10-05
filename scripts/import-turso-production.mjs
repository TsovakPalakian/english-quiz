// Explicit production import, never invoked by plan/build/deploy. No D1/R2.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {verifyCandidate} from './turso-cutover-candidate.mjs';
import {TursoStudyClient,statement} from '../src/turso-study.mjs';
import {restore,snapshot} from './turso-backup.mjs';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const rowHash=rows=>hash(canonical(rows.map(canonical).sort()));
export function importCommands(data){
  restore(data).close();
  const commands=[];
  for(const type of ['table','index','view','trigger'])for(const row of data.schema.filter(r=>r.type===type))commands.push(statement(row.sql));
  for(const [table,rows] of Object.entries(data.tables)){
    assert.match(table,/^[a-z_][a-z0-9_]*$/);
    for(const row of rows){const columns=Object.keys(row);for(const column of columns)assert.match(column,/^[a-z_][a-z0-9_]*$/);
      commands.push(statement(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,Object.values(row)));
    }
  }
  const chunks=[];let chunk=[],size=0;
  for(const command of commands){const bytes=Buffer.byteLength(JSON.stringify(command));assert.ok(bytes<=1024*1024,'Single statement exceeds import bound.');
    if(chunk.length&&(chunk.length>=100||size+bytes>1024*1024)){chunks.push(chunk);chunk=[];size=0;}
    chunk.push(command);size+=bytes;
  }
  if(chunk.length)chunks.push(chunk);return chunks;
}
export async function importEmpty(session,data){
  const chunks=importCommands(data);let commitAttempted=false;
  try{
    await session.execute([statement('PRAGMA foreign_keys=ON'),statement('BEGIN IMMEDIATE')]);
    const [objects]=await session.execute([statement("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")]);
    assert.equal(objects.length,0,'Target is not empty: import refused; never overwrite or resume automatically.');
    await session.execute([statement('PRAGMA defer_foreign_keys=ON')]);
    for(const chunk of chunks)await session.execute(chunk);
    const [foreign]=await session.execute([statement('PRAGMA foreign_key_check')]);assert.equal(foreign.length,0);
    const [integrity]=await session.execute([statement('PRAGMA integrity_check')]);assert.equal(integrity[0]?.integrity_check,'ok');
    // Verify every table inside the same transaction, before committing.
    for(const [table,rows] of Object.entries(data.tables)){
      const [actual]=await session.execute([statement('SELECT * FROM '+table)]);assert.equal(rowHash(actual),rowHash(rows),'Target row mismatch: '+table);
    }
    commitAttempted=true;await session.execute([statement('COMMIT')]);
    await session.close();return {status:'committed-and-verified',tables:25,chunks:chunks.length};
  }catch(error){
    try{await session.close();}catch{}
    const failure=new Error(commitAttempted?'Commit outcome uncertain; inspect target before any retry.':'Import stopped; connection closed to roll back. Inspect target before retry.');
    failure.cause=error;throw failure;
  }
}
export function remoteSession({endpoint,token,fetchImpl=fetch}){
  // Fixed production database host, HTTPS path, no test/group/platform tokens.
  new TursoStudyClient({endpoint,token,mode:'production'});
  let baton=null,closed=false;
  async function send(requests){
    const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(45000),
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...(baton?{baton}:{}),requests})});
    assert.ok(response.ok,'Import transport rejected.');const value=await response.json();
    if(typeof value.baton==='string')baton=value.baton;
    else if(value.baton===null)baton=null;
    assert.equal(value.results?.length,requests.length,'Unexpected import protocol response.');
    return value.results.map((item,i)=>{
      assert.equal(item.type,'ok','Import statement rejected.');assert.equal(item.response.type,requests[i].type);
      if(requests[i].type==='close')return [];
      const result=item.response.result;return result.rows.map(row=>Object.fromEntries(result.cols.map((col,j)=>{
        const cell=row[j];return [col.name,cell.type==='null'?null:['integer','float'].includes(cell.type)?Number(cell.value):cell.value];
      })));
    });
  }
  return {
    async execute(commands){assert.equal(closed,false);const result=await send(commands.map(stmt=>({type:'execute',stmt})));
      // The server may close a stream after a successful COMMIT. Never reuse
      // the previous baton or reject the already confirmed commit in that case.
      assert.ok(baton||commands.length===1&&commands[0].sql==='COMMIT','Missing transaction baton.');return result;},
    async close(){if(closed)return;closed=true;if(baton)await send([{type:'close'}]);}
  };
}
export async function candidatePlan(directory){
  const verified=await verifyCandidate(directory),data=JSON.parse(readFileSync(resolve(directory,'snapshot.json')));
  const chunks=importCommands(data);
  return {data,report:{status:'offline-import-plan',tables:verified.tables,rows:Object.values(data.tables).reduce((n,r)=>n+r.length,0),
    chunks:chunks.length,snapshotSha256:hash(readFileSync(resolve(directory,'snapshot.json'))),networkRequests:0,liveDataChanged:false}};
}
export async function rehearseCandidate(data){
  const db=new DatabaseSync(':memory:');
  const session={async execute(commands){return commands.map(c=>{
    const values=c.args.map(v=>v.type==='null'?null:v.type==='integer'?Number(v.value):v.value);
    const q=db.prepare(c.sql);return q.columns().length?q.all(...values):(q.run(...values),[]);
  });},async close(){if(db.isTransaction)db.exec('ROLLBACK');}};
  try{return {...await importEmpty(session,data),status:'offline-full-candidate-rehearsal-passed',networkRequests:0};}
  finally{db.close();}
}
export function productionCredentials(file){
  assert.match(file,/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/production-credentials-[A-Za-z0-9]+\/worker\.vars$/);
  const info=lstatSync(file);assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o077)===0&&realpathSync(file)===file);
  const values={};for(const line of readFileSync(file,'utf8').split(/\r?\n/)){
    const match=line.match(/^(TURSO_URL|TURSO_AUTH_TOKEN)=(.+)$/);if(match){assert.equal(values[match[1]],undefined);values[match[1]]=match[2];}
  }
  assert.match(values.TURSO_AUTH_TOKEN||'',/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const claims=JSON.parse(Buffer.from(values.TURSO_AUTH_TOKEN.split('.')[1],'base64url'));
  assert.ok(claims.exp*1000>Date.now()+60000,'Expired production credential.');
  const url=new URL(values.TURSO_URL);assert.ok(['https:','libsql:'].includes(url.protocol));
  assert.ok(!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&['','/'].includes(url.pathname));
  return {endpoint:'https://'+url.hostname+'/v2/pipeline',token:values.TURSO_AUTH_TOKEN};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,directory,file,flag,target,...extra]=process.argv.slice(2);
    assert.ok(['--plan','--rehearse','--apply'].includes(mode));const {data,report}=await candidatePlan(directory);
    if(mode!=='--apply'){assert.ok(!file&&!flag&&!target&&!extra.length);console.log(JSON.stringify(mode==='--plan'?report:await rehearseCandidate(data)));}
    else{
      assert.ok(file&&flag==='--target'&&target==='english-quiz-production'&&!extra.length,'Explicit fixed production target required.');
      const credentials=productionCredentials(file),result=await importEmpty(remoteSession(credentials),data);
      const actual=await snapshot(new TursoStudyClient({...credentials,mode:'production'}));
      assert.equal(canonical(actual.schema),canonical(data.schema));
      for(const [table,rows] of Object.entries(data.tables))assert.equal(rowHash(actual.tables[table]),rowHash(rows));
      console.log(JSON.stringify({...result,postCommitReadback:true,accounts:data.tables.account_refs.length,deploymentPerformed:false}));
    }
  }catch{console.error('Production import stopped. Diagnostics suppressed; verify target state before retry, never reset it automatically.');process.exitCode=1;}
}
