(() => {
  'use strict';
  const section=document.getElementById('messages');if(!section)return;
  const el=id=>document.getElementById(id),timeline=el('msgTimeline'),composer=el('msgText');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>'<i data-lucide="'+name+'"></i>';
  const icons=()=>window.lucide?.createIcons({root:document});
  const current=()=>typeof authUser!=='undefined'&&authUser&&!(typeof viewAccount!=='undefined'&&viewAccount)?authUser:null;
  const reviewer=()=>['ADMIN','DEVELOPER'].includes(current()?.role);
  const active=()=>section.classList.contains('on');
  const initials=name=>String(name||'?').split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  const avatar=(name,group=false)=>'<span class="chat-avatar">'+(group?icon('users-round'):escape(initials(name)))+'</span>';
  const stamp=ms=>{const date=new Date(ms);return date.toLocaleDateString()+' '+date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'.'+String(date.getMilliseconds()).padStart(3,'0');};
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
  let recorder=null,recordTimer,recordCancelled=false,recordRoom='';
  let contextMessage=null,contextRoom='',selection=new Set(),selecting=false;
  let inputFrame=0,inputBase=0,uploadQueue=Promise.resolve(),dragDepth=0,stickBottom=true;
  const uploads=new Map(),chatCenter=section.querySelector('.chat-center');
  const requests=new Map(),historyCache=new Map(),cursors=new Map(),membersCache=new Map(),previewCache=new Map();
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
  function savePrefs(){try{localStorage.setItem('english-chat-settings:'+account,JSON.stringify(prefs));}catch{}}
  function remember(){scheduleInputFit();if(!account||!room)return;try{localStorage.setItem(draftKey(),JSON.stringify({text:composer.value,format,pending,reply,files}));}catch{}}
  function scheduleInputFit(){if(inputFrame)return;inputFrame=requestAnimationFrame(()=>{inputFrame=0;fitInput();});}
  function fitInput(){
    if(!active())return;if(el('msgCompose').hidden){section.style.setProperty('--chat-composer-offset','16px');return;}
    const rich=composer.parentElement.querySelector('.text-color-rich:not([hidden])'),input=rich||composer,style=getComputedStyle(composer);
    if(!inputBase)inputBase=Math.max(58,(parseFloat(style.lineHeight)||24)*2+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0));
    const form=el('msgCompose'),formStyle=getComputedStyle(form),fixed=[...chatCenter.children].filter(n=>n!==form&&n!==timeline&&getComputedStyle(n).position!=='absolute').reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);
    const overhead=el('msgReply').getBoundingClientRect().height+el('msgAttachments').getBoundingClientRect().height+el('msgCompose').querySelector('.chat-compose-tools').getBoundingClientRect().height+(parseFloat(formStyle.paddingTop)||0)+(parseFloat(formStyle.paddingBottom)||0)+(parseFloat(formStyle.marginBottom)||0)+2;
    const maximum=Math.min(inputBase*4,Math.max(inputBase,chatCenter.clientHeight-fixed-overhead-Math.min(100,chatCenter.clientHeight*.2))),wasBottom=stickBottom||bottom(),scroll=input.scrollTop;
    input.style.minHeight=inputBase+'px';input.style.maxHeight=maximum+'px';input.style.height='auto';input.style.height=Math.min(maximum,Math.max(inputBase,input.scrollHeight))+'px';input.scrollTop=scroll;section.style.setProperty('--chat-composer-offset',Math.ceil(form.getBoundingClientRect().height+(parseFloat(formStyle.marginBottom)||0)+12)+'px');if(wasBottom)timeline.scrollTop=timeline.scrollHeight;
  }
  function focusComposer(){const rich=composer.parentElement.querySelector('.text-color-rich:not([hidden])');(rich||composer).focus();}
  window.TextColors?.mount(composer,{onChange:value=>{format=value;remember();}});
  const colorTools=composer.parentElement.querySelector('.text-color-tools');
  if(colorTools)el('msgStickers').after(colorTools);
  function loadDraft(){let saved={};try{saved=JSON.parse(localStorage.getItem(draftKey())||'{}');}catch{}composer.value=saved.text||'';format=saved.format||null;pending=saved.pending||null;reply=saved.reply||null;files=saved.files||[];window.TextColors?.sync(composer,format);paintDraft();}
  function paintDraft(){
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
    if(!current()||socket||!account)return;clearTimeout(reconnectTimer);const gen=generation;
    status('Connecting...');const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/messages/socket?after='+seq);socket=ws;
    ws.onmessage=event=>{
      if(socket!==ws||gen!==generation)return;
      let value;try{value=JSON.parse(event.data);}catch{return;}
      if(value.type==='response'){const p=requests.get(value.requestId);if(!p)return;clearTimeout(p.timer);requests.delete(value.requestId);if(value.error)p.reject(new Error(value.error));else p.resolve(value.result);}
      else if(value.type==='snapshot'){
        const reconnect=ready;ready=true;reconnectCount=0;data=value.data;if((data.catalogVersion||0)!==catalogVersion){catalogVersion=data.catalogVersion||0;examDirty=true;}seq=Math.max(seq,data.seq||0);status('');paintRooms();badge();
        if(room&&!data.rooms.some(row=>row.id===room)){room='';timeline.replaceChildren();paintRooms();}
        if(active()&&room){if(reconnect||state()?.loaded)history({refresh:true}).catch(error=>status(error.message));else history().catch(error=>status(error.message));}
        else if(active()&&!room){let saved;try{saved=sessionStorage.getItem('enquiz-chat-room:'+account);}catch{}if(data.rooms.some(row=>row.id===saved))openRoom(saved).catch(error=>status(error.message));}
        acknowledgeSnapshot();
      }else if(value.type==='event'){seq=Math.max(seq,value.seq||0);receive(value.event);}
    };
    ws.onclose=()=>{if(socket!==ws||gen!==generation)return;disconnect();if(!current())return;status('Connection interrupted. Reconnecting...');if(reconnectCount>=8){status('Chat unavailable. Click Chats to reconnect.');return;}const delay=Math.min(30000,700*2**reconnectCount++)+Math.random()*300;reconnectTimer=setTimeout(connect,delay);};
    ws.onerror=()=>{if(socket===ws)status('Unable to connect. Your draft is saved.');};
  }
  function upsertRoom(row){if(!row)return;const old=data.rooms.find(r=>r.id===row.id);if(old&&(old.revision||0)>(row.revision||0))return;if(old)Object.assign(old,row);else data.rooms.push(row);}
  function badge(){
    const unread={personal:0,learning:0};for(const r of data.rooms)for(const c of ['personal','learning'])unread[c]+=r.unread?.[c]||0;data.unread=unread;data.total=unread.personal+unread.learning;
    document.querySelectorAll('[data-jump="account"]').forEach(button=>{button.textContent='My account'+(data.total?' \u00b7 '+data.total:'');});
    document.querySelectorAll('[data-msg-open]').forEach(button=>{button.textContent='Messages'+(data.total?' \u00b7 '+data.total:'');button.hidden=!current();});
    section.querySelectorAll('[data-msg-category]').forEach(button=>{const c=button.dataset.msgCategory;button.textContent=(c==='learning'?'Study alerts':'Personal')+(unread[c]?' \u00b7 '+unread[c]:'');button.classList.toggle('on',listMode==='chats'&&c===kind);button.setAttribute('aria-selected',String(listMode==='chats'&&c===kind));});
    el('msgContactsTab').classList.toggle('on',listMode==='contacts');el('msgContactsTab').setAttribute('aria-selected',String(listMode==='contacts'));
  }
  function paintRooms(){
    const query=el('msgRoomSearch').value.trim().toLocaleLowerCase(),rows=data.rooms.filter(r=>(kind==='personal'||r.has?.learning)&&(!unreadOnly||r.unread?.[kind])&&(!query||(r.title+' '+(r.lastMessage?.text||'')).toLocaleLowerCase().includes(query))).sort((a,b)=>(b.lastMessage?.createdMs||0)-(a.lastMessage?.createdMs||0));
    let html=rows.length?rows.map(r=>'<button type="button" class="msg-room'+(r.id===room?' on':'')+'" data-msg-room="'+escape(r.id)+'">'+avatar(r.title,r.kind==='group')+'<span class="chat-room-copy"><span class="chat-room-top"><b>'+escape(r.title)+'</b><time>'+(r.lastMessage?escape(new Date(r.lastMessage.createdMs).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})):'')+'</time></span><span class="chat-room-preview">'+(r.unread?.[kind]?'<span class="chat-counter">'+r.unread[kind]+'</span>':'')+escape(r.lastMessage?.text|| (r.kind==='group'?'Group chat':'Private conversation'))+'</span></span></button>').join(''):'<div class="chat-empty">No conversations here yet.</div>';
    if(listMode==='contacts'){const contacts=data.contacts.filter(p=>!query||(p.name+' '+p.role).toLocaleLowerCase().includes(query));html=contacts.map(p=>'<button type="button" class="chat-contact" data-contact-id="'+escape(p.id)+'">'+avatar(p.name)+'<span><strong>'+escape(p.name)+'</strong><small>'+escape(p.role)+'</small></span></button>').join('')||'<div class="chat-empty">No contacts found.</div>';}
    el('msgListTitle').textContent=listMode==='contacts'?'Contacts':'Chats';el('msgRoomSearch').placeholder=listMode==='contacts'?'Name, full email or login':'Chats, contacts';el('msgLookup').hidden=listMode!=='contacts';el('msgUnread').hidden=listMode==='contacts';el('msgChats').classList.toggle('selected',listMode==='chats');el('msgContacts').classList.toggle('selected',listMode==='contacts');
    if(el('msgRooms').innerHTML!==html)el('msgRooms').innerHTML=html;
    const selected=data.rooms.find(r=>r.id===room);el('msgRoomTitle').textContent=selected?.title||'Messages';el('msgRoomSubtitle').textContent=selected?(selected.kind==='group'?selected.members+' members':'Private conversation'):'Choose a conversation';el('msgRoomAvatar').innerHTML=selected?.kind==='group'?icon('users-round'):escape(initials(selected?.title||'Messages'));
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
  function receive(event){
    if(event.catalogVersion&&event.catalogVersion>catalogVersion){catalogVersion=event.catalogVersion;examDirty=true;}
    if(event.removeRoom){data.rooms=data.rooms.filter(r=>r.id!==event.removeRoom);for(const cache of historyCache.keys())if(cache.startsWith(event.removeRoom+':'))historyCache.delete(cache);if(room===event.removeRoom){cancelUploads();room='';timeline.replaceChildren();el('msgCompose').hidden=true;}}
    upsertRoom(event.room);
    if(event.message&&event.room){
      const cacheKey=event.room.id+':'+event.message.category,cache=historyCache.get(cacheKey);
      if(cache?.loaded){const existing=cache.rows.find(m=>m.id===event.message.id);if(existing)Object.assign(existing,event.message);else cache.rows.push(event.message);cache.rows.sort((a,b)=>a.id-b.id);}
      if(active()&&room===event.room.id&&kind===event.message.category){const wasBottom=bottom();if(cache?.loaded)mergeNode(event.message);else history().catch(error=>status(error.message));if(wasBottom||event.message.senderId===account)timeline.scrollTop=timeline.scrollHeight;else el('msgLatest').hidden=false;scheduleRead();}
      if(ready&&event.type==='message')ack('delivered',event.room.id,event.message.category,event.message.id);
      if(event.type==='message'&&prefs.notifications!==false&&event.message.senderId!==account&&!event.room.muted&&document.visibilityState==='hidden'&&window.Notification?.permission==='granted')new Notification(event.room.title,{body:event.message.text.slice(0,160),tag:event.room.id});
    }
    if(event.receipt&&event.room){const c=event.receipt.category,peers=event.receipt.readers.filter(r=>r.id!==account),read=peers.length?Math.min(...peers.map(r=>r.read)):0,delivered=peers.length?Math.min(...peers.map(r=>r.delivered)):0;const cache=historyCache.get(event.room.id+':'+c);if(cache)for(const message of cache.rows)if(message.senderId===account){message.read=read>=message.id;message.delivered=delivered>=message.id;if(active()&&room===event.room.id&&kind===c)mergeNode(message);}}
    if(event.room&&event.type==='room'){membersCache.delete(event.room.id);if(rightMode==='info'&&prefs.right&&room===event.room.id&&active())showInfo().catch(()=>{});}
    badge();paintRooms();
  }
  function attachment(file){const url=String(file.url||'');if(!url.startsWith('/api/messages/file?'))return '';const label=escape(file.name),href=escape(url),attr=' class="chat-file" data-file-id="'+escape(file.id)+'"';if(file.mime.startsWith('image/'))return '<a'+attr+' href="'+href+'" target="_blank" rel="noopener"><img loading="lazy" src="'+href+'" alt="'+label+'"></a>';if(file.mime.startsWith('audio/'))return '<div'+attr+'><audio controls preload="none" src="'+href+'" aria-label="'+label+'"></audio></div>';if(file.mime.startsWith('video/'))return '<div'+attr+'><video controls playsinline preload="none" src="'+href+'" aria-label="'+label+'"></video></div>';return '<a'+attr+' href="'+href+'">'+icon('file')+' '+label+' ('+Math.ceil(file.size/1024)+' KB)</a>';}
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
    return '<header><strong>'+escape(m.sender)+'</strong></header>'+(m.forwarded?'<div class="chat-forwarded">'+icon('forward')+' Forwarded from '+escape(m.forwarded.sender)+'</div>'+(m.forwarded.text&&m.forwarded.text!==m.text?'<blockquote class="chat-study-reference">'+escape(m.forwarded.text)+'</blockquote>':''):'')+(m.replyText&&!m.deleted?'<button type="button" class="msg-quote" data-msg-quote="'+m.replyTo+'"><b>'+escape(m.replySender)+'</b>'+escape(m.replyText.slice(0,240))+'</button>':'')+'<p class="chat-message-text">'+(window.TextColors?window.TextColors.html(m.text,m.format):escape(m.text))+'</p>'+(m.files||[]).map(attachment).join('')+(m.examId?'<button type="button" class="chat-link" data-msg-exam="'+m.examId+'"'+(m.assignmentActive===false?' disabled':'')+'>'+(m.assignmentActive===false?'Assignment cancelled':'Open exam')+'</button>':'')+((m.reactions||[]).length?'<div class="chat-reactions">'+m.reactions.map(r=>'<button type="button" data-reaction="'+escape(r.emoji)+'" data-reaction-id="'+m.id+'" aria-pressed="'+r.mine+'">'+escape(r.emoji)+' '+r.count+'</button>').join('')+'</div>':'')+'<div class="chat-message-foot">'+(m.editedMs?'<span>Edited</span>':'')+'<time datetime="'+date.toISOString()+'" title="'+escape(stamp(date.getTime()))+'">'+escape(time(date.getTime()))+'</time>'+(own?'<span class="msg-receipt'+(m.read?' is-read':'')+'" aria-label="'+receipt+'" title="'+(m.read?'Read by everyone':receipt)+'">'+icon(m.pending?'clock':m.failed?'circle-alert':m.delivered||m.read?'check-check':'check')+'</span>':'')+'</div>';
  }
  function mergeNode(m,group=true){
    let node=[...timeline.querySelectorAll('.msg-message')].find(n=>n.dataset.msgId===String(m.id)||m.clientKey&&n.dataset.clientKey===m.clientKey);
    const content=JSON.stringify([m.id,m.text,m.format,m.files,m.forwarded,m.replyTo,m.replyText,m.replySender,m.sender,m.createdMs,m.examId,m.assignmentActive,m.pending,m.failed,m.deleted,m.editedMs,m.reactions]);
    if(node?.dataset.content===content){const receipt=node.querySelector('.msg-receipt');if(receipt){const label=m.read?'Read':m.delivered?'Delivered':'Sent';receipt.classList.toggle('is-read',!!m.read);receipt.setAttribute('aria-label',label);receipt.title=m.read?'Read by everyone':label;receipt.innerHTML=icon(m.delivered||m.read?'check-check':'check');icons();}return;}
    const html=messageHTML(m);if(node){if(node.innerHTML===html)return;node.innerHTML=html;}
    else{node=document.createElement('article');node.tabIndex=-1;node.innerHTML=html;timeline.append(node);timelineResize.observe(node);}
    node.className='msg-message'+(m.senderId===account?' is-own':'')+(m.category==='learning'?' is-learning':'')+(m.deleted?' is-deleted':'')+(selection.has(m.id)?' is-selected':'');node.dataset.msgId=m.id;node.dataset.clientKey=m.clientKey||'';node.dataset.content=content;node.dataset.day=new Date(m.createdMs||m.created*1000).toLocaleDateString();if(!m.deleted)decorateLinks(node);if(group)syncDays();icons();
    const emojis=emojiParts(m);
    if(emojis.length){
      node.classList.add('is-emoji-only','emoji-count-'+(emojis.length<=3?emojis.length:'many'));
      const text=node.querySelector('.chat-message-text');text.replaceChildren();text.classList.add('emoji-big-wrap');
      emojis.forEach((emoji,i)=>{const part=document.createElement('span');part.className='emoji-big appear';part.textContent=emoji;part.style.animationDelay=Math.min(i*.06,.6)+'s';part.addEventListener('animationend',()=>{part.classList.remove('appear','bounce');part.style.animationDelay='0s';});part.addEventListener('click',()=>{part.classList.remove('appear','bounce');part.style.animationDelay='0s';void part.offsetWidth;part.classList.add('bounce');});text.append(part);});
    }
  }
  function syncDays(){timeline.querySelectorAll('.chat-empty,.msg-day').forEach(n=>n.remove());let day='';for(const node of timeline.querySelectorAll('.msg-message'))if(node.dataset.day!==day){day=node.dataset.day;const heading=document.createElement('p');heading.className='msg-day';heading.textContent=day;node.before(heading);}}
  function paintMessages(){
    timelineResize.disconnect();timelineResize.observe(timeline);
    const rows=state()?.rows||[];timeline.replaceChildren();const older=document.createElement('button');older.type='button';older.id='msgOlder';older.className='chat-link';older.textContent='Earlier messages';older.hidden=!state()?.more;older.onclick=()=>history({older:true}).catch(error=>status(error.message));timeline.append(older);
    for(const m of rows)mergeNode(m,false);syncDays();
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
    remember();if(id!==room)cancelUploads();closeEmoji();closeContext();clearSelection();if(recorder)cancelRecording();loading++;room=id;reply=null;pending=null;files=[];rightMode='';listMode='chats';el('msgTextSearch').value='';el('msgLatest').hidden=true;el('msgSendState').textContent='';loadDraft();badge();paintRooms();if(prefs.right&&innerWidth>700)showInfo().catch(error=>status(error.message));else panel('right',false);if(innerWidth<=700)panel('left',false);
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
    const text=composer.value.trim(),category=reviewer()?kind:'personal',body={roomId:room,text,category,replyTo:reply?.id||null,format:window.TextColors?.trim(format,composer.value)||null,files:files.map(f=>f.id)};
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
      node.querySelector('[data-upload-state]').textContent=item.state==='ready'?'Ready to send':item.state==='failed'?item.error:item.state==='queued'?'Queued':item.progress+'% uploaded'+(item.state==='processing'?' - Processing...':'');
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
        files.push({...result,createdMs:item.createdMs});uploads.delete(item.id);remember();paintDraft();return result;
      }catch(error){if(item.cancelled||item.gen!==generation||item.roomId!==room)return;item.state='failed';item.error=error.message;paintUploads();status(error.message);}
      finally{item.xhr=null;}
    });uploadQueue=job.catch(()=>{});return job;
  }
  async function addFiles(incoming){
    status('');try{
      if(!room||el('msgCompose').hidden||!ready)throw new Error('Open an available conversation before attaching files.');if(busy)throw new Error('Wait for the current message to be sent.');
      const selected=Array.from(incoming),waiting=[...uploads.values()].filter(item=>item.roomId===room&&!item.cancelled).length;if(files.length+waiting+selected.length>5)throw new Error('Attach up to five files.');if(selected.some(file=>file.size>25*1024*1024))throw new Error('Maximum attachment size is 25 MB.');const results=await Promise.all(selected.map(queueUpload));return selected.length>0&&results.every(Boolean);
    }catch(error){status(error.message);}
  }
  async function upload(file){return addFiles([file]);}
  el('msgAttach').onclick=()=>el('msgFile').click();el('msgFile').onchange=async()=>{await addFiles(el('msgFile').files);el('msgFile').value='';};
  section.addEventListener('dragenter',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dragDepth++;section.classList.add('is-file-drop');});
  section.addEventListener('dragover',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();event.dataTransfer.dropEffect='copy';section.classList.add('is-file-drop');});
  section.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;section.classList.remove('is-file-drop');}});
  section.addEventListener('drop',event=>{if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;event.preventDefault();dragDepth=0;section.classList.remove('is-file-drop');if(event.dataTransfer.files.length)addFiles(event.dataTransfer.files);else status('Drop individual files, not folders.');});
  composer.parentElement.addEventListener('paste',event=>{if(event.clipboardData.files.length){event.preventDefault();addFiles(event.clipboardData.files);}},true);
  function cancelRecording(){recordCancelled=true;clearTimeout(recordTimer);if(recorder?.state==='recording')recorder.stop();}
  el('msgCancelRecording').onclick=cancelRecording;
  el('msgMic').onclick=async()=>{
    if(recorder?.state==='recording'){recorder.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice recording is unavailable in this browser.');return;}
    let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!room||!active()){stream.getTracks().forEach(t=>t.stop());return;}const chunks=[],mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime)throw new Error('Voice recording format is unsupported in this browser.');recorder=new MediaRecorder(stream,{mimeType:mime});recordCancelled=false;recordRoom=room;let size=0;
      recorder.ondataavailable=e=>{chunks.push(e.data);size+=e.data.size;if(size>25*1024*1024)cancelRecording();};recorder.onstop=async()=>{clearTimeout(recordTimer);stream.getTracks().forEach(t=>t.stop());el('msgCancelRecording').hidden=true;el('msgMic').innerHTML=icon('mic');icons();const cancelled=recordCancelled||room!==recordRoom;recorder=null;el('msgSendState').textContent='';if(!cancelled)try{const blob=new Blob(chunks,{type:mime.split(';')[0]});const targetRoom=room,gen=generation;const uploaded=await upload(new File([blob],'voice-'+Date.now()+(mime.startsWith('audio/webm')?'.webm':'.ogg'),{type:blob.type}));if(uploaded&&room===targetRoom&&generation===gen)await send();}catch(error){status(error.message);}};
      recorder.start(1000);el('msgMic').innerHTML=icon('square');el('msgCancelRecording').hidden=false;el('msgSendState').textContent='Recording...';icons();recordTimer=setTimeout(()=>recorder?.stop(),120000);
    }catch(error){stream?.getTracks().forEach(t=>t.stop());status(error.message||'Microphone unavailable.');}
  };
  async function showInfo(tab='members'){
    if(!room)return;rightMode='info';panel('right',true);el('msgRightTitle').textContent='Chat info';el('msgInfoContent').hidden=false;el('msgSearchContent').hidden=true;const selected=data.rooms.find(r=>r.id===room);if(!selected)return;
    const id=room;let members=membersCache.get(id);if(!members){const result=await request('members',{roomId:id});members=result.members;membersCache.set(id,members);}if(id!==room||rightMode!=='info')return;
    const rows=[...(historyCache.get(room+':personal')?.rows||[]),...(historyCache.get(room+':learning')?.rows||[])];let extra='';
    if(tab==='members')extra='<div class="chat-info-members"><h3>Members \u00b7 '+members.length+'</h3><label class="chat-search">'+icon('search')+'<input type="search" id="msgMemberSearch" placeholder="Name" aria-label="Search members"></label>'+members.map(m=>'<div class="chat-member" data-member-name="'+escape(m.name.toLocaleLowerCase())+'">'+avatar(m.name)+'<span><strong>'+escape(m.name)+'</strong><small>'+escape(m.role)+'</small></span></div>').join('')+'</div>';
    else{const attachments=rows.filter(m=>!m.deleted).flatMap(m=>m.files||[]).filter(f=>tab==='media'?/^(image|audio|video)\//.test(f.mime):tab==='files'?!/^(image|audio|video)\//.test(f.mime):false);const links=tab==='links'?rows.filter(m=>!m.deleted).flatMap(m=>(m.text.match(/https?:\/\/[^\s<>]+/g)||[])):[];extra='<p class="chat-empty">From loaded messages</p>'+attachments.map(attachment).join('')+links.map(url=>'<a class="chat-file" target="_blank" rel="noopener" href="'+escape(url)+'">'+escape(url)+'</a>').join('');}
    el('msgInfoContent').innerHTML='<div class="chat-info-profile">'+avatar(selected.title,selected.kind==='group')+'<h3>'+escape(selected.title)+'</h3><small>'+escape(selected.kind==='group'?members.length+' members':'Private conversation')+'</small></div><div class="chat-info-tabs">'+['media','files','links'].map(t=>'<button type="button" data-info-tab="'+t+'">'+t[0].toUpperCase()+t.slice(1)+'</button>').join('')+'</div><label class="chat-setting-row"><span>Mute notifications</span><input id="msgMute" type="checkbox" '+(selected.muted?'checked':'')+'></label><button type="button" class="chat-link" data-info-tab="members">Members</button>'+(selected.access&&!selected.access.protected?'<button type="button" class="chat-link danger" data-relation="'+(selected.access.blockedByMe?'unblock':'block')+'">'+(selected.access.blockedByMe?'Unblock':'Block user')+'</button>':'')+extra;
    el('msgMute').onchange=async event=>{try{const result=await request('mute',{roomId:id,muted:event.target.checked});upsertRoom(result.room);}catch(error){status(error.message);}};el('msgMemberSearch')?.addEventListener('input',event=>{const q=event.target.value.toLocaleLowerCase();el('msgInfoContent').querySelectorAll('[data-member-name]').forEach(n=>n.hidden=!n.dataset.memberName.includes(q));});icons();
  }
  function showSearch(){if(!room)return;rightMode='search';panel('right',true);el('msgRightTitle').textContent='Search';el('msgInfoContent').hidden=true;el('msgSearchContent').hidden=false;el('msgTextSearch').focus();}
  async function search(older=false){const q=el('msgTextSearch').value.trim(),id=room,c=kind,token=++searchToken;el('msgSearchMore').hidden=true;if(!q){el('msgSearchResults').replaceChildren();return;}const result=await request('history',{roomId:id,category:c,q,...(older?{before:searchBefore}:{})});if(token!==searchToken||id!==room||q!==el('msgTextSearch').value.trim())return;const html=[...result.messages].reverse().map(m=>'<button type="button" class="chat-search-result" data-search-id="'+m.id+'"><strong>'+escape(m.sender)+'</strong>'+escape(m.text.slice(0,240))+'<small>'+escape(stamp(m.createdMs||m.created*1000))+'</small></button>').join('');if(older)el('msgSearchResults').insertAdjacentHTML('beforeend',html);else el('msgSearchResults').innerHTML=html||'<div class="chat-empty">No matches.</div>';searchBefore=result.messages[0]?.id||0;el('msgSearchMore').hidden=!result.more;}
  async function focusMessage(id,category=kind){if(category!==kind){kind=category;badge();}let node=timeline.querySelector('[data-msg-id="'+id+'"]');if(!node){await history({before:id+1});node=timeline.querySelector('[data-msg-id="'+id+'"]');}if(!node){status('Original message unavailable.');return;}stickBottom=false;rightMode='';if(innerWidth<=700)panel('right',false);timeline.querySelectorAll('.is-focused').forEach(n=>n.classList.remove('is-focused'));node.classList.add('is-focused');node.scrollIntoView({block:'center'});node.focus({preventScroll:true});scheduleRead();}
  el('msgTextSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>search().catch(error=>status(error.message)),220);};el('msgSearchMore').onclick=()=>search(true).catch(error=>status(error.message));
  function dialog(title,html,submit){const node=document.createElement('dialog');node.className='chat-dialog';node.style.maxWidth='520px';node.innerHTML='<header class="chat-dialog-head"><h2>'+escape(title)+'</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">'+icon('x')+'</button></header><form>'+html+'<p role="status"></p>'+(submit?'<button type="submit" class="primary">'+escape(title)+'</button>':'')+'</form>';node.querySelector('[data-msg-close]').onclick=()=>node.close();node.onclose=()=>node.remove();if(submit)node.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=node.querySelector('[type=submit]');button.disabled=true;try{await submit(new FormData(event.target));node.close();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};document.body.append(node);node.showModal();icons();return node;}
  function conversationChooser(title,onChoose,details='',onlyPerson=''){
    if(!ready){connect();status('Wait for the connection, then open New chat.');return;}
    const contacts=[...data.contacts,...data.rooms.filter(r=>r.kind==='direct'&&r.peerId&&r.access?.state==='accepted'&&!r.access.blocked).map(r=>({id:r.peerId,name:r.title,role:'Contact'}))],rows=[...data.groups.map(g=>({id:g.id,name:g.title,kind:'group',role:'Group chat'})),...[...new Map(contacts.map(p=>[p.id,p])).values()].map(p=>({...p,kind:'direct'}))].filter(p=>!onlyPerson||p.kind==='direct'&&p.id===onlyPerson);
    const node=dialog(title,details+'<label class="chat-search"><input id="msgContactSearch" type="search" placeholder="Name, full email or login" aria-label="Search contacts"></label><button type="button" class="chat-link" data-find-person'+(onlyPerson?' hidden':'')+'>'+icon('search')+' Find by email or login</button><div class="chat-new-list"></div>');
    const paint=()=>{node.querySelector('.chat-new-list').innerHTML=rows.map((r,i)=>'<button type="button" class="chat-contact" data-contact-index="'+i+'">'+avatar(r.name,r.kind==='group')+'<span>'+escape(r.name)+'<small>'+escape(r.role)+'</small></span></button>').join('');};paint();
    node.querySelector('#msgContactSearch').oninput=event=>{const q=event.target.value.toLocaleLowerCase();node.querySelectorAll('[data-contact-index]').forEach(n=>n.hidden=!rows[Number(n.dataset.contactIndex)].name.toLocaleLowerCase().includes(q));};
    node.querySelector('[data-find-person]').onclick=async event=>{if(onlyPerson)return;event.currentTarget.disabled=true;try{const result=await request('lookup',{query:node.querySelector('#msgContactSearch').value});if(!node.open)return;if(!result.person){node.querySelector('[role=status]').textContent='No account found.';return;}let index=rows.findIndex(r=>r.kind==='direct'&&r.id===result.person.id);if(index<0){rows.push({...result.person,kind:'direct'});index=rows.length-1;}paint();node.querySelectorAll('[data-contact-index]').forEach(b=>b.hidden=Number(b.dataset.contactIndex)!==index);node.querySelector('[role=status]').textContent='';icons();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{node.querySelector('[data-find-person]').disabled=false;}};
    node.querySelector('form').onsubmit=event=>{event.preventDefault();node.querySelector('[data-find-person]').click();};
    node.querySelector('.chat-new-list').onclick=async event=>{const button=event.target.closest('[data-contact-index]');if(!button)return;button.disabled=true;try{const row=rows[Number(button.dataset.contactIndex)],result=await request('open',row.kind==='group'?{kind:'group',groupId:row.id}:{kind:'direct',accountId:row.id});upsertRoom(result.room);await onChoose(result);node.close();}catch(error){node.querySelector('[role=status]').textContent=error.message;}finally{button.disabled=false;}};
  }
  function newChat(){conversationChooser('New chat',async result=>{kind='personal';await openRoom(result.roomId);});}
  function forwardMessage(id){const ids=Array.isArray(id)?id:[id],messages=ids.map(findMessage).filter(Boolean);if(!messages.length||messages.some(m=>m.deleted||m.category!=='personal'))return;const restricted=[...new Set(messages.map(m=>m.forwardTo).filter(Boolean))];if(restricted.length>1||restricted[0]===account){status('Study references can only be forwarded to their teacher.');return;}const sourceRoomId=room,keys=messages.map(()=>crypto.randomUUID());conversationChooser('Forward message',async result=>{for(let i=0;i<messages.length;i++)await request('forward',{sourceRoomId,messageId:messages[i].id,targetRoomId:result.roomId,clientKey:keys[i]});status('');kind='personal';await openRoom(result.roomId);},'<div class="chat-forward-summary"><strong>'+escape(messages.length===1?messages[0].sender:messages.length+' messages')+'</strong><p>'+escape(messages[0].text.slice(0,180)||messages[0].files?.[0]?.name||'Attachment')+'</p></div>',restricted[0]||'');}
  function studyReference(message){
    if(!message||message.deleted||message.senderId===account||message.canStudyReply===false)return;const sourceRoomId=room,clientKey=crypto.randomUUID(),draft='english-chat-alert-reply:'+account+':'+sourceRoomId+':'+message.id;
    const node=dialog('Reply to teacher','<div class="chat-forward-summary"><strong>'+escape(message.sender)+'</strong><p>'+escape(message.text)+'</p></div><p>This reply will go to '+escape(message.sender)+' in Personal.</p><label>Message<textarea name="text" maxlength="4000" rows="4" placeholder="Add a comment"></textarea></label>',async()=>{
      const text=area.value.trim(),result=await request('study-reply',{sourceRoomId,messageId:message.id,text,format:window.TextColors?.trim(colorFormat,area.value)||null,clientKey});try{localStorage.removeItem(draft);}catch{}upsertRoom(result.room);kind='personal';await openRoom(result.roomId);status('Sent to the teacher\'s personal chat. Continue the conversation here.');
    });const area=node.querySelector('textarea');let colorFormat=null;try{area.value=localStorage.getItem(draft)||'';}catch{}area.oninput=()=>{try{localStorage.setItem(draft,area.value);}catch{}};window.TextColors?.mount(area,{onChange:value=>{colorFormat=value;}});area.focus();
  }
  async function replyMessage(message){if(!message||message.deleted)return;if(message.category==='learning'&&message.senderId!==account&&message.canStudyReply!==false){studyReference(message);return;}if(message.category==='learning'){kind='personal';badge();paintRooms();await history();}reply=message;paintDraft();remember();focusComposer();}
  function closeContext(){el('msgContext').hidden=true;contextMessage=null;contextRoom='';}
  function saveFile(file){if(!file?.url?.startsWith('/api/messages/file?'))return;const link=document.createElement('a');link.href=file.url+'&download=1';link.download=file.name;document.body.append(link);link.click();link.remove();}
  function canEdit(message){return message.canEdit??(message.senderId===account&&!message.examId);}
  function messageMenu(message,x,y,fileId=''){
    if(!message||message.deleted||!Number.isSafeInteger(message.id))return;closeEmoji();contextMessage=message;contextRoom=room;const node=el('msgContext'),study=message.category==='learning',canReply=!study||message.senderId!==account&&message.canStudyReply!==false,items=[];
    if(canReply)items.push(['reply','reply','Reply']);
    if(message.files?.length)items.push(['save','download','Save as...']);
    if(canEdit(message)&&message.text)items.push(['edit','square-pen','Edit']);
    items.push(['pin','pin',data.rooms.find(r=>r.id===room)?.pinned?.id===message.id?'Unpin':'Pin']);
    if((!study||canReply)&&message.forwardTo!==account)items.push(['forward','forward','Forward']);items.push(['select','circle-check','Select']);if(canEdit(message))items.push(['delete','trash-2','Delete']);
    node.dataset.fileId=fileId;node.innerHTML='<div class="chat-context-reactions">'+[0x1f44d,0x2764,0x1f602,0x1f389,0x1f525,0x1f914,0x1f44f].map(code=>'<button type="button" data-context-reaction="'+emojiValue(code)+'" aria-label="React '+emojiValue(code)+'">'+emojiValue(code)+'</button>').join('')+'</div>'+items.map(([action,image,label])=>'<button type="button" role="menuitem" data-context-action="'+action+'" class="'+(action==='delete'?'danger':'')+'">'+icon(image)+'<span>'+label+'</span></button>').join('');node.hidden=false;icons();const box=node.getBoundingClientRect();node.style.left=Math.max(8,Math.min(x,innerWidth-box.width-8))+'px';node.style.top=Math.max(8,Math.min(y,innerHeight-box.height-8))+'px';node.querySelector('[role=menuitem]')?.focus({preventScroll:true});
  }
  function clearSelection(){selection.clear();selecting=false;el('msgSelection').hidden=true;timeline.querySelectorAll('.is-selected').forEach(n=>n.classList.remove('is-selected'));}
  function paintSelection(){const rows=(state()?.rows||[]).filter(m=>selection.has(m.id));el('msgSelection').hidden=!selecting;el('msgSelection').innerHTML='<span>'+rows.length+' selected</span>'+(rows.length&&rows.every(m=>m.category==='personal'&&!m.deleted)?'<button type="button" data-selection-action="forward" title="Forward" aria-label="Forward">'+icon('forward')+'</button>':'')+(rows.length&&rows.every(m=>canEdit(m)&&!m.deleted)?'<button type="button" class="danger" data-selection-action="delete" title="Delete" aria-label="Delete">'+icon('trash-2')+'</button>':'')+'<button type="button" data-selection-action="cancel" title="Cancel selection" aria-label="Cancel selection">'+icon('x')+'</button>';timeline.querySelectorAll('.msg-message').forEach(n=>n.classList.toggle('is-selected',selection.has(Number(n.dataset.msgId))));icons();}
  function editMessage(message,id){const node=dialog('Edit message','<label>Message<textarea name="text" required maxlength="4000" rows="4"></textarea></label>',async()=>{await request('edit',{roomId:id,id:message.id,text:area.value.trim(),format:window.TextColors?.trim(format,area.value)||null,expectedEditedMs:message.editedMs||0});});const area=node.querySelector('textarea');let format=message.format||null;area.value=message.text;window.TextColors?.mount(area,{onChange:value=>{format=value;}});window.TextColors?.sync(area,format);area.focus();}
  function deleteMessages(ids,id){dialog('Delete','<p>Delete '+(ids.length===1?'this message':'these '+ids.length+' messages')+' for everyone?</p>',async()=>{for(const messageId of ids)await request('delete',{roomId:id,id:messageId});clearSelection();});}
  el('msgContext').onclick=async event=>{const target=event.target.closest('[data-context-action],[data-context-reaction]');if(!target||!contextMessage)return;const message=contextMessage,id=contextRoom,fileId=el('msgContext').dataset.fileId;closeContext();try{
    if(target.dataset.contextReaction){await request('react',{roomId:id,id:message.id,emoji:target.dataset.contextReaction});return;}
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
  function settings(){
    const profile=data.profile||current(),node=document.createElement('dialog');node.className='chat-dialog';node.innerHTML='<div class="chat-dialog-body"><aside class="chat-settings-menu"><h2>Settings</h2><div class="chat-settings-profile">'+avatar(profile.name)+'<span><strong>'+escape(profile.name)+'</strong><br><small>'+escape(profile.role)+'</small></span></div><h3>Common</h3>'+[['profile','user-round','Profile'],['notifications','bell','Notifications'],['interface','paintbrush','Interface'],['security','shield','Security'],['help','circle-help','Help']].map(([id,image,title])=>'<button type="button" data-settings-tab="'+id+'">'+icon(image)+escape(title)+'</button>').join('')+'</aside><div class="chat-settings-content"></div></div>';document.body.append(node);node.onclose=()=>node.remove();node.showModal();
    async function tab(id){node.querySelectorAll('[data-settings-tab]').forEach(b=>b.classList.toggle('on',b.dataset.settingsTab===id));const pane=node.querySelector('.chat-settings-content');let html='';
      if(id==='profile')html=avatar(profile.name)+'<h3>'+escape(profile.name)+'</h3><p>'+escape(profile.email||'')+'</p><p>'+escape(profile.role)+'</p><button class="chat-link" type="button" data-profile-open>My account</button><button class="chat-link" type="button" data-chat-blocked>Blocked users</button>';
      if(id==='notifications')html='<label class="chat-setting-row"><span>Desktop notifications</span><input type="checkbox" data-pref="notifications" '+(prefs.notifications?'checked':'')+'></label><p>Notifications stay off for muted conversations.</p>';
      if(id==='interface')html=[['left','Conversation list'],['right','Chat info'],['enter','Enter sends messages']].map(([p,label])=>'<label class="chat-setting-row"><span>'+label+'</span><input type="checkbox" data-pref="'+p+'" '+(prefs[p]!==false?'checked':'')+'></label>').join('');
      if(id==='security'){const result=await request('sessions');if(!node.open)return;html='<p>Connected sessions: '+result.sessions.length+'</p><p>Connections authenticate again when they reconnect.</p><button type="button" class="chat-link danger" data-logout>Close current session</button>';}
      if(id==='help')html='<p>Personal contains conversations. Study alerts contains important teacher announcements and exam notices.</p><p>Shift+Enter adds a new line. Search finds messages in the selected category. Your draft is saved on this device.</p><p>Grey checks show delivery; blue checks mean everyone in the conversation has read the message.</p>';
      pane.innerHTML='<header class="chat-dialog-head"><h2>'+id[0].toUpperCase()+id.slice(1)+'</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">'+icon('x')+'</button></header>'+html;pane.querySelector('[data-msg-close]').onclick=()=>node.close();pane.querySelector('[data-profile-open]')?.addEventListener('click',()=>{node.close();window.enquizVisit('profile');});pane.querySelector('[data-logout]')?.addEventListener('click',()=>{node.close();document.querySelector('[data-account="logout"]')?.click();});
      pane.querySelectorAll('[data-pref]').forEach(input=>input.onchange=async()=>{const p=input.dataset.pref;if(p==='notifications'&&input.checked){if(!window.Notification){input.checked=false;return;}const permission=await Notification.requestPermission();input.checked=permission==='granted';}prefs[p]=input.checked;if(p==='left')panel('left',input.checked);if(p==='right'){if(input.checked)showInfo().catch(error=>status(error.message));else panel('right',false);}savePrefs();});icons();
    }
    node.querySelectorAll('[data-settings-tab]').forEach(button=>button.onclick=()=>tab(button.dataset.settingsTab).catch(error=>status(error.message)));tab('profile');
  }
  el('msgProfile').onclick=settings;el('msgSettings').onclick=settings;el('msgNew').onclick=newChat;el('msgContacts').onclick=showContacts;el('msgContactsTab').onclick=showContacts;el('msgChats').onclick=()=>{if(!ready)connect();listMode='chats';el('msgRoomSearch').value='';badge();paintRooms();panel('left',true);};el('msgExit').onclick=()=>window.enquizVisit('home');
  el('msgHideList').onclick=()=>{panel('left',false);scheduleRead();};el('msgListBack').onclick=()=>panel('left',true);el('msgHideInfo').onclick=()=>{rightMode='';panel('right',false);scheduleRead();};el('msgSearch').onclick=showSearch;el('msgInfo').onclick=()=>showInfo().catch(error=>status(error.message));el('msgRoomInfo').onclick=el('msgInfo').onclick;
  el('msgRoomSearch').oninput=paintRooms;el('msgUnread').onclick=()=>{unreadOnly=!unreadOnly;el('msgUnread').setAttribute('aria-pressed',String(unreadOnly));paintRooms();};el('msgLatest').onclick=()=>{timeline.scrollTop=timeline.scrollHeight;el('msgLatest').hidden=true;scheduleRead();};
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-msg-open],[data-msg-room],[data-msg-category],[data-msg-reply],[data-msg-forward],[data-contact-id],[data-msg-quote],[data-msg-exam],[data-msg-cancel-reply],[data-remove-file],[data-emoji],[data-emoji-category],[data-info-tab],[data-search-id],[data-msg-menu],[data-reaction],[data-relation],[data-chat-blocked],[data-cancel-upload]');if(!target)return;
    try{
      if(target.hasAttribute('data-msg-open')){if(!current())return;window.enquizVisit('messages');checkAuth();if(!ready)connect();}
      else if(target.dataset.msgRoom)await openRoom(target.dataset.msgRoom);
      else if(target.dataset.msgCategory){closeEmoji();closeContext();clearSelection();listMode='chats';kind=target.dataset.msgCategory;badge();paintRooms();await history();}
      else if(target.dataset.contactId){const result=await request('open',{kind:'direct',accountId:target.dataset.contactId});upsertRoom(result.room);kind='personal';await openRoom(result.roomId);}
      else if(target.dataset.msgReply)await replyMessage(state()?.rows.find(m=>m.id===Number(target.dataset.msgReply)));
      else if(target.dataset.msgForward)forwardMessage(Number(target.dataset.msgForward));
      else if(target.dataset.msgMenu){const box=target.getBoundingClientRect();messageMenu(state()?.rows.find(m=>m.id===Number(target.dataset.msgMenu)),box.right,box.bottom);}
      else if(target.dataset.reaction)await request('react',{roomId:room,id:Number(target.dataset.reactionId),emoji:target.dataset.reaction});
      else if(target.dataset.relation){const result=await request('relation',{roomId:room,action:target.dataset.relation});upsertRoom(result.room);paintRooms();}
      else if(target.hasAttribute('data-chat-blocked'))await blockedUsers();
      else if(target.hasAttribute('data-msg-cancel-reply')){reply=null;paintDraft();remember();}
      else if(target.dataset.msgQuote){const parent=state()?.rows.find(m=>m.replyTo===Number(target.dataset.msgQuote));await focusMessage(Number(target.dataset.msgQuote),parent?.replyCategory||kind);}
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
    const user=current(),next=user?user.id+':'+user.role:'';
    if(signature!==next){remember();cancelUploads();closeContext();clearSelection();cancelRecording();disconnect();document.querySelectorAll('dialog.chat-dialog').forEach(d=>d.close());generation++;signature=next;account=user?.id||'';seq=0;data={rooms:[],contacts:[],groups:[],total:0};room='';reply=null;pending=null;files=[];historyCache.clear();membersCache.clear();cursors.clear();timeline.replaceChildren();composer.value='';prefs={left:true,right:false,enter:true,notifications:false};try{Object.assign(prefs,JSON.parse(localStorage.getItem('english-chat-settings:'+account)||'{}'));}catch{}if(innerWidth<=700)prefs.right=false;el('msgRight').hidden=!prefs.right;el('msgRooms').closest('.chat-list').hidden=!prefs.left;el('msgListBack').hidden=!!prefs.left;el('msgProfile').textContent=initials(user?.name||user?.login);badge();paintRooms();if(user){reconnectCount=0;connect();}}
    document.querySelectorAll('#account [data-chat-blocked],#profile [data-chat-blocked]').forEach(b=>b.hidden=!user);
    if(!user&&active()&&typeof accountChecked!=='undefined'&&accountChecked)window.enquizVisit('account');document.body.classList.toggle('chat-active',active()&&!!user);if(active())fitPanels();
  }
  const observer=new MutationObserver(checkAuth);for(const id of ['account','profile'])if(el(id))observer.observe(el(id),{childList:true,subtree:true});
  new MutationObserver(()=>{checkAuth();if(active()){if(ready&&room)history().catch(error=>status(error.message));if(!ready)connect();}else if(recorder)cancelRecording();}).observe(section,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){checkAuth();if(!socket&&current())connect();scheduleRead();}});window.addEventListener('focus',scheduleRead);
  window.addEventListener('resize',()=>{closeContext();if(innerWidth<=700&&prefs.left&&prefs.right)panel('right',false);fitPanels();});
  function fitKeyboard(){if(window.visualViewport){section.style.height=visualViewport.height+'px';section.style.top=visualViewport.offsetTop+'px';}scheduleInputFit();}
  window.visualViewport?.addEventListener('resize',fitKeyboard);window.visualViewport?.addEventListener('scroll',fitKeyboard);fitKeyboard();
  checkAuth();icons();
})();
