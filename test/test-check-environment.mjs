import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMode,chromiumExecutable} from '../ops/check-environment.mjs';
import {telegramConfig} from '../ops/telegram-notify.mjs';

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
