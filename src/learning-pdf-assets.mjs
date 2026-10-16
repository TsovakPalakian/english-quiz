// Public, pinned renderer assets only; no account/content data or source maps.
export const PDF_JS_VERSION='6.4.299';
export function pdfAsset(path){
  if(path==='/pdfjs/pdf.mjs'||path==='/pdfjs/pdf.worker.mjs')return {file:'legacy/build/'+path.slice(7),mime:'text/javascript'};
  if(path==='/pdfjs/LICENSE')return {file:'LICENSE',mime:'text/plain'};
  const match=/^\/pdfjs\/(cmaps|standard_fonts|wasm)\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?)$/.exec(path);
  if(!match)return null;
  const [,directory,name]=match;
  const allowed=directory==='cmaps'?name.endsWith('.bcmap'):
    directory==='standard_fonts'?/\.(pfb|ttf)$/.test(name)||name.startsWith('LICENSE'):
    /\.(wasm|js)$/.test(name)||name.startsWith('LICENSE');
  if(!allowed)return null;
  return {file:directory+'/'+name,mime:name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'};
}
