// Messaging wraps existing routes; deployment mode is chosen by the entry point.
import base,{StageAuthBudget} from './learning-integrated-worker.mjs';
import {currentUser} from './worker.js';
import {studyClient} from './learning-stage-worker.mjs';
import {StudyError} from './learning-study.mjs';
import {GroupService} from './learning-groups.mjs';
import {MessageService} from './learning-messages.mjs';
import {stageR2Media} from './learning-r2-media.mjs';
import {lessonMediaMetadata} from './learning-lesson-media.mjs';
import notificationCatalog from '../production/notification-catalog.json' with {type:'json'};
const notificationAssets=new Set([...notificationCatalog.map(sound=>sound.file),'/notification-audio/CC0.txt','/notification-audio/SOURCES.json']);
export {StageAuthBudget};
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const database=studyClient;
async function body(request) {
  const reader = request.body?.getReader(); let size = 0, chunks = [];
  if (!reader) throw new StudyError(400,'Empty request.');
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size>24000) { await reader.cancel(); throw new StudyError(413,'Message request too large.'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || Array.isArray(value) || typeof value!=='object') throw new Error(); return value; }
  catch { throw new StudyError(400,'Invalid message request.'); }
}
export function messagesWorker({mode='test',baseWorker=base,authenticate=currentUser,studyDatabase=database,directory}={}) {
  return {async fetch(request,env,ctx) {
    const url = new URL(request.url), path = url.pathname;
    const messageRoute = path === '/api/messages' || path.startsWith('/api/messages/') || path==='/api/exams/assign';
    const asset = (mode==='production'?['/messages.js','/messages.css']:['/messages-test.js','/messages-test.css']).includes(path)||(mode==='production'&&notificationAssets.has(path));
    if (!messageRoute && !asset && !(['/api/groups/manage','/api/groups/members'].includes(path) && request.method==='POST')) return baseWorker.fetch(request,env,ctx);
    if (env.MESSAGES_ENABLED!=='true' && !messageRoute && !asset) return baseWorker.fetch(request,env,ctx);
    try {
      const allowed = mode==='production'
        ? env.STORAGE_MODE==='production' && env.CONTENT_ALLOWED_HOST===url.hostname
        : mode==='test' && env.STORAGE_MODE!=='production' && url.hostname==='learn-english-learning-integrated-test.east-tarsal.workers.dev';
      if (env.MESSAGES_ENABLED!=='true' || env.STAGE_ENABLED!=='true' || !allowed
        || url.protocol!=='https:' || env.STAGE_ALLOWED_HOST!==url.hostname) throw new StudyError(403,'Messaging is unavailable on this site.');
      if (asset) { if (!['GET','HEAD'].includes(request.method)) throw new StudyError(405,'Use GET.'); return env.ASSETS.fetch(request); }
      if (!['GET','POST'].includes(request.method)) throw new StudyError(405,'Unsupported method.');
      if (request.method==='POST' && (request.headers.get('origin')!==url.origin || env.STAGE_WRITES!=='true')) throw new StudyError(403,'Message writes are unavailable.');
      let value;
      if (request.method==='POST') value = await body(request.clone());
      if (path==='/api/groups/manage' && !['exam','unassign-exam'].includes(value.action)) return baseWorker.fetch(request,env,ctx);
      const actor = await authenticate(env,request); if (!actor) throw new StudyError(401,'Sign in to open messages.');
      const users = directory || (async () => (await env.DB.prepare("SELECT id,login,name,role FROM users WHERE COALESCE(active,1)=1 AND is_personal_data_revoked=0 AND (COALESCE(hidden,0)=0 OR ?='DEVELOPER')").bind(actor.role).all()).results || []);
      const db = studyDatabase(env), service = new MessageService(db,users,()=>{
        const store=stageR2Media(env);
        store.readLegacy=async(key,name)=>{
          if(!/^lessons\/files\/[A-Za-z0-9_-]{1,100}$/.test(key))throw new StudyError(404,'Attachment unavailable.');
          const object=await env.MEDIA?.get(key);if(!object)throw new StudyError(404,'Original attachment unavailable.');
          const bytes=new Uint8Array(await object.arrayBuffer()),metadata=await lessonMediaMetadata(bytes,object.httpMetadata?.contentType||'',name);return {bytes,metadata};
        };return store;
      });
      if (path==='/api/groups/members') return json(await service.assignStudent(actor,value.accountId,value.groupId));
      if (path==='/api/groups/manage') {
        if(Object.keys(value).some(key=>!['action','id','expectedRevision','title','examId'].includes(key)))throw new StudyError(400,'Invalid group request.');
        await service.assign(actor,{targetKind:'group',targetId:value.id,examId:value.examId,action:value.action==='exam'?'assign':'unassign',expectedRevision:value.expectedRevision,clientKey:'group:'+value.id+':'+value.expectedRevision+':'+value.action+':'+value.examId});
        return json({groups:await new GroupService(db).list(actor)});
      }
      if (request.method==='GET') {
        if (path==='/api/messages') return json(await service.summary(actor));
        if (path==='/api/messages/history') return json(await service.history(actor,url.searchParams.get('roomId'),{category:url.searchParams.get('category')||'personal',before:Number(url.searchParams.get('before')||0),after:Number(url.searchParams.get('after')||0),query:url.searchParams.get('q')||''}));
        if (path==='/api/messages/assignments') return json(await service.assignments(actor));
        if (path==='/api/messages/exam') return json(await service.examLink(actor,Number(url.searchParams.get('id'))));
      } else {
        if (path==='/api/exams/assign') return json(await service.assignInSubgroup(actor,value));
        if (path==='/api/messages/open') return json(await service.open(actor,value));
        if (path==='/api/messages/send') return json(await service.send(actor,value));
        if (path==='/api/messages/read') return json(await service.read(actor,value));
        if (path==='/api/messages/mute') return json(await service.mute(actor,value));
        if (path==='/api/messages/assignment') return json(await service.assign(actor,value));
      }
      throw new StudyError(404,'Message route not found.');
    } catch (error) { return json({error:error instanceof StudyError ? error.message : 'Messages are temporarily unavailable.'},error instanceof StudyError ? error.status : 503); }
  }};
}
export default messagesWorker();
