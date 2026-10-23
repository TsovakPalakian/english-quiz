import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workbenchCloudControl} from '../ops/workbench-cloud-control.mjs';
const account='42a9ebe47d529e3664b914aaf0813a21';
const id='11111111-1111-4111-8111-111111111111';
test('cloud rehearsal refuses writes to live, unowned and encoded D1 paths',async()=>{
  let calls=0;
  const cloud=workbenchCloudControl({token:'test',fetchImpl:async()=>{calls++;throw Error('Unexpected network request');}});
  for(const path of [
    '/accounts/'+account+'/d1/database/dd640d1f-abbe-4236-8741-5638e89d890f/query',
    '/accounts/'+account+'/d1/database/'+id+'/query',
    '/accounts/other/d1/database/'+id+'/query',
    '/accounts/'+account+'/d1/database/%64d640d1f-abbe-4236-8741-5638e89d890f/query',
    '//example.org/accounts/test',
  ])await assert.rejects(cloud.request(path,{method:'post',body:{sql:'DELETE FROM users'}}));
  assert.equal(calls,0);
});
test('owned rehearsal cleanup remains available after the request budget is exhausted',async()=>{
  const methods=[];
  const cloud=workbenchCloudControl({token:'test',maxRequests:1,fetchImpl:async(url,options)=>{
    methods.push(options.method);
    return new Response(JSON.stringify({success:true,result:options.method==='POST'?{uuid:id}:null}));
  }});
  assert.equal(await cloud.createRehearsal(),id);
  await assert.rejects(cloud.scoped('/d1/database/'+id+'/query',{method:'POST',body:{sql:'SELECT 1'}}));
  await cloud.removeRehearsal(id);
  await assert.rejects(cloud.removeRehearsal(id));
  assert.deepEqual(methods,['POST','DELETE']);
});
