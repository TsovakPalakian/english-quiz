import {createRequire} from 'node:module';
import {existsSync,readdirSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
export function checkMode(args=[],env=process.env){
  let mode=env.CHECK_MODE||'local';const filters=[];
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--mode'){
      if(!args[i+1]||args[i+1].startsWith('-'))throw Error('--mode requires local or ci.');
      mode=args[++i];
    }else if(arg.startsWith('--mode='))mode=arg.slice(7);
    else if(arg.startsWith('-'))throw Error('Unknown check option: '+arg);
    else filters.push(arg);
  }
  if(!['local','ci'].includes(mode))throw Error('CHECK_MODE must be local or ci.');
  return {mode,filters};
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

export function chromiumExecutable(){
  if(process.env.CHROME_PATH)return process.env.CHROME_PATH;
  const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return process.env.CHECK_MODE!=='ci'&&process.platform==='darwin'&&existsSync(chrome)?chrome:undefined;
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
export function chromiumLaunchOptions(extra={}){
  const headless=!visibleBrowser();
  const slowMo=chromiumStepDelay();
  const options={...extra,headless,executablePath:chromiumExecutable()};
  if(slowMo)options.slowMo=slowMo;
  else delete options.slowMo;
  return options;
}
export const testTempRoot=()=>tmpdir();
