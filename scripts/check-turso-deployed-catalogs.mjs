// Six bounded public asset GETs only. No credentials/D1/R2 API or live writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
  const [directory,origin,...extra]=process.argv.slice(2),url=new URL(origin);
  if(extra.length||!/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/tsovakdev-plan-[A-Za-z0-9]+$/.test(directory)
    ||url.origin!=='https://learn-english.east-tarsal.workers.dev'||url.pathname!=='/'||url.search||url.hash)throw new Error('Only the recorded private projection and source public Worker are allowed.');
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json')));
  if(manifest.status!=='complete'||manifest.projection?.retainedLogin!=='TsovakDev')throw new Error('Verified retained projection required.');
  const results=[];
  for(const name of ['lesson-data.js','irregular.js','grammar.js','speakout.js','demonstratives.js','tense-bank.json']){
    const expected=sha(readFileSync(join(directory,'local-catalogs',name)));
    const response=await fetch(new URL(name,url),{redirect:'error',signal:AbortSignal.timeout(20_000)});
    if(!response.ok){results.push({name,status:response.status,compared:false});break;}
    const reader=response.body.getReader(),chunks=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>8*1024*1024){await reader.cancel();throw new Error('Public catalog exceeds size bound.');}chunks.push(value);}
    const actual=sha(Buffer.concat(chunks));results.push({name,compared:true,matches:actual===expected,expectedSha256:expected,deployedSha256:actual});
  }
  const report={sourceOrigin:url.origin,checkedAt:new Date().toISOString(),allMatch:results.length===6&&results.every(r=>r.matches),results,productionChanged:false};
  const file=resolve(directory,'deployed-catalog-review-'+Date.now()+'.json');writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({allMatch:report.allMatch,assetsCompared:results.filter(r=>r.compared).length,mismatches:results.filter(r=>r.compared&&!r.matches).map(r=>r.name),firstHttpFailure:results.find(r=>!r.compared)?.status||null,report:file,productionChanged:false}));
}catch{console.error('Public catalog comparison unavailable; no retry or source changes.');process.exitCode=1;}
