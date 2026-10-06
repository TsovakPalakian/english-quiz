// Local-only original-interface staging. Never deploys or proxies study writes.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StudyError,StudyService,TursoStudyClient} from '../src/turso-study.mjs';
import {PersonalService} from '../src/turso-personal.mjs';
import {ActivityService} from '../src/turso-activity.mjs';
import {SongMediaService,AUDIO_LIMIT} from '../src/turso-song-media.mjs';
import {LessonMediaService} from '../src/turso-lesson-media.mjs';
import {configuredLocalMedia} from './turso-local-media.mjs';
import {inlineMedia,mediaKey,mediaPlaceholders,mediaMime} from '../src/turso-media.mjs';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {publicCatalogs,legacyTexts,legacyLessons,legacyCard,accountBootstrap,accountCards,accountQuizzes,accountProgress,accountSongs,pageLimit} from '../src/turso-legacy-read.mjs';
import {RealStageAuth,cloudflareAccountSource} from './turso-real-auth.mjs';
import {mainPreview} from './turso-main-preview.mjs';
import {pdfAssetFile} from './turso-pdf-assets.mjs';
import {credentials} from './turso-staging.mjs';
import {defaultSnapshot} from './run-turso-stage.mjs';
import {stageContentPolicy} from '../src/turso-embed.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function jsonBody(req){
  if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new StudyError(415,'Use application/json.');
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65_536)throw new StudyError(413,'Request too large.');chunks.push(chunk);}
  try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body || typeof body!=='object' || Array.isArray(body))throw new Error();return body;}
  catch{throw new StudyError(400,'Invalid JSON.');}
}
const safeJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function createMainServer({db,auth,mediaStore=null,offlineFixture=false}){
  const service=new StudyService(db),personal=new PersonalService(db),activity=new ActivityService(db);let catalogs=null,catalogTime=0;
  const songMedia=new SongMediaService(db,mediaStore);
  const lessonMedia=new LessonMediaService(db,mediaStore);
  async function catalog(){
    if(!catalogs || Date.now()-catalogTime>10_000){catalogTime=Date.now();catalogs=publicCatalogs(db).catch(error=>{catalogs=null;throw error;});}
    const data=await catalogs;
    if(!data.LESSON_DATA || !data.GRAMMAR || !data.IRREGULAR || !data.TENSE_BANK)throw new StudyError(503,'Imported public catalogs are incomplete. No old-data fallback.');
    return data;
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',stageContentPolicy);
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    const send=(type,value)=>{res.writeHead(200,{'Content-Type':type});res.end(value);};
    try{
      const origin=`http://127.0.0.1:${server.address().port}`;
      if(req.headers.host!==new URL(origin).host)throw new StudyError(403,'Localhost only.');
      const url=new URL(req.url,origin),path=url.pathname;
      if(!['GET','HEAD'].includes(req.method) && req.headers.origin!==origin)throw new StudyError(403,'Invalid request origin.');
      if(req.method==='GET'){
        if(path==='/' || path==='/preview.html'){
          await catalog();
          const banner='<div id="turso-main-banner"><p><strong>TEST Turso — основной интерфейс.</strong> Вход: существующий аккаунт. Доступны карточки по ID и вручную, квизы, уроки, личные тексты/песни, прогресс и учебная статистика. Аудио личных песен — отдельное локальное хранилище; старые файлы только для чтения; внешний анализатор отключён. Рабочий сайт не изменяется. <button id="turso-main-refresh" type="button">Проверить сервер</button><button id="turso-main-retry" type="button">Повторить</button></p><div id="turso-main-status" role="status" aria-live="polite"></div></div>';
          let html=readFileSync(resolve(root,'preview.html'),'utf8').replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/g,'');
          html=html.replace('</head>','<link rel="stylesheet" href="/main-stage.css"></head>').replace(/<body[^>]*>/,match=>match+banner)
            .replace('<script src="grammar.js">','<script src="/main-bridge.js"></script><script src="grammar.js">');
          if(offlineFixture)html=html.replace('id="turso-main-banner"','id="turso-main-banner" data-offline-fixture="true"')
            .replace('TEST Turso — основной интерфейс.','OFFLINE FIXTURE — SQLite, только синтетические аккаунты. Реальные БД не используются.')
            .replace('Вход: существующий аккаунт.','Вход: только offline_teacher / offline_dev / offline_student.');
          send('text/html; charset=utf-8',html);return;
        }
        const catalogKeys={'/lesson-data.js':['LESSON_DATA'],'/grammar.js':['GRAMMAR'],'/irregular.js':['IRREGULAR','VERB_IPA','VERB_IPA_CASE'],'/speakout.js':['SPEAKOUT']};
        if(catalogKeys[path]){
          const data=await catalog();
          send('text/javascript; charset=utf-8',catalogKeys[path].map(key=>`window.${key}=${safeJson(data[key]??{})};window.TursoMain.register(window.${key});`).join('\n'));return;
        }
        if(path==='/tense-bank.json'){send('application/json; charset=utf-8',safeJson((await catalog()).TENSE_BANK));return;}
        if(path==='/preview.js'){send('text/javascript; charset=utf-8',mainPreview(readFileSync(resolve(root,'preview.js'),'utf8'),readFileSync(resolve(root,'staging/main-hooks.js'),'utf8')));return;}
        const pdfAsset=pdfAssetFile(path);
        if(pdfAsset){send(pdfAsset.mime,readFileSync(pdfAsset.file));return;}
        const assets={'/preview.css':['preview.css','text/css'],'/almond-blossom.jpg':['almond-blossom.jpg','image/jpeg'],
          '/main-bridge.js':['staging/main-bridge.js','text/javascript'],'/main-stage.css':['staging/main-stage.css','text/css']};
        if(assets[path]){const [file,type]=assets[path];send(type,readFileSync(resolve(root,file)));return;}
        if(path==='/demonstratives.js'){send('text/javascript; charset=utf-8',readFileSync(resolve(defaultSnapshot,'local-catalogs/demonstratives.js')));return;}
        if(/^\/pdf\/[A-Za-z0-9._-]+\.pdf$/.test(path)){
          const file=realpathSync(resolve(root,path.slice(1)));if(!file.startsWith(resolve(root,'pdf')+'/'))throw new StudyError(404,'Not found.');
          send('application/pdf',readFileSync(file));return;
        }
      }
      if(path==='/api/login' && req.method==='POST'){
        const session=await auth.login(await jsonBody(req));
        auth.logout(req);
        res.setHeader('Set-Cookie',`turso_real=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);
        json(200,{user:session.user});return;
      }
      if(path==='/api/logout' && req.method==='POST'){
        auth.logout(req);res.setHeader('Set-Cookie','turso_real=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{ok:true});return;
      }
      // Fail closed BEFORE any production account read for unsupported operations.
      const cardRoute=path.match(/^\/api\/(cards|quizzes)\/([^/]+)(\/quizzes)?$/);
      const dictionaryRoute=path.match(/^\/api\/cards\/([A-Za-z0-9_-]{1,100})\/dictionary$/);
      const progressRoute=path.match(/^\/api\/cards\/([^/]+)\/(progress|answers)$/);
      const responseRoute=path.match(/^\/api\/lessons\/([^/]+)\/blocks\/([^/]+)\/response$/);
      const lessonRoute=path.match(/^\/api\/lessons\/([^/]+)$/);
      const ownCardRoute=path.match(/^\/api\/me\/cards\/([^/]+)$/);
      const ownCardWrite=(path==='/api/me/cards' && req.method==='POST') || (ownCardRoute && req.method==='DELETE');
      const newCardWrite=path==='/api/me/cards/new' && req.method==='POST';
      const libraryRoute=path.match(/^\/api\/library\/([^/]+)$/);
      const mediaUpload=path.match(/^\/api\/library\/([A-Za-z0-9_-]{1,100})\/media$/);
      const lessonUpload=path.match(/^\/api\/lessons\/([A-Za-z0-9_-]{1,100})\/blocks\/([A-Za-z0-9_-]{1,100})\/media$/);
      const audioWrite=(mediaUpload||lessonUpload)&&req.method==='POST';
      const mediaDetach=lessonUpload&&req.method==='DELETE';
      if(audioWrite&&!mediaStore)throw new StudyError(503,'Isolated audio storage unavailable.');
      const libraryWrite=(path==='/api/library' && req.method==='POST') || (libraryRoute && ['PATCH','DELETE'].includes(req.method));
      const activityWrite=path==='/api/stats/event'&&req.method==='POST';
      const inlineRoute=path.match(/^\/api\/migration-media\/([a-f0-9]{64})$/);
      const fileRead=['/api/song-file','/api/lesson-file'].includes(path)&&['GET','HEAD'].includes(req.method);
      const reads=['/api/me','/api/me/account','/api/me/state','/api/me/cards','/api/me/quizzes','/api/me/progress','/api/me/songs','/api/texts','/api/lessons','/api/cards','/api/library','/api/stats'];
      const supported=(req.method==='GET' && (reads.includes(path) || dictionaryRoute || (cardRoute?.[1]==='cards' && !cardRoute[3])))
        || (cardRoute && (cardRoute[3]?cardRoute[1]==='cards' && req.method==='POST':['PATCH','DELETE'].includes(req.method)))
        || (progressRoute && req.method===(progressRoute[2]==='answers'?'POST':'PATCH'))
        || (responseRoute && req.method==='PUT');
      const lessonWrite=(path==='/api/lessons' && req.method==='POST') || (lessonRoute && ['PATCH','DELETE'].includes(req.method));
      if(!supported && !lessonWrite && !ownCardWrite && !newCardWrite && !libraryWrite && !activityWrite && !audioWrite && !mediaDetach && !(inlineRoute&&req.method==='GET')&&!fileRead)throw new StudyError(path.startsWith('/api/') || ['/lookup','/translate'].includes(path)?501:404,'This operation is not migrated. No production fallback or write was attempted.');
      const actor=await auth.current(req);
      if(path==='/api/me' && req.method==='GET'){json(200,{user:actor});return;}
      if(!actor)throw new StudyError(401,'Sign in with your existing account.');
      if(mediaDetach){json(200,await lessonMedia.detach(actor,lessonUpload[1],lessonUpload[2],await jsonBody(req)));return;}
      if(audioWrite){
        if(lessonUpload&&!['ADMIN','DEVELOPER'].includes(actor.role))throw new StudyError(403,'Only teacher/developer can upload lesson files.');
        const fields=['mutationId','expectedRevision','name',...(lessonUpload?['expectedBlockRevision']:[])];
        if([...url.searchParams.keys()].some(key=>!fields.includes(key))||[...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1))throw new StudyError(400,'Invalid file fields.');
        const mime=req.headers['content-type'];
        if(!['audio/wav','audio/ogg','audio/mpeg',...(lessonUpload?['application/pdf','image/png','image/jpeg','image/gif','image/webp']:[])].includes(mime))throw new StudyError(415,'Unsupported media type.');
        if(Number(req.headers['content-length'])>AUDIO_LIMIT)throw new StudyError(413,'Audio exceeds 10 MiB.');
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>AUDIO_LIMIT)throw new StudyError(413,'Audio exceeds 10 MiB.');chunks.push(chunk);}
        const body={mutationId:url.searchParams.get('mutationId'),expectedRevision:Number(url.searchParams.get('expectedRevision')),name:url.searchParams.get('name'),mime};
        json(200,lessonUpload?await lessonMedia.upload(actor,lessonUpload[1],lessonUpload[2],{...body,expectedBlockRevision:Number(url.searchParams.get('expectedBlockRevision'))},Buffer.concat(chunks))
          :await songMedia.upload(actor,mediaUpload[1],body,Buffer.concat(chunks)));return;
      }
      if(path==='/api/me/account'){json(200,{user:actor,change:null,locked:true,testReadonly:true});return;}
      if(path==='/api/me/state'){json(200,await accountBootstrap(db,actor));return;}
      const slice={after:url.searchParams.get('after')||'',limit:pageLimit(url.searchParams.get('limit'))};
      if(path==='/api/me/cards'&&req.method==='GET'){json(200,await accountCards(db,actor,slice));return;}
      if(path==='/api/me/quizzes'&&req.method==='GET'){json(200,await accountQuizzes(db,actor,slice));return;}
      if(path==='/api/me/progress'&&req.method==='GET'){json(200,await accountProgress(db,actor,slice));return;}
      if(path==='/api/me/songs'&&req.method==='GET'){json(200,await accountSongs(db,actor,slice));return;}
      if(dictionaryRoute){json(200,legacyCard(await service.readableCard(actor,dictionaryRoute[1])));return;}
      if(inlineRoute){const entry=await inlineMedia(db,actor,inlineRoute[1]),bytes=readFileSync(resolve(defaultSnapshot,entry.file));
        if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new StudyError(503,'Media checksum mismatch.');send(entry.mime,bytes);return;}
      if(fileRead){
        if(url.searchParams.get('for'))throw new StudyError(403,'Only own files on this test stage.');
        const key=await mediaKey(db,actor,path==='/api/song-file'?'song':'lesson',url.searchParams.get('id')||'');
        let response;
        if(key.startsWith('stage-local/')){
          if(!mediaStore)throw new StudyError(503,'Local audio storage missing. No production fallback.');
          response=await mediaStore.response(key,req.method,req.headers.range||'');
        }else{
          if(!auth.source?.readMedia)throw new StudyError(503,'Read-only media provider unavailable.');
          response=await auth.source.readMedia(key,req.method==='HEAD'?'':req.headers.range||'');
        }
        let mime='';
        if(response.ok){try{mime=mediaMime(response.headers.get('content-type')||'');}catch(error){await response.body?.cancel();throw error;}}
        const headers={'Content-Type':response.ok?mime:'text/plain','Cache-Control':'private, no-store'};
        for(const name of ['content-length','content-range','accept-ranges'])if(response.headers.has(name))headers[name]=response.headers.get(name);
        res.writeHead(response.status,headers);if(req.method==='HEAD'){await response.body?.cancel();res.end();}else if(response.body)Readable.fromWeb(response.body).on('error',()=>res.destroy()).pipe(res);else res.end();return;
      }
      if(newCardWrite){json(200,await personal.createOwnCard(actor,await jsonBody(req)));return;}
      if(libraryWrite){const body=await jsonBody(req);json(200,path==='/api/library'?await personal.createLibrary(actor,body):await personal.editLibrary(actor,decodeURIComponent(libraryRoute[1]),body,req.method==='DELETE'));return;}
      if(path==='/api/library'&&url.searchParams.has('ids')){json(200,{items:await personal.libraryItems(actor,url.searchParams.get('ids'))});return;}
      if(path==='/api/library'){json(200,{items:await personal.library(actor)});return;}
      if(activityWrite){json(200,await activity.events(actor,await jsonBody(req)));return;}
      if(path==='/api/stats'){json(200,await activity.stats(actor,{from:url.searchParams.get('from'),to:url.searchParams.get('to'),user:url.searchParams.get('user')||'',role:url.searchParams.get('role')||''}));return;}
      if(ownCardWrite){
        const body=await jsonBody(req);
        json(200,path==='/api/me/cards'?await service.linkCard(actor,body):await service.unlinkCard(actor,decodeURIComponent(ownCardRoute[1]),body));return;
      }
      if(path==='/api/texts'){json(200,await legacyTexts(db,actor,{summary:url.searchParams.get('summary')!=='0',...slice}));return;}
      if(lessonWrite){
        const body=await jsonBody(req),result=path==='/api/lessons'?await service.createLesson(actor,body)
          :await service[req.method==='DELETE'?'deleteLesson':'editLesson'](actor,decodeURIComponent(lessonRoute[1]),body);
        catalogs=null;json(200,result);return;
      }
      if(path==='/api/lessons'){json(200,mediaPlaceholders(await legacyLessons(db,actor)));return;}
      if(path==='/api/cards'){
        json(200,await service.cards(actor,{query:url.searchParams.get('q')||'',lessonId:url.searchParams.get('lessonId')||'',offset:Number(url.searchParams.get('offset')||0),exact:url.searchParams.get('exact')==='1'}));return;
      }
      if(progressRoute){
        const method=progressRoute[2]==='answers'?'answerCard':'saveCardProgress';
        json(200,await service[method](actor,decodeURIComponent(progressRoute[1]),await jsonBody(req)));return;
      }
      if(responseRoute){json(200,await service.saveLessonResponse(actor,decodeURIComponent(responseRoute[1]),decodeURIComponent(responseRoute[2]),await jsonBody(req)));return;}
      if(cardRoute){
        const [,kind,rawId,suffix]=cardRoute,id=decodeURIComponent(rawId);
        if(req.method==='GET'){json(200,await service.card(actor,id));return;}
        const operation=kind==='cards'?suffix?'createQuiz':req.method==='PATCH'?'editCard':'deleteCard':req.method==='PATCH'?'editQuiz':'deleteQuiz';
        const result=await service[operation](actor,id,await jsonBody(req));catalogs=null;json(200,result);return;
      }
      throw new StudyError(404,'Not found.');
    }catch(error){json(error instanceof StudyError?error.status:500,{error:error instanceof StudyError?error.message:'Test service unavailable. No production fallback.'});}
  });
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const server=createMainServer({db:new TursoStudyClient(credentials()),auth:new RealStageAuth(cloudflareAccountSource()),mediaStore:configuredLocalMedia(root)});
    server.listen(8789,'127.0.0.1',()=>{
      mkdirSync(resolve(root,'rollback'),{recursive:true,mode:0o700});
      writeFileSync(resolve(root,'rollback/turso-main-local.json'),JSON.stringify({origin:'http://127.0.0.1:8789',pid:process.pid}),{mode:0o600});
      console.log('Original-interface TEST Turso: http://127.0.0.1:8789');console.log('Enter your existing password only in the local login form. D1: users authentication SELECTs only, max 50/hour.');
    });
    server.on('error',()=>{console.error('Cannot bind local test port 8789.');process.exitCode=1;});
  }catch(error){console.error(error instanceof StudyError?error.message:'Cannot start isolated test server.');process.exitCode=1;}
}
