import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
// Explicit allowlist; this preview has no API, credentials or production assets.
const files={
  '/':['site/quiz-workbench.html','text/html'],
  '/workbench.css':['site/quiz-workbench.css','text/css'],
  '/workbench.js':['client/demos/quiz-workbench.js','text/javascript'],
  '/favicon.svg':['site/favicon.svg','image/svg+xml'],
};
const server=createServer((req,res)=>{
  const entry=files[new URL(req.url,'http://localhost').pathname];
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(!entry){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':entry[1]+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; connect-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"});
  res.end(req.method==='HEAD'?undefined:readFileSync(new URL('../'+entry[0],import.meta.url)));
});
server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log('Quiz UI preview: http://127.0.0.1:'+server.address().port));
