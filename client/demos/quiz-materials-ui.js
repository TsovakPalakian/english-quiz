// Isolated materials/feedback controls. No production transport or browser secrets.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createQuizMaterialsUI({api,run,sessionKey,context,isTeacher,getQuizzes,refresh,notify}){
  let state=null,last=null,pendingReport=null,uploadIntent=null;
  const lesson=()=>{const c=context();return {cardId:c.cardId,senseId:c.senseId,groupId:c.groupId,lessonId:c.lessonId};};
  async function load(){
    const epoch=sessionKey(),cardId=context()?.cardId;if(!cardId)return;
    const uploads=await api('/local/media?purpose=quiz'),attachments=await api('/local/media?purpose=feedback'),reports=await api('/local/feedback'),services=isTeacher()?await api('/local/materials'):null;
    if(epoch===sessionKey()&&cardId===context()?.cardId)state={uploads:uploads.media,attachments:attachments.media,reports:reports.reports,services};
  }
  function render(){
    if(!state)return '';
    const c=context(),voices=state.services?.voices||[],tts=state.services?.tasks.find(task=>task.task==='tts'),dictionary=state.services?.tasks.find(task=>task.task==='dictionary');
    return '<section class="materials-panel"><h2>Media and language sources</h2><form data-material-form="upload"><label>Purpose<select name="purpose">'+(!c.personal?'<option value="quiz">Quiz media</option>':'')+'<option value="feedback">Private report attachment</option></select></label><label>PNG / JPEG · WAV / MP3 · MP4 (up to 60 seconds)<input type="file" name="file" accept="image/png,image/jpeg,audio/wav,audio/mpeg,video/mp4" required></label><button type="submit">Upload media</button></form>'+(!c.personal&&isTeacher()?'<div class="material-services"><form data-material-form="tts"><label>Voice<select name="voice">'+voices.filter(voice=>!tts?.selection||voice.locale===tts.selection.locale).map(voice=>'<option value="'+esc(voice.id)+'">'+esc(voice.id+' · '+voice.locale)+'</option>').join('')+'</select></label><button type="submit" '+(!tts?.available?'disabled':'')+'>Prepare word audio</button></form><button data-material-action="dictionary" '+(!dictionary?.available?'disabled':'')+'>Look up dictionary reference</button></div><dl class="attempt-meta">'+state.services.tasks.map(task=>'<dt>'+esc(task.task)+'</dt><dd>'+esc(task.available?task.provider:'Off')+' · '+task.dayUsed+' / '+task.day+' '+esc(task.unit)+' today · '+task.monthUsed+' / '+task.month+' this month</dd>').join('')+'</dl>':'')+lastResult()+'<details data-expand="material-uploads"><summary><strong>Your quiz uploads · '+state.uploads.length+'</strong></summary>'+state.uploads.map(asset=>'<div class="kit-queue-row"><strong>'+esc(asset.name)+'</strong><p class="small muted">'+esc(asset.mime)+' · '+Math.ceil(asset.descriptor.duration)+' seconds · '+asset.bytes+' bytes</p><button data-material-action="remove" data-id="'+asset.id+'">Remove unused upload</button></div>').join('')+'</details></section><section class="materials-panel"><h2>Report a problem or suggestion</h2><form data-material-form="report"><label>Quiz version<select name="versionId"><option value="">This word and meaning</option>'+getQuizzes().filter(q=>q.senseId===c.senseId).map(q=>'<option value="'+q.id+'">'+esc(q.type+' · v'+q.version)+'</option>').join('')+'</select></label><label>Category<select name="category"><option value="remark">Remark</option><option value="complaint">Complaint</option><option value="suggestion">Suggestion</option><option value="bug">Bug</option></select></label><label>Description<textarea name="description" required maxlength="4000"></textarea></label>'+state.attachments.map(asset=>'<label class="check"><input type="checkbox" name="attachments" value="'+asset.id+'">'+esc(asset.name)+'</label>').join('')+'<button type="submit">Preview report</button></form><p class="small muted">info@lumiscia.org · Local outbox · Not delivered</p><details data-expand="material-reports"><summary><strong>Your local reports · '+state.reports.length+'</strong></summary>'+state.reports.map(report=>'<div class="history-event"><strong>'+esc(report.category)+'</strong><p>'+esc(report.description)+'</p><p class="small muted">'+esc(new Date(report.createdAt).toLocaleDateString('en-GB'))+' · '+report.attachments.length+' attachments · Not delivered</p></div>').join('')+'</details></section>';
  }
  function lastResult(){
    if(!last)return '';
    if(last.state!=='complete')return '<p class="reason">'+esc(last.result?.error||'Material preparation is pending.')+'</p>';
    const result=last.result;
    if(result.media)return '<div class="material-result"><strong>Reference audio · Teacher check pending</strong><audio controls preload="metadata" src="/local/media/'+result.media.id+'"></audio><p class="small muted">'+esc(result.source.provider+' · '+result.source.model+' · '+result.voice)+'</p></div>';
    return '<div class="material-result">'+result.entries.map(entry=>'<p><strong>'+esc(entry.word)+' · '+esc(entry.partOfSpeech)+'</strong><br>'+esc(entry.definition)+'<br>'+esc(entry.translation)+(entry.ipa?'<br>'+esc(entry.ipa):'')+'</p><p class="small muted">'+esc(entry.source.title)+' · '+esc(entry.source.license)+'</p>').join('')+'</div>';
  }
  function decorateEditor(root,type){
    if(!state)return;
    const transcript=root.querySelector('input[data-field="transcript"]');
    if(transcript){const textarea=document.createElement('textarea');for(const attr of transcript.attributes)if(!['value','type'].includes(attr.name))textarea.setAttribute(attr.name,attr.value);textarea.value=transcript.value;transcript.replaceWith(textarea);}
    root.querySelectorAll('[data-field="mediaId"]').forEach(input=>{
      const select=document.createElement('select');for(const attr of input.attributes)if(!['value','type','maxlength'].includes(attr.name))select.setAttribute(attr.name,attr.value);
      const kind=type==='Listen'?'audio':'video',assets=state.uploads.filter(asset=>asset.descriptor.kind===kind),current=input.value;
      select.innerHTML='<option value="">No asset selected</option>'+assets.map(asset=>'<option value="'+asset.id+'" '+(asset.id===current?'selected':'')+'>'+esc((asset.source.text||asset.name)+(asset.source.voice?' · '+asset.source.voice:''))+'</option>').join('')+(current&&!assets.some(asset=>asset.id===current)?'<option value="'+esc(current)+'" selected>Existing version media</option>':'');input.replaceWith(select);
    });
  }
  function afterRender(){
    const form=document.querySelector('[data-material-form="upload"]');if(!form||form.elements.rights)return;
    for(const [name,title,type,maxLength] of [['rights','Reuse permission (quiz media)','text',500],['sourceUrl','Source URL, if applicable','url',1000]]){
      const label=document.createElement('label'),input=document.createElement('input');label.textContent=title;input.name=name;input.type=type;input.maxLength=maxLength;label.append(input);form.insertBefore(label,form.querySelector('button'));
    }
    form.elements.rights.required=form.elements.purpose.value==='quiz';
  }
  document.addEventListener('change',event=>{const form=event.target.closest('[data-material-form="upload"]');if(form?.elements.rights)form.elements.rights.required=form.elements.purpose.value==='quiz';});
  async function prepare(task,extra={}){last=await api('/local/materials/'+task,{...lesson(),...extra});await refresh();if(last.state==='failed')throw Error(last.result.error);}
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-material-action]');if(!button)return;
    if(button.dataset.materialAction==='cancel-report'){document.querySelector('#material-report').close();pendingReport=null;return;}
    run(async()=>{
      const action=button.dataset.materialAction;
      if(action==='dictionary')await prepare('dictionary');
      if(action==='remove'){await api('/local/media/'+button.dataset.id,{});await refresh();notify('Unused upload removed.');}
      if(action==='confirm-report'){
        if(!pendingReport)return;await api('/local/feedback',pendingReport);document.querySelector('#material-report').close();pendingReport=null;await refresh();notify('Saved in the local outbox. No email was sent.');
      }
    });
  });
  document.addEventListener('submit',event=>{
    const form=event.target,kind=form.dataset.materialForm;if(!kind)return;event.preventDefault();const data=new FormData(form);
    if(kind==='report'){
      pendingReport={cardId:context().cardId,senseId:context().senseId,versionId:data.get('versionId')||null,category:data.get('category'),description:data.get('description'),attachments:data.getAll('attachments')};
      const c=context(),version=getQuizzes().find(q=>q.id===pendingReport.versionId),modal=document.querySelector('#material-report');
      modal.querySelector('[data-report-preview]').innerHTML='<p><strong>info@lumiscia.org</strong> · Local outbox · Not delivered</p><p>'+esc([c.group,c.lesson,c.word,c.translation].filter(Boolean).join(' / '))+'</p><p>'+esc(c.meaning)+'</p><p>'+esc(version?version.type+' · v'+version.version:'This word and meaning')+' · '+esc(pendingReport.category)+'</p><p class="quiz-content">'+esc(pendingReport.description)+'</p><ul>'+pendingReport.attachments.map(id=>{
        const asset=state.attachments.find(asset=>asset.id===id);if(!asset)return '';
        const url='/local/media/'+asset.id,tag=asset.descriptor.kind==='image'?'img':asset.descriptor.kind==='video'?'video':'audio';
        return '<li class="report-attachment">'+esc(asset.name)+(tag==='img'?'<img src="'+url+'" alt="'+esc(asset.name)+'">':'<'+tag+' src="'+url+'" controls preload="metadata"'+(tag==='video'?' playsinline':'')+'></'+tag+'>')+'</li>';
      }).join('')+'</ul>';modal.showModal();return;
    }
    run(async()=>{
      if(kind==='tts'){await prepare('tts',{voice:data.get('voice')});return;}
      if(kind==='upload'){
        const file=form.elements.file.files[0],purpose=data.get('purpose'),mime=file.type.split(';')[0],metadata={...lesson(),purpose,mime,name:file.name,rights:data.get('rights')?.trim()||null,sourceUrl:data.get('sourceUrl')?.trim()||null},key=JSON.stringify(metadata);
        if(!uploadIntent||uploadIntent.file!==file||uploadIntent.key!==key)uploadIntent={key,file,mutationId:crypto.randomUUID()};
        const response=await fetch('/local/media',{method:'POST',headers:{'Content-Type':mime,'X-Upload-Metadata':encodeURIComponent(JSON.stringify({...metadata,mutationId:uploadIntent.mutationId}))},body:file}),result=await response.json();
        if(!response.ok)throw Error(result.error||'Upload failed.');uploadIntent=null;await refresh();notify('Media decoded and saved locally.');
      }
    });
  });
  return {load,render,decorateEditor,afterRender,reset(){state=null;last=null;pendingReport=null;uploadIntent=null;document.querySelector('#material-report')?.close();}};
}
