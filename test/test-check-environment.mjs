import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMode,chromiumExecutable} from '../ops/check-environment.mjs';
import {telegramConfig,pipelineNotification} from '../ops/telegram-notify.mjs';

test('test mode comes from a validated flag or environment; filters remain filters',()=>{
  assert.deepEqual(checkMode([],{}),{mode:'local',filters:[]});
  assert.deepEqual(checkMode(['--mode=ci','auth'],{}),{mode:'ci',filters:['auth']});
  assert.deepEqual(checkMode(['--mode','local'],{CHECK_MODE:'ci'}),{mode:'local',filters:[]});
  assert.deepEqual(checkMode([],{CHECK_MODE:'ci'}),{mode:'ci',filters:[]});
  for(const args of [['--mode'],['--mode='],['--mode=remote'],['--unknown']])assert.throws(()=>checkMode(args,{}));
});
test('ci uses bundled Chromium unless the user explicitly provides a browser path',()=>{
  const previous={mode:process.env.CHECK_MODE,chrome:process.env.CHROME_PATH};
  try{
    process.env.CHECK_MODE='ci';delete process.env.CHROME_PATH;
    assert.equal(chromiumExecutable(),undefined);
    process.env.CHROME_PATH='/custom/chromium';assert.equal(chromiumExecutable(),'/custom/chromium');
  }finally{
    for(const [key,value] of [['CHECK_MODE',previous.mode],['CHROME_PATH',previous.chrome]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
test('Telegram config rejects missing values and non-numeric destinations without disclosing secrets',()=>{
  for(const env of [{},{TELEGRAM_BOT_TOKEN:'invalid',TELEGRAM_CHAT_ID:'123'},{TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'@someone'}])assert.throws(()=>telegramConfig(env),/Configure TELEGRAM_BOT_TOKEN/);
  assert.deepEqual(telegramConfig({TELEGRAM_BOT_TOKEN:'123:fixture',TELEGRAM_CHAT_ID:'-456'}),{token:'123:fixture',chat:'-456'});
});
test('manual CI notifications report the actual deployment result and run link',()=>{
  for(const result of ['success','failure','skipped','cancelled']){
    const message=pipelineNotification({PIPELINE_EVENT:'workflow_dispatch',TEST_EXECUTION:'success',DEPLOY_RESULT:result,GITHUB_SERVER_URL:'https://github.com',GITHUB_REPOSITORY:'fixture/repo',GITHUB_RUN_ID:'123'});
    assert.ok(message.includes('Tests: success\nDeploy: '+result+'\n'));
    assert.ok(message.endsWith('https://github.com/fixture/repo/actions/runs/123'));
    assert.ok(!message.includes('not requested'));
  }
  assert.match(pipelineNotification({TEST_EXECUTION:'skipped',TEST_RESULT:'failure',DEPLOY_RESULT:'skipped'}),/Tests: not run\nPreparation\/job: failure\nDeploy: skipped/);
});
test('CI notifications include useful run metadata but never credential values',()=>{
  const message=pipelineNotification({PIPELINE_EVENT:'workflow_dispatch',GITHUB_REF_NAME:'main',GITHUB_REF_TYPE:'branch',GITHUB_ACTOR:'original-author',GITHUB_TRIGGERING_ACTOR:'rerun-author',GITHUB_RUN_NUMBER:'42',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'a'.repeat(40),TEST_EXECUTION:'success',TEST_RESULT:'success',DEPLOY_RESULT:'success',TELEGRAM_BOT_TOKEN:'123:private-fixture-token',CI_R2_SECRET_ACCESS_KEY:'private-fixture-r2',CI_BUILD_INPUTS_URL:'https://example.invalid/private-signature'});
  for(const line of ['Branch: main','Trigger: manual','By: rerun-author','Run: #42 (attempt 2)','Commit: '+ 'a'.repeat(12),'Site: https://lumiscia.org/'])assert.ok(message.split('\n').includes(line));
  for(const value of ['private-fixture-token','private-fixture-r2','private-signature','original-author','Failed stage:'])assert.ok(!message.includes(value));
  const tagged=pipelineNotification({GITHUB_REF_NAME:'v1',GITHUB_REF_TYPE:'tag',GITHUB_ACTOR:'author'});
  assert.match(tagged,/Tag: v1\nBy: author/);
  assert.ok(!tagged.includes('Branch:'));
});
test('CI notifications distinguish tests, preparation, deployment and cancellation',()=>{
  for(const [env,stage] of [
    [{TEST_EXECUTION:'failure',TEST_RESULT:'failure',DEPLOY_RESULT:'skipped'},'tests'],
    [{TEST_EXECUTION:'skipped',TEST_RESULT:'failure',DEPLOY_RESULT:'skipped'},'test preparation/job'],
    [{TEST_EXECUTION:'success',TEST_RESULT:'success',DEPLOY_RESULT:'failure'},'deployment'],
  ]){
    const message=pipelineNotification(env);
    assert.ok(message.includes('Failed stage: '+stage));
    assert.ok(!message.includes('Site:'));
  }
  const cancelled=pipelineNotification({TEST_RESULT:'cancelled',DEPLOY_RESULT:'skipped'});
  assert.ok(cancelled.includes('Run was cancelled.'));
  assert.ok(!cancelled.includes('Failed stage:'));
});
