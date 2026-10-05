import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PDF_JS_VERSION,pdfAsset} from '../src/turso-pdf-assets.mjs';
const directory=fileURLToPath(new URL('../rollback/turso-pdfjs/node_modules/pdfjs-dist/',import.meta.url));
export function pdfAssetFile(path){
  const asset=pdfAsset(path);if(!asset)return null;
  const version=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8')).version;
  if(version!==PDF_JS_VERSION)throw new Error('Pinned test PDF.js missing. Install the exact version in rollback/turso-pdfjs.');
  const file=resolve(directory,asset.file);
  if(realpathSync(file)!==file)throw new Error('PDF asset symlink rejected.');
  return {...asset,file};
}
export function pdfAssetPaths(){
  return ['/pdfjs/pdf.mjs','/pdfjs/pdf.worker.mjs','/pdfjs/LICENSE',
    ...['cmaps','standard_fonts','wasm'].flatMap(dir=>readdirSync(resolve(directory,dir)).map(name=>'/pdfjs/'+dir+'/'+name).filter(path=>pdfAsset(path)))];
}
