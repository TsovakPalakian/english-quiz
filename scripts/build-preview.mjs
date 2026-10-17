// Builds root preview.js from client/*.js in file-name order: npm run build:preview
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
// Plain script, not modules: every part shares one global scope, so each part must end with a newline.
export function previewSource(){
  const dir=resolve(root,'client');
  return readdirSync(dir).filter(name=>name.endsWith('.js')).sort().map(name=>{
    const text=readFileSync(resolve(dir,name),'utf8');
    if(!text.endsWith('\n'))throw new Error('client/'+name+' must end with a newline');
    return text;
  }).join('');
}
export function buildPreview(){writeFileSync(resolve(root,'preview.js'),previewSource());}

if(process.argv[1]===fileURLToPath(import.meta.url))buildPreview();
