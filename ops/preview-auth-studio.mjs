// Static local preview only: no credentials, email delivery or production calls.
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,realpathSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function previewAuthStudio(port=0){
  const root=realpathSync(fileURLToPath(new URL('../rollback/production-assets/',import.meta.url)));
  const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json'};
  const server=createServer((req,res)=>{
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      if(req.headers.host!=='127.0.0.1:'+server.address().port)return json({error:'Local host only.'},403);
      const path=new URL(req.url,'http://127.0.0.1').pathname;
      if(path.startsWith('/api/')){
        if(path==='/api/me')return json({user:null});
        if(path==='/api/auth/providers')return json({google:true,microsoft:true,telegram:true});
        if(req.method!=='GET')return json({error:'Local appearance preview. Authentication and email are not connected here.'},503);
        return json({users:[],registrations:[],changes:[],groups:[],count:0,total:0});
      }
      const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
      if(!file.startsWith(root+sep)||!existsSync(file)||!realpathSync(file).startsWith(root+sep)||!statSync(file).isFile())return json({error:'Not found.'},404);
      res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(readFileSync(file));
    }catch{json({error:'Invalid local request.'},400);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const preview=await previewAuthStudio(Number(process.env.PORT||0));console.log(preview.url+' (appearance preview; no production calls)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>process.exit(0)));
}
