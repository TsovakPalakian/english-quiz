import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

function fixture(){
  const memory=new Map(),calls=[],listeners=new Map(),window={},status={textContent:'',classList:{add(){},remove(){},toggle(){}}};
  let sendPersonal=async()=>Response.json({revision:1}),actor='teacher';
  const scope={window,viewGen:1,viewAccount:null,crypto:webcrypto,console,location:{pathname:'/'},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    setTimeout:()=>1,clearTimeout(){},sessionStorage:{removeItem(){}},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
    document:{addEventListener:(type,fn)=>listeners.set(type,fn),dispatchEvent(){},querySelectorAll:()=>[],getElementById:()=>({...status,addEventListener(){}})},
    fetch:async(path,options={})=>{
      if(path==='/api/me')return Response.json({user:{id:actor}});
      if(path==='/api/me/state')return Response.json({stats:{},added:[],stageQuizProgress:[]});
      if(path==='/api/bugs')return Response.json({});
      const body=JSON.parse(options.body||'{}');calls.push({path,body});
      if(path==='/api/stats/event')return sendPersonal(body);
      if(path==='/api/cards/lookup')return Response.json({id:1,scope:'shared',revision:1});
      return Response.json({revision:1});
    }};
  runInNewContext(readFileSync(new URL('../client/main/main-bridge.js',import.meta.url),'utf8'),scope);
  const bridge=window.LearningMain;
  return {bridge,calls,memory,status,async boot(){await bridge.fetch('/api/me');await bridge.fetch('/api/me/state');},personal:fn=>sendPersonal=fn,actor:value=>actor=value,changeView(){scope.viewGen++;scope.viewAccount={id:'student'};}};
}
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('lesson card creation waits for earlier personal changes to be confirmed',async()=>{
  const f=fixture();await f.boot();f.bridge.event('view','lessons','open',0);let completed=false;
  await f.bridge.perform(async()=>{await f.bridge.lookupLessonCard('hello');completed=true;},f.status);
  assert.equal(completed,true);assert.deepEqual(f.calls.map(row=>row.path),['/api/stats/event','/api/cards/lookup']);
  assert.equal(f.memory.has('learning-main-personal-pending-v3'),false);
});
test('a failed or paused personal write prevents lesson writes and retains the same retry mutation',async()=>{
  const f=fixture();await f.boot();f.personal(async()=>Response.json({error:'Personal save unavailable'},{status:503}));f.bridge.event('view','lessons','open',0);
  let actions=0;await f.bridge.perform(async()=>{actions++;await f.bridge.lookupLessonCard('hello');},f.status);
  assert.equal(actions,0);const pending=JSON.parse(f.memory.get('learning-main-personal-pending-v3'));assert.equal(pending.length,1);assert.equal(pending[0].paused,true);
  await f.bridge.perform(async()=>{actions++;},f.status);assert.equal(actions,0);assert.equal(f.calls.length,1,'Paused writes must not be silently retried');
  f.personal(async()=>Response.json({revision:1}));await f.bridge.flushPersonal();
  assert.deepEqual(f.calls[1].body,f.calls[0].body);await f.bridge.perform(async()=>{await f.bridge.lookupLessonCard('hello');actions++;},f.status);assert.equal(actions,1);
});
test('parallel lesson actions cannot overtake the personal queue preflight',async()=>{
  const f=fixture();await f.boot();let release;const gate=new Promise(resolve=>release=resolve),actions=[];
  f.personal(async()=>{await gate;return Response.json({revision:1});});f.bridge.event('view','lessons','open',0);
  const first=f.bridge.perform(async()=>{await f.bridge.lookupLessonCard('hello');actions.push('first');});await tick();
  const second=f.bridge.perform(async()=>{actions.push('second');});await tick();assert.deepEqual(actions,[]);
  release();await first;await second;assert.deepEqual(actions,['first']);
});
test('personal events produced inside a lesson action are deferred without aborting its card writes',async()=>{
  const f=fixture();await f.boot();let completed=false;
  await f.bridge.perform(async()=>{f.bridge.event('view','lessons','open',0);await f.bridge.lookupLessonCard('hello');completed=true;});await f.bridge.flushPersonal();
  assert.equal(completed,true);assert.deepEqual(f.calls.map(row=>row.path),['/api/cards/lookup','/api/stats/event']);
});
test('an account switch while waiting prevents the original lesson action from starting',async()=>{
  const f=fixture();await f.boot();let release,actions=0;const gate=new Promise(resolve=>release=resolve);
  f.personal(async()=>{await gate;return Response.json({revision:1});});f.bridge.event('view','lessons','open',0);
  const work=f.bridge.perform(async()=>{actions++;});await tick();f.actor('other');await f.bridge.fetch('/api/me');release();await work;
  assert.equal(actions,0);
});
test('switching to another student profile during preflight does not run the old lesson action',async()=>{
  const f=fixture();await f.boot();let release,actions=0;const gate=new Promise(resolve=>release=resolve);
  f.personal(async()=>{await gate;return Response.json({revision:1});});f.bridge.event('view','lessons','open',0);
  const work=f.bridge.perform(async()=>{actions++;});await tick();f.changeView();release();await work;assert.equal(actions,0);
});
