// Read-only local planning. Does not execute SQL, provision a bucket or use Wrangler.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function workbenchMigrationPlan(){
  const directory=new URL('../migrations/quiz-review-draft/',import.meta.url),files=readdirSync(directory).filter(name=>/^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  if(files.length!==19||files.some((name,index)=>Number(name.slice(0,3))!==index+1))throw Error('Workbench migration sequence requires review.');
  return {readOnly:true,applied:false,productionApproved:false,requires:['verified local clone and restorable backup','account_refs and integer learning entity identities','explicit review of old qr_media purpose constraint','dedicated private test bucket and validated media inspector','approved account and retention policies'],
    steps:files.map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL(name,directory))).digest('hex')})),
    rollback:'Disable both LEARNING_WORKBENCH flags; preserve added tables and objects. Restore only a verified isolated clone; never drop shared tables or downgrade approved quiz versions.'};
}
export function workbenchUpgradePlan(applied=[]){
  const plan=workbenchMigrationPlan();
  if(!Array.isArray(applied)||applied.length>plan.steps.length||applied.some((step,index)=>!step||Object.keys(step).some(key=>!['name','sha256'].includes(key))||step.name!==plan.steps[index].name||step.sha256!==plan.steps[index].sha256))throw Error('An explicitly reviewed contiguous checksum baseline is required.');
  return {...plan,baseline:applied.map(step=>({...step})),steps:plan.steps.slice(applied.length),incremental:applied.length>0,baselineVerified:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(workbenchMigrationPlan()));
