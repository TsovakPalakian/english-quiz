  function upsertRoom(row) {
    if (!row) return;
    const old = data.rooms.find((r) => r.id === row.id);
    if (old && (old.revision || 0) > (row.revision || 0)) return;
    if (old) Object.assign(old, row);
    else data.rooms.push(row);
  }
  function badge() {
    const unread = { personal: 0, learning: 0 };
    for (const r of data.rooms)
      if (!r.archived && !r.access?.blockedByMe)
        for (const c of ['personal', 'learning']) unread[c] += r.unread?.[c] || 0;
    data.unread = unread;
    data.total = unread.personal + unread.learning;
    document.querySelectorAll('[data-exam-unread]').forEach((node) => node.remove());
    document.querySelectorAll('[data-jump="account"]:not(.brand-account)').forEach((button) => {
      button.textContent = 'Settings' + (data.total ? ' \u00b7 ' + data.total : '');
    });
    document.querySelectorAll('[data-msg-open]').forEach((button) => {
      button.textContent = 'Messages' + (data.total ? ' \u00b7 ' + data.total : '');
      button.hidden = !current();
    });
    section.querySelectorAll('[data-msg-category]').forEach((button) => {
      const c = button.dataset.msgCategory;
      button.textContent = (c === 'learning' ? 'Study alerts' : 'Personal') + (unread[c] ? ' \u00b7 ' + unread[c] : '');
      button.classList.toggle('on', listMode === 'chats' && c === kind);
      button.setAttribute('aria-selected', String(listMode === 'chats' && c === kind));
    });
    el('msgContactsTab').classList.toggle('on', listMode === 'contacts');
    el('msgContactsTab').setAttribute('aria-selected', String(listMode === 'contacts'));
  }
  function paintRooms() {
    scheduleProfiles();
    const query = el('msgRoomSearch').value.trim().toLocaleLowerCase(),
      folder = (data.folders || []).find((f) => f.id === chatListView),
      blocked = new Set(data.rooms.filter((r) => r.access?.blockedByMe).map((r) => r.peerId)),
      filed = new Set((data.folders || []).flatMap((f) => f.roomIds));
    const rows = data.rooms
      .filter(
        (r) =>
          !r.access?.blockedByMe &&
          (chatListView === 'archive' ? r.archived : !r.archived) &&
          (folder
            ? folder.roomIds.includes(r.id)
            : chatListView === 'archive' ||
              (kind === 'personal'
                ? r.kind === 'direct' && !filed.has(r.id) && (r.hadPersonal || r.has?.personal)
                : r.has?.learning)) &&
          (!unreadOnly || r.unread?.[kind]) &&
          (!query ||
            (roomTitle(r) + ' ' + (profileViews[r.peerId]?.username || '') + ' ' + (r.lastMessage?.text || ''))
              .toLocaleLowerCase()
              .includes(query)),
      )
      .sort((a, b) =>
        a.pinOrder && b.pinOrder
          ? a.pinOrder - b.pinOrder
          : a.pinOrder
            ? -1
            : b.pinOrder
              ? 1
              : (b.lastMessage?.createdMs || 0) - (a.lastMessage?.createdMs || 0),
      );
    let html = rows.length
      ? rows
          .map(
            (r) =>
              '<button type="button" class="msg-room' +
              (r.id === room ? ' on' : '') +
              '" data-msg-room="' +
              escape(r.id) +
              '">' +
              avatar(r.title, r.kind === 'group', r.kind === 'group' ? r.id : r.peerId) +
              '<span class="chat-room-copy"><span class="chat-room-top"><b>' +
              escape(roomTitle(r)) +
              '</b><time>' +
              (r.lastMessage ? escape(roomTime(r.lastMessage.createdMs)) : '') +
              '</time></span><span class="chat-room-preview">' +
              (r.pinOrder
                ? '<span class="chat-room-pin" title="Pinned conversation" aria-label="Pinned conversation">' +
                  icon('pin') +
                  '</span>'
                : '') +
              (r.unread?.[kind] ? '<span class="chat-counter">' + r.unread[kind] + '</span>' : '') +
              escape(roomPreview(r.lastMessage?.text || (r.kind === 'group' ? 'Group chat' : 'Private conversation'))) +
              '</span></span></button>',
          )
          .join('')
      : '<div class="chat-empty">No conversations here yet.</div>';
    if (listMode === 'contacts') {
      const contacts = [
        ...new Map(
          [
            ...data.rooms
              .filter((r) => r.kind === 'direct')
              .map((r) => ({ id: r.peerId, name: r.title, role: r.peerRole || 'Contact' })),
            ...data.contacts,
          ].map((p) => [p.id, p]),
        ).values(),
      ]
        .filter(
          (p) =>
            !blocked.has(p.id) &&
            !data.rooms.some((r) => r.peerId === p.id && r.archived) &&
            (!query ||
              (p.name + ' ' + p.role + ' ' + (profileViews[p.id]?.username || '')).toLocaleLowerCase().includes(query)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      html =
        '<h3 class="chat-list-heading">People</h3>' +
        contacts
          .map(
            (p) =>
              '<button type="button" class="chat-contact" data-contact-id="' +
              escape(p.id) +
              '">' +
              avatar(p.name, false, p.id) +
              '<span><strong>' +
              escape(roomTitle({ title: p.name, kind: 'direct', peerRole: p.role })) +
              '</strong><small>' +
              escape(profileViews[p.id]?.username || p.role) +
              '</small></span></button>',
          )
          .join('') +
        '<h3 class="chat-list-heading">Groups</h3>' +
        data.groups
          .filter(
            (g) =>
              !data.rooms.some((r) => r.id === 'group:' + g.id && r.archived) &&
              (!query || g.title.toLocaleLowerCase().includes(query)),
          )
          .sort((a, b) => a.title.localeCompare(b.title))
          .map(
            (g) =>
              '<button type="button" class="chat-contact" data-chat-group="' +
              g.id +
              '">' +
              avatar(g.title, true, 'group:' + g.id) +
              '<span><strong>' +
              escape(g.title) +
              '</strong><small>Group chat</small></span></button>',
          )
          .join('');
    }
    if (listMode === 'chats' && !chatListView && kind === 'personal') {
      const folders = (data.folders || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => {
          const unread = folderUnread(f);
          return (
            '<button type="button" class="chat-contact" data-chat-folder="' +
            escape(f.id) +
            '">' +
            icon('folder') +
            '<span>' +
            escape(f.name) +
            (unread ? ' · ' + unread : '') +
            '</span></button>'
          );
        })
        .join('');
      html = folders + html;
      if (data.rooms.some((r) => r.archived && !r.access?.blockedByMe))
        html =
          '<button type="button" class="chat-contact" data-chat-archive>' +
          icon('archive') +
          '<span>Archived</span></button>' +
          html;
    }
    if (chatListView)
      html =
        '<button type="button" class="chat-contact" data-chat-list-back>' +
        icon('arrow-left') +
        '<span>Back</span></button>' +
        html;
    el('msgListTitle').textContent = listMode === 'contacts' ? 'Contacts' : 'Chats';
    el('msgRoomSearch').placeholder = listMode === 'contacts' ? 'Name, full email or login' : 'Chats, contacts';
    el('msgLookup').hidden = listMode !== 'contacts';
    el('msgUnread').hidden = listMode === 'contacts';
    el('msgChats').classList.toggle('selected', listMode === 'chats');
    el('msgContacts').classList.toggle('selected', listMode === 'contacts');
    if (el('msgRooms').dataset.renderedHtml !== html) {
      el('msgRooms').innerHTML = html;
      el('msgRooms').dataset.renderedHtml = html;
    }
    if (chatListView) el('msgListTitle').textContent = chatListView === 'archive' ? 'Archive' : folder?.name || 'Chats';
    el('msgRooms')
      .querySelectorAll('[data-msg-room]')
      .forEach((node) => {
        const row = data.rooms.find((r) => r.id === node.dataset.msgRoom);
        if (!row) return;
        node.setAttribute('aria-label', roomTitle(row));
        node.title = roomTitle(row);
        if (row.pinOrder) {
          node.draggable = true;
          node.dataset.pinOrder = String(row.pinOrder);
          node.title += ' · Pinned conversation';
        }
      });
    el('msgRooms')
      .querySelectorAll('[data-chat-folder],[data-chat-archive]')
      .forEach((node) => {
        node.title = node.textContent.trim();
        node.setAttribute('aria-label', node.title);
      });
    const selected = data.rooms.find((r) => r.id === room);
    el('msgRoomTitle').textContent = selected ? roomTitle(selected) : 'Messages';
    el('msgRoomSubtitle').textContent = selected
      ? selected.kind === 'group'
        ? selected.members + ' members'
        : 'Private conversation'
      : 'Choose a conversation';
    if (listMode === 'contacts') el('msgRoomSearch').placeholder = 'Name, email, login or @username';
    el('msgLookup').textContent = 'Find by email, login or @username';
    const face = el('msgRoomAvatar'),
      subject = selected ? (selected.kind === 'group' ? selected.id : selected.peerId) : '',
      name = selected?.title || 'Messages';
    if (face.dataset.avatarSubject !== subject || face.dataset.avatarName !== name) {
      face.innerHTML = selected?.kind === 'group' ? icon('users-round') : escape(initials(name));
      face.dataset.avatarSubject = subject;
      face.dataset.avatarName = name;
      delete face.dataset.avatarState;
    }
    el('msgAssign').hidden = !reviewer();
    el('msgCompose').hidden = !selected || selected.access?.canSend === false || (kind === 'learning' && !reviewer());
    el('msgSearch').disabled = !selected;
    el('msgInfo').disabled = !selected;
    el('msgRoomInfo').disabled = !selected;
    const access = selected?.access;
    el('msgAccess').hidden = !access || access.protected || (access.state === 'accepted' && !access.blocked);
    el('msgAccess').innerHTML = !access
      ? ''
      : access.blocked
        ? access.blockedByMe
          ? 'You blocked this person. <button type="button" data-relation="unblock">Unblock</button>'
          : 'This conversation is blocked.'
        : access.canAccept
          ? 'Message request <button type="button" data-relation="accept">Accept</button><button type="button" data-relation="reject">Decline</button><button type="button" data-relation="block">Block</button>'
          : access.state === 'pending'
            ? 'Waiting for this person to accept your message request.'
            : access.state === 'rejected'
              ? 'The message request was declined.'
              : 'Your first message will be sent as a request. Wait for acceptance before sending more.';
    const pinned = selected?.pinned;
    el('msgPinned').hidden = !pinned;
    el('msgPinned').innerHTML = pinned ? icon('pin') + ' ' + escape(pinned.text || 'Attachment') : '';
    scheduleInputFit();
    icons();
  }
  function panel(which, show) {
    if (which === 'left') {
      prefs.left = show;
      el('msgRooms').closest('.chat-list').hidden = !show;
      el('msgListBack').hidden = show;
      if (show && innerWidth <= 700) panel('right', false);
    } else {
      prefs.right = show;
      el('msgRight').hidden = !show;
      if (show && innerWidth <= 700) panel('left', false);
    }
    savePrefs();
    fitPanels();
  }
  function fitPanels() {
    const narrow = innerWidth <= 700,
      left = section.querySelector('.chat-list'),
      right = el('msgRight'),
      rail = section.querySelector('.chat-rail').getBoundingClientRect().width,
      budget = Math.max(240, section.querySelector('.chat-shell').clientWidth - rail - 360);
    let lw = Math.min(
        prefs.leftWidth || (innerWidth > 1380 ? 400 : innerWidth > 1050 ? 320 : 300),
        Math.max(80, budget),
      ),
      rw = Math.min(
        prefs.rightWidth || (innerWidth > 1380 ? 400 : innerWidth > 1050 ? 320 : 360),
        Math.max(240, budget),
      );
    if (innerWidth > 1050 && !left.hidden && !right.hidden && lw + rw > budget) {
      const ratio = budget / (lw + rw);
      lw = Math.max(240, Math.floor(lw * ratio));
      rw = Math.max(240, budget - lw);
    }
    left.classList.toggle('is-compact', !narrow && lw < 180);
    left.style.width = narrow ? '' : lw + 'px';
    left.style.flexBasis = narrow ? '' : lw + 'px';
    right.style.width = narrow ? '' : rw + 'px';
    right.style.flexBasis = narrow ? '' : rw + 'px';
    for (const [id, node, width] of [
      ['msgResizeLeft', left, lw],
      ['msgResizeRight', right, rw],
    ]) {
      const handle = el(id);
      handle.hidden = narrow || node.hidden || (id === 'msgResizeRight' && innerWidth <= 1050);
      handle.setAttribute('aria-valuemin', id === 'msgResizeLeft' ? '80' : '240');
      handle.setAttribute('aria-valuemax', String(Math.max(240, budget)));
      handle.setAttribute('aria-valuenow', String(Math.round(width)));
    }
    scheduleInputFit();
  }
  for (const [id, name, side] of [
    ['msgResizeLeft', 'leftWidth', 1],
    ['msgResizeRight', 'rightWidth', -1],
  ]) {
    const handle = el(id);
    let drag;
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag = {
        x: event.clientX,
        width:
          side === 1
            ? section.querySelector('.chat-list').getBoundingClientRect().width
            : el('msgRight').getBoundingClientRect().width,
      };
      handle.setPointerCapture(event.pointerId);
      section.classList.add('is-resizing');
    };
    handle.onpointermove = (event) => {
      if (!drag) return;
      prefs[name] = Math.max(
        id === 'msgResizeLeft' ? 80 : 240,
        Math.min(640, drag.width + side * (event.clientX - drag.x)),
      );
      fitPanels();
    };
    const end = () => {
      if (!drag) return;
      drag = null;
      section.classList.remove('is-resizing');
      savePrefs();
    };
    handle.onpointerup = end;
    handle.onpointercancel = end;
    handle.onlostpointercapture = end;
    handle.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const min = id === 'msgResizeLeft' ? 80 : 240;
      prefs[name] =
        event.key === 'Home'
          ? min
          : event.key === 'End'
            ? 640
            : Math.max(
                min,
                Math.min(
                  640,
                  Number(handle.getAttribute('aria-valuenow')) +
                    (event.key === 'ArrowRight' ? 1 : -1) * side * (event.shiftKey ? 40 : 10),
                ),
              );
      fitPanels();
      savePrefs();
    };
  }
  let lastAlert = 0;
  const alertSeen = new Set();
  function unlockAlertAudio(event) {
    if (!event.isTrusted || !current()) return;
    window.NotificationSounds?.unlock().catch(() => {});
  }
  document.addEventListener('pointerdown', unlockAlertAudio, { passive: true });
  document.addEventListener('keydown', unlockAlertAudio, { passive: true });
  function messageSound(event, isNew) {
    const id = event.room.id + ':' + event.message.id;
    if (alertSeen.has(id)) return;
    alertSeen.add(id);
    if (alertSeen.size > 500) alertSeen.delete(alertSeen.values().next().value);
    if (
      !isNew ||
      mutedChat(event.room) ||
      event.message.senderId === account ||
      !current() ||
      Date.now() - lastAlert < 400
    )
      return;
    try {
      const key = 'english-chat-alert:' + account + ':' + event.room.id + ':' + event.message.id;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, String(Date.now()));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const old = localStorage.key(i);
        if (old?.startsWith('english-chat-alert:') && Number(localStorage.getItem(old)) < Date.now() - 86400000)
          localStorage.removeItem(old);
      }
    } catch {}
    lastAlert = Date.now();
    try {
      const sounds = window.NotificationSounds;
      if (sounds?.playFor) sounds.playFor(event.room.sound).catch(() => {});
      else sounds?.play();
    } catch {}
  }
