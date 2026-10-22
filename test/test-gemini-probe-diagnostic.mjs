import test from 'node:test';
import assert from 'node:assert/strict';
import {geminiProbeDiagnostic} from '../ops/gemini-probe-diagnostic.mjs';
import {runGeminiQuizProbe} from '../ops/probe-gemini-quiz.mjs';
test('diagnostic returns only exact allowlisted codes, never messages, metadata or unknown codes',async()=>{
  const secret='private-fixture-key';
  const response=Response.json({error:{status:'PERMISSION_DENIED',message:secret,details:[{reason:secret,metadata:{project:secret}},{reason:'API_KEY_INVALID',domain:secret}]}},{status:403,headers:{'x-private-key':secret}});
  assert.deepEqual(await geminiProbeDiagnostic(response),{httpStatus:403,apiStatus:'PERMISSION_DENIED',reason:'API_KEY_INVALID'});
  assert.deepEqual(await geminiProbeDiagnostic(Response.json({error:{status:secret,details:[{reason:secret}]}},{status:400})),{httpStatus:400});
});
test('diagnostic bounds malformed, non-JSON, oversized, cancelled and stalled errors',async()=>{
  for(const response of [new Response('private',{status:404}),new Response('{bad',{status:400,headers:{'content-type':'application/json'}}),Response.json({error:{message:'x'.repeat(17000)}},{status:400}),new Response(null,{status:403})])assert.deepEqual(await geminiProbeDiagnostic(response),{httpStatus:response.status});
  let cancelled=false;
  const stalled=new Response(new ReadableStream({start(){},cancel(){cancelled=true;}}),{status:503,headers:{'content-type':'application/json'}});
  assert.deepEqual(await geminiProbeDiagnostic(stalled,{timeoutMs:5}),{httpStatus:503});assert.equal(cancelled,true);
  const controller=new AbortController();controller.abort();
  assert.deepEqual(await geminiProbeDiagnostic(Response.json({error:{status:'NOT_FOUND'}},{status:404}),{signal:controller.signal}),{httpStatus:404});
});
test('local probe exposes HTTP rejection without extra requests or sensitive upstream fields',async()=>{
  for(const [status,apiStatus] of [[400,'INVALID_ARGUMENT'],[401,'UNAUTHENTICATED'],[403,'PERMISSION_DENIED'],[404,'NOT_FOUND'],[429,'RESOURCE_EXHAUSTED']]){
    let calls=0;
    const result=await runGeminiQuizProbe({run:true,confirmFreeTier:true,allowDataProcessing:true,apiKey:'private-test-key',quotaProject:'private-test-project',fetchImpl:async()=>{
      calls++;return Response.json({error:{status:apiStatus,message:'private-test-key private-test-project',details:[{reason:'unknown-private-reason'}]}},{status});
    }});
    assert.equal(calls,1);assert.equal(result.requests,1);assert.equal(result.published,false);
    assert.deepEqual(result.diagnostic,{httpStatus:status,apiStatus});
    assert.ok(!JSON.stringify(result).includes('private-test'));assert.ok(!JSON.stringify(result).includes('unknown-private'));
  }
});
