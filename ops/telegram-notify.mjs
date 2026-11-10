import {fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';
import {collectCILogs,sanitizeCILogs,shouldAttachCILogs} from './ci-telegram-logs.mjs';

export function escapeHtml(str=''){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function extractTaskKey(source=''){
  if(!source)return null;
  const match=String(source).match(/\b([A-Z]+-\d+)\b/);
  return match?match[1]:null;
}

function readGitCommitMessage(){
  try{
    return execSync('git log -1 --pretty=%B',{timeout:2000,stdio:['ignore','pipe','ignore']}).toString().trim();
  }catch{
    return '';
  }
}

export function detectTaskKey(env=process.env){
  if(env.TASK_KEY)return env.TASK_KEY;
  if(typeof env.COMMIT_MESSAGE==='string'){
    return extractTaskKey(env.COMMIT_MESSAGE)||extractTaskKey(env.GITHUB_REF_NAME);
  }
  return extractTaskKey(env.GITHUB_REF_NAME)||extractTaskKey(readGitCommitMessage());
}

export function formatDeployResult(status=''){
  if(status==='success')return '🟢 success';
  if(status==='skipped')return '🔴 skipped';
  if(status==='failure')return '🔴 failure';
  return escapeHtml(status||'unknown');
}

export function telegramConfig(env=process.env){
  const token=env.TELEGRAM_BOT_TOKEN||'',chat=env.TELEGRAM_CHAT_ID||'';
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||! /^-?\d+$/.test(chat))throw Error('Configure TELEGRAM_BOT_TOKEN and numeric TELEGRAM_CHAT_ID.');
  return {token,chat};
}
export async function notifyTelegram(text,env=process.env,{fetchImpl=globalThis.fetch,maxRetries=3,baseDelayMs=1000,timeoutMs=30000,parseMode='HTML'}={}){
  const {token,chat}=telegramConfig(env);
  let lastError;
  for(let attempt=1;attempt<=maxRetries;attempt++){
    try{
      const payload={chat_id:chat,text:String(text).slice(0,3500),disable_web_page_preview:true};
      if(parseMode)payload.parse_mode=parseMode;
      const response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(timeoutMs),
        body:JSON.stringify(payload)
      });
      const value=await response.json().catch(()=>({}));
      if(!response.ok||value.ok!==true){
        const status=response.status;
        const errMessage='Telegram rejected the notification (HTTP '+status+'). Check bot access and chat ID.';
        if([429,500,502,503,504].includes(status)&&attempt<maxRetries){
          lastError=Error(errMessage);
          if(baseDelayMs>0)await new Promise(r=>setTimeout(r,baseDelayMs*Math.pow(2,attempt-1)));
          continue;
        }
        throw Error(errMessage);
      }
      return;
    }catch(err){
      if(err.message?.startsWith('Telegram rejected')){throw err;}
      const isTimeout=err?.name==='TimeoutError'||err?.code===23||err?.code==='ETIMEDOUT';
      const rawCause=isTimeout?'timeout':(err?.cause?.code||err?.code||err?.message||'');
      const sanitizedCause=rawCause?': '+String(rawCause).replace(token,'[REDACTED]'):'';
      lastError=Error('Telegram notification could not be delivered'+sanitizedCause+'.');
      if(attempt<maxRetries){
        if(baseDelayMs>0)await new Promise(r=>setTimeout(r,baseDelayMs*Math.pow(2,attempt-1)));
        continue;
      }
    }
  }
  throw lastError||Error('Telegram notification could not be delivered.');
}

