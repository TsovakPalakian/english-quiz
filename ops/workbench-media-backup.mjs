// Explicit private local archive only. Never restores objects into a cloud bucket.
import {mkdirSync,writeFileSync,readFileSync,statSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {boundedProviderBytes} from '../src/bounded-provider-body.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const valid=row=>row&&/^[a-f0-9-]{36}$/.test(row.id)&&/^[a-f0-9]{64}$/.test(row.digest)&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=20*1024*1024;
const key=row=>'quiz-media/'+row.id+'/'+row.digest;
export async function backupWorkbenchMedia({db,store,directory,freezeConfirmed=false,maxObjects=1000,maxBytes=1024*1024*1024}={}){
  if(freezeConfirmed!==true||typeof db?.read!=='function'||!['dedicated-workbench-r2-test','dedicated-workbench-r2-production'].includes(store?.kind)||typeof directory!=='string'||!Number.isSafeInteger(maxObjects)||maxObjects<1||maxObjects>10000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024*1024)throw Error('Explicit frozen source, private store and bounded archive are required.');
  const query='SELECT id,digest,mime,bytes FROM qr_media WHERE deleted_at IS NULL ORDER BY id',rows=await db.read(query);
  if(rows.length>maxObjects||rows.some(row=>!valid(row))||rows.reduce((sum,row)=>sum+row.bytes,0)>maxBytes)throw Error('Private media archive exceeds reviewed bounds.');
  mkdirSync(directory,{mode:0o700});chmodSync(directory,0o700);
  for(const row of rows){
    const object=await store.get(key(row));if(!object||object.size!==row.bytes)throw Error('Referenced private media is unavailable.');
    const bytes=object.body instanceof Uint8Array?object.body:await boundedProviderBytes(object.body,row.bytes);if(bytes.length!==row.bytes||hash(bytes)!==row.digest)throw Error('Private media integrity failure.');
    writeFileSync(join(directory,row.id+'.bin'),bytes,{flag:'wx',mode:0o600});
  }
  if(JSON.stringify(await db.read(query))!==JSON.stringify(rows))throw Error('Media source changed; this archive is not a verified snapshot.');
  const manifest={version:1,private:true,cloudRestoreAllowed:false,sourceFreezeAsserted:true,objects:rows};
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest)+'\n',{flag:'wx',mode:0o600});
  return {objects:rows.length,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),manifestSha256:hash(JSON.stringify(manifest)+'\n'),productionApproved:false};
}
export function verifyWorkbenchMediaBackup(directory,{expectedManifestSha256}={}){
  if(typeof directory!=='string'||!/^[a-f0-9]{64}$/.test(expectedManifestSha256||''))throw Error('An externally retained manifest checksum is required.');
  const path=join(directory,'manifest.json');if(statSync(path).size>5*1024*1024)throw Error('Archive manifest exceeds bounds.');
  const bytes=readFileSync(path);if(hash(bytes)!==expectedManifestSha256)throw Error('Archive manifest changed.');
  const value=JSON.parse(bytes);if(value.version!==1||value.private!==true||value.cloudRestoreAllowed!==false||!Array.isArray(value.objects)||value.objects.length>10000||new Set(value.objects.map(row=>row.id)).size!==value.objects.length)throw Error('Invalid private archive.');
  for(const row of value.objects){
    if(!valid(row))throw Error('Invalid private object identity.');const path=join(directory,row.id+'.bin');
    if(statSync(path).size!==row.bytes||hash(readFileSync(path))!==row.digest)throw Error('Private archive object changed.');
  }
  return {verified:true,manifest:value,cloudRestoreAllowed:false};
}
export function restoreWorkbenchMediaLocally(directory,target,{expectedManifestSha256}={}){
  const {manifest}=verifyWorkbenchMediaBackup(directory,{expectedManifestSha256});
  mkdirSync(target,{mode:0o700});chmodSync(target,0o700);
  for(const row of manifest.objects){const bytes=readFileSync(join(directory,row.id+'.bin'));if(bytes.length!==row.bytes||hash(bytes)!==row.digest)throw Error('Private archive changed during restore.');writeFileSync(join(target,row.id+'.bin'),bytes,{flag:'wx',mode:0o600});}
  const bytes=readFileSync(join(directory,'manifest.json'));if(hash(bytes)!==expectedManifestSha256)throw Error('Private manifest changed during restore.');
  writeFileSync(join(target,'manifest.json'),bytes,{flag:'wx',mode:0o600});
  return {localOnly:true,objects:manifest.objects.length,cloudModified:false};
}
