// Curriculum patch for the Predictions grammar topic. No D1, account, lesson or card changes.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement} from '../src/turso-study.mjs';
export const predictions=JSON.parse(readFileSync(new URL('../content/grammar-predictions.json',import.meta.url),'utf8'));
function samePredictions(catalog){
  const existing=(catalog.areas||[]).filter(area=>area.id==='predictions');
  return catalog.topics?.predictions&&JSON.stringify(catalog.topics.predictions)===JSON.stringify(predictions.topic)
    &&JSON.stringify(existing)===JSON.stringify([predictions.area]);
}
export function predictionCommands(){
  return [
    statement(`UPDATE catalog_documents SET value_json=json_set(value_json,'$.topics.predictions',json(?))
      WHERE namespace='static' AND key='GRAMMAR' AND json_type(value_json,'$.topics')='object'`,[JSON.stringify(predictions.topic)]),
    statement(`UPDATE catalog_documents SET value_json=json_set(value_json,'$.areas',json_insert(json_extract(value_json,'$.areas'),'$[#]',json(?)))
      WHERE namespace='static' AND key='GRAMMAR' AND json_type(value_json,'$.areas')='array'
      AND NOT EXISTS(SELECT 1 FROM json_each(value_json,'$.areas') a WHERE json_extract(a.value,'$.id')='predictions')`,[JSON.stringify(predictions.area)])
  ];
}
export async function addPredictions(db,backup=()=>{}){
  const rows=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='GRAMMAR'");
  assert.equal(rows.length,1,'Exactly one existing Grammar catalog is required.');
  const before=JSON.parse(rows[0].value_json);
  assert.ok(Array.isArray(before.areas)&&before.topics&&typeof before.topics==='object');
  for(const id of predictions.topic.related)assert.ok(before.topics[id],'Related topic missing: '+id);
  if(samePredictions(before))return {status:'already-present',writes:0,examples:predictions.topic.examples.length};
  await backup(rows[0].value_json);
  await db.atomic(predictionCommands());
  const [saved]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='GRAMMAR'");
  const after=JSON.parse(saved.value_json);
  assert.ok(samePredictions(after),'Predictions catalog did not match after write; inspect before any retry.');
  const leftover={...after,topics:{...after.topics},areas:after.areas.filter(area=>area.id!=='predictions')};
  delete leftover.topics.predictions;
  const previous={...before,topics:{...before.topics},areas:before.areas.filter(area=>area.id!=='predictions')};
  delete previous.topics.predictions;
  assert.deepEqual(leftover,previous,'Catalog changed outside Predictions; inspect before any retry.');
  return {status:before.topics.predictions?'updated-and-verified':'added-and-verified',writes:1,examples:predictions.topic.examples.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [mode,file,flag,target,...extra]=process.argv.slice(2);
    assert.ok(mode==='--apply'&&flag==='--target'&&target==='english-quiz-production'&&!extra.length,'Explicit production target required.');
    const db=new TursoStudyClient({...productionCredentials(file),mode:'production'});
    let directory;
    const result=await addPredictions(db,value=>{
      directory=mkdtempSync('/private/tmp/english-quiz-grammar-predictions-');
      writeFileSync(directory+'/grammar-before.json',value,{mode:0o600,flag:'wx'});
    });
    console.log(JSON.stringify({...result,...(directory?{backup:directory+'/grammar-before.json'}:{})}));
  }catch(error){console.error('Predictions update stopped: '+error.message);process.exitCode=1;}
}
