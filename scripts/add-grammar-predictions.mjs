// One additive curriculum patch. No D1, account, lesson or card changes.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionCredentials} from './import-turso-production.mjs';
import {TursoStudyClient,statement} from '../src/turso-study.mjs';
export const predictions=JSON.parse(readFileSync(new URL('../content/grammar-predictions.json',import.meta.url),'utf8'));
export function predictionCommands(){
  return [statement(`UPDATE catalog_documents SET value_json=json_set(value_json,
    '$.topics.predictions',json(?),'$.areas',json_insert(json_extract(value_json,'$.areas'),'$[#]',json(?)))
    WHERE namespace='static' AND key='GRAMMAR'
    AND json_type(value_json,'$.topics.predictions') IS NULL
    AND json_type(value_json,'$.topics')='object' AND json_type(value_json,'$.areas')='array'
    AND NOT EXISTS(SELECT 1 FROM json_each(value_json,'$.areas') a WHERE json_extract(a.value,'$.id')='predictions')`,
    [JSON.stringify(predictions.topic),JSON.stringify(predictions.area)]),
    statement("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'catalog_changed' END)")];
}
export async function addPredictions(db,backup=()=>{}){
  const rows=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='GRAMMAR'");
  assert.equal(rows.length,1,'Exactly one existing Grammar catalog is required.');
  const before=JSON.parse(rows[0].value_json);
  assert.ok(Array.isArray(before.areas)&&before.topics&&typeof before.topics==='object');
  for(const id of predictions.topic.related)assert.ok(before.topics[id],'Related topic missing: '+id);
  const existing=before.areas.filter(area=>area.id==='predictions');
  if(before.topics.predictions||existing.length){
    assert.deepEqual(before.topics.predictions,predictions.topic,'An existing Predictions topic differs; refusing overwrite.');
    assert.deepEqual(existing,[predictions.area],'An existing Predictions menu differs; refusing overwrite.');
    return {status:'already-present',writes:0};
  }
  await backup(rows[0].value_json);
  await db.atomic(predictionCommands());
  const [saved]=await db.read("SELECT value_json FROM catalog_documents WHERE namespace='static' AND key='GRAMMAR'");
  assert.deepEqual(JSON.parse(saved.value_json),{...before,topics:{...before.topics,predictions:predictions.topic},areas:[...before.areas,predictions.area]},'Catalog changed concurrently; inspect before any retry.');
  return {status:'added-and-verified',writes:1,examples:predictions.topic.examples.length};
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
