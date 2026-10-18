// Builds root preview.js from client/*.js and production/chat.js from production/chat/*.js in file-name order: npm run build:preview
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export const bundles={'preview.js':'client','production/chat.js':'production/chat'};
// Plain scripts, not modules: parts share one scope, so each part must end with a newline.
export function bundleSource(target){
  const dir=resolve(root,bundles[target]);
  return readdirSync(dir).filter(name=>name.endsWith('.js')).sort().map(name=>{
    const text=readFileSync(resolve(dir,name),'utf8');
    if(!text.endsWith('\n'))throw new Error(bundles[target]+'/'+name+' must end with a newline');
    return text;
  }).join('');
}
export function buildPreview(){for(const target of Object.keys(bundles))writeFileSync(resolve(root,target),bundleSource(target));}

if(process.argv[1]===fileURLToPath(import.meta.url))buildPreview();
