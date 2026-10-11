(() => {
  'use strict';
  const section = document.getElementById('messages');
  if (!section) return;
  const el = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const current = () => typeof authUser !== 'undefined' && authUser && !viewAccount ? authUser : null;
  const reviewer = () => ['ADMIN','DEVELOPER'].includes(current()?.role);
  let account = '', generation = 0, data = null, room = '', kind = 'personal', messages = [], reply = null, pending = null;
  let busy = false, refreshing = false, historyToken = 0, more = false, queryTimer, restoreRoom = true, readThrough = 0, lastPoll = 0;
  const timeline = el('msgTimeline');
  const atBottom = () => timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 64;
  const draftKey = () => 'english-chat-draft-v1:' + account + ':' + room;
  async function api(path,body) {
    const user = current(), gen = generation;
    if (!user) throw new Error('Sign in to open messages.');
    const response = await fetch('/api/messages' + path,{credentials:'same-origin',cache:'no-store',...(body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    const value = await response.json();
    if (generation !== gen || current()?.id !== user.id) throw new Error('Account changed.');
    if (!response.ok) throw new Error(value.error || 'Messages are temporarily unavailable.');
    return value;
  }
  function status(text) { el('msgStatus').textContent = text; el('msgStatus').hidden = !text; }
  function remember() {
    if (!account || !room) return;
    try { localStorage.setItem(draftKey(),JSON.stringify({text:el('msgText').value,pending,reply})); } catch {}
  }
  function loadDraft() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(draftKey()) || '{}'); } catch {}
    el('msgText').value = saved.text || ''; pending = saved.pending || null; reply = saved.reply || null; paintReply();
  }
  function paintReply() {
    el('msgReply').hidden = !reply;
    el('msgReply').innerHTML = reply ? '<span>' + escape(reply.sender) + ': ' + escape(reply.text.slice(0,160)) + '</span><button class="btn icon" type="button" data-msg-cancel-reply aria-label="Cancel reply" title="Cancel reply">&#215;</button>' : '';
  }
  function badge() {
    const total = data?.total || 0;
    document.querySelectorAll('[data-jump="account"]').forEach(button => {
      if (!button.dataset.msgOriginal) button.dataset.msgOriginal = button.textContent.trim();
      button.textContent = 'My account' + (total ? ' · ' + total : '');
    });
    document.querySelectorAll('[data-msg-open]').forEach(button => { if(!button.closest('#guide'))button.textContent = 'Messages' + (total ? ' · '+total : ''); button.hidden = !current(); });
    document.querySelectorAll('[data-msg-category]').forEach(button => {
      const count = data?.unread?.[button.dataset.msgCategory] || 0;
      button.textContent = (button.dataset.msgCategory === 'learning' ? 'Learning' : 'Personal') + (count ? ' · '+count : '');
      const active = button.dataset.msgCategory === kind; button.classList.toggle('on',active); button.setAttribute('aria-selected',String(active));
    });
  }
  function paintRooms() {
    const q = el('msgRoomSearch').value.trim().toLocaleLowerCase();
    const rooms = (data?.rooms || []).filter(row => (row.has[kind] || kind === 'personal') && (!q || row.title.toLocaleLowerCase().includes(q)) && (!el('msgUnreadOnly').checked || row.unread[kind]));
    const markup = rooms.length ? rooms.map(row => '<button class="msg-room' + (row.id===room?' on':'') + '" type="button" data-msg-room="' + escape(row.id) + '"><b>' + escape(row.title) + (row.unread[kind]?' · '+row.unread[kind]:'') + '</b><small>' + (row.kind==='group'?'Group chat':'Private conversation') + (row.muted?' · Muted':'') + '</small></button>').join('') : '<p class="hint">No conversations here yet.</p>';
    if (el('msgRooms').innerHTML!==markup) el('msgRooms').innerHTML = markup;
    const selected = data?.rooms.find(row => row.id===room);
    el('msgRoomTitle').textContent = selected?.title || 'Choose a conversation';
    el('msgMute').hidden = !selected || selected.kind!=='group';
    el('msgMute').title = selected?.muted ? 'Unmute conversation' : 'Mute conversation';
    el('msgMute').setAttribute('aria-label',el('msgMute').title);
    el('msgAssign').hidden = !reviewer(); el('msgAnnouncementLabel').hidden = !reviewer();
    el('msgCompose').hidden = !room; el('msgTextSearch').disabled = !room;
    section.classList.toggle('has-room',!!room);
  }
  function paintMessages() {
    let date = '', unreadHeading = false;
    timeline.innerHTML = messages.length ? messages.map(message => {
      const when = new Date(message.created*1000), day = when.toLocaleDateString(), heading = day!==date ? '<p class="msg-day">'+escape(day)+'</p>' : ''; date = day;
      const own = message.senderId===account;
      const unread = !unreadHeading && !own && message.id>readThrough; if(unread)unreadHeading=true;
      return heading + (unread?'<p class="msg-day">Unread messages</p>':'') + '<article class="msg-message'+(own?' is-own':'')+(message.category==='learning'?' is-learning':'')+'" data-msg-id="'+message.id+'" tabindex="-1"><header><strong>'+escape(message.sender)+'</strong><time datetime="'+when.toISOString()+'">'+escape(when.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))+'</time></header>' +
        (message.replyText?'<button class="msg-quote" type="button" data-msg-quote="'+message.replyTo+'"><b>'+escape(message.replySender)+'</b><br>'+escape(message.replyText.slice(0,240))+'</button>':'') + '<p>'+escape(message.text)+'</p>' +
        (message.examId?'<button class="btn" type="button" data-msg-exam="'+message.examId+'"'+(message.assignmentActive?'':' disabled')+'>'+(message.assignmentActive?'Open exam':'Assignment cancelled')+'</button>':'') +
        '<div class="msg-compose-actions"><button class="btn ghost" type="button" data-msg-reply="'+message.id+'">Reply</button>'+(own?'<span class="msg-receipt'+(message.read?' is-read':'')+'" role="img" aria-label="'+(message.read?'Read':'Delivered')+'" title="'+(message.read?(data?.rooms.find(row=>row.id===room)?.kind==='group'?'Read by everyone':'Read'):'Delivered, not yet read')+'"><svg class="lucide lucide-check-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg></span>':'')+'</div></article>';
    }).join('') : '<p class="hint">No messages yet.</p>';
    el('msgOlder').hidden = !more || !messages.length;
  }
  async function markRead() {
    if (!current() || !section.classList.contains('on') || document.visibilityState!=='visible' || el('msgTextSearch').value.trim() || !room || !messages.length) return;
    const box = timeline.getBoundingClientRect();
    const visible = [...timeline.querySelectorAll('[data-msg-id]')].filter(node => { const rect=node.getBoundingClientRect(); return rect.top<box.bottom && rect.bottom>box.top; });
    const through = Math.max(0,...visible.map(node => Number(node.dataset.msgId)));
    if (!through) return;
    await api('/read',{roomId:room,category:kind,through});
  }
  async function history({older=false,incremental=false,before=0}={}) {
    if (!room) return;
    const token = ++historyToken, roomId = room, gen = generation;
    const params = new URLSearchParams({roomId,category:kind,q:el('msgTextSearch').value.trim()});
    if (older && messages.length) params.set('before',messages[0].id);
    if (before) params.set('before',before);
    if (incremental && messages.length) params.set('after',messages.at(-1).id);
    const oldHeight = timeline.scrollHeight, oldTop = timeline.scrollTop, bottom = atBottom();
    const result = await api('/history?'+params);
    if (token!==historyToken || roomId!==room || gen!==generation) return;
    const receiptsChanged = messages.some(row => row.senderId===account && !row.read && row.id<=result.peerReadThrough);
    messages.forEach(row => { if(row.senderId===account && row.id<=result.peerReadThrough)row.read=true; });
    if (incremental && !result.messages.length) {
      if (receiptsChanged) { paintMessages(); timeline.scrollTop=oldTop; }
      return;
    }
    const combined = older ? [...result.messages,...messages] : incremental ? [...messages,...result.messages] : result.messages;
    messages = [...new Map(combined.map(row => [row.id,row])).values()];
    if(!incremental)readThrough=result.readThrough||0;
    if (!incremental) more = result.more;
    paintMessages();
    if (older) timeline.scrollTop = oldTop + timeline.scrollHeight - oldHeight;
    else if (!incremental || bottom) timeline.scrollTop = timeline.scrollHeight;
    else { timeline.scrollTop = oldTop; el('msgLatest').hidden = false; }
    if (incremental && result.more && bottom) queueMicrotask(() => history({incremental:true}).catch(error => status(error.message)));
    await markRead();
  }
  async function openRoom(id) {
    restoreRoom = false; remember(); room = id; reply = null; pending = null; el('msgTextSearch').value = ''; messages = [];
    el('msgLatest').hidden = true; paintRooms(); loadDraft();
    el('msgSendState').textContent=''; el('msgSend').textContent=pending?'Retry':'Send';
    await history(); await refresh();
    try { sessionStorage.setItem('enquiz-chat-room:'+account,room); } catch {}
  }
  async function refresh() {
    if (refreshing || !current() || document.visibilityState!=='visible') return;
    refreshing = true;
    try {
      data = await api(''); badge(); paintRooms();
      const ownAccount = el('profile'); let summary = ownAccount.querySelector('.msg-account-summary');
      if (!summary) { summary=document.createElement('div'); summary.className='msg-account-summary'; ownAccount.append(summary); }
      summary.hidden = !current(); summary.innerHTML = '<button class="btn" type="button" data-msg-open>Messages'+(data.total?' · '+data.total:'')+'</button>' + (data.total ? '<p class="hint">'+data.unread.learning+' learning · '+data.unread.personal+' personal unread</p>':'') + data.rooms.filter(row=>row.lastMessage).slice(0,3).map(row=>'<button class="msg-room" type="button" data-msg-preview="'+escape(row.id)+'" data-msg-preview-kind="'+row.lastMessage.category+'"><b>'+escape(row.title)+'</b><small>'+escape(row.lastMessage.text)+'</small></button>').join('');
      if (room && !data.rooms.some(row => row.id===room)) { room=''; messages=[]; timeline.replaceChildren(); el('msgCompose').hidden=true; section.classList.remove('has-room'); }
      status('');
    } catch(error) { if (section.classList.contains('on')) status(error.message); }
    finally { refreshing=false; }
  }
  function dialog(title,html,submit) {
    const node=document.createElement('dialog'); node.className='msg-dialog';
    node.innerHTML='<div class="msg-dialog-header"><h2>'+escape(title)+'</h2><button class="btn icon" type="button" data-msg-close aria-label="Close">&#215;</button></div><form>'+html+'<p class="hint" role="status"></p><button class="btn primary" type="submit">'+escape(title)+'</button></form>';
    node.querySelector('[data-msg-close]').onclick=()=>node.close(); node.addEventListener('close',()=>node.remove());
    node.querySelector('form').onsubmit=async event=>{event.preventDefault(); const button=node.querySelector('[type=submit]'); button.disabled=true; try { await submit(new FormData(event.target)); node.close(); } catch(error) { node.querySelector('[role=status]').textContent=error.message; } finally { button.disabled=false; }};
    document.body.append(node); node.showModal();
  }
  el('msgNew').onclick=async()=>{
    await refresh(); if(!data)return;
    dialog('Open chat','<label>Conversation<select name="target" required><optgroup label="Groups">'+data.groups.map(group=>'<option value="group:'+group.id+'">'+escape(group.title)+'</option>').join('')+'</optgroup><optgroup label="People">'+data.contacts.map(user=>'<option value="direct:'+escape(user.id)+'">'+escape(user.name)+' · '+escape(user.role)+'</option>').join('')+'</optgroup></select></label>',async form=>{
      const value=form.get('target'),split=value.indexOf(':'),type=value.slice(0,split),id=value.slice(split+1);
      const result=await api('/open',type==='group'?{kind:type,groupId:Number(id)}:{kind:type,accountId:id}); await refresh(); await openRoom(result.roomId);
    });
  };
  el('msgAssign').onclick=async()=>{
    try {
      await refresh(); await examPull(); const assigned=await api('/assignments');
      const exams=examLoad();
      dialog('Assign exam','<label>Exam<select name="exam" required>'+exams.map(exam=>'<option value="'+exam.id+'">'+escape(exam.title)+'</option>').join('')+'</select></label><label>Recipient<select name="target" required><optgroup label="Groups">'+data.groups.map(group=>'<option value="group:'+group.id+'">'+escape(group.title)+'</option>').join('')+'</optgroup><optgroup label="Students">'+data.contacts.filter(user=>user.role==='Student').map(user=>'<option value="student:'+escape(user.id)+'">'+escape(user.name)+'</option>').join('')+'</optgroup></select></label><label>Action<select name="action"><option value="assign">Assign</option><option value="unassign">Unassign</option></select></label>',async form=>{
        const value=form.get('target'),split=value.indexOf(':'),targetKind=value.slice(0,split),targetId=value.slice(split+1),examId=Number(form.get('exam'));
        const result=await api('/assignment',{targetKind,targetId,examId,action:form.get('action'),clientKey:crypto.randomUUID()});
        if(targetKind==='group') { await groupPull(true); await examPull(true); }
        await refresh(); status(result.unchanged?'This assignment is already up to date.':'Assignment saved.');
      });
    } catch(error) { status(error.message); }
  };
  el('msgCompose').onsubmit=async event=>{
    event.preventDefault(); if(busy || !room || !el('msgText').value.trim())return;
    const text=el('msgText').value.trim(),category=reviewer()&&el('msgAnnouncement').checked?'learning':'personal';
    if(!pending || pending.text!==text || pending.category!==category || pending.replyTo!==(reply?.id||null))pending={roomId:room,text,category,replyTo:reply?.id||null,clientKey:crypto.randomUUID()};
    remember(); busy=true; el('msgSend').disabled=true; el('msgSendState').textContent='Sending…';
    const sentRoom=room,gen=generation;
    try {
      await api('/send',pending);
      if(sentRoom!==room || gen!==generation)return;
      pending=null; reply=null; el('msgText').value=''; paintReply(); remember(); el('msgSendState').textContent='Sent';
      if(category!==kind)kind=category; await history(); await refresh();
    } catch(error) { el('msgSendState').textContent=error.message; el('msgSend').textContent='Retry'; }
    finally { busy=false; el('msgSend').disabled=false; if(!pending)el('msgSend').textContent='Send'; }
  };
  el('msgText').addEventListener('input',remember);
  el('msgRoomSearch').addEventListener('input',paintRooms); el('msgUnreadOnly').onchange=paintRooms;
  el('msgTextSearch').addEventListener('input',()=>{clearTimeout(queryTimer);queryTimer=setTimeout(()=>history().catch(error=>status(error.message)),180);});
  el('msgOlder').onclick=()=>history({older:true}).catch(error=>status(error.message));
  el('msgLatest').onclick=()=>{timeline.scrollTop=timeline.scrollHeight;el('msgLatest').hidden=true;markRead().then(refresh).catch(error=>status(error.message));};
  el('msgListBack').onclick=()=>{remember();room='';paintRooms();};
  el('msgMute').onclick=async()=>{try { const selected=data.rooms.find(row=>row.id===room);await api('/mute',{roomId:room,muted:!selected.muted});await refresh(); }catch(error){status(error.message);}};
  let readTimer; timeline.addEventListener('scroll',()=>{clearTimeout(readTimer);readTimer=setTimeout(()=>markRead().then(refresh).catch(()=>{}),400);});
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-msg-open],[data-msg-category],[data-msg-room],[data-msg-reply],[data-msg-quote],[data-msg-exam],[data-msg-cancel-reply],[data-msg-preview]'); if(!target)return;
    try {
      if(target.hasAttribute('data-msg-open')) { if(!current())return; window.enquizVisit('messages');await refresh();if(!room){let saved;try{saved=sessionStorage.getItem('enquiz-chat-room:'+account);}catch{}if(data?.rooms.some(row=>row.id===saved))await openRoom(saved);}else await history(); }
      else if(target.dataset.msgPreview) {kind=target.dataset.msgPreviewKind;window.enquizVisit('messages');await refresh();await openRoom(target.dataset.msgPreview);}
      else if(target.dataset.msgCategory) { kind=target.dataset.msgCategory;badge();paintRooms();if(room)await history(); }
      else if(target.dataset.msgRoom)await openRoom(target.dataset.msgRoom);
      else if(target.dataset.msgReply) { reply=messages.find(row=>row.id===Number(target.dataset.msgReply));paintReply();remember();el('msgText').focus(); }
      else if(target.hasAttribute('data-msg-cancel-reply')) {reply=null;paintReply();remember();}
      else if(target.dataset.msgQuote) { const id=Number(target.dataset.msgQuote);let node=timeline.querySelector('[data-msg-id="'+id+'"]');if(!node){const parent=messages.find(row=>row.replyTo===id);kind=parent?.replyCategory||kind;el('msgTextSearch').value='';await history({before:id+1});badge();paintRooms();node=timeline.querySelector('[data-msg-id="'+id+'"]');}if(node){timeline.querySelectorAll('.is-focused').forEach(row=>row.classList.remove('is-focused'));node.classList.add('is-focused');node.scrollIntoView({block:'center'});node.focus({preventScroll:true});}else status('The original message is unavailable in this view.'); }
      else if(target.dataset.msgExam) { const result=await api('/exam?id='+target.dataset.msgExam);await examPull();examCurrentId=result.examId;window.enquizVisit('examblocks'); }
    } catch(error) {status(error.message);}
  });
  // Add controls without replacing the existing navigation or account handlers.
  document.querySelectorAll('[data-jump="stats"]').forEach(button=>{const next=document.createElement('button');next.type='button';next.className=button.className;next.dataset.msgOpen='';next.textContent='Messages';button.after(next);});
  const footer=document.querySelector('.side-foot');if(footer){const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.msgOpen='';button.textContent='Messages';footer.prepend(button);}
  if(typeof dayScreens!=='undefined')dayScreens.messages='account';
  const guide=el('guide');
  function paintMessageGuide() {
    if(!guide)return;
    let article=guide.querySelector('.msg-account-summary');if(!article){article=document.createElement('div');article.className='msg-account-summary';guide.append(article);}
    article.hidden=!current();const ru=guide.dataset.lang==='ru';
    const html='<h2>'+(ru?'Сообщения':'Messages')+'</h2><p>'+(ru?'В Messages выберите личный диалог или чат своей группы. Personal содержит обычную переписку, Learning — учебные объявления и назначения экзаменов. Поиск помогает найти сообщения, Reply отвечает на выбранное сообщение.':'In Messages, choose a private conversation or your group chat. Personal contains discussions; Learning contains announcements and exam assignments. Search finds messages; Reply answers a specific message.')+'</p><p>'+(ru?'Число возле My account показывает непрочитанные сообщения. Open exam открывает назначенный экзамен; Back возвращает к переписке. История сохраняется в аккаунте.':'The number beside My account counts unread messages. Open exam opens an assigned exam; Back returns to the conversation. Message history stays in your account.')+'</p>'+(reviewer()?'<p>'+(ru?'Через Assign exam можно назначить экзамен группе или ученику либо отменить назначение. Получатели автоматически получают учебное сообщение. Learning announcement отправляет официальное объявление. Личные диалоги учеников недоступны через администрирование.':'Assign exam assigns or unassigns an exam for a group or student and notifies recipients automatically. Learning announcement sends an official announcement. Student private conversations are not accessible through administration.')+'</p>':'')+'<button class="btn" type="button" data-msg-open>'+(ru?'Открыть сообщения':'Open Messages')+'</button>';
    if(article.innerHTML!==html)article.innerHTML=html;
  }
  paintMessageGuide();if(guide)new MutationObserver(paintMessageGuide).observe(guide,{attributes:true,attributeFilter:['data-lang']});
  async function tick() {
    lastPoll=Date.now();
    const user=current();
    if((user?.id||'')!==account){remember();account=user?.id||'';generation++;historyToken++;data=null;room='';messages=[];reply=null;pending=null;restoreRoom=true;timeline.replaceChildren();el('msgText').value='';badge();paintRooms();}
    document.querySelectorAll('[data-msg-open]').forEach(button=>button.hidden=!user);
    const summary=el('profile')?.querySelector('.msg-account-summary');if(summary)summary.hidden=!user;
    paintMessageGuide();
    if(!user){if(section.classList.contains('on')&&typeof accountChecked!=='undefined'&&accountChecked)window.enquizVisit('account');return;}
    await refresh();
    if(section.classList.contains('on')&&!room&&restoreRoom&&data){restoreRoom=false;let saved;try{saved=sessionStorage.getItem('enquiz-chat-room:'+account);}catch{}if(data.rooms.some(row=>row.id===saved))await openRoom(saved).catch(error=>status(error.message));}
    if(section.classList.contains('on')&&room&&!el('msgTextSearch').value.trim())await history({incremental:true}).catch(error=>status(error.message));
  }
  tick(); setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastPoll>=(section.classList.contains('on')?5000:20000))tick();},5000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});
  new MutationObserver(()=>{if(section.classList.contains('on'))tick();}).observe(section,{attributes:true,attributeFilter:['class']});
  // Authentication is owned by the existing app; observe only its UI state.
  const authObserver=new MutationObserver(()=>{if((current()?.id||'')!==account || !current() && accountChecked && section.classList.contains('on'))tick();});
  for(const id of ['account','profile'])authObserver.observe(el(id),{childList:true,subtree:true});
})();
