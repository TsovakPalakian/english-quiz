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
export const testTempRoot=()=>tmpdir();
