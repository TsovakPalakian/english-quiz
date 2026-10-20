// LOCAL ONLY: synthetic accounts, in-memory SQLite, no production credentials.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fixture,actors,body} from '../test/quiz-review-fixture.mjs';
const files={'/':['site/quiz-review-local.html','text/html'],'/workbench.css':['site/quiz-workbench.css','text/css'],'/review-local.css':['site/quiz-review-local.css','text/css'],'/review-local.js':['client/demos/quiz-review-local.js','text/javascript'],'/review-editor.js':['client/demos/quiz-review-editor.js','text/javascript'],'/favicon.svg':['site/favicon.svg','image/svg+xml']};
const checks={meaning:true,answers:true,level:true};
function fail(status,message){throw Object.assign(new Error(message),{status});}
async function jsonBody(req){
  const length=Number(req.headers['content-length']);if(Number.isFinite(length)&&length>60000)fail(413,'Request is too large.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Use application/json.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>60000)fail(413,'Request is too large.');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'Invalid JSON.');}
}
export async function createQuizReviewPreview({port=0}={}){
  const f=await fixture({approval:true}),service=f.service;
  await service.linkCard(actors.dev,body({cardId:3,senseId:f.senseId}));
  await service.linkCard(actors.dev,body({cardId:4,senseId:f.senseId}));
  const bank=await service.createSense(actors.dev,body({cardId:2,meaning:{partOfSpeech:'noun',translation:'банк',definition:'An institution that keeps and lends money.'}}));
  const contexts=[
    {id:'weather',groupId:1,group:'A1 Monday',lessonId:1,lesson:'Weather',cardId:1,senseId:f.senseId,word:'drizzle',translation:'изморось',meaning:'Light rain in very small drops.',personal:false},
    {id:'money',groupId:2,group:'A2 Friday',lessonId:2,lesson:'Money',cardId:2,senseId:bank.senseId,word:'bank',translation:'банк',meaning:'An institution that keeps and lends money.',personal:false},
  ];
  const flip=await f.draft(actors.student,{type:'Flip',content:{explanation:'Drizzle means light rain.',items:[{front:'drizzle',back:'изморось'}]}});
  await service.submit(actors.student,flip.id,body({expectedRevision:1}));await service.approve(actors.teacher,flip.id,body({expectedRevision:2,checks}));
  const gap=await f.draft();await service.submit(actors.student,gap.id,body({expectedRevision:1}));
  for(const [options,answer] of [[['изморось','гроза','снег'],0],[['туман','изморось','град'],1]]){
    const q=await f.draft(actors.student,{type:'Choice',content:{explanation:'Drizzle is light rain, not a storm.',items:[{prompt:'What does drizzle mean?',options,answer}]}});await service.submit(actors.student,q.id,body({expectedRevision:1}));
  }
  const q=await service.createDraft(actors.other,body({groupId:2,lessonId:2,cardId:2,senseId:bank.senseId,type:'Type',content:{explanation:'A bank keeps money.',items:[{prompt:'банк',answer:'bank'}]}}));
  await service.submit(actors.other,q.id,body({expectedRevision:1}));
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      const host='127.0.0.1:'+server.address().port;
      if(req.headers.host!==host)fail(403,'Loopback host required.');
      const path=new URL(req.url,'http://'+host).pathname;
      if(['GET','HEAD'].includes(req.method)&&files[path]){const [file,type]=files[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(req.method==='HEAD'?undefined:readFileSync(new URL('../'+file,import.meta.url)));return;}
      if(!path.startsWith('/local/'))fail(404,'Not found.');
      if(!['GET','POST'].includes(req.method))fail(405,'Method not allowed.');
      if(req.method==='POST'&&req.headers.origin!=='http://'+host)fail(403,'Same-origin request required.');
      const role=/\bqr-preview=([a-z]+)(?:;|$)/.exec(req.headers.cookie||'')?.[1]||'teacher',actor=Object.hasOwn(actors,role)?actors[role]:null;
      if(!actor)fail(401,'Choose a test account.');
      if(path==='/local/session'&&req.method==='POST'){
        const data=await jsonBody(req);if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length!==1||!Object.hasOwn(actors,data.role))fail(400,'Unknown test account.');
        res.setHeader('Set-Cookie','qr-preview='+data.role+'; Path=/; HttpOnly; SameSite=Strict');send(200,{ok:true});return;
      }
      if(req.method==='GET'){
        if(path==='/local/boot'){
          const available=[];for(const c of contexts){try{await service.checkContext(actor,c);available.push(c);}catch(error){if(error.status!==403)throw error;}}
          if(actor.role==='USER')available.push({...contexts[0],id:'personal',personal:true,groupId:null,lessonId:null,group:'Personal cards',lesson:'',cardId:actor.id==='u1'?3:4});
          send(200,{role,actor,roles:Object.entries(actors).map(([id,a])=>({id,name:a.name,role:a.role})),contexts:available});return;
        }
        if(path==='/local/mine'){send(200,{quizzes:await service.mine(actor)});return;}
        if(path==='/local/queue'){send(200,{quizzes:await service.queue(actor)});return;}
        const shared=/^\/local\/shared\/(\d+)$/.exec(path);if(shared){send(200,{quizzes:await service.sharedForCard(actor,Number(shared[1]))});return;}
        const get=/^\/local\/quizzes\/([a-f0-9-]{36})$/.exec(path);if(get){send(200,{quiz:await service.get(actor,get[1])});return;}
      }else{
        const data=await jsonBody(req);
        if(path==='/local/quizzes'){send(201,await service.createDraft(actor,data));return;}
        const operation=/^\/local\/quizzes\/([a-f0-9-]{36})\/(edit|submit|return|approve|revise)$/.exec(path);
        if(operation){const methods={edit:'editDraft',submit:'submit',return:'requestChanges',approve:'approve',revise:'proposeRevision'};send(200,await service[methods[operation[2]]](actor,operation[1],data));return;}
      }
      fail(404,'Not found.');
    }catch(error){if(!res.headersSent)send(error.status||500,{error:error.status?error.message:'Local preview operation failed.'});else res.end();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){f.close();throw error;}
  server.once('close',()=>f.close());
  return {server,url:'http://127.0.0.1:'+server.address().port};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {server,url}=await createQuizReviewPreview({port:Number(process.env.PORT||0)});console.log('Quiz backend preview: '+url);
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
