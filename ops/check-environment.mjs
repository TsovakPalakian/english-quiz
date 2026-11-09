import {createRequire} from 'node:module';
import {existsSync,readdirSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
export function checkMode(args=[],env=process.env){
  let mode=env.CHECK_MODE||'local';const filters=[];
  let shuffle=env.CHECK_SHUFFLE==='1'||env.CHECK_SHUFFLE==='true';
  let seed=env.CHECK_SEED?Number(env.CHECK_SEED):undefined;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--mode'){
      if(!args[i+1]||args[i+1].startsWith('-'))throw Error('--mode requires local or ci.');
      mode=args[++i];
    }else if(arg.startsWith('--mode='))mode=arg.slice(7);
    else if(arg==='--shuffle')shuffle=true;
    else if(arg==='--seed'){
      if(!args[i+1]||args[i+1].startsWith('-'))throw Error('--seed requires a positive integer.');
      seed=Number(args[++i]);
      shuffle=true;
    }else if(arg.startsWith('--seed=')){
      seed=Number(arg.slice(7));
      shuffle=true;
    }
    else if(arg.startsWith('-'))throw Error('Unknown check option: '+arg);
    else filters.push(arg);
  }
  if(!['local','ci'].includes(mode))throw Error('CHECK_MODE must be local or ci.');
  if(seed!==undefined&&(!Number.isSafeInteger(seed)||seed<0))throw Error('CHECK_SEED must be a non-negative integer.');
  const result={mode,filters};
  if(shuffle){
    result.shuffle=true;
    if(seed!==undefined)result.seed=seed;
  }
  return result;
}

export function resolveTestDependency(name){
  const override=process.env[name.toUpperCase()+'_MODULE'];
  if(override)return require.resolve(override);
  try{return require.resolve(name);}catch(error){
    if(error.code!=='MODULE_NOT_FOUND'||process.env.CHECK_MODE==='ci')throw error;
  }
  // Keep existing local installations usable until the user runs npm ci.
  const roots=[join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')];
  const cache=join(homedir(),'.npm/_npx');
  if(existsSync(cache))for(const entry of readdirSync(cache).sort())roots.push(join(cache,entry,'node_modules'));
  for(const root of roots){
    const candidate=join(root,name);
    if(existsSync(join(candidate,'package.json')))return require.resolve(candidate);
  }
  throw Error('Missing test dependency '+name+'. Run npm ci.');
}

export function chromiumExecutable(env=process.env){
  if(env.CHROME_PATH)return env.CHROME_PATH;
  if(visibleBrowser(env)){
    const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return env.CHECK_MODE!=='ci'&&process.platform==='darwin'&&existsSync(chrome)?chrome:undefined;
  }
  return undefined;
}
export function visibleBrowser(env=process.env){
  const ci=env.CI==='true'||env.CI==='1'||env.CHECK_MODE==='ci';
  return !ci&&env.SHOW_BROWSER==='1';
}
export function chromiumStepDelay(env=process.env){
  if(!visibleBrowser(env))return 0;
  const slow=Number(env.SLOW_MO);
  return Number.isSafeInteger(slow)&&slow>0?slow:0;
}
export function checkWorkerCounts(env,cpuCount){
  const mode=env.CHECK_MODE==='ci'?'ci':'local';
  const parallelDefault=mode==='ci'?Math.min(3,cpuCount):Math.min(8,Math.max(4,cpuCount-1));
  const browserDefault=mode==='ci'?Math.min(3,cpuCount):Math.min(4,Math.max(1,Math.floor(cpuCount/3)));
  if(visibleBrowser(env))return {parallel:1,browserParallel:1};
  return {parallel:Number(env.CHECK_PARALLEL||parallelDefault),browserParallel:Number(env.CHECK_BROWSER_PARALLEL||browserDefault)};
}
export function chromiumLaunchOptions(extra={},env=process.env){
  const headless=!visibleBrowser(env);
  const slowMo=chromiumStepDelay(env);
  const options={...extra,headless,executablePath:chromiumExecutable(env)};
  if(slowMo)options.slowMo=slowMo;
  else delete options.slowMo;
  return options;
}
function visibleCursorInstaller(){
  if(window.top!==window)return;
  const draw=()=>{
    if(document.getElementById('visible-test-cursor'))return;
    const style=document.createElement('style');
    style.textContent='#visible-test-cursor{position:fixed;z-index:2147483647;width:28px;height:28px;margin:-2px 0 0 -2px;pointer-events:none;left:-40px;top:-40px;transition:left .28s linear,top .28s linear}#visible-test-cursor svg{display:block;transform-origin:4px 4px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}#visible-test-cursor .ring{position:absolute;left:2px;top:2px;width:18px;height:18px;border:2px solid rgba(20,20,20,.85);border-radius:50%;transform:scale(.2);opacity:0}#visible-test-cursor.is-down .ring{transform:scale(1);opacity:1}#visible-test-cursor.is-down svg{transform:scale(.86)}';
    const cursor=document.createElement('div');
    cursor.id='visible-test-cursor';
    cursor.innerHTML='<span class="ring"></span><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L3 18 L8 13 L12 21 L15 19 L11 12 L18 12 Z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.append(style,cursor);
    document.addEventListener('mousemove',event=>{cursor.style.left=event.clientX+'px';cursor.style.top=event.clientY+'px';},true);
    document.addEventListener('mousedown',()=>cursor.classList.add('is-down'),true);
    document.addEventListener('mouseup',()=>cursor.classList.remove('is-down'),true);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw);
  else draw();
}
export async function launchChromium(chromium,extra){
  const browser=await chromium.launch(chromiumLaunchOptions(extra));
  if(!visibleBrowser())return browser;
  const newPage=browser.newPage.bind(browser);
  browser.newPage=async(...args)=>{
    const page=await newPage(...args);
    await page.addInitScript(visibleCursorInstaller);
    return page;
  };
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async(...args)=>{
    const context=await newContext(...args);
    await context.addInitScript(visibleCursorInstaller);
    return context;
  };
  return browser;
}
export const testTempRoot=()=>tmpdir();
