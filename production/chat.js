(() => {
  'use strict';
  const section=document.getElementById('messages');if(!section)return;
  const el=id=>document.getElementById(id),timeline=el('msgTimeline'),composer=el('msgText');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>'<i data-lucide="'+name+'"></i>';
  const icons=()=>window.lucide?.createIcons({root:document});
  const signedIn=()=>typeof authUser!=='undefined'?authUser:null;
  let databaseResetting=false;
  const current=()=>!databaseResetting&&signedIn()&&!(typeof viewAccount!=='undefined'&&viewAccount)?signedIn():null;
  const reviewer=()=>['ADMIN','DEVELOPER'].includes(current()?.role);
  const active=()=>section.classList.contains('on');
  const initials=name=>String(name||'?').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const avatar=(name,group=false,subject='')=>'<span class="chat-avatar"'+(subject?' data-avatar-subject="'+escape(subject)+'" data-avatar-name="'+escape(name)+'" data-avatar-group="'+group+'"':'')+'>'+(group?icon('users-round'):escape(initials(name)))+'</span>';
  let profileViews=Object.create(null),profileRequested=new Set(),profileFrame=0,interactiveAccount='';
  const dateLabel=value=>{if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value.split('-').reverse().join('.');const d=new Date(value);return [String(d.getDate()).padStart(2,'0'),String(d.getMonth()+1).padStart(2,'0'),d.getFullYear()].join('.');};
  const birthdayIso=value=>value.trim().split('.').reverse().join('-');
  const stamp=ms=>{const date=new Date(ms);return dateLabel(ms)+' '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.'+String(date.getMilliseconds()).padStart(3,'0');};
  const time=ms=>new Date(ms).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
  const emojiSegmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
  function emojiParts(m){
    if(!emojiSegmenter||m.deleted||m.files?.length||m.examId||m.forwarded||m.replyTo)return [];
    const parts=[...emojiSegmenter.segment(String(m.text||'').trim())].map(p=>p.segment).filter(p=>!/^\s+$/u.test(p));
    const emoji=/^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0E\uFE0F]?[\p{Emoji_Modifier}]?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?[\p{Emoji_Modifier}]?)*)$/u;
    return parts.length<=48&&parts.every(p=>emoji.test(p))?parts:[];
  }
  let account='',signature='',generation=0,socket=null,seq=0,reconnectTimer,reconnectCount=0,ready=false,room='',kind='personal',rightMode='',unreadOnly=false,examDirty=false,catalogVersion=0;
  let data={rooms:[],contacts:[],groups:[],unread:{personal:0,learning:0},total:0},prefs={},reply=null,pending=null,files=[],format=null,busy=false,loading=0,searchToken=0,searchBefore=0,searchTimer,readTimer,listMode='chats',emojiMode='';
  let recorder=null,recordTimer,recordProgressTimer,recordMode='audio',recordGesture=null,recordUploading=false;
  let contextMessage=null,contextRoom='',selection=new Set(),selecting=false;
  let inputFrame=0,inputBase=0,uploadQueue=Promise.resolve(),dragDepth=0,stickBottom=true;
  const uploads=new Map(),chatCenter=section.querySelector('.chat-center');
  const requests=new Map(),historyCache=new Map(),cursors=new Map(),membersCache=new Map(),previewCache=new Map();
  function scheduleProfiles(){
    if(profileFrame)return;profileFrame=requestAnimationFrame(async()=>{
      profileFrame=0;markAccountProfiles();paintProfiles();if(!ready)return;
      const ids=[...new Set([...data.contacts.map(p=>p.id),...data.rooms.map(r=>r.kind==='group'?r.id:r.peerId),...[...document.querySelectorAll('[data-avatar-subject]')].map(n=>n.dataset.avatarSubject)])].filter(id=>id&&!profileRequested.has(id)),gen=generation;
      for(let i=0;i<ids.length;i+=100){const batch=ids.slice(i,i+100);batch.forEach(id=>profileRequested.add(id));try{const result=await request('profiles',{ids:batch});if(gen!==generation)return;let changed=false;for(const profile of result.profiles||[]){changed||=(profileViews[profile.id]?.username||'')!==(profile.username||'');profileViews[profile.id]=profile;}paintProfiles();if(changed)paintRooms();}catch{batch.forEach(id=>profileRequested.delete(id));}}
    });
  }
  function markAccountProfiles(){
    const brand= document.querySelector('.brand-account'),owner=signedIn();
    if(brand&&brand.dataset.owner!==(owner?.id||'guest')){brand.dataset.owner=owner?.id||'guest';brand.innerHTML=avatar(owner?.name||owner?.login||'?',false,owner?.id||'');}
    const person=typeof viewAccount!=='undefined'&&viewAccount?viewAccount:signedIn();
    if(person)for(const id of ['accountBody','profileBody']){
      const root=el(id),entry=root?.querySelector('.entry');if(!entry)continue;
      if(!root.querySelector('.account-avatar-row')){const row=document.createElement('div');row.className='account-avatar-row';row.innerHTML=avatar(person.name||person.login,false,person.id)+'<span data-presence-subject="'+escape(person.id)+'"></span>'+(person.id===signedIn()?.id?'<button type="button" class="btn" data-avatar-upload="'+escape(person.id)+'">Upload photo</button>':'');entry.before(row);}
    }
    document.querySelectorAll('#admin [data-account="user"][data-id]').forEach(node=>{
      if(node.querySelector('[data-avatar-subject]'))return;node.insertAdjacentHTML('afterbegin',avatar(node.querySelector('b')?.textContent||'?',false,node.dataset.id));
    });
    const detail=el('adminUser'),button=detail?.querySelector('[data-account][data-id]'),heading=detail?.querySelector('.stat-kicker');
    if(button&&heading&&!detail.querySelector('.account-avatar-row'))heading.insertAdjacentHTML('afterend','<div class="account-avatar-row">'+avatar(heading.textContent,false,button.dataset.id)+'<span data-presence-subject="'+escape(button.dataset.id)+'"></span></div>');
  }
  function paintProfiles(){
    document.querySelectorAll('[data-avatar-subject]').forEach(node=>{
      const id=node.dataset.avatarSubject,p=profileViews[id],group=id.startsWith('group:'),url=p?.avatarUrl?.startsWith('/api/messages/avatar?')?p.avatarUrl:'',state=url+'|'+(p?p.online?'online':'offline':'unknown')+'|'+node.dataset.avatarName;
      if(node.dataset.avatarState===state&&(!p||group||node.querySelector('.chat-presence'))&&(!url||node.querySelector('img')))return;node.dataset.avatarState=state;
      node.innerHTML=(url?'<img src="'+escape(url)+'" alt="'+escape(node.dataset.avatarName||'Avatar')+'">':group?icon('users-round'):escape(initials(node.dataset.avatarName)))+(!group&&p?'<span class="chat-presence'+(p.online?' is-online':'')+'" aria-label="'+(p.online?'Online':'Offline')+'"></span>':'');
      node.title=group?'Group photo':(p?p.online?'Online':'Offline':'Status unavailable');node.classList.toggle('has-avatar-photo',!!url);if(url&&!node.closest('.brand-account')){node.setAttribute('role','button');node.tabIndex=0;}else{node.removeAttribute('role');node.removeAttribute('tabindex');}if(group&&!url)window.lucide?.createIcons({root:node});
    });
    document.querySelectorAll('[data-presence-subject]').forEach(node=>{const p=profileViews[node.dataset.presenceSubject],label=p?p.online?'Online':'Offline':'Status unavailable';if(node.textContent!==label)node.textContent=label;});
    document.querySelectorAll('[data-profile-details-subject]').forEach(node=>{const p=profileViews[node.dataset.profileDetailsSubject],html=(p?.username?'<span>'+escape(p.username)+'</span>':'')+(p?.phone?'<span>Phone: '+escape(p.phone)+'</span>':'')+(p?.birthday?'<span>Birthday: '+escape(dateLabel(p.birthday))+'</span>':'');if(node.innerHTML!==html)node.innerHTML=html;});
  }
  function openAvatar(subject){
    const url=profileViews[subject]?.avatarUrl;if(!url?.startsWith('/api/messages/avatar?'))return;
    const node=dialog('Photo','<img class="chat-avatar-full" src="'+escape(url)+'" alt="Profile photo">');node.classList.add('chat-avatar-dialog');node.style.maxWidth='min(92vw,1000px)';
    node.addEventListener('click',event=>{const r=node.getBoundingClientRect();if(event.target===node&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))node.close();});
  }
  function editAvatar(bitmap){
    return new Promise(resolve=>{
      const node=dialog('Edit photo','<canvas class="chat-photo-crop" width="360" height="360" aria-label="Move photo inside the avatar circle"></canvas><div class="chat-photo-tools"><button type="button" class="chat-icon" data-crop-rotate title="Rotate" aria-label="Rotate">'+icon('rotate-cw')+'</button><button type="button" class="chat-icon" data-crop-flip title="Mirror" aria-label="Mirror">'+icon('flip-horizontal')+'</button><button type="button" class="chat-icon" data-crop-reset title="Reset" aria-label="Reset">'+icon('rotate-ccw')+'</button><label>Zoom<input type="range" min="1" max="4" step="0.01" value="1" data-crop-zoom></label></div><div class="chat-photo-actions"><button type="button" class="chat-link" data-crop-cancel>Cancel</button><button type="button" class="primary" data-crop-done>Done</button></div>');
      node.classList.add('chat-photo-editor');let rotation=0,mirror=1,zoom=1,x=0,y=0,drag=null,result=null;
      const canvas=node.querySelector('canvas'),context=canvas.getContext('2d'),slider=node.querySelector('[data-crop-zoom]'),size=360,diameter=320;
      const scale=()=>zoom*Math.max(diameter/(rotation%180?bitmap.height:bitmap.width),diameter/(rotation%180?bitmap.width:bitmap.height));
      function draw(target=context,output=360,mask=true){
        const s=scale(),w=(rotation%180?bitmap.height:bitmap.width)*s,h=(rotation%180?bitmap.width:bitmap.height)*s;
        x=Math.max(-(w-diameter)/2,Math.min((w-diameter)/2,x));y=Math.max(-(h-diameter)/2,Math.min((h-diameter)/2,y));
        target.clearRect(0,0,output,output);target.save();target.scale(output/(mask?size:diameter),output/(mask?size:diameter));target.fillStyle='#fff';target.fillRect(0,0,mask?size:diameter,mask?size:diameter);target.translate((mask?size:diameter)/2+x,(mask?size:diameter)/2+y);target.rotate(rotation*Math.PI/180);target.scale(mirror*s,s);target.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);target.restore();
        if(mask){target.fillStyle='rgba(0,0,0,.65)';target.beginPath();target.rect(0,0,size,size);target.arc(size/2,size/2,diameter/2,0,Math.PI*2,true);target.fill('evenodd');target.strokeStyle='rgba(255,255,255,.65)';target.lineWidth=1;target.beginPath();target.arc(size/2,size/2,diameter/2,0,Math.PI*2);target.stroke();}
      }
      slider.oninput=()=>{zoom=Number(slider.value);draw();};
      node.querySelector('[data-crop-rotate]').onclick=()=>{rotation=(rotation+90)%360;x=y=0;draw();};node.querySelector('[data-crop-flip]').onclick=()=>{mirror*=-1;draw();};node.querySelector('[data-crop-reset]').onclick=()=>{rotation=0;mirror=zoom=1;x=y=0;slider.value='1';draw();};
      canvas.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,y:event.clientY,offsetX:x,offsetY:y};canvas.setPointerCapture(event.pointerId);};
      canvas.onpointermove=event=>{if(!drag)return;const ratio=size/canvas.getBoundingClientRect().width;x=drag.offsetX+(event.clientX-drag.x)*ratio;y=drag.offsetY+(event.clientY-drag.y)*ratio;draw();};
      canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=null;};
      canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(1,Math.min(4,zoom-event.deltaY*.002));slider.value=String(zoom);draw();},{passive:false});
      node.querySelector('[data-crop-cancel]').onclick=()=>node.close();node.querySelector('[data-crop-done]').onclick=()=>{const output=document.createElement('canvas');output.width=output.height=1024;draw(output.getContext('2d'),1024,false);result=output;node.close();};
      node.addEventListener('close',()=>resolve(result),{once:true});draw();icons();
    });
  }
  async function uploadAvatar(subject,file){
    if(!file)return;const gen=generation;if(file.size>25*1024*1024)throw new Error('Maximum file size is 25 MB.');
    let source=file;if(/\.(heic|heif)$/i.test(file.name)||/image\/hei[cf]/i.test(file.type)){const module=await import('/heic-to-1.6.6.js');source=await module.heicTo({blob:file,type:'image/jpeg',quality:.9});}
    const bitmap=await createImageBitmap(source);let canvas;try{canvas=await editAvatar(bitmap);}finally{bitmap.close();}if(!canvas||gen!==generation)return;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.85));if(!blob||blob.size>2*1024*1024)throw new Error('Photo is too large. Choose a smaller image.');if(gen!==generation)return;
    const response=await fetch('/api/messages/avatar?subject='+encodeURIComponent(subject),{method:'POST',credentials:'same-origin',headers:{'Content-Type':blob.type},body:blob}),result=await response.json();if(!response.ok)throw new Error(result.error||'Photo upload failed.');if(gen!==generation)return;profileViews[result.profile.id]=result.profile;scheduleProfiles();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-profile-edit]')){settings();return;}
    const upload=event.target.closest('[data-avatar-upload]');if(upload){const input=document.createElement('input');input.type='file';input.accept='image/*,.heic,.heif';input.onchange=async()=>{upload.disabled=true;try{await uploadAvatar(upload.dataset.avatarUpload,input.files[0]);}catch(error){dialog('Photo upload','<p>'+escape(error.message||'Unsupported image format.')+'</p>');}finally{upload.disabled=false;}};input.click();return;}
    const node=event.target.closest('[data-avatar-subject].has-avatar-photo');if(!node||node.closest('.brand-account'))return;event.preventDefault();event.stopImmediatePropagation();openAvatar(node.dataset.avatarSubject);
  },true);
  document.addEventListener('keydown',event=>{const node=event.target.closest('[data-avatar-subject].has-avatar-photo');if(node&&!node.closest('.brand-account')&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();openAvatar(node.dataset.avatarSubject);}},true);
  const key=()=>room+':'+kind;
  const draftKey=()=> 'english-chat-draft-v1:'+account+':'+room;
  const state=()=>historyCache.get(key());
  const findMessage=id=>(state()?.rows||[]).find(m=>m.id===id)||(historyCache.get(room+':personal')?.rows||[]).find(m=>m.id===id)||(historyCache.get(room+':learning')?.rows||[]).find(m=>m.id===id);
  const bottom=()=>timeline.scrollHeight-timeline.scrollTop-timeline.clientHeight<60;
  timeline.addEventListener('scroll',()=>{if(bottom())stickBottom=true;},{passive:true});
  timeline.addEventListener('wheel',event=>{if(event.deltaY<0)stickBottom=false;},{passive:true});
  let touchY;
  timeline.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY;},{passive:true});
  timeline.addEventListener('touchmove',event=>{const y=event.touches[0]?.clientY;if(y>touchY)stickBottom=false;touchY=y;},{passive:true});
  timeline.addEventListener('keydown',event=>{if(['ArrowUp','PageUp','Home'].includes(event.key))stickBottom=false;});
  const timelineResize=new ResizeObserver(()=>{if(stickBottom)timeline.scrollTop=timeline.scrollHeight;});
  timelineResize.observe(timeline);
  function status(text){el('msgStatus').textContent=text;el('msgStatus').hidden=!text;}
  document.addEventListener('pointerdown',event=>{const notice=el('msgStatus');if(!notice.hidden&&!notice.contains(event.target))status('');},{capture:true,passive:true});
  function savePrefs(){try{localStorage.setItem('english-chat-settings:'+account,JSON.stringify(prefs));}catch{}}
  function remember(){scheduleInputFit();if(!account||!room)return;try{localStorage.setItem(draftKey(),JSON.stringify({text:composer.value,format,pending,reply,files}));}catch{}}
  function scheduleInputFit(){if(inputFrame)return;inputFrame=requestAnimationFrame(()=>{inputFrame=0;fitInput();});}
  function fitInput(){
    if(!active())return;if(el('msgCompose').hidden){section.style.setProperty('--chat-composer-offset','16px');return;}
    const rich=composer.parentElement.querySelector('.text-color-rich:not([hidden])'),input=rich||composer,style=getComputedStyle(composer);
    if(!inputBase)inputBase=Math.max(58,(parseFloat(style.lineHeight)||24)*2+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0));
    const form=el('msgCompose'),formStyle=getComputedStyle(form),fixed=[...chatCenter.children].filter(n=>n!==form&&n!==timeline&&getComputedStyle(n).position!=='absolute').reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);
    const overhead=el('msgReply').getBoundingClientRect().height+el('msgAttachments').getBoundingClientRect().height+(el('msgCompose').querySelector('.chat-record-frame:not([hidden])')?.getBoundingClientRect().height||0)+el('msgCompose').querySelector('.chat-compose-tools').getBoundingClientRect().height+(parseFloat(formStyle.paddingTop)||0)+(parseFloat(formStyle.paddingBottom)||0)+(parseFloat(formStyle.marginBottom)||0)+10;
    const maximum=Math.min(inputBase*4,Math.max(inputBase,chatCenter.clientHeight-fixed-overhead-Math.min(100,chatCenter.clientHeight*.2))),wasBottom=stickBottom||bottom(),scroll=input.scrollTop;
    input.style.minHeight=inputBase+'px';input.style.maxHeight=maximum+'px';input.style.height='auto';input.style.height=Math.min(maximum,Math.max(inputBase,input.scrollHeight))+'px';input.scrollTop=scroll;section.style.setProperty('--chat-composer-offset',Math.ceil(form.getBoundingClientRect().height+(parseFloat(formStyle.marginBottom)||0)+12)+'px');if(wasBottom)timeline.scrollTop=timeline.scrollHeight;
  }
  function focusComposer(){const rich=composer.parentElement.querySelector('.text-color-rich:not([hidden])');(rich||composer).focus();}
  window.TextColors?.mount(composer,{onChange:value=>{format=value;remember();}});
  const colorTools=composer.parentElement.querySelector('.text-color-tools');
  if(colorTools)el('msgStickers').after(colorTools);
  function loadDraft(){let saved={};try{saved=JSON.parse(localStorage.getItem(draftKey())||'{}');}catch{}composer.value=saved.text||'';format=saved.format||null;pending=saved.pending||null;reply=saved.reply||null;files=saved.files||[];window.TextColors?.sync(composer,format);paintDraft();}
  function paintDraft(){
    if(pending&&pending.quote===undefined)pending.quote=null;
    el('msgReply').hidden=!reply;el('msgReply').innerHTML=reply?'<span>'+escape(reply.sender)+': '+escape(reply.text?.slice(0,160))+'</span><button type="button" class="chat-icon" data-msg-cancel-reply title="Cancel reply" aria-label="Cancel reply">'+icon('x')+'</button>':'';
    el('msgAttachments').replaceChildren();paintUploads();scheduleInputFit();icons();
  }
  function request(action,body={}){
    if(!ready||socket?.readyState!==WebSocket.OPEN)return Promise.reject(new Error('Chat is reconnecting. Your draft is saved.'));
    const requestId=crypto.randomUUID(),gen=generation;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(requestId);reject(new Error('No acknowledgement yet. Retry safely.'));},20000);requests.set(requestId,{resolve,reject,timer,gen});socket.send(JSON.stringify({requestId,action,body}));});
  }
  function disconnect(){clearTimeout(reconnectTimer);ready=false;const old=socket;socket=null;old?.close();for(const p of requests.values()){clearTimeout(p.timer);p.reject(new Error('Connection interrupted. Your draft is saved.'));}requests.clear();}
  function connect(){
    if(!signedIn()||socket||!account)return;clearTimeout(reconnectTimer);const gen=generation;
    status('Connecting...');const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/messages/socket?after='+seq);socket=ws;
    ws.onmessage=event=>{
      if(socket!==ws||gen!==generation)return;
      let value;try{value=JSON.parse(event.data);}catch{return;}
      if(value.type==='response'){const p=requests.get(value.requestId);if(!p)return;clearTimeout(p.timer);requests.delete(value.requestId);if(value.error)p.reject(new Error(value.error));else p.resolve(value.result);}
      else if(value.type==='snapshot'){
        profileRequested.clear();Object.assign(profileViews,value.data.profiles||{});
        const reconnect=ready;ready=true;reconnectCount=0;data=value.data;if((data.catalogVersion||0)!==catalogVersion){catalogVersion=data.catalogVersion||0;examDirty=true;}seq=Math.max(seq,data.seq||0);status('');paintRooms();badge();
        if(room&&!data.rooms.some(row=>row.id===room)){room='';timeline.replaceChildren();paintRooms();}
        if(active()&&room){if(reconnect||state()?.loaded)history({refresh:true}).catch(error=>status(error.message));else history().catch(error=>status(error.message));}
        else if(active()&&!room){let saved;try{saved=sessionStorage.getItem('enquiz-chat-room:'+account);}catch{}if(data.rooms.some(row=>row.id===saved))openRoom(saved).catch(error=>status(error.message));}
        acknowledgeSnapshot();
      }else if(value.type==='event'){seq=Math.max(seq,value.seq||0);receive(value.event);}
    };
    ws.onclose=()=>{if(socket!==ws||gen!==generation)return;disconnect();void window.DatabaseContext?.check?.();if(!signedIn())return;status('Connection interrupted. Reconnecting...');if(reconnectCount>=8){status('Chat unavailable. Click Chats to reconnect.');return;}const delay=Math.min(30000,700*2**reconnectCount++)+Math.random()*300;reconnectTimer=setTimeout(connect,delay);};
    ws.onerror=()=>{if(socket===ws)status('Unable to connect. Your draft is saved.');};
  }
  function upsertRoom(row){if(!row)return;const old=data.rooms.find(r=>r.id===row.id);if(old&&(old.revision||0)>(row.revision||0))return;if(old)Object.assign(old,row);else data.rooms.push(row);}
  function badge(){
    const unread={personal:0,learning:0};for(const r of data.rooms)for(const c of ['personal','learning'])unread[c]+=r.unread?.[c]||0;data.unread=unread;data.total=unread.personal+unread.learning;
    document.querySelectorAll('[data-exam-unread]').forEach(node=>node.remove());
    document.querySelectorAll('[data-jump="account"]:not(.brand-account)').forEach(button=>{button.textContent='Settings'+(data.total?' \u00b7 '+data.total:'');});
    document.querySelectorAll('[data-msg-open]').forEach(button=>{button.textContent='Messages'+(data.total?' \u00b7 '+data.total:'');button.hidden=!current();});
    section.querySelectorAll('[data-msg-category]').forEach(button=>{const c=button.dataset.msgCategory;button.textContent=(c==='learning'?'Study alerts':'Personal')+(unread[c]?' \u00b7 '+unread[c]:'');button.classList.toggle('on',listMode==='chats'&&c===kind);button.setAttribute('aria-selected',String(listMode==='chats'&&c===kind));});
    el('msgContactsTab').classList.toggle('on',listMode==='contacts');el('msgContactsTab').setAttribute('aria-selected',String(listMode==='contacts'));
  }
  function paintRooms(){
    scheduleProfiles();
    const query=el('msgRoomSearch').value.trim().toLocaleLowerCase(),rows=data.rooms.filter(r=>(kind==='personal'||r.has?.learning)&&(!unreadOnly||r.unread?.[kind])&&(!query||(r.title+' '+(profileViews[r.peerId]?.username||'')+' '+(r.lastMessage?.text||'')).toLocaleLowerCase().includes(query))).sort((a,b)=>(b.lastMessage?.createdMs||0)-(a.lastMessage?.createdMs||0));
    let html=rows.length?rows.map(r=>'<button type="button" class="msg-room'+(r.id===room?' on':'')+'" data-msg-room="'+escape(r.id)+'">'+avatar(r.title,r.kind==='group',r.kind==='group'?r.id:r.peerId)+'<span class="chat-room-copy"><span class="chat-room-top"><b>'+escape(r.title)+'</b><time>'+(r.lastMessage?escape(new Date(r.lastMessage.createdMs).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'')+'</time></span><span class="chat-room-preview">'+(r.unread?.[kind]?'<span class="chat-counter">'+r.unread[kind]+'</span>':'')+escape(r.lastMessage?.text|| (r.kind==='group'?'Group chat':'Private conversation'))+'</span></span></button>').join(''):'<div class="chat-empty">No conversations here yet.</div>';
    if(listMode==='contacts'){const contacts=data.contacts.filter(p=>!query||(p.name+' '+p.role+' '+(profileViews[p.id]?.username||'')).toLocaleLowerCase().includes(query));html=contacts.map(p=>'<button type="button" class="chat-contact" data-contact-id="'+escape(p.id)+'">'+avatar(p.name,false,p.id)+'<span><strong>'+escape(p.name)+'</strong><small>'+escape(profileViews[p.id]?.username||p.role)+'</small></span></button>').join('')||'<div class="chat-empty">No contacts found.</div>';}
    el('msgListTitle').textContent=listMode==='contacts'?'Contacts':'Chats';el('msgRoomSearch').placeholder=listMode==='contacts'?'Name, full email or login':'Chats, contacts';el('msgLookup').hidden=listMode!=='contacts';el('msgUnread').hidden=listMode==='contacts';el('msgChats').classList.toggle('selected',listMode==='chats');el('msgContacts').classList.toggle('selected',listMode==='contacts');
    if(el('msgRooms').dataset.renderedHtml!==html){el('msgRooms').innerHTML=html;el('msgRooms').dataset.renderedHtml=html;}
    const selected=data.rooms.find(r=>r.id===room);el('msgRoomTitle').textContent=selected?.title||'Messages';el('msgRoomSubtitle').textContent=selected?(selected.kind==='group'?selected.members+' members':'Private conversation'):'Choose a conversation';
    if(listMode==='contacts')el('msgRoomSearch').placeholder='Name, email, login or @username';el('msgLookup').textContent='Find by email, login or @username';
    const face=el('msgRoomAvatar'),subject=selected?(selected.kind==='group'?selected.id:selected.peerId):'',name=selected?.title||'Messages';
    if(face.dataset.avatarSubject!==subject||face.dataset.avatarName!==name){face.innerHTML=selected?.kind==='group'?icon('users-round'):escape(initials(name));face.dataset.avatarSubject=subject;face.dataset.avatarName=name;delete face.dataset.avatarState;}
    el('msgAssign').hidden=!reviewer();el('msgCompose').hidden=!selected||selected.access?.canSend===false||kind==='learning'&&!reviewer();el('msgSearch').disabled=!selected;el('msgInfo').disabled=!selected;el('msgRoomInfo').disabled=!selected;
    const access=selected?.access;el('msgAccess').hidden=!access||access.protected||access.state==='accepted'&&!access.blocked;
    el('msgAccess').innerHTML=!access?'':access.blocked?(access.blockedByMe?'You blocked this person. <button type="button" data-relation="unblock">Unblock</button>':'This conversation is blocked.'):access.canAccept?'Message request <button type="button" data-relation="accept">Accept</button><button type="button" data-relation="reject">Decline</button><button type="button" data-relation="block">Block</button>':access.state==='pending'?'Waiting for this person to accept your message request.':access.state==='rejected'?'The message request was declined.':'Your first message will be sent as a request. Wait for acceptance before sending more.';
    const pinned=selected?.pinned;el('msgPinned').hidden=!pinned;el('msgPinned').innerHTML=pinned?icon('pin')+' '+escape(pinned.text||'Attachment'):'';scheduleInputFit();icons();
  }
  function panel(which,show){
    if(which==='left'){prefs.left=show;el('msgRooms').closest('.chat-list').hidden=!show;el('msgListBack').hidden=show;if(show&&innerWidth<=700)panel('right',false);}
    else{prefs.right=show;el('msgRight').hidden=!show;if(show&&innerWidth<=700)panel('left',false);}
    savePrefs();
    fitPanels();
  }
  function fitPanels(){
    const narrow=innerWidth<=700,left=section.querySelector('.chat-list'),right=el('msgRight'),rail=section.querySelector('.chat-rail').getBoundingClientRect().width,budget=Math.max(240,section.querySelector('.chat-shell').clientWidth-rail-360);
    let lw=Math.min(prefs.leftWidth|| (innerWidth>1380?400:innerWidth>1050?320:300),Math.max(80,budget)),rw=Math.min(prefs.rightWidth|| (innerWidth>1380?400:innerWidth>1050?320:360),Math.max(240,budget));
    if(innerWidth>1050&&!left.hidden&&!right.hidden&&lw+rw>budget){const ratio=budget/(lw+rw);lw=Math.max(240,Math.floor(lw*ratio));rw=Math.max(240,budget-lw);}
    left.classList.toggle('is-compact',!narrow&&lw<180);left.style.width=narrow?'':lw+'px';left.style.flexBasis=narrow?'':lw+'px';right.style.width=narrow?'':rw+'px';right.style.flexBasis=narrow?'':rw+'px';
    for(const [id,node,width] of [['msgResizeLeft',left,lw],['msgResizeRight',right,rw]]){const handle=el(id);handle.hidden=narrow||node.hidden||id==='msgResizeRight'&&innerWidth<=1050;handle.setAttribute('aria-valuemin',id==='msgResizeLeft'?'80':'240');handle.setAttribute('aria-valuemax',String(Math.max(240,budget)));handle.setAttribute('aria-valuenow',String(Math.round(width)));}
    scheduleInputFit();
  }
  for(const [id,name,side] of [['msgResizeLeft','leftWidth',1],['msgResizeRight','rightWidth',-1]]){
    const handle=el(id);let drag;
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,width:side===1?section.querySelector('.chat-list').getBoundingClientRect().width:el('msgRight').getBoundingClientRect().width};handle.setPointerCapture(event.pointerId);section.classList.add('is-resizing');};
    handle.onpointermove=event=>{if(!drag)return;prefs[name]=Math.max(id==='msgResizeLeft'?80:240,Math.min(640,drag.width+side*(event.clientX-drag.x)));fitPanels();};
    const end=()=>{if(!drag)return;drag=null;section.classList.remove('is-resizing');savePrefs();};handle.onpointerup=end;handle.onpointercancel=end;handle.onlostpointercapture=end;
    handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const min=id==='msgResizeLeft'?80:240;prefs[name]=event.key==='Home'?min:event.key==='End'?640:Math.max(min,Math.min(640,Number(handle.getAttribute('aria-valuenow'))+(event.key==='ArrowRight'?1:-1)*side*(event.shiftKey?40:10)));fitPanels();savePrefs();};
  }
  let lastAlert = 0;
  const alertSeen = new Set();
  function unlockAlertAudio(event){
    if(!event.isTrusted||!current())return;
    window.NotificationSounds?.unlock().catch(()=>{});
  }
  document.addEventListener('pointerdown',unlockAlertAudio,{passive:true});
  document.addEventListener('keydown',unlockAlertAudio,{passive:true});
  function messageSound(event,isNew){
    const id=event.room.id+':'+event.message.id;
    if(alertSeen.has(id))return;alertSeen.add(id);if(alertSeen.size>500)alertSeen.delete(alertSeen.values().next().value);
    if(!isNew||event.room.muted||event.message.senderId===account||!current()||Date.now()-lastAlert<400)return;
    lastAlert=Date.now();
    try{window.NotificationSounds?.play();}catch{}
  }
  function receive(event){
    if(event.profile){const changed=(profileViews[event.profile.id]?.username||'')!==(event.profile.username||'');profileViews[event.profile.id]=event.profile;if(changed)paintRooms();scheduleProfiles();return;}
    if(event.catalogVersion&&event.catalogVersion>catalogVersion){catalogVersion=event.catalogVersion;examDirty=true;}
    if(event.removeRoom){data.rooms=data.rooms.filter(r=>r.id!==event.removeRoom);for(const cache of historyCache.keys())if(cache.startsWith(event.removeRoom+':'))historyCache.delete(cache);if(room===event.removeRoom){cancelUploads();room='';timeline.replaceChildren();el('msgCompose').hidden=true;}}
    upsertRoom(event.room);
    if(event.message&&event.room){
      const cacheKey=event.room.id+':'+event.message.category,cache=historyCache.get(cacheKey);
      if(event.type==='message')messageSound(event,!cache?.rows.some(message=>message.id===event.message.id));
      if(cache?.loaded){const existing=cache.rows.find(m=>m.id===event.message.id);if(existing)Object.assign(existing,event.message);else cache.rows.push(event.message);cache.rows.sort((a,b)=>a.id-b.id);}
      if(active()&&room===event.room.id&&kind===event.message.category){const wasBottom=bottom();if(cache?.loaded)mergeNode(event.message);else history().catch(error=>status(error.message));if(wasBottom||event.message.senderId===account)timeline.scrollTop=timeline.scrollHeight;else el('msgLatest').hidden=false;scheduleRead();}
      if(ready&&event.type==='message')ack('delivered',event.room.id,event.message.category,event.message.id);
      if(event.type==='message'&&prefs.notifications!==false&&event.message.senderId!==account&&!event.room.muted&&document.visibilityState==='hidden'&&window.Notification?.permission==='granted')new Notification(event.room.title,{body:event.message.text.slice(0,160),tag:event.room.id});
    }
    if(event.receipt&&event.room){const c=event.receipt.category,peers=event.receipt.readers.filter(r=>r.id!==account),read=peers.length?Math.min(...peers.map(r=>r.read)):0,delivered=peers.length?Math.min(...peers.map(r=>r.delivered)):0;const cache=historyCache.get(event.room.id+':'+c);if(cache)for(const message of cache.rows)if(message.senderId===account){message.read=read>=message.id;message.delivered=delivered>=message.id;if(active()&&room===event.room.id&&kind===c)mergeNode(message);}}
    if(event.room&&event.type==='room'){membersCache.delete(event.room.id);if(rightMode==='info'&&prefs.right&&room===event.room.id&&active())showInfo().catch(()=>{});}
    badge();paintRooms();
  }
  function attachment(file){const url=String(file.url||'');if(!url.startsWith('/api/messages/file?'))return '';const label=escape(file.name),href=escape(url),attr=' class="chat-file" data-file-id="'+escape(file.id)+'"';if(file.mime.startsWith('image/')||/\.(heic|heif|avif|bmp|tiff?)$/i.test(file.name))return '<a'+attr+' href="'+href+'" target="_blank" rel="noopener"><img loading="lazy" src="'+href+'" alt="'+label+'"></a>';if(file.mime.startsWith('audio/'))return '<div class="chat-file chat-audio" data-file-id="'+escape(file.id)+'"><audio preload="metadata" src="'+href+'" aria-label="'+label+'"></audio><button type="button" class="chat-audio-play" data-audio-play aria-label="Play audio">'+icon('play')+'</button><div class="chat-audio-track"><div class="chat-audio-wave" role="slider" tabindex="0" aria-label="Audio position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">'+Array.from({length:40},()=>'<span></span>').join('')+'</div><small class="chat-audio-duration">0:00</small></div></div>';if(file.mime.startsWith('video/')&&/^video-\d+\.(webm|mp4)$/i.test(file.name))return '<div class="chat-file chat-round-video" data-file-id="'+escape(file.id)+'"><video autoplay muted loop playsinline preload="metadata" src="'+href+'" aria-label="'+label+'"></video><button type="button" class="chat-round-sound" data-round-sound aria-label="Enable sound" title="Enable sound" aria-pressed="false">'+icon('volume-x')+'</button></div>';if(file.mime.startsWith('video/'))return '<div'+attr+'><video controls playsinline preload="none" src="'+href+'" aria-label="'+label+'"></video></div>';return '<a'+attr+' href="'+href+'">'+icon('file')+' '+label+' ('+Math.ceil(file.size/1024)+' KB)</a>';}
  function previewText(value,max=320){return new DOMParser().parseFromString('<body>'+String(value||'').replace(/</g,'&lt;'),'text/html').body.textContent.replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
  function decorateLinks(node){
    const text=node.querySelector('.chat-message-text');if(!text)return;const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT),nodes=[];let part,offset=0;
    while((part=walker.nextNode())){nodes.push({node:part,start:offset,end:offset+part.length});offset+=part.length;}
    const source=text.textContent,matches=[];
    for(const match of source.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>]+/giu)){
      let label=match[0].replace(/[.,;:!?"']+$/g,'');for(const [open,close] of [['(',')'],['[',']']])while(label.endsWith(close)&&label.split(close).length>label.split(open).length)label=label.slice(0,-1);
      let url;try{url=new URL(label.startsWith('www.')?'https://'+label:label);}catch{continue;}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)continue;matches.push({start:match.index,end:match.index+label.length,url});
    }
    // DOM ranges preserve text colors even when a URL spans multiple formatting runs.
    for(const match of [...matches].reverse()){
      const start=nodes.find(n=>n.end>match.start),end=nodes.find(n=>n.end>=match.end);if(!start||!end)continue;const range=document.createRange();range.setStart(start.node,match.start-start.start);range.setEnd(end.node,match.end-end.start);const link=document.createElement('a');link.href=match.url.href;link.target='_blank';link.rel='noopener noreferrer';link.append(range.extractContents());range.insertNode(link);
    }
    const gen=generation;
    for(const url of [...new Map(matches.map(m=>[m.url.href,m.url])).values()].slice(0,3)){
      const card=document.createElement('a');card.className='chat-preview';card.href=url.href;card.target='_blank';card.rel='noopener noreferrer';card.innerHTML='<span class="chat-preview-copy"><small>'+escape(url.hostname)+'</small><strong>'+escape(url.pathname==='/'?url.hostname:url.pathname)+'</strong></span>';text.after(card);
      if(!previewCache.has(url.href))previewCache.set(url.href,domain('/preview',{url:url.href}).catch(()=>null));
      previewCache.get(url.href).then(result=>{if(!result||!card.isConnected||gen!==generation)return;const copy=card.querySelector('.chat-preview-copy');copy.querySelector('strong').textContent=previewText(result.title,200)||url.hostname;if(result.description){const description=document.createElement('span');description.textContent=previewText(result.description);copy.append(description);}if(/^\/api\/messages\/preview-image\?id=[a-f0-9]{64}$/.test(result.image||'')){const image=document.createElement('img');image.alt='';image.loading='lazy';image.src=result.image;image.onerror=()=>image.remove();card.prepend(image);}});
    }
  }
  function messageHTML(m){
    const own=m.senderId===account,date=new Date(m.createdMs||m.created*1000),receipt=m.pending?'Sending':m.failed?'Retry':m.read?'Read':m.delivered?'Delivered':'Sent';
    return (m.forwarded?'':'<header><strong>'+escape(m.sender)+'</strong></header>')+(m.forwarded?'<button type="button" class="chat-forwarded" data-msg-original="'+m.id+'" title="Go to original message">'+icon('forward')+' Forwarded from '+escape(m.forwarded.sender||'Unknown author')+'</button>'+(m.forwarded.text&&m.forwarded.text!==m.text?'<blockquote class="chat-study-reference">'+escape(m.forwarded.text)+'</blockquote>':''):'')+(m.replyTo&&!m.deleted?'<button type="button" class="msg-quote" data-msg-quote="'+m.replyTo+'"><b>'+escape(m.replySender||'Original message')+'</b>'+escape((m.replyText||'Attachment or unavailable message').slice(0,240))+'</button>':'')+'<p class="chat-message-text">'+(window.TextColors?window.TextColors.html(m.text,m.format):escape(m.text))+'</p>'+(m.files||[]).map(attachment).join('')+(m.examId?'<button type="button" class="chat-link" data-msg-exam="'+m.examId+'"'+(m.assignmentActive===false?' disabled':'')+'>'+(m.assignmentActive===false?'Assignment cancelled':'Open exam')+'</button>':'')+((m.reactions||[]).length?'<div class="chat-reactions">'+m.reactions.map(r=>'<button type="button" data-reaction="'+escape(r.emoji)+'" data-reaction-id="'+m.id+'" aria-pressed="'+r.mine+'">'+escape(r.emoji)+' '+r.count+'</button>').join('')+'</div>':'')+'<div class="chat-message-foot">'+(m.editedMs?'<span>Edited</span>':'')+'<time datetime="'+date.toISOString()+'" title="'+escape(stamp(date.getTime()))+'">'+escape(time(date.getTime()))+'</time>'+(own?'<span class="msg-receipt'+(m.read?' is-read':'')+'" aria-label="'+receipt+'" title="'+(m.read?'Read by everyone':receipt)+'">'+icon(m.pending?'clock':m.failed?'circle-alert':m.delivered||m.read?'check-check':'check')+'</span>':'')+'</div>';
  }
  const roundVideos=new WeakSet();
  const videoPosters=new Map();
  function saveVideoPoster(id,poster){videoPosters.set(id,poster);if(videoPosters.size>32)videoPosters.delete(videoPosters.keys().next().value);}
  function videoFirstFrame(video){try{if(!video.videoWidth)return '';const canvas=document.createElement('canvas');canvas.width=240;canvas.height=240;const context=canvas.getContext('2d'),side=Math.min(video.videoWidth,video.videoHeight);context.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,240,240);return canvas.toDataURL('image/jpeg',.8);}catch{return '';}}
  const roundVideoObserver=new IntersectionObserver(entries=>{for(const entry of entries){const video=entry.target;if(!video.isConnected){roundVideoObserver.unobserve(video);continue;}if(entry.isIntersecting&&active()&&document.visibilityState==='visible'){if(!video.ended)video.play().catch(()=>{});}else video.pause();}},{threshold:.2});
  function watchRoundVideos(root){root.querySelectorAll('.chat-round-video video').forEach(video=>{
    if(roundVideos.has(video))return;roundVideos.add(video);video.muted=true;video.loop=false;video.removeAttribute('loop');video.preload='auto';
    const id=video.parentElement.dataset.fileId,cover=document.createElement('canvas');cover.className='chat-video-cover';cover.width=240;cover.height=240;cover.setAttribute('aria-hidden','true');video.after(cover);
    const context=cover.getContext('2d');if(!context)return;
    const staging=document.createElement('canvas');staging.width=240;staging.height=240;const stage=staging.getContext('2d');
    const probe=document.createElement('canvas');probe.width=8;probe.height=8;const pixels=probe.getContext('2d',{willReadFrequently:true});
    let painted=false,callback=0,firstFrame=false,restarting=false,knownDuration=0;
    const duration=()=>Number.isFinite(video.duration)&&video.duration>0?video.duration:knownDuration;
    const restart=()=>{if(video.seeking||restarting||!video.isConnected)return;restarting=true;video.currentTime=0;video.play().catch(()=>{});};
    const checkEnd=()=>{const end=duration();if(end>0&&!video.paused&&!video.seeking&&!restarting&&video.currentTime>=end-Math.min(end/4,.08))restart();};
    const poster=videoPosters.get(id);
    if(poster){video.poster=poster;const image=new Image();image.onload=()=>{if(!painted){context.drawImage(image,0,0,240,240);painted=true;video.parentElement.classList.add('has-video-frame');}};image.src=poster;}
    const draw=()=>{
      if(video.readyState<2||video.seeking||restarting||!video.videoWidth)return;
      try{const side=Math.min(video.videoWidth,video.videoHeight);stage.drawImage(video,(video.videoWidth-side)/2,(video.videoHeight-side)/2,side,side,0,0,240,240);
        const end=duration();if(!end||video.currentTime<.15||video.currentTime>end-.15){pixels.drawImage(staging,0,0,8,8);const data=pixels.getImageData(0,0,8,8).data;let black=true;for(let i=0;i<data.length;i+=4)if(data[i]>6||data[i+1]>6||data[i+2]>6){black=false;break;}if(black)return;}
        context.drawImage(staging,0,0);painted=true;video.parentElement.classList.add('has-video-frame');
        if(!firstFrame){firstFrame=true;const frame=videoPosters.get(id)||cover.toDataURL('image/jpeg',.8);saveVideoPoster(id,frame);video.poster=frame;}
      }catch{}
    };
    const frame=()=>{
      callback=0;if(!video.isConnected)return;checkEnd();draw();
      if(!video.paused)callback=video.requestVideoFrameCallback?video.requestVideoFrameCallback(frame):requestAnimationFrame(frame);
    };
    const resume=()=>{if(callback)return;callback=video.requestVideoFrameCallback?video.requestVideoFrameCallback(frame):requestAnimationFrame(frame);};
    const pause=()=>{if(callback){if(video.requestVideoFrameCallback)video.cancelVideoFrameCallback(callback);else cancelAnimationFrame(callback);callback=0;}};
    video.addEventListener('loadeddata',()=>{draw();if(!video.paused)resume();});video.addEventListener('playing',resume);video.addEventListener('pause',pause);video.addEventListener('seeked',()=>{restarting=false;draw();if(!video.paused)resume();});
    video.addEventListener('timeupdate',checkEnd);video.addEventListener('ended',()=>{if(!knownDuration&&Number.isFinite(video.currentTime))knownDuration=video.currentTime;restart();});roundVideoObserver.observe(video);
  });}
  const audioPlayers=new WeakSet();
  const imagePreviews=new Map();let heicDecoder;
  function watchImages(root){root.querySelectorAll('.chat-file img:not(.chat-video-cover)').forEach(image=>{
    const link=image.closest('.chat-file'),name=image.alt,id=link.dataset.fileId;
    let converting=false;
    image.onerror=async()=>{
      if(converting)return;converting=true;
      try{
        if(!/\.(heic|heif)$/i.test(name))throw Error('Unsupported image format.');
        let preview=imagePreviews.get(id);
        if(!preview){heicDecoder ||= import('/heic-to-1.6.6.js');const decoder=await heicDecoder;const response=await fetch(link.href);if(!response.ok)throw Error('Image download failed.');const blob=await decoder.heicTo({blob:await response.blob(),type:'image/jpeg',quality:.85});preview=URL.createObjectURL(blob);imagePreviews.set(id,preview);if(imagePreviews.size>16){const key=imagePreviews.keys().next().value;URL.revokeObjectURL(imagePreviews.get(key));imagePreviews.delete(key);}}
        if(image.isConnected){image.src=preview;image.onerror=null;}
      }catch{if(image.isConnected){image.hidden=true;const fallback=document.createElement('span');fallback.className='chat-media-fallback';fallback.textContent=name+' — Preview unavailable. Download original';link.append(fallback);}}
    };
    if(image.complete&&!image.naturalWidth)image.onerror();
  });
  root.querySelectorAll('.chat-file video').forEach(video=>{video.onerror=()=>{if(video.parentElement.querySelector('.chat-media-fallback'))return;video.hidden=true;const link=document.createElement('a');link.className='chat-media-fallback';link.href=video.src;link.textContent='Preview unavailable. Download original';link.setAttribute('download','');video.parentElement.append(link);};});}
  function watchAudio(root){root.querySelectorAll('.chat-audio').forEach(player=>{
    if(audioPlayers.has(player))return;audioPlayers.add(player);const audio=player.querySelector('audio'),button=player.querySelector('[data-audio-play]'),wave=player.querySelector('.chat-audio-wave'),duration=player.querySelector('.chat-audio-duration');
    const clock=value=>{const seconds=Math.floor(Number.isFinite(value)?value:0);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
    const sync=()=>{button.innerHTML=icon(audio.paused?'play':'pause');button.setAttribute('aria-label',audio.paused?'Play audio':'Pause audio');duration.textContent=clock(audio.paused&&audio.currentTime===0?audio.duration:audio.currentTime);const percent=Number.isFinite(audio.duration)&&audio.duration>0?audio.currentTime/audio.duration*100:0;wave.setAttribute('aria-valuenow',String(Math.round(percent)));wave.querySelectorAll('span').forEach((bar,i)=>bar.classList.toggle('played',i/40*100<percent));icons();};
    let decoded=false;const decode=async()=>{if(decoded)return;decoded=true;const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;let context;try{const response=await fetch(audio.src);if(!response.ok)return;context=new AudioContext();const data=await context.decodeAudioData(await response.arrayBuffer()),samples=data.getChannelData(0),bars=[...wave.children],levels=bars.map((_,i)=>{const from=Math.floor(i*samples.length/bars.length),to=Math.floor((i+1)*samples.length/bars.length);let peak=0;for(let j=from;j<to;j++)peak=Math.max(peak,Math.abs(samples[j]));return peak;}),maximum=Math.max(...levels,.001);bars.forEach((bar,i)=>bar.style.height=Math.max(3,levels[i]/maximum*24)+'px');}catch{}finally{context?.close().catch(()=>{});}};
    button.onclick=()=>{if(audio.paused){section.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause();});audio.play().catch(error=>status(error.message));}else audio.pause();};
    wave.onclick=event=>{if(Number.isFinite(audio.duration)){const rect=wave.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width))*audio.duration;}};
    wave.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&Number.isFinite(audio.duration)){event.preventDefault();audio.currentTime=event.key==='Home'?0:event.key==='End'?audio.duration:Math.max(0,Math.min(audio.duration,audio.currentTime+(event.key==='ArrowRight'?5:-5)));}};
    for(const name of ['loadedmetadata','durationchange','timeupdate','play','pause','ended'])audio.addEventListener(name,sync);audio.addEventListener('play',decode,{once:true});sync();
  });}
  document.addEventListener('click',event=>{
    const button=event.target.closest('#messages [data-round-sound]');if(!button)return;
    const video=button.parentElement.querySelector('video');video.muted=!video.muted;
    button.innerHTML=icon(video.muted?'volume-x':'volume-2');button.title=video.muted?'Enable sound':'Mute';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(!video.muted));icons();video.play().catch(()=>{});
  });
  document.addEventListener('visibilitychange',()=>{section.querySelectorAll('.chat-round-video video').forEach(video=>{if(document.visibilityState==='hidden')video.pause();else if(active()){const rect=video.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)video.play().catch(()=>{});}});});
  function mergeNode(m,group=true){
    let node=[...timeline.querySelectorAll('.msg-message')].find(n=>n.dataset.msgId===String(m.id)||m.clientKey&&n.dataset.clientKey===m.clientKey);
    const content=JSON.stringify([m.id,m.text,m.format,m.files,m.forwarded,m.replyTo,m.replyText,m.replySender,m.sender,m.createdMs,m.examId,m.assignmentActive,m.pending,m.failed,m.deleted,m.editedMs,m.reactions]);
    if(node?.dataset.content===content){const receipt=node.querySelector('.msg-receipt');if(receipt){const label=m.read?'Read':m.delivered?'Delivered':'Sent';receipt.classList.toggle('is-read',!!m.read);receipt.setAttribute('aria-label',label);receipt.title=m.read?'Read by everyone':label;receipt.innerHTML=icon(m.delivered||m.read?'check-check':'check');icons();}return;}
    const html=messageHTML(m);if(node){if(node.innerHTML===html)return;node.innerHTML=html;}
    else{node=document.createElement('article');node.tabIndex=-1;node.innerHTML=html;timeline.append(node);timelineResize.observe(node);}
    node.className='msg-message'+(m.senderId===account?' is-own':'')+(m.category==='learning'?' is-learning':'')+(m.deleted?' is-deleted':'')+(selection.has(m.id)?' is-selected':'');node.dataset.msgId=m.id;node.dataset.clientKey=m.clientKey||'';node.dataset.content=content;node.dataset.day=dateLabel(m.createdMs||m.created*1000);if(!m.deleted)decorateLinks(node);if(group)syncDays();icons();
    const emojis=emojiParts(m);
    if(!m.text?.trim()&&m.files?.length===1&&node.querySelector('.chat-round-video'))node.classList.add('is-video-message');
    if(!m.text?.trim()&&m.files?.length===1&&node.querySelector('.chat-audio'))node.classList.add('is-audio-message');
    watchRoundVideos(node);
    watchAudio(node);
    watchImages(node);
    if(emojis.length){
      node.classList.add('is-emoji-only','emoji-count-'+(emojis.length<=3?emojis.length:'many'));
      const text=node.querySelector('.chat-message-text');text.replaceChildren();text.classList.add('emoji-big-wrap');
      emojis.forEach((emoji,i)=>{const part=document.createElement('span');part.className='emoji-big appear';part.textContent=emoji;part.style.animationDelay=Math.min(i*.06,.6)+'s';part.addEventListener('animationend',()=>{part.classList.remove('appear','bounce');part.style.animationDelay='0s';});part.addEventListener('click',()=>{part.classList.remove('appear','bounce');part.style.animationDelay='0s';void part.offsetWidth;part.classList.add('bounce');});text.append(part);});
    }
  }
  function syncDays(){timeline.querySelectorAll('.chat-empty,.msg-day').forEach(n=>n.remove());let day='';for(const node of timeline.querySelectorAll('.msg-message'))if(node.dataset.day!==day){day=node.dataset.day;const heading=document.createElement('p');heading.className='msg-day';heading.textContent=day;node.before(heading);}}
  function paintMessages(){
    timelineResize.disconnect();timelineResize.observe(timeline);
    const renderKey=account+':'+key();if(timeline.dataset.chatKey!==renderKey){timeline.replaceChildren();timeline.dataset.chatKey=renderKey;}
    const rows=state()?.rows||[],ids=new Set(rows.map(m=>String(m.id)));
    timeline.querySelectorAll('.msg-message').forEach(node=>{if(!ids.has(node.dataset.msgId)&&!(node.dataset.msgId==='pending'&&pending?.category===kind))node.remove();});
    let older=el('msgOlder');if(!older){older=document.createElement('button');older.type='button';older.id='msgOlder';older.className='chat-link';older.textContent='Earlier messages';older.onclick=()=>history({older:true}).catch(error=>status(error.message));timeline.prepend(older);}older.hidden=!state()?.more;
    let previous=older;
    for(const m of rows){mergeNode(m,false);const node=[...timeline.querySelectorAll('.msg-message')].find(n=>n.dataset.msgId===String(m.id));if(node){let next=previous.nextElementSibling;while(next?.classList.contains('msg-day'))next=next.nextElementSibling;if(next!==node)previous.after(node);timelineResize.observe(node);previous=node;}}syncDays();
    paintUploads();
    if(!rows.length){const empty=document.createElement('div');empty.className='chat-empty';empty.textContent='No messages yet.';timeline.append(empty);}
    if(pending&&pending.category===kind&&!rows.some(m=>m.clientKey===pending.clientKey))mergeNode({...pending,id:'pending',senderId:account,sender:data.profile?.name||current()?.name||'Me',createdMs:pending.createdMs||Date.now(),pending:busy,failed:!busy});
  }
  async function history({older=false,refresh=false,before=0}={}){
    if(!room||!ready)return;const token=++loading,cacheKey=key(),roomId=room,category=kind,cache=state();
    if(cache?.loaded&&!older&&!refresh&&!before){paintMessages();timeline.scrollTop=timeline.scrollHeight;scheduleRead();return;}
    const height=timeline.scrollHeight,top=timeline.scrollTop,wasBottom=bottom(),result=await request('history',{roomId,category,...(older&&cache?.rows.length?{before:cache.rows[0].id}:{}),...(before?{before}:{})});
    if(token!==loading||cacheKey!==key())return;
    const combined=older||refresh?[...(cache?.rows||[]),...result.messages]:result.messages,rows=[...new Map(combined.map(m=>[m.id,m])).values()].sort((a,b)=>a.id-b.id);
    historyCache.set(cacheKey,{loaded:true,rows,more:older||!refresh?result.more:cache?.more||result.more});upsertRoom(result.room);const readKey=roomId+':'+category;const cursor=cursors.get(readKey)||{};cursor.read=Math.max(cursor.read||0,result.readThrough||0);cursors.set(readKey,cursor);paintMessages();
    timeline.scrollTop=older?top+timeline.scrollHeight-height:refresh&&!wasBottom?top:timeline.scrollHeight;
    ack('delivered',roomId,category,result.messages.at(-1)?.id||0);scheduleRead();
  }
  async function openRoom(id){
    stickBottom=true;
    remember();if(id!==room)cancelUploads();closeEmoji();closeContext();clearSelection();if(recordGesture)cancelRecording();loading++;room=id;reply=null;pending=null;files=[];rightMode='';listMode='chats';el('msgTextSearch').value='';el('msgLatest').hidden=true;el('msgSendState').textContent='';loadDraft();badge();paintRooms();if(prefs.right&&innerWidth>700)showInfo().catch(error=>status(error.message));else panel('right',false);if(innerWidth<=700)panel('left',false);
    try{sessionStorage.setItem('enquiz-chat-room:'+account,room);}catch{}await history();
  }
  function ack(action,id,category,through){
    if(!ready||!through)return;const k=id+':'+category,entry=cursors.get(k)||{},column=action==='read'?'read':'delivered';if(through<=Math.max(entry[column]||0,entry[column+'Pending']||0))return;entry[column+'Pending']=through;cursors.set(k,entry);
    request(action,{roomId:id,category,through}).then(result=>{entry[column]=Math.max(entry[column]||0,through);upsertRoom(result.room);badge();paintRooms();}).catch(()=>{}).finally(()=>{entry[column+'Pending']=0;});
  }
  function acknowledgeSnapshot(){for(const r of data.rooms)if(r.lastMessage)ack('delivered',r.id,r.lastMessage.category,r.lastMessage.id);}
  function markRead(){if(!ready||!active()||!room||document.visibilityState!=='visible'||!document.hasFocus()||rightMode==='search'||innerWidth<=700&&prefs.left)return;const box=timeline.getBoundingClientRect();const visible=[...timeline.querySelectorAll('[data-msg-id]')].filter(n=>{const r=n.getBoundingClientRect();return r.top<box.bottom&&r.bottom>box.top;});ack('read',room,kind,Math.max(0,...visible.map(n=>Number(n.dataset.msgId)||0)));}
  function scheduleRead(){clearTimeout(readTimer);readTimer=setTimeout(markRead,250);}
  timeline.addEventListener('scroll',()=>{scheduleRead();if(bottom())el('msgLatest').hidden=true;});
  async function send(){
    if([...uploads.values()].some(item=>item.roomId===room&&!item.cancelled)){status('Wait for the attachments to finish uploading, or cancel them.');return;}
    if(busy||!room||!composer.value.trim()&&!files.length)return;if(composer.value.length>4000){status('Maximum message length is 4000 characters.');return;}
    status('');
    const text=composer.value.trim(),category=reviewer()?kind:'personal',body={roomId:room,text,category,replyTo:reply?.id||null,quote:reply?.quote||null,format:window.TextColors?.trim(format,composer.value)||null,files:files.map(f=>f.id)};
    if(!pending||Object.keys(body).some(k=>JSON.stringify(body[k])!==JSON.stringify(pending[k])))pending={...body,clientKey:crypto.randomUUID(),createdMs:Date.now()};
    remember();busy=true;composer.disabled=true;el('msgSend').disabled=true;el('msgSendState').textContent='Sending...';paintUploads();const sent=pending,gen=generation;let succeeded=false;
    if(kind===category){mergeNode({...sent,id:'pending',senderId:account,sender:data.profile?.name||'Me',pending:true});timeline.scrollTop=timeline.scrollHeight;}
    try{
      const result=await request('send',sent);if(gen!==generation||room!==sent.roomId)return;
      const cache=historyCache.get(room+':'+category);if(cache&&!cache.rows.some(m=>m.id===result.message.id))cache.rows.push(result.message);
      if(kind===category)mergeNode(result.message);pending=null;reply=null;files=[];format=null;composer.value='';window.TextColors?.sync(composer,null);paintDraft();remember();el('msgSendState').textContent='';succeeded=true;
    }catch(error){if(gen!==generation)return;el('msgSendState').textContent=error.message;if(kind===category)mergeNode({...sent,id:'pending',senderId:account,sender:data.profile?.name||'Me',failed:true});}
    finally{busy=false;composer.disabled=false;el('msgSend').disabled=false;paintUploads();if(succeeded&&gen===generation&&room===sent.roomId&&active()&&!el('msgCompose').hidden){window.TextColors?.sync(composer,null);focusComposer();}}
  }
  el('msgCompose').onsubmit=event=>{event.preventDefault();send();};composer.addEventListener('input',remember);
  let composing=false,shifted=false;composer.addEventListener('compositionstart',()=>{composing=true;});composer.addEventListener('compositionend',()=>{composing=false;});
  composer.addEventListener('keydown',event=>{if(event.key!=='Enter')return;shifted=event.shiftKey;if(prefs.enter===false||shifted||event.isComposing||composing||event.keyCode===229)return;event.preventDefault();send();});composer.addEventListener('keyup',()=>{shifted=false;});
  function enterInput(event){if(prefs.enter===false||shifted||composing||event.isComposing||!event.cancelable||!['insertParagraph','insertLineBreak'].includes(event.inputType))return;event.preventDefault();send();}
  composer.addEventListener('beforeinput',enterInput);composer.parentElement.querySelector('.text-color-rich')?.addEventListener('beforeinput',enterInput);
  const emojiSets={
    smileys:[[0x1f600,'Smile'],[0x1f603,'Grinning'],[0x1f604,'Happy'],[0x1f601,'Beaming'],[0x1f606,'Laughing'],[0x1f605,'Relieved'],[0x1f602,'Laugh'],[0x1f923,'Rolling laugh'],[0x1f642,'Slight smile'],[0x1f643,'Upside down'],[0x1f609,'Wink'],[0x1f60a,'Blushing'],[0x1f607,'Angel'],[0x1f60d,'Heart eyes'],[0x1f970,'Loved'],[0x1f618,'Kiss'],[0x1f60b,'Delicious'],[0x1f61b,'Tongue'],[0x1f60e,'Cool'],[0x1f973,'Party face'],[0x1f929,'Star eyes'],[0x1f914,'Thinking'],[0x1f917,'Hug'],[0x1f92d,'Surprised smile'],[0x1f92b,'Quiet'],[0x1f910,'Zipped mouth'],[0x1f610,'Neutral'],[0x1f644,'Eye roll'],[0x1f62c,'Grimace'],[0x1f634,'Sleeping'],[0x1f60c,'Peaceful'],[0x1f614,'Pensive'],[0x1f622,'Sad'],[0x1f62d,'Crying'],[0x1f631,'Shocked'],[0x1f620,'Angry'],[0x1f624,'Determined'],[0x1f92f,'Mind blown'],[0x1f913,'Nerd'],[0x1f9d0,'Monocle']],
    hands:[[0x1f44d,'Thumbs up'],[0x1f44e,'Thumbs down'],[0x1f44b,'Wave'],[0x1f44f,'Applause'],[0x1f64f,'Thanks'],[0x1f64c,'Celebrate'],[0x1f91d,'Handshake'],[0x1f44c,'OK'],[0x270c,'Victory'],[0x1f4aa,'Strength'],[0x1f44a,'Fist'],[0x1f91e,'Crossed fingers'],[0x1f91f,'Love gesture'],[0x1f446,'Up'],[0x1f447,'Down'],[0x1f448,'Left'],[0x1f449,'Right'],[0x1f590,'Hand']],
    symbols:[[0x2764,'Heart'],[0x1f49a,'Green heart'],[0x1f499,'Blue heart'],[0x1f49b,'Yellow heart'],[0x1f90d,'White heart'],[0x1f4af,'Hundred'],[0x2705,'Done'],[0x274c,'No'],[0x2757,'Important'],[0x2753,'Question'],[0x1f4a1,'Idea'],[0x1f525,'Fire'],[0x2728,'Sparkles'],[0x2b50,'Star'],[0x1f389,'Celebrate'],[0x1f3c6,'Trophy'],[0x1f3af,'Target'],[0x1f514,'Bell']],
    objects:[[0x1f4da,'Books'],[0x1f4d6,'Book'],[0x1f4dd,'Notes'],[0x270f,'Pencil'],[0x1f393,'Graduation'],[0x1f4bb,'Laptop'],[0x1f4f1,'Phone'],[0x1f3a7,'Headphones'],[0x1f3b5,'Music'],[0x1f4f7,'Camera'],[0x1f50d,'Search'],[0x1f4c5,'Calendar'],[0x23f0,'Clock'],[0x1f4ce,'Attachment'],[0x1f4e9,'Envelope'],[0x1f511,'Key'],[0x1f680,'Rocket'],[0x1f30d,'World']],
    nature:[[0x1f338,'Blossom'],[0x1f33b,'Sunflower'],[0x1f337,'Tulip'],[0x1f333,'Tree'],[0x1f331,'Seedling'],[0x1f340,'Clover'],[0x2600,'Sun'],[0x1f319,'Moon'],[0x1f308,'Rainbow'],[0x1f3d6,'Beach'],[0x1f34e,'Apple'],[0x1f353,'Strawberry'],[0x1f349,'Watermelon'],[0x2615,'Coffee'],[0x1f370,'Cake'],[0x1f355,'Pizza'],[0x1f3c0,'Basketball'],[0x26bd,'Football']]
  };
  emojiSets.smileys.push(...[[0x1f972,'Happy tears'],[0x1f979,'Holding back tears'],[0x1f971,'Yawning'],[0x1f92a,'Zany'],[0x1f92e,'Sick'],[0x1f922,'Nauseous'],[0x1f927,'Sneezing'],[0x1f912,'Thermometer'],[0x1f915,'Bandaged'],[0x1f637,'Mask'],[0x1f975,'Hot'],[0x1f976,'Cold'],[0x1f974,'Woozy'],[0x1f635,'Dizzy'],[0x1f62e,'Open mouth'],[0x1f62f,'Hushed'],[0x1f632,'Astonished'],[0x1f633,'Flushed'],[0x1f626,'Frowning'],[0x1f627,'Anguished'],[0x1f628,'Fearful'],[0x1f630,'Anxious'],[0x1f625,'Disappointed'],[0x1f613,'Sweating'],[0x1f616,'Confounded'],[0x1f623,'Persevering'],[0x1f61e,'Disappointed face'],[0x1f61f,'Worried'],[0x1f629,'Weary'],[0x1f62b,'Tired'],[0x1f621,'Pouting'],[0x1f92c,'Swearing'],[0x1f608,'Mischievous'],[0x1f47b,'Ghost'],[0x1f47d,'Alien'],[0x1f916,'Robot'],[0x1f63a,'Happy cat'],[0x1f638,'Grinning cat'],[0x1f639,'Laughing cat'],[0x1f63b,'Heart eyes cat'],[0x1f63c,'Smirking cat'],[0x1f63d,'Kissing cat'],[0x1f640,'Surprised cat'],[0x1f63f,'Crying cat'],[0x1f63e,'Pouting cat'],[0x1fae0,'Melting'],[0x1fae1,'Saluting'],[0x1fae2,'Hand over mouth'],[0x1fae3,'Peeking'],[0x1fae4,'Diagonal mouth'],[0x1fae5,'Dotted face'],[0x1fae8,'Shaking face']]);
  emojiSets.hands.push(...[[0x1f91b,'Left fist'],[0x1f91c,'Right fist'],[0x1f91a,'Raised back hand'],[0x270b,'Raised hand'],[0x1f596,'Vulcan salute'],[0x1f918,'Rock on'],[0x1f919,'Call me'],[0x1f90c,'Pinched fingers'],[0x1f90f,'Pinching hand'],[0x1f932,'Open palms'],[0x1f450,'Open hands'],[0x1faf0,'Finger heart'],[0x1faf1,'Rightwards hand'],[0x1faf2,'Leftwards hand'],[0x1faf3,'Palm down'],[0x1faf4,'Palm up'],[0x1faf5,'Pointing at you'],[0x1faf6,'Heart hands']]);
  const modifiers=[0x1f3fb,0x1f3fc,0x1f3fd,0x1f3fe,0x1f3ff];for(const [code,label] of emojiSets.hands.filter(([code])=>code!==0x1f91d))for(let i=0;i<modifiers.length;i++)emojiSets.hands.push([[code,modifiers[i]],label+' - skin tone '+(i+1)]);
  emojiSets.symbols.push(...[[0x1f9e1,'Orange heart'],[0x1f49c,'Purple heart'],[0x1f90e,'Brown heart'],[0x1f5a4,'Black heart'],[0x1f494,'Broken heart'],[0x1f495,'Two hearts'],[0x1f496,'Sparkling heart'],[0x1f497,'Growing heart'],[0x1f498,'Gift heart'],[0x1f49d,'Ribbon heart'],[0x1f49f,'Heart decoration'],[0x1f4a5,'Boom'],[0x1f4a4,'Sleep'],[0x1f4ac,'Speech'],[0x1f4ad,'Thought'],[0x1f4a8,'Speed'],[0x26a1,'Lightning'],[0x26a0,'Warning'],[0x1f6ab,'Forbidden'],[0x267b,'Recycle'],[0x267e,'Infinity'],[0x2714,'Check'],[0x2795,'Plus'],[0x2796,'Minus'],[0x1f195,'New'],[0x1f197,'OK sign'],[0x1f198,'SOS'],[0x1f199,'Up sign'],[0x1f51d,'Top'],[0x1f519,'Back'],[0x1f512,'Locked'],[0x1f513,'Unlocked']]);
  emojiSets.objects.push(...[[0x1f4d2,'Notebook'],[0x1f4d3,'Journal'],[0x1f4d4,'Decorated notebook'],[0x1f4d5,'Red book'],[0x1f4d7,'Green book'],[0x1f4d8,'Blue book'],[0x1f4d9,'Orange book'],[0x1f4c3,'Page'],[0x1f4c4,'Document'],[0x1f4cb,'Clipboard'],[0x1f4cc,'Pin'],[0x1f58a,'Pen'],[0x1f58d,'Crayon'],[0x1f58c,'Brush'],[0x1f4cf,'Ruler'],[0x1f4c1,'Folder'],[0x1f5c2,'Index cards'],[0x1f4e7,'Email'],[0x1f4e6,'Package'],[0x1f381,'Gift'],[0x1f3a8,'Art'],[0x1f3ad,'Theatre'],[0x1f3ac,'Cinema'],[0x1f3b8,'Guitar'],[0x1f3b9,'Piano'],[0x1f3ba,'Trumpet'],[0x1f941,'Drum'],[0x1f3a4,'Microphone'],[0x1f50b,'Battery'],[0x1f50c,'Plug'],[0x1f4fa,'TV'],[0x1f4a1,'Light bulb'],[0x1f9ed,'Compass'],[0x1f9f0,'Toolbox'],[0x1f9ea,'Test tube'],[0x1f52c,'Microscope'],[0x1f52d,'Telescope']]);
  emojiSets.nature.push(...[[0x1f335,'Cactus'],[0x1f334,'Palm tree'],[0x1f332,'Evergreen'],[0x1f33f,'Herb'],[0x1f342,'Leaf'],[0x1f343,'Leaves'],[0x1f339,'Rose'],[0x1f33a,'Hibiscus'],[0x1f33c,'Flower'],[0x1f490,'Bouquet'],[0x1f30a,'Wave'],[0x1f30b,'Volcano'],[0x1f30c,'Milky way'],[0x1f320,'Shooting star'],[0x1f31f,'Glowing star'],[0x1f31e,'Sun face'],[0x1f31d,'Moon face'],[0x1f327,'Rain'],[0x1f328,'Snow'],[0x1f329,'Storm'],[0x1f32a,'Tornado'],[0x2601,'Cloud'],[0x2744,'Snowflake'],[0x26c4,'Snowman']]);
  emojiSets.animals=[[0x1f436,'Dog'],[0x1f431,'Cat'],[0x1f42d,'Mouse'],[0x1f439,'Hamster'],[0x1f430,'Rabbit'],[0x1f98a,'Fox'],[0x1f43b,'Bear'],[0x1f43c,'Panda'],[0x1f428,'Koala'],[0x1f42f,'Tiger'],[0x1f981,'Lion'],[0x1f42e,'Cow'],[0x1f437,'Pig'],[0x1f438,'Frog'],[0x1f435,'Monkey'],[0x1f986,'Duck'],[0x1f985,'Eagle'],[0x1f989,'Owl'],[0x1f987,'Bat'],[0x1f43a,'Wolf'],[0x1f417,'Boar'],[0x1f434,'Horse'],[0x1f984,'Unicorn'],[0x1f41d,'Bee'],[0x1f98b,'Butterfly'],[0x1f41e,'Ladybug'],[0x1f40c,'Snail'],[0x1f422,'Turtle'],[0x1f40d,'Snake'],[0x1f438,'Frog'],[0x1f419,'Octopus'],[0x1f420,'Fish'],[0x1f42c,'Dolphin'],[0x1f433,'Whale'],[0x1f988,'Shark'],[0x1f980,'Crab'],[0x1f99c,'Parrot'],[0x1f9a2,'Swan'],[0x1f99a,'Peacock'],[0x1f9a5,'Sloth']];
  emojiSets.food=[[0x1f34f,'Green apple'],[0x1f350,'Pear'],[0x1f34a,'Tangerine'],[0x1f34b,'Lemon'],[0x1f34c,'Banana'],[0x1f347,'Grapes'],[0x1f348,'Melon'],[0x1f352,'Cherries'],[0x1f351,'Peach'],[0x1f34d,'Pineapple'],[0x1f95d,'Kiwi'],[0x1f951,'Avocado'],[0x1f966,'Broccoli'],[0x1f955,'Carrot'],[0x1f33d,'Corn'],[0x1f952,'Cucumber'],[0x1f954,'Potato'],[0x1f35e,'Bread'],[0x1f950,'Croissant'],[0x1f9c0,'Cheese'],[0x1f95a,'Egg'],[0x1f373,'Cooking'],[0x1f953,'Bacon'],[0x1f354,'Burger'],[0x1f35f,'Fries'],[0x1f32d,'Hot dog'],[0x1f32e,'Taco'],[0x1f32f,'Burrito'],[0x1f96a,'Sandwich'],[0x1f35d,'Pasta'],[0x1f35c,'Noodles'],[0x1f35b,'Curry'],[0x1f363,'Sushi'],[0x1f361,'Dango'],[0x1f368,'Ice cream'],[0x1f369,'Doughnut'],[0x1f36a,'Cookie'],[0x1f382,'Birthday cake'],[0x1f36b,'Chocolate'],[0x1f36c,'Candy'],[0x1f36d,'Lollipop'],[0x1f36f,'Honey'],[0x1f375,'Tea'],[0x1f95b,'Milk'],[0x1f964,'Drink'],[0x1f37f,'Popcorn']];
  emojiSets.travel=[[0x1f697,'Car'],[0x1f695,'Taxi'],[0x1f68c,'Bus'],[0x1f68e,'Trolleybus'],[0x1f693,'Police car'],[0x1f691,'Ambulance'],[0x1f692,'Fire engine'],[0x1f69a,'Truck'],[0x1f6b2,'Bicycle'],[0x1f6f4,'Scooter'],[0x1f3cd,'Motorbike'],[0x1f682,'Train'],[0x1f687,'Metro'],[0x1f68a,'Tram'],[0x2708,'Airplane'],[0x1f681,'Helicopter'],[0x1f6f3,'Ship'],[0x26f5,'Sailboat'],[0x1f6f6,'Canoe'],[0x1f3e0,'Home'],[0x1f3eb,'School'],[0x1f3e5,'Hospital'],[0x1f3e6,'Bank'],[0x1f3e8,'Hotel'],[0x1f3f0,'Castle'],[0x1f5fc,'Tokyo tower'],[0x1f5fd,'Statue of Liberty'],[0x1f3d4,'Mountain'],[0x1f3dd,'Island'],[0x1f3d5,'Camping'],[0x26fa,'Tent'],[0x1f3a1,'Ferris wheel'],[0x1f3a2,'Roller coaster'],[0x1f3a0,'Carousel'],[0x1f3aa,'Circus']];
  emojiSets.sports=[[0x1f3be,'Tennis'],[0x1f3d0,'Volleyball'],[0x1f3c8,'American football'],[0x26be,'Baseball'],[0x1f3c9,'Rugby'],[0x1f3b1,'Billiards'],[0x1f3d3,'Table tennis'],[0x1f3f8,'Badminton'],[0x1f94a,'Boxing'],[0x1f94b,'Martial arts'],[0x1f3bf,'Skis'],[0x26f8,'Skates'],[0x1f6f9,'Skateboard'],[0x1f3c4,'Surfing'],[0x1f3ca,'Swimming'],[0x1f6b4,'Cycling'],[0x1f3c3,'Running'],[0x1f3cb,'Weightlifting'],[0x1f9d8,'Meditation'],[0x1f3c5,'Medal'],[0x1f947,'Gold'],[0x1f948,'Silver'],[0x1f949,'Bronze'],[0x1f3ae,'Video game'],[0x1f3b2,'Dice'],[0x1f9e9,'Puzzle'],[0x265f,'Chess'],[0x1f3b3,'Bowling'],[0x1f3a3,'Fishing']];
  const emojiIcons={hands:'hand',symbols:'heart',objects:'book-open',nature:'flower-2',animals:'paw-print',food:'apple',travel:'plane',sports:'trophy'};
  const emojiValue=code=>String.fromCodePoint(...(Array.isArray(code)?code:code<0x1f000?[code,0xfe0f]:[code]));
  function closeEmoji(){el('msgEmojiPicker').hidden=true;emojiMode='';el('msgEmoji').setAttribute('aria-expanded','false');el('msgStickers').setAttribute('aria-expanded','false');}
  function paintEmoji(category){const mode=emojiMode,node=el('msgEmojiPicker'),sets=mode==='smileys'?['smileys']:Object.keys(emojiIcons);node.innerHTML=(mode==='emoji'?'<div class="chat-emoji-tabs">'+sets.map(c=>'<button type="button" data-emoji-category="'+c+'" class="'+(c===category?'on':'')+'" aria-label="'+c+'" title="'+c+'">'+icon(emojiIcons[c])+'</button>').join('')+'</div>':'')+'<label class="chat-emoji-search"><input type="search" placeholder="Search emoji" aria-label="Search emoji"></label><div class="chat-emoji-grid">'+emojiSets[category].map(([code,label])=>'<button type="button" data-emoji="'+emojiValue(code)+'" data-emoji-name="'+label.toLocaleLowerCase()+'" aria-label="'+label+'" title="'+label+'">'+emojiValue(code)+'</button>').join('')+'</div>';node.querySelector('input').oninput=event=>{const q=event.target.value.trim().toLocaleLowerCase();node.querySelectorAll('[data-emoji-name]').forEach(button=>button.hidden=!button.dataset.emojiName.includes(q));};icons();}
  function emojiPicker(mode){if(emojiMode===mode&&!el('msgEmojiPicker').hidden){closeEmoji();return;}emojiMode=mode;el('msgEmojiPicker').hidden=false;paintEmoji(mode==='smileys'?'smileys':'hands');el('msgEmoji').setAttribute('aria-expanded',String(mode==='smileys'));el('msgStickers').setAttribute('aria-expanded',String(mode==='emoji'));}
  el('msgEmoji').onclick=()=>emojiPicker('smileys');el('msgStickers').onclick=()=>emojiPicker('emoji');
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#msgEmojiPicker,#msgEmoji,#msgStickers'))closeEmoji();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeEmoji();});
  function paintUploads(){
    const wasBottom=bottom(),items=[...files.map(file=>({id:'file:'+file.id,fileId:file.id,name:file.name,createdMs:file.createdMs||Date.now(),progress:100,state:'ready'})),...[...uploads.values()].filter(item=>item.roomId===room&&!item.cancelled)],ids=new Set(items.map(item=>item.id));
    for(const node of timeline.querySelectorAll('.chat-upload'))if(!ids.has(node.dataset.uploadId))node.remove();
    for(const item of items){
      let node=[...timeline.querySelectorAll('.chat-upload')].find(n=>n.dataset.uploadId===item.id);
      if(!node){node=document.createElement('article');node.className='chat-upload is-own';node.dataset.uploadId=item.id;node.innerHTML='<div class="chat-upload-body"><button type="button" class="chat-upload-cancel" data-cancel-upload="'+escape(item.id)+'" title="Cancel upload" aria-label="Cancel upload">'+icon('x')+'</button><span class="chat-upload-meter" role="progressbar" aria-label="'+escape('Upload '+item.name)+'" aria-valuemin="0" aria-valuemax="100"></span><div class="chat-upload-copy"><strong>'+escape(item.name)+'</strong><small data-upload-state></small></div></div><div class="chat-message-foot"><time title="'+escape(stamp(item.createdMs))+'">'+escape(time(item.createdMs))+'</time><span data-upload-clock>'+icon('clock')+'</span></div>';timeline.append(node);}
      const cancel=node.querySelector('[data-cancel-upload]');cancel.style.setProperty('--upload-progress',item.progress+'%');cancel.setAttribute('aria-label',item.state==='ready'?'Remove attachment':'Cancel upload');cancel.title=cancel.getAttribute('aria-label');cancel.disabled=item.state==='ready'&&busy;
      node.querySelector('[data-upload-state]').textContent=item.state==='ready'?(pending&&!busy?'Retry sending':'Uploaded'):item.state==='failed'?item.error:item.state==='queued'?'Queued':item.progress+'% uploaded'+(item.state==='processing'?' - Processing...':'');
      node.querySelector('[data-upload-clock]').hidden=item.state==='ready';node.dataset.uploadState=item.state;
      const meter=node.querySelector('.chat-upload-meter');meter.hidden=item.state==='ready';meter.setAttribute('aria-valuenow',String(item.progress));meter.setAttribute('aria-valuetext',item.progress+'% uploaded');
    }
    if(items.length)timeline.querySelectorAll('.chat-empty').forEach(n=>n.remove());if(wasBottom)timeline.scrollTop=timeline.scrollHeight;icons();
  }
  function updateUpload(item){
    const node=[...timeline.querySelectorAll('.chat-upload')].find(n=>n.dataset.uploadId===item.id);if(!node)return;
    node.querySelector('[data-cancel-upload]').style.setProperty('--upload-progress',item.progress+'%');const meter=node.querySelector('.chat-upload-meter');meter.setAttribute('aria-valuenow',String(item.progress));meter.setAttribute('aria-valuetext',item.progress+'% uploaded');node.querySelector('[data-upload-state]').textContent=item.progress+'% uploaded'+(item.state==='processing'?' - Processing...':'');node.dataset.uploadState=item.state;
  }
  function cancelUploads(id){
    for(const item of uploads.values())if(!id||item.id===id){item.cancelled=true;item.xhr?.abort();uploads.delete(item.id);}section.classList.remove('is-file-drop');dragDepth=0;paintUploads();
  }
  function queueUpload(file){
    const item={id:crypto.randomUUID(),file,name:file.name,roomId:room,gen:generation,progress:0,state:'queued',createdMs:Date.now(),cancelled:false};uploads.set(item.id,item);paintUploads();
    const job=uploadQueue.then(async()=>{
      if(item.cancelled||item.gen!==generation||item.roomId!==room)return;
      item.state='uploading';updateUpload(item);
      try{
        const result=await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();item.xhr=xhr;xhr.open('POST','/api/messages/upload?'+new URLSearchParams({roomId:item.roomId,name:file.name}));xhr.withCredentials=true;xhr.responseType='json';xhr.timeout=180000;xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
          xhr.upload.onprogress=event=>{if(item.cancelled||item.gen!==generation||item.roomId!==room)return;item.progress=Math.min(100,Math.floor(event.loaded/(event.lengthComputable?event.total:file.size||1)*100));updateUpload(item);};
          xhr.upload.onload=()=>{if(item.cancelled)return;item.progress=100;item.state='processing';updateUpload(item);};
          xhr.onload=()=>{const value=xhr.response;if(xhr.status<200||xhr.status>=300||!value?.file)reject(new Error(value?.error||'Upload failed.'));else resolve(value.file);};
          xhr.onerror=()=>reject(new Error('Upload failed. Check your connection.'));xhr.ontimeout=()=>reject(new Error('Upload timed out. Try again.'));xhr.onabort=()=>reject(new DOMException('Upload cancelled.','AbortError'));xhr.send(file);
        });
        if(item.cancelled||item.gen!==generation||item.roomId!==room)return;
        if(file.chatPoster)saveVideoPoster(result.id,file.chatPoster);
        files.push({...result,createdMs:item.createdMs});uploads.delete(item.id);remember();paintDraft();return result;
      }catch(error){if(item.cancelled||item.gen!==generation||item.roomId!==room)return;item.state='failed';item.error=error.message;paintUploads();status(error.message);}
      finally{item.xhr=null;}
    });uploadQueue=job.catch(()=>{});return job;
  }
  async function addFiles(incoming){
    status('');try{
      if(!room||el('msgCompose').hidden||!ready)throw new Error('Open an available conversation before attaching files.');if(busy)throw new Error('Wait for the current message to be sent.');
      const targetRoom=room,gen=generation,selected=Array.from(incoming),waiting=[...uploads.values()].filter(item=>item.roomId===room&&!item.cancelled).length;if(files.length+waiting+selected.length>5)throw new Error('Attach up to five files.');if(selected.some(file=>file.size>25*1024*1024))throw new Error('Maximum attachment size is 25 MB.');const results=await Promise.all(selected.map(queueUpload));const uploaded=selected.length>0&&results.every(Boolean);if(uploaded&&room===targetRoom&&generation===gen&&![...uploads.values()].some(item=>item.roomId===room&&!item.cancelled))await send();return uploaded;
    }catch(error){status(error.message);}
  }
  async function upload(file){return addFiles([file]);}
  async function archiveFolder(entries,name){
    status('Archiving folder...');let total=0;const data=[];
    if(entries.length>2000)throw Error('A folder can contain up to 2000 entries.');
    for(const entry of entries){total+=entry.file?.size||0;if(total>100*1024*1024)throw Error('Maximum folder size before compression is 100 MB.');data.push({path:entry.path,bytes:entry.file?new Uint8Array(await entry.file.arrayBuffer()):new Uint8Array()});}
    const bytes=await new Promise((resolve,reject)=>{const worker=new Worker('/chat-archive-worker.js');const timer=setTimeout(()=>{worker.terminate();reject(Error('Folder compression timed out.'));},120000);const done=()=>{clearTimeout(timer);worker.terminate();};worker.onmessage=event=>{done();if(event.data.error)reject(Error(event.data.error));else resolve(event.data.archive);};worker.onerror=()=>{done();reject(Error('Folder compression failed.'));};worker.postMessage(data,data.map(item=>item.bytes.buffer));});
    return new File([bytes],name+'.zip',{type:'application/zip'});
  }
  async function readFolder(entry,path,files){
    if(files.length>=2000)throw Error('A folder can contain up to 2000 entries.');
    if(entry.isFile){files.push({path,file:await new Promise((resolve,reject)=>entry.file(resolve,reject))});return;}
    files.push({path:path+'/',file:null});const reader=entry.createReader();
    for(;;){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await readFolder(child,path+'/'+child.name,files);}
  }
  async function dropFiles(items,fallback){
    const targetRoom=room,gen=generation;
    try{const entries=items.map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(!entries.length){await addFiles(fallback);return;}if(entries.length>5)throw Error('Attach up to five files.');const incoming=[];for(const entry of entries){if(entry.isDirectory){const files=[];await readFolder(entry,entry.name,files);incoming.push(await archiveFolder(files,entry.name));}else incoming.push(await new Promise((resolve,reject)=>entry.file(resolve,reject)));}if(room===targetRoom&&generation===gen)await addFiles(incoming);}catch(error){status(error.message);}
  }
  const folderInput=document.createElement('input');folderInput.type='file';folderInput.multiple=true;folderInput.setAttribute('webkitdirectory','');folderInput.hidden=true;el('msgCompose').append(folderInput);
  folderInput.onchange=async()=>{const targetRoom=room,gen=generation;try{const selected=Array.from(folderInput.files);if(!selected.length)return;const root=selected[0].webkitRelativePath.split('/')[0]||'Folder';const archive=await archiveFolder(selected.map(file=>({path:file.webkitRelativePath||root+'/'+file.name,file})),root);if(room===targetRoom&&generation===gen)await addFiles([archive]);}catch(error){status(error.message);}finally{folderInput.value='';}};
  const attachMenu=document.createElement('div');attachMenu.className='chat-attachment-menu';attachMenu.hidden=true;attachMenu.innerHTML='<button type="button" data-attach-files>'+icon('file')+'Files</button><button type="button" data-attach-folder>'+icon('folder')+'Folder</button>';el('msgCompose').append(attachMenu);
  attachMenu.querySelector('[data-attach-files]').onclick=()=>{attachMenu.hidden=true;el('msgFile').click();};attachMenu.querySelector('[data-attach-folder]').onclick=()=>{attachMenu.hidden=true;folderInput.click();};
  el('msgAttach').onclick=()=>{attachMenu.hidden=!attachMenu.hidden;icons();};document.addEventListener('pointerdown',event=>{if(!event.target.closest('#msgAttach,.chat-attachment-menu'))attachMenu.hidden=true;});document.addEventListener('keydown',event=>{if(event.key==='Escape')attachMenu.hidden=true;});
  el('msgFile').onchange=async()=>{await addFiles(el('msgFile').files);el('msgFile').value='';};
  section.addEventListener('dragenter',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dragDepth++;section.classList.add('is-file-drop');});
  section.addEventListener('dragover',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';section.classList.add('is-file-drop');});
  section.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;section.classList.remove('is-file-drop');}});
  section.addEventListener('drop',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dragDepth=0;section.classList.remove('is-file-drop');dropFiles(Array.from(event.dataTransfer.items),Array.from(event.dataTransfer.files));});
  composer.parentElement.addEventListener('paste',event=>{if(event.clipboardData.files.length){event.preventDefault();addFiles(event.clipboardData.files);}},true);
  const recordButton=el('msgMic');
  const recordPreview=document.createElement('video');recordPreview.className='chat-record-preview';recordPreview.muted=true;recordPreview.autoplay=true;recordPreview.playsInline=true;recordPreview.hidden=true;
  const recordFrame=document.createElement('div');recordFrame.className='chat-record-frame';recordFrame.hidden=true;recordFrame.setAttribute('role','progressbar');recordFrame.setAttribute('aria-label','Video recording time');recordFrame.setAttribute('aria-valuemin','0');recordFrame.setAttribute('aria-valuemax','60');recordFrame.append(recordPreview);chatCenter.append(recordFrame);
  recordPreview.addEventListener('loadeddata',()=>{if(recordGesture&&!recordGesture.poster)recordGesture.poster=videoFirstFrame(recordPreview);});
  function paintRecordButton(){
    recordButton.innerHTML=icon(recordMode==='video'?'video':'mic');
    recordButton.title=recordMode==='video'?'Hold to record video; click to switch to audio':'Hold to record audio; click to switch to video';
    recordButton.setAttribute('aria-label',recordButton.title);icons();
  }
  function finishRecording(cancel=false){
    const gesture=recordGesture;if(!gesture)return;clearTimeout(gesture.hold);clearTimeout(recordTimer);clearInterval(recordProgressTimer);
    gesture.held=false;gesture.cancelled ||= cancel;
    if(gesture.recorder?.state==='recording')gesture.recorder.stop();
    else{gesture.cancelled=true;recordGesture=null;gesture.stream?.getTracks().forEach(t=>t.stop());recordPreview.srcObject=null;recordPreview.hidden=true;recordFrame.hidden=true;el('msgSendState').textContent='';el('msgCancelRecording').hidden=true;paintRecordButton();scheduleInputFit();}
  }
  function cancelRecording(){finishRecording(true);}
  el('msgCancelRecording').onclick=cancelRecording;
  async function startRecording(gesture){
    if(recordGesture!==gesture||!gesture.held)return;gesture.started=true;
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Recording is unavailable in this browser.');finishRecording(true);return;}
    const video=gesture.mode==='video';let stream;
    try{
      el('msgSendState').textContent=video?'Waiting for camera permission...':'Waiting for microphone permission...';
      stream=await navigator.mediaDevices.getUserMedia({audio:true,...(video?{video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}}:{})});
      if(recordGesture!==gesture||!gesture.held||gesture.cancelled||room!==gesture.roomId||generation!==gesture.gen||!active()){
        stream.getTracks().forEach(t=>t.stop());return;
      }
      gesture.stream=stream;
      const mime=(video?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4']).find(type=>MediaRecorder.isTypeSupported(type));
      if(!mime)throw new Error('Recording format is unsupported in this browser.');
      const chunks=[];let size=0;const recording=new MediaRecorder(stream,{mimeType:mime});recorder=recording;gesture.recorder=recording;
      recording.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);size+=event.data.size;}if(size>25*1024*1024){status('Maximum attachment size is 25 MB.');finishRecording(true);}};
      recording.onerror=()=>{status('Recording failed. Please try again.');finishRecording(true);};
      recording.onstop=async()=>{
        clearTimeout(recordTimer);clearInterval(recordProgressTimer);stream.getTracks().forEach(t=>t.stop());if(recorder===recording)recorder=null;
        if(recordGesture===gesture){recordGesture=null;recordPreview.poster=gesture.poster||'';recordPreview.srcObject=null;recordPreview.load();recordFrame.hidden=gesture.cancelled||!video;recordPreview.hidden=recordFrame.hidden;el('msgCancelRecording').hidden=true;el('msgSendState').textContent='';paintRecordButton();scheduleInputFit();}
        if(gesture.cancelled||room!==gesture.roomId||generation!==gesture.gen||!active())return;
        const blob=new Blob(chunks,{type:mime.split(';')[0]});if(!blob.size){recordFrame.hidden=true;recordPreview.hidden=true;return;}
        recordUploading=true;
        try{const extension=mime.includes('mp4')?'.mp4':mime.includes('ogg')?'.ogg':'.webm';const file=new File([blob],(video?'video-':'voice-')+Date.now()+extension,{type:blob.type});file.chatPoster=gesture.poster;await upload(file);}catch(error){status(error.message);}finally{recordUploading=false;recordFrame.hidden=true;recordPreview.hidden=true;}
      };
      recording.start(250);el('msgCancelRecording').hidden=false;el('msgSendState').textContent=video?'Recording video...':'Recording audio...';recordButton.innerHTML=icon('square');icons();
      if(video){
        const startedAt=performance.now();
        const progress=()=>{const elapsed=Math.min(60,(performance.now()-startedAt)/1000);recordFrame.style.setProperty('--record-progress',elapsed*6+'deg');recordFrame.setAttribute('aria-valuenow',String(Math.floor(elapsed)));el('msgSendState').textContent='Recording video... '+String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(Math.floor(elapsed%60)).padStart(2,'0')+' / 01:00';};
        progress();recordProgressTimer=setInterval(progress,100);recordPreview.poster='';recordPreview.srcObject=stream;recordPreview.hidden=false;recordFrame.hidden=false;recordPreview.play().catch(()=>{});scheduleInputFit();
      }
      recordTimer=setTimeout(()=>finishRecording(),video?60000:120000);
    }catch(error){
      stream?.getTracks().forEach(t=>t.stop());
      if(recordGesture===gesture){status(error.message||'Camera or microphone unavailable.');finishRecording(true);}
    }
  }
  function beginRecordHold(pointerId){
    if(recordGesture||recordUploading||busy||!ready||!room||el('msgCompose').hidden)return;
    const gesture={pointerId,mode:recordMode,roomId:room,gen:generation,held:true,started:false,cancelled:false};recordGesture=gesture;
    gesture.hold=setTimeout(()=>startRecording(gesture),250);
  }
  function releaseRecordHold(){
    const gesture=recordGesture;if(!gesture)return;const short=!gesture.started;finishRecording();
    if(short){recordMode=recordMode==='audio'?'video':'audio';paintRecordButton();}
  }
  recordButton.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();beginRecordHold(event.pointerId);if(recordGesture)recordButton.setPointerCapture(event.pointerId);});
  recordButton.addEventListener('pointerup',event=>{if(recordGesture?.pointerId===event.pointerId)releaseRecordHold();});
  recordButton.addEventListener('pointercancel',cancelRecording);
  recordButton.addEventListener('lostpointercapture',()=>{if(recordGesture?.held)cancelRecording();});
  recordButton.addEventListener('contextmenu',event=>event.preventDefault());
  recordButton.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)beginRecordHold('keyboard');}else if(event.key==='Escape')cancelRecording();});
  recordButton.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(recordGesture?.pointerId==='keyboard')releaseRecordHold();}});
  recordButton.onclick=event=>{if(event.detail===0&&!recordGesture){recordMode=recordMode==='audio'?'video':'audio';paintRecordButton();}};
  window.addEventListener('blur',cancelRecording);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&recordGesture)cancelRecording();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancelRecording();});
  paintRecordButton();
  async function showInfo(tab='members'){
    if(!room)return;rightMode='info';panel('right',true);el('msgRightTitle').textContent='Chat info';el('msgInfoContent').hidden=false;el('msgSearchContent').hidden=true;const selected=data.rooms.find(r=>r.id===room);if(!selected)return;
    const id=room;let members=membersCache.get(id);if(!members){const result=await request('members',{roomId:id});members=result.members;membersCache.set(id,members);}if(id!==room||rightMode!=='info')return;
    const rows=[...(historyCache.get(room+':personal')?.rows||[]),...(historyCache.get(room+':learning')?.rows||[])];let extra='';
    if(tab==='members')extra='<div class="chat-info-members"><h3>Members \u00b7 '+members.length+'</h3><label class="chat-search">'+icon('search')+'<input type="search" id="msgMemberSearch" placeholder="Name" aria-label="Search members"></label>'+members.map(m=>'<div class="chat-member" data-member-name="'+escape(m.name.toLocaleLowerCase())+'">'+avatar(m.name,false,m.id)+'<span><strong>'+escape(m.name)+'</strong><small>'+escape(m.role)+'</small></span></div>').join('')+'</div>';
    else{const attachments=rows.filter(m=>!m.deleted).flatMap(m=>m.files||[]).filter(f=>tab==='media'?/^(image|audio|video)\//.test(f.mime):tab==='files'?!/^(image|audio|video)\//.test(f.mime):false);const links=tab==='links'?rows.filter(m=>!m.deleted).flatMap(m=>(m.text.match(/https?:\/\/[^\s<>]+/g)||[])):[];extra='<p class="chat-empty">From loaded messages</p>'+attachments.map(attachment).join('')+links.map(url=>'<a class="chat-file" target="_blank" rel="noopener" href="'+escape(url)+'">'+escape(url)+'</a>').join('');}
    el('msgInfoContent').innerHTML='<div class="chat-info-profile">'+avatar(selected.title,selected.kind==='group',selected.kind==='group'?selected.id:selected.peerId)+'<h3>'+escape(selected.title)+'</h3><small>'+escape(selected.kind==='group'?members.length+' members':'Private conversation')+'</small></div><div class="chat-info-tabs">'+['media','files','links'].map(t=>'<button type="button" data-info-tab="'+t+'">'+t[0].toUpperCase()+t.slice(1)+'</button>').join('')+'</div><label class="chat-setting-row"><span>Mute notifications</span><input id="msgMute" type="checkbox" '+(selected.muted?'checked':'')+'></label><button type="button" class="chat-link" data-info-tab="members">Members</button>'+(selected.access&&!selected.access.protected?'<button type="button" class="chat-link danger" data-relation="'+(selected.access.blockedByMe?'unblock':'block')+'">'+(selected.access.blockedByMe?'Unblock':'Block user')+'</button>':'')+extra;
    if(selected.kind==='group'&&reviewer())el('msgInfoContent').querySelector('.chat-info-profile').insertAdjacentHTML('beforeend','<button type="button" class="chat-link" data-avatar-upload="'+escape(selected.id)+'">Upload group photo</button>');
    if(selected.kind==='direct')el('msgInfoContent').querySelector('.chat-info-profile').insertAdjacentHTML('beforeend','<div class="chat-profile-details" data-profile-details-subject="'+escape(selected.peerId)+'"></div>');
    el('msgMute').onchange=async event=>{try{const result=await request('mute',{roomId:id,muted:event.target.checked});upsertRoom(result.room);}catch(error){status(error.message);}};el('msgMemberSearch')?.addEventListener('input',event=>{const q=event.target.value.toLocaleLowerCase();el('msgInfoContent').querySelectorAll('[data-member-name]').forEach(n=>n.hidden=!n.dataset.memberName.includes(q));});icons();scheduleProfiles();
  }
  function showSearch(){if(!room)return;rightMode='search';panel('right',true);el('msgRightTitle').textContent='Search';el('msgInfoContent').hidden=true;el('msgSearchContent').hidden=false;el('msgTextSearch').focus();}
  async function search(older=false){const q=el('msgTextSearch').value.trim(),id=room,c=kind,token=++searchToken;el('msgSearchMore').hidden=true;if(!q){el('msgSearchResults').replaceChildren();return;}const result=await request('history',{roomId:id,category:c,q,...(older?{before:searchBefore}:{})});if(token!==searchToken||id!==room||q!==el('msgTextSearch').value.trim())return;const html=[...result.messages].reverse().map(m=>'<button type="button" class="chat-search-result" data-search-id="'+m.id+'"><strong>'+escape(m.sender)+'</strong>'+escape(m.text.slice(0,240))+'<small>'+escape(stamp(m.createdMs||m.created*1000))+'</small></button>').join('');if(older)el('msgSearchResults').insertAdjacentHTML('beforeend',html);else el('msgSearchResults').innerHTML=html||'<div class="chat-empty">No matches.</div>';searchBefore=result.messages[0]?.id||0;el('msgSearchMore').hidden=!result.more;}
  let messageFocusTimer;
  function clearMessageFocus(){clearTimeout(messageFocusTimer);timeline.querySelectorAll('.is-focused').forEach(node=>node.classList.remove('is-focused'));}
  timeline.addEventListener('click',clearMessageFocus);
  async function focusMessage(id,category=kind){if(category!==kind){kind=category;badge();}let node=timeline.querySelector('[data-msg-id="'+id+'"]');if(!node){await history({before:id+1});node=timeline.querySelector('[data-msg-id="'+id+'"]');}if(!node){status('Original message unavailable.');return;}stickBottom=false;rightMode='';if(innerWidth<=700)panel('right',false);clearMessageFocus();node.classList.add('is-focused');messageFocusTimer=setTimeout(clearMessageFocus,1500);node.scrollIntoView({block:'center'});node.focus({preventScroll:true});scheduleRead();}
  el('msgTextSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search().catch(error=>status(error.message)),220);};el('msgSearchMore').onclick=()=>search(true).catch(error=>status(error.message));
  function dialog(title,html,submit){const node=document.createElement('dialog');node.className='chat-dialog';node.style.maxWidth='520px';node.innerHTML='<header class="chat-dialog-head"><h2>'+escape(title)+'</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">'+icon('x')+'</button></header><form>'+html+'<p role="status"></p>'+(submit?'<button type="submit" class="primary">'+escape(title)+'</button>':'')+'</form>';node.querySelector('[data-msg-close]').onclick=()=>node.close();node.onclose=()=>node.remove();if(submit)node.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=node.querySelector('[type=submit]');button.disabled=true;try{await submit(new FormData(event.target));node.close();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};document.body.append(node);node.showModal();icons();return node;}
  function conversationChooser(title,onChoose,details='',onlyPerson=''){
    if(!ready){connect();status('Wait for the connection, then open New chat.');return;}
    const contacts=[...data.contacts,...data.rooms.filter(r=>r.kind==='direct'&&r.peerId&&r.access?.state==='accepted'&&!r.access.blocked).map(r=>({id:r.peerId,name:r.title,role:'Contact'}))],rows=[...data.groups.map(g=>({id:g.id,name:g.title,kind:'group',role:'Group chat'})),...[...new Map(contacts.map(p=>[p.id,p])).values()].map(p=>({...p,kind:'direct'}))].filter(p=>!onlyPerson||p.kind==='direct'&&p.id===onlyPerson);
    const node=dialog(title,details+'<label class="chat-search"><input id="msgContactSearch" type="search" placeholder="Name, full email or login" aria-label="Search contacts"></label><button type="button" class="chat-link" data-find-person'+(onlyPerson?' hidden':'')+'>'+icon('search')+' Find by email or login</button><div class="chat-new-list"></div>');
    const paint=()=>{node.querySelector('.chat-new-list').innerHTML=rows.map((r,i)=>'<button type="button" class="chat-contact" data-contact-index="'+i+'">'+avatar(r.name,r.kind==='group',r.kind==='group'?'group:'+r.id:r.id)+'<span>'+escape(r.name)+'<small>'+escape(r.role)+'</small></span></button>').join('');scheduleProfiles();};paint();
    node.querySelector('#msgContactSearch').placeholder='Name, email, login or @username';node.querySelector('[data-find-person]').lastChild.textContent=' Find by email, login or @username';
    node.querySelector('#msgContactSearch').oninput=event=>{const q=event.target.value.toLocaleLowerCase();node.querySelectorAll('[data-contact-index]').forEach(n=>n.hidden=!rows[Number(n.dataset.contactIndex)].name.toLocaleLowerCase().includes(q));};
    node.querySelector('[data-find-person]').onclick=async event=>{if(onlyPerson)return;event.currentTarget.disabled=true;try{const result=await request('lookup',{query:node.querySelector('#msgContactSearch').value});if(!node.open)return;if(!result.person){node.querySelector('[role=status]').textContent='No account found.';return;}let index=rows.findIndex(r=>r.kind==='direct'&&r.id===result.person.id);if(index<0){rows.push({...result.person,kind:'direct'});index=rows.length-1;}paint();node.querySelectorAll('[data-contact-index]').forEach(b=>b.hidden=Number(b.dataset.contactIndex)!==index);node.querySelector('[role=status]').textContent='';icons();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{node.querySelector('[data-find-person]').disabled=false;}};
    node.querySelector('form').onsubmit=event=>{event.preventDefault();node.querySelector('[data-find-person]').click();};
    node.querySelector('.chat-new-list').onclick=async event=>{const button=event.target.closest('[data-contact-index]');if(!button)return;button.disabled=true;try{const row=rows[Number(button.dataset.contactIndex)],result=await request('open',row.kind==='group'?{kind:'group',groupId:row.id}:{kind:'direct',accountId:row.id});upsertRoom(result.room);await onChoose(result);node.close();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};
  }
  function newChat(){conversationChooser('New chat',async result=>{kind='personal';await openRoom(result.roomId);});}
  function forwardMessage(id){const ids=Array.isArray(id)?id:[id],messages=ids.map(findMessage).filter(Boolean);if(!messages.length||messages.some(m=>m.deleted||m.category!=='personal'))return;const restricted=[...new Set(messages.map(m=>m.forwardTo).filter(Boolean))];if(restricted.length>1||restricted[0]===account){status('Study references can only be forwarded to their teacher.');return;}const sourceRoomId=room,keys=messages.map(()=>crypto.randomUUID());conversationChooser('Forward message',async result=>{for(let i=0;i<messages.length;i++)await request('forward',{sourceRoomId,messageId:messages[i].id,targetRoomId:result.roomId,clientKey:keys[i]});status('');kind='personal';await openRoom(result.roomId);},'<div class="chat-forward-summary"><strong>'+escape(messages.length===1?messages[0].sender:messages.length+' messages')+'</strong><p>'+escape(messages[0].text.slice(0,180)||messages[0].files?.[0]?.name||'Attachment')+'</p></div>',restricted[0]||'');}
  function studyReference(message,quote=null){
    if(!message||message.deleted||message.senderId===account||message.canStudyReply===false)return;const sourceRoomId=room,clientKey=crypto.randomUUID(),draft='english-chat-alert-reply:'+account+':'+sourceRoomId+':'+message.id;
    const node=dialog('Reply to teacher','<div class="chat-forward-summary"><strong>'+escape(message.sender)+'</strong><p>'+escape(quote||message.text)+'</p></div><p>This reply will go to '+escape(message.sender)+' in Personal.</p><label>Message<textarea name="text" maxlength="4000" rows="4" placeholder="Add a comment"></textarea></label>',async()=>{
      const text=area.value.trim(),result=await request('study-reply',{sourceRoomId,messageId:message.id,text,quote,format:window.TextColors?.trim(colorFormat,area.value)||null,clientKey});try{localStorage.removeItem(draft);}catch{}upsertRoom(result.room);kind='personal';await openRoom(result.roomId);status('Sent to the teacher\'s personal chat. Continue the conversation here.');
    });const area=node.querySelector('textarea');let colorFormat=null;try{area.value=localStorage.getItem(draft)||'';}catch{}area.oninput=()=>{try{localStorage.setItem(draft,area.value);}catch{}};window.TextColors?.mount(area,{onChange:value=>{colorFormat=value;}});area.focus();
  }
  async function replyMessage(message){if(!message||message.deleted)return;if(message.category==='learning'&&message.senderId!==account&&message.canStudyReply!==false){studyReference(message);return;}if(message.category==='learning'){kind='personal';badge();paintRooms();await history();}reply=message;paintDraft();remember();focusComposer();}
  function closeContext(){el('msgContext').hidden=true;contextMessage=null;contextRoom='';}
  function saveFile(file){if(!file?.url?.startsWith('/api/messages/file?'))return;const link=document.createElement('a');link.href=file.url+'&download=1';link.download=file.name;document.body.append(link);link.click();link.remove();}
  function canEdit(message){return message.canEdit??(message.senderId===account&&!message.examId);}
  function messageMenu(message,x,y,fileId=''){
    const selected=getSelection(),textNode=timeline.querySelector('[data-msg-id="'+message?.id+'"] .chat-message-text');let quote='';
    if(selected?.rangeCount&&!selected.isCollapsed&&textNode){const range=selected.getRangeAt(0);if(textNode.contains(range.startContainer)&&textNode.contains(range.endContainer)){const read=n=>n.nodeType===3?n.textContent:n.nodeName==='BR'?'\n':[...n.childNodes].map(read).join('');const fragment=read(range.cloneContents()).trim();if(fragment&&fragment.length<=4000&&message.text.includes(fragment))quote=fragment;}}
    if(!message||message.deleted||!Number.isSafeInteger(message.id))return;closeEmoji();contextMessage=message;contextRoom=room;const node=el('msgContext'),study=message.category==='learning',canReply=!study||message.senderId!==account&&message.canStudyReply!==false,items=[];
    if(canReply)items.push(['reply','reply','Reply']);
    node.dataset.quote=quote;if(canReply&&quote)items.push(['quote','quote','Quote selection']);if(el('selpop'))el('selpop').hidden=true;
    if(message.files?.length)items.push(['save','download','Save as...']);
    if(canEdit(message)&&message.text)items.push(['edit','square-pen','Edit']);
    items.push(['pin','pin',data.rooms.find(r=>r.id===room)?.pinned?.id===message.id?'Unpin':'Pin']);
    if((!study||canReply)&&message.forwardTo!==account)items.push(['forward','forward','Forward']);items.push(['select','circle-check','Select']);if(canEdit(message))items.push(['delete','trash-2','Delete']);
    node.dataset.fileId=fileId;node.innerHTML='<div class="chat-context-reactions">'+[0x1f44d,0x2764,0x1f602,0x1f389,0x1f525,0x1f914,0x1f44f].map(code=>'<button type="button" data-context-reaction="'+emojiValue(code)+'" aria-label="React '+emojiValue(code)+'">'+emojiValue(code)+'</button>').join('')+'</div>'+items.map(([action,image,label])=>'<button type="button" role="menuitem" data-context-action="'+action+'" class="'+(action==='delete'?'danger':'')+'">'+icon(image)+'<span>'+label+'</span></button>').join('');node.hidden=false;icons();const box=node.getBoundingClientRect();node.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+'px';node.style.top=Math.max(8,Math.min(y,innerHeight-box.height-8))+'px';node.querySelector('[role=menuitem]')?.focus({preventScroll:true});
  }
  function clearSelection(){selection.clear();selecting=false;el('msgSelection').hidden=true;timeline.querySelectorAll('.is-selected').forEach(n=>n.classList.remove('is-selected'));}
  function paintSelection(){const rows=(state()?.rows||[]).filter(m=>selection.has(m.id));el('msgSelection').hidden=!selecting;el('msgSelection').innerHTML='<span>'+rows.length+' selected</span>'+(rows.length&&rows.every(m=>m.category==='personal'&&!m.deleted)?'<button type="button" data-selection-action="forward" title="Forward" aria-label="Forward">'+icon('forward')+'</button>':'')+(rows.length&&rows.every(m=>canEdit(m)&&!m.deleted)?'<button type="button" class="danger" data-selection-action="delete" title="Delete" aria-label="Delete">'+icon('trash-2')+'</button>':'')+'<button type="button" data-selection-action="cancel" title="Cancel selection" aria-label="Cancel selection">'+icon('x')+'</button>';timeline.querySelectorAll('.msg-message').forEach(n=>n.classList.toggle('is-selected',selection.has(Number(n.dataset.msgId))));icons();}
  function editMessage(message,id){const node=dialog('Edit message','<label>Message<textarea name="text" required maxlength="4000" rows="4"></textarea></label>',async()=>{await request('edit',{roomId:id,id:message.id,text:area.value.trim(),format:window.TextColors?.trim(format,area.value)||null,expectedEditedMs:message.editedMs||0});});const area=node.querySelector('textarea');let format=message.format||null;area.value=message.text;window.TextColors?.mount(area,{onChange:value=>{format=value;}});window.TextColors?.sync(area,format);area.focus();}
  function deleteMessages(ids,id){
    const node=dialog('Delete?','',async()=>{for(const messageId of ids)await request('delete',{roomId:id,id:messageId});clearSelection();});
    node.classList.add('chat-delete-confirm');node.style.maxWidth='280px';node.querySelector('[data-msg-close]').remove();
    const submit=node.querySelector('[type=submit]');submit.textContent='Deleted';submit.classList.add('danger');
    const actions=document.createElement('div');actions.className='chat-delete-actions';submit.before(actions);actions.append(submit);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.className='chat-link';cancel.onclick=()=>node.close();actions.append(cancel);cancel.focus();
    node.addEventListener('click',event=>{const rect=node.getBoundingClientRect();if(event.target===node&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))node.close();});
  }
  el('msgContext').onclick=async event=>{const target=event.target.closest('[data-context-action],[data-context-reaction]');if(!target||!contextMessage)return;const message=contextMessage,id=contextRoom,fileId=el('msgContext').dataset.fileId;closeContext();try{
    if(target.dataset.contextReaction){await request('react',{roomId:id,id:message.id,emoji:target.dataset.contextReaction});return;}
    if(target.dataset.contextAction==='quote'){const quote=el('msgContext').dataset.quote;if(!quote)return;if(message.category==='learning')studyReference(message,quote);else await replyMessage({...message,text:quote,quote});return;}
    const action=target.dataset.contextAction;if(action==='reply')await replyMessage(message);if(action==='forward'){if(message.category==='learning')studyReference(message);else forwardMessage(message.id);}if(action==='edit')editMessage(message,id);if(action==='delete')deleteMessages([message.id],id);if(action==='pin')await request('pin',{roomId:id,id:message.id,pinned:data.rooms.find(r=>r.id===id)?.pinned?.id!==message.id});if(action==='select'){selecting=true;selection.add(message.id);paintSelection();}if(action==='save'){const file=message.files.find(f=>f.id===fileId)|| (message.files.length===1?message.files[0]:null);if(file)saveFile(file);else{const node=dialog('Save as...',message.files.map((f,i)=>'<button class="chat-contact" type="button" data-save-index="'+i+'">'+icon('download')+escape(f.name)+'</button>').join(''));node.querySelectorAll('[data-save-index]').forEach(b=>b.onclick=()=>{saveFile(message.files[Number(b.dataset.saveIndex)]);node.close();});}}
  }catch(error){status(error.message);}};
  timeline.oncontextmenu=event=>{const node=event.target.closest('.msg-message');if(!node)return;const message=state()?.rows.find(m=>m.id===Number(node.dataset.msgId));if(!message||message.deleted)return;event.preventDefault();messageMenu(message,event.clientX,event.clientY,event.target.closest('[data-file-id]')?.dataset.fileId);};
  el('msgInfoContent').oncontextmenu=event=>{const file=event.target.closest('[data-file-id]');if(!file)return;const message=[...(historyCache.get(room+':personal')?.rows||[]),...(historyCache.get(room+':learning')?.rows||[])].find(m=>!m.deleted&&m.files?.some(f=>f.id===file.dataset.fileId));if(message){event.preventDefault();messageMenu(message,event.clientX,event.clientY,file.dataset.fileId);}};
  let hold,holdAt,suppressClick=0;timeline.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;const node=event.target.closest('.msg-message');if(!node)return;holdAt={x:event.clientX,y:event.clientY};hold=setTimeout(()=>{suppressClick=Date.now()+800;messageMenu(state()?.rows.find(m=>m.id===Number(node.dataset.msgId)),holdAt.x,holdAt.y,event.target.closest('[data-file-id]')?.dataset.fileId);},550);});
  timeline.addEventListener('pointermove',event=>{if(holdAt&&Math.hypot(event.clientX-holdAt.x,event.clientY-holdAt.y)>10)clearTimeout(hold);});for(const type of ['pointerup','pointercancel','scroll'])timeline.addEventListener(type,()=>clearTimeout(hold));
  timeline.addEventListener('click',event=>{if(Date.now()<suppressClick){event.preventDefault();event.stopImmediatePropagation();return;}if(!selecting)return;const node=event.target.closest('.msg-message');if(!node)return;event.preventDefault();event.stopImmediatePropagation();const id=Number(node.dataset.msgId);if(selection.has(id))selection.delete(id);else selection.add(id);paintSelection();},true);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#msgContext,[data-msg-menu]'))closeContext();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeContext();clearSelection();}if(!el('msgContext').hidden&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...el('msgContext').querySelectorAll('[role=menuitem]')],at=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){const node=event.target.closest('.msg-message');if(node){event.preventDefault();const box=node.getBoundingClientRect();messageMenu(state()?.rows.find(m=>m.id===Number(node.dataset.msgId)),box.left+20,box.top+20);}}});
  el('msgSelection').onclick=event=>{const action=event.target.closest('[data-selection-action]')?.dataset.selectionAction;if(action==='cancel')clearSelection();if(action==='forward')forwardMessage([...selection]);if(action==='delete')deleteMessages([...selection],room);};
  el('msgPinned').onclick=()=>{const pinned=data.rooms.find(r=>r.id===room)?.pinned;if(pinned)focusMessage(pinned.id,pinned.category).catch(error=>status(error.message));};
  async function blockedUsers(){const result=await request('blocked'),node=dialog('Blocked users','<div class="chat-blocked-list"></div>');const paint=users=>{node.querySelector('.chat-blocked-list').innerHTML=users.length?users.map(u=>'<div class="chat-blocked-user"><span>'+escape(u.name)+'</span><button type="button" class="chat-link" data-unblock-room="'+escape(u.roomId)+'">Unblock</button></div>').join(''):'<p>No blocked users.</p>';};paint(result.users);node.onclick=async event=>{const button=event.target.closest('[data-unblock-room]');if(!button)return;button.disabled=true;try{const result=await request('relation',{roomId:button.dataset.unblockRoom,action:'unblock'});upsertRoom(result.room);paint((await request('blocked')).users);paintRooms();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};}
  function showContacts(){listMode='contacts';el('msgRoomSearch').value='';badge();paintRooms();panel('left',true);}
  el('msgLookup').onclick=async()=>{el('msgLookup').disabled=true;try{const result=await request('lookup',{query:el('msgRoomSearch').value});if(!result.person){status('No account found.');return;}if(!data.contacts.some(p=>p.id===result.person.id))data.contacts.push(result.person);el('msgRoomSearch').value=result.person.name;paintRooms();status('');}catch(error){status(error.message);}finally{el('msgLookup').disabled=false;}};
  el('msgRoomSearch').onkeydown=event=>{if(event.key==='Enter'&&listMode==='contacts'){event.preventDefault();el('msgLookup').click();}};
  async function domain(path,body){const gen=generation,response=await fetch('/api/messages'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),value=await response.json();if(gen!==generation)throw new Error('Account changed.');if(!response.ok)throw new Error(value.error||'Request failed.');return value;}
  el('msgAssign').onclick=async()=>{try{await examPull(examDirty);examDirty=false;const exams=examLoad().filter(e=>!e.instanceStatus);dialog('Assign exam','<label>Exam<select name="exam" required>'+exams.map(e=>'<option value="'+e.id+'">'+escape(e.title)+'</option>').join('')+'</select></label><label>Recipient<select name="target">'+data.groups.map(g=>'<option value="group:'+g.id+'">'+escape(g.title)+'</option>').join('')+data.contacts.filter(p=>p.role==='Student').map(p=>'<option value="student:'+p.id+'">'+escape(p.name)+'</option>').join('')+'</select></label><label>Action<select name="action"><option value="assign">Assign</option><option value="unassign">Unassign</option></select></label>',async form=>{const target=String(form.get('target')),at=target.indexOf(':');await domain('/assignment',{targetKind:target.slice(0,at),targetId:target.slice(at+1),examId:Number(form.get('exam')),action:form.get('action'),clientKey:crypto.randomUUID()});await examPull(true);if(target.startsWith('group:'))await groupPull(true);});}catch(error){status(error.message);}};
  function dressUserSettings(pane){
    pane.querySelectorAll('input[type=checkbox]').forEach(input=>{if(input.closest('.settings-switch'))return;const wrap=document.createElement('span');wrap.className='settings-switch';input.before(wrap);wrap.append(input);const track=document.createElement('span');track.setAttribute('aria-hidden','true');wrap.append(track);});
    const root=pane.querySelector('[data-settings-sounds]');if(root){const label=root.querySelector('select')?.closest('label'),actions=root.querySelector('.sound-actions');if(label&&actions&&!label.closest('.settings-sound-choice')){const row=document.createElement('div');row.className='settings-sound-choice';label.before(row);row.append(label,actions);}const file=root.querySelector('[type=file]');if(file&&!file.nextElementSibling?.classList.contains('settings-action')){file.hidden=true;const upload=document.createElement('button');upload.type='button';upload.className='settings-action';upload.innerHTML=icon('upload')+'Upload audio';file.after(upload);upload.onclick=()=>file.click();const name=document.createElement('span');name.className='settings-file-name';upload.after(name);file.addEventListener('change',()=>{name.textContent=file.files[0]?.name||'';});}}
    icons();
  }
  document.addEventListener('notification-sounds-rendered',event=>{const pane=event.target.closest('.user-settings .chat-settings-content');if(pane)dressUserSettings(pane);});
  function settings(initial='profile'){
    if(typeof initial!=='string')initial='profile';
    if(!current())return;
    document.querySelector('dialog.user-settings')?.close();
    let tabVersion=0,releasePortal=()=>{};
    const profile=data.profile||current(),node=document.createElement('dialog');node.className='chat-dialog user-settings';node.innerHTML='<div class="chat-dialog-body"><aside class="chat-settings-menu"><h2>Settings</h2><div class="chat-settings-profile">'+avatar(profile.name,false,profile.id)+'<span><strong>'+escape(profile.name||profile.login)+'</strong><br><small>'+escape(profile.role)+'</small></span></div><h3>Common</h3>'+[['profile','user-round','Profile'],['notifications','bell','Notifications'],['interface','paintbrush','Interface'],['theme','palette','Theme'],['statistics','chart-no-axes-combined','Statistics'],['messages','messages-square','Messages'],['blocked','user-round-x','Blocked users'],['security','shield','Security'],['help','circle-help','Help']].map(([id,image,title])=>'<button type="button" data-settings-tab="'+id+'">'+icon(image)+escape(title)+'</button>').join('')+'</aside><div class="chat-settings-content"></div></div>';document.body.append(node);node.onclose=()=>{releasePortal();window.NotificationSounds?.stop();node.remove();};node.showModal();
    node.addEventListener('close',()=>window.NotificationSounds?.load(current()?.id||''));
    function mountSection(id,pane){const section=document.getElementById(id);if(!section)return;const marker=document.createComment('settings-section'),style=section.getAttribute('style');section.before(marker);pane.append(section);section.style.display='block';releasePortal=()=>{marker.replaceWith(section);if(style===null)section.removeAttribute('style');else section.setAttribute('style',style);releasePortal=()=>{};};}
    const toggle=(key,label,description,checked)=>'<label class="settings-row"><span class="settings-text"><strong>'+label+'</strong><small>'+description+'</small></span><span class="settings-switch"><input type="checkbox" data-pref="'+key+'" aria-label="'+label+'"'+(checked?' checked':'')+'><span aria-hidden="true"></span></span></label>';
    async function tab(id){node.querySelectorAll('[data-settings-tab]').forEach(b=>b.classList.toggle('on',b.dataset.settingsTab===id));const pane=node.querySelector('.chat-settings-content');let html='';
      const version=++tabVersion,gen=generation;releasePortal();window.NotificationSounds?.stop();let details,initialUsername='',privateDetails;
      if(id==='profile'){
        const response=await fetch('/api/me/account',{credentials:'same-origin',cache:'no-store'});details=await response.json();if(!response.ok)throw new Error(details.error||'Profile unavailable.');if(!node.open||version!==tabVersion||gen!==generation)return;
        const fresh=await request('profiles',{ids:[profile.id]});if(!node.open||version!==tabVersion||gen!==generation)return;for(const p of fresh.profiles)profileViews[p.id]=p;
        privateDetails=(await domain('/profile')).details;if(!node.open||version!==tabVersion||gen!==generation)return;
        const saved=details.change||details.user,name=String(saved.name??profile.name??''),names=name.split(/\s+/),username=profileViews[profile.id]?.username||'';initialUsername=username;
        html='<form class="chat-edit-profile"><div class="chat-edit-identity"><button type="button" class="chat-photo-select" data-avatar-upload="'+escape(profile.id)+'" title="Change photo" aria-label="Change photo">'+avatar(profile.name,false,profile.id)+'<span class="chat-photo-camera">'+icon('camera')+'</span></button><div><label>First name<input name="firstName" maxlength="80" value="'+escape(names[0]||'')+'"'+(details.locked?' readonly':'')+'></label><label>Last name<input name="lastName" maxlength="80" value="'+escape(names.slice(1).join(' '))+'"'+(details.locked?' readonly':'')+'></label></div></div><label>Email<input name="email" type="email" required maxlength="120" autocomplete="email" value="'+escape(saved.email||profile.email||'')+'"'+(details.locked?' readonly':'')+'></label><label>Username<input name="username" maxlength="33" autocomplete="off" placeholder="@username" pattern="@[A-Za-z0-9_]{3,32}" value="'+escape(username)+'"></label><p role="status">'+(details.change?'Changes awaiting approval.':details.locked?'Name and email changes are currently locked.':'')+'</p><button type="submit" class="primary" data-profile-save>Done</button></form><button class="chat-link" type="button" data-profile-open>My account</button><button class="chat-link" type="button" data-chat-blocked>Blocked users</button>';
      }
      if(id==='notifications')html=toggle('notifications','Desktop notifications','New messages outside the active window',prefs.notifications)+'<div data-settings-sounds></div>';
      if(id==='interface'||id==='messages')html=[['left','Conversation list','Show conversations in the sidebar'],['right','Chat info','Show details about the selected conversation'],['enter','Enter sends messages','Shift+Enter starts a new line']].map(([p,label,description])=>toggle(p,label,description,prefs[p]!==false)).join('')+(id==='messages'?'<button class="btn" type="button" data-settings-chat>Open messages</button>':'');
      if(id==='security'){const result=await request('sessions');if(!node.open)return;html='<p>Connected sessions: '+result.sessions.length+'</p><button type="button" class="settings-action" data-settings-password>'+icon('key-round')+'Change password</button><div data-settings-password-slot></div><button type="button" class="settings-action" data-logout>'+icon('log-out')+'Log out</button><hr><button type="button" class="settings-action danger" data-account="revoke">'+icon('trash-2')+'Delete my data</button>';}
      if(id==='blocked'){const result=await request('blocked');html=result.users.length?result.users.map(user=>'<div class="settings-row"><span>'+escape(user.name)+'</span><button type="button" class="btn" data-settings-unblock="'+escape(user.roomId)+'">Unblock</button></div>').join(''):'<p>No blocked users.</p>';}
      if(id==='help')html='<p>Personal contains conversations. Study alerts contains important teacher announcements and exam notices.</p><p>Shift+Enter adds a new line. Search finds messages in the selected category. Your draft is saved on this device.</p><p>Grey checks show delivery; blue checks mean everyone in the conversation has read the message.</p>';
      if(!node.open||version!==tabVersion||gen!==generation)return;
      pane.innerHTML='<header class="chat-dialog-head"><h2>'+id[0].toUpperCase()+id.slice(1)+'</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">'+icon('x')+'</button></header>'+html;pane.querySelector('[data-msg-close]').onclick=()=>node.close();pane.querySelector('[data-logout]')?.addEventListener('click',()=>{node.close();performLogout();});
      pane.querySelector('[data-profile-open]')?.remove();pane.querySelector('[data-chat-blocked]')?.remove();
      if(id==='theme'){mountSection('themes',pane);paintThemeSegs();}
      if(id==='statistics'){mountSection('stats',pane);paintStats();}
      if(id==='help'){pane.querySelectorAll('p').forEach(p=>p.remove());mountSection('guide',pane);paintGuide();}
      if(id==='notifications')await window.NotificationSounds?.mount(pane.querySelector('[data-settings-sounds]'));
      if(!node.open||version!==tabVersion||gen!==generation)return;
      if(id==='profile'){
        const form=pane.querySelector('.chat-edit-profile'),saved=details.change||details.user;
        form.querySelector('[name=email]').closest('label').insertAdjacentHTML('beforebegin','<label>Login<input name="login" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" required value="'+escape(saved.login||details.user.login)+'"'+(details.locked?' readonly':'')+'></label>');
      }
      pane.querySelector('[data-settings-chat]')?.addEventListener('click',()=>{node.close();window.enquizVisit('messages');});
      pane.querySelectorAll('[data-settings-unblock]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await request('relation',{roomId:button.dataset.settingsUnblock,action:'unblock'});upsertRoom(result.room);await tab('blocked');paintRooms();}catch(error){button.disabled=false;status(error.message);}});
      pane.querySelector('[data-settings-password]')?.addEventListener('click',()=>{const slot=pane.querySelector('[data-settings-password-slot]');slot.innerHTML='<form id="ownPasswordForm"><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" minlength="8" maxlength="32" autocomplete="new-password" required></label><label>Repeat password<input name="repeat" type="password" minlength="8" maxlength="32" autocomplete="new-password" required></label><p data-form-status role="status"></p><button class="btn primary" type="submit">Save password</button></form>';});
      pane.querySelectorAll('[data-pref]').forEach(input=>input.onchange=async()=>{const p=input.dataset.pref;if(p==='notifications'&&input.checked){if(!window.Notification){input.checked=false;return;}const permission=await Notification.requestPermission();input.checked=permission==='granted';}prefs[p]=input.checked;if(p==='left')panel('left',input.checked);if(p==='right'){if(input.checked)showInfo().catch(error=>status(error.message));else panel('right',false);}savePrefs();});icons();
      const form=pane.querySelector('.chat-edit-profile');if(form){
        form.querySelector('[role=status]').insertAdjacentHTML('beforebegin','<label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="32" value="'+escape(privateDetails.phone)+'"></label><label class="chat-profile-visibility"><span>Show phone on profile</span><input type="checkbox" name="phoneVisible" '+(privateDetails.phoneVisible?'checked':'')+'></label><label>Birthday<input name="birthday" type="date" max="'+new Date().toISOString().slice(0,10)+'" value="'+escape(privateDetails.birthday)+'"></label><label class="chat-profile-visibility"><span>Show birthday on profile</span><input type="checkbox" name="birthdayVisible" '+(privateDetails.birthdayVisible?'checked':'')+'></label>');
        const header=pane.querySelector('.chat-dialog-head'),done=form.querySelector('[data-profile-save]');header.querySelector('h2').textContent='Profile';form.id='chat-edit-'+crypto.randomUUID();done.setAttribute('form',form.id);header.querySelector('[data-msg-close]').before(done);
        const birthday=form.elements.birthday,wrap=document.createElement('span');wrap.className='chat-birthday-field';birthday.before(wrap);wrap.append(birthday);birthday.type='text';birthday.removeAttribute('max');birthday.inputMode='numeric';birthday.placeholder='DD.MM.YYYY';birthday.pattern='\\d{2}\\.\\d{2}\\.\\d{4}';birthday.maxLength=10;birthday.value=privateDetails.birthday?dateLabel(privateDetails.birthday):'';
        wrap.insertAdjacentHTML('beforeend','<button type="button" class="chat-icon" data-birthday-calendar title="Choose date" aria-label="Choose date">'+icon('calendar-days')+'</button><input type="date" class="chat-birthday-picker" tabindex="-1" aria-hidden="true" max="'+new Date().toISOString().slice(0,10)+'">');const picker=wrap.querySelector('[type=date]');wrap.querySelector('button').onclick=()=>{picker.value=birthdayIso(birthday.value);picker.showPicker?.();};picker.onchange=()=>{birthday.value=picker.value?dateLabel(picker.value):'';};icons();
        const input=form.elements.username;input.addEventListener('blur',()=>{if(input.value.trim()&&!input.value.trim().startsWith('@'))input.value='@'+input.value.trim();});
        form.onsubmit=async event=>{event.preventDefault();const button=done,notice=form.querySelector('[role=status]'),saved=details.change||details.user,name=[form.elements.firstName.value.trim(),form.elements.lastName.value.trim()].filter(Boolean).join(' '),email=form.elements.email.value.trim().toLowerCase(),username=input.value.trim().toLowerCase(),extras={phone:form.elements.phone.value.trim(),phoneVisible:form.elements.phoneVisible.checked,birthday:form.elements.birthday.value,birthdayVisible:form.elements.birthdayVisible.checked};if(name.length>80){notice.textContent='Name must be 80 characters or fewer.';return;}if(!form.reportValidity())return;button.disabled=true;let profileSaved=false;
          try{
            extras.birthday=birthdayIso(extras.birthday);
            if(gen!==generation||signedIn()?.id!==profile.id)throw new Error('Account changed.');
            if(username!==initialUsername){const result=await domain('/username',{username,expectedUsername:initialUsername});profileViews[result.profile.id]=result.profile;initialUsername=result.profile.username;profileSaved=true;scheduleProfiles();}
            if(Object.keys(extras).some(key=>extras[key]!==privateDetails[key])){const result=await domain('/profile',extras);privateDetails=result.details;profileViews[result.profile.id]=result.profile;profileSaved=true;scheduleProfiles();}
            const login=form.elements.login.value,changed=name!==(saved.name||'')||email!==saved.email||login!==(saved.login||details.user.login);
            if(changed){if(gen!==generation||signedIn()?.id!==profile.id)throw new Error('Account changed.');const response=await fetch('/api/me/account',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,email,name})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Profile changes could not be submitted.');if(typeof ownAccountData!=='undefined')ownAccountData=null;}
            if(gen!==generation)return;notice.textContent=changed?'Account changes sent for approval.':'Saved';
          }catch(error){notice.textContent=(profileSaved?'Some profile changes were saved; remaining changes were not saved: ':'')+error.message;}finally{button.disabled=false;}
        };
      }
      dressUserSettings(pane);scheduleProfiles();
    }
    node.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>tab(button.dataset.settingsTab).then(scheduleProfiles).catch(error=>{if(node.open)node.querySelector('.chat-settings-content').insertAdjacentHTML('beforeend','<p role="alert">'+escape(error.message)+'</p>');}));tab(initial).catch(error=>{node.querySelector('.chat-settings-content').innerHTML='<p role="alert">'+escape(error.message)+'</p><button class="btn" type="button" data-close-settings>Close</button>';node.querySelector('[data-close-settings]').onclick=()=>node.close();});scheduleProfiles();
  }
  document.addEventListener('click',event=>{
    if(!current())return;const target=event.target.closest('.brand-account,[data-user-settings],[data-chat-blocked],[data-notification-sounds],[data-jump="account"],[data-jump="profile"],[data-jump="stats"],[data-jump="guide"],[data-jump="themes"],[data-theme-cycle]');
    if(!target||target.closest('.user-settings'))return;event.preventDefault();event.stopImmediatePropagation();const page=target.dataset.jump;settings(target.hasAttribute('data-chat-blocked')?'blocked':target.hasAttribute('data-notification-sounds')?'notifications':target.hasAttribute('data-theme-cycle')||page==='themes'?'theme':page==='stats'?'statistics':page==='guide'?'help':'profile');
  },true);
  el('msgProfile').onclick=settings;el('msgSettings').onclick=settings;el('msgNew').onclick=newChat;el('msgContacts').onclick=showContacts;el('msgContactsTab').onclick=showContacts;el('msgChats').onclick=()=>{if(!ready)connect();listMode='chats';el('msgRoomSearch').value='';badge();paintRooms();panel('left',true);};el('msgExit').onclick=()=>window.enquizVisit('home');
  el('msgHideList').onclick=()=>{panel('left',false);scheduleRead();};el('msgListBack').onclick=()=>panel('left',true);el('msgHideInfo').onclick=()=>{rightMode='';panel('right',false);scheduleRead();};el('msgSearch').onclick=showSearch;el('msgInfo').onclick=()=>showInfo().catch(error=>status(error.message));el('msgRoomInfo').onclick=el('msgInfo').onclick;
  el('msgRoomSearch').oninput=paintRooms;el('msgUnread').onclick=()=>{unreadOnly=!unreadOnly;el('msgUnread').setAttribute('aria-pressed',String(unreadOnly));paintRooms();};el('msgLatest').onclick=()=>{timeline.scrollTop=timeline.scrollHeight;el('msgLatest').hidden=true;scheduleRead();};
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-msg-open],[data-msg-original],[data-msg-room],[data-msg-category],[data-msg-reply],[data-msg-forward],[data-contact-id],[data-msg-quote],[data-msg-exam],[data-msg-cancel-reply],[data-remove-file],[data-emoji],[data-emoji-category],[data-info-tab],[data-search-id],[data-msg-menu],[data-reaction],[data-relation],[data-chat-blocked],[data-cancel-upload]');if(!target)return;
    try{
      if(target.hasAttribute('data-msg-open')){if(!current())return;window.enquizVisit('messages');checkAuth();if(!ready)connect();}
      else if(target.dataset.msgRoom)await openRoom(target.dataset.msgRoom);
      else if(target.dataset.msgOriginal){const gen=generation,source=room,result=await request('original',{roomId:source,id:Number(target.dataset.msgOriginal)});if(gen!==generation||room!==source)return;kind=result.category;await openRoom(result.roomId);await focusMessage(result.messageId,result.category);}
      else if(target.dataset.msgCategory){closeEmoji();closeContext();clearSelection();listMode='chats';kind=target.dataset.msgCategory;badge();paintRooms();await history();}
      else if(target.dataset.contactId){const result=await request('open',{kind:'direct',accountId:target.dataset.contactId});upsertRoom(result.room);kind='personal';await openRoom(result.roomId);}
      else if(target.dataset.msgReply)await replyMessage(state()?.rows.find(m=>m.id===Number(target.dataset.msgReply)));
      else if(target.dataset.msgForward)forwardMessage(Number(target.dataset.msgForward));
      else if(target.dataset.msgMenu){const box=target.getBoundingClientRect();messageMenu(state()?.rows.find(m=>m.id===Number(target.dataset.msgMenu)),box.right,box.bottom);}
      else if(target.dataset.reaction)await request('react',{roomId:room,id:Number(target.dataset.reactionId),emoji:target.dataset.reaction});
      else if(target.dataset.relation){const result=await request('relation',{roomId:room,action:target.dataset.relation});upsertRoom(result.room);paintRooms();}
      else if(target.hasAttribute('data-chat-blocked'))await blockedUsers();
      else if(target.hasAttribute('data-msg-cancel-reply')){reply=null;paintDraft();remember();}
      else if(target.dataset.msgQuote){const parent=findMessage(Number(target.closest('[data-msg-id]')?.dataset.msgId));await focusMessage(Number(target.dataset.msgQuote),parent?.replyCategory||kind);}
      else if(target.dataset.msgExam){const result=await domain('/exam?id='+target.dataset.msgExam);if(result.studentId){await openStudentPages({id:result.studentId,role:'USER'});if(viewAccount?.id!==result.studentId)throw new Error('Exit the current student pages first.');}await examPull(true);examCurrentId=result.examId;window.enquizVisit('examblocks');}
      else if(target.dataset.removeFile){files=files.filter(f=>f.id!==target.dataset.removeFile);paintDraft();remember();}
      else if(target.dataset.cancelUpload){const id=target.dataset.cancelUpload;if(id.startsWith('file:')){if(busy)return;files=files.filter(file=>file.id!==id.slice(5));paintDraft();remember();}else cancelUploads(id);}
      else if(target.dataset.emoji){const value=target.dataset.emoji;if(composer.value.length+value.length>4000)return;if(!window.TextColors?.insert(composer,value))composer.setRangeText(value,composer.selectionStart,composer.selectionEnd,'end');closeEmoji();remember();focusComposer();}
      else if(target.dataset.emojiCategory)paintEmoji(target.dataset.emojiCategory);
      else if(target.dataset.infoTab)await showInfo(target.dataset.infoTab);
      else if(target.dataset.searchId)await focusMessage(Number(target.dataset.searchId));
    }catch(error){status(error.message);}
  });
  // Keep account navigation owned by the application; chat adds only its entry points.
  for(const button of document.querySelectorAll('[data-jump="stats"]')){const next=document.createElement('button');next.type='button';next.className=button.className;next.dataset.msgOpen='';next.textContent='Messages';button.after(next);}
  for(const root of document.querySelectorAll('.side-foot,.mobile-tools'))if(!root.querySelector('[data-msg-open]')){const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.msgOpen='';button.textContent='Messages';const anchor=root.querySelector('[data-jump="account"]');if(anchor)anchor.after(button);else root.prepend(button);}
  for(const root of document.querySelectorAll('#account,#profile')){const row=root.querySelector('[data-jump="stats"]')?.parentElement;if(row&&!row.querySelector('[data-chat-blocked]')){const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.chatBlocked='';button.textContent='Blocked users';row.append(button);}}
  if(typeof dayScreens!=='undefined')dayScreens.messages='account';
  function checkAuth(){
    if(databaseResetting)return;
    const user=signedIn(),next=user?user.id+':'+user.role:'';
    if(signature!==next)window.NotificationSounds?.load(user?.id||'');
    if(signature!==next){remember();cancelUploads();closeContext();clearSelection();cancelRecording();disconnect();document.querySelectorAll('dialog.chat-dialog').forEach(d=>d.close());generation++;signature=next;account=user?.id||'';seq=0;data={rooms:[],contacts:[],groups:[],total:0};room='';reply=null;pending=null;files=[];historyCache.clear();membersCache.clear();cursors.clear();timeline.replaceChildren();composer.value='';prefs={left:true,right:false,enter:true,notifications:false};try{Object.assign(prefs,JSON.parse(localStorage.getItem('english-chat-settings:'+account)||'{}'));}catch{}if(innerWidth<=700)prefs.right=false;el('msgRight').hidden=!prefs.right;el('msgRooms').closest('.chat-list').hidden=!prefs.left;el('msgListBack').hidden=!!prefs.left;el('msgProfile').textContent=initials(user?.name||user?.login);badge();paintRooms();if(user){reconnectCount=0;connect();}}
    if(profileViews._account!==account){profileViews=Object.create(null);profileViews._account=account;profileRequested.clear();}
    const face=el('msgProfile');face.dataset.avatarSubject=user?.id||'';face.dataset.avatarName=user?.name||user?.login||'';
    const interactive=current()?.id||'';if(interactiveAccount!==interactive){interactiveAccount=interactive;badge();}
    document.querySelectorAll('[data-msg-open],#account [data-chat-blocked],#profile [data-chat-blocked]').forEach(b=>b.hidden=!current());
    if(!current()&&active()&&typeof accountChecked!=='undefined'&&accountChecked)window.enquizVisit('account');document.body.classList.toggle('chat-active',active()&&!!current());if(active())fitPanels();
  }
  window.addEventListener('database-context-reset',()=>{databaseResetting=true;generation++;disconnect();cancelUploads();cancelRecording();account='';room='';pending=null;reply=null;files=[];historyCache.clear();membersCache.clear();cursors.clear();timeline.replaceChildren();composer.value='';});
  const observer=new MutationObserver(checkAuth);for(const id of ['account','profile'])if(el(id))observer.observe(el(id),{childList:true,subtree:true});
  const profileObserver=new MutationObserver(rows=>{if(rows.some(row=>!row.target.closest?.('[data-avatar-subject],.account-avatar-row')&&[...row.addedNodes].some(n=>n.nodeType===1&&!n.matches('svg'))))scheduleProfiles();});
  for(const id of ['account','profile','admin','adminuser'])if(el(id))profileObserver.observe(el(id),{childList:true,subtree:true});
  new MutationObserver(()=>{checkAuth();if(active()){if(ready&&room)history().catch(error=>status(error.message));if(!ready)connect();}else if(recordGesture)cancelRecording();}).observe(section,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){checkAuth();if(!socket&&current())connect();scheduleRead();}});window.addEventListener('focus',scheduleRead);
  window.addEventListener('resize',()=>{closeContext();if(innerWidth<=700&&prefs.left&&prefs.right)panel('right',false);fitPanels();});
  function fitKeyboard(){if(window.visualViewport){section.style.height=visualViewport.height+'px';section.style.top=visualViewport.offsetTop+'px';}scheduleInputFit();}
  window.visualViewport?.addEventListener('resize',fitKeyboard);window.visualViewport?.addEventListener('scroll',fitKeyboard);fitKeyboard();
  checkAuth();icons();scheduleProfiles();
})();
