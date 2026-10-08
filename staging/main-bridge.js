// No production API fallback. Local, disposable caches are not authoritative.
(() => {
  // Block native GET fallback even if the main interface fails to initialize.
  document.addEventListener('submit',event=>{
    if(event.target?.id==='loginForm')event.preventDefault();
  },true);
  const queueKey='turso-main-pending',cards=new Map(),collections=new Map(),quizzes=new Map();
  const managedLinkRevisions=new Map();
  const catalogDetails=new Map();
  const personalKey='turso-main-personal-pending',quizProgress=new Map(),cardProgress=new Map(),savedResponses=new Map();
  let personalQueue=[],personalRunning=false,personalReady=false,personalTimer,unloading=false;
  try{const saved=JSON.parse(localStorage.getItem(personalKey)||'[]');if(Array.isArray(saved))personalQueue=saved;}catch{localStorage.removeItem(personalKey);}
  let actorId='',busy=false,pending=null,addedRevision=0,themeRevision=0,themeRecovering=false,backendCapabilities={};
  const mediaAllowed=()=>['127.0.0.1','learn-english-turso-integrated-test.east-tarsal.workers.dev'].includes(location.hostname);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
  function lessonSnapshot(material){
    const changes={};
    for(const key of ['title','description','className','unit','lesson','date'])changes[key]=String(material[key]||'');
    for(const key of ['published','hiddenFromStudents'])changes[key]=!!material[key];
    const blocks=(material.blocks||[]).map(block=>{
      let content;
      const cardId=block.stageDefinition?.cardId||(['word','wordcard'].includes(block.type)?block.stageId:null)||null;
      if(cardId && block.stageDefinition)content={...clone(block.stageDefinition.content),...(block.collapsed!==undefined?{collapsed:block.collapsed}:{})};
      else if(cardId && ['word','wordcard'].includes(block.type))content={}; // Link the definition; never copy its dictionary into the lesson.
      else content=Object.fromEntries(Object.entries(clone(block)).filter(([key])=>!key.startsWith('stage')&&!['id','type','tab','response','score'].includes(key)));
      delete content.response;delete content.score;
      // Expanding a block is local UI state, not an edit to its definition.
      if(block.stageDefinition){
        if(Object.hasOwn(block.stageDefinition.content,'collapsed'))content.collapsed=block.stageDefinition.content.collapsed;
        else delete content.collapsed;
      }
      for(const item of content.items||[])if(item && typeof item==='object')for(const key of ['picked','typed','marked','correct'])delete item[key];
      return {id:block.id,expectedRevision:block.stageBlockRevision||0,type:block.type,tab:block.tab||'',cardId,content};
    });
    const visible=blocks.map(b=>b.id);
    const removed=new Set((material.stageLessonBaseline?.blocks||[]).map(b=>b.id).filter(id=>!visible.includes(id)));
    const order=[...visible,...(material.stageBlockOrder||[]).filter(id=>!visible.includes(id)&&!removed.has(id))];
    return {changes,blocks,order};
  }
  function lessonDirty(material){
    if(!material?.stageLessonBaseline)return true;
    return canonical(lessonSnapshot(material))!==canonical(material.stageLessonBaseline);
  }
  try{pending=JSON.parse(localStorage.getItem(queueKey)||'null');}catch{localStorage.removeItem(queueKey);}
  try{
    const place=JSON.parse(sessionStorage.getItem('enquiz-place')||'null');
    const id=place&&place.id;
    const target=id&&id!=='home'&&document.getElementById(id);
    if(target){
      const parent={lesson:'days',lesson07:'days',lesson09:'days',lesson14:'days',lesson16:'days',lesson23:'days',material:'days',word:'days',rules:'days',daywords:'days',daywork:'days',daysetup:'days',dayq:'days',daychoice:'days',dayflip:'days',dayjudge:'days',days:'days',pdfview:'days',song:'library',music:'library',lyricadd:'library',musicword:'library',texts:'library',textedit:'library',textread:'library',tenses:'library',tense:'library',marker:'library',library:'library',verbs:'library',phrasal:'library',idioms:'library',articles:'library',speakout:'library',choice:'setup',flip:'setup',type:'setup',gap:'setup',build:'setup',judge:'setup',tap:'setup',multi:'setup',pairs:'setup',exam:'setup',errors:'setup',setup:'setup',made:'add',allwords:'home',cardstat:'home',account:'account',profile:'account',admin:'account',themes:'account'}[id]||id;
      document.querySelectorAll('section').forEach(s=>s.classList.toggle('on',s.id===id));
      document.querySelectorAll('.side nav button, .tabbar button').forEach(b=>{
        const on=b.dataset.jump===parent;
        b.classList.toggle('on',on);
        if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      });
    }
  }catch{}
  // Avoid restored browser caches resurrecting removed/shared/private entities.
  for(const key of Object.keys(localStorage))if(key.startsWith('enquiz-'))localStorage.removeItem(key);
  function notice(message,bad=false){
    const el=document.getElementById('turso-main-status');if(!el)return;
    const banner=document.getElementById('turso-main-banner');
    if(banner?.dataset?.compactNotices==='true'){
      banner.hidden=!bad;
      const retry=document.getElementById('turso-main-retry');
      if(retry)retry.hidden=!(pending||personalQueue.length);
    }
    if(document.getElementById('turso-main-banner')?.dataset?.offlineFixture==='true')
      message=String(message).replaceAll('тестовой Turso','автономной SQLite').replaceAll('тестовую Turso','автономную SQLite');
    el.textContent=message;el.classList.toggle('bad',bad);
  }
  function register(value){
    if(Array.isArray(value)){value.forEach(register);return;}
    if(value && typeof value==='object'){
      if(value.stageId && value.stageRevision)cards.set(value.stageId,{...value,en:value.en||value.word||value.base});
      else Object.values(value).forEach(register);
    }
  }
  function discardStaleTheme(){
    if(themeRecovering)return;
    const next=personalQueue.filter(row=>!(row.kind==='theme'&&row.body&&row.body.expectedRevision!==themeRevision));
    if(next.length===personalQueue.length)return;
    personalQueue=next;savePersonal();
  }
  function registerState(data){
    if(data.stageThemeRevision!=null)themeRevision=data.stageThemeRevision||0;
    discardStaleTheme();
    if(data.stageAddedRevision!=null)addedRevision=data.stageAddedRevision||0;
    if(data.bootstrap){personalReady=true;return;}
    register(data.added||[]);
    collections.clear();quizzes.clear();
    for(const c of data.stageCollections||[])collections.set(c.legacy_word_key,c);
    for(const [word,list] of Object.entries(data.stats?.cardQuizzes||{}))for(const q of list)quizzes.set(q.id,{...q,word});
    cardProgress.clear();quizProgress.clear();
    for(const row of data.stageCardProgress||[])cardProgress.set(row.id,row.revision);
    for(const row of data.stageQuizProgress||[])quizProgress.set(row.id+'|'+row.type,row.revision);
    personalReady=true;
  }
  function reportClientBug(entry){
    const path=String(entry.path||'/').split('?')[0];
    if(path.startsWith('/api/bugs'))return;
    try{
      let timeZone='UTC';
      try{timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{}
      const section=document.querySelector('section.on');
      const payload=JSON.stringify({
        method:String(entry.method||'GET').slice(0,16),path:path.slice(0,300),status:Number(entry.status)||0,
        error:String(entry.error||'Client failure').slice(0,500),timeZone,
        request:{method:entry.method||'GET',url:String(entry.path||'/'),body:String(entry.requestBody??'').slice(0,4000),context:{
          screen:section&&section.id||'',href:String(location.href||'').slice(0,500),language:navigator.language||'',
          userAgent:String(navigator.userAgent||'').slice(0,300),viewport:innerWidth+'x'+innerHeight,online:navigator.onLine,stack:String(entry.stack||'').slice(0,1500)
        }},
        response:{status:Number(entry.status)||0,body:String(entry.responseBody??'').slice(0,4000)}
      });
      Promise.resolve(fetch('/api/bugs',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:payload})).catch(()=>{});
    }catch{}
  }
  async function api(path,options={}){
    const method=String(options.method||'GET').toUpperCase();
    const quietBug=options.quietBug===true;
    const {quietBug:_quiet,keepalive:keepAlive,...fetchOptions}=options;
    const requestBody=typeof options.body==='string'?options.body:options.body==null?'':'[binary]';
    let response;
    try{response=await fetch(path,{credentials:'same-origin',cache:'no-store',keepalive:!!keepAlive,...fetchOptions,headers:{'Content-Type':'application/json','X-Client-Bug':'1',...options.headers}});}
    catch{
      const error=Object.assign(new Error('Связь прервалась. Сохранение не подтверждено; повторите ту же операцию.'),{status:0,reported:true});
      reportClientBug({method,path,status:0,error:error.message,requestBody,stack:error.stack});
      throw error;
    }
    let value={},parsed=true,raw='';
    if(typeof response.text==='function'){
      raw=await response.text();
      parsed=!raw;
      if(raw){try{value=JSON.parse(raw);parsed=true;}catch{parsed=false;}}
    }else{
      try{value=await response.json();}catch{parsed=false;}
    }
    if(!response.ok||!parsed){
      const error=Object.assign(new Error(parsed?value.error||'Ошибка тестового сервера':'Unexpected response.'),{status:response.status,reported:!quietBug});
      if(!(response.status===401&&!actorId)&&!quietBug)reportClientBug({method,path,status:response.status,error:error.message,requestBody,responseBody:parsed?value.error||'':'',stack:error.stack});
      throw error;
    }
    return value;
  }
  async function accountFetch(path,options={}){
    try{
      if(path==='/api/logout')await drainPersonal(true);
      if(path==='/api/logout' && (pending||personalQueue.length))throw new Error('Есть несохранённые изменения. Повторите запись или явно отмените её через «Проверить сервер» перед выходом.');
      const value=await api(path,options);
      if(path==='/api/me' || path==='/api/login'){actorId=value.user?.id||'';backendCapabilities=value.user?value.migrationCapabilities||{}:{};}
      if((path==='/api/me'||path==='/api/login')&&value.user&&!pending&&!personalQueue.length)notice('Вход подтверждён. Подключено к тестовой Turso.');
      const bare=path.split('?')[0];
      if(bare==='/api/me/state'||/\/state$/.test(bare)){registerState(value);void drainPersonal();}
      if(bare==='/api/me/cards'&&String(options.method||'GET').toUpperCase()==='GET')register(value.cards||[]);
      if(bare==='/api/me/quizzes')for(const quiz of value.quizzes||[])quizzes.set(quiz.id,{...quiz,word:quiz.word});
      if(bare==='/api/me/progress'){for(const row of value.stageCardProgress||[])cardProgress.set(row.id,row.revision);for(const row of value.stageQuizProgress||[])quizProgress.set(row.id+'|'+row.type,row.revision);}
      const managedState=path.match(/^\/api\/admin\/users\/([a-f0-9]{16,64})\/state$/);
      if(managedState)managedLinkRevisions.set(managedState[1],value.stageAddedRevision||0);
      if(/^\/api\/(?:lessons|admin\/users\/[^/]+\/lessons)(?:\?|$)/.test(path)){
        for(const lesson of value.materials||[])if(!lesson.stageLessonDeferred)lesson.stageLessonBaseline=lessonSnapshot(lesson);
        register(value.materials||[]);
      }
      if(path==='/api/logout'){actorId='';cards.clear();collections.clear();quizzes.clear();try{window.ContentCache.clear();}catch(e){}location.reload();}
      return value;
    }catch(error){notice(error.message,true);throw error;}
  }
  function identify(card){
    if(card.stageId && cards.has(card.stageId))return {...cards.get(card.stageId),stageRevision:card.stageRevision||cards.get(card.stageId).stageRevision};
    const en=String(card.en||card.word||card.base||'').toLowerCase(),ru=String(card.ru||'');
    const found=[...cards.values()].filter(c=>String(c.en||'').toLowerCase()===en && String(c.ru||'')===ru);
    if(found.length!==1)throw new Error('Карточку нельзя однозначно связать с ID. Перезагрузите стенд; запись не отправлена.');
    return found[0];
  }
  function catalogStageId(card){
    const en=String(card?.en||card?.word||card?.base||'').toLowerCase(),ru=String(card?.ru||'');
    if(!en)return '';
    const lists=[];
    const data=window.LESSON_DATA;
    if(data&&typeof data==='object')for(const value of Object.values(data))if(Array.isArray(value))lists.push(value);
    if(Array.isArray(window.IRREGULAR))lists.push(window.IRREGULAR);
    const ids=[];
    for(const list of lists)for(const row of list){
      if(!row||typeof row!=='object'||!/^[A-Za-z0-9_-]{1,100}$/.test(String(row.stageId||'')))continue;
      if(String(row.en||row.word||row.base||'').toLowerCase()!==en||String(row.ru||'')!==ru)continue;
      if(!ids.includes(row.stageId))ids.push(row.stageId);
    }
    return ids.length===1?ids[0]:'';
  }
  function studyCard(card){
    if(card && /^[A-Za-z0-9_-]{1,100}$/.test(String(card.stageId||'')))return {stageId:card.stageId};
    const id=catalogStageId(card);
    if(id)return {stageId:id};
    return identify(card);
  }
  async function write(path,method,body){
    if(!actorId)throw new Error('Сначала войдите в существующий аккаунт.');
    if(personalQueue.length)throw new Error('Сначала дождитесь сохранения личных ответов или повторите неподтверждённую запись.');
    const intent=JSON.stringify({path,method,body});
    if(pending && (pending.actorId!==actorId || pending.intent!==intent))throw new Error('Есть неподтверждённая операция. Используйте «Повторить» или «Проверить сервер».');
    if(!pending){pending={actorId,path,method,intent,body:{...body,mutationId:crypto.randomUUID()}};localStorage.setItem(queueKey,JSON.stringify(pending));}
    try{
      const result=await api(path,{method,body:JSON.stringify(pending.body)});
      pending=null;localStorage.removeItem(queueKey);return result;
    }catch(error){
      if(error.status>=400 && error.status<500){pending=null;localStorage.removeItem(queueKey);}
      if(error.status===409)error.message='Конфликт версии. Изменение не сохранено. Перечитайте сервер и повторите редактирование.';
      throw error;
    }
  }
  function sendBinary(path,mime,bytes,onProgress){
    if(typeof onProgress!=='function')return api(path,{method:'POST',headers:{'Content-Type':mime},body:bytes});
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open('POST',path);
      xhr.withCredentials=true;
      xhr.setRequestHeader('Content-Type',mime);
      xhr.setRequestHeader('X-Client-Bug','1');
      xhr.upload.onprogress=event=>{if(event.lengthComputable&&event.total)onProgress(event.loaded/event.total);};
      xhr.onload=()=>{
        let value={},parsed=true;
        try{value=JSON.parse(xhr.responseText||'{}');}catch{parsed=false;}
        if(xhr.status<200||xhr.status>=300||!parsed){reject(Object.assign(new Error(parsed?value.error||'Ошибка тестового сервера':'Unexpected response.'),{status:xhr.status}));return;}
        resolve(value);
      };
      xhr.onerror=()=>reject(Object.assign(new Error('Связь прервалась. Сохранение не подтверждено; повторите ту же операцию.'),{status:0,reported:true}));
      xhr.send(bytes);
    });
  }
  async function binaryWrite(path,body,file,kind='media',onProgress){
    if(!actorId||!mediaAllowed())throw new Error('Файлы доступны только вошедшему пользователю разрешённого тестового стенда.');
    if(personalQueue.length)throw new Error('Дождитесь сохранения личной очереди.');
    if(!file.size||file.size>25*1024*1024)throw new Error('Размер файла должен быть от 1 байта до 25 MiB.');
    const bytes=await file.arrayBuffer(),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    body={...body,name:file.name,sha256,size:file.size};
    // On reload the server may already expose a later revision. Recover the
    // original baseline ONLY for the same account/path/file/type/name intent.
    if(pending){
      if(!['audio','media'].includes(pending.kind)||pending.actorId!==actorId||pending.path!==path
        ||['sha256','size','name','mime'].some(key=>pending.body[key]!==body[key]))throw new Error('Есть неподтверждённая запись. Выберите тот же файл или проверьте сервер.');
      body=Object.fromEntries(Object.entries(pending.body).filter(([key])=>key!=='mutationId'));
    }
    const intent=JSON.stringify({path,method:'POST',body});
    if(!pending){pending={actorId,path,method:'POST',kind,intent,body:{...body,mutationId:crypto.randomUUID()}};localStorage.setItem(queueKey,JSON.stringify(pending));}
    const params=new URLSearchParams(Object.fromEntries(Object.entries(pending.body).filter(([key])=>!['mime','sha256','size'].includes(key)).map(([key,value])=>[key,String(value)])));
    try{
      const result=await sendBinary(path+'?'+params,pending.body.mime,bytes,onProgress);
      pending=null;localStorage.removeItem(queueKey);return result;
    }catch(error){if(error.status>=400&&error.status<500){pending=null;localStorage.removeItem(queueKey);}throw error;}
  }
  const mediaMime=(type,name='')=>{
    const known={'audio/x-wav':'audio/wav','audio/wave':'audio/wav','audio/mp3':'audio/mpeg'};
    if(known[type])return known[type];
    if(type)return type;
    const ext=String(name||'').toLowerCase().split('.').pop();
    return {pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg'}[ext]||'';
  };
  async function perform(action,status){
    if(busy){notice('Дождитесь ответа на текущую запись.',true);return;}busy=true;
    const buttons=[...document.querySelectorAll('[data-edit-save],[data-card-delete],[data-card-quiz-save],[data-card-quiz-del],[data-add-go],#addGo,#stageNewCard button,#textedit button,#songUser button,#songUser input[type="file"],#lyricForm button,#material button,#material input,#material textarea,#material select,[data-lm-delete],[data-lm-hide]')];
    const disabled=buttons.map(b=>b.disabled);for(const b of buttons)b.disabled=true;
    const rich=[...document.querySelectorAll('#material [contenteditable="true"]')];for(const el of rich)el.setAttribute('contenteditable','false');
    notice('Сохранение в тестовую Turso…');
    try{await action();notice('Подтверждено тестовой Turso.');if(status)status.textContent='Сохранено на тестовом сервере.';}
    catch(error){notice(error.message,true);if(!error.reported)reportClientBug({method:'CLIENT',path:(location&&location.pathname)||'/',status:Number(error.status)||0,error:error.message,stack:error.stack});if(status){status.textContent=error.message;status.classList.add('bad');}}
    finally{busy=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);for(const el of rich)if(el.isConnected)el.setAttribute('contenteditable','true');if(!pending)void drainPersonal();}
  }
  function savePersonal(){
    if(personalQueue.length)localStorage.setItem(personalKey,JSON.stringify(personalQueue));else localStorage.removeItem(personalKey);
  }
  function enqueuePersonal(job,delay=0){
    if(!actorId || !personalReady)throw new Error('Дождитесь загрузки личного профиля.');
    if(personalQueue.some(row=>row.actorId!==actorId))throw new Error('Сначала проверьте несохранённые изменения предыдущего аккаунта.');
    if(job.kind==='response'){
      const same=personalQueue.find(row=>row.key===job.key && JSON.stringify(row.response)===JSON.stringify(job.response));
      const saved=savedResponses.get(job.key);
      if(same || (saved && saved.revision===job.baseRevision && saved.blockRevision===job.blockRevision && saved.intent===JSON.stringify(job.response))){
        if(!delay)void drainPersonal();return;
      }
    }
    if(job.kind==='theme'){
      const existing=personalQueue.find(row=>row.kind==='theme'&&row.key===job.key);
      if(existing){existing.theme=job.theme;existing.paused=false;delete existing.body;}
      else{
        if(personalQueue.length>=100)throw new Error('Очередь заполнена. Сначала повторите сохранение.');
        personalQueue.push({...job,actorId,mutationId:crypto.randomUUID()});
      }
      savePersonal();notice('Личные изменения ожидают сохранения в тестовую Turso.');
      clearTimeout(personalTimer);
      if(delay)personalTimer=setTimeout(()=>void drainPersonal(),delay);else void drainPersonal();
      return;
    }
    const queued=['response','activity'].includes(job.kind) && personalQueue.find(row=>row.kind===job.kind&&row.key===job.key&&!row.body&&(row.events?.length||0)<100);
    if(queued){if(job.kind==='activity')queued.events.push(...job.events);else queued.response=job.response;} // Preserve the first editor baseline.
    else{
      if(personalQueue.length>=100)throw new Error('Очередь заполнена. Сначала повторите сохранение.');
      personalQueue.push({...job,actorId,mutationId:crypto.randomUUID()});
    }
    savePersonal();notice('Личные изменения ожидают сохранения в тестовую Turso.');
    clearTimeout(personalTimer);
    if(delay)personalTimer=setTimeout(()=>void drainPersonal(),delay);else void drainPersonal();
  }
  async function drainPersonal(retry=false){
    if(personalRunning || busy || pending || !personalReady || !actorId || !personalQueue.length)return;
    if(personalQueue[0]?.paused && !retry)return;
    personalRunning=true;
    try{
      while(personalQueue.length){
        const job=personalQueue[0];
        if(job.actorId!==actorId)throw new Error('Несохранённая операция принадлежит другому аккаунту.');
        if(job.kind==='theme'||!job.body){
          job.body=job.kind==='theme'?{mutationId:job.mutationId,expectedRevision:themeRevision,theme:job.theme}
            :job.kind==='answer'?{mutationId:job.mutationId,expectedRevision:quizProgress.get(job.key)||0,quizType:job.type,correct:job.correct}
            :job.kind==='progress'?{mutationId:job.mutationId,expectedRevision:cardProgress.get(job.cardId)||0,changes:job.changes}
            :job.kind==='activity'?{mutationId:job.mutationId,events:job.events}
            :{mutationId:job.mutationId,expectedRevision:job.baseRevision,expectedBlockRevision:job.blockRevision,response:job.response};
        }
        job.paused=false;savePersonal();
        notice('Сохранение личных данных в тестовую Turso…');
        let result;
        try{result=await api(job.path,{method:job.method,body:JSON.stringify(job.body),keepalive:unloading,quietBug:job.kind==='theme'});}
        catch(error){
          if(!(job.kind==='theme'&&error.status===409&&!job.themeRetried))throw error;
          job.themeRetried=true;themeRecovering=true;
          try{
            const state=await accountFetch('/api/me/state?summary=1');
            if(state?.stats?.theme===job.theme){personalQueue.shift();savePersonal();continue;}
            job.mutationId=(crypto.randomUUID&&crypto.randomUUID())||job.mutationId;
            delete job.body;
          }finally{themeRecovering=false;}
          continue;
        }
        if(job.kind==='theme')themeRevision=result.revision;
        if(job.kind==='answer')quizProgress.set(job.key,result.revision);
        if(job.kind==='progress')cardProgress.set(job.cardId,result.revision);
        if(job.kind==='response')savedResponses.set(job.key,{revision:result.revision,blockRevision:job.blockRevision,intent:JSON.stringify(job.response)});
        personalQueue.shift();
        for(const next of personalQueue)if(next.key===job.key && !next.body && next.kind==='response' && next.baseRevision===job.body.expectedRevision)next.baseRevision=result.revision;
        savePersonal();
        document.dispatchEvent(new CustomEvent('turso-personal-saved',{detail:{job,result}}));
      }
      notice('Личные данные подтверждены тестовой Turso.');
    }catch(error){
      if(personalQueue[0])personalQueue[0].paused=true;
      savePersonal();
      const message=error.status===409?'Конфликт личных данных. Перечитайте сервер; более новые ответы не перезаписаны.':error.message;
      notice(message,true);
      if(!error.reported)reportClientBug({method:personalQueue[0]?.method||'POST',path:personalQueue[0]?.path||'/personal',status:Number(error.status)||0,error:message,stack:error.stack});
    }finally{personalRunning=false;}
  }
  const bridge=window.TursoMain={
    fetch:accountFetch,register,notice,perform,mediaAllowed,lessonSnapshot,lessonDirty,
    capabilities:()=>({...backendCapabilities}),
    catalogDictionary(card){
      const key=card.stageId+':'+card.stageRevision;
      if(!catalogDetails.has(key))catalogDetails.set(key,api('/api/catalogs/cards/'+encodeURIComponent(card.stageId)).catch(error=>{catalogDetails.delete(key);throw error;}));
      return catalogDetails.get(key);
    },
    theme(value){enqueuePersonal({kind:'theme',key:'theme',theme:value,path:'/api/me/theme',method:'PUT'},150);},
    flushPersonal:()=>drainPersonal(true),
    cardForProgress:id=>cards.get(id),
    async dictionary(item,accountId=''){
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(item.stageId||'')||accountId&&!/^[a-f0-9]{16,64}$/.test(accountId))throw new Error('Missing dictionary identity.');
      const path=accountId?'/api/admin/users/'+accountId+'/cards/':'/api/cards/';
      return api(path+encodeURIComponent(item.stageId)+'/dictionary');
    },
    unsupported:operation=>{const message=`Операция «${operation||'изменение'}» ещё не перенесена и не записана на сервер. Доступны точечные карточки, уроки, тексты/песни, прогресс, личная статистика и медиа в изолированном хранилище.`;notice(message,true);reportClientBug({method:'CLIENT',path:'/unsupported',status:0,error:message,stack:new Error(message).stack});},
    answer(card,type,correct){
      const c=studyCard(card);enqueuePersonal({kind:'answer',key:c.stageId+'|'+type,cardId:c.stageId,type,correct,path:'/api/cards/'+encodeURIComponent(c.stageId)+'/answers',method:'POST'});
    },
    progress(card,changes){
      const c=studyCard(card);enqueuePersonal({kind:'progress',key:c.stageId+'|progress',cardId:c.stageId,changes,path:'/api/cards/'+encodeURIComponent(c.stageId)+'/progress',method:'PATCH'});
    },
    event(kind,area,result,seconds){enqueuePersonal({kind:'activity',key:'activity',events:[{kind,area:area||'',result:result||'',...(seconds?{seconds}:{})}],path:'/api/stats/event',method:'POST'},5000);},
    response(lessonId,block,response,immediate=false){
      enqueuePersonal({kind:'response',key:lessonId+'|'+block.id,lessonId,blockId:block.id,response,
        baseRevision:block.stageResponseRevision||0,blockRevision:block.stageBlockRevision,
        path:'/api/lessons/'+encodeURIComponent(lessonId)+'/blocks/'+encodeURIComponent(block.id)+'/response',method:'PUT'},immediate?0:1000);
    },
    async saveLesson(material){
      for(const block of material.blocks||[])if(['word','wordcard'].includes(block.type)&&!block.stageDefinition?.cardId&&!block.stageId){
        const rows=await api('/api/cards?exact=1&q='+encodeURIComponent(block.word||''));
        const shared=rows.filter(row=>row.scope==='shared'&&row.en.trim().toLowerCase()===String(block.word||'').trim().toLowerCase());
        const matching=shared.filter(row=>row.ru===block.ru),candidates=matching.length?matching:shared;
        if(candidates.length!==1)throw new Error('Select an existing shared card before publishing. Remove this unlinked word and add it again using the lesson card selector.');
        block.stageId=candidates[0].id;block.stageRevision=candidates[0].revision;block.stageScope='shared';
      }
      if(material.stageLessonDeferred)throw new Error('Open the lesson before saving changes.');
      const snapshot=lessonSnapshot(material);
      let baseline=material.stageLessonBaseline,result;const changedIds=new Set();
      if(!material.stageRevision){
        result=await write('/api/lessons','POST',{id:material.id,changes:snapshot.changes,blocks:snapshot.blocks});
      }else{
        if(!baseline){
          const data=await api('/api/lessons?id='+encodeURIComponent(material.id||''));
          const full=(data.materials||[]).find(row=>row.id===material.id);
          if(full)baseline=material.stageLessonBaseline=lessonSnapshot(full);
        }
        if(!baseline)throw new Error('Нет исходной версии урока. Перечитайте сервер перед редактированием.');
        const changes=Object.fromEntries(Object.entries(snapshot.changes).filter(([key,value])=>value!==baseline.changes[key]));
        const previous=new Map(baseline.blocks.map(b=>[b.id,b])),next=new Set(snapshot.blocks.map(b=>b.id));
        const upserts=snapshot.blocks.filter(b=>!previous.has(b.id)||canonical({...b,expectedRevision:0})!==canonical({...previous.get(b.id),expectedRevision:0}));
        for(const b of upserts)if(previous.has(b.id))changedIds.add(b.id);
        const deletes=baseline.blocks.filter(b=>!next.has(b.id)).map(b=>({id:b.id,expectedRevision:b.expectedRevision}));
        const added=upserts.some(b=>!previous.has(b.id));
        const order=!added&&!deletes.length&&canonical(snapshot.order)!==canonical(baseline.order)?snapshot.order:undefined;
        if(!Object.keys(changes).length&&!upserts.length&&!deletes.length&&!order){
          for(const block of material.blocks||[])if(!block.stageBlockRevision){
            const known=(baseline?.blocks||[]).find(row=>row.id===block.id);
            if(known?.expectedRevision)block.stageBlockRevision=known.expectedRevision;
          }
          return {id:material.id,revision:material.stageRevision,blocks:(material.blocks||[]).map(b=>({id:b.id,revision:b.stageBlockRevision||0})),unchanged:true};
        }
        result=await write('/api/lessons/'+encodeURIComponent(material.id),'PATCH',{expectedRevision:material.stageRevision,changes,upserts,deletes,...(order?{order}:{})});
      }
      material.stageRevision=result.revision;
      material.stageBlockOrder=snapshot.order;
      const revisions=new Map(result.blocks.map(b=>[b.id,b.revision]));
      for(const [i,b] of (material.blocks||[]).entries()){
        if(changedIds.has(b.id)){
          delete b.response;delete b.score;
          for(const item of b.items||[])if(item && typeof item==='object')for(const key of ['picked','typed','marked','correct'])delete item[key];
        }
        if(revisions.has(b.id))b.stageBlockRevision=revisions.get(b.id);b.stageDefinition=clone({type:snapshot.blocks[i].type,tab:snapshot.blocks[i].tab,cardId:snapshot.blocks[i].cardId,content:snapshot.blocks[i].content});
      }
      material.stageLessonBaseline=lessonSnapshot(material);return result;
    },
    deleteLesson:material=>write('/api/lessons/'+encodeURIComponent(material.id),'DELETE',{expectedRevision:material.stageRevision}),
    async hideLesson(material,hidden){
      const result=await write('/api/lessons/'+encodeURIComponent(material.id),'PATCH',{expectedRevision:material.stageRevision,changes:{hiddenFromStudents:hidden},upserts:[],deletes:[]});
      material.stageRevision=result.revision;material.hiddenFromStudents=hidden;
      if(material.stageLessonBaseline)material.stageLessonBaseline.changes.hiddenFromStudents=hidden;
      return result;
    },
    async editManagedCard(accountId,card,ru){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!card.stageId||card.stageScope!=='profile')throw new Error('Редактируется только личная карточка ученика.');
      return write('/api/admin/users/'+accountId+'/cards/'+encodeURIComponent(card.stageId),'PATCH',{expectedRevision:card.stageRevision,changes:{ru}});
    },
    async editCard(card,ru){
      const c=identify(card),result=await write('/api/cards/'+encodeURIComponent(c.stageId),'PATCH',{expectedRevision:c.stageRevision,changes:{ru}});
      Object.assign(cards.get(c.stageId),{ru:result.ru,stageRevision:result.revision});card.stageRevision=result.revision;return result;
    },
    async findCard(word){
      const rows=await api('/api/cards?exact=1&q='+encodeURIComponent(word));
      const found=rows.filter(row=>row.en.trim().toLowerCase()===word.trim().toLowerCase());
      if(found.length!==1)throw new Error(found.length?'Есть несколько карточек с этим словом. Нужен выбор конкретного ID; ничего не добавлено.':'В тестовой Turso такой карточки нет. Создание новых слов и внешний словарь пока не подключены.');
      return found[0];
    },
    async lessonCards(word){
      const rows=await api('/api/cards?exact=1&q='+encodeURIComponent(word));
      return rows.filter(row=>row.scope==='shared'&&row.en.trim().toLowerCase()===word.trim().toLowerCase());
    },
    lookupLessonCard:word=>write('/api/cards/lookup','POST',{word}),
    async newManagedCard(accountId,id,en,ru,place){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!managedLinkRevisions.has(accountId))throw new Error('Сначала загрузите профиль ученика.');
      const result=await write('/api/admin/users/'+accountId+'/cards/new','POST',{id,expectedRevision:managedLinkRevisions.get(accountId),card:{en,ru,...(place?{place}:{})}});
      managedLinkRevisions.set(accountId,result.revision);return result;
    },
    async unlinkManagedCard(accountId,card){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!card.stageId||!managedLinkRevisions.has(accountId))throw new Error('Сначала загрузите профиль ученика.');
      const result=await write('/api/admin/users/'+accountId+'/cards/'+encodeURIComponent(card.stageId),'DELETE',{
        place:card.place||'mine',expectedRevision:card.stageLinksRevision??managedLinkRevisions.get(accountId)});
      managedLinkRevisions.set(accountId,result.revision);return result;
    },
    async linkManagedCard(accountId,card,place){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!managedLinkRevisions.has(accountId))throw new Error('Сначала загрузите серверный профиль ученика.');
      const result=await write('/api/admin/users/'+accountId+'/cards','POST',{cardId:card.id,place,expectedRevision:managedLinkRevisions.get(accountId),expectedCardRevision:card.revision});
      managedLinkRevisions.set(accountId,result.revision);return result;
    },
    async linkCard(card,place){
      const result=await write('/api/me/cards','POST',{cardId:card.id,place,expectedRevision:addedRevision,expectedCardRevision:card.revision});
      addedRevision=result.revision;register(result.card);return result;
    },
    async newCard(id,en,ru,place){
      const result=await write('/api/me/cards/new','POST',{id,expectedRevision:addedRevision,card:{en,ru,...(place?{place}:{})}});
      addedRevision=result.revision;register(result.card);return result;
    },
    async saveManagedText(accountId,item,changes){
      return window.TursoMain.saveManagedLibrary(accountId,item,'text',changes);
    },
    async saveManagedLibrary(accountId,item,kind,changes){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!['text','song'].includes(kind)||item.stageId&&item.stageScope!=='profile')throw new Error('Общие материалы нельзя менять в личном профиле.');
      const path='/api/admin/users/'+accountId+'/'+(kind==='text'?'texts':'songs');
      if(!item.stageId)return write(path,'POST',{id:item.id,changes});
      const changed=Object.fromEntries(Object.entries(changes).filter(([key,value])=>item[key]!==value));
      if(!Object.keys(changed).length)return {item,unchanged:true};
      return write(path+'/'+encodeURIComponent(item.stageId),'PATCH',{expectedRevision:item.stageRevision,changes:changed});
    },
    async archiveManagedText(accountId,item){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||!item.stageId||item.stageScope!=='profile')throw new Error('Архивируется только личный текст.');
      return write('/api/admin/users/'+accountId+'/texts/'+encodeURIComponent(item.stageId),'DELETE',{expectedRevision:item.stageRevision});
    },
    async saveLibrary(item,kind,changes){
      if(item.stageId){
        const changed=Object.fromEntries(Object.entries(changes).filter(([key,value])=>item[key]!==value));
        if(!Object.keys(changed).length)return {item,revision:item.stageRevision,unchanged:true};
        return write('/api/library/'+encodeURIComponent(item.stageId),'PATCH',{expectedRevision:item.stageRevision,changes:changed});
      }
      return write('/api/library','POST',{id:item.id,kind,changes});
    },
    async uploadSongAudio(item,file,onProgress){
      if(!actorId||!mediaAllowed()||item.stageScope!=='profile'||!item.stageId)throw new Error('Аудио доступно только для собственной сохранённой песни на разрешённом тестовом стенде.');
      const mime=mediaMime(file.type,file.name);
      if(!['audio/wav','audio/ogg','audio/mpeg'].includes(mime))throw new Error('Выберите MP3, WAV или OGG.');
      return binaryWrite('/api/library/'+encodeURIComponent(item.stageId)+'/media',{expectedRevision:item.stageRevision,mime},file,'audio',onProgress);
    },
    async setManagedLessonAccess(accountId,lessonId,expected,changes){
      if(!/^[a-f0-9]{16,64}$/.test(accountId)||! /^[A-Za-z0-9_-]{1,100}$/.test(lessonId))throw new Error('Нет серверного ID аккаунта или урока.');
      return write('/api/admin/users/'+accountId+'/lessons/'+lessonId+'/access','PATCH',{expected,changes});
    },
    async uploadLessonFile(material,block,file){
      if(!block.stageBlockRevision){
        const known=(material.stageLessonBaseline?.blocks||[]).find(row=>row.id===block.id);
        if(known?.expectedRevision)block.stageBlockRevision=known.expectedRevision;
      }
      if(!material.stageRevision||!block.stageBlockRevision||!material.stageLessonBaseline)throw new Error('Сначала сохраните урок и блок кнопкой Save Draft.');
      if(canonical(lessonSnapshot(material))!==canonical(material.stageLessonBaseline))throw new Error('Сначала сохраните текущие правки урока. Загрузка файла не должна перезаписать черновик.');
      const mime=mediaMime(file.type,file.name);
      if(!['audio/wav','audio/ogg','audio/mpeg','application/pdf','image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw new Error('Поддерживаются PDF, изображения PNG/JPEG/GIF/WEBP и MP3/WAV/OGG, до 25 MiB.');
      const result=await binaryWrite('/api/lessons/'+encodeURIComponent(material.id)+'/blocks/'+encodeURIComponent(block.id)+'/media',
        {expectedRevision:material.stageRevision,expectedBlockRevision:block.stageBlockRevision,mime},file);
      const preservedCollapsed=block.collapsed;
      Object.assign(block,result.block.content,{stageBlockRevision:result.block.revision});
      if(preservedCollapsed!==undefined)block.collapsed=preservedCollapsed;
      delete block.response;delete block.score;
      block.stageDefinition={...block.stageDefinition,content:clone(result.block.content)};
      material.stageRevision=result.revision;material.stageLessonBaseline=lessonSnapshot(material);return result;
    },
    async detachLessonFile(material,block){
      if(!material.stageRevision||!block.stageBlockRevision||!material.stageLessonBaseline)throw new Error('Сначала сохраните урок и блок.');
      if(canonical(lessonSnapshot(material))!==canonical(material.stageLessonBaseline))throw new Error('Сначала сохраните текущие правки урока.');
      const result=await write('/api/lessons/'+encodeURIComponent(material.id)+'/blocks/'+encodeURIComponent(block.id)+'/media','DELETE',
        {expectedRevision:material.stageRevision,expectedBlockRevision:block.stageBlockRevision});
      const preservedCollapsed=block.collapsed;
      for(const key of ['fileId','localMediaKey','name','size','hasFile','sample','fileType'])delete block[key];
      Object.assign(block,result.block.content,{stageBlockRevision:result.block.revision});delete block.response;delete block.score;
      if(preservedCollapsed!==undefined)block.collapsed=preservedCollapsed;
      block.stageDefinition={...block.stageDefinition,content:clone(result.block.content)};
      material.stageRevision=result.revision;material.stageLessonBaseline=lessonSnapshot(material);return result;
    },
    async deleteLibrary(item){return write('/api/library/'+encodeURIComponent(item.stageId),'DELETE',{expectedRevision:item.stageRevision});},
    async unlinkCard(card){
      if(!card.stageId)throw new Error('У личной карточки нет серверного ID. Перечитайте сервер.');
      const result=await write('/api/me/cards/'+encodeURIComponent(card.stageId),'DELETE',{place:card.place||'mine',expectedRevision:card.stageLinksRevision??addedRevision});
      addedRevision=result.revision;return result;
    },
    async deleteCard(card){const c=identify(card);const result=await write('/api/cards/'+encodeURIComponent(c.stageId),'DELETE',{expectedRevision:c.stageRevision});cards.delete(c.stageId);return result;},
    async writeQuiz(word,quiz,deleting){
      const known=quizzes.get(quiz.id),content={type:quiz.type,items:quiz.items};
      if(known){
        const result=await write('/api/quizzes/'+encodeURIComponent(quiz.id),deleting?'DELETE':'PATCH',{expectedRevision:quiz.stageRevision||known.stageRevision,...(deleting?{}:{quiz:content})});
        if(deleting)quizzes.delete(quiz.id);else quizzes.set(quiz.id,{...result,stageRevision:result.revision,word});
        return result;
      }
      if(deleting){throw new Error('Это несохранённый черновик. «Проверить сервер» уберёт его без записи в БД.');}
      const candidates=[...cards.values()].filter(c=>c.stageScope==='shared' && String(c.en||'').toLowerCase()===word.toLowerCase());
      if(candidates.length!==1)throw new Error('Нельзя однозначно выбрать общую карточку для квиза. Запись не отправлена.');
      const c=candidates[0],collection=collections.get(word);
      return write('/api/cards/'+encodeURIComponent(c.stageId)+'/quizzes','POST',{expectedRevision:c.stageRevision,expectedCollectionRevision:collection?.revision||0,quiz:content});
    }
  };
  document.addEventListener('DOMContentLoaded',()=>{
    register([window.LESSON_DATA,window.IRREGULAR,window.GRAMMAR,window.SPEAKOUT]);
    const banner=document.getElementById('turso-main-banner');
    const reserveBanner=()=>{
      if(banner?.dataset?.compactNotices==='true'){
        document.documentElement?.style?.setProperty('--turso-banner-offset','0px');return;
      }
      if(banner?.getBoundingClientRect && document.documentElement?.style)document.documentElement.style.setProperty('--turso-banner-offset',Math.ceil(banner.getBoundingClientRect().height+12)+'px');
    };
    reserveBanner();
    if(banner && typeof ResizeObserver!=='undefined')new ResizeObserver(reserveBanner).observe(banner);
    document.getElementById('turso-main-refresh').addEventListener('click',()=>{
      if(personalRunning || busy){notice('Дождитесь ответа на текущую запись.',true);return;}
      if((pending||personalQueue.length) && !confirm('Есть несохранённые или неподтверждённые изменения. Перечитать сервер и отменить их повтор?'))return;
      pending=null;personalQueue=[];localStorage.removeItem(queueKey);savePersonal();location.reload();
    });
    document.getElementById('turso-main-retry').addEventListener('click',()=>{
      if(personalQueue.length && !pending){void drainPersonal(true);return;}
      void perform(async()=>{
      if(!pending || pending.actorId!==actorId)throw new Error('Нет неподтверждённой операции этого аккаунта.');
      if(['audio','media'].includes(pending.kind))throw new Error('Откройте ту же песню или урок и повторно выберите тот же файл: ID операции сохранён, сам файл не записывается в localStorage.');
      await api(pending.path,{method:pending.method,body:JSON.stringify(pending.body)});
      pending=null;localStorage.removeItem(queueKey);location.reload();
      });
    });
    const sentPersonal=personalQueue.filter(row=>row.body&&row.kind!=='activity'&&row.kind!=='theme');
    if(pending||sentPersonal.length){
      notice('Есть неподтверждённая операция. Войдите в исходный аккаунт и проверьте сервер или повторите её.',true);
      const item=pending||sentPersonal[0];
      reportClientBug({method:item.method||'POST',path:item.path||'/unconfirmed',status:0,error:'Unconfirmed operation. The browser reloaded before the server confirmed the save.',stack:new Error('Unconfirmed operation').stack,requestBody:JSON.stringify(pending?{actorId:pending.actorId,kind:pending.kind,body:pending.body}:sentPersonal.map(row=>({actorId:row.actorId,kind:row.kind,path:row.path,method:row.method})))});
    }else if(personalQueue.length&&personalQueue.every(row=>row.kind==='activity')){
      for(const row of personalQueue)row.paused=false;
      savePersonal();
    }
  });
  if(typeof window.addEventListener==='function')window.addEventListener('pagehide',()=>{unloading=true;clearTimeout(personalTimer);void drainPersonal(true);});
})();
