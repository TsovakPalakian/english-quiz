import {createProviderSettingsUI} from '/__local/provider-settings.js';
const status=await(await fetch('/__local/status')).json(),host=document.getElementById('local-provider-content');
const ui=createProviderSettingsUI({
  api:async(path,data)=>{
    const route=path.replace('/local/providers','/api/learning-workbench/settings/providers');
    const response=await fetch(route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
    const value=await response.json();if(!response.ok)throw Error(value.error||'Local provider request failed.');return value;
  },
  isDeveloper:()=>status.actor.role==='DEVELOPER',sessionKey:()=>status.actor.id,active:()=>true,
  renderPage:()=>{host.innerHTML=ui.render();host.querySelector('section')?.classList.add('on');ui.afterRender();if(status.externalCalls){const connection=host.querySelector('.attempt-meta dd:last-child');if(connection)connection.textContent=status.azure?'Azure pronunciation · consent required'+(status.gemini?'; Gemini generation · manual dispatch':''):'Gemini generation · manual dispatch; speech remains synthetic';}},notify:message=>{document.getElementById('local-provider-status').textContent=message;},
  actorName:id=>status.roles.find(row=>row.id===id)?.name||'Unknown',date:value=>new Date(value).toLocaleString('en-GB')
});
await ui.load();
if(status.gemini){
  const form=document.getElementById('local-gemini-step');
  form?.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const button=form.querySelector('button'),confirmation=form.elements.confirmed;
    button.disabled=true;confirmation.disabled=true;
    const notice=document.getElementById('local-provider-status');notice.textContent='Running one generation step…';
    try{
      const response=await fetch('/__local/gemini/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Generation step failed.');
      notice.textContent=result.performed?'Step finished. Remaining requests: '+result.remaining:'No queued jobs.';confirmation.checked=false;
    }catch(error){notice.textContent=error.message;}
    finally{button.disabled=false;confirmation.disabled=false;}
  });
}
