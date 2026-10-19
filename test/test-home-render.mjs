import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const hooks=readFileSync(new URL('../client/main/main-hooks.js',import.meta.url),'utf8');
const account=readFileSync(new URL('../client/05-account.js',import.meta.url),'utf8');
const stats=account.slice(account.indexOf('    function paintHomeStats()'),account.indexOf('    const CLASS_PAGES'));
const activity=hooks.slice(hooks.indexOf('function stagePaintActivity()'),hooks.indexOf('function stageRecordTime('));
const buckets=hooks.slice(hooks.indexOf('function stagePaintWeakCount('),hooks.indexOf('function stageResponseValue('));

for(const signedIn of [false,true])test('Home statistics finish without recursion: '+(signedIn?'signed in':'guest'),()=>{
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},setAttribute(){}});return nodes.get(id);};
  let reads=0;
  const scope={authUser:signedIn?{id:'fixture'}:null,window:{__chatUnreadTotal:6},
    studyCards:()=>[{en:'one'},{en:'two'}],classGroups:[],classGroupId:null,
    homeBuckets:()=>{},stageHomeBuckets:rows=>{
      assert.ok(++reads<5,'Home render must not recursively restart itself');
      return {learned:rows.slice(0,1),weak:rows.slice(1),learning:rows.slice(1)};
    },document:{getElementById:node,querySelector:node}};
  runInNewContext(stats+'\n'+activity+'\n'+buckets+'\nstagePaintActivity();',scope);
  assert.equal(reads,1);
  assert.equal(node('homeUnreadCount').textContent,signedIn?'6':'0');
  assert.equal(node('#homeDemo [data-stat="weak"] b').textContent,signedIn?'1':'0');
});
