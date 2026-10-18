  function status(text) {
    el('msgStatus').textContent = text;
    el('msgStatus').hidden = !text;
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      const notice = el('msgStatus');
      if (!notice.hidden && !notice.contains(event.target)) status('');
    },
    { capture: true, passive: true },
  );
  function savePrefs() {
    try {
      localStorage.setItem('english-chat-settings:' + account, JSON.stringify(prefs));
    } catch {}
  }
  function remember() {
    scheduleInputFit();
    if (!account || !room) return;
    try {
      localStorage.setItem(draftKey(), JSON.stringify({ text: composer.value, format, pending, reply, files }));
    } catch {}
  }
  function scheduleInputFit() {
    if (inputFrame) return;
    inputFrame = requestAnimationFrame(() => {
      inputFrame = 0;
      fitInput();
    });
  }
  function fitInput() {
    if (!active()) return;
    if (el('msgCompose').hidden) {
      section.style.setProperty('--chat-composer-offset', '16px');
      return;
    }
    const rich = composer.parentElement.querySelector('.text-color-rich:not([hidden])'),
      input = rich || composer,
      style = getComputedStyle(composer);
    if (!inputBase)
      inputBase = Math.max(
        58,
        (parseFloat(style.lineHeight) || 24) * 2 +
          (parseFloat(style.paddingTop) || 0) +
          (parseFloat(style.paddingBottom) || 0),
      );
    const form = el('msgCompose'),
      formStyle = getComputedStyle(form),
      fixed = [...chatCenter.children]
        .filter((n) => n !== form && n !== timeline && getComputedStyle(n).position !== 'absolute')
        .reduce((sum, n) => sum + n.getBoundingClientRect().height, 0);
    const overhead =
      el('msgReply').getBoundingClientRect().height +
      el('msgAttachments').getBoundingClientRect().height +
      (el('msgCompose').querySelector('.chat-record-frame:not([hidden])')?.getBoundingClientRect().height || 0) +
      el('msgCompose').querySelector('.chat-compose-tools').getBoundingClientRect().height +
      (parseFloat(formStyle.paddingTop) || 0) +
      (parseFloat(formStyle.paddingBottom) || 0) +
      (parseFloat(formStyle.marginBottom) || 0) +
      10;
    const maximum = Math.min(
        inputBase * 4,
        Math.max(inputBase, chatCenter.clientHeight - fixed - overhead - Math.min(100, chatCenter.clientHeight * 0.2)),
      ),
      wasBottom = stickBottom || bottom(),
      scroll = input.scrollTop;
    input.style.minHeight = inputBase + 'px';
    input.style.maxHeight = maximum + 'px';
    input.style.height = 'auto';
    input.style.height = Math.min(maximum, Math.max(inputBase, input.scrollHeight)) + 'px';
    input.scrollTop = scroll;
    section.style.setProperty(
      '--chat-composer-offset',
      Math.ceil(form.getBoundingClientRect().height + (parseFloat(formStyle.marginBottom) || 0) + 12) + 'px',
    );
    if (wasBottom) timeline.scrollTop = timeline.scrollHeight;
  }
  function focusComposer() {
    const rich = composer.parentElement.querySelector('.text-color-rich:not([hidden])');
    (rich || composer).focus();
  }
  window.TextColors?.mount(composer, {
    onChange: (value) => {
      format = value;
      remember();
    },
  });
  const colorTools = composer.parentElement.querySelector('.text-color-tools');
  if (colorTools) el('msgStickers').after(colorTools);
  function loadDraft() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(draftKey()) || '{}');
    } catch {}
    composer.value = saved.text || '';
    format = saved.format || null;
    pending = saved.pending || null;
    reply = saved.reply || null;
    files = saved.files || [];
    window.TextColors?.sync(composer, format);
    paintDraft();
  }
  function paintDraft() {
    if (pending && pending.quote === undefined) pending.quote = null;
    el('msgReply').hidden = !reply;
    el('msgReply').innerHTML = reply
      ? '<span>' +
        escape(reply.sender) +
        ': ' +
        escape(reply.text?.slice(0, 160)) +
        '</span><button type="button" class="chat-icon" data-msg-cancel-reply title="Cancel reply" aria-label="Cancel reply">' +
        icon('x') +
        '</button>'
      : '';
    el('msgAttachments').replaceChildren();
    paintUploads();
    scheduleInputFit();
    icons();
  }
  function request(action, body = {}) {
    if (!ready || socket?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('Chat is reconnecting. Your draft is saved.'));
    const requestId = crypto.randomUUID(),
      gen = generation;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        requests.delete(requestId);
        reject(new Error('No acknowledgement yet. Retry safely.'));
      }, 20000);
      requests.set(requestId, { resolve, reject, timer, gen });
      socket.send(JSON.stringify({ requestId, action, body }));
    });
  }
  function disconnect() {
    clearTimeout(reconnectTimer);
    ready = false;
    const old = socket;
    socket = null;
    old?.close();
    for (const p of requests.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Connection interrupted. Your draft is saved.'));
    }
    requests.clear();
  }
  function connect() {
    if (!signedIn() || socket || !account) return;
    clearTimeout(reconnectTimer);
    const gen = generation;
    status('Connecting...');
    const ws = new WebSocket(
      (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/messages/socket?after=' + seq,
    );
    socket = ws;
    void readChatCache().then((cached) => {
      if (gen !== generation || socket !== ws || ready) return;
      if (applyChatCache(cached)) {
        paintRooms();
        badge();
      }
    });
    ws.onmessage = (event) => {
      if (socket !== ws || gen !== generation) return;
      let value;
      try {
        value = JSON.parse(event.data);
      } catch {
        return;
      }
      if (value.type === 'response') {
        const p = requests.get(value.requestId);
        if (!p) return;
        clearTimeout(p.timer);
        requests.delete(value.requestId);
        if (value.error) p.reject(new Error(value.error));
        else p.resolve(value.result);
      } else if (value.type === 'snapshot') {
        profileRequested.clear();
        Object.assign(profileViews, value.data.profiles || {});
        const reconnect = ready;
        ready = true;
        reconnectCount = 0;
        data = value.data;
        if ((data.catalogVersion || 0) !== catalogVersion) {
          catalogVersion = data.catalogVersion || 0;
          scheduleExamRefresh();
        }
        seq = Math.max(seq, data.seq || 0);
        status('');
        void writeChatCache(data);
        paintRooms();
        badge();
        const windowRoom = new URL(location.href).searchParams.get('chatWindow');
        if (!reconnect && windowRoom && data.rooms.some((r) => r.id === windowRoom)) {
          window.enquizVisit('messages');
          section.classList.add('chat-detached');
          panel('left', false);
          openRoom(windowRoom).catch((error) => status(error.message));
        }
        if (room && !data.rooms.some((row) => row.id === room)) {
          room = '';
          timeline.replaceChildren();
          paintRooms();
        }
        if (active() && room) {
          if (reconnect || state()?.loaded) history({ refresh: true }).catch((error) => status(error.message));
          else history().catch((error) => status(error.message));
        } else if (active() && !room) {
          let saved;
          try {
            saved = sessionStorage.getItem('enquiz-chat-room:' + account);
          } catch {}
          if (data.rooms.some((row) => row.id === saved)) openRoom(saved).catch((error) => status(error.message));
        }
        acknowledgeSnapshot();
      } else if (value.type === 'event') {
        seq = Math.max(seq, value.seq || 0);
        receive(value.event);
      }
    };
    ws.onclose = (event) => {
      if (socket !== ws || gen !== generation) return;
      disconnect();
      if (event.code === 4003) {
        if (current() && typeof leaveAccount === 'function') void leaveAccount({ signedOut: true });
        return;
      }
      void window.DatabaseContext?.check?.();
      if (!signedIn()) return;
      status('Connection interrupted. Reconnecting...');
      if (reconnectCount >= 8) {
        status('Chat unavailable. Click Chats to reconnect.');
        return;
      }
      const delay = Math.min(30000, 700 * 2 ** reconnectCount++) + Math.random() * 300;
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => {
      if (socket === ws) status('Unable to connect. Your draft is saved.');
    };
  }
