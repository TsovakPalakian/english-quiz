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
    items.push(['pin', 'pin', data.rooms.find((r) => r.id === room)?.pinned?.id === message.id ? 'Unpin' : 'Pin']);
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
    const node = dialog(
      'Edit message',
      '<label>Message<textarea name="text" required maxlength="4000" rows="4"></textarea></label>',
      async () => {
        await request('edit', {
          roomId: id,
          id: message.id,
          text: area.value.trim(),
          format: window.TextColors?.trim(format, area.value) || null,
          expectedEditedMs: message.editedMs || 0,
        });
      },
    );
    const area = node.querySelector('textarea');
    let format = message.format || null;
    area.value = message.text;
    window.TextColors?.mount(area, {
      onChange: (value) => {
        format = value;
      },
    });
    window.TextColors?.sync(area, format);
    area.focus();
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
      if (action === 'delete') deleteMessages([message.id], id);
      if (action === 'pin')
        await request('pin', {
          roomId: id,
          id: message.id,
          pinned: data.rooms.find((r) => r.id === id)?.pinned?.id !== message.id,
        });
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
    const pinned = data.rooms.find((r) => r.id === room)?.pinned;
    if (pinned) focusMessage(pinned.id, pinned.category).catch((error) => status(error.message));
  };
