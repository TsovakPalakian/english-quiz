import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const KEY='app-database-context-v1',RESET='app-database-reset-v1',source=readFileSync(new URL('../production/database-context.js',import.meta.url),'utf8');
function storage(seed={}){const value={...seed};Object.defineProperties(value,{getItem:{value:key=>value[key]??null},setItem:{value:(key,item)=>{value[key]=String(item);}},removeItem:{value:key=>{delete value[key];}}});return value;}
function fixture(seed={[KEY]:'d1:0'}){
  const calls=[],events=new Map(),attrs=new Set(),nodes=new Map(),local=storage(seed),session=storage(),deleted=[],intervals=[];
  const state={context:{provider:'d1',revision:0},offline:false,responseContext:'d1:0',reloads:0,resets:0};
  const node=()=>({style:{},append(child){if(child.id)nodes.set(child.id,child);},remove(){nodes.delete(this.id);},setAttribute:name=>attrs.add(name),removeAttribute:name=>attrs.delete(name)});
  const document={head:node(),body:node(),documentElement:node(),hidden:false,getElementById:id=>nodes.get(id),createElement:node,addEventListener(){}};
  const indexedDB={databases:async()=>[{name:'enquiz-media:d1:0'}],deleteDatabase(name){deleted.push(name);const request={};queueMicrotask(()=>request.onsuccess?.());return request;}};
  const window={indexedDB,LearningMain:{databaseReset(){state.resets++;}},ContentCache:{clear(){}},fetch:async(input,options)=>{
    calls.push({input,options});
    if(String(input)==='/api/database-context'){if(state.offline)throw Error('Offline');return Response.json(state.context);}
    return Response.json({ok:true},{headers:{'X-Database-Context':state.responseContext}});
  },addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);}};
  const location={href:'https://app.example/',origin:'https://app.example',reload(){state.reloads++;}};
  const context={window,document,location,localStorage:local,sessionStorage:session,indexedDB,Headers,URL,Request,AbortSignal,Event,setInterval:fn=>{intervals.push(fn);return intervals.length;}};
  return {state,window,local,session,calls,deleted,attrs,events,run(){runInNewContext(source,context);},async settle(){for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
test('confirmed requests carry the current global epoch and use a scoped media database',async()=>{
  const f=fixture();f.run();await f.window.DatabaseContext.ready;
  await f.window.fetch('/api/me');assert.equal(f.calls.at(-1).options.headers.get('X-Database-Context'),'d1:0');
  assert.equal(f.window.DatabaseContext.mediaDatabase,'enquiz-media:d1:0');assert.equal(f.attrs.has('data-database-pending'),false);assert.equal(f.state.reloads,0);
});
test('first use or a changed database clears private caches and pending writes before reload',async()=>{
  const f=fixture({[KEY]:'d1:0','enquiz-added':'private','learning-main-pending-v3':'old mutation','english-static-speakout-v1':'old catalog','enquiz-display-size':'large'});
  f.state.context={provider:'neon',revision:1};f.run();await f.settle();
  assert.equal(f.state.reloads,1);assert.equal(f.state.resets,1);assert.equal(f.local[KEY],'neon:1');assert.equal(f.local[RESET],undefined);
  for(const key of ['enquiz-added','learning-main-pending-v3','english-static-speakout-v1'])assert.equal(f.local[key],undefined);
  assert.equal(f.local['enquiz-display-size'],'large');assert.equal(f.attrs.has('data-database-pending'),true);assert.ok(f.deleted.includes('enquiz-media'));
  const first=fixture({});first.run();await first.settle();assert.equal(first.state.reloads,1);assert.equal(first.local[KEY],'d1:0');
});
test('late responses from an old request are never applied after an epoch mismatch',async()=>{
  const f=fixture();f.run();await f.window.DatabaseContext.ready;f.state.responseContext='neon:1';
  let delivered=false;void f.window.fetch('/api/lessons').then(()=>{delivered=true;});await f.settle();
  assert.equal(delivered,false);assert.equal(f.state.reloads,1);assert.equal(f.local[KEY],'neon:1');assert.equal(f.calls.filter(call=>call.input==='/api/lessons').length,1);
});
test('an unavailable control record blocks data requests until the same epoch is verified',async()=>{
  const f=fixture();f.state.offline=true;f.run();await f.settle();
  let delivered=false;void f.window.fetch('/api/me').then(()=>{delivered=true;});await f.settle();assert.equal(delivered,false);assert.equal(f.calls.some(call=>call.input==='/api/me'),false);
  f.state.offline=false;await f.window.DatabaseContext.check();await f.settle();assert.equal(delivered,true);assert.equal(f.state.reloads,0);
});
test('another tab changing the global epoch invalidates this tab without replaying its queue',async()=>{
  const f=fixture();f.run();await f.window.DatabaseContext.ready;
  for(const fn of f.events.get('storage'))fn({key:KEY,newValue:'neon:2'});await f.settle();
  assert.equal(f.state.reloads,1);assert.equal(f.local[KEY],'neon:2');assert.equal(f.calls.some(call=>call.options?.method==='POST'),false);
});
test('D1 cutover invalidates Learning caches and is accepted after the reload',async()=>{
  const f=fixture();f.state.context={provider:'d1',revision:2};f.run();await f.settle();
  assert.equal(f.state.reloads,1);assert.equal(f.local[KEY],'d1:2');
  const next=fixture({[KEY]:'d1:2'});next.state.context={provider:'d1',revision:2};next.state.responseContext='d1:2';next.run();await next.window.DatabaseContext.ready;
  await next.window.fetch('/api/me');assert.equal(next.calls.at(-1).options.headers.get('X-Database-Context'),'d1:2');
});
