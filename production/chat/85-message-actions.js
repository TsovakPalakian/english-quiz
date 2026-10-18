  function closeContext() {
    el('msgContext').hidden = true;
    const menu = document.getElementById('chatRoomContext');
    if (menu) menu.hidden = true;
    contextMessage = null;
    contextRoom = '';
  }
  function saveFile(file) {
    if (!file?.url?.startsWith('/api/messages/file?')) return;
    const link = document.createElement('a');
    link.href = file.url + '&download=1';
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
  }
  function isImageFile(file) {
    return !!(
      file &&
      (String(file.mime || '').startsWith('image/') || /\.(heic|heif|avif|bmp|tiff?|jpe?g|png|gif|webp)$/i.test(file.name || ''))
    );
  }
  async function copyMedia(file) {
    if (!isImageFile(file) || !file?.url?.startsWith('/api/messages/file?'))
      throw Error('Only photos can be copied.');
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
      throw Error('Copy media is unavailable in this browser.');
    const response = await fetch(file.url);
    if (!response.ok) throw Error('Unable to copy media.');
    let blob = await response.blob();
    if (
      (!blob.type.startsWith('image/') || /image\/hei[cf]/i.test(blob.type)) &&
      /\.(heic|heif)$/i.test(file.name || '')
    ) {
      const module = await import('/heic-to-1.6.6.js');
      blob = await module.heicTo({ blob, type: 'image/png', quality: 0.92 });
    }
    if (!blob.type.startsWith('image/')) throw Error('Only photos can be copied.');
    if (blob.type !== 'image/png') {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close?.();
      blob = await new Promise((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(Error('Unable to copy media.'))), 'image/png'),
      );
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    status('Photo copied.');
  }
  function canEdit(message) {
    return message.canEdit ?? (message.senderId === account && !message.examId);
  }
  function messageMenu(message, x, y, fileId = '') {
    const selected = getSelection(),
      textNode = timeline.querySelector('[data-msg-id="' + message?.id + '"] .chat-message-text');
    let quote = '';
    if (selected?.rangeCount && !selected.isCollapsed && textNode) {
      const range = selected.getRangeAt(0);
      if (textNode.contains(range.startContainer) && textNode.contains(range.endContainer)) {
        const read = (n) =>
          n.nodeType === 3 ? n.textContent : n.nodeName === 'BR' ? '\n' : [...n.childNodes].map(read).join('');
        const fragment = read(range.cloneContents()).trim();
        if (fragment && fragment.length <= 4000 && message.text.includes(fragment)) quote = fragment;
      }
    }
    if (!message || message.deleted || !Number.isSafeInteger(message.id)) return;
    closeEmoji();
    contextMessage = message;
    contextRoom = room;
    const node = el('msgContext'),
      study = message.category === 'learning',
      canReply = !study || (message.senderId !== account && message.canStudyReply !== false),
      items = [];
    if (canReply) items.push(['reply', 'reply', 'Reply']);
    node.dataset.quote = quote;
    if (canReply && quote) items.push(['quote', 'quote', 'Quote selection']);
    if (el('selpop')) el('selpop').hidden = true;
    if (message.files?.length) items.push(['save', 'download', 'Save as...']);
    const photo =
      (fileId && message.files.find((f) => f.id === fileId && isImageFile(f))) ||
      (message.files.length === 1 && isImageFile(message.files[0]) ? message.files[0] : null);
    if (photo) items.push(['copy-media', 'clipboard-plus', 'Copy media']);
    if (canEdit(message) && message.text) items.push(['edit', 'square-pen', 'Edit']);
    items.push([
      'pin',
      'pin',
      (data.rooms.find((r) => r.id === room)?.pins || []).some((p) => p.id === message.id) ||
      data.rooms.find((r) => r.id === room)?.pinned?.id === message.id
        ? 'Unpin'
        : 'Pin',
    ]);
    if ((!study || canReply) && message.forwardTo !== account) items.push(['forward', 'forward', 'Forward']);
    items.push(['select', 'circle-check', 'Select']);
    if (canEdit(message)) items.push(['delete', 'trash-2', 'Delete']);
    node.dataset.fileId = fileId;
    node.innerHTML =
      '<div class="chat-context-reactions">' +
      [0x1f44d, 0x2764, 0x1f602, 0x1f389, 0x1f525, 0x1f914, 0x1f44f]
        .map(
          (code) =>
            '<button type="button" data-context-reaction="' +
            emojiValue(code) +
            '" aria-label="React ' +
            emojiValue(code) +
            '">' +
            emojiValue(code) +
            '</button>',
        )
        .join('') +
      '</div>' +
      items
        .map(
          ([action, image, label]) =>
            '<button type="button" role="menuitem" data-context-action="' +
            action +
            '" class="' +
            (action === 'delete' ? 'danger' : '') +
            '">' +
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
    node.querySelector('[role=menuitem]')?.focus({ preventScroll: true });
  }
  function clearSelection() {
    selection.clear();
    selecting = false;
    el('msgSelection').hidden = true;
    timeline.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
  }
  function paintSelection() {
    const rows = (state()?.rows || []).filter((m) => selection.has(m.id));
    el('msgSelection').hidden = !selecting;
    el('msgSelection').innerHTML =
      '<span>' +
      rows.length +
      ' selected</span>' +
      (rows.length && rows.every((m) => m.category === 'personal' && !m.deleted)
        ? '<button type="button" data-selection-action="forward" title="Forward" aria-label="Forward">' +
          icon('forward') +
          '</button>'
        : '') +
      (rows.length && rows.every((m) => canEdit(m) && !m.deleted)
        ? '<button type="button" class="danger" data-selection-action="delete" title="Delete" aria-label="Delete">' +
          icon('trash-2') +
          '</button>'
        : '') +
      '<button type="button" data-selection-action="cancel" title="Cancel selection" aria-label="Cancel selection">' +
      icon('x') +
      '</button>';
    timeline
      .querySelectorAll('.msg-message')
      .forEach((n) => n.classList.toggle('is-selected', selection.has(Number(n.dataset.msgId))));
    icons();
  }
  function editMessage(message, id) {
    const roomRow = data.rooms.find((r) => r.id === id);
    const isPinned =
      (roomRow?.pins || []).some((p) => p.id === message.id) || roomRow?.pinned?.id === message.id;
    const node = dialog(
      'Edit',
      '<div class="chat-edit-composer"><textarea name="text" required maxlength="4000" rows="2" placeholder="Edit message" aria-label="Edit message"></textarea><div class="chat-edit-emoji" hidden></div><div class="chat-compose-tools"><button type="button" class="chat-icon" data-edit-emoji title="Smileys" aria-label="Smileys" aria-expanded="false">' +
        icon('smile') +
        '</button><button type="button" class="chat-icon" data-edit-stickers title="Emoji" aria-label="Emoji" aria-expanded="false">' +
        icon('grid-2x2') +
        '</button><button type="button" class="chat-icon" data-edit-pin title="' +
        (isPinned ? 'Unpin' : 'Pin') +
        '" aria-label="' +
        (isPinned ? 'Unpin' : 'Pin') +
        '" aria-pressed="' +
        String(!!isPinned) +
        '">' +
        icon('pin') +
        '</button><button type="button" class="chat-icon" data-edit-mic title="Record voice message" aria-label="Record voice message">' +
        icon('mic') +
        '</button><button type="button" class="chat-icon" data-edit-video title="Record video message" aria-label="Record video message">' +
        icon('video') +
        '</button><span class="chat-edit-spacer"></span><button type="submit" class="chat-icon chat-send" title="Save" aria-label="Save">' +
        icon('send-horizontal') +
        '</button></div></div>',
      async () => {
        const text = area.value.trim();
        if (!text) throw Error('Message cannot be empty.');
        await request('edit', {
          roomId: id,
          id: message.id,
          text,
          format: window.TextColors?.trim(format, area.value) || null,
          expectedEditedMs: message.editedMs || 0,
        });
      },
    );
    node.classList.add('chat-edit-dialog');
    node.style.maxWidth = '520px';
    node.querySelector('form > button.primary')?.remove();
    const area = node.querySelector('textarea');
    const emojiBox = node.querySelector('.chat-edit-emoji');
    let format = message.format || null;
    let pinned = !!isPinned;
    area.value = message.text;
    const fit = () => {
      const rich = area.parentElement?.querySelector('.text-color-rich:not([hidden])') || area;
      const base = 72;
      rich.style.minHeight = base + 'px';
      rich.style.maxHeight = base * 4 + 'px';
      rich.style.height = 'auto';
      rich.style.height = Math.min(base * 4, Math.max(base, rich.scrollHeight)) + 'px';
      if (rich !== area) {
        area.style.height = rich.style.height;
        area.style.minHeight = rich.style.minHeight;
        area.style.maxHeight = rich.style.maxHeight;
      }
    };
    const focusEdit = () => {
      const rich = area.parentElement?.querySelector('.text-color-rich:not([hidden])');
      (rich || area).focus();
    };
    window.TextColors?.mount(area, {
      onChange: (value) => {
        format = value;
        fit();
      },
    });
    window.TextColors?.sync(area, format);
    const colorTools = area.parentElement?.querySelector('.text-color-tools');
    if (colorTools) node.querySelector('[data-edit-stickers]')?.after(colorTools);
    const paintEditEmoji = (mode) => {
      const sets = mode === 'smileys' ? ['smileys'] : Object.keys(emojiIcons);
      const category = mode === 'smileys' ? 'smileys' : 'hands';
      emojiBox.hidden = false;
      emojiBox.innerHTML =
        (mode === 'emoji'
          ? '<div class="chat-emoji-tabs">' +
            sets
              .map(
                (c) =>
                  '<button type="button" data-edit-emoji-category="' +
                  c +
                  '" title="' +
                  c +
                  '" aria-label="' +
                  c +
                  '">' +
                  icon(emojiIcons[c]) +
                  '</button>',
              )
              .join('') +
            '</div>'
          : '') +
        '<div class="chat-emoji-grid">' +
        emojiSets[category]
          .map(
            ([code, label]) =>
              '<button type="button" data-edit-insert-emoji="' +
              emojiValue(code) +
              '" title="' +
              escape(label) +
              '" aria-label="' +
              escape(label) +
              '">' +
              emojiValue(code) +
              '</button>',
          )
          .join('') +
        '</div>';
      window.lucide?.createIcons({ nameAttr: 'data-chat-icon', root: emojiBox });
      emojiBox.querySelectorAll('svg[data-chat-icon]').forEach((n) => n.removeAttribute('data-chat-icon'));
    };
    node.querySelector('[data-edit-emoji]').onclick = () => {
      const open = !emojiBox.hidden && emojiBox.dataset.mode === 'smileys';
      if (open) {
        emojiBox.hidden = true;
        return;
      }
      emojiBox.dataset.mode = 'smileys';
      paintEditEmoji('smileys');
    };
    node.querySelector('[data-edit-stickers]').onclick = () => {
      const open = !emojiBox.hidden && emojiBox.dataset.mode === 'emoji';
      if (open) {
        emojiBox.hidden = true;
        return;
      }
      emojiBox.dataset.mode = 'emoji';
      paintEditEmoji('emoji');
    };
    emojiBox.onclick = (event) => {
      const insert = event.target.closest('[data-edit-insert-emoji]');
      if (insert) {
        const value = insert.dataset.editInsertEmoji;
        if (area.value.length + value.length > 4000) return;
        if (!window.TextColors?.insert(area, value))
          area.setRangeText(value, area.selectionStart, area.selectionEnd, 'end');
        fit();
        focusEdit();
        return;
      }
      const cat = event.target.closest('[data-edit-emoji-category]');
      if (cat) {
        const category = cat.dataset.editEmojiCategory;
        emojiBox.querySelector('.chat-emoji-grid').innerHTML = emojiSets[category]
          .map(
            ([code, label]) =>
              '<button type="button" data-edit-insert-emoji="' +
              emojiValue(code) +
              '" title="' +
              escape(label) +
              '" aria-label="' +
              escape(label) +
              '">' +
              emojiValue(code) +
              '</button>',
          )
          .join('');
      }
    };
    node.querySelector('[data-edit-pin]').onclick = async () => {
      try {
        const result = await request('pin', { roomId: id, id: message.id, pinned: !pinned });
        pinned = !pinned;
        const button = node.querySelector('[data-edit-pin]');
        button.title = pinned ? 'Unpin' : 'Pin';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(pinned));
        if (result.room) upsertRoom(result.room);
        paintRooms();
        const cache = state();
        if (cache?.rows) for (const row of cache.rows) mergeNode(row);
      } catch (error) {
        node.querySelector('[role=status]').textContent = error.message;
      }
    };
    const startMedia = (kind) => {
      node.close();
      if (kind === 'mic') el('msgMic').click();
      else el('msgVideo').click();
    };
    node.querySelector('[data-edit-mic]').onclick = () => startMedia('mic');
    node.querySelector('[data-edit-video]').onclick = () => startMedia('video');
    area.addEventListener('input', fit);
    fit();
    window.lucide?.createIcons({ nameAttr: 'data-chat-icon', root: node });
    node.querySelectorAll('svg[data-chat-icon]').forEach((n) => n.removeAttribute('data-chat-icon'));
    focusEdit();
  }
  function deleteMessages(ids, id) {
    const node = dialog('Delete?', '', async () => {
      for (const messageId of ids) await request('delete', { roomId: id, id: messageId });
      clearSelection();
    });
    node.classList.add('chat-delete-confirm');
    node.style.maxWidth = '280px';
    node.querySelector('[data-msg-close]').remove();
    const submit = node.querySelector('[type=submit]');
    submit.textContent = 'Deleted';
    submit.classList.add('danger');
    const actions = document.createElement('div');
    actions.className = 'chat-delete-actions';
    submit.before(actions);
    actions.append(submit);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.className = 'chat-link';
    cancel.onclick = () => node.close();
    actions.append(cancel);
    cancel.focus();
    node.addEventListener('click', (event) => {
      const rect = node.getBoundingClientRect();
      if (
        event.target === node &&
        (event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom)
      )
        node.close();
    });
  }
  el('msgContext').onclick = async (event) => {
    const target = event.target.closest('[data-context-action],[data-context-reaction]');
    if (!target || !contextMessage) return;
    const message = contextMessage,
      id = contextRoom,
      fileId = el('msgContext').dataset.fileId;
    closeContext();
    try {
      if (target.dataset.contextReaction) {
        await request('react', { roomId: id, id: message.id, emoji: target.dataset.contextReaction });
        return;
      }
      if (target.dataset.contextAction === 'quote') {
        const quote = el('msgContext').dataset.quote;
        if (!quote) return;
        if (message.category === 'learning') studyReference(message, quote);
        else await replyMessage({ ...message, text: quote, quote });
        return;
      }
      const action = target.dataset.contextAction;
      if (action === 'reply') await replyMessage(message);
      if (action === 'forward') {
        if (message.category === 'learning') studyReference(message);
        else forwardMessage(message.id);
      }
      if (action === 'edit') editMessage(message, id);
      if (action === 'delete') {
        if (selecting || selection.size) {
          selection.add(message.id);
          deleteMessages([...selection], id);
        } else deleteMessages([message.id], id);
      }
      if (action === 'pin') {
        const roomRow = data.rooms.find((r) => r.id === id);
        const pinned = (roomRow?.pins || []).some((p) => p.id === message.id) || roomRow?.pinned?.id === message.id;
        const result = await request('pin', { roomId: id, id: message.id, pinned: !pinned });
        if (result.room) upsertRoom(result.room);
        paintRooms();
        const cache = state();
        if (cache?.rows) for (const row of cache.rows) mergeNode(row);
      }
      if (action === 'select') {
        selecting = true;
        selection.add(message.id);
        paintSelection();
      }
      if (action === 'save') {
        const file =
          message.files.find((f) => f.id === fileId) || (message.files.length === 1 ? message.files[0] : null);
        if (file) saveFile(file);
        else {
          const node = dialog(
            'Save as...',
            message.files
              .map(
                (f, i) =>
                  '<button class="chat-contact" type="button" data-save-index="' +
                  i +
                  '">' +
                  icon('download') +
                  escape(f.name) +
                  '</button>',
              )
              .join(''),
          );
          node.querySelectorAll('[data-save-index]').forEach(
            (b) =>
              (b.onclick = () => {
                saveFile(message.files[Number(b.dataset.saveIndex)]);
                node.close();
              }),
          );
        }
      }
      if (action === 'copy-media') {
        const file =
          message.files.find((f) => f.id === fileId && isImageFile(f)) ||
          (message.files.length === 1 && isImageFile(message.files[0]) ? message.files[0] : null);
        if (!file) throw Error('Only photos can be copied.');
        await copyMedia(file);
      }
    } catch (error) {
      status(error.message);
    }
  };
  timeline.oncontextmenu = (event) => {
    const node = event.target.closest('.msg-message');
    if (!node) return;
    const message = state()?.rows.find((m) => m.id === Number(node.dataset.msgId));
    if (!message || message.deleted) return;
    event.preventDefault();
    messageMenu(message, event.clientX, event.clientY, event.target.closest('[data-file-id]')?.dataset.fileId);
  };
  el('msgInfoContent').oncontextmenu = (event) => {
    const file = event.target.closest('[data-file-id]');
    if (!file) return;
    const message = [
      ...(historyCache.get(room + ':personal')?.rows || []),
      ...(historyCache.get(room + ':learning')?.rows || []),
    ].find((m) => !m.deleted && m.files?.some((f) => f.id === file.dataset.fileId));
    if (message) {
      event.preventDefault();
      messageMenu(message, event.clientX, event.clientY, file.dataset.fileId);
    }
  };
  let hold,
    holdAt,
    suppressClick = 0;
  timeline.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    const node = event.target.closest('.msg-message');
    if (!node) return;
    holdAt = { x: event.clientX, y: event.clientY };
    hold = setTimeout(() => {
      suppressClick = Date.now() + 800;
      messageMenu(
        state()?.rows.find((m) => m.id === Number(node.dataset.msgId)),
        holdAt.x,
        holdAt.y,
        event.target.closest('[data-file-id]')?.dataset.fileId,
      );
    }, 550);
  });
  timeline.addEventListener('pointermove', (event) => {
    if (holdAt && Math.hypot(event.clientX - holdAt.x, event.clientY - holdAt.y) > 10) clearTimeout(hold);
  });
  for (const type of ['pointerup', 'pointercancel', 'scroll'])
    timeline.addEventListener(type, () => clearTimeout(hold));
  timeline.addEventListener(
    'click',
    (event) => {
      if (Date.now() < suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!selecting) return;
      const node = event.target.closest('.msg-message');
      if (!node) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = Number(node.dataset.msgId);
      if (selection.has(id)) selection.delete(id);
      else selection.add(id);
      paintSelection();
    },
    true,
  );
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#msgContext,#chatRoomContext,[data-msg-menu]')) closeContext();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeContext();
      clearSelection();
    }
    if (!el('msgContext').hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...el('msgContext').querySelectorAll('[role=menuitem]')],
        at = buttons.indexOf(document.activeElement);
      buttons[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
    }
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const node = event.target.closest('.msg-message');
      if (node) {
        event.preventDefault();
        const box = node.getBoundingClientRect();
        messageMenu(
          state()?.rows.find((m) => m.id === Number(node.dataset.msgId)),
          box.left + 20,
          box.top + 20,
        );
      }
    }
  });
  el('msgSelection').onclick = (event) => {
    const action = event.target.closest('[data-selection-action]')?.dataset.selectionAction;
    if (action === 'cancel') clearSelection();
    if (action === 'forward') forwardMessage([...selection]);
    if (action === 'delete') deleteMessages([...selection], room);
  };
  el('msgPinned').onclick = () => {
    const roomRow = data.rooms.find((r) => r.id === room);
    const pins = roomRow?.pins?.length
      ? roomRow.pins
      : roomRow?.pinned
        ? [roomRow.pinned]
        : [];
    if (!pins.length) return;
    if (pinCycleRoom !== room) {
      pinCycleRoom = room;
      pinCycleIndex = pins.length;
    }
    pinCycleIndex = (pinCycleIndex - 1 + pins.length) % pins.length;
    const pinned = pins[pinCycleIndex];
    el('msgPinned').innerHTML = icon('pin') + ' ' + escape(pinned.text || 'Attachment');
    icons();
    focusMessage(pinned.id, pinned.category).catch((error) => status(error.message));
  };
  function closePhotoPreview() {
    document.getElementById('chatPhotoPreview')?.remove();
    section.classList.remove('chat-photo-blur');
  }
  function openPhotoPreview(src, alt) {
    closePhotoPreview();
    section.classList.add('chat-photo-blur');
    const overlay = document.createElement('div');
    overlay.id = 'chatPhotoPreview';
    overlay.className = 'chat-photo-preview';
    overlay.innerHTML =
      '<button type="button" class="chat-photo-preview-close" aria-label="Close">' +
      icon('x') +
      '</button><img src="' +
      escape(src) +
      '" alt="' +
      escape(alt || '') +
      '">';
    section.append(overlay);
    icons();
    overlay.querySelector('.chat-photo-preview-close').onclick = closePhotoPreview;
    overlay.onclick = (event) => {
      if (event.target === overlay) closePhotoPreview();
    };
  }
  timeline.addEventListener('click', (event) => {
    const button = event.target.closest('[data-photo-preview]');
    if (!button || !timeline.contains(button)) return;
    event.preventDefault();
    openPhotoPreview(button.dataset.photoPreview, button.querySelector('img')?.alt || '');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('chatPhotoPreview')) closePhotoPreview();
  });
