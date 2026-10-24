import test from 'node:test';
import assert from 'node:assert/strict';
import {collectCILogs,sanitizeCILogs,shouldAttachCILogs} from '../ops/ci-telegram-logs.mjs';
import {notifyTelegramDocument} from '../ops/telegram-notify.mjs';

const env={GITHUB_REPOSITORY:'fixture/repo',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',GITHUB_TOKEN:'fixture-github-secret',TELEGRAM_BOT_TOKEN:'123:fixture-bot-secret',TELEGRAM_CHAT_ID:'456'};
const job=(id,name)=>({id,name,status:'completed',conclusion:'success'});

test('log attachments are enabled only for failed preparation, tests or deployment',()=>{
  for(const key of ['TEST_RESULT','TEST_EXECUTION','DEPLOY_RESULT']){
    assert.equal(shouldAttachCILogs({CI_ATTACH_LOGS:'true',[key]:'failure'}),true);
    assert.equal(shouldAttachCILogs({[key]:'failure'}),false);
    assert.equal(shouldAttachCILogs({CI_ATTACH_LOGS:'false',[key]:'failure'}),false);
  }
  for(const result of ['success','skipped','cancelled',undefined])assert.equal(shouldAttachCILogs({CI_ATTACH_LOGS:'true',TEST_RESULT:result,TEST_EXECUTION:result,DEPLOY_RESULT:result}),false);
});

test('TXT contains completed jobs from the current attempt without leaking credentials across redirects',async()=>{
  const calls=[];
  const result=await collectCILogs(env,{fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/attempts/2/jobs?'))return Response.json({jobs:[job(1,'test'),job(2,'deploy'),{...job(3,'notify'),status:'in_progress'}]});
    if(url.endsWith('/jobs/1/logs'))return new Response(null,{status:302,headers:{location:'https://logs.blob.core.windows.net/fixture?sig=private-signature'}});
    if(url.startsWith('https://logs.blob.core.windows.net/')){assert.deepEqual(options.headers,{});return new Response('148 scripts passed\nTOKEN=private-value\nfixture-github-secret');}
    if(url.endsWith('/jobs/2/logs'))return new Response('Deployment complete');
    throw Error('Unexpected request');
  }});
  assert.equal(result.name,'lumiscia-ci-123-attempt-2.txt');
  assert.match(result.text,/148 scripts passed/);assert.match(result.text,/Deployment complete/);
  assert.ok(!result.text.includes('private-value'));assert.ok(!result.text.includes(env.GITHUB_TOKEN));
  assert.ok(!result.text.includes('===== notify ====='));
  assert.equal(calls.length,4);
  for(const call of calls){assert.equal(call.options.redirect,'manual');if(call.url.startsWith('https://api.github.com/'))assert.equal(call.options.headers.Authorization,'Bearer '+env.GITHUB_TOKEN);}
});

test('unsafe redirects and missing jobs are recorded without requesting unsafe URLs',async()=>{
  let calls=0;
  const result=await collectCILogs(env,{fetchImpl:async url=>{
    calls++;
    if(url.includes('/attempts/2/jobs?'))return Response.json({jobs:[job(1,'test')]});
    return new Response(null,{status:302,headers:{location:'https://example.invalid/steal'}});
  }});
  assert.equal(calls,2);
  assert.match(result.text,/Logs unavailable/);assert.match(result.text,/No completed job logs available/);
  await assert.rejects(collectCILogs({...env,GITHUB_TOKEN:''},{fetchImpl:()=>assert.fail('No request without credentials')}),/not configured/);
});

test('oversized log responses are cancelled and reported as unavailable',async()=>{
  let cancelled=false;
  const result=await collectCILogs(env,{fetchImpl:async url=>{
    if(url.includes('/attempts/2/jobs?'))return Response.json({jobs:[job(1,'test')]});
    return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){cancelled=true;}}));
  }});
  assert.equal(cancelled,true);assert.match(result.text,/Logs unavailable or oversized/);
});

test('redaction covers bearer tokens, credential fields and signed URLs',()=>{
  const text=sanitizeCILogs('Bearer unknown-bearer\nCLOUDFLARE_API_TOKEN: unknown-secret\nhttps://example.invalid/archive?X-Amz-Signature=private-signature\nhttps://logs.blob.core.windows.net/x?sig=private-sas\n'+env.TELEGRAM_BOT_TOKEN,env);
  for(const value of ['unknown-bearer','unknown-secret','private-signature','private-sas',env.TELEGRAM_BOT_TOKEN])assert.ok(!text.includes(value));
  assert.match(text,/\[REDACTED\]/);
});

test('Telegram receives a sanitized multipart TXT, never an external download URL',async()=>{
  let sent=false;
  await notifyTelegramDocument({name:'lumiscia-ci-123-attempt-2.txt',text:'Result: success\n'+env.GITHUB_TOKEN},env,{fetchImpl:async(url,options)=>{
    sent=true;assert.ok(url.endsWith('/sendDocument'));assert.equal(options.method,'POST');
    assert.ok(options.body instanceof FormData);assert.equal(options.body.get('chat_id'),'456');
    const file=options.body.get('document');assert.equal(file.name,'lumiscia-ci-123-attempt-2.txt');assert.match(file.type,/^text\/plain/);
    assert.ok(!(await file.text()).includes(env.GITHUB_TOKEN));
    return Response.json({ok:true});
  }});
  assert.equal(sent,true);
  await assert.rejects(notifyTelegramDocument({name:'unsafe.zip',text:''},env),/Invalid CI log document/);
  await assert.rejects(notifyTelegramDocument({name:'lumiscia-ci-123-attempt-2.txt',text:'result'},env,{fetchImpl:async()=>{throw Error(env.TELEGRAM_BOT_TOKEN);}}),error=>error.message==='Telegram log file could not be delivered.');
});
