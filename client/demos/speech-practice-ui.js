// Local-only recording: no upload or analysis until the explicit consented action.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={pronunciation:'Pronunciation',free:'Free speech',shadowing:'Shadowing',retelling:'Retelling',dialogue:'Situational dialogue'};
const metricNames={accuracy:'Pronunciation accuracy',fluency:'Fluency',prosody:'Prosody',grammar:'Grammar',vocabulary:'Vocabulary',task:'Task completion'};
function wav(chunks,rate){
  const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer),ascii=(at,text)=>[...text].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));
  ascii(0,'RIFF');view.setUint32(4,36+length*2,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,length*2,true);
  let at=44;for(const chunk of chunks)for(const sample of chunk){view.setInt16(at,Math.round(Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767)),true);at+=2;}
  return new Blob([buffer],{type:'audio/wav'});
}
export function createSpeechPracticeUI({api,run,context,isTeacher,sessionKey,renderPage,notify,endpoint='/local/speech'}){
  const route=path=>path.replace(/^\/local\/speech(?=\/|\?|$)/,endpoint);
  let state=null,taskId='',blob=null,localUrl='',uploaded=null,intent=null,capture=null,captureEpoch=0,contextKey='',generation=0,pollTimer,uploadController,trainingPlan=null,comparison=null;
  const selected=()=>state?.tasks.find(task=>task.id===taskId);
  let expandedAttempts=new Set();
  const lesson=()=>{const c=context();return {groupId:c.groupId,lessonId:c.lessonId,...(c.lessonSpeech?{}:{cardId:c.cardId,senseId:c.senseId})};};
  function cleanup(){captureEpoch++;if(capture){clearTimeout(capture.timer);capture.processor.disconnect();capture.source.disconnect();capture.stream.getTracks().forEach(track=>track.stop());capture.audio.close().catch(()=>{});capture=null;}}
  function discard(){cleanup();uploadController?.abort();uploadController=null;document.querySelectorAll('.speech-panel audio').forEach(audio=>audio.pause());if(localUrl)URL.revokeObjectURL(localUrl);localUrl='';blob=null;uploaded=null;intent=null;}
  async function load(){
    const c=context();if(!c||c.personal){reset();return;}
    const key=JSON.stringify(lesson()),epoch=sessionKey(),loadId=++generation;if(key!==contextKey){discard();taskId='';state=null;trainingPlan=null;comparison=null;expandedAttempts.clear();contextKey=key;}
    const data=await api('/local/speech?'+new URLSearchParams(lesson()));if(epoch!==sessionKey()||loadId!==generation)return;
    if(!data.tasks.some(task=>task.id===taskId))taskId=data.tasks[0]?.id||'';
    const [history,progress,recipients,shared]=taskId?await Promise.all([api('/local/speech/tasks/'+taskId+'/history'),api('/local/speech/tasks/'+taskId+'/progress'),api('/local/speech/tasks/'+taskId+'/recipients'),isTeacher()?api('/local/speech/tasks/'+taskId+'/shared'):Promise.resolve([])]):[{attempts:[],next:null},{series:[]},[],[]];
    const textReviews=new Map();
    for(const attempt of [...history.attempts,...shared])if(attempt.state==='complete')textReviews.set(attempt.id,await api('/local/speech/attempts/'+attempt.id+'/text-reviews'));
    if(epoch===sessionKey()&&loadId===generation)state={...data,history,progress,recipients,shared,textReviews};
  }
  function trainingPanel(){
    if(!trainingPlan)return '';
    const choices=state.history.attempts.filter(attempt=>attempt.id!==trainingPlan.attemptId&&attempt.state==='complete'&&attempt.canManage);
    return '<section class="speech-training"><h3>Personal practice</h3><p>'+(trainingPlan.synthetic?'Synthetic demonstration · ':'')+'Repeat the same task using the focus below. A new score requires a new recording and consent.</p><ol>'+trainingPlan.focus.map(item=>'<li>'+esc(metricNames[item.metric])+': '+esc(item.message)+(item.phoneme?' · /'+esc(item.phoneme)+'/':'')+'</li>').join('')+'</ol>'+(trainingPlan.reference?'<blockquote>'+esc(trainingPlan.reference)+'</blockquote>':'')+'<p>'+esc(trainingPlan.prompt)+'</p>'+(choices.length?'<label>Compare with<select data-speech-comparison>'+choices.map(attempt=>'<option value="'+esc(attempt.id)+'" '+(attempt.id===trainingPlan.repeatId?'selected':'')+'>'+esc(new Date(attempt.createdAt).toLocaleString('en-GB'))+' · '+esc(attempt.result?.overall??'Unavailable')+'</option>').join('')+'</select></label><button type="button" data-speech-action="compare">Compare attempts</button>':'<p>Complete another attempt to compare the results.</p>')+(comparison?'<h4>Selected attempts · 0–100</h4><p>'+esc(new Date(comparison.baseline.date).toLocaleString('en-GB'))+' → '+esc(new Date(comparison.repeat.date).toLocaleString('en-GB'))+'</p><dl class="speech-scores">'+Object.entries(comparison.metrics).map(([key,value])=>'<dt>'+esc(key==='overall'?'Overall':metricNames[key])+'</dt><dd>'+esc(value.before??'Unavailable')+' → '+esc(value.after??'Unavailable')+' · '+(value.change===null?'Change unavailable':(value.change>0?'+':'')+value.change)+'</dd>').join('')+'</dl>':'')+'<button type="button" data-speech-action="end-training">Close practice focus</button></section>';
  }
  function resultPanel(attempt){
    const result=attempt.result;
    return '<details class="speech-attempt" data-speech-id="'+esc(attempt.id)+'"><summary>'+esc(new Date(attempt.createdAt).toLocaleString('en-GB'))+' · '+esc(attempt.state)+(result?.overall!==null&&result?.overall!==undefined?' · '+result.overall+' / 100':'')+'</summary><div class="detail">'+(result?'<p class="reason">'+(result.synthetic?'Synthetic demonstration, not an assessment of your recording. ': '')+(result.provisional?'Provisional rubric. ':'')+'Automatic practice feedback, not an exam grade.</p><dl class="speech-scores">'+Object.entries(result.scores).map(([key,score])=>'<dt>'+esc(metricNames[key])+'</dt><dd>'+(score===null?'Unavailable':score+' / 100 <meter min="0" max="100" value="'+score+'">'+score+'</meter>')+'</dd>').join('')+'</dl><p>Overall: '+(result.overall===null?'Unavailable · Missing: '+result.missing.map(key=>esc(metricNames[key])).join(', '):result.overall+' / 100')+'</p><h4>Transcript</h4><p class="quiz-content">'+esc(result.transcript||'Unavailable')+'</p>'+(attempt.correction?'<p>Corrected transcript: '+esc(attempt.correction.text)+'</p><p class="small muted">Correction does not change the original scores.</p>':'')+result.findings.map(finding=>'<p>'+esc(metricNames[finding.metric])+': '+esc(finding.message)+(finding.wordIndex!==null?' · word '+(finding.wordIndex+1):'')+(finding.phoneme?' · /'+esc(finding.phoneme)+'/':'')+'</p>').join('')+(result.training.length?'<h4>Next practice</h4><ul>'+result.training.map(item=>'<li>'+esc(item.message)+'</li>').join('')+'</ul>':'')+'<details><summary>Source and rubric</summary><p>'+esc(result.rubric.id+' · '+result.rubric.version)+'</p>'+result.sources.map(source=>'<p>'+esc(source.task+' · '+source.provider+' · '+source.model+' · '+source.version)+'</p>').join('')+'</details>':'<p>'+esc(attempt.error||'Analysis pending')+'</p>')+'<audio controls preload="none" src="/local/speech/attempts/'+esc(attempt.id)+'/audio"></audio>'+(attempt.canManage?(attempt.state==='complete'?'<form data-speech-form="correct" data-id="'+esc(attempt.id)+'"><label>Correct the transcript<textarea name="text" maxlength="6000" required>'+esc(attempt.correction?.text||result?.transcript)+'</textarea></label><button type="submit">Save transcript correction</button></form>':'')+'<form data-speech-form="share" data-id="'+esc(attempt.id)+'"><label>Teacher<select name="teacherId">'+state.recipients.map(teacher=>'<option value="'+esc(teacher.id)+'">'+esc(teacher.name)+'</option>').join('')+'</select></label><label class="check"><input type="checkbox" name="includeAudio">Include my recording</label><label class="check"><input type="checkbox" name="consent" required>Allow this teacher to view this result</label><button type="submit">Share with teacher</button></form>'+attempt.shares.map(share=>'<p>'+esc(state.recipients.find(row=>row.id===share.teacherId)?.name||'Teacher')+' · '+(share.includeAudio?'Result and recording':'Result only')+' <button data-speech-action="revoke" data-id="'+esc(attempt.id)+'" data-teacher="'+esc(share.teacherId)+'">Revoke access</button></p>').join('')+'<div class="actions">'+(['queued','analyzing'].includes(attempt.state)?'<button data-speech-action="cancel" data-id="'+esc(attempt.id)+'">Cancel analysis</button>':'')+'<button data-speech-action="remove" data-id="'+esc(attempt.id)+'">Delete attempt and recording</button></div>':'')+'</div></details>';
  }
  function renderContent(){
    if(context()?.personal)return '<section><p>Speech practice belongs to lesson words.</p></section>';
    if(!state)return '<p role="status">Loading speech practice...</p>';
    const task=selected();
    return '<section class="speech-panel"><p class="reason">Local pilot · Synthetic analysis only · No external speech service connected</p><label>Lesson task<select id="speech-task">'+state.tasks.map(row=>'<option value="'+row.id+'" '+(row.id===taskId?'selected':'')+'>'+esc(names[row.mode]+' · '+row.prompt)+'</option>').join('')+'</select></label>'+(task?'<h2>'+esc(names[task.mode])+'</h2><p>'+esc(task.prompt)+'</p>'+(task.reference?'<blockquote>'+esc(task.reference)+'</blockquote>':'')+(task.referenceMediaId?'<audio controls preload="none" src="/local/speech/tasks/'+task.id+'/audio"></audio>':'')+'<p class="small muted">'+esc(task.locale)+' · '+task.maxSeconds+' seconds maximum · '+(task.evaluation==='stt'?'Transcription only':'Pronunciation analysis')+'</p><div class="actions"><button data-speech-action="record" '+(capture?'disabled':'')+'>Record speech</button><button data-speech-action="stop" '+(!capture?'disabled':'')+'>Stop recording</button><button data-speech-action="discard" '+(!blob&&!capture?'disabled':'')+'>Discard recording</button></div><p role="status">'+(capture?'Recording locally...':'')+'</p><label>Or choose a WAV / MP3 recording<input id="speech-file" type="file" accept="audio/wav,audio/mpeg,.wav,.mp3"></label>'+(localUrl?'<audio data-speech-local controls src="'+esc(localUrl)+'"></audio><p>Recording ready · '+Math.ceil(blob.size/1024)+' KiB</p>':'')+'<form data-speech-form="analyze"><label class="check"><input type="checkbox" name="consent" required>Send this recording to the selected synthetic local analyzer</label><button type="submit" '+(!blob||capture?'disabled':'')+'>Analyze recording</button></form><details><summary>My attempts · '+state.history.attempts.length+' loaded</summary>'+state.history.attempts.map(resultPanel).join('')+(state.history.next?'<button data-speech-action="more">Load older attempts</button>':'')+'</details><details open><summary>Comparable progress</summary>'+state.progress.series.map((series,index)=>'<div class="speech-series"><h3>Series '+(index+1)+' · '+series.points.length+' completed attempts</h3><p class="small muted">'+(series.synthetic?'Synthetic demonstration · ':'')+(series.provisional?'Provisional rubric':'Teacher-defined rubric')+'</p><label>Metric<select data-speech-metric="'+index+'"><option value="overall">Overall</option>'+Object.entries(metricNames).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label><canvas data-speech-chart="'+index+'" width="640" height="180" aria-label="Comparable practice scores from 0 to 100"></canvas><div data-speech-stats="'+index+'"></div></div>').join('')+(!state.progress.series.length?'<p>No comparable completed attempts yet.</p>':'')+'</details>'+(isTeacher()?'<details><summary>Shared with you · '+state.shared.length+'</summary>'+state.shared.map(resultPanel).join('')+'</details>':''):'<p>No speech tasks for this lesson word yet.</p>')+(isTeacher()?'<details><summary>Create a lesson speech task</summary><form data-speech-form="task"><label>Mode<select name="mode">'+Object.entries(names).map(([key,label])=>'<option value="'+key+'">'+label+'</option>').join('')+'</select></label><label>Locale<select name="locale"><option>en-US</option><option>en-GB</option></select></label><label>Prompt<textarea name="prompt" maxlength="2000" required></textarea></label><label>Reading reference (Pronunciation / Shadowing)<textarea name="reference" maxlength="2000"></textarea></label><label>Reference audio ID (required for Shadowing)<input name="referenceMediaId" maxlength="36"></label><label>Evaluator<select name="evaluation"><option value="pronunciation">Pronunciation assessment</option><option value="stt">Transcription only</option></select></label><label class="check"><input type="checkbox" name="languageReview">Separate language review of the transcript</label><button type="submit">Create speech task</button></form></details>':'')+'</section>';
  }
  function render(){
    expandedAttempts=new Set([...document.querySelectorAll('[data-speech-id][open]')].map(node=>node.dataset.speechId));
    if(document.querySelector('[data-speech-history][open]'))expandedAttempts.add('history');
    const contexts=context()?.lessonSpeech&&isTeacher()?'<label>Word and meaning<select name="lessonContext" required><option value="">Select a lesson context</option>'+(state?.contexts||[]).map((row,index)=>'<option value="'+index+'">'+esc([row.word,row.partOfSpeech,row.definition].filter(Boolean).join(' · '))+'</option>').join('')+'</select></label>':'';
    return renderContent().replace('<section class="speech-panel">','<section class="speech-panel">'+trainingPanel())
      .replace('<details><summary>My attempts','<details data-speech-history><summary>My attempts')
      .replace('<label>Mode<select name="mode">',contexts+'<label>Mode<select name="mode">')
      .replace('No speech tasks for this lesson word yet.',context()?.lessonSpeech?'No speech tasks for this lesson yet.':'No speech tasks for this lesson word yet.')
      .replaceAll('src="/local/speech/','src="'+endpoint+'/')
      .replace('Local pilot · Synthetic analysis only · No external speech service connected',state?.synthetic?'Synthetic analysis only · No assessment of the recording':state?.analyzerLabel?'Speech provider: '+esc(state.analyzerLabel):'Speech provider is not configured')
      .replace('Send this recording to the selected synthetic local analyzer','Send this recording to '+esc(state?.analyzerLabel||(state?.synthetic?'the synthetic local analyzer':'the configured speech provider')));
  }
  function chart(index,metric='overall'){
    const series=state?.progress.series[index],canvas=document.querySelector('[data-speech-chart="'+index+'"]');if(!series||!canvas)return;
    const ctx=canvas.getContext('2d'),color=getComputedStyle(canvas).color;ctx.clearRect(0,0,640,180);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.font='12px sans-serif';
    for(const value of [0,50,100]){const y=160-value*1.4;ctx.globalAlpha=0.25;ctx.beginPath();ctx.moveTo(30,y);ctx.lineTo(630,y);ctx.stroke();ctx.globalAlpha=1;ctx.fillText(String(value),2,y+4);}
    ctx.beginPath();let connected=false;series.points.forEach((point,n)=>{if(point[metric]===null){connected=false;return;}const x=35+n*580/Math.max(1,series.points.length-1),y=160-point[metric]*1.4;if(connected)ctx.lineTo(x,y);else ctx.moveTo(x,y);connected=true;});ctx.stroke();
    series.points.forEach((point,n)=>{if(point[metric]!==null){ctx.beginPath();ctx.arc(35+n*580/Math.max(1,series.points.length-1),160-point[metric]*1.4,3,0,Math.PI*2);ctx.fill();}});
    const summary=series.metrics[metric];document.querySelector('[data-speech-stats="'+index+'"]').textContent=summary?'Count: '+summary.count+' · First: '+summary.first+' · Latest: '+summary.last+' · Best: '+summary.best+' · Average: '+summary.average+' / 100':'This metric is unavailable. Missing results are not zero scores.';
  }
  function afterRender(){
    const history=document.querySelector('[data-speech-history]');if(history)history.open=expandedAttempts.has('history');
    const taskSelect=document.getElementById('speech-task');if(taskSelect)for(const option of taskSelect.options){const task=state?.tasks.find(row=>row.id===option.value);if(task?.word)option.textContent=names[task.mode]+' · '+task.word+' · '+task.prompt;}
    const analyze=document.querySelector('[data-speech-form="analyze"] button');if(analyze&&state?.availability?.[taskId]===false)analyze.disabled=true;
    state?.progress.series.forEach((_,index)=>chart(index,document.querySelector('[data-speech-metric="'+index+'"]')?.value||'overall'));
    document.querySelectorAll('[data-speech-id]').forEach(node=>{
      node.open=expandedAttempts.has(node.dataset.speechId);
      const attempt=[...(state?.history.attempts||[]),...(state?.shared||[])].find(row=>row.id===node.dataset.speechId);
      node.querySelector('[data-speech-action="training"]')?.remove();
      if(state?.trainingAvailable&&attempt?.canManage&&attempt.state==='complete'&&attempt.result?.training.length){const button=document.createElement('button');button.type='button';button.dataset.speechAction='training';button.dataset.id=attempt.id;button.textContent='Practice these points';node.querySelector('.detail').prepend(button);}
      if(attempt&&!attempt.canHear)node.querySelector('audio')?.remove();
      const transcript=node.querySelector('.quiz-content'),result=attempt?.result;
      if(transcript&&result?.transcript){
        let index=0;transcript.replaceChildren();for(const part of result.transcript.split(/(\s+)/)){
          const wordIndex=/\S/.test(part)?index++:null,findings=wordIndex===null?[]:result.findings.filter(finding=>finding.wordIndex===wordIndex);
          if(findings.length){const mark=document.createElement('mark');mark.textContent=part;mark.title=findings.map(finding=>finding.message).join('; ');transcript.append(mark);}else transcript.append(document.createTextNode(part));
        }
      }
      node.querySelector('[data-speech-language-warning]')?.remove();
      if(result?.languageReviewUnavailable){const note=document.createElement('p');note.className='reason';note.dataset.speechLanguageWarning='';note.textContent='Language review unavailable. Acoustic scores do not assess grammar or task completion.';node.querySelector('.detail').append(note);}
      const old=node.querySelector('[data-text-reviews]'),wasOpen=old?.open;old?.remove();
      if(attempt?.state==='complete'){
        const rows=state.textReviews?.get(attempt.id)?.reviews||[],revision=attempt.correction?.revision||0,latest=rows.find(row=>row.transcriptRevision===revision),panel=document.createElement('details');
        panel.dataset.textReviews='';panel.open=wasOpen||false;
        panel.innerHTML='<summary>Confirmed transcript language review</summary><p class="small muted">Text-only assessment; acoustic scores and speech progress remain unchanged.</p>'+(attempt.canManage?'<p>'+esc(attempt.correction?.text||result.transcript)+'</p><form data-speech-form="confirm-text" data-id="'+esc(attempt.id)+'" data-revision="'+revision+'" data-retry="'+esc(latest?.id||'')+'"><label class="check"><input type="checkbox" name="consent" required>Send this exact transcript revision for language review</label><button type="submit" '+(['reserved','started'].includes(latest?.state)?'disabled':'')+'>Review confirmed text</button></form>':'')+rows.map(row=>'<section><h4>Revision '+row.transcriptRevision+' · '+esc(row.state)+'</h4><p>'+esc(row.transcript)+'</p><p class="small muted">'+esc(row.source.provider+' · '+row.source.model+' · '+row.source.version)+(row.basedOnEditedTranscript?' · Edited transcript':' · Original transcript')+'</p>'+(row.result?'<p>'+(row.result.synthetic?'Synthetic demonstration · ':'')+'Language score: '+esc(row.result.overall??'Unavailable')+' / 100</p><dl>'+['grammar','vocabulary','task'].map(key=>'<dt>'+esc(metricNames[key])+'</dt><dd>'+esc(row.result.scores[key]??'Unavailable')+'</dd>').join('')+'</dl><p>Rubric: '+esc(row.result.rubric.id+' · '+row.result.rubric.version)+'</p>':'<p>'+esc(row.error||'Pending')+'</p>')+(attempt.canManage&&['reserved','started'].includes(row.state)?'<button data-speech-action="cancel-text" data-id="'+esc(row.id)+'">Cancel text review</button>':'')+'</section>').join('');
        node.querySelector('.detail').append(panel);
      }
    });
    clearTimeout(pollTimer);if(state?.history.attempts.some(attempt=>['queued','analyzing'].includes(attempt.state))||[...(state?.textReviews?.values()||[])].some(item=>item.reviews.some(row=>['reserved','started'].includes(row.state))))pollTimer=setTimeout(()=>run(async()=>{await load();renderPage();}),1200);
  }
  async function start(){
    if(!selected())return;discard();const epoch=++captureEpoch,session=sessionKey();let stream,audio;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1},video:false});if(epoch!==captureEpoch||session!==sessionKey()){stream.getTracks().forEach(track=>track.stop());return;}
      audio=new AudioContext({sampleRate:24000});await audio.resume();if(epoch!==captureEpoch||session!==sessionKey()){stream.getTracks().forEach(track=>track.stop());await audio.close();return;}
      const source=audio.createMediaStreamSource(stream),processor=audio.createScriptProcessor(4096,1,1),chunks=[],limit=Math.min(selected().maxSeconds,Math.floor((10*1024*1024-44)/(audio.sampleRate*2)));let size=0;
      capture={stream,audio,source,processor,chunks,rate:audio.sampleRate,timer:setTimeout(stop,limit*1000)};
      processor.onaudioprocess=event=>{if(!capture)return;const samples=event.inputBuffer.getChannelData(0),remaining=audio.sampleRate*limit-size;if(remaining>0){chunks.push(samples.slice(0,remaining));size+=Math.min(samples.length,remaining);}};
      source.connect(processor);processor.connect(audio.destination);renderPage();
    }catch(error){cleanup();stream?.getTracks().forEach(track=>track.stop());await audio?.close().catch(()=>{});notify(error.name==='NotAllowedError'?'Microphone access was denied. Choose an audio file or grant access.':'Recording is unavailable. You can choose a WAV or MP3 file.');}
  }
  function stop(){if(!capture)return;const {chunks,rate}=capture;cleanup();blob=wav(chunks,rate);localUrl=URL.createObjectURL(blob);renderPage();}
  document.addEventListener('change',event=>{
    if(event.target.id==='speech-task'){run(async()=>{discard();trainingPlan=null;comparison=null;taskId=event.target.value;await load();renderPage();});}
    if(event.target.id==='speech-file'){const file=event.target.files[0];if(file){discard();if(file.size>10*1024*1024){notify('Maximum recording size is 10 MiB.');return;}blob=file;localUrl=URL.createObjectURL(file);renderPage();}}
    if(event.target.dataset.speechMetric!==undefined)chart(Number(event.target.dataset.speechMetric),event.target.value);
    if(event.target.id==='theme'&&document.querySelector('.speech-panel'))queueMicrotask(afterRender);
  });
  document.addEventListener('click',event=>{const button=event.target.closest('[data-speech-action]');if(!button)return;const {speechAction:action,id,teacher}=button.dataset;
    if(action==='record'){run(start);return;}if(action==='stop'){stop();return;}
    run(async()=>{
      if(action==='training'){const epoch=sessionKey(),plan=await api('/local/speech/attempts/'+id+'/training');if(epoch!==sessionKey())return;discard();trainingPlan=plan;comparison=null;taskId=plan.taskId;renderPage();return;}
      if(action==='end-training'){trainingPlan=null;comparison=null;renderPage();return;}
      if(action==='compare'){if(!trainingPlan)return;const epoch=sessionKey(),repeatId=document.querySelector('[data-speech-comparison]')?.value;comparison=null;const result=await api('/local/speech/attempts/'+trainingPlan.attemptId+'/compare?attemptId='+encodeURIComponent(repeatId||''));if(epoch!==sessionKey())return;comparison=result;renderPage();return;}
      if(action==='discard'){if(uploaded)await api('/local/media/'+uploaded.id,{});discard();renderPage();return;}
      if(action==='more'){const more=await api('/local/speech/tasks/'+taskId+'/history?before='+encodeURIComponent(JSON.stringify(state.history.next)));for(const attempt of more.attempts)if(attempt.state==='complete')state.textReviews.set(attempt.id,await api('/local/speech/attempts/'+attempt.id+'/text-reviews'));state.history={attempts:[...state.history.attempts,...more.attempts],next:more.next};renderPage();return;}
      if(action==='cancel-text'){await api('/local/speech/text-reviews/'+id+'/cancel',{});await load();renderPage();return;}
      if(action==='remove'&&!confirm('Delete this private attempt, its transcript and recording?'))return;
      await api('/local/speech/attempts/'+id+'/'+action,action==='revoke'?{teacherId:teacher}:{});await load();renderPage();
    });
  });
  document.addEventListener('submit',event=>{const form=event.target,kind=form.dataset.speechForm;if(!kind)return;event.preventDefault();const data=new FormData(form),id=form.dataset.id,epoch=sessionKey();
    run(async()=>{
      if(epoch!==sessionKey())return;
      if(kind==='analyze'){
        if(!blob||capture||data.get('consent')!=='on')throw Error('Choose a recording and explicitly allow analysis.');
        if(!uploaded){
          const mime=blob.type.split(';')[0]||(/\.mp3$/i.test(blob.name||'')?'audio/mpeg':'audio/wav');intent??={mutationId:crypto.randomUUID(),mime,name:'speech.'+(mime==='audio/mpeg'?'mp3':'wav')};
          uploadController=new AbortController();const response=await fetch(route('/local/speech/tasks/'+taskId+'/upload'),{method:'POST',headers:{'Content-Type':mime,'X-Upload-Metadata':encodeURIComponent(JSON.stringify(intent))},body:blob,signal:uploadController.signal}),result=await response.json();if(epoch!==sessionKey())return;if(!response.ok)throw Error(result.error);uploaded=result;
        }
        const attempt=await api('/local/speech/tasks/'+taskId+'/analyze',{mediaId:uploaded.id,consent:true});if(epoch!==sessionKey())return;if(trainingPlan)trainingPlan.repeatId=attempt.id;comparison=null;discard();
      }
      if(kind==='task'){
        const origin=lesson();if(context()?.lessonSpeech){const index=data.get('lessonContext'),selected=index!==null&&/^\d+$/.test(index)?state.contexts?.[Number(index)]:null;if(!selected)throw Error('Select a lesson word and meaning.');origin.cardId=selected.cardId;origin.senseId=selected.senseId;}
        await api('/local/speech/tasks',{...origin,mode:data.get('mode'),locale:data.get('locale'),prompt:data.get('prompt'),reference:data.get('reference').trim()||null,referenceMediaId:data.get('referenceMediaId').trim()||null,rubricId:state.rubrics[0].id,evaluation:data.get('evaluation'),languageReview:data.get('languageReview')==='on',level:null});
      }
      if(kind==='correct')await api('/local/speech/attempts/'+id+'/correct',{text:data.get('text')});
      if(kind==='confirm-text')await api('/local/speech/attempts/'+id+'/confirm-text',{transcriptRevision:Number(form.dataset.revision),consent:data.get('consent')==='on',...(form.dataset.retry?{retryOf:form.dataset.retry}:{})});
      if(kind==='share')await api('/local/speech/attempts/'+id+'/share',{teacherId:data.get('teacherId'),includeAudio:data.get('includeAudio')==='on',consent:data.get('consent')==='on'});
      await load();renderPage();
    });
  });
  function reset(){generation++;clearTimeout(pollTimer);discard();state=null;taskId='';contextKey='';trainingPlan=null;comparison=null;expandedAttempts.clear();}
  window.addEventListener('pagehide',reset);
  return {load,render,afterRender,reset,deactivate(){generation++;clearTimeout(pollTimer);document.querySelectorAll('.speech-panel audio').forEach(audio=>audio.pause());if(capture)cleanup();}};
}
