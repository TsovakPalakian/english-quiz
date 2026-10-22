// Read-only local planning. Does not execute SQL, provision a bucket or use Wrangler.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function workbenchMigrationPlan(){
  const directory=new URL('../migrations/quiz-review-draft/',import.meta.url),files=readdirSync(directory).filter(name=>/^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  if(files.length!==16||files.some((name,index)=>Number(name.slice(0,3))!==index+1))throw Error('Workbench migration sequence requires review.');
  return {readOnly:true,applied:false,productionApproved:false,requires:['verified local clone and restorable backup','account_refs and integer learning entity identities','explicit review of old qr_media purpose constraint','dedicated private test bucket and validated media inspector','approved account and retention policies'],
    steps:files.map(name=>({name,sha256:createHash('sha256').update(readFileSync(new URL(name,directory))).digest('hex')})),
    rollback:'Disable both LEARNING_WORKBENCH flags; preserve added tables and objects. Restore only a verified isolated clone; never drop shared tables or downgrade approved quiz versions.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(workbenchMigrationPlan()));
