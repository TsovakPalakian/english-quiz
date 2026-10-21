// Local lifecycle UI; the server remains the sole source of coverage and permissions.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses={ready:'Teacher checked',pending_review:'Needs review',needs_changes:'Needs attention',preparing:'Preparing',missing:'Missing',failed:'Failed'};
const reasons={not_generated:'Not prepared',word_set_required:'A word set and grouping rule are required',audio_required:'Audio is required',returned:'Returned to the author',withdrawn_template:'Template withdrawn',provider_not_configured:'Generation is off',quota_exceeded:'Shared request quota exhausted',quota_unavailable:'Quota unavailable'};
const details=(key,title,body)=>'<details data-expand="'+esc(key)+'"><summary><strong>'+esc(title)+'</strong></summary><div class="detail">'+body+'</div></details>';
export function createLearningKitUI({api,run,selected,isTeacher,isDeveloper,sessionKey,actorId,actorName,refresh,renderPage,onMeaning,onOpenContext,onOpenVersion,onRevise,preview}){
  let card=null,queue=null,opinions=new Map(),session=null;
  const context=()=>{const c=selected();return {cardId:c.cardId,senseId:c.senseId,...(!c.personal?{groupId:c.groupId,lessonId:c.lessonId}:{})};};
  const lessonContext=()=>{const c=selected();return {groupId:c.groupId,lessonId:c.lessonId,cardId:c.cardId,senseId:c.senseId};};
  async function load(view){
    const epoch=sessionKey();
    if(view==='word'&&selected()){
      const key=JSON.stringify(context()),data=await api('/local/kit?'+new URLSearchParams(context()));
      if(epoch!==sessionKey()||key!==JSON.stringify(context()))return;
      card=data;
      if(data.meaning)onMeaning(data.meaning);
    }
    if(view==='queue'&&isTeacher()){
      const data=await api('/local/kits/queue');if(epoch===sessionKey()&&isTeacher())queue=data;
    }
  }
  const counts=data=>data?'<p class="counts">'+[['ready','Ready'],['pending','Needs review / attention'],['preparing','Preparing'],['missing','Missing'],['failed','Failed']].map(([key,title])=>'<span>'+title+' <b>'+data[key]+'</b></span>').join('')+'</p>':'';
  function meaningTools(){
    let html='';const c=selected(),m=card?.meaning;
    if(m){
      const meta=m.metadata;
      html='<p>'+esc(m.part_of_speech)+' · '+esc(m.definition)+' · '+esc(m.translation)+'</p><p class="muted small">Level: '+esc(meta.level||'Not assessed')+(meta.forms.length?' · Forms: '+meta.forms.map(esc).join(', '):'')+'</p>'+meta.examples.map(example=>'<p>'+esc(example.en)+'<br><span class="muted">'+esc(example.translation)+'</span></p>').join('')+(meta.source?'<p class="small">Source: <a href="'+esc(meta.source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(meta.source.title)+'</a> · '+esc(meta.source.license)+'</p>':'');
      if(isTeacher()&&!c.personal)html+=details('kit-metadata-'+m.id,'Meaning metadata','<form data-kit-form="metadata"><label>CEFR<select name="level"><option value="">Not assessed</option>'+['A1','A2','B1','B2','C1','C2'].map(level=>'<option '+(meta.level===level?'selected':'')+'>'+level+'</option>').join('')+'</select></label><label>Accepted forms, one per line<textarea name="forms">'+esc(meta.forms.join('\n'))+'</textarea></label><label>Examples: English, then translation on the next line<textarea name="examples">'+esc(meta.examples.flatMap(example=>[example.en,example.translation]).join('\n'))+'</textarea></label><label>Source title<input name="title" maxlength="200" value="'+esc(meta.source?.title)+'"></label><label>Source URL<input type="url" name="url" value="'+esc(meta.source?.url)+'"></label><label>License / permission<input name="license" maxlength="500" value="'+esc(meta.source?.license)+'"></label><button type="submit">Save meaning metadata</button></form>');
    }
    if(isDeveloper()&&!c.personal)html+=details('kit-new-meaning','Add a separate meaning','<form data-kit-form="meaning"><label>Part of speech<input name="partOfSpeech" maxlength="100" required></label><label>Translation<input name="translation" maxlength="2000" required></label><label>Definition<textarea name="definition" maxlength="2000" required></textarea></label><button type="submit">Add meaning</button></form>');
    if(isDeveloper()&&m)html+=details('kit-map-card','Link an existing personal card','<form data-kit-form="link"><label>Existing card ID<input type="number" min="1" name="cardId" required></label><button type="submit">Link this exact meaning</button></form>');
    if(c.personal)html+='<p class="muted small">Student proposals belong to lesson words only.</p>';
    return html;
  }
  function panel(){
    if(!card)return '<p role="status">Loading learning kit...</p>';
    const m=card.meaning;
    const typeRows=[...card.types,...(card.additionalTypes||[])].map(row=>{
      const id=row.versionIds[0]||row.proposalIds?.[0];
      return '<div class="'+(row.type==='Video choice'?'kit-extra-type':'kit-type')+'"><label class="check"><input type="checkbox" name="types" value="'+esc(row.type)+'" '+(!row.canPrepare?'disabled':'')+'><span><strong>'+esc(row.type)+(row.type==='Video choice'?' · additional type':'')+'</strong><span class="small muted">'+esc(statuses[row.status])+(row.approvedCount?' · '+row.approvedCount+' variants':'')+(row.reason?' · '+esc(reasons[row.reason]||row.reason):'')+'</span></span></label>'+(id?'<button type="button" data-kit-action="open-version" data-id="'+id+'">'+(row.versionIds.length?'View variants':'View proposal')+'</button>':'')+'</div>';
    }).join('');
    return '<section class="kit-panel"><h2>Meaning</h2><label>Exact meaning<select id="kit-sense"><option value="" '+(!m?'selected':'')+' disabled>Select a meaning</option>'+card.senses.map(sense=>'<option value="'+sense.id+'" '+(sense.id===m?.id?'selected':'')+'>'+esc(sense.part_of_speech+' · '+sense.translation+' · '+sense.definition)+'</option>').join('')+'</select></label>'+meaningTools()+(card.selectionRequired?'<p class="reason">Choose or explicitly link a meaning before preparing quizzes.</p>':'<h3>Learning kit · '+card.counts.ready+' / '+card.counts.total+' types</h3>'+counts(card.counts)+'<form data-kit-form="fill"><div class="kit-types">'+typeRows+'</div>'+(isTeacher()&&!selected().personal?'<div class="actions"><button type="submit" '+(!card.types.some(row=>row.canPrepare)?'disabled':'')+'>Prepare selected types</button></div>':'')+'</form>')+'</section>';
  }
  function library(){
    if(!isTeacher()||!card?.library?.length)return '';
    return '<section><h2>Template library</h2>'+card.library.map(row=>details('kit-library-'+row.id,row.type+' · v'+row.version+' · '+(!row.current?'Superseded':row.available?'Available':'Withdrawn'),'<p class="attribution">'+esc(row.author)+' · '+esc(row.authorGroup)+' · '+esc(row.date)+'</p><div class="actions"><button data-kit-action="preview" data-id="'+row.id+'">Preview version</button><button data-kit-action="revise" data-id="'+row.id+'">Propose correction</button></div>'+(row.current?'<form data-kit-form="publication" data-id="'+row.id+'"><label>Reason<textarea name="reason" required maxlength="1000"></textarea></label><button type="submit">'+(row.available?'Withdraw from new sessions':'Restore availability')+'</button></form>':''))).join('')+'</section>';
  }
  function queuePanel(){
    if(!isTeacher()||!queue)return '';
    const sum=queue.rows.reduce((result,row)=>{for(const key of Object.keys(result))result[key]+=row.counts[key];return result;},{ready:0,pending:0,preparing:0,missing:0,failed:0});
    return '<section><h2>Learning-kit coverage · '+queue.rows.length+' contexts loaded</h2>'+counts(sum)+details('kit-queue-contexts','Missing materials',queue.rows.map((row,index)=>'<div class="kit-queue-row"><button data-kit-action="context" data-index="'+index+'">'+esc(row.groupName+' / '+row.lessonName+' / '+row.word)+'</button><p class="small muted">'+row.counts.ready+' / 17 ready · '+row.types.filter(type=>type.status!=='ready').map(type=>esc(type.type)+(type.reason?' ('+esc(reasons[type.reason]||type.reason)+')':'')).join(', ')+'</p></div>').join('')+(queue.nextOffset!==null?'<button data-kit-action="more-contexts">Load more contexts</button>':''))+'</section>';
  }
  function opinionBody(q){
    const entry=opinions.get(q.id);if(!entry||entry.revision!==q.revision)return '<button data-kit-action="opinions" data-id="'+q.id+'">Load teacher opinions</button>';
    if(entry.error)return '<p class="local-error">'+esc(entry.error)+'</p><button data-kit-action="opinions" data-id="'+q.id+'">Retry loading</button>';
    const current=entry.rows.find(row=>row.revision===q.revision);
    return entry.rows.map(row=>'<div class="history-event"><p>'+esc(actorName(row.requesterId))+' · '+esc(new Date(row.createdAt).toLocaleDateString('en-GB'))+' · revision '+row.revision+'</p><blockquote class="feedback">'+esc(row.comment)+'</blockquote><p>'+esc(row.decision==='confirm'?'Confirmed':row.decision==='needs_changes'?'Changes required':'Awaiting another teacher')+'</p>'+(row.response?'<p>'+esc(actorName(row.reviewerId))+' · '+esc(row.response)+'</p>':'')+(row===current&&!row.decision&&row.requesterId!==actorId()&&q.author.id!==actorId()?'<form data-kit-form="opinion-decision" data-id="'+q.id+'" data-opinion="'+row.id+'"><label>Opinion<select name="decision"><option value="confirm">Confirm</option><option value="needs_changes">Needs changes</option></select></label><label>Comment<textarea name="comment" maxlength="2000" required></textarea></label><button type="submit">Save second opinion</button></form>':'')+'</div>').join('')+(!current&&q.state==='submitted'?'<form data-kit-form="opinion" data-id="'+q.id+'"><label>Question for another teacher<textarea name="comment" maxlength="2000" required></textarea></label><button type="submit">Request second opinion</button></form>':'');
  }
  const opinionPanel=q=>isTeacher()?details('kit-opinions-'+q.id,'Teacher opinions','<div data-kit-opinions="'+q.id+'">'+opinionBody(q)+'</div>'):'';
  async function loadOpinions(q){
    const epoch=sessionKey();let entry;
    try{const data=await api('/local/quizzes/'+q.id+'/opinions');entry={revision:q.revision,rows:data.opinions};}catch(error){entry={revision:q.revision,error:error.message};}
    if(epoch!==sessionKey()||!isTeacher())return;opinions.set(q.id,entry);
    const node=document.querySelector('[data-kit-opinions="'+q.id+'"]');if(node)node.innerHTML=opinionBody(q);
  }
  function sessionForm(data){
    if(data.content)return '<p class="verified">'+data.correctCount+' / '+data.total+' correct</p>'+data.content.items.map((item,index)=>'<p>'+esc(data.correct[index]?'Correct':'Try again')+'</p>'+preview(data.type,{...item,...(data.questions[index]?.mediaUrl?{mediaUrl:data.questions[index].mediaUrl}:{})})).join('')+'<p>'+esc(data.content.explanation)+'</p>';
    const pairs=['Match','Memory'].includes(data.type),items=pairs?data.questions.left.map(left=>({prompt:left,options:data.questions.right})):data.questions;
    return '<form data-kit-form="answers">'+items.map((item,index)=>'<fieldset class="editor-item"><legend>Item '+(index+1)+'</legend>'+(item.mediaUrl?(data.type==='Video choice'?'<video controls playsinline preload="metadata" src="'+esc(item.mediaUrl)+'"></video>':'<audio controls preload="metadata" src="'+esc(item.mediaUrl)+'"></audio>'):'')+'<p>'+esc(item.prompt||item.front||item.shown||item.parts||item.text||item.hint||'')+'</p>'+(item.letters?'<p>'+esc(item.letters.join(' '))+'</p>':'')+(item.length?'<p>'+item.length+' letters</p>':'')+(item.options?(data.type==='Select all'?item.options.map((option,n)=>'<label class="check"><input type="checkbox" name="answer-'+index+'" value="'+n+'">'+esc(option)+'</label>').join(''):'<label>Answer<select name="answer-'+index+'" required><option value="">Choose an answer</option>'+item.options.map((option,n)=>'<option value="'+n+'">'+esc(option)+'</option>').join('')+'</select></label>'):'<label>Answer<input name="answer-'+index+'" maxlength="4000" required autocomplete="off"></label>')+'</fieldset>').join('')+'<button class="primary" type="submit">Check answers</button></form>';
  }
  function showSession(data){session=data;const modal=document.querySelector('#kit-session');modal.querySelector('[data-kit-session-body]').innerHTML=sessionForm(data);if(!modal.open)modal.showModal();}
  function bind({getQuiz}){
    document.addEventListener('change',event=>{if(event.target.id==='kit-sense')run(async()=>{onMeaning(card.senses.find(row=>row.id===event.target.value));await refresh();});});
    document.addEventListener('click',event=>{
      const node=event.target.closest('[data-kit-action]');if(!node)return;
      if(node.dataset.kitAction==='close-session'){document.querySelector('#kit-session').close();return;}
      run(async()=>{
        const id=node.dataset.id,action=node.dataset.kitAction;
        if(action==='opinions')await loadOpinions(getQuiz(id));
        if(action==='open-version')await onOpenVersion(id);
        if(action==='revise')await onRevise(id);
        if(action==='preview'){const {quiz}=await api('/local/quizzes/'+id);const dialog=document.querySelector('#kit-session');dialog.querySelector('[data-kit-session-body]').innerHTML=quiz.content.items.map(item=>preview(quiz.type,item)).join('')+'<p>'+esc(quiz.content.explanation)+'</p>';dialog.showModal();}
        if(action==='practice'){const result=await api('/local/kit-sessions',{cardId:selected().cardId,senseId:selected().senseId,versionId:id,mode:'practice'});showSession(await api('/local/kit-sessions/'+result.id));}
        if(action==='context'){await onOpenContext(queue.rows[Number(node.dataset.index)]);}
        if(action==='more-contexts'){const data=await api('/local/kits/queue?offset='+queue.nextOffset);queue={rows:[...queue.rows,...data.rows],nextOffset:data.nextOffset};renderPage();}
      });
    });
    document.addEventListener('submit',event=>{
      const form=event.target;if(!form.dataset.kitForm)return;event.preventDefault();
      // Capture selects before the host disables controls during a mutation.
      const data=new FormData(form),kind=form.dataset.kitForm,id=form.dataset.id,q=id?getQuiz(id):null;
      run(async()=>{
        if(kind==='fill'){const types=data.getAll('types');if(!types.length)throw Error('Select at least one available type.');await api('/local/kit/fill',{...lessonContext(),types});}
        if(kind==='metadata'){
          const lines=String(data.get('examples')).split('\n').map(line=>line.trim()).filter(Boolean);if(lines.length%2)throw Error('Each example needs an English line and a translated line.');
          const examples=[];for(let i=0;i<lines.length;i+=2)examples.push({en:lines[i],translation:lines[i+1]});
          const title=data.get('title').trim(),url=data.get('url').trim(),license=data.get('license').trim();
          await api('/local/kit/metadata',{...lessonContext(),expectedRevision:card.meaning.metadata.revision,metadata:{level:data.get('level')||null,forms:data.get('forms').split('\n').map(line=>line.trim()).filter(Boolean),examples,source:title||url||license?{title,url,license}:null}});
        }
        if(kind==='meaning'){const result=await api('/local/kit/meaning',{cardId:selected().cardId,meaning:Object.fromEntries(data)});onMeaning({id:result.senseId});}
        if(kind==='link')await api('/local/kit/link',{cardId:Number(data.get('cardId')),senseId:card.meaning.id});
        if(kind==='publication'){const row=card.library.find(row=>row.id===id);await api('/local/quizzes/'+id+'/publication',{expectedRevision:row.publicationRevision,available:!row.available,reason:data.get('reason')});}
        if(kind==='opinion'||kind==='opinion-decision'){
          await api('/local/quizzes/'+id+'/'+(kind==='opinion'?'opinions':'opinion-decision'),{expectedRevision:q.revision,comment:data.get('comment'),...(kind==='opinion-decision'?{opinionId:form.dataset.opinion,decision:data.get('decision')}:{})});
          opinions.delete(id);await loadOpinions(q);
        }
        if(kind==='answers'){
          const pairs=['Match','Memory'].includes(session.type),items=pairs?session.questions.left:session.questions;
          const responses=items.map((item,index)=>session.type==='Select all'?data.getAll('answer-'+index).map(Number):pairs||item.options?Number(data.get('answer-'+index)):data.get('answer-'+index));
          await api('/local/kit-sessions/'+session.id+'/submit',{expectedRevision:session.revision,responses});showSession(await api('/local/kit-sessions/'+session.id));return;
        }
        await refresh();
      });
    });
  }
  return {load,panel,library,queuePanel,opinionPanel,bind,reset(){card=null;queue=null;opinions.clear();session=null;document.querySelector('#kit-session')?.close();}};
}
