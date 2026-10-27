// Full site shell on disposable local data. No production credentials, remote APIs or deployment.
import {createServer} from 'node:http';
import {readFileSync,existsSync,realpathSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalWorkbench,actors} from './local-workbench-services.mjs';
import {learningWorkbenchAPI} from '../src/learning-workbench-api.mjs';
import {everydayGroups} from '../src/essential-data.mjs';
import {createLocalVideoJobs} from './local-video-jobs.mjs';

const assets=fileURLToPath(new URL('../rollback/production-assets/',import.meta.url));
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const users=Object.values(actors).map(actor=>({...actor,login:actor.name.toLowerCase().replaceAll(' ','_'),email:actor.id+'@example.invalid',active:1}));
const capabilities={legacyHistory:true,originalAccounts:true,learningWorkbench:true,learningStudyBridge:true};
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.ttf':'font/ttf','.json':'application/json','.ico':'image/x-icon'};
async function bytes(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024)throw Object.assign(Error('Local request too large.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
export async function createLearningWorkbenchPreview({port=0,inspect,gemini=null,azure=null}={}){
  if(!existsSync(resolve(assets,'index.html')))throw Error('Build local assets first: node ops/build-learning-production-assets.mjs');
  const local=await createLocalWorkbench({inspect,gemini,azure}),root=realpathSync(assets),pending=new Set(),live=!!(gemini||azure);let closing=false;
  const video=createLocalVideoJobs(local);
  const groups=[{id:1,title:'A1 Monday',date:'2026-10-23',revision:1,lessonIds:[1],examIds:[],studentCount:1},{id:2,title:'A2 Friday',date:'2026-10-23',revision:1,lessonIds:[2],examIds:[],studentCount:1}];
  const lessons=[{id:1,title:'Weather',stageRevision:1,date:'2026-10-23',published:true,blocks:[{id:1,type:'wordcard',tab:'words',stageId:1,word:'drizzle',translation:'изморось'}]},{id:2,title:'Money',stageRevision:1,date:'2026-10-23',published:true,blocks:[{id:2,type:'wordcard',tab:'words',stageId:2,word:'bank',translation:'банк'}]}];
  const members=[{accountId:'u1',account_id:'u1',groupId:1,group_id:1},{accountId:'u2',account_id:'u2',groupId:2,group_id:2}];
  function actorFor(req){const key=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('local-workbench-role='))?.split('=')[1];return users.find(row=>row.id===key)||users.find(row=>row.id==='teacher');}
  const track=promise=>{pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});};
  const server=createServer(async(req,res)=>{
    try{
      const origin='http://127.0.0.1:'+server.address().port;
      if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
      const url=new URL(req.url,origin),path=url.pathname,method=req.method;
      const actor=actorFor(req),staff=['ADMIN','DEVELOPER'].includes(actor.role),visibleGroups=staff?groups:groups.filter(row=>members.some(m=>m.accountId===actor.id&&m.groupId===row.id)),lessonIds=new Set(visibleGroups.flatMap(row=>row.lessonIds));
      let response;
      if(path==='/__local/gemini/step'&&method==='POST'){
        if(!gemini||actor.role!=='DEVELOPER')throw Object.assign(Error('Developer access required.'),{status:403});
        if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/json'||url.search)throw Object.assign(Error('Same-origin JSON required.'),{status:403});
        let data;try{data=JSON.parse((await bytes(req)).toString());}catch{throw Object.assign(Error('Invalid JSON.'),{status:400});}
        if(!data||data.confirmed!==true||Object.keys(data).length!==1)throw Object.assign(Error('Confirm one generation step.'),{status:400});
        response=json(await local.runOne(actor));
      }else if(path==='/__local/video/api'||path.startsWith('/__local/video/api/')){
        const action=path.slice('/__local/video/api'.length);
        if(url.search)throw Object.assign(Error('Video query parameters are not supported.'),{status:400});
        if(method==='GET'&&action==='')response=json(await video.list(actor));
        else if(method==='POST'){
          if(req.headers.origin!==origin)throw Object.assign(Error('Same-origin video request required.'),{status:403});
          const match=/^\/jobs\/([a-f0-9-]{36})\/(start|cancel|failed|finish)$/.exec(action);
          if(match?.[2]==='finish'){
            if(req.headers['content-type']!=='video/mp4')throw Object.assign(Error('Use MP4.'),{status:415});
            response=json(await video.finish(actor,match[1],Number(req.headers['x-video-revision']),new Uint8Array(await bytes(req))));
          }else{
            if(req.headers['content-type']?.split(';')[0]!=='application/json')throw Object.assign(Error('Use JSON.'),{status:415});
            let data;try{data=JSON.parse((await bytes(req)).toString());}catch{throw Object.assign(Error('Invalid video JSON.'),{status:400});}
            if(action==='/settings')response=json(video.configure(actor,data));
            else if(action==='/jobs')response=json(await video.create(actor,data));
            else if(match)response=json(await video[match[2]](actor,match[1],data));
            else response=json({error:'Unknown video action.'},404);
          }
        }else response=json({error:'Method not allowed.'},405);
      }else if(path==='/__local/video'&&method==='GET'){
        if(!staff)throw Object.assign(Error('Teacher access required.'),{status:403});
        response=new Response(readFileSync(new URL('../site/local-video-preview.html',import.meta.url)),{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }else if(path==='/__local/providers'&&method==='GET'){
        if(actor.role!=='DEVELOPER')throw Object.assign(Error('Select the Developer test account first.'),{status:403});
        const heading=azure?'Local AI providers':gemini?'Local Gemini generation':'Local synthetic providers';
        const description=azure?'Azure pronunciation: 2/min, 10/24h. Recording consent required. Video remains synthetic.':gemini?'Real generation: 2/min, 5/24h. Speech and video remain synthetic. Automatic dispatch is off.':'Disposable settings. No external AI or charges.';
        response=new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local providers</title><link rel="stylesheet" href="/preview.css"></head><body><main style="max-width:960px;margin:24px auto;padding:16px"><a href="/">Lumiscia</a><h1>'+heading+'</h1><p>'+description+'</p>'+(gemini?'<form id="local-gemini-step"><label><input name="confirmed" type="checkbox" required>Confirm one generation step</label><button type="submit">Run one queued job</button></form>':'')+'<p id="local-provider-status" role="status"></p><div id="local-provider-content"></div></main><script type="module" src="/__local/providers.js"></script></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }else if(path.startsWith('/api/learning-workbench/')){
        const data=await bytes(req),request=new Request(origin+req.url,{method,headers:req.headers,...(data.length?{body:data}:{})});
        response=await learningWorkbenchAPI(request,{actor,services:local.services,writable:true,waitUntil:track});
        if(method==='POST'&&response.ok)track(local.tick());
      }else if(path==='/__local/status'&&method==='GET')response=json({environment:azure?'local-ai':gemini?'local-gemini':'local-synthetic',persistent:false,externalCalls:live,...(gemini?{gemini:{remaining:await gemini.remaining(),automaticDispatch:false,budgetPersistent:true}}:{}),...(azure?{azure:{remaining:await azure.remaining(),budgetPersistent:true,prosody:false}}:{}),actor,roles:users.map(({id,name,role})=>({id,name,role})),features:['review','kits','speech','feedback','authors','preparation','statistics'],aiVideo:'local-synthetic-prototype'});
      else if(path==='/__local/role'&&method==='POST'){
        if(req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/json')throw Object.assign(Error('Same-origin JSON required.'),{status:403});
        const {id}=JSON.parse((await bytes(req)).toString());if(!users.some(row=>row.id===id))throw Object.assign(Error('Unknown local role.'),{status:400});
        response=json({ok:true});response.headers.set('Set-Cookie','local-workbench-role='+id+'; HttpOnly; SameSite=Strict; Path=/');
      }else if(path.startsWith('/api/')){
        if(method!=='GET')throw Object.assign(Error('This legacy action is not connected in the isolated preview. Workbench edits use its own API.'),{status:409});
        const empty={cards:[],groups:[],songs:[],texts:[],quizzes:[],progress:[],documents:{},next:null};
        if(path==='/api/database-context')response=json({provider:'d1',revision:1,scope:'site'});
        else if(path==='/api/me'||path==='/api/me/account')response=json({user:actor,locked:false,migrationCapabilities:capabilities});
        else if(path==='/api/me/state')response=json({bootstrap:true,stats:{},added:[],songs:[],settings:{},counts:{lessons:lessonIds.size},stageActivity:{}});
        else if(path==='/api/me/themes')response=json({accountId:actor.id,theme:'almond',themes:[],stageThemeRevision:0,stageCustomRevision:0});
        else if(path==='/api/everyday')response=json({groups:everydayGroups});
        else if(path==='/api/archive')response=json({items:[],next:null});
        else if(path==='/api/speakout/revisions')response=json({catalogRevision:'local-preview',defaultRevision:'0',lessons:{}});
        else if(path==='/api/groups')response=json({groups:visibleGroups});
        else if(path==='/api/groups/members')response=json({members:members.filter(row=>visibleGroups.some(group=>group.id===row.groupId))});
        else if(path==='/api/lessons')response=json({materials:lessons.filter(row=>lessonIds.has(row.id))});
        else if(path==='/api/admin/users'&&staff)response=json({users});
        else if(path==='/api/admin/groups'&&staff)response=json({groups});
        else if(['/api/admin/group-teachers','/api/accounts/group-teachers'].includes(path)&&staff)response=json({assignments:[{groupId:1,revision:1,teacherIds:['teacher','second']},{groupId:2,revision:1,teacherIds:['outsider']}]});
        else if(path==='/api/exams')response=json({exams:[]});
        else if(path==='/api/exams/work')response=json({work:[]});
        else if(path==='/api/exams/essay-copilot')response=json({status:'draft_ready',provider:'preview-copilot',revision:0,rubricPoints:[22,20,21,20],totalPoints:83,maxPoints:100,analysis:{wordCount:120,taskAchievement:{score:22,percent:88,minWords:80},coherence:{score:20,percent:80},lexical:{score:21,percent:84},grammatical:{score:20,percent:80}},feedback:{summary:'Good structure and vocabulary.',strengths:['Clear thesis statement','Good use of transitions'],areasForGrowth:['Increase variety of complex structures'],formattedFeedback:'AI Review Assist (Draft Suggestion):\nScore: 83 / 100 (83%)\nStrengths:\n• Clear thesis statement\n• Good use of transitions\nKey areas for revision:\n• Increase variety of complex structures'}});
        else if(path==='/api/bugs'&&actor.role==='DEVELOPER')response=json({bugs:[],total:0});
        else if(path==='/api/auth/providers')response=json({google:false,microsoft:false,telegram:false});
        else if(path.startsWith('/api/error-bank')||path.startsWith('/api/speech-scenarios')||path.includes('catalogs')||['/api/texts','/api/songs','/api/quizzes','/api/me/cards','/api/me/quizzes','/api/me/songs','/api/me/texts','/api/me/progress','/api/me/hidden-lessons','/api/lessons/visibility','/api/messages','/api/admin/registrations','/api/admin/changes','/api/admin/members'].includes(path))response=json({...empty,users:[],members:members.filter(row=>staff||row.accountId===actor.id),registrations:[],changes:[],rooms:[],contacts:[],total:0,work:[],lessons:[],queue:[],scenarios:[],stats:{dueToday:0}});
        else response=json({error:'Not connected in this local preview.'},404);
      }else if(['GET','HEAD'].includes(method)){
        const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
        if(!file.startsWith(root+sep)||!existsSync(file)||!realpathSync(file).startsWith(root+sep)||!statSync(file).isFile())response=json({error:'Not found.'},404);
        else{
          let contents=readFileSync(file);
          if(path==='/')contents=Buffer.from(contents.toString().replace('</body>','<div id="local-workbench-toolbar"><b>LOCAL · synthetic data</b><label>Account <select id="local-workbench-role"></select></label><span>No AI charges · data resets on stop</span></div><script src="/__local/shell.js"></script></body>').replace('</head>','<style>#local-workbench-toolbar{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;align-items:center;flex-wrap:wrap;gap:12px;min-height:42px;padding:6px 16px;box-sizing:border-box;background:#173b37;color:#fff;font:13px system-ui}#local-workbench-toolbar label{display:flex;align-items:center;gap:6px;margin:0}#local-workbench-toolbar select{width:auto;min-height:28px;padding:2px 6px;background:#fff;color:#173b37}.shell{margin-top:64px}@media(max-width:600px){#local-workbench-toolbar span{display:none}}</style></head>'));
          response=new Response(method==='HEAD'?null:contents,{headers:{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}});
        }
      }else response=json({error:'Method not allowed.'},405);
      if(path==='/'&&live)response=new Response((await response.text()).replace('LOCAL · synthetic data',azure?'LOCAL · Azure Speech available':'LOCAL · Gemini available').replace('No AI charges · data resets on stop',azure?'Azure analysis · consent required · 10/24h; video synthetic':'Real generation · manual only · 5/24h; speech/video synthetic'),{status:response.status,headers:response.headers});
      if(path==='/__local/shell.js'&&method==='GET')response=new Response(readFileSync(new URL('../client/demos/local-workbench-shell.js',import.meta.url)),{headers:{'Content-Type':'text/javascript'}});
      for(const [route,file] of [['/__local/providers.js','local-workbench-providers.js'],['/__local/provider-settings.js','provider-settings-ui.js'],['/__local/video.js','local-video-preview.js']])if(path===route&&method==='GET')response=new Response(readFileSync(new URL('../client/demos/'+file,import.meta.url)),{headers:{'Content-Type':'text/javascript'}});
      if(path==='/__local/video.css'&&method==='GET')response=new Response(readFileSync(new URL('../site/local-video-preview.css',import.meta.url)),{headers:{'Content-Type':'text/css'}});
      response.headers.set('X-Content-Type-Options','nosniff');
      response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    }catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.message}));}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await local.close();throw error;}
  const timer=live?null:setInterval(()=>track(local.tick()),2000);timer?.unref();
  const close=async()=>{if(closing)return;closing=true;clearInterval(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([...pending]);await local.close();};
  return {server,url:'http://127.0.0.1:'+server.address().port,close};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const preview=await createLearningWorkbenchPreview({port:Number(process.env.PORT||0)});
  console.log('Full local workbench: '+preview.url+' (synthetic providers; disposable data; no deployment)');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>process.exit(0)));
}