export function pipelineNotification(env=process.env){
  const ran=['success','failure'].includes(env.TEST_EXECUTION);
  const trigger={push:'push',workflow_dispatch:'manual'}[env.PIPELINE_EVENT]||env.PIPELINE_EVENT;
  const actor=env.GITHUB_TRIGGERING_ACTOR||env.GITHUB_ACTOR;
  const failed=env.TEST_EXECUTION==='failure'?'tests':env.TEST_RESULT==='failure'?'test preparation/job':env.DEPLOY_RESULT==='failure'?'deployment':null;
  const cancelled=[env.TEST_RESULT,env.TEST_EXECUTION,env.DEPLOY_RESULT].includes('cancelled');
  const taskKey=detectTaskKey(env);
  const taskLine=taskKey?`<b>Task:</b> <a href="https://lumiscia.atlassian.net/browse/${encodeURIComponent(taskKey)}">${escapeHtml(taskKey)}</a>`:'';

  return ['Lumiscia CI',
    escapeHtml(env.GITHUB_REPOSITORY||''),
    env.GITHUB_REF_NAME?(env.GITHUB_REF_TYPE==='tag'?'Tag: ':'Branch: ')+escapeHtml(env.GITHUB_REF_NAME):'',
    trigger?'Trigger: '+escapeHtml(trigger):'',
    actor?'By: '+escapeHtml(actor):'',
    env.GITHUB_RUN_NUMBER?'Run: #'+escapeHtml(env.GITHUB_RUN_NUMBER)+(env.GITHUB_RUN_ATTEMPT?' (attempt '+escapeHtml(env.GITHUB_RUN_ATTEMPT)+')':''):'',
    taskLine,
    env.GITHUB_SHA?'Commit: '+escapeHtml(env.GITHUB_SHA.slice(0,12)):'',
    'Tests: '+(ran?escapeHtml(env.TEST_EXECUTION):'not run'),
    ...(!ran?['Preparation/job: '+escapeHtml(env.TEST_RESULT||'unknown')]:[]),
    '<b>Deploy:</b> '+formatDeployResult(env.DEPLOY_RESULT),
    failed?'Failed stage: '+escapeHtml(failed):'',
    cancelled?'Run was cancelled.':'',
    env.DEPLOY_RESULT==='success'?'Site: https://lumiscia.org/':'',
    env.GITHUB_SERVER_URL&&env.GITHUB_REPOSITORY&&env.GITHUB_RUN_ID?`${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`:''
  ].filter(Boolean).join('\n');
}

export async function notifyTelegramDocument(document,env=process.env,{fetchImpl=globalThis.fetch,maxRetries=3,baseDelayMs=1000}={}){
  const {token,chat}=telegramConfig(env);
  if(!/^lumiscia-ci-\d+-attempt-\d+\.txt$/.test(document?.name||'')||typeof document?.text!=='string')throw Error('Invalid CI log document.');
  const form=new FormData();form.set('chat_id',chat);
  form.set('document',new Blob([sanitizeCILogs(document.text,env)],{type:'text/plain;charset=utf-8'}),document.name);
  form.set('caption','CI logs: completed test/deploy jobs, secrets redacted.');
  let lastError;
  for(let attempt=1;attempt<=maxRetries;attempt++){
    try{
      const response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendDocument',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.ok!==true){
        const status=response.status;
        const errMessage='Telegram rejected the log file (HTTP '+status+').';
        if([429,500,502,503,504].includes(status)&&attempt<maxRetries){
          lastError=Error(errMessage);
          if(baseDelayMs>0)await new Promise(r=>setTimeout(r,baseDelayMs*Math.pow(2,attempt-1)));
          continue;
        }
        throw Error(errMessage);
      }
      return;
    }catch(err){
      if(err.message?.startsWith('Telegram rejected')){throw err;}
      lastError=Error('Telegram log file could not be delivered.');
      if(attempt<maxRetries){
        if(baseDelayMs>0)await new Promise(r=>setTimeout(r,baseDelayMs*Math.pow(2,attempt-1)));
        continue;
      }
    }
  }
  throw lastError||Error('Telegram log file could not be delivered.');
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check-config'){telegramConfig();console.log('Telegram configuration present; no message sent.');}
    else{
      await notifyTelegram(pipelineNotification());
      if(shouldAttachCILogs()){
        try{await notifyTelegramDocument(await collectCILogs());}
        catch{
          await notifyTelegram('The CI summary was sent, but the TXT log file could not be delivered. View the logs in GitHub Actions.');
          throw Error('CI log attachment failed; summary delivery was preserved.');
        }
      }
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
