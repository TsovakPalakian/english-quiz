// Fresh, bounded, read-only source capture for TsovakDev. No passwords or writes.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {retainedScope} from './turso-retained-scope.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const catalogNames=['lesson-data.js','irregular.js','grammar.js','speakout.js','demonstratives.js','tense-bank.json'];
const accountSql='SELECT id, login, role, active, is_personal_data_revoked FROM users ORDER BY id';
export async function snapshotRetained({account,database,bucket,bearer,anchor,catalogSource,fetchImpl=fetch}){
  if(!/^[a-f0-9]{32}$/.test(account)||!/^[a-f0-9-]{36}$/.test(database)||bucket!=='learn-english-media'||!bearer)
    throw new Error('Unexpected read-only source configuration.');
  catalogSource=realpathSync(catalogSource);
  if(catalogSource===root||catalogSource.startsWith(root+'/'))throw new Error('Use previously frozen catalogs outside assets.');
  const catalogManifestBytes=readFileSync(resolve(catalogSource,'manifest.json'));
  const previous=JSON.parse(catalogManifestBytes);
  if(previous.status!=='complete'||previous.account!==account||previous.bucket!==bucket)throw new Error('Verified frozen catalog source required.');
  const catalogs=catalogNames.map(name=>({name,bytes:readFileSync(resolve(catalogSource,'local-catalogs',name))}));
  // Validate the anchor before spending a source request.
  retainedScope([{id:anchor?.retainedAccountId,login:'TsovakDev',active:1}],anchor?.pairedSource?['pair/tsovak-study.json']:[],anchor);
  const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
  let requests=0,d1Selects=0;
  async function request(path,query=false){
    if(query&&d1Selects++)throw new Error('Account snapshot query budget exceeded.');
    requests++;
    const response=await fetchImpl(base+path,{method:query?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30_000),
      headers:{Authorization:`Bearer ${bearer}`,'Accept-Encoding':'identity',...(query?{'Content-Type':'application/json'}:{})},
      ...(query?{body:JSON.stringify({sql:accountSql,params:[]})}:{})});
    if(!response.ok)throw new Error(`Source read failed: HTTP ${response.status}; no retry.`);
    return response;
  }
  async function list(){
    const objects=[],cursors=new Set();let cursor='';
    for(let page=0;page<10;page++){
      const query=new URLSearchParams({per_page:'1000'});if(cursor)query.set('cursor',cursor);
      const body=await(await request(`/r2/buckets/${bucket}/objects?${query}`)).json();
      if(!body.success||!Array.isArray(body.result))throw new Error('Unexpected source inventory.');
      objects.push(...body.result);
      if(!body.result_info?.is_truncated){
        if(new Set(objects.map(item=>item.key)).size!==objects.length)throw new Error('Duplicate inventory key.');
        return objects;
      }
      cursor=body.result_info.cursor;if(!cursor||cursors.has(cursor))throw new Error('Invalid inventory cursor.');cursors.add(cursor);
    }
    throw new Error('Source inventory exceeds the 10-page bound.');
  }
  const inventory=await list();
  const data=await(await request(`/d1/database/${database}/query`,true)).json();
  if(!data.success||data.result?.length!==1||!data.result[0].success||!Array.isArray(data.result[0].results))throw new Error('Account metadata SELECT failed.');
  const scope=retainedScope(data.result[0].results,inventory.map(item=>item.key),anchor);
  const selected=inventory.filter(item=>scope.includesSource(item.key)).sort((a,b)=>a.key.localeCompare(b.key));
  if(selected.length>12||selected.some(item=>!Number.isSafeInteger(item.size)||item.size<0||item.size>8*1024*1024||typeof item.etag!=='string'))throw new Error('Retained source exceeds snapshot bounds.');
  const directory=mkdtempSync('/private/tmp/english-quiz-retained-source-');
  mkdirSync(resolve(directory,'objects'),{mode:0o700});mkdirSync(resolve(directory,'local-catalogs'),{mode:0o700});
  const write=(name,bytes)=>writeFileSync(resolve(directory,name),bytes,{mode:0o600,flag:'wx'});
  const accounts=Buffer.from(JSON.stringify([scope.account]));write('accounts.json',accounts);
  for(const {name,bytes} of catalogs)write('local-catalogs/'+name,bytes);
  const manifest={version:1,status:'incomplete',startedAt:new Date().toISOString(),accountsReadAt:new Date().toISOString(),account,bucket,
    accountsSha256:sha(accounts),objects:[],inventory,sourceRequests:requests,
    retainedCapture:{login:'TsovakDev',excludedLiveAccounts:scope.excludedAccounts,scopeAnchorSha256:sha(JSON.stringify(anchor)),
      catalogsFromFrozenSource:true,catalogSourceManifestSha256:sha(catalogManifestBytes),catalogs:catalogs.map(({name,bytes})=>({name,sha256:sha(bytes)}))}};
  const save=()=>writeFileSync(resolve(directory,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});save();
  for(const item of selected){
    const response=await request(`/r2/buckets/${bucket}/objects/${item.key.split('/').map(encodeURIComponent).join('/')}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    const etag=response.headers.get('etag')?.replace(/^W\//,'').replace(/^"|"$/g,'');
    const md5Matches=/^[a-f0-9]{32}$/.test(item.etag)&&createHash('md5').update(bytes).digest('hex')===item.etag;
    if(bytes.length!==item.size||bytes.length>8*1024*1024||!md5Matches&&etag!==item.etag)throw new Error('Source object changed; incomplete archive retained.');
    JSON.parse(bytes.toString('utf8'));
    const file=`objects/${sha(item.key)}.json`;write(file,bytes);
    manifest.objects.push({key:item.key,file,etag:item.etag,bytes:bytes.length,sha256:sha(bytes)});manifest.sourceRequests=requests;save();
  }
  const after=await list(),before=new Map(inventory.map(item=>[item.key,item])),later=new Map(after.map(item=>[item.key,item]));
  for(const key of new Set([...before.keys(),...later.keys()]))if(scope.includesSource(key)&&
    (before.get(key)?.etag!==later.get(key)?.etag||before.get(key)?.size!==later.get(key)?.size))throw new Error('Source changed during capture; incomplete archive retained.');
  manifest.status='complete';manifest.completedAt=new Date().toISOString();manifest.sourceRequests=requests;save();
  return {directory,retainedAccounts:1,excludedLiveAccounts:scope.excludedAccounts,sourceObjects:selected.length,sourceRequests:requests,d1Selects,
    liveAccountMetadataVerified:true,loginVerified:false,productionChanged:false,cutoverAllowed:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [anchorFile,catalogSource,...extra]=process.argv.slice(2);
    if(!anchorFile||!catalogSource||extra.length)throw new Error('Usage: node scripts/snapshot-turso-retained.mjs /private/scope.json /private/frozen-catalog-source');
    const config=readFileSync(resolve(root,'wrangler.toml'),'utf8'),saved=readFileSync(resolve(homedir(),'.wrangler/config/default.toml'),'utf8');
    const bearer=saved.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],expiry=saved.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
    if(!bearer||!expiry||Date.parse(expiry)<=Date.now())throw new Error('Cloudflare login expired; fresh capture not started.');
    const result=await snapshotRetained({account:config.match(/^account_id\s*=\s*"([a-f0-9]{32})"/m)?.[1],
      database:config.match(/^database_id\s*=\s*"([a-f0-9-]{36})"/m)?.[1],bucket:config.match(/^bucket_name\s*=\s*"([a-z0-9-]+)"/m)?.[1],
      bearer,anchor:JSON.parse(readFileSync(anchorFile,'utf8')),catalogSource});
    console.log(JSON.stringify(result));
  }catch(error){console.error(error.message==='fetch failed'?'Source network unavailable; no retry.':error.message);process.exitCode=1;}
}
