// Explicit production release preparation. Exports only; never changes live SQL.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {restrictExportImport,rehearseD1Export} from './rehearse-workbench-d1-export.mjs';
import {workbenchReleasePolicy} from './workbench-release-policy.mjs';
import {workbenchBootstrap} from './prepare-workbench-bootstrap.mjs';
export async function prepareRelease({directory,wrangler}={}){
  process.umask(0o077);mkdirSync(directory,{mode:0o700});
  const run=args=>{const r=spawnSync(process.execPath,[wrangler,...args],{encoding:'utf8',timeout:300000,maxBuffer:32*1024*1024});if(r.status!==0)throw Error('Private release command failed; output suppressed.');return r.stdout;};
  const save=(name,data)=>writeFileSync(join(directory,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
  const gemini=parseEnv(readFileSync('.gemini.local.env','utf8')),azure=parseEnv(readFileSync('.azure.local.env','utf8'));
  if(!gemini.GEMINI_API_KEY||!gemini.GEMINI_PROJECT_ID||azure.AZURE_SPEECH_TIER!=='F0'||!azure.AZURE_SPEECH_KEY||azure.AZURE_SPEECH_ENDPOINT!=='https://'+azure.AZURE_SPEECH_REGION+'.api.cognitive.microsoft.com/')throw Error('Explicit free-tier credentials are required.');
  for(const binding of ['DB','STUDY_DB'])run(['d1','export',binding,'--remote','--config','wrangler.toml','--output',resolve(directory,binding+'.sql')]);
  const auth=new DatabaseSync(join(directory,'auth-restored.sqlite'));let workerId;
  try{auth.exec('PRAGMA foreign_keys=OFF');restrictExportImport(auth);auth.exec(readFileSync(join(directory,'DB.sql'),'utf8'));auth.setAuthorizer(null);auth.exec('PRAGMA foreign_keys=ON');
    if(auth.prepare('PRAGMA quick_check').get().quick_check!=='ok'||auth.prepare('PRAGMA foreign_key_check').all().length)throw Error('Auth backup integrity failed.');
    const rows=auth.prepare("SELECT id FROM users WHERE login='TsovakDev' AND role='DEVELOPER' AND active=1 AND COALESCE(is_personal_data_revoked,0)=0").all();if(rows.length!==1)throw Error('Existing developer worker must be unambiguous.');workerId=rows[0].id;
  }finally{auth.close();}
  const study=await rehearseD1Export(join(directory,'STUDY_DB.sql'),join(directory,'study-restore'));
  const pack=workbenchBootstrap();save('bootstrap.sql',pack.sql);save('bootstrap-manifest.json',pack.manifest);
  save('secrets.json',{WORKBENCH_GEMINI_KEY:gemini.GEMINI_API_KEY,WORKBENCH_GEMINI_PROJECT:gemini.GEMINI_PROJECT_ID,WORKBENCH_AZURE_KEY:azure.AZURE_SPEECH_KEY,WORKBENCH_AZURE_RESOURCE:azure.AZURE_SPEECH_RESOURCE,WORKBENCH_AZURE_REGION:azure.AZURE_SPEECH_REGION,LEARNING_WORKBENCH_WORKER_ID:workerId,LEARNING_WORKBENCH_POLICY:JSON.stringify(workbenchReleasePolicy())});
  const result={preparedAt:new Date().toISOString(),authRestoreVerified:true,studyRestoreVerified:!!study,bootstrapSha256:pack.manifest.sqlSha256,sourceSha256:createHash('sha256').update(readFileSync(join(directory,'STUDY_DB.sql'))).digest('hex'),liveDatabaseWrites:false,deployed:false};save('preparation.json',result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [directory,wrangler,...extra]=process.argv.slice(2);if(!directory||!wrangler||extra.length)throw Error('A new private directory and installed Wrangler path are required.');
  try{console.log(JSON.stringify(await prepareRelease({directory,wrangler})));}catch(error){console.error(JSON.stringify({error:error.message,deployed:false}));process.exitCode=1;}
}
