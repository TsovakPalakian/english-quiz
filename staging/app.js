const $=selector=>document.querySelector(selector);
const launchKey='english-quiz-turso-stage-launch',pendingKey='english-quiz-turso-stage-pending';
const incoming=new URLSearchParams(location.hash.slice(1)).get('code');
if(incoming){sessionStorage.setItem(launchKey,incoming);history.replaceState(null,'',location.pathname+location.search);}
const launchCode=sessionStorage.getItem(launchKey)||'';
let persona=null,selected=null,offset=0,epoch=0,busy=false;
let pending=null;
try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{localStorage.removeItem(pendingKey);}
function status(text){$('#status').textContent=text;}
function node(tag,text,attrs={}){const el=document.createElement(tag);if(text!==null)el.textContent=text;Object.assign(el,attrs);return el;}
function button(text,action,danger=false){const el=node('button',text,{type:'button',className:danger?'danger':''});el.addEventListener('click',()=>action());return el;}
function pendingView(){$('#pending').hidden=!pending || pending.persona!==persona?.key;}
function controls(){document.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=busy;});}
async function api(path,method='GET',body){
  let response;
  try{response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}
  catch{throw Object.assign(new Error('Связь прервалась. Сохранение не подтверждено.'),{status:0});}
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.error||'Ошибка сервера'),{status:response.status});
  return value;
}
async function run(action){if(busy)return;busy=true;controls();try{await action();}catch(error){status(error.message);}finally{busy=false;controls();}}
async function listCards(){
  const turn=epoch;
  const params=new URLSearchParams({q:$('#query').value,lessonId:$('#lesson').value,offset});
  const cards=await api('/api/cards?'+params);
  if(turn!==epoch)return;
  $('#cards').replaceChildren(...cards.map(card=>button(card.en,()=>run(()=>openCard(card.id)))));
  $('#more').hidden=cards.length<40;
  if(!cards.length)$('#cards').append(node('p','Карточек нет.'));
}
async function openCard(id){
  const turn=epoch,card=await api('/api/cards/'+encodeURIComponent(id));
  if(turn!==epoch)return;
  selected=card;renderCard();
  const url=new URL(location.href);url.searchParams.set('card',id);history.replaceState(null,'',url.pathname+url.search);
}
function quizEditor(quiz=null){
  const box=node('section',null),select=node('select',null),items=node('textarea',null);
  select.setAttribute('aria-label','Тип квиза');items.setAttribute('aria-label','Содержание квиза JSON');
  for(const type of ['Build','Flip','Choice','Type','Listen'])select.append(node('option',type,{value:type}));
  select.value=quiz?.type||'Flip';items.value=JSON.stringify(quiz?.items||[{front:selected.en,back:selected.ru}],null,2);
  box.append(node('h3',quiz?'Редактировать квиз':'Добавить квиз'),select,items,button('Save quiz',()=>run(async()=>{
    let parsed;try{parsed=JSON.parse(items.value);}catch{throw new Error('Содержание должно быть JSON-массивом.');}
    const value={type:select.value,items:parsed};
    const path=quiz?'/api/quizzes/'+encodeURIComponent(quiz.id):'/api/cards/'+encodeURIComponent(selected.id)+'/quizzes';
    const body=quiz?{expectedRevision:quiz.revision,quiz:value}:{expectedRevision:selected.revision,expectedCollectionRevision:selected.collections[0]?.revision||0,quiz:value};
    await mutate(path,quiz?'PATCH':'POST',body,selected.id);
  })),button('Закрыть',()=>box.remove()));
  $('#detail').append(box);
}
function renderCard(){
  const card=selected,article=$('#detail');article.replaceChildren(node('h2',card.en),node('p',`ID: ${card.id} · версия ${card.revision} · ${card.scope}`,{className:'muted'}));
  if(card.canEdit){
    const translation=node('textarea',null,{value:card.ru});translation.setAttribute('aria-label','Перевод');
    const save=button('Save',()=>run(()=>mutate('/api/cards/'+encodeURIComponent(card.id),'PATCH',{expectedRevision:card.revision,changes:{ru:translation.value}},card.id)));
    save.dataset.editSave='';
    article.append(translation,node('div',null,{className:'actions'}));
    article.lastChild.append(save,button('Удалить карточку',()=>{if(confirm('Удалить эту карточку из тестовой БД для всех?'))run(()=>mutate('/api/cards/'+encodeURIComponent(card.id),'DELETE',{expectedRevision:card.revision},null));},true));
  }else article.append(node('p',card.ru),node('p','Режим ученика: определения доступны только для чтения.',{className:'muted'}));
  article.append(node('h3','Пользовательские квизы'));
  for(const quiz of card.quizzes){
    const details=node('details',null);details.append(node('summary',quiz.type),node('pre',JSON.stringify(quiz.items,null,2)));
    if(card.canEdit){const actions=node('div',null,{className:'actions'});actions.append(button('Редактировать',()=>quizEditor(quiz)),button('× Удалить',()=>{if(confirm('Удалить только этот квиз из тестовой БД для всех?'))run(()=>mutate('/api/quizzes/'+encodeURIComponent(quiz.id),'DELETE',{expectedRevision:quiz.revision},card.id));},true));details.append(actions);}
    article.append(details);
  }
  if(!card.quizzes.length)article.append(node('p','Добавленных квизов нет.'));
  if(card.canEdit && card.scope==='shared')article.append(button('+ Add Quiz',()=>quizEditor()));
  controls();
}
async function mutate(path,method,body,cardId){
  if(pending)throw new Error('Сначала повторите или отмените неподтверждённую операцию.');
  pending={persona:persona.key,path,method,body:{...body,mutationId:crypto.randomUUID()},cardId};
  localStorage.setItem(pendingKey,JSON.stringify(pending));pendingView();await sendPending();
}
async function sendPending(){
  if(!pending || pending.persona!==persona?.key)throw new Error('Повтор возможен только в исходной тестовой роли.');
  const operation=pending;
  try{await api(operation.path,operation.method,operation.body);}
  catch(error){
    if(error.status>=400 && error.status<500){pending=null;localStorage.removeItem(pendingKey);pendingView();}
    if(error.status===409)error.message='Конфликт версий. Ваш ввод не сохранён. Перечитайте сервер и повторите изменение.';
    throw error;
  }
  pending=null;localStorage.removeItem(pendingKey);pendingView();
  status('Сохранено в тестовой Turso.');
  await listCards();
  if(operation.cardId)await openCard(operation.cardId);
  else{selected=null;$('#detail').replaceChildren(node('p','Карточка удалена на сервере.'));const url=new URL(location.href);url.searchParams.delete('card');history.replaceState(null,'',url.pathname+url.search);}
}
async function refresh(){offset=0;await listCards();if(selected)await openCard(selected.id);status('Перечитано из тестовой БД.');}
async function selectPersona(){
  epoch++;selected=null;$('#detail').replaceChildren(node('p','Выберите карточку.'));
  persona=await api('/api/test/session','POST',{persona:$('#persona').value,launchCode});pendingView();
  const lessons=await api('/api/lessons');$('#lesson').replaceChildren(node('option','Все доступные карточки',{value:''}),...lessons.map(l=>node('option',l.title,{value:l.id})));
  offset=0;await listCards();status(`${persona.label}: новая тестовая сессия, данные читаются с сервера.`);
}
$('#persona').addEventListener('change',()=>run(selectPersona));
$('#search').addEventListener('submit',event=>{event.preventDefault();run(async()=>{offset=0;await listCards();});});
$('#refresh').addEventListener('click',()=>run(refresh));
$('#more').addEventListener('click',()=>run(async()=>{offset+=40;await listCards();}));
$('#retry').addEventListener('click',()=>run(sendPending));
$('#discard').addEventListener('click',()=>run(async()=>{pending=null;localStorage.removeItem(pendingKey);pendingView();await refresh();}));
await run(async()=>{
  const personas=await api('/api/test/personas');$('#persona').replaceChildren(...personas.map(p=>node('option',p.label,{value:p.key})));
  try{
    persona=await api('/api/test/me');$('#persona').value=persona.key;pendingView();
    const lessons=await api('/api/lessons');$('#lesson').replaceChildren(node('option','Все доступные карточки',{value:''}),...lessons.map(l=>node('option',l.title,{value:l.id})));
    await listCards();const id=new URL(location.href).searchParams.get('card');if(id)await openCard(id);status(persona.label+': данные с сервера.');
  }catch(error){if(error.status!==401)throw error;if(!launchCode)throw new Error('Нужна приватная ссылка запуска локального стенда.');await selectPersona();}
});
