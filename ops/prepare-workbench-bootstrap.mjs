// Generates private local artifacts only. Never invokes Wrangler or opens a database.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {workbenchMigrationPlan} from './learning-workbench-migration-plan.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function workbenchBootstrap(){
  const plan=workbenchMigrationPlan(),sources=new Map(plan.steps.map(step=>{
    const sql=readFileSync(new URL('../migrations/quiz-review-draft/'+step.name,import.meta.url),'utf8');if(hash(sql)!==step.sha256)throw Error('Migration changed during preparation.');return [step.name,sql];
  }));
  const original=sources.get('012_speech_practice.sql'),expanded=sources.get('017_lesson_speech.sql');
  const start=original.indexOf('CREATE TABLE qr_speech_tasks ('),end=original.indexOf('\n);',start),newStart=expanded.indexOf('CREATE TABLE qr_speech_tasks_expanded ('),newEnd=expanded.indexOf('\n);',newStart);
  if([start,end,newStart,newEnd].some(index=>index<0)||original.indexOf('CREATE TABLE qr_speech_tasks (',start+1)!==-1||!expanded.slice(newStart,newEnd).includes('CHECK((card_id IS NULL AND sense_id IS NULL)'))throw Error('Speech schema requires review.');
  const table=expanded.slice(newStart,newEnd+3).replace('CREATE TABLE qr_speech_tasks_expanded (','CREATE TABLE qr_speech_tasks (');
  const speech=original.slice(0,start)+table+original.slice(end+3);
  // Refuse any pre-existing/partial qr_* schema before creating the first module table.
  const guard="CREATE TABLE workbench_bootstrap_guard(ok INTEGER NOT NULL CHECK(ok=1));\nINSERT INTO workbench_bootstrap_guard SELECT NOT EXISTS(SELECT 1 FROM sqlite_master WHERE name GLOB 'qr_*');\nDROP TABLE workbench_bootstrap_guard;\n";
  const sql=guard+plan.steps.filter(step=>step.name!=='017_lesson_speech.sql').map(step=>step.name==='012_speech_practice.sql'?speech:sources.get(step.name)).join('\n')+'\n';
  return {sql,manifest:{version:1,kind:'fresh-workbench-bootstrap',sourceMigrations:plan.steps,sqlSha256:hash(sql),installsFinalSpeechSchemaDirectly:true,requiresEmptyWorkbench:true,remoteApplied:false,productionApproved:false}};
}
export function writeWorkbenchBootstrap(directory){
  const result=workbenchBootstrap();mkdirSync(directory,{mode:0o700});
  writeFileSync(join(directory,'bootstrap.sql'),result.sql,{flag:'wx',mode:0o600});writeFileSync(join(directory,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return {directory:resolve(directory),...result.manifest};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4||process.argv[2]!=='--out')throw Error('Usage: node ops/prepare-workbench-bootstrap.mjs --out <new-private-directory>');
  console.log(JSON.stringify(writeWorkbenchBootstrap(process.argv[3])));
}
