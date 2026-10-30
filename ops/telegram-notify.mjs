import {fileURLToPath} from 'node:url';
import {collectCILogs,sanitizeCILogs,shouldAttachCILogs} from './ci-telegram-logs.mjs';

export function telegramConfig(env=process.env){
  const token=env.TELEGRAM_BOT_TOKEN||'',chat=env.TELEGRAM_CHAT_ID||'';
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||! /^-?\d+$/.test(chat))throw Error('Configure TELEGRAM_BOT_TOKEN and numeric TELEGRAM_CHAT_ID.');
  return {token,chat};
}
export async function notifyTelegram(text,env=process.env,{fetchImpl=globalThis.fetch,maxRetries=3,baseDelayMs=1000,timeoutMs=30000}={}){
  const {token,chat}=telegramConfig(env);
  let lastError;
  for(let attempt=1;attempt<=maxRetries;attempt++){
    try{
      const response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(timeoutMs),
        body:JSON.stringify({chat_id:chat,text:String(text).slice(0,3500),disable_web_page_preview:true})
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
      const rawCause=err?.cause?.code||err?.code||err?.message||'';
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
  return ['Lumiscia CI',env.GITHUB_REPOSITORY||'',
    env.GITHUB_REF_NAME?(env.GITHUB_REF_TYPE==='tag'?'Tag: ':'Branch: ')+env.GITHUB_REF_NAME:'',
    trigger?'Trigger: '+trigger:'',
    actor?'By: '+actor:'',
    env.GITHUB_RUN_NUMBER?'Run: #'+env.GITHUB_RUN_NUMBER+(env.GITHUB_RUN_ATTEMPT?' (attempt '+env.GITHUB_RUN_ATTEMPT+')':''):'',
    env.GITHUB_SHA?'Commit: '+env.GITHUB_SHA.slice(0,12):'',
    'Tests: '+(ran?env.TEST_EXECUTION:'not run'),
    ...(!ran?['Preparation/job: '+(env.TEST_RESULT||'unknown')]:[]),
    'Deploy: '+(env.DEPLOY_RESULT||'unknown'),
    failed?'Failed stage: '+failed:'',
    cancelled?'Run was cancelled.':'',
    env.DEPLOY_RESULT==='success'?'Site: https://lumiscia.org/':'',
    env.GITHUB_SERVER_URL&&env.GITHUB_REPOSITORY&&env.GITHUB_RUN_ID?env.GITHUB_SERVER_URL+'/'+env.GITHUB_REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID:''].filter(Boolean).join('\n');
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
