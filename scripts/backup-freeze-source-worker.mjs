// Capture exact live code/settings before a narrowly scoped content-only update.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,chmodSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const account='22f73bd94b002b9aee8eed13d261cf13',worker='learn-english';
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const saved=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
const token=saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],expiry=saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(token&&Date.parse(expiry)>Date.now(),'Refresh Cloudflare login first.');
async function call(path,options={}){
  const response=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(30000),...options,
    headers:{Authorization:'Bearer '+token,...options.headers}});
  assert.ok(response.ok,'Source Worker request failed: HTTP '+response.status);return response;
}
async function json(path){const body=await(await call(path)).json();assert.equal(body.success,true);return body.result;}
function active(value){const list=value.deployments||value;assert.ok(Array.isArray(list)&&list.length);
  const latest=[...list].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
  assert.equal(latest.versions.length,1);assert.equal(latest.versions[0].percentage,100);return latest.versions[0].version_id;}
function sameSettings(after,before){
  // Cloudflare updates only upload provenance annotations on content replacement.
  const {annotations:a,...actual}=after,{annotations:b,...expected}=before;
  assert.deepEqual(actual,expected,'Operational source settings changed unexpectedly.');
}
const [mode,directory,...extra]=process.argv.slice(2);
try{
  assert.ok(!extra.length);
  if(mode==='--backup'){
    assert.ok(!directory);const deployments=await json('/deployments'),version=active(deployments),settings=await json('/settings');
    const versionInfo=await json('/versions/'+version),subdomain=await json('/subdomain');
    const content=await call('/content/v2');assert.ok(content.headers.get('content-type')?.startsWith('multipart'));
    const entrypoint=content.headers.get('cf-entrypoint');assert.ok(entrypoint&&!entrypoint.includes('..'));
    const form=await content.formData(),modules=[];
    const dir=mkdtempSync('/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/source-worker-');chmodSync(dir,0o700);
    mkdirSync(resolve(dir,'modules'),{mode:0o700});
    const write=(name,bytes)=>writeFileSync(resolve(dir,name),bytes,{mode:0o600,flag:'wx'});
    for(const [name,value] of form.entries()){
      assert.match(name,/^[A-Za-z0-9_./-]+$/);assert.ok(!name.includes('..'));
      const bytes=typeof value==='string'?Buffer.from(value):Buffer.from(await value.arrayBuffer());
      assert.ok(bytes.length<=8*1024*1024);const file='modules/'+sha(name)+'.bin';write(file,bytes);
      modules.push({name,file,type:value.type||'application/javascript+module',sha256:sha(bytes)});
    }
    assert.ok(modules.some(row=>row.name===entrypoint));assert.equal(active(await json('/deployments')),version,'Deployment changed during capture.');
    for(const [name,value] of Object.entries({deployments,settings,versionInfo,subdomain}))write(name+'.json',JSON.stringify(value,null,2));
    write('worker-backup.json',JSON.stringify({account,worker,version,entrypoint,modules,createdAt:new Date().toISOString()},null,2));
    console.log(JSON.stringify({directory:dir,version,modules:modules.length,productionChanged:false}));
  }else if(mode==='--freeze'){
    assert.match(directory,/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/source-worker-[A-Za-z0-9]+$/);
    const backup=JSON.parse(readFileSync(resolve(directory,'worker-backup.json')));
    assert.equal(backup.account,account);assert.equal(backup.worker,worker);
    assert.equal(active(await json('/deployments')),backup.version,'Source deployment changed: fresh backup required.');
    const before=await json('/settings');assert.deepEqual(before,JSON.parse(readFileSync(resolve(directory,'settings.json'))));
    const form=new FormData();
    for(const module of backup.modules){const bytes=readFileSync(resolve(directory,module.file));assert.equal(sha(bytes),module.sha256);
      form.set(module.name,new File([bytes],module.name,{type:module.type}));}
    const middleware=readFileSync(new URL('../src/migration-freeze.mjs',import.meta.url),'utf8');
    const source=`import legacy from ${JSON.stringify('./'+backup.entrypoint)};\n`+middleware+'\nexport default migrationFreeze(legacy);\n';
    assert.ok(!backup.modules.some(row=>row.name==='migration-freeze.mjs'));
    form.set('migration-freeze.mjs',new File([source],'migration-freeze.mjs',{type:'application/javascript+module'}));
    form.set('metadata',JSON.stringify({main_module:'migration-freeze.mjs'}));
    // Official content endpoint retains existing config/bindings/assets.
    const result=await(await call('/content',{method:'PUT',body:form})).json();assert.equal(result.success,true);
    const after=await json('/settings');sameSettings(after,before);
    const version=active(await json('/deployments'));
    writeFileSync(resolve(directory,'freeze-result.json'),JSON.stringify({frozenAt:new Date().toISOString(),version,rollbackVersion:backup.version,
      configUnchanged:true,sourceCodePreserved:true,switchedToTurso:false},null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({version,rollbackVersion:backup.version,educationWritesFrozen:true,configUnchanged:true,switchedToTurso:false}));
  }else if(mode==='--verify-frozen'){
    assert.match(directory,/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/source-worker-[A-Za-z0-9]+$/);
    const backup=JSON.parse(readFileSync(resolve(directory,'worker-backup.json')));
    sameSettings(await json('/settings'),JSON.parse(readFileSync(resolve(directory,'settings.json'))));
    const content=await call('/content/v2');assert.equal(content.headers.get('cf-entrypoint'),'migration-freeze.mjs');
    const form=await content.formData();assert.equal([...form.keys()].length,backup.modules.length+1);
    for(const module of backup.modules){const value=form.get(module.name);assert.ok(value);assert.equal(sha(Buffer.from(await value.arrayBuffer())),module.sha256);}
    const middleware=readFileSync(new URL('../src/migration-freeze.mjs',import.meta.url),'utf8');
    const expected=`import legacy from ${JSON.stringify('./'+backup.entrypoint)};\n`+middleware+'\nexport default migrationFreeze(legacy);\n';
    assert.equal(await form.get('migration-freeze.mjs').text(),expected);
    const version=active(await json('/deployments'));
    const result={verifiedAt:new Date().toISOString(),version,rollbackVersion:backup.version,configUnchanged:true,sourceCodePreserved:true,switchedToTurso:false};
    writeFileSync(resolve(directory,'freeze-result.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({...result,educationWritesFrozen:true}));
  }else throw Error('Use --backup, --freeze or --verify-frozen <source-worker-backup>.');
}catch(error){console.error('Source capture/freeze stopped:',error.message);process.exitCode=1;}
