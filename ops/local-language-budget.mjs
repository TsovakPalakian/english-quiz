import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,existsSync,lstatSync,openSync,closeSync,chmodSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {sqliteStudyDatabase} from './local-study-database.mjs';
import {LanguageAccessPolicy} from '../src/language-access-policy.mjs';
// Local admission history survives restarts; credentials and audio never enter it.
export async function openLocalLanguageBudget({filename,adapter,accountId,limits,maxInputBytes,now=Date.now}){
  if(!isAbsolute(filename||'')||typeof accountId!=='string'||!accountId||accountId.length>400||typeof now!=='function')throw Error('Invalid local language budget.');
  mkdirSync(dirname(filename),{recursive:true,mode:0o700});
  if(!existsSync(filename))closeSync(openSync(filename,'wx',0o600));
  if(!lstatSync(filename).isFile()||lstatSync(filename).isSymbolicLink())throw Error('Invalid local budget file.');chmodSync(filename,0o600);
  const sql=new DatabaseSync(filename);
  try{
    if(!sql.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='qr_language_access'").get()){
      sql.exec('BEGIN IMMEDIATE');try{sql.exec(readFileSync(new URL('../migrations/quiz-review-draft/014_language_access.sql',import.meta.url),'utf8'));sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}
    }
    const access=new LanguageAccessPolicy(sqliteStudyDatabase(sql),{now}),actor={id:'local-language-developer',role:'DEVELOPER'};
    const scope=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([adapter.provider,accountId]))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const {id,provider,model,version,billing}=adapter,current=await access.inspect(actor,scope),wrapped=access.wrap(adapter,{scope,limits});
    await access.confirm(actor,{mutationId:crypto.randomUUID(),scope,expectedRevision:current.revision,reason:'Explicit local preview; no production data.',policy:{enabled:true,bindings:[{id,provider,model,version,billing}],tasks:[...new Set(adapter.capabilities.map(cap=>cap.task))],termsRevision:'local-preview-consent-v1',dataProcessingApproved:true,noPaidOverageConfirmed:true,expiresAt:now()+86400000,dailyRequests:limits.dayRequests,dailyInputBytes:limits.dayRequests*maxInputBytes,maxInputBytes}});
    return {adapter:wrapped,async remaining(){const {n}=sql.prepare('SELECT COUNT(*) AS n FROM qr_language_access_usage WHERE scope=? AND admitted_at>?').get(scope,now()-86400000);return Math.max(0,limits.dayRequests-Number(n));},close(){sql.close();}};
  }catch(error){sql.close();throw error;}
}
