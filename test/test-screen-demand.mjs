import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=()=>readFileSync(new URL('../client/57-demand.js',import.meta.url),'utf8');
function fixture(){
  const calls=[],notices=[],listeners=[];let resolve,reject;
  const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const window={ColorPicker:{},ensureMaterialQuiz:()=>pending,ensureColorPicker:()=>Promise.resolve(),LearningMain:{notice:message=>notices.push(message)}};
  const context={window,authUser:{id:'fixture'},document:{addEventListener:(name,handler)=>listeners.push(handler)},show:id=>calls.push(id)};
  const api=runInNewContext(source()+'\n({deferScreenAssets})',context);
  return {...api,window,calls,notices,listeners,resolve:()=>{window.MaterialQuiz={};resolve();},reject};
}
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
test('Material navigation waits for dependencies before rendering',async()=>{
  const f=fixture();assert.equal(f.deferScreenAssets('material'),true);assert.deepEqual(f.calls,[]);
  f.resolve();await flush();assert.deepEqual(f.calls,['material']);
  assert.equal(f.deferScreenAssets('material'),false);
});
test('A later navigation cancels a stale deferred render',async()=>{
  const f=fixture();f.deferScreenAssets('material');assert.equal(f.deferScreenAssets('home'),false);
  f.resolve();await flush();assert.deepEqual(f.calls,[]);
});
test('Dependency failure reports an error without retrying forever',async()=>{
  const f=fixture();f.deferScreenAssets('material');f.reject(new Error('Fixture unavailable'));await flush();
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.notices,['Fixture unavailable']);
});
test('Text editor waits for the color picker too',async()=>{
  const f=fixture();f.window.MaterialQuiz={};delete f.window.ColorPicker;
  f.window.ensureColorPicker=()=>Promise.resolve().then(()=>{f.window.ColorPicker={};});
  assert.equal(f.deferScreenAssets('textedit'),true);await flush();
  assert.deepEqual(f.calls,['textedit']);
});
