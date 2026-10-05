// Local-only demonstration auth. Does not deploy or contact production D1/R2.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {StudyError,StudyService,TursoStudyClient} from '../src/turso-study.mjs';
import {credentials} from './turso-staging.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const defaultSnapshot=process.env.TURSO_STAGE_SOURCE_DIR||'/Users/tsovakpalakian/Downloads/english-quiz-turso-backups/snapshot-tQUfLO';
if(!/^\/Users\/tsovakpalakian\/Downloads\/english-quiz-turso-backups\/(snapshot|tsovakdev-plan)-[A-Za-z0-9]+$/.test(defaultSnapshot))
  throw new Error('Use a private frozen staging snapshot, never served assets.');
export function snapshotPersonas(snapshot=defaultSnapshot) {
  const contents=JSON.parse(readFileSync(resolve(snapshot,'accounts.json'),'utf8'));
  const accounts=Array.isArray(contents) ? contents : contents.accounts;
  if (!Array.isArray(accounts)) throw new Error('Unsupported account snapshot format.');
  const enabled=accounts.filter(a=>Number(a.active)===1 && !Number(a.is_personal_data_revoked));
  const roles=[['teacher','ADMIN','Учитель'],['developer','DEVELOPER','Разработчик'],['student','USER','Ученик 1'],['student2','USER','Ученик 2']];
  const used=new Set();
  return roles.map(([key,role,label])=>{
    const account=enabled.find(a=>a.role===role && !used.has(a.id));
    if (!account) throw new Error('Missing required test persona.');
    used.add(account.id);
    return {key,label,id:String(account.id),role};
  });
}
function sameSecret(left,right) {
  return typeof left==='string' && Buffer.byteLength(left)===Buffer.byteLength(right)
    && timingSafeEqual(Buffer.from(left),Buffer.from(right));
}
async function bodyOf(req) {
  if (req.headers['content-type']?.split(';')[0]!=='application/json') throw new StudyError(415,'Use application/json.');
  let size=0;const chunks=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>65_536) throw new StudyError(413,'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new StudyError(400,'Invalid JSON body.'); }
}
export function createStageServer({db,personas,launchCode=randomBytes(24).toString('hex')}) {
  const service=new StudyService(db),sessions=new Map();
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const origin=`http://127.0.0.1:${server.address().port}`;
      if (req.headers.host!==new URL(origin).host) throw new StudyError(403,'Localhost only.');
      const url=new URL(req.url,origin);
      const mutating=!['GET','HEAD'].includes(req.method);
      if (mutating && req.headers.origin!==origin) throw new StudyError(403,'Invalid request origin.');
      if (req.method==='GET' && ['/','/app.js','/app.css'].includes(url.pathname)) {
        const file=url.pathname==='/'?'turso.html':url.pathname.slice(1);
        const mime=file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css';
        res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'});res.end(readFileSync(resolve(root,'staging',file)));return;
      }
      if (req.method==='GET' && url.pathname==='/api/test/personas') {json(200,personas.map(({key,label,role})=>({key,label,role})));return;}
      if (req.method==='POST' && url.pathname==='/api/test/session') {
        const body=await bodyOf(req);
        if (Object.keys(body).some(k=>!['persona','launchCode'].includes(k)) || !sameSecret(body.launchCode,launchCode)) throw new StudyError(403,'Open this stand using its private launch link.');
        const persona=personas.find(p=>p.key===body.persona);
        if (!persona) throw new StudyError(400,'Unknown persona.');
        const old=req.headers.cookie?.match(/(?:^|;\s*)turso_stage=([a-f0-9]{48})(?:;|$)/)?.[1];
        if(old)sessions.delete(old);
        for(const [id,session] of sessions)if(session.expires<=Date.now())sessions.delete(id);
        const id=randomBytes(24).toString('hex');sessions.set(id,{actor:persona,expires:Date.now()+3_600_000});
        res.setHeader('Set-Cookie',`turso_stage=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
        json(200,{key:persona.key,label:persona.label,role:persona.role});return;
      }
      const id=req.headers.cookie?.match(/(?:^|;\s*)turso_stage=([a-f0-9]{48})(?:;|$)/)?.[1];
      const session=sessions.get(id);
      if (!session || session.expires<=Date.now()) throw new StudyError(401,'Select a test session first.');
      const actor=session.actor;
      if (req.method==='GET' && url.pathname==='/api/test/me') {json(200,{key:actor.key,label:actor.label,role:actor.role});return;}
      if (req.method==='GET' && url.pathname==='/api/lessons') {json(200,await service.lessons(actor));return;}
      if (req.method==='GET' && url.pathname==='/api/cards') {
        json(200,await service.cards(actor,{lessonId:url.searchParams.get('lessonId')||'',query:url.searchParams.get('q')||'',offset:Number(url.searchParams.get('offset')||0)}));return;
      }
      const match=url.pathname.match(/^\/api\/(cards|quizzes)\/([^/]+)(\/quizzes)?$/);
      if (match) {
        const [,kind,rawId,suffix]=match,target=decodeURIComponent(rawId);
        if (kind==='cards' && !suffix && req.method==='GET') {json(200,await service.card(actor,target));return;}
        const handlers=kind==='cards'
          ? suffix ? {POST:'createQuiz'} : {PATCH:'editCard',DELETE:'deleteCard'}
          : suffix ? {} : {PATCH:'editQuiz',DELETE:'deleteQuiz'};
        if (handlers[req.method]) {json(200,await service[handlers[req.method]](actor,target,await bodyOf(req)));return;}
      }
      throw new StudyError(404,'Not found.');
    } catch(error) {
      if(error.databaseCodes)console.error('Test database transaction codes:',JSON.stringify(error.databaseCodes));
      json(error instanceof StudyError?error.status:500,{error:error instanceof StudyError?error.message:'Test service failed.'});
    }
  });
  return {server,launchCode};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {server,launchCode}=createStageServer({db:new TursoStudyClient(credentials()),personas:snapshotPersonas()});
    server.listen(8788,'127.0.0.1',()=>{
      mkdirSync(resolve(root,'rollback'),{recursive:true,mode:0o700});
      writeFileSync(resolve(root,'rollback/turso-stage-local.json'),JSON.stringify({origin:'http://127.0.0.1:8788',launchCode,pid:process.pid}),{mode:0o600});
      console.log('Local test interface: http://127.0.0.1:8788/#code='+launchCode);
      console.log('Local demonstration-session code only; database credentials stay on the server.');
    });
    server.on('error',()=>{console.error('Cannot bind local test port 8788.');process.exitCode=1;});
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
