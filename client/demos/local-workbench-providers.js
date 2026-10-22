import {createProviderSettingsUI} from '/__local/provider-settings.js';
const status=await(await fetch('/__local/status')).json(),host=document.getElementById('local-provider-content');
const ui=createProviderSettingsUI({
  api:async(path,data)=>{
    const route=path.replace('/local/providers','/api/learning-workbench/settings/providers');
    const response=await fetch(route,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mutationId:crypto.randomUUID(),...data})});
    const value=await response.json();if(!response.ok)throw Error(value.error||'Local provider request failed.');return value;
  },
  isDeveloper:()=>status.actor.role==='DEVELOPER',sessionKey:()=>status.actor.id,active:()=>true,
  renderPage:()=>{host.innerHTML=ui.render();host.querySelector('section')?.classList.add('on');ui.afterRender();},notify:message=>{document.getElementById('local-provider-status').textContent=message;},
  actorName:id=>status.roles.find(row=>row.id===id)?.name||'Unknown',date:value=>new Date(value).toLocaleString('en-GB')
});
await ui.load();
