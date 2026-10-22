const api='/__local/video/api',status=document.getElementById('video-status');
let state,identity,controller,activeId,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function request(path,data){const response=await fetch(api+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),value=await response.json();if(!response.ok)throw Error(value.error||'Video request failed.');return value;}
async function refresh(){
  const expanded=new Set([...document.querySelectorAll('[data-video-job][open]')].map(node=>node.dataset.videoJob));state=await request('');
  const context=document.querySelector('#video-create select');context.innerHTML=state.contexts.map((row,index)=>'<option value="'+index+'">'+esc(row.label)+'</option>').join('');
  document.getElementById('video-create').querySelector('button').disabled=busy||state.provider==='off'||!state.quota.remaining;
  const settings=document.getElementById('video-provider');settings.hidden=identity.actor.role!=='DEVELOPER';settings.elements.provider.value=state.provider;settings.querySelector('button').disabled=busy;
  document.getElementById('video-quota').textContent='Local runs today: '+state.quota.used+' / '+state.quota.limit+' · '+(state.provider==='off'?'Off':'Synthetic fixture');
  document.getElementById('video-jobs').innerHTML=state.jobs.map(job=>{
    const own=job.ownerId===identity.actor.id,canRun=own&&!busy&&state.provider!=='off'&&['queued','failed'].includes(job.state)&&job.attempts<2&&state.quota.remaining;
    return '<details data-video-job="'+job.id+'" '+(expanded.has(job.id)?'open':'')+'><summary><b>drizzle · Video choice</b> · '+esc(job.state)+' · '+esc(job.ownerName)+'</summary><p>Procedural rain fixture, not AI · attempt '+job.attempts+' / 2</p>'+(job.issue?'<p>'+esc(job.issue)+'</p>':'')+'<div class="video-actions">'+(canRun?'<button class="btn" data-video-action="run" data-id="'+job.id+'">Run local simulation</button>':'')+(own&&['queued','running','failed'].includes(job.state)?'<button class="btn" data-video-action="cancel" data-id="'+job.id+'">Cancel job</button>':'')+'</div>'+(job.mediaId?'<video controls playsinline preload="metadata" src="/api/learning-workbench/media/'+job.mediaId+'"></video><p>Submitted for teacher review. Not automatically approved.</p>':'')+'<details><summary>State history</summary><ol>'+job.history.map(event=>'<li>'+esc(new Date(event.at).toLocaleString('en-GB'))+' · '+esc(event.state)+(event.issue?' · '+esc(event.issue):'')+'</li>').join('')+'</ol></details></details>';
  }).join('')||'<p>No video jobs.</p>';
}
async function renderRain(signal){
  const type='video/mp4;codecs=avc1.42001E';if(!window.MediaRecorder?.isTypeSupported(type))throw Error('This browser cannot encode the local MP4 fixture. No cloud fallback.');
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;
  const ctx=canvas.getContext('2d'),stream=canvas.captureStream(20),chunks=[],recorder=new MediaRecorder(stream,{mimeType:type});
  let interval,timer,abort;
  try{return await new Promise((resolve,reject)=>{
    let frame=0;
    const draw=()=>{ctx.fillStyle='#c6d5d8';ctx.fillRect(0,0,480,270);ctx.fillStyle='#597969';ctx.fillRect(0,220,480,50);ctx.fillStyle='#76888c';ctx.fillRect(310,120,90,100);ctx.strokeStyle='#497c95';ctx.lineWidth=1.5;for(let n=0;n<70;n++){const x=(n*71+frame*2)%480,y=(n*43+frame*7)%230;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+9);ctx.stroke();}frame++;};
    abort=()=>{if(recorder.state==='recording')recorder.stop();reject(new DOMException('Local rendering cancelled.','AbortError'));};
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onerror=()=>reject(Error('Local video encoding failed.'));
    recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/mp4'}));draw();recorder.start();interval=setInterval(draw,50);timer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},2000);
  });}finally{clearInterval(interval);clearTimeout(timer);signal.removeEventListener('abort',abort);stream.getTracks().forEach(track=>track.stop());}
}
async function run(id){
  if(busy)return;const job=state.jobs.find(job=>job.id===id);busy=true;activeId=id;controller=new AbortController();let started;
  try{
    started=await request('/jobs/'+id+'/start',{expectedRevision:job.revision});await refresh();
    status.textContent='Rendering a synthetic local rain clip...';const clip=await renderRain(controller.signal);if(controller.signal.aborted)return;
    status.textContent='Validating MP4 and submitting for teacher review...';
    const response=await fetch(api+'/jobs/'+id+'/finish',{method:'POST',headers:{'Content-Type':'video/mp4','X-Video-Revision':String(started.revision)},body:clip}),value=await response.json();if(!response.ok)throw Error(value.error);
    status.textContent='Video choice submitted for teacher review. No automatic approval.';
  }catch(error){if(!controller.signal.aborted){status.textContent=error.message;if(started)try{await request('/jobs/'+id+'/failed',{expectedRevision:started.revision});}catch{}}}
  finally{busy=false;controller=null;activeId=null;await refresh();}
}
document.getElementById('video-create').addEventListener('submit',async event=>{event.preventDefault();try{const context=state.contexts[Number(event.target.elements.context.value)];await request('/jobs',{mutationId:crypto.randomUUID(),groupId:context.groupId,lessonId:context.lessonId,cardId:context.cardId,senseId:context.senseId});await refresh();}catch(error){status.textContent=error.message;}});
document.getElementById('video-provider').addEventListener('submit',async event=>{event.preventDefault();try{await request('/settings',{provider:event.target.elements.provider.value,expectedRevision:state.revision});await refresh();}catch(error){status.textContent=error.message;}});
document.getElementById('video-refresh').onclick=()=>refresh().catch(error=>{status.textContent=error.message;});
document.getElementById('video-jobs').addEventListener('click',async event=>{
  const button=event.target.closest('[data-video-action]');if(!button)return;const id=button.dataset.id;
  if(button.dataset.videoAction==='run'){await run(id);return;}
  try{const job=state.jobs.find(job=>job.id===id);await request('/jobs/'+id+'/cancel',{expectedRevision:job.revision});if(id===activeId)controller?.abort();status.textContent='Job cancelled.';await refresh();}catch(error){status.textContent=error.message;}
});
window.addEventListener('pagehide',()=>controller?.abort());
try{identity=await(await fetch('/__local/status')).json();await refresh();}catch(error){status.textContent=error.message;}
