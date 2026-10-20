const privateDirectory=new Set(['.git','.svn','.hg','.ssh','.aws']);
const privateFile=new Set(['.npmrc','.pypirc','.netrc','.htpasswd','.dev.vars','wrangler.toml','wrangler.json','wrangler.jsonc']);

export function isSensitiveFileProbe(request){
  let path=new URL(request.url).pathname;
  // Match encoded filenames as well, without inspecting query values or request bodies.
  for(let i=0;i<2;i++){
    try{const decoded=decodeURIComponent(path);if(decoded===path)break;path=decoded;}catch{break;}
  }
  return path.replaceAll('\\','/').toLowerCase().split('/').some(part=>
    privateDirectory.has(part)||privateFile.has(part)||/^\.env(?:[.~]|$)/.test(part)||/^\.dev\.vars\./.test(part));
}

export function sensitiveFileNotFound(request){
  return new Response(request.method==='HEAD'?null:JSON.stringify({error:'Not found.'}),{status:404,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
