// Post-cutover read-only archive. Never import, freeze, deploy or retry writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync,cpSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient} from '../src/turso-study.mjs';
import {snapshot,restore,reverse,auditReverse} from './turso-backup.mjs';
import {sourceMediaReferences} from './turso-source-media.mjs';
import {localMediaReferences} from './turso-media-backup.mjs';

const base='/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/';
const account='22f73bd94b002b9aee8eed13d261cf13';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function run(){
  const [credentials,workerCapture,...extra]=process.argv.slice(2);
  assert.equal(extra.length,0);
  assert.match(workerCapture,new RegExp('^'+base+'source-worker-[A-Za-z0-9]+$'));
  const worker=JSON.parse(readFileSync(resolve(workerCapture,'worker-backup.json')));
  assert.equal(worker.worker,'learn-english');assert.equal(worker.account,account);
  const auth=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
  const token=auth.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(token&&Date.parse(auth.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1])>Date.now());
  let cloudflareReads=0;
  async function get(path){
    cloudflareReads++;
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,
      {redirect:'error',signal:AbortSignal.timeout(45000),headers:{Authorization:'Bearer '+token,'Accept-Encoding':'identity'}});
    assert.equal(response.status,200,'Cloudflare read failed');
    return response;
  }
  async function boundedBytes(response){
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;assert.ok(size<=32*1024*1024,'Object too large');chunks.push(chunk);}
    return Buffer.concat(chunks);
  }
  const r2Path=(bucket,key)=>'/r2/buckets/'+bucket+'/objects/'+key.split('/').map(encodeURIComponent).join('/');
  const directoryPath=r2Path('learn-english-media','directory/accounts.json');
  const directory=await boundedBytes(await get(directoryPath));
  const data=await snapshot(new TursoStudyClient({...productionCredentials(credentials),mode:'production'}));
  const dir=mkdtempSync(base+'production-final-');chmodSync(dir,0o700);
  const write=(name,bytes)=>writeFileSync(resolve(dir,name),bytes,{flag:'wx',mode:0o600});
  write('snapshot.json',JSON.stringify(data));write('account-directory.json',directory);
  const sqlite=restore(data,resolve(dir,'restored.sqlite'));chmodSync(resolve(dir,'restored.sqlite'),0o600);
  let review;
  try{
    assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const exported=await reverse(sqlite);review=auditReverse(sqlite,exported);
    write('reverse-export.json',JSON.stringify(exported));
  }finally{sqlite.close();}
  mkdirSync(resolve(dir,'media'),{mode:0o700});
  const refs=sourceMediaReferences(data),local=localMediaReferences(data),media=[];let totalBytes=0;
  assert.ok(refs.r2.length+refs.inline.length+local.length<=1000);
  for(const entry of [
    ...refs.r2.map(key=>({bucket:'learn-english-media',key})),
    ...local.map(row=>({bucket:'learn-english-production-media',key:row.key})),
    ...refs.inline.map(row=>({bucket:'worker-assets',key:row.key,expected:row.expectedSha256}))
  ]){
    const bytes=entry.bucket==='worker-assets'
      ?readFileSync(resolve('rollback/turso-production-assets/private-migration-media',entry.key+'.bin'))
      :await boundedBytes(await get(r2Path(entry.bucket,entry.key)));
    totalBytes+=bytes.length;assert.ok(totalBytes<=512*1024*1024);
    const digest=sha(bytes);
    if(entry.expected)assert.equal(digest,entry.expected);
    if(entry.key.startsWith('stage-local/'))assert.equal(digest,entry.key.slice(-64));
    const file='media/'+sha(entry.bucket+':'+entry.key)+'.bin';write(file,bytes);
    media.push({bucket:entry.bucket,key:entry.key,file,bytes:bytes.length,sha256:digest});
  }
  write('media.json',JSON.stringify({objects:media,totalBytes},null,2));
  cpSync(workerCapture,resolve(dir,'worker'),{recursive:true});
  cpSync('rollback/turso-production-assets',resolve(dir,'assets'),{recursive:true});
  for(const name of ['production-crud-MbDNus','production-roles-CfXUhP']){
    const report=JSON.parse(readFileSync(base+name+'/result.json'));
    assert.equal(report.status,'passed');write(name+'-result.json',JSON.stringify(report,null,2));
  }
  // Authentication data stays separate: a fresh D1 account export is added
  // by the operator, never restored automatically alongside education data.
  assert.equal(sha(await boundedBytes(await get(directoryPath))),sha(directory),'Account directory changed during capture');
  const deployments=await(await get('/workers/scripts/learn-english/deployments')).json();
  assert.equal(deployments.success,true);
  const latest=[...deployments.result.deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
  assert.equal(latest.versions.length,1);assert.equal(latest.versions[0].version_id,worker.version);assert.equal(latest.versions[0].percentage,100);
  const files={};
  function verifyTree(path,prefix=''){
    for(const name of readdirSync(path)){
      const file=join(path,name),rel=prefix+name,info=lstatSync(file);assert.ok(!info.isSymbolicLink());
      if(info.isDirectory()){chmodSync(file,0o700);verifyTree(file,rel+'/');}
      else{chmodSync(file,0o600);files[rel]=sha(readFileSync(file));}
    }
  }
  verifyTree(dir);
  for(const entry of media)assert.equal(sha(readFileSync(resolve(dir,entry.file))),entry.sha256);
  const restored=restore(JSON.parse(readFileSync(resolve(dir,'snapshot.json'))));
  assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');restored.close();
  const report={status:'verified-post-cutover-backup',createdAt:new Date().toISOString(),workerVersion:worker.version,
    tables:Object.fromEntries(Object.entries(data.tables).map(([table,rows])=>[table,rows.length])),
    snapshotAt:data.createdAt,review,mediaObjects:media.length,mediaBytes:totalBytes,cloudflareReads,
    d1Queries:0,databaseWrites:0,siteChanged:false,offlineRestoreVerified:true,files,
    authD1ExportRequired:true,knownIssues:['Logout theme save still uses unsupported legacy state route','7 migration issues retained; legacy word-key export must not be reimported']};
  write('verification.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({backup:dir,status:report.status,workerVersion:worker.version,tables:Object.keys(data.tables).length,
    mediaObjects:media.length,mediaBytes:totalBytes,d1Queries:0,databaseWrites:0,offlineRestoreVerified:true}));
}
run().catch(()=>{console.error('Final backup stopped; no production writes or automatic retry.');process.exitCode=1;});
