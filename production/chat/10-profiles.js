  function scheduleProfiles() {
    if (profileFrame) return;
    profileFrame = requestAnimationFrame(async () => {
      profileFrame = 0;
      markAccountProfiles();
      paintProfiles();
      if (!ready) return;
      const ids = [
          ...new Set([
            ...data.contacts.map((p) => p.id),
            ...data.rooms.map((r) => (r.kind === 'group' ? r.id : r.peerId)),
            ...[...document.querySelectorAll('[data-avatar-subject]')].map((n) => n.dataset.avatarSubject),
          ]),
        ].filter((id) => id && !profileRequested.has(id)),
        gen = generation;
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        batch.forEach((id) => profileRequested.add(id));
        try {
          const result = await request('profiles', { ids: batch });
          if (gen !== generation) return;
          let changed = false;
          for (const profile of result.profiles || []) {
            changed ||= (profileViews[profile.id]?.username || '') !== (profile.username || '');
            profileViews[profile.id] = profile;
          }
          paintProfiles();
          if (changed) paintRooms();
        } catch {
          batch.forEach((id) => profileRequested.delete(id));
        }
      }
    });
  }
  function markAccountProfiles() {
    const brand = document.querySelector('.brand-account'),
      owner = signedIn();
    if (brand && brand.dataset.owner !== (owner?.id || 'guest')) {
      brand.dataset.owner = owner?.id || 'guest';
      brand.innerHTML = avatar(owner?.name || owner?.login || '?', false, owner?.id || '');
    }
    const person = typeof viewAccount !== 'undefined' && viewAccount ? viewAccount : signedIn();
    if (person)
      for (const id of ['accountBody', 'profileBody']) {
        const root = el(id),
          entry = root?.querySelector('.entry');
        if (!entry) continue;
        if (!root.querySelector('.account-avatar-row')) {
          const row = document.createElement('div');
          row.className = 'account-avatar-row';
          row.innerHTML =
            avatar(person.name || person.login, false, person.id) +
            '<span data-presence-subject="' +
            escape(person.id) +
            '"></span>' +
            (person.id === signedIn()?.id
              ? '<button type="button" class="btn" data-avatar-upload="' + escape(person.id) + '">Upload photo</button>'
              : '');
          entry.before(row);
        }
      }
    document.querySelectorAll('#admin [data-account="user"][data-id]').forEach((node) => {
      if (node.querySelector('[data-avatar-subject]')) return;
      node.insertAdjacentHTML(
        'afterbegin',
        avatar(node.querySelector('b')?.textContent || '?', false, node.dataset.id),
      );
    });
    const detail = el('adminUser'),
      button = detail?.querySelector('[data-account][data-id]'),
      heading = detail?.querySelector('.stat-kicker');
    if (button && heading && !detail.querySelector('.account-avatar-row'))
      heading.insertAdjacentHTML(
        'afterend',
        '<div class="account-avatar-row">' +
          avatar(heading.textContent, false, button.dataset.id) +
          '<span data-presence-subject="' +
          escape(button.dataset.id) +
          '"></span></div>',
      );
  }
  function paintProfiles() {
    document.querySelectorAll('[data-avatar-subject]').forEach((node) => {
      const id = node.dataset.avatarSubject,
        p = profileViews[id],
        group = id.startsWith('group:'),
        url = p?.avatarUrl?.startsWith('/api/messages/avatar?') ? p.avatarUrl : '',
        state = url + '|' + (p ? (p.online ? 'online' : 'offline') : 'unknown') + '|' + node.dataset.avatarName;
      if (
        node.dataset.avatarState === state &&
        (!p || group || node.querySelector('.chat-presence')) &&
        (!url || node.querySelector('img'))
      )
        return;
      node.dataset.avatarState = state;
      node.innerHTML =
        (url
          ? '<img src="' + escape(url) + '" alt="' + escape(node.dataset.avatarName || 'Avatar') + '">'
          : group
            ? icon('users-round')
            : escape(initials(node.dataset.avatarName))) +
        (!group && p
          ? '<span class="chat-presence' +
            (p.online ? ' is-online' : '') +
            '" aria-label="' +
            (p.online ? 'Online' : 'Offline') +
            '"></span>'
          : '');
      node.title = group ? 'Group photo' : p ? (p.online ? 'Online' : 'Offline') : 'Status unavailable';
      node.classList.toggle('has-avatar-photo', !!url);
      if (url && !node.closest('.brand-account')) {
        node.setAttribute('role', 'button');
        node.tabIndex = 0;
      } else {
        node.removeAttribute('role');
        node.removeAttribute('tabindex');
      }
      if (group && !url) window.lucide?.createIcons({ root: node });
    });
    document.querySelectorAll('[data-presence-subject]').forEach((node) => {
      const p = profileViews[node.dataset.presenceSubject],
        label = p ? (p.online ? 'Online' : 'Offline') : 'Status unavailable';
      if (node.textContent !== label) node.textContent = label;
    });
    document.querySelectorAll('[data-profile-details-subject]').forEach((node) => {
      const p = profileViews[node.dataset.profileDetailsSubject],
        html =
          (p?.username ? '<span>' + escape(p.username) + '</span>' : '') +
          (p?.phone ? '<span>Phone: ' + escape(p.phone) + '</span>' : '') +
          (p?.birthday ? '<span>Birthday: ' + escape(dateLabel(p.birthday)) + '</span>' : '');
      if (node.innerHTML !== html) node.innerHTML = html;
    });
  }
  function openAvatar(subject) {
    const url = profileViews[subject]?.avatarUrl;
    if (!url?.startsWith('/api/messages/avatar?')) return;
    const node = dialog('Photo', '<img class="chat-avatar-full" src="' + escape(url) + '" alt="Profile photo">');
    node.classList.add('chat-avatar-dialog');
    node.style.maxWidth = 'min(92vw,1000px)';
    node.addEventListener('click', (event) => {
      const r = node.getBoundingClientRect();
      if (
        event.target === node &&
        (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
      )
        node.close();
    });
  }
  function editAvatar(bitmap) {
    return new Promise((resolve) => {
      const node = dialog(
        'Edit photo',
        '<canvas class="chat-photo-crop" width="360" height="360" aria-label="Move photo inside the avatar circle"></canvas><div class="chat-photo-tools"><button type="button" class="chat-icon" data-crop-rotate title="Rotate" aria-label="Rotate">' +
          icon('rotate-cw') +
          '</button><button type="button" class="chat-icon" data-crop-flip title="Mirror" aria-label="Mirror">' +
          icon('flip-horizontal') +
          '</button><button type="button" class="chat-icon" data-crop-reset title="Reset" aria-label="Reset">' +
          icon('rotate-ccw') +
          '</button><label>Zoom<input type="range" min="1" max="4" step="0.01" value="1" data-crop-zoom></label></div><div class="chat-photo-actions"><button type="button" class="chat-link" data-crop-cancel>Cancel</button><button type="button" class="primary" data-crop-done>Done</button></div>',
      );
      node.classList.add('chat-photo-editor');
      let rotation = 0,
        mirror = 1,
        zoom = 1,
        x = 0,
        y = 0,
        drag = null,
        result = null;
      const canvas = node.querySelector('canvas'),
        context = canvas.getContext('2d'),
        slider = node.querySelector('[data-crop-zoom]'),
        size = 360,
        diameter = 320;
      const scale = () =>
        zoom *
        Math.max(
          diameter / (rotation % 180 ? bitmap.height : bitmap.width),
          diameter / (rotation % 180 ? bitmap.width : bitmap.height),
        );
      function draw(target = context, output = 360, mask = true) {
        const s = scale(),
          w = (rotation % 180 ? bitmap.height : bitmap.width) * s,
          h = (rotation % 180 ? bitmap.width : bitmap.height) * s;
        x = Math.max(-(w - diameter) / 2, Math.min((w - diameter) / 2, x));
        y = Math.max(-(h - diameter) / 2, Math.min((h - diameter) / 2, y));
        target.clearRect(0, 0, output, output);
        target.save();
        target.scale(output / (mask ? size : diameter), output / (mask ? size : diameter));
        target.fillStyle = '#fff';
        target.fillRect(0, 0, mask ? size : diameter, mask ? size : diameter);
        target.translate((mask ? size : diameter) / 2 + x, (mask ? size : diameter) / 2 + y);
        target.rotate((rotation * Math.PI) / 180);
        target.scale(mirror * s, s);
        target.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
        target.restore();
        if (mask) {
          target.fillStyle = 'rgba(0,0,0,.65)';
          target.beginPath();
          target.rect(0, 0, size, size);
          target.arc(size / 2, size / 2, diameter / 2, 0, Math.PI * 2, true);
          target.fill('evenodd');
          target.strokeStyle = 'rgba(255,255,255,.65)';
          target.lineWidth = 1;
          target.beginPath();
          target.arc(size / 2, size / 2, diameter / 2, 0, Math.PI * 2);
          target.stroke();
        }
      }
      slider.oninput = () => {
        zoom = Number(slider.value);
        draw();
      };
      node.querySelector('[data-crop-rotate]').onclick = () => {
        rotation = (rotation + 90) % 360;
        x = y = 0;
        draw();
      };
      node.querySelector('[data-crop-flip]').onclick = () => {
        mirror *= -1;
        draw();
      };
      node.querySelector('[data-crop-reset]').onclick = () => {
        rotation = 0;
        mirror = zoom = 1;
        x = y = 0;
        slider.value = '1';
        draw();
      };
      canvas.onpointerdown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag = { x: event.clientX, y: event.clientY, offsetX: x, offsetY: y };
        canvas.setPointerCapture(event.pointerId);
      };
      canvas.onpointermove = (event) => {
        if (!drag) return;
        const ratio = size / canvas.getBoundingClientRect().width;
        x = drag.offsetX + (event.clientX - drag.x) * ratio;
        y = drag.offsetY + (event.clientY - drag.y) * ratio;
        draw();
      };
      canvas.onpointerup =
        canvas.onpointercancel =
        canvas.onlostpointercapture =
          () => {
            drag = null;
          };
      canvas.addEventListener(
        'wheel',
        (event) => {
          event.preventDefault();
          zoom = Math.max(1, Math.min(4, zoom - event.deltaY * 0.002));
          slider.value = String(zoom);
          draw();
        },
        { passive: false },
      );
      node.querySelector('[data-crop-cancel]').onclick = () => node.close();
      node.querySelector('[data-crop-done]').onclick = () => {
        const output = document.createElement('canvas');
        output.width = output.height = 1024;
        draw(output.getContext('2d'), 1024, false);
        result = output;
        node.close();
      };
      node.addEventListener('close', () => resolve(result), { once: true });
      draw();
      icons();
    });
  }
  async function uploadAvatar(subject, file) {
    if (!file) return;
    const gen = generation;
    if (file.size > 25 * 1024 * 1024) throw new Error('Maximum file size is 25 MB.');
    let source = file;
    if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
      const module = await import('/heic-to-1.6.6.js');
      source = await module.heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
    }
    const bitmap = await createImageBitmap(source);
    let canvas;
    try {
      canvas = await editAvatar(bitmap);
    } finally {
      bitmap.close();
    }
    if (!canvas || gen !== generation) return;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Photo is too large. Choose a smaller image.');
    if (gen !== generation) return;
    const response = await fetch('/api/messages/avatar?subject=' + encodeURIComponent(subject), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': blob.type },
        body: blob,
      }),
      result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Photo upload failed.');
    if (gen !== generation) return;
    profileViews[result.profile.id] = result.profile;
    settingsProfileCache = null;
    scheduleProfiles();
  }
  document.addEventListener(
    'click',
    (event) => {
      if (event.target.closest('[data-profile-edit]')) {
        settings();
        return;
      }
      const upload = event.target.closest('[data-avatar-upload]');
      if (upload) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.heic,.heif';
        input.onchange = async () => {
          upload.disabled = true;
          try {
            await uploadAvatar(upload.dataset.avatarUpload, input.files[0]);
          } catch (error) {
            dialog('Photo upload', '<p>' + escape(error.message || 'Unsupported image format.') + '</p>');
          } finally {
            upload.disabled = false;
          }
        };
        input.click();
        return;
      }
      const node = event.target.closest('[data-avatar-subject].has-avatar-photo');
      if (!node || node.closest('.brand-account')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAvatar(node.dataset.avatarSubject);
    },
    true,
  );
  document.addEventListener(
    'keydown',
    (event) => {
      const node = event.target.closest('[data-avatar-subject].has-avatar-photo');
      if (node && !node.closest('.brand-account') && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openAvatar(node.dataset.avatarSubject);
      }
    },
    true,
  );
  const key = () => room + ':' + kind;
  const draftKey = () => 'english-chat-draft-v1:' + account + ':' + room;
  const state = () => historyCache.get(key());
  const findMessage = (id) =>
    (state()?.rows || []).find((m) => m.id === id) ||
    (historyCache.get(room + ':personal')?.rows || []).find((m) => m.id === id) ||
    (historyCache.get(room + ':learning')?.rows || []).find((m) => m.id === id);
  const bottom = () => timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 60;
  timeline.addEventListener(
    'scroll',
    () => {
      if (bottom()) stickBottom = true;
    },
    { passive: true },
  );
  timeline.addEventListener(
    'wheel',
    (event) => {
      if (event.deltaY < 0) stickBottom = false;
    },
    { passive: true },
  );
  let touchY;
  timeline.addEventListener(
    'touchstart',
    (event) => {
      touchY = event.touches[0]?.clientY;
    },
    { passive: true },
  );
  timeline.addEventListener(
    'touchmove',
    (event) => {
      const y = event.touches[0]?.clientY;
      if (y > touchY) stickBottom = false;
      touchY = y;
    },
    { passive: true },
  );
  timeline.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stickBottom = false;
  });
  const timelineResize = new ResizeObserver(() => {
    if (stickBottom) timeline.scrollTop = timeline.scrollHeight;
  });
  timelineResize.observe(timeline);
