import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,existsSync,lstatSync,openSync,closeSync,chmodSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {sqliteStudyDatabase} from './local-study-database.mjs';
import {LanguageAccessPolicy} from '../src/language-access-policy.mjs';
import {createGeminiQuizAdapter} from '../src/gemini-quiz-provider.mjs';
import {LanguageProviderError} from '../src/language-providers.mjs';
const fail=()=>{throw new LanguageProviderError('local_gemini_configuration_required');};
export async function openLocalGeminiProvider({filename,apiKey,quotaProject,confirmFreeTier=false,allowDataProcessing=false,fetchImpl,now=Date.now}={}){
  if(confirmFreeTier!==true||allowDataProcessing!==true||!isAbsolute(filename||'')||typeof fetchImpl!=='function'||typeof apiKey!=='string'||!apiKey||apiKey.length>512||/[\s\x00-\x1f\x7f]/.test(apiKey)||typeof quotaProject!=='string'||!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(quotaProject))fail();
  mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  if(!existsSync(filename))closeSync(openSync(filename,'wx',0o600));
  if(!lstatSync(filename).isFile()||lstatSync(filename).isSymbolicLink())fail();chmodSync(filename,0o600);
  const sql=new DatabaseSync(filename);
  try{
    if(!sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='qr_language_access'").get()){
      sql.exec('BEGIN IMMEDIATE');try{sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/014_language_access.sql',import.meta.url),'utf8'));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    }
    const db=sqliteStudyDatabase(sql),access=new LanguageAccessPolicy(db,{now}),actor={id:'local-gemini-developer',role:'DEVELOPER'};
    const scope=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['google',quotaProject]))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const adapter=createGeminiQuizAdapter({enabled:true,freeTierVerified:true,allowDataProcessing:true,apiKey,termsRevision:'local-preview-consent-v1',maxTokens:4096,fetchImpl});
    const {id,provider,model,version,billing}=adapter,current=await access.inspect(actor,scope);
    await access.confirm(actor,{mutationId:crypto.randomUUID(),scope,expectedRevision:current.revision,reason:'Explicit local preview; synthetic lesson data only.',policy:{enabled:true,bindings:[{id,provider,model,version,billing}],tasks:['generation'],termsRevision:'local-preview-consent-v1',dataProcessingApproved:true,noPaidOverageConfirmed:true,expiresAt:now()+86400000,dailyRequests:5,dailyInputBytes:60000,maxInputBytes:12000}});
    return {adapter:access.wrap(adapter,{scope,limits:{minuteRequests:2,dayRequests:5}}),
      async remaining(){const at=now();const {n}=sql.prepare('SELECT COUNT(*) AS n FROM qr_language_access_usage WHERE scope=? AND admitted_at>?').get(scope,at-86400000);return Math.max(0,5-Number(n));},
      close(){sql.close();}};
  }catch(error){sql.close();throw error;}
}
