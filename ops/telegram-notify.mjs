import {fileURLToPath} from 'node:url';

export function telegramConfig(env=process.env){
  const token=env.TELEGRAM_BOT_TOKEN||'',chat=env.TELEGRAM_CHAT_ID||'';
  if(!/^\d+:[A-Za-z0-9_-]+$/.test(token)||! /^-?\d+$/.test(chat))throw Error('Configure TELEGRAM_BOT_TOKEN and numeric TELEGRAM_CHAT_ID.');
  return {token,chat};
}
export async function notifyTelegram(text,env=process.env){
  const {token,chat}=telegramConfig(env);let response;
  try{
    response=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
      method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
      body:JSON.stringify({chat_id:chat,text:String(text).slice(0,3500),disable_web_page_preview:true})
    });
  }catch{throw Error('Telegram notification could not be delivered.');}
  const value=await response.json().catch(()=>({}));
  if(!response.ok||value.ok!==true)throw Error('Telegram rejected the notification (HTTP '+response.status+'). Check bot access and chat ID.');
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    if(process.argv[2]==='--check-config'){telegramConfig();console.log('Telegram configuration present; no message sent.');}
    else{
      const env=process.env,manual=env.PIPELINE_EVENT==='workflow_dispatch';
      const ran=['success','failure'].includes(env.TEST_EXECUTION);
      const text=['Lumiscia CI',env.GITHUB_REPOSITORY||'', 'Commit: '+(env.GITHUB_SHA||'').slice(0,12),
        'Tests: '+(ran?env.TEST_EXECUTION:'not run'),
        ...(!ran?['Preparation/job: '+(env.TEST_RESULT||'unknown')]:[]),
        'Deploy: '+(manual?'not requested':env.DEPLOY_RESULT||'unknown'),
        env.GITHUB_SERVER_URL&&env.GITHUB_REPOSITORY&&env.GITHUB_RUN_ID?env.GITHUB_SERVER_URL+'/'+env.GITHUB_REPOSITORY+'/actions/runs/'+env.GITHUB_RUN_ID:''].filter(Boolean).join('\n');
      await notifyTelegram(text);
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
