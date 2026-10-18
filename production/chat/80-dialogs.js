  async function showInfo(tab = infoTab || 'members') {
    if (!room) return;
    if (!['members', 'media', 'files', 'links'].includes(tab)) tab = 'members';
    infoTab = tab;
    rightMode = 'info';
    panel('right', true);
    el('msgRightTitle').textContent = 'Info';
    el('msgInfoContent').hidden = false;
    el('msgSearchContent').hidden = true;
    const selected = data.rooms.find((r) => r.id === room);
    if (!selected) return;
    const id = room;
    let members = membersCache.get(id);
    if (!members) {
      const result = await request('members', { roomId: id });
      members = result.members;
      membersCache.set(id, members);
    }
    if (id !== room || rightMode !== 'info') return;
    const rows = [
      ...(historyCache.get(room + ':personal')?.rows || []),
      ...(historyCache.get(room + ':learning')?.rows || []),
    ];
    let extra = '';
    if (tab === 'members')
      extra =
        '<div class="chat-info-members"><h3>Members \u00b7 ' +
        members.length +
        '</h3><label class="chat-search">' +
        icon('search') +
        '<input type="search" id="msgMemberSearch" placeholder="Name" aria-label="Search members"></label>' +
        members
          .map(
            (m) =>
              '<div class="chat-member" data-member-name="' +
              escape(m.name.toLocaleLowerCase()) +
              '">' +
              avatar(m.name, false, m.id) +
              '<span><strong>' +
              escape(m.name) +
              '</strong><small>' +
              escape(m.role) +
              '</small></span></div>',
          )
          .join('') +
        '</div>';
    else {
      const attachments = rows
        .filter((m) => !m.deleted)
        .flatMap((m) => m.files || [])
        .filter((f) =>
          tab === 'media'
            ? /^(image|audio|video)\//.test(f.mime)
            : tab === 'files'
              ? !/^(image|audio|video)\//.test(f.mime)
              : false,
        );
      const links =
        tab === 'links'
          ? rows.filter((m) => !m.deleted).flatMap((m) => m.text.match(/https?:\/\/[^\s<>]+/g) || [])
          : [];
      extra =
        '<p class="chat-empty">From loaded messages</p>' +
        attachments.map(attachment).join('') +
        links
          .map(
            (url) =>
              '<a class="chat-file" target="_blank" rel="noopener" href="' + escape(url) + '">' + escape(url) + '</a>',
          )
          .join('');
    }
    el('msgInfoContent').innerHTML =
      '<div class="chat-info-profile">' +
      avatar(selected.title, selected.kind === 'group', selected.kind === 'group' ? selected.id : selected.peerId) +
      '<h3>' +
      escape(selected.title) +
      '</h3><small>' +
      escape(selected.kind === 'group' ? members.length + ' members' : 'Private conversation') +
      '</small></div><div class="chat-info-tabs">' +
      ['members', 'media', 'files', 'links']
        .map(
          (t) =>
            '<button type="button" data-info-tab="' +
            t +
            '"' +
            (t === tab ? ' class="on" aria-current="page"' : '') +
            '>' +
            (t === 'members' ? 'Members' : t[0].toUpperCase() + t.slice(1)) +
            '</button>',
        )
        .join('') +
      '</div><label class="chat-setting-row"><span>Mute notifications</span><input id="msgMute" type="checkbox" ' +
      (selected.muted ? 'checked' : '') +
      '></label>' +
      (selected.access && !selected.access.protected
        ? '<button type="button" class="chat-link danger" data-relation="' +
          (selected.access.blockedByMe ? 'unblock' : 'block') +
          '">' +
          (selected.access.blockedByMe ? 'Unblock' : 'Block user') +
          '</button>'
        : '') +
      extra;
    if (selected.kind === 'group' && reviewer())
      el('msgInfoContent')
        .querySelector('.chat-info-profile')
        .insertAdjacentHTML(
          'beforeend',
          '<button type="button" class="chat-link" data-avatar-upload="' +
            escape(selected.id) +
            '">Upload group photo</button>',
        );
    if (selected.kind === 'direct')
      el('msgInfoContent')
        .querySelector('.chat-info-profile')
        .insertAdjacentHTML(
          'beforeend',
          '<div class="chat-profile-details" data-profile-details-subject="' + escape(selected.peerId) + '"></div>',
        );
    el('msgMute').onchange = async (event) => {
      try {
        const result = await request('mute', { roomId: id, muted: event.target.checked });
        upsertRoom(result.room);
      } catch (error) {
        status(error.message);
      }
    };
    el('msgMemberSearch')?.addEventListener('input', (event) => {
      const q = event.target.value.toLocaleLowerCase();
      el('msgInfoContent')
        .querySelectorAll('[data-member-name]')
        .forEach((n) => (n.hidden = !n.dataset.memberName.includes(q)));
    });
    icons();
    scheduleProfiles();
  }
  function showSearch() {
    if (!room) return;
    rightMode = 'search';
    panel('right', true);
    el('msgRightTitle').textContent = 'Search';
    el('msgInfoContent').hidden = true;
    el('msgSearchContent').hidden = false;
    el('msgTextSearch').focus();
  }
  async function search(older = false) {
    const q = el('msgTextSearch').value.trim(),
      id = room,
      c = kind,
      token = ++searchToken;
    el('msgSearchMore').hidden = true;
    if (!q) {
      el('msgSearchResults').replaceChildren();
      return;
    }
    const result = await request('history', { roomId: id, category: c, q, ...(older ? { before: searchBefore } : {}) });
    if (token !== searchToken || id !== room || q !== el('msgTextSearch').value.trim()) return;
    const html = [...result.messages]
      .reverse()
      .map(
        (m) =>
          '<button type="button" class="chat-search-result" data-search-id="' +
          m.id +
          '"><strong>' +
          escape(m.sender) +
          '</strong>' +
          escape(m.text.slice(0, 240)) +
          '<small>' +
          escape(stamp(m.createdMs || m.created * 1000)) +
          '</small></button>',
      )
      .join('');
    if (older) el('msgSearchResults').insertAdjacentHTML('beforeend', html);
    else el('msgSearchResults').innerHTML = html || '<div class="chat-empty">No matches.</div>';
    searchBefore = result.messages[0]?.id || 0;
    el('msgSearchMore').hidden = !result.more;
  }
  let messageFocusTimer;
  function clearMessageFocus() {
    clearTimeout(messageFocusTimer);
    timeline.querySelectorAll('.is-focused').forEach((node) => node.classList.remove('is-focused'));
    timeline.querySelectorAll('mark.chat-quote-highlight').forEach((node) => node.replaceWith(...node.childNodes));
  }
  function highlightQuote(node, quote) {
    const text = node.querySelector('.chat-message-text');
    if (!text || !quote) return;
    const start = text.textContent.indexOf(quote);
    if (start < 0) return;
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT),
      parts = [];
    let part,
      offset = 0;
    while ((part = walker.nextNode())) {
      const end = offset + part.length;
      if (end > start && offset < start + quote.length)
        parts.push({
          node: part,
          start: Math.max(0, start - offset),
          end: Math.min(part.length, start + quote.length - offset),
        });
      offset = end;
    }
    for (const p of parts) {
      const range = document.createRange();
      range.setStart(p.node, p.start);
      range.setEnd(p.node, p.end);
      const mark = document.createElement('mark');
      mark.className = 'chat-quote-highlight';
      range.surroundContents(mark);
    }
  }
  timeline.addEventListener('click', clearMessageFocus);
  async function focusMessage(id, category = kind, quote = '') {
    if (category !== kind) {
      kind = category;
      badge();
    }
    let node = timeline.querySelector('[data-msg-id="' + id + '"]');
    if (!node) {
      await history({ before: id + 1 });
      node = timeline.querySelector('[data-msg-id="' + id + '"]');
    }
    if (!node) {
      status('Original message unavailable.');
      return;
    }
    stickBottom = false;
    rightMode = '';
    if (innerWidth <= 700) panel('right', false);
    clearMessageFocus();
    node.classList.add('is-focused');
    highlightQuote(node, quote);
    messageFocusTimer = setTimeout(clearMessageFocus, 1500);
    node.scrollIntoView({ block: 'center' });
    node.focus({ preventScroll: true });
    scheduleRead();
  }
  el('msgTextSearch').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => search().catch((error) => status(error.message)), 220);
  };
  el('msgSearchMore').onclick = () => search(true).catch((error) => status(error.message));
  function dialog(title, html, submit) {
    const node = document.createElement('dialog');
    node.className = 'chat-dialog';
    node.style.maxWidth = '520px';
    node.innerHTML =
      '<header class="chat-dialog-head"><h2>' +
      escape(title) +
      '</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">' +
      icon('x') +
      '</button></header><form>' +
      html +
      '<p role="status"></p>' +
      (submit ? '<button type="submit" class="primary">' + escape(title) + '</button>' : '') +
      '</form>';
    node.querySelector('[data-msg-close]').onclick = () => node.close();
    node.onclose = () => node.remove();
    if (submit)
      node.querySelector('form').onsubmit = async (event) => {
        event.preventDefault();
        const button = node.querySelector('[type=submit]');
        button.disabled = true;
        try {
          await submit(new FormData(event.target));
          node.close();
        } catch (error) {
          node.querySelector('[role=status]').textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
    document.body.append(node);
    node.showModal();
    icons();
    return node;
  }
  function conversationChooser(title, onChoose, details = '', onlyPerson = '') {
    if (!ready) {
      connect();
      status('Wait for the connection, then open New chat.');
      return;
    }
    const contacts = [
        ...data.contacts,
        ...data.rooms
          .filter((r) => r.kind === 'direct' && r.peerId && r.access?.state === 'accepted' && !r.access.blocked)
          .map((r) => ({ id: r.peerId, name: r.title, role: 'Contact' })),
      ],
      rows = [
        ...data.groups.map((g) => ({ id: g.id, name: g.title, kind: 'group', role: 'Group chat' })),
        ...[...new Map(contacts.map((p) => [p.id, p])).values()].map((p) => ({ ...p, kind: 'direct' })),
      ].filter((p) => !onlyPerson || (p.kind === 'direct' && p.id === onlyPerson));
    const node = dialog(
      title,
      details +
        '<label class="chat-search"><input id="msgContactSearch" type="search" placeholder="Name, full email or login" aria-label="Search contacts"></label><button type="button" class="chat-link" data-find-person' +
        (onlyPerson ? ' hidden' : '') +
        '>' +
        icon('search') +
        ' Find by email or login</button><div class="chat-new-list"></div>',
    );
    const paint = () => {
      node.querySelector('.chat-new-list').innerHTML = rows
        .map(
          (r, i) =>
            '<button type="button" class="chat-contact" data-contact-index="' +
            i +
            '">' +
            avatar(r.name, r.kind === 'group', r.kind === 'group' ? 'group:' + r.id : r.id) +
            '<span>' +
            escape(r.name) +
            '<small>' +
            escape(r.role) +
            '</small></span></button>',
        )
        .join('');
      scheduleProfiles();
    };
    paint();
    node.querySelector('#msgContactSearch').placeholder = 'Name, email, login or @username';
    node.querySelector('[data-find-person]').lastChild.textContent = ' Find by email, login or @username';
    node.querySelector('#msgContactSearch').oninput = (event) => {
      const q = event.target.value.toLocaleLowerCase();
      node
        .querySelectorAll('[data-contact-index]')
        .forEach((n) => (n.hidden = !rows[Number(n.dataset.contactIndex)].name.toLocaleLowerCase().includes(q)));
    };
    node.querySelector('[data-find-person]').onclick = async (event) => {
      if (onlyPerson) return;
      event.currentTarget.disabled = true;
      try {
        const result = await request('lookup', { query: node.querySelector('#msgContactSearch').value });
        if (!node.open) return;
        if (!result.person) {
          node.querySelector('[role=status]').textContent = 'No account found.';
          return;
        }
        let index = rows.findIndex((r) => r.kind === 'direct' && r.id === result.person.id);
        if (index < 0) {
          rows.push({ ...result.person, kind: 'direct' });
          index = rows.length - 1;
        }
        paint();
        node
          .querySelectorAll('[data-contact-index]')
          .forEach((b) => (b.hidden = Number(b.dataset.contactIndex) !== index));
        node.querySelector('[role=status]').textContent = '';
        icons();
      } catch (error) {
        node.querySelector('[role=status]').textContent = error.message;
      } finally {
        node.querySelector('[data-find-person]').disabled = false;
      }
    };
    node.querySelector('form').onsubmit = (event) => {
      event.preventDefault();
      node.querySelector('[data-find-person]').click();
    };
    node.querySelector('.chat-new-list').onclick = async (event) => {
      const button = event.target.closest('[data-contact-index]');
      if (!button) return;
      button.disabled = true;
      try {
        const row = rows[Number(button.dataset.contactIndex)],
          result = await request(
            'open',
            row.kind === 'group' ? { kind: 'group', groupId: row.id } : { kind: 'direct', accountId: row.id },
          );
        upsertRoom(result.room);
        await onChoose(result);
        node.close();
      } catch (error) {
        node.querySelector('[role=status]').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  function newChat() {
    conversationChooser('New chat', async (result) => {
      kind = 'personal';
      await openRoom(result.roomId);
    });
  }
  async function setRoomSettings(id, patch) {
    const result = await request('room-settings', { roomId: id, ...patch });
    upsertRoom(result.room);
    badge();
    paintRooms();
    return result;
  }
  function managedDialog(title, html, submit) {
    const node = dialog(title, html, submit);
    node.classList.add('chat-manage-dialog');
    node.addEventListener('click', (event) => {
      if (event.target !== node) return;
      const r = node.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
        node.close();
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'chat-link';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => node.close();
    node.querySelector('form').append(cancel);
    return node;
  }
  function muteRoom(row, until = false) {
    if (until) {
      managedDialog(
        'Mute until…',
        '<label>Date and time<input type="datetime-local" name="until" required></label>',
        async (form) => {
          const deadline = new Date(String(form.get('until'))).getTime();
          if (!Number.isFinite(deadline) || deadline <= Date.now()) throw Error('Choose a future date and time.');
          await setRoomSettings(row.id, { muteUntil: deadline });
        },
      );
      return;
    }
    const options = [
      [3600000, 'For 1 hour'],
      [14400000, 'For 4 hours'],
      [28800000, 'For 8 hours'],
      [86400000, 'For 1 day'],
      [259200000, 'For 3 days'],
      [-1, 'Forever'],
      [0, 'Unmute'],
    ];
    const node = managedDialog(
      'Notifications',
      options
        .map(
          ([value, label]) =>
            '<label class="chat-mute-choice"><span>' +
            label +
            '</span><input type="radio" name="duration" value="' +
            value +
            '"' +
            (value === -1 ? ' checked' : '') +
            '></label>',
        )
        .join('') +
        '<button type="button" class="chat-link" data-mute-until>' +
        icon('clock') +
        ' Mute until…</button>',
      async (form) => {
        const duration = Number(form.get('duration'));
        await setRoomSettings(row.id, { muteUntil: duration > 0 ? Date.now() + duration : duration });
      },
    );
    node.querySelector('[data-mute-until]').onclick = () => {
      node.close();
      muteRoom(row, true);
    };
    node.querySelector('[type=submit]').textContent = 'Apply';
    const selected =
      row.muteUntil === -1 || (row.muteUntil === undefined && row.muted)
        ? -1
        : row.muteUntil > Date.now()
          ? options
              .filter(([value]) => value > 0)
              .sort(
                ([a], [b]) => Math.abs(a - (row.muteUntil - Date.now())) - Math.abs(b - (row.muteUntil - Date.now())),
              )[0][0]
          : 0;
    node.querySelector('input[value="' + selected + '"]').checked = true;
  }
  function folderRoom(row) {
    const folders = data.folders || [],
      node = managedDialog(
        'Add to folder',
        folders
          .map(
            (f) =>
              '<label class="chat-mute-choice"><span>' +
              escape(f.name) +
              '</span><input type="checkbox" name="folder" value="' +
              escape(f.id) +
              '"' +
              (f.roomIds.includes(row.id) ? ' checked' : '') +
              '></label>',
          )
          .join('') + '<label>New folder<input name="name" maxlength="60" placeholder="Folder name"></label>',
        async (form) => {
          const selected = new Set(form.getAll('folder'));
          for (const f of folders) {
            const included = f.roomIds.includes(row.id);
            if (included !== selected.has(f.id)) {
              const result = await request('folders', {
                op: 'save',
                id: f.id,
                name: f.name,
                roomIds: selected.has(f.id) ? [...f.roomIds, row.id] : f.roomIds.filter((id) => id !== row.id),
              });
              data.folders = result.folders;
            }
          }
          const name = String(form.get('name') || '').trim();
          if (name) {
            const result = await request('folders', { op: 'save', id: crypto.randomUUID(), name, roomIds: [row.id] });
            data.folders = result.folders;
          }
          paintRooms();
        },
      );
    node.querySelector('[type=submit]').textContent = 'Save';
  }
  function clearConversation(row, deleteChat = false) {
    const both = row.kind === 'direct' || reviewer(),
      node = managedDialog(
        deleteChat ? 'Delete chat' : 'Clear history',
        '<p>' +
          escape(
            deleteChat
              ? 'Delete this conversation and block ' + row.title + '?'
              : 'Clear all personal messages in this conversation?',
          ) +
          '</p>' +
          (both
            ? '<label class="chat-mute-choice"><span>' +
              escape(row.kind === 'direct' ? 'Delete for me and ' + row.title : 'Delete for all group members') +
              '</span><input type="checkbox" name="everyone"></label>'
            : '') +
          '<small>Study alerts are kept.</small>',
        async (form) => {
          const result = await request('clear-history', { roomId: row.id, everyone: form.has('everyone'), deleteChat });
          receive({ type: 'history-cleared', ...result });
          try {
            localStorage.removeItem('english-chat-draft-v1:' + account + ':' + row.id);
          } catch {}
        },
      );
    node.querySelector('[type=submit]').textContent = deleteChat ? 'Delete' : 'Clear';
  }
  async function soundRoom(row) {
    const choices = window.NotificationSounds?.list?.() || [],
      node = managedDialog(
        'Notification sound',
        '<label>Sound<select name="sound"><option value="">Default sound</option>' +
          choices
            .map(
              (s) =>
                '<option value="' +
                escape(s.id) +
                '"' +
                (s.id === row.sound ? ' selected' : '') +
                '>' +
                escape(s.name) +
                '</option>',
            )
            .join('') +
          '</select></label><div class="sound-actions"><button type="button" data-sound-preview class="btn">Preview</button></div><p class="hint" data-sound-status role="status"></p>',
        async (form) => {
          await setRoomSettings(row.id, { sound: String(form.get('sound')) });
        },
      );
    node.querySelector('[type=submit]').textContent = 'Save';
    const select = node.querySelector('[name=sound]'),
      statusNode = node.querySelector('[data-sound-status]');
    const preview = async () => {
      const id = String(select.value || '');
      try {
        await window.NotificationSounds?.unlock?.();
        if (!id) await window.NotificationSounds?.play?.(true);
        else await window.NotificationSounds?.playFor?.(id, true);
        if (statusNode) statusNode.textContent = '';
      } catch (error) {
        if (statusNode) statusNode.textContent = error.message || 'Preview unavailable.';
      }
    };
    select?.addEventListener('change', () => {
      preview().catch(() => {});
    });
    node.querySelector('[data-sound-preview]')?.addEventListener('click', () => {
      preview().catch(() => {});
    });
  }
  function openChatWindow(row) {
    const url = new URL(location.href);
    url.searchParams.set('chatWindow', row.id);
    url.hash = '';
    const popup = window.open(
      url.href,
      'english-chat-' + row.id.replace(/[^a-z0-9]/gi, '_'),
      'popup,width=850,height=800',
    );
    if (!popup) status('The browser blocked the chat window.');
  }
  function roomMenu(row, x, y) {
    closeContext();
    let node = document.getElementById('chatRoomContext');
    if (!node) {
      node = document.createElement('div');
      node.id = 'chatRoomContext';
      node.className = 'chat-context chat-room-context';
      node.setAttribute('role', 'menu');
      document.body.append(node);
    }
    const limited = listMode === 'contacts' || kind === 'learning';
    const items = [
      ['window', 'external-link', 'Open in window'],
      ['pin', 'pin', row.pinOrder ? 'Unpin' : 'Pin'],
      ['up', 'arrow-up', 'Move pin up'],
      ['down', 'arrow-down', 'Move pin down'],
      ['mute', 'bell-off', 'Mute'],
      ['sound', 'music', 'Sound'],
      ...(limited
        ? []
        : [
            ['archive', 'archive', row.archived ? 'Unarchive' : 'Archive'],
            ['folder', 'folder-plus', 'Add to folder…'],
          ]),
      ...(listMode === 'chats' && kind === 'personal' && !row.personalHidden
        ? [['to-contacts', 'users-round', 'Move to Contacts']]
        : []),
      ['clear', 'eraser', 'Clear history'],
    ];
    if (row.kind === 'group' || !row.access?.protected) items.push(['delete', 'trash-2', 'Delete chat']);
    node.innerHTML = items
      .filter(([action]) => !['up', 'down'].includes(action) || row.pinOrder)
      .map(
        ([action, image, label]) =>
          '<button type="button" role="menuitem" data-room-action="' +
          action +
          '"' +
          (action === 'delete' ? ' class="danger"' : '') +
          '>' +
          icon(image) +
          '<span>' +
          label +
          '</span></button>',
      )
      .join('');
    node.hidden = false;
    icons();
    const box = node.getBoundingClientRect();
    node.style.left = Math.max(8, Math.min(x, innerWidth - box.width - 8)) + 'px';
    node.style.top = Math.max(8, Math.min(y, innerHeight - box.height - 8)) + 'px';
    node.onclick = async (event) => {
      const action = event.target.closest('[data-room-action]')?.dataset.roomAction;
      if (!action) return;
      node.hidden = true;
      try {
        if (action === 'window') openChatWindow(row);
        if (action === 'pin')
          await setRoomSettings(row.id, {
            pinOrder: row.pinOrder ? 0 : Math.max(0, ...data.rooms.map((r) => r.pinOrder || 0)) + 1,
          });
        if (action === 'up' || action === 'down') {
          const pins = data.rooms.filter((r) => r.pinOrder).sort((a, b) => a.pinOrder - b.pinOrder),
            at = pins.findIndex((r) => r.id === row.id),
            to = at + (action === 'up' ? -1 : 1);
          if (to >= 0 && to < pins.length) await reorderPin(row.id, pins[to].id);
        }
        if (action === 'mute') muteRoom(row);
        if (action === 'sound') await soundRoom(row);
        if (action === 'archive') await setRoomSettings(row.id, { archived: !row.archived });
        if (action === 'folder') folderRoom(row);
        if (action === 'to-contacts') await setRoomSettings(row.id, { personalHidden: true });
        if (action === 'clear' || action === 'delete') clearConversation(row, action === 'delete');
      } catch (error) {
        status(error.message);
      }
    };
    node.querySelector('button')?.focus();
  }
  async function reorderPin(source, target) {
    const pins = data.rooms.filter((r) => r.pinOrder).sort((a, b) => a.pinOrder - b.pinOrder),
      from = pins.findIndex((r) => r.id === source),
      to = pins.findIndex((r) => r.id === target);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = pins.splice(from, 1);
    pins.splice(to, 0, moved);
    for (let i = 0; i < pins.length; i++) await setRoomSettings(pins[i].id, { pinOrder: i + 1 });
  }
  el('msgRooms').addEventListener('contextmenu', async (event) => {
    const target = event.target.closest('[data-msg-room],[data-contact-id],[data-chat-group],[data-chat-folder]');
    if (!target) return;
    event.preventDefault();
    try {
      if (target.dataset.chatFolder) {
        const folder = data.folders?.find((f) => f.id === target.dataset.chatFolder);
        if (!folder) return;
        managedDialog(
          'Edit folder',
          '<label>Name<input name="name" maxlength="60" value="' +
            escape(folder.name) +
            '"></label><label class="chat-mute-choice"><span>Delete folder (keep chats)</span><input type="checkbox" name="remove"></label>',
          async (form) => {
            const result = await request('folders', {
              op: form.has('remove') ? 'delete' : 'save',
              id: folder.id,
              name: String(form.get('name')),
              roomIds: folder.roomIds,
            });
            data.folders = result.folders;
            if (chatListView === folder.id) chatListView = '';
            paintRooms();
          },
        );
        return;
      }
      let row = data.rooms.find(
        (r) =>
          r.id === target.dataset.msgRoom ||
          (target.dataset.contactId && r.peerId === target.dataset.contactId) ||
          (target.dataset.chatGroup && r.id === 'group:' + target.dataset.chatGroup),
      );
      if (!row) {
        const result = await request(
          'open',
          target.dataset.contactId
            ? { kind: 'direct', accountId: target.dataset.contactId }
            : { kind: 'group', groupId: Number(target.dataset.chatGroup) },
        );
        upsertRoom(result.room);
        row = result.room;
      }
      if (row) roomMenu(row, event.clientX, event.clientY);
    } catch (error) {
      status(error.message);
    }
  });
  el('msgRooms').addEventListener('dragstart', (event) => {
    const node = event.target.closest('[data-pin-order]');
    if (!node) return;
    draggedPin = node.dataset.msgRoom;
    event.dataTransfer.setData('application/x-chat-pin', draggedPin);
  });
  el('msgRooms').addEventListener('dragover', (event) => {
    if (draggedPin && event.target.closest('[data-pin-order]')) event.preventDefault();
  });
  el('msgRooms').addEventListener('drop', (event) => {
    if (!draggedPin) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target.closest('[data-pin-order]')?.dataset.msgRoom,
      source = draggedPin;
    draggedPin = '';
    if (target) reorderPin(source, target).catch((error) => status(error.message));
  });
  el('msgRooms').addEventListener('dragend', () => {
    draggedPin = '';
  });
  el('msgRooms').addEventListener('click', async (event) => {
    const target = event.target.closest(
      '[data-chat-archive],[data-chat-folder],[data-chat-list-back],[data-chat-group],[data-contact-group-back],[data-contact-group-open]',
    );
    if (!target) return;
    try {
      if (target.hasAttribute('data-contact-group-back')) {
        contactGroupView = null;
        el('msgRoomSearch').value = '';
        paintRooms();
        return;
      }
      if (target.dataset.contactGroupOpen) {
        const result = await request('open', { kind: 'group', groupId: Number(target.dataset.contactGroupOpen) });
        upsertRoom(result.room);
        contactGroupView = null;
        kind = 'personal';
        listMode = 'chats';
        await openRoom(result.roomId);
        return;
      }
      if (target.dataset.chatGroup) {
        const groupId = Number(target.dataset.chatGroup);
        const result = await request('open', { kind: 'group', groupId });
        upsertRoom(result.room);
        const members = await request('members', { roomId: result.roomId });
        contactGroupView = {
          groupId,
          roomId: result.roomId,
          title: result.room?.title || data.groups.find((g) => g.id === groupId)?.title || 'Group',
          members: members.members || [],
        };
        listMode = 'contacts';
        el('msgRoomSearch').value = '';
        paintRooms();
        return;
      }
      chatListView = target.hasAttribute('data-chat-archive') ? 'archive' : target.dataset.chatFolder || '';
      listMode = 'chats';
      contactGroupView = null;
      el('msgRoomSearch').value = '';
      paintRooms();
    } catch (error) {
      status(error.message);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    const node = document.getElementById('chatRoomContext');
    if (node && !node.contains(event.target)) node.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const node = document.getElementById('chatRoomContext');
      if (node) node.hidden = true;
    }
  });
  function forwardMessage(id) {
    const ids = Array.isArray(id) ? id : [id],
      messages = ids.map(findMessage).filter(Boolean);
    if (!messages.length || messages.some((m) => m.deleted || m.category !== 'personal')) return;
    const restricted = [...new Set(messages.map((m) => m.forwardTo).filter(Boolean))];
    if (restricted.length > 1 || restricted[0] === account) {
      status('Study references can only be forwarded to their teacher.');
      return;
    }
    const sourceRoomId = room,
      keys = messages.map(() => crypto.randomUUID());
    conversationChooser(
      'Forward message',
      async (result) => {
        for (let i = 0; i < messages.length; i++)
          await request('forward', {
            sourceRoomId,
            messageId: messages[i].id,
            targetRoomId: result.roomId,
            clientKey: keys[i],
          });
        status('');
        kind = 'personal';
        await openRoom(result.roomId);
      },
      '<div class="chat-forward-summary"><strong>' +
        escape(messages.length === 1 ? messages[0].sender : messages.length + ' messages') +
        '</strong><p>' +
        escape(messages[0].text.slice(0, 180) || messages[0].files?.[0]?.name || 'Attachment') +
        '</p></div>',
      restricted[0] || '',
    );
  }
  function studyReference(message, quote = null) {
    if (!message || message.deleted || message.senderId === account || message.canStudyReply === false) return;
    const sourceRoomId = room,
      clientKey = crypto.randomUUID(),
      draft = 'english-chat-alert-reply:' + account + ':' + sourceRoomId + ':' + message.id;
    const node = dialog(
      'Reply to teacher',
      '<div class="chat-forward-summary"><strong>' +
        escape(message.sender) +
        '</strong><p>' +
        escape(quote || message.text) +
        '</p></div><p>This reply will go to ' +
        escape(message.sender) +
        ' in Personal.</p><label>Message<textarea name="text" maxlength="4000" rows="4" placeholder="Add a comment"></textarea></label>',
      async () => {
        const text = area.value.trim(),
          result = await request('study-reply', {
            sourceRoomId,
            messageId: message.id,
            text,
            quote,
            format: window.TextColors?.trim(colorFormat, area.value) || null,
            clientKey,
          });
        try {
          localStorage.removeItem(draft);
        } catch {}
        upsertRoom(result.room);
        kind = 'personal';
        await openRoom(result.roomId);
        status("Sent to the teacher's personal chat. Continue the conversation here.");
      },
    );
    const area = node.querySelector('textarea');
    let colorFormat = null;
    try {
      area.value = localStorage.getItem(draft) || '';
    } catch {}
    area.oninput = () => {
      try {
        localStorage.setItem(draft, area.value);
      } catch {}
    };
    window.TextColors?.mount(area, {
      onChange: (value) => {
        colorFormat = value;
      },
    });
    area.focus();
  }
  async function replyMessage(message) {
    if (!message || message.deleted) return;
    if (message.category === 'learning' && message.senderId !== account && message.canStudyReply !== false) {
      studyReference(message);
      return;
    }
    if (message.category === 'learning') {
      kind = 'personal';
      badge();
      paintRooms();
      await history();
    }
    reply = message;
    paintDraft();
    remember();
    focusComposer();
  }
