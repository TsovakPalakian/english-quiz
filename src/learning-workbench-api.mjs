// Optional authenticated boundary. No fixtures, schema creation, credentials or deployment wiring.
import {StudyError} from './learning-study.mjs';
import {kitSigned} from './learning-kits.mjs';
import {boundedMediaBytes} from './learning-r2-media.mjs';
export const WORKBENCH_PREFIX='/api/learning-workbench';
export const isWorkbenchPath=path=>path===WORKBENCH_PREFIX||path.startsWith(WORKBENCH_PREFIX+'/');
const fail=(status,message)=>{throw new StudyError(status,message);};
const json=value=>Response.json(value,{headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function withLocation(review,quiz){
  const [origin]=await review.db.read('SELECT g.title AS groupName,l.title AS lessonName,c.en AS word,m.definition AS meaning FROM class_groups g JOIN lessons l ON l.id=? JOIN cards c ON c.id=? JOIN qr_senses m ON m.id=? WHERE g.id=?',[quiz.lessonId,quiz.cardId,quiz.senseId,quiz.groupId]);
  return {...quiz,origin:origin||null};
}
function params(url,fields){const p=url.searchParams;if([...p.keys()].some(key=>!fields.includes(key)||p.getAll(key).length!==1))fail(400,'Invalid workbench query.');return p;}
function integer(value){if(!/^[1-9]\d{0,15}$/.test(value||'')||!Number.isSafeInteger(Number(value)))fail(400,'Invalid workbench identity.');return Number(value);}
async function body(request){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')fail(415,'Use JSON.');
  const reader=request.body?.getReader();if(!reader)fail(400,'JSON required.');let size=0,text='';const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>60000){await reader.cancel();fail(413,'Workbench request too large.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  try{return JSON.parse(text);}catch{fail(400,'Invalid JSON.');}
}
export async function learningWorkbenchAPI(request,{actor,services,writable=false,waitUntil=null}={}){
  kitSigned(actor);const url=new URL(request.url),path=url.pathname.slice(WORKBENCH_PREFIX.length),method=request.method;
  if(!['GET','HEAD','POST'].includes(method))fail(405,'Use GET, HEAD or POST.');
  if(method==='POST'&&(!writable||request.headers.get('origin')!==url.origin))fail(writable?403:503,writable?'Invalid origin.':'Workbench writes are off.');
  const service=name=>{if(!services?.[name])fail(503,'Workbench service unavailable.');return services[name];};
  const id='([a-f0-9-]{36})';
  const audio=new RegExp('^/speech/(tasks|attempts)/'+id+'/audio$').exec(path),asset=new RegExp('^/media/'+id+'$').exec(path),sessionAudio=new RegExp('^/sessions/'+id+'/media/(\\d+)$').exec(path);
  if((method==='GET'||method==='HEAD')&&(audio||asset||sessionAudio)){
    params(url,[]);return audio?service('speech')[audio[1]==='tasks'?'reference':'recording'](actor,audio[2],request):asset?service('media').response(actor,asset[1],request):service('sessions').media(actor,sessionAudio[1],Number(sessionAudio[2]),request);
  }
  if(method==='HEAD')fail(405,'HEAD is only supported for media.');
  if(method==='GET'){
    if(path==='/settings/providers'){params(url,[]);return json(await service('providers').inspect(actor));}
    if(path==='/settings/providers/history'){const p=params(url,['before']);return json(await service('providers').history(actor,{before:p.has('before')?integer(p.get('before')):null}));}
    if(path==='/feedback/policy'){params(url,[]);service('feedback');return json(services.feedbackPolicy);}
    if(path==='/feedback'){params(url,[]);const reports=await service('feedback').mine(actor),result=[];for(const report of reports)result.push({...report,...await service('feedbackDelivery').status(actor,report.id,{recover:writable})});return json({reports:result,policy:services.feedbackPolicy});}
    if(path==='/feedback/signals'){const p=params(url,['limit']);return json(await service('feedbackPrivacy').signals(actor,{limit:p.has('limit')?integer(p.get('limit')):50}));}
    const feedbackStatus=new RegExp('^/feedback/'+id+'$').exec(path);if(feedbackStatus){params(url,[]);return json(await service('feedbackDelivery').status(actor,feedbackStatus[1],{recover:writable}));}
    const attribution=new RegExp('^/proposals/'+id+'/attribution$').exec(path);if(attribution){params(url,[]);return json(await service('authors').get(actor,attribution[1]));}
    if(path==='/preparation'){const p=params(url,['limit']);return json(await service('preparation').summary(actor,{limit:p.has('limit')?integer(p.get('limit')):50}));}
    const dispatchHistory=/^\/preparation\/([1-9]\d{0,15})\/history$/.exec(path);
    if(dispatchHistory){const p=params(url,['before']);return json(await service('preparation').history(actor,integer(dispatchHistory[1]),{before:p.has('before')?integer(p.get('before')):null}));}
    if(path==='/status'){params(url,[]);return json({enabled:true,writable,pronunciationQuizzes:services?.review?.pronunciationQuizzes===true,pronunciationRubrics:services?.review?.pronunciationQuizzes?services.speech.rubrics.filter(rubric=>Object.keys(rubric.weights).every(key=>['accuracy','fluency','prosody'].includes(key))):[],features:[...Object.keys(services||{}).filter(key=>['kits','review','speech','transcripts','media','sessions','feedback','authors'].includes(key)),...(services?.kits?.generation?['preparation']:[])]});}
    if(path==='/kit'){const p=params(url,['cardId','senseId','groupId','lessonId']);if(p.has('groupId')!==p.has('lessonId'))fail(400,'Select group and lesson together.');return json(await service('kits').coverage(actor,{cardId:integer(p.get('cardId')),senseId:p.get('senseId')||null,...(p.has('groupId')?{groupId:integer(p.get('groupId')),lessonId:integer(p.get('lessonId'))}:{})}));}
    if(path==='/templates'){const p=params(url,['cardId']);return json({quizzes:await service('review').sharedForCard(actor,integer(p.get('cardId')))});}
    const session=new RegExp('^/sessions/'+id+'$').exec(path);
    if(session){params(url,[]);const result=await service('sessions').get(actor,session[1]);
      // The service also supports the isolated pilot; authenticated routes never expose pilot URLs.
      if(Array.isArray(result.questions))result.questions=result.questions.map((question,index)=>({...question,...(question.mediaUrl?{mediaUrl:WORKBENCH_PREFIX+'/sessions/'+session[1]+'/media/'+index}:{})}));
      return json(result);
    }
    if(path==='/queue'){const p=params(url,['offset']),offset=p.has('offset')?(p.get('offset')==='0'?0:integer(p.get('offset'))):0;
      const review=service('review'),rows=await review.queue(actor,{offset,limit:100}),quizzes=[];for(const row of rows)quizzes.push(await withLocation(review,row));return json({quizzes,nextOffset:rows.length===100?offset+100:null});}
    if(path==='/mine'){const p=params(url,['offset']),offset=p.has('offset')?(p.get('offset')==='0'?0:integer(p.get('offset'))):0,review=service('review');
      const page=await review.mine(actor,{offset,withPage:true}),quizzes=[];for(const row of page.quizzes)quizzes.push(await withLocation(review,row));
      return json({quizzes,nextOffset:page.nextOffset});}
    const proposal=new RegExp('^/proposals/'+id+'$').exec(path);if(proposal){params(url,[]);const review=service('review');return json({quiz:await withLocation(review,await review.get(actor,proposal[1]))});}
    if(path==='/speech/tasks'){
      const p=params(url,['groupId','lessonId','cardId','senseId','taskId']),speech=service('speech');if(p.has('cardId')!==p.has('senseId'))fail(400,'Select card and meaning together.');
      let catalog;
      if(p.has('taskId')){
        if([...p.keys()].some(key=>key!=='taskId'))fail(400,'Select either a private template task or a lesson.');
        const task=await speech.task(actor,p.get('taskId'));if(!task.value.quizSessionId)fail(404,'Private template task not found.');
        catalog={tasks:[{id:task.id,...task.value}],contexts:[],templatePractice:true};
      }else{
        const context={groupId:integer(p.get('groupId')),lessonId:integer(p.get('lessonId'))};catalog=p.has('cardId')?{tasks:await speech.listTasks(actor,{...context,cardId:integer(p.get('cardId')),senseId:p.get('senseId')})}:await speech.lessonCatalog(actor,context);
      }
      const {tasks}=catalog;
      let sources=[],availability={};try{const settings=await speech.providers.inspect(speech.worker);sources=['pronunciation','stt'].map(task=>settings.adapters.find(row=>row.id===settings.selections[task]?.adapterId)).filter(Boolean);
        availability=Object.fromEntries(tasks.map(task=>{const choice=settings.selections[task.evaluation];return [task.id,!!choice&&!settings.unavailable.some(row=>row.task===task.evaluation)&&choice.locale===task.locale&&choice.mode===(['pronunciation','shadowing'].includes(task.mode)?'scripted':'unscripted')];}));
      }catch{availability=Object.fromEntries(tasks.map(task=>[task.id,false]));}
      return json({...catalog,trainingAvailable:true,coachingAvailable:!!services?.coaching,rubrics:speech.rubrics.map(({id,version})=>({id,version})),availability,synthetic:!!sources.length&&sources.every(source=>source.provider==='local-fixture'),analyzerLabel:sources.map(source=>source.provider+' · '+source.model).join('; ')||null});
    }
    const training=new RegExp('^/speech/attempts/'+id+'/(training|compare)$').exec(path);
    const languageProgress=new RegExp('^/speech/tasks/'+id+'/language-progress$').exec(path);
    if(languageProgress){const p=params(url,['period','from','to']);return json(await service('transcripts').progress(actor,languageProgress[1],{period:p.get('period')||'week',from:p.has('from')?integer(p.get('from')):null,to:p.has('to')?integer(p.get('to')):null}));}
    const coaching=new RegExp('^/speech/(tasks|attempts)/'+id+'/(dialogues|exercises|dispute)$').exec(path);
    if(coaching){params(url,[]);if(coaching[1]==='tasks'&&coaching[3]==='dialogues')return json(await service('coaching').list(actor,coaching[2]));if(coaching[1]==='attempts'&&['exercises','dispute'].includes(coaching[3]))return json(await service('coaching')[coaching[3]==='dispute'?'disputeForAttempt':'exercises'](actor,coaching[2]));fail(404,'Unknown coaching action.');}
    const dialogue=new RegExp('^/speech/dialogues/'+id+'$').exec(path);if(dialogue){params(url,[]);return json(await service('coaching').get(actor,dialogue[1]));}
    if(training){const p=params(url,training[2]==='compare'?['attemptId']:[]);return json(await service('speech')[training[2]](actor,training[1],...(training[2]==='compare'?[p.get('attemptId')]:[])));}
    const speech=new RegExp('^/speech/(tasks|attempts)/'+id+'(?:/(history|progress|recipients|shared|text-reviews))?$').exec(path);
    if(speech){
      const p=params(url,speech[3]==='history'?['before']:speech[3]==='progress'?['period','from','to']:[]);
      if(speech[1]==='attempts'&&!speech[3])return json(await service('speech').get(actor,speech[2],{recover:false}));
      if(speech[1]==='attempts'&&speech[3]==='text-reviews')return json(await service('transcripts').history(actor,speech[2]));
      if(speech[1]==='tasks'&&['history','progress','recipients','shared'].includes(speech[3])){
        let before=null;if(p.has('before'))try{before=JSON.parse(p.get('before'));}catch{fail(400,'Invalid history cursor.');}
        return json(await service('speech')[speech[3]](actor,speech[2],{before,recover:false,...(speech[3]==='progress'?{period:p.get('period')||undefined,from:p.has('from')?integer(p.get('from')):null,to:p.has('to')?integer(p.get('to')):null}:{})}));
      }
    }
    const text=new RegExp('^/speech/text-reviews/'+id+'$').exec(path);if(text){params(url,[]);return json(await service('transcripts').get(actor,text[1]));}
  }
  if(method==='POST'){
    params(url,[]);
    const upload=new RegExp('^/speech/tasks/'+id+'/upload$').exec(path);
    if(path==='/media'||upload){
      let metadata;try{const header=request.headers.get('x-upload-metadata');if(!header||header.length>4000)throw Error();metadata=JSON.parse(decodeURIComponent(header));}catch{fail(400,'Invalid upload metadata.');}
      if(metadata?.mime!==request.headers.get('content-type'))fail(415,'Upload format mismatch.');
      const bytes=await boundedMediaBytes(request);return json(await (upload?service('speech').upload(actor,upload[1],metadata,bytes):service('media').upload(actor,metadata,bytes)));
    }
    const data=await body(request);
    if(path==='/settings/providers')return json(await service('providers').configure(actor,data));
    if(path==='/settings/providers/initialize'){
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='mutationId'))fail(400,'Provider initialization does not accept selections.');
      return json(await service('providers').initialize(actor));
    }
    if(path==='/feedback')return json(await service('feedback').create(actor,data));
    if(path==='/feedback/cleanup'){await service('feedbackDelivery').recover();return json(await service('feedbackPrivacy').sweep(actor,data));}
    const feedbackAction=new RegExp('^/feedback/'+id+'/(send|remove)$').exec(path);
    if(feedbackAction){if(feedbackAction[2]==='remove'){await service('feedbackDelivery').recover();return json(await service('feedbackPrivacy').erase(actor,feedbackAction[1],data));}return json(await service('feedbackDelivery').send(actor,feedbackAction[1],data));}
    const attribution=new RegExp('^/proposals/'+id+'/attribution$').exec(path);if(attribution)return json(await service('authors').set(actor,attribution[1],data));
    if(path==='/preparation/settings')return json(await service('preparation').configure(actor,data));
    if(path==='/preparation/reconcile'){
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['after','limit'].includes(key)))fail(400,'Invalid reconciliation page.');
      return json(await service('preparation').reconcile(actor,data));
    }
    if(path==='/kit/fill')return json(await service('kits').fill(actor,data));
    const removeMedia=new RegExp('^/media/'+id+'/remove$').exec(path);if(removeMedia)return json(await service('media').remove(actor,removeMedia[1],data));
    if(path==='/proposals')return json(await service('review').createDraft(actor,data));
    if(path==='/sessions')return json(await service('sessions').start(actor,data));
    const pronunciation=new RegExp('^/sessions/'+id+'/pronunciation$').exec(path);if(pronunciation)return json(await service('sessions').pronunciation(actor,pronunciation[1],data));
    if(path==='/speech/tasks')return json(await service('speech').createTask(actor,data));
    const startDialogue=new RegExp('^/speech/tasks/'+id+'/dialogues$').exec(path);if(startDialogue)return json(await service('coaching').start(actor,startDialogue[1],data));
    const dialogueAction=new RegExp('^/speech/dialogues/'+id+'/(turn|remove)$').exec(path);
    if(dialogueAction){const coaching=service('coaching'),background=dialogueAction[2]==='turn'&&typeof waitUntil==='function',result=await coaching[dialogueAction[2]](actor,dialogueAction[1],data,{background});if(background)waitUntil(Promise.allSettled([...coaching.running]));return json(result);}
    const dispute=new RegExp('^/speech/attempts/'+id+'/dispute$').exec(path);if(dispute)return json(await service('coaching').dispute(actor,dispute[1],data));
    const decision=new RegExp('^/speech/disputes/'+id+'/decision$').exec(path);if(decision)return json(await service('coaching').decide(actor,decision[1],data));
    const proposal=new RegExp('^/proposals/'+id+'/(edit|submit|return|approve|revise)$').exec(path);
    if(proposal)return json(await service('review')[{edit:'editDraft',submit:'submit',return:'requestChanges',approve:'approve',revise:'proposeRevision'}[proposal[2]]](actor,proposal[1],data));
    const speech=new RegExp('^/speech/(tasks|attempts)/'+id+'/(analyze|correct|share|revoke|cancel|remove|confirm-text)$').exec(path);
    if(speech){
      if((speech[1]==='tasks')!==(speech[3]==='analyze'))fail(404,'Unknown speech action.');
      const instance=service(speech[3]==='confirm-text'?'transcripts':'speech'),action=speech[3]==='confirm-text'?'confirm':speech[3],background=typeof waitUntil==='function'&&['analyze','confirm'].includes(action),result=await instance[action](actor,speech[2],data,{background});
      if(background)waitUntil(Promise.allSettled([...instance.running]));return json(result);
    }
    const cancelText=new RegExp('^/speech/text-reviews/'+id+'/cancel$').exec(path);if(cancelText)return json(await service('transcripts').cancel(actor,cancelText[1],data));
    const session=new RegExp('^/sessions/'+id+'/(submit|release)$').exec(path);if(session)return json(await service('sessions')[session[2]](actor,session[1],data));
  }
  fail(404,'Workbench route not found.');
}
