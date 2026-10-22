// Only served by the isolated loopback host, never included in the production build.
(async()=>{
  const status=await(await fetch('/__local/status')).json(),select=document.getElementById('local-workbench-role');
  for(const role of status.roles){const option=document.createElement('option');option.value=role.id;option.textContent=role.name+' · '+role.role;option.selected=role.id===status.actor.id;select.append(option);}
  if(status.actor.role==='DEVELOPER'){const link=document.createElement('a');link.href='/__local/providers';link.textContent='Providers';link.style.color='white';document.getElementById('local-workbench-toolbar').append(link);}
  if(['ADMIN','DEVELOPER'].includes(status.actor.role)){const link=document.createElement('a');link.href='/__local/video';link.textContent='AI video';link.style.color='white';document.getElementById('local-workbench-toolbar').append(link);}
  select.addEventListener('change',async()=>{
    select.disabled=true;
    try{const response=await fetch('/__local/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:select.value})});if(!response.ok)throw Error('Local role switch failed.');location.reload();}
    catch(error){select.disabled=false;select.setCustomValidity(error.message);select.reportValidity();}
  });
})();
