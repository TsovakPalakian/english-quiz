// Builds root preview.js from client/*.js and production/chat.js from production/chat/*.js in file-name order: npm run build:preview
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
export function inviteQrDependency(){
  const library=readFileSync(require.resolve('qrcode-generator'),'utf8');
  return 'const createInviteQr = (() => { const module = {exports:{}}; const exports = module.exports;\n'+library+'\nreturn module.exports; })();\n';
}
export const bundles={'preview.js':'client','production/chat.js':'production/chat'};
// Plain scripts, not modules: parts share one scope, so each part must end with a newline.
export function bundleSource(target){
  const dir=resolve(root,bundles[target]);
  const passkeys=target==='preview.js'?readFileSync(resolve(dirname(require.resolve('@simplewebauthn/browser')),'../dist/bundle/index.umd.min.js'),'utf8')+'\n':'';
  return (target==='preview.js'?inviteQrDependency()+passkeys:'')+readdirSync(dir).filter(name=>name.endsWith('.js')).sort().map(name=>{
    const text=readFileSync(resolve(dir,name),'utf8');
    if(!text.endsWith('\n'))throw new Error(bundles[target]+'/'+name+' must end with a newline');
    return text;
  }).join('');
}
export function buildPreview(){for(const target of Object.keys(bundles))writeFileSync(resolve(root,target),bundleSource(target));}

if(process.argv[1]===fileURLToPath(import.meta.url))buildPreview();
