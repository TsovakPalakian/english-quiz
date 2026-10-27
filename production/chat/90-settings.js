  async function blockedUsers() {
    const result = await request('blocked'),
      node = dialog('Blocked users', '<div class="chat-blocked-list"></div>');
    const paint = (users) => {
      node.querySelector('.chat-blocked-list').innerHTML = users.length
        ? users
            .map(
              (u) =>
                '<div class="chat-blocked-user"><span>' +
                escape(u.name) +
                '</span><button type="button" class="chat-link" data-unblock-room="' +
                escape(u.roomId) +
                '">Unblock</button></div>',
            )
            .join('')
        : '<p>No blocked users.</p>';
    };
    paint(result.users);
    node.onclick = async (event) => {
      const button = event.target.closest('[data-unblock-room]');
      if (!button) return;
      button.disabled = true;
      try {
        const result = await request('relation', { roomId: button.dataset.unblockRoom, action: 'unblock' });
        upsertRoom(result.room);
        paint((await request('blocked')).users);
        paintRooms();
      } catch (error) {
        node.querySelector('[role=status]').textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  function showContacts() {
    chatListView = '';
    contactGroupView = null;
    listMode = 'contacts';
    el('msgRoomSearch').value = '';
    badge();
    paintRooms();
    panel('left', true);
  }
  el('msgLookup').onclick = async () => {
    el('msgLookup').disabled = true;
    try {
      const result = await request('lookup', { query: el('msgRoomSearch').value });
      if (!result.person) {
        status('No account found.');
        return;
      }
      if (!data.contacts.some((p) => p.id === result.person.id)) data.contacts.push(result.person);
      el('msgRoomSearch').value = result.person.name;
      paintRooms();
      status('');
    } catch (error) {
      status(error.message);
    } finally {
      el('msgLookup').disabled = false;
    }
  };
  el('msgRoomSearch').onkeydown = (event) => {
    if (event.key === 'Enter' && listMode === 'contacts') {
      event.preventDefault();
      el('msgLookup').click();
    }
  };
  async function domain(path, body) {
    const gen = generation,
      response = await fetch('/api/messages' + path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      }),
      value = await response.json();
    if (gen !== generation) throw new Error('Account changed.');
    if (!response.ok) throw new Error(value.error || 'Request failed.');
    return value;
  }
  function settingsSoundEditor(root) {
    const form = root.querySelector('form');
    if (!form || form.dataset.settingsWired) return;
    form.dataset.settingsWired = 'true';
    root._settingsSoundCleanup?.();
    const file = form.elements.upload,
      trim = root.querySelector('[data-trim]');
    const original = file.onchange;
    let audio,
      url = '';
    root._settingsSoundCleanup = () => {
      audio?.pause();
      if (url) URL.revokeObjectURL(url);
      url = '';
    };
    file.onchange = async (event) => {
      root._settingsSoundCleanup();
      const save = form.querySelector('[type=submit]');
      save.disabled = true;
      try {
        await original.call(file, event);
      } finally {
        save.disabled = false;
      }
      if (!form.isConnected || trim.hidden) return;
      trim.querySelector('.settings-trim-preview')?.remove();
      const editor = document.createElement('div');
      editor.className = 'settings-trim-preview';
      editor.innerHTML =
        '<audio controls preload="metadata"></audio><label>Start<input type="range" min="0" step="0.01" data-trim-start></label><label>Length<input type="range" min="0.1" max="3" step="0.01" data-trim-length></label><button class="settings-action" type="button">' +
        icon('play') +
        'Preview fragment</button>';
      trim.prepend(editor);
      audio = editor.querySelector('audio');
      url = URL.createObjectURL(file.files[0]);
      audio.src = url;
      const start = form.elements.start,
        duration = form.elements.duration,
        startRange = editor.querySelector('[data-trim-start]'),
        lengthRange = editor.querySelector('[data-trim-length]');
      start.step = duration.step = '0.01';
      const total = Number(start.max) + 0.1,
        maxLength = Math.floor(Math.min(10, total) * 100) / 100;
      lengthRange.max = String(maxLength);
      duration.max = String(maxLength);
      const clamp = () => {
        duration.value = Math.max(0.1, Math.min(maxLength, Number(duration.value) || 0.1)).toFixed(2);
        const maximum = Math.max(0, Math.floor((total - Number(duration.value)) * 100) / 100);
        start.max = startRange.max = String(maximum);
        start.value = Math.max(0, Math.min(maximum, Number(start.value) || 0)).toFixed(2);
        startRange.value = start.value;
        lengthRange.value = duration.value;
      };
      clamp();
      startRange.oninput = () => {
        start.value = startRange.value;
        clamp();
      };
      lengthRange.oninput = () => {
        duration.value = lengthRange.value;
        clamp();
      };
      start.onchange = duration.onchange = clamp;
      let playingFragment = false;
      audio.ontimeupdate = () => {
        if (playingFragment && audio.currentTime >= Number(start.value) + Number(duration.value)) {
          audio.pause();
          playingFragment = false;
        }
      };
      editor.querySelector('button').onclick = async () => {
        try {
          audio.currentTime = Number(start.value);
          playingFragment = true;
          await audio.play();
        } catch (error) {
          root.querySelector('[role=status]').textContent = error.message;
        }
      };
      icons();
    };
  }
  function dressUserSettings(pane) {
    pane.querySelectorAll('input[type=checkbox]').forEach((input) => {
      if (input.closest('.settings-switch,section,.display-visibility')) return;
      const wrap = document.createElement('span');
      wrap.className = 'settings-switch';
      input.before(wrap);
      wrap.append(input);
      const track = document.createElement('span');
      track.setAttribute('aria-hidden', 'true');
      wrap.append(track);
    });
    const root = pane.querySelector('[data-settings-sounds]');
    if (root) {
      const label = root.querySelector('select')?.closest('label'),
        actions = root.querySelector('.sound-actions');
      if (label && actions && !label.closest('.settings-sound-choice')) {
        const row = document.createElement('div');
        row.className = 'settings-sound-choice';
        label.before(row);
        row.append(label, actions);
      }
      const file = root.querySelector('[type=file]');
      if (file && !file.nextElementSibling?.classList.contains('settings-action')) {
        file.hidden = true;
        const upload = document.createElement('button');
        upload.type = 'button';
        upload.className = 'settings-action';
        upload.innerHTML = icon('upload') + 'Upload audio';
        file.after(upload);
        upload.onclick = () => file.click();
        const name = document.createElement('span');
        name.className = 'settings-file-name';
        upload.after(name);
        file.addEventListener('change', () => {
          name.textContent = file.files[0]?.name || '';
        });
      }
    }
    if (root) settingsSoundEditor(root);
    icons();
  }
  document.addEventListener('notification-sounds-rendered', (event) => {
    const pane = event.target.closest('.user-settings .chat-settings-content');
    if (pane) dressUserSettings(pane);
  });
  async function settingsSessions(host, parent) {
    const gen = generation,
      owner = account;
    let view = 'active',
      rows = [],
      cursor = null,
      version = 0,
      busy = false,
      error = '';
    const alive = () => host.isConnected && parent.open && gen === generation && owner === account && !!current();
    const when = (value) => (value ? new Date(value).toLocaleString() : 'Not recorded');
    const reasons = {
      logout: 'Signed out',
      terminated: 'Ended remotely',
      expired: 'Expired',
      password_changed: 'Credentials changed',
      database_changed: 'Database changed',
    };
    const field = (name, value) => '<div><dt>' + name + '</dt><dd>' + escape(value || 'Not available') + '</dd></div>';
    function paint() {
      if (!alive()) return;
      host.innerHTML =
        '<div class="security-session-tabs" role="tablist" aria-label="Session views">' +
        [
          ['active', 'Active sessions'],
          ['history', 'Sign-in history'],
        ]
          .map(
            ([id, title]) =>
              '<button class="btn' +
              (view === id ? ' primary' : '') +
              '" type="button" role="tab" aria-selected="' +
              (view === id) +
              '" data-session-view="' +
              id +
              '">' +
              title +
              '</button>',
          )
          .join('') +
        '</div><div class="security-session-list" role="tabpanel">' +
        rows
          .map(
            (row) =>
              '<article class="security-session"><header><strong>' +
              escape(row.browser + ' · ' + row.os) +
              '</strong>' +
              (row.current ? '<span class="security-session-current">This session</span>' : '') +
              '</header><dl>' +
              field('Device', row.device) +
              field(row.startedAt ? 'Signed in' : 'First observed', when(row.startedAt || row.firstObservedAt)) +
              field('Last activity', when(row.lastActivityAt)) +
              field('IP address', row.ip) +
              field('Approximate location', [row.city, row.region, row.country].filter(Boolean).join(', ')) +
              field('Time zone', row.timezone) +
              (row.active
                ? field('Expires', when(row.expiresAt))
                : field('Ended', row.endedAt ? when(row.endedAt) : 'Time not recorded') +
                  field('Reason', reasons[row.endReason] || row.endReason)) +
              '</dl><div class="security-session-actions">' +
              (row.mapsUrl
                ? '<a class="settings-action" target="_blank" rel="noopener noreferrer" href="' +
                  escape(row.mapsUrl) +
                  '">' +
                  icon('map-pin') +
                  'Google Maps</a>'
                : '') +
              (row.active
                ? '<button class="settings-action danger" type="button" data-end-session="' +
                  escape(row.id) +
                  '">' +
                  icon('log-out') +
                  'End session</button>'
                : '') +
              '</div><details><summary>Connection details</summary><dl>' +
              field('Network', row.network) +
              field('ASN', row.asn ? String(row.asn) : '') +
              field('TLS', row.tls) +
              field('Latest IP address', row.lastIp) +
              field('Latest location', [row.lastCity, row.lastCountry].filter(Boolean).join(', ')) +
              field('User agent', row.userAgent) +
              '</dl></details></article>',
          )
          .join('') +
        (!rows.length && !busy
          ? '<p>' + (view === 'active' ? 'No active sessions.' : 'No previous sign-ins recorded.') + '</p>'
          : '') +
        '</div><p role="status">' +
        escape(error || (busy ? 'Loading sessions…' : '')) +
        '</p>' +
        (cursor
          ? '<button class="settings-action" type="button" data-more-sessions' +
            (busy ? ' disabled' : '') +
            '>Load more</button>'
          : '');
      host.querySelectorAll('[data-session-view]').forEach(
        (button) =>
          (button.onclick = () => {
            view = button.dataset.sessionView;
            rows = [];
            cursor = null;
            void load();
          }),
      );
      host.querySelector('[data-more-sessions]')?.addEventListener('click', () => load(true));
      host.querySelectorAll('[data-end-session]').forEach(
        (button) =>
          (button.onclick = () => {
            const row = rows.find((item) => item.id === button.dataset.endSession);
            if (!row) return;
            const confirmation = dialog(
              'End session',
              '<p>' +
                escape(row.browser) +
                (row.current ? ' · This device will be signed out.' : '') +
                '</p><button class="settings-action" type="button" data-session-cancel>Cancel</button>',
              async () => {
                const response = await fetch('/api/me/sessions', {
                    method: 'POST',
                    credentials: 'same-origin',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: row.id }),
                  }),
                  result = await response.json();
                if (!response.ok) throw Error(result.error || 'Session could not be ended.');
                if (result.current) {
                  parent.close();
                  if (current()) await leaveAccount({ signedOut: true });
                } else if (alive()) await load();
              },
            );
            confirmation.querySelector('[data-session-cancel]').onclick = () => confirmation.close();
          }),
      );
      icons();
    }
    async function load(more = false) {
      const token = ++version;
      busy = true;
      error = '';
      paint();
      try {
        const response = await fetch(
            '/api/me/sessions?' + new URLSearchParams({ view, ...(more && cursor ? { cursor } : {}) }),
            { credentials: 'same-origin', cache: 'no-store' },
          ),
          value = await response.json();
        if (!alive() || token !== version) return;
        if (!response.ok) throw Error(value.error || 'Sessions unavailable.');
        if (!Array.isArray(value.sessions)) throw Error('Sessions unavailable.');
        rows = more ? [...new Map([...rows, ...value.sessions].map((row) => [row.id, row])).values()] : value.sessions;
        cursor = value.nextCursor;
      } catch (e) {
        if (alive() && token === version) error = e.message;
      } finally {
        if (alive() && token === version) {
          busy = false;
          paint();
        }
      }
    }
    await load();
  }
  let settingsProfileCache = null, settingsOpening = false;
  function settings(initial = 'profile', targetPage = null) {
    if (typeof initial !== 'string') initial = 'profile';
    if (!current() || settingsOpening) return;
    settingsOpening = true;
    try {
      document.querySelector('dialog.user-settings')?.close();
      let tabVersion = 0,
        releasePortal = () => {},
        blockedCache = null;
    const profile = data.profile || current(),
      node = document.createElement('dialog');
    const host = document.getElementById('settingsHost');
    const activeSection = document.querySelector('section.on')?.id;
    const isMessages = activeSection === 'messages' || !!document.querySelector('#messages.on') || document.body.classList.contains('chat-active');
    const inPage = !isMessages && !!host && (activeSection === 'settings' || targetPage === 'settings');
    node.className = 'chat-dialog user-settings' + (inPage ? ' in-page' : '');
    node.innerHTML =
      '<div class="chat-dialog-body"><aside class="chat-settings-menu"><h2>Settings</h2><div class="chat-settings-profile">' +
      avatar(profile.name, false, profile.id) +
      '<span><strong>' +
      escape(profile.name || profile.login) +
      '</strong><br><small>' +
      escape(profile.role) +
      '</small></span></div><h3>Common</h3>' +
      [
        ['profile', icon('user-round'), 'Profile'],
        ['notifications', icon('bell'), 'Notifications'],
        ['theme', icon('palette'), 'Theme'],
        ['statistics', icon('chart-no-axes-combined'), 'Statistics'],
        ['messages', icon('messages-square'), 'Messages'],
        ['blocked', icon('user-round-x'), 'Blocked users'],
        ['security', icon('shield'), 'Security'],
        ['display', '', 'Display'],
        ['help', icon('circle-help'), 'Help'],
      ]
        .map(
          ([id, image, title]) =>
            '<button type="button" data-settings-tab="' +
            id +
            '">' +
            (id === 'display' ? '<span class="settings-display-symbol" aria-hidden="true">Aa</span>' : image) +
            escape(title) +
            '</button>',
        )
        .join('') +
      '</aside><div class="chat-settings-content"></div></div>';
    let previousScreen = document.querySelector('section.on')?.id || 'home';
    let cleanupKeydown = () => {};
    if (inPage) {
      if (document.querySelector('section.on')?.id !== 'settings' && typeof window.enquizVisit === 'function') {
        window.enquizVisit('settings');
      }
      host.replaceChildren(node);
      node.setAttribute('open', '');
      node.open = true;
      const onEsc = (event) => {
        if (event.key === 'Escape') {
          node.close();
        }
      };
      window.addEventListener('keydown', onEsc);
      cleanupKeydown = () => window.removeEventListener('keydown', onEsc);
    } else {
      document.body.append(node);
      node.showModal();
    }
    node.onclose = () => {
      cleanupKeydown();
      releasePortal();
      window.NotificationSounds?.stop();
      node.remove();
      if (inPage && document.querySelector('section.on')?.id === 'settings' && previousScreen && previousScreen !== 'settings') {
        window.enquizVisit?.(previousScreen);
      }
    };
    icons();
    node.addEventListener('close', () => {
      node.querySelector('[data-settings-sounds]')?._settingsSoundCleanup?.();
      window.NotificationSounds?.load(current()?.id || '');
    });
    const outside = (event) => {
      const box = node.getBoundingClientRect();
      return (
        event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
      );
    };
    let outsideDown = false;
    node.addEventListener('pointerdown', (event) => {
      outsideDown = (event.target === node || inPage) && outside(event);
    });
    node.addEventListener('click', (event) => {
      if (outsideDown && outside(event)) node.close();
      outsideDown = false;
    });
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.dataset.settingsLogout = '';
    logout.innerHTML = icon('log-out') + 'Log out';
    node.querySelector('.chat-settings-menu').append(logout);
    logout.onclick = () => {
      node.close();
      performLogout();
    };
    function mountSection(id, pane) {
      const section = document.getElementById(id);
      if (!section) return;
      const marker = document.createComment('settings-section'),
        style = section.getAttribute('style');
      section.before(marker);
      pane.append(section);
      section.style.display = 'block';
      releasePortal = () => {
        marker.replaceWith(section);
        if (style === null) section.removeAttribute('style');
        else section.setAttribute('style', style);
        releasePortal = () => {};
      };
    }
    const toggle = (key, label, description, checked) =>
      '<label class="settings-row"><span class="settings-text"><strong>' +
      label +
      '</strong><small>' +
      description +
      '</small></span><span class="settings-switch"><input type="checkbox" data-pref="' +
      key +
      '" aria-label="' +
      label +
      '"' +
      (checked ? ' checked' : '') +
      '><span aria-hidden="true"></span></span></label>';
    async function tab(id, refreshed = false) {
      if (id === 'interface') id = 'messages';
      node
        .querySelectorAll('[data-settings-tab]')
        .forEach((b) => b.classList.toggle('on', b.dataset.settingsTab === id));
      const pane = node.querySelector('.chat-settings-content');
      node._selectTab = tab;
      let html = '';
      const version = ++tabVersion,
        gen = generation;
      pane.querySelector('[data-settings-sounds]')?._settingsSoundCleanup?.();
      releasePortal();
      window.NotificationSounds?.stop();
      let details,
        initialUsername = '',
        privateDetails;
      if (id === 'profile') {
        const key = profile.id + ':' + gen,
          cached = settingsProfileCache?.key === key ? settingsProfileCache.value : null;
        const load = () =>
          Promise.all([
            fetch('/api/me/account', { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
              const value = await response.json();
              if (!response.ok) throw new Error(value.error || 'Profile unavailable.');
              return value;
            }),
            request('profiles', { ids: [profile.id] }),
            domain('/profile'),
          ]).then(([account, fresh, own]) => {
            if (gen !== generation) throw new Error('Account changed.');
            for (const p of fresh.profiles) profileViews[p.id] = p;
            const value = {
              details: account,
              privateDetails: own.details,
              username: profileViews[profile.id]?.username || '',
            };
            settingsProfileCache = { key, value };
            return value;
          });
        const shown = cached || (await load());
        if (!node.open || version !== tabVersion || gen !== generation) return;
        if (cached && !refreshed)
          load()
            .then((value) => {
              if (
                node.open &&
                version === tabVersion &&
                gen === generation &&
                JSON.stringify(value) !== JSON.stringify(cached) &&
                !pane.querySelector('.chat-edit-profile:focus-within')
              )
                tab('profile', true);
            })
            .catch(() => {});
        details = shown.details;
        privateDetails = shown.privateDetails;
        const saved = details.change || details.user,
          name = String(saved.name ?? profile.name ?? ''),
          names = name.split(/\s+/),
          username = profileViews[profile.id]?.username || '';
        initialUsername = username;
        html =
          '<form class="chat-edit-profile"><div class="chat-edit-identity"><button type="button" class="chat-photo-select" data-avatar-upload="' +
          escape(profile.id) +
          '" title="Change photo" aria-label="Change photo">' +
          avatar(profile.name, false, profile.id) +
          '<span class="chat-photo-camera">' +
          icon('camera') +
          '</span></button><div><label>First name<input name="firstName" maxlength="80" value="' +
          escape(names[0] || '') +
          '"' +
          (details.locked ? ' readonly' : '') +
          '></label><label>Last name<input name="lastName" maxlength="80" value="' +
          escape(names.slice(1).join(' ')) +
          '"' +
          (details.locked ? ' readonly' : '') +
          '></label></div></div><label>Email<input name="email" type="email" required maxlength="120" autocomplete="email" value="' +
          escape(saved.email || profile.email || '') +
          '"' +
          (details.locked ? ' readonly' : '') +
          '></label><label>Username<input name="username" maxlength="33" autocomplete="off" placeholder="@username" pattern="@[A-Za-z0-9_]{3,32}" value="' +
          escape(username) +
          '"></label><p role="status">' +
          (details.change
            ? 'Changes awaiting approval.'
            : details.locked
              ? 'Name and email changes are currently locked.'
              : '') +
          '</p><button type="submit" class="primary" data-profile-save>Done</button></form><button class="chat-link" type="button" data-profile-open>My account</button><button class="chat-link" type="button" data-chat-blocked>Blocked users</button>';
      }
      if (id === 'notifications')
        html =
          toggle(
            'notifications',
            'Desktop notifications',
            'New messages outside the active window',
            prefs.notifications,
          ) + '<div data-settings-sounds></div>';
      if (id === 'messages')
        html =
          [
            ['left', 'Conversation list', 'Show conversations in the sidebar'],
            ['right', 'Info', 'Show details about the selected conversation'],
            ['enter', 'Enter sends messages', 'Shift+Enter starts a new line'],
          ]
            .map(([p, label, description]) => toggle(p, label, description, prefs[p] !== false))
            .join('') +
          '<button class="btn" type="button" data-settings-chat>Open messages</button>';
      if (id === 'security')
        html =
          '<div data-security-passkeys></div><hr><div data-security-sessions></div><hr><button type="button" class="settings-action" data-settings-password>' +
          icon('key-round') +
          'Change password</button><div data-settings-password-slot></div><hr><button type="button" class="settings-action danger" data-account="revoke">' +
          icon('trash-2') +
          'Delete my data</button>';
      if (id === 'blocked') {
        const result = blockedCache || (blockedCache = await request('blocked'));
        if (!node.open || version !== tabVersion || gen !== generation) return;
        html = result.users.length
          ? result.users
              .map(
                (user) =>
                  '<div class="settings-row"><span>' +
                  escape(user.name) +
                  '</span><button type="button" class="btn" data-settings-unblock="' +
                  escape(user.roomId) +
                  '">Unblock</button></div>',
              )
              .join('')
          : '<p>No blocked users.</p>';
      }
      if (id === 'help')
        html =
          '<p>Personal contains conversations. Study alerts contains important teacher announcements and exam notices.</p><p>Shift+Enter adds a new line. Search finds messages in the selected category. Your draft is saved on this device.</p><p>Grey checks show delivery; blue checks mean everyone in the conversation has read the message.</p>';
      if (!node.open || version !== tabVersion || gen !== generation) return;
      pane.innerHTML =
        '<header class="chat-dialog-head"><h2>' +
        id[0].toUpperCase() +
        id.slice(1) +
        '</h2><button type="button" class="chat-icon" data-msg-close title="Close" aria-label="Close">' +
        icon('x') +
        '</button></header>' +
        html;
      pane.querySelector('[data-msg-close]').onclick = () => node.close();
      pane.querySelector('[data-logout]')?.addEventListener('click', () => {
        node.close();
        performLogout();
      });
      pane.querySelector('[data-profile-open]')?.remove();
      pane.querySelector('[data-chat-blocked]')?.remove();
      if (id === 'theme') {
        mountSection('themes', pane);
        paintThemeSegs();
      }
      if (id === 'display') {
        const controls = [
            ...document.querySelectorAll('#displayDialog .display-sizes,#displayDialog .display-visibility'),
          ],
          markers = controls.map((control) => {
            const marker = document.createComment('settings-display');
            control.before(marker);
            pane.append(control);
            return marker;
          });
        releasePortal = () => {
          controls.forEach((control, index) => markers[index].replaceWith(control));
          releasePortal = () => {};
        };
        paintDisplaySettings();
      }
      if (id === 'statistics') {
        mountSection('stats', pane);
        paintStats();
      }
      if (id === 'help') {
        pane.querySelectorAll('p').forEach((p) => p.remove());
        mountSection('guide', pane);
        paintGuide();
      }
      if (id === 'notifications') await window.NotificationSounds?.mount(pane.querySelector('[data-settings-sounds]'));
      if (id === 'security') {
        void settingsSessions(pane.querySelector('[data-security-sessions]'), node);
        void window.LumisciaPasskeys?.mount(pane.querySelector('[data-security-passkeys]'));
      }
      if (!node.open || version !== tabVersion || gen !== generation) return;
      if (id === 'profile') {
        const form = pane.querySelector('.chat-edit-profile'),
          saved = details.change || details.user;
        form
          .querySelector('[name=email]')
          .closest('label')
          .insertAdjacentHTML(
            'beforebegin',
            '<label>Login<input name="login" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" required value="' +
              escape(saved.login || details.user.login) +
              '"' +
              (details.locked ? ' readonly' : '') +
              '></label>',
          );
      }
      pane.querySelector('[data-settings-chat]')?.classList.add('primary');
      pane.querySelector('[data-settings-chat]')?.addEventListener('click', () => {
        node.close();
        window.enquizVisit('messages');
      });
      pane.querySelectorAll('[data-settings-unblock]').forEach(
        (button) =>
          (button.onclick = async () => {
            button.disabled = true;
            try {
              const result = await request('relation', { roomId: button.dataset.settingsUnblock, action: 'unblock' });
              upsertRoom(result.room);
              blockedCache = null;
              await tab('blocked');
              paintRooms();
            } catch (error) {
              button.disabled = false;
              status(error.message);
            }
          }),
      );
      pane.querySelector('[data-settings-password]')?.addEventListener('click', () => {
        const slot = pane.querySelector('[data-settings-password-slot]');
        slot.innerHTML =
          '<form id="ownPasswordForm"><label>Current password<input name="current" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" minlength="8" maxlength="32" autocomplete="new-password" required></label><label>Repeat password<input name="repeat" type="password" minlength="8" maxlength="32" autocomplete="new-password" required></label><p data-form-status role="status"></p><button class="btn primary" type="submit">Save password</button></form>';
      });
      pane.querySelectorAll('[data-pref]').forEach(
        (input) =>
          (input.onchange = async () => {
            const p = input.dataset.pref;
            if (p === 'notifications' && input.checked) {
              if (!window.Notification) {
                input.checked = false;
                return;
              }
              const permission = await Notification.requestPermission();
              input.checked = permission === 'granted';
            }
            prefs[p] = input.checked;
            if (p === 'left') panel('left', input.checked);
            if (p === 'right') {
              if (input.checked) showInfo().catch((error) => status(error.message));
              else panel('right', false);
            }
            savePrefs();
          }),
      );
      icons();
      const form = pane.querySelector('.chat-edit-profile');
      if (form) {
        form
          .querySelector('[role=status]')
          .insertAdjacentHTML(
            'beforebegin',
            '<label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="32" value="' +
              escape(privateDetails.phone) +
              '"></label><label class="chat-profile-visibility"><span>Show phone on profile</span><input type="checkbox" name="phoneVisible" ' +
              (privateDetails.phoneVisible ? 'checked' : '') +
              '></label><label>Birthday<input name="birthday" type="date" max="' +
              new Date().toISOString().slice(0, 10) +
              '" value="' +
              escape(privateDetails.birthday) +
              '"></label><label class="chat-profile-visibility"><span>Show birthday on profile</span><input type="checkbox" name="birthdayVisible" ' +
              (privateDetails.birthdayVisible ? 'checked' : '') +
              '></label>',
          );
        form.querySelectorAll('.chat-profile-visibility>span').forEach((label) => {
          label.textContent = label.textContent.replace(' on profile', '');
        });
        const header = pane.querySelector('.chat-dialog-head'),
          done = form.querySelector('[data-profile-save]');
        header.querySelector('h2').textContent = 'Profile';
        form.id = 'chat-edit-' + crypto.randomUUID();
        done.setAttribute('form', form.id);
        done.textContent = 'Save';
        const birthday = form.elements.birthday,
          wrap = document.createElement('span');
        wrap.className = 'chat-birthday-field';
        birthday.before(wrap);
        wrap.append(birthday);
        birthday.type = 'text';
        birthday.removeAttribute('max');
        birthday.inputMode = 'numeric';
        birthday.placeholder = 'DD.MM.YYYY';
        birthday.pattern = '\\d{2}\\.\\d{2}\\.\\d{4}';
        birthday.maxLength = 10;
        birthday.value = privateDetails.birthday ? dateLabel(privateDetails.birthday) : '';
        wrap.insertAdjacentHTML(
          'beforeend',
          '<button type="button" class="chat-icon" data-birthday-calendar title="Choose date" aria-label="Choose date">' +
            icon('calendar-days') +
            '</button><input type="date" class="chat-birthday-picker" tabindex="-1" aria-hidden="true" max="' +
            new Date().toISOString().slice(0, 10) +
            '">',
        );
        const picker = wrap.querySelector('[type=date]');
        wrap.querySelector('button').onclick = () => {
          picker.value = birthdayIso(birthday.value);
          picker.showPicker?.();
        };
        picker.onchange = () => {
          birthday.value = picker.value ? dateLabel(picker.value) : '';
        };
        icons();
        const input = form.elements.username;
        input.addEventListener('blur', () => {
          if (input.value.trim() && !input.value.trim().startsWith('@')) input.value = '@' + input.value.trim();
        });
        form.onsubmit = async (event) => {
          event.preventDefault();
          settingsProfileCache = null;
          const button = done,
            notice = form.querySelector('[role=status]'),
            saved = details.change || details.user,
            name = [form.elements.firstName.value.trim(), form.elements.lastName.value.trim()]
              .filter(Boolean)
              .join(' '),
            email = form.elements.email.value.trim().toLowerCase(),
            username = input.value.trim().toLowerCase(),
            extras = {
              phone: form.elements.phone.value.trim(),
              phoneVisible: form.elements.phoneVisible.checked,
              birthday: form.elements.birthday.value,
              birthdayVisible: form.elements.birthdayVisible.checked,
            };
          if (name.length > 80) {
            notice.textContent = 'Name must be 80 characters or fewer.';
            return;
          }
          if (!form.reportValidity()) return;
          button.disabled = true;
          let profileSaved = false;
          try {
            extras.birthday = birthdayIso(extras.birthday);
            if (gen !== generation || signedIn()?.id !== profile.id) throw new Error('Account changed.');
            if (username !== initialUsername) {
              const result = await domain('/username', { username, expectedUsername: initialUsername });
              profileViews[result.profile.id] = result.profile;
              initialUsername = result.profile.username;
              profileSaved = true;
              scheduleProfiles();
            }
            if (Object.keys(extras).some((key) => extras[key] !== privateDetails[key])) {
              const result = await domain('/profile', extras);
              privateDetails = result.details;
              profileViews[result.profile.id] = result.profile;
              profileSaved = true;
              scheduleProfiles();
            }
            const login = form.elements.login.value,
              changed =
                name !== (saved.name || '') || email !== saved.email || login !== (saved.login || details.user.login);
            if (changed) {
              if (gen !== generation || signedIn()?.id !== profile.id) throw new Error('Account changed.');
              const response = await fetch('/api/me/account', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ login, email, name }),
                }),
                result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Profile changes could not be submitted.');
              if (typeof ownAccountData !== 'undefined') ownAccountData = null;
            }
            if (gen !== generation) return;
            notice.textContent = changed ? 'Account changes sent for approval.' : 'Saved';
          } catch (error) {
            notice.textContent =
              (profileSaved ? 'Some profile changes were saved; remaining changes were not saved: ' : '') +
              error.message;
          } finally {
            button.disabled = false;
          }
        };
      }
      dressUserSettings(pane);
      scheduleProfiles();
    }
    node.querySelectorAll('[data-settings-tab]').forEach(
      (button) =>
        (button.onclick = () =>
          tab(button.dataset.settingsTab)
            .then(scheduleProfiles)
            .catch((error) => {
              if (node.open)
                node
                  .querySelector('.chat-settings-content')
                  .insertAdjacentHTML('beforeend', '<p role="alert">' + escape(error.message) + '</p>');
            })),
    );
    tab(initial).catch((error) => {
      node.querySelector('.chat-settings-content').innerHTML =
        '<p role="alert">' +
        escape(error.message) +
        '</p><button class="btn" type="button" data-close-settings>Close</button>';
      node.querySelector('[data-close-settings]').onclick = () => node.close();
    });
    scheduleProfiles();
  } finally {
    settingsOpening = false;
  }
}
  document.addEventListener(
    'click',
    (event) => {
      if (!current()) return;
      const target = event.target.closest(
        '.brand-account,[data-user-settings],[data-chat-blocked],[data-notification-sounds],[data-jump="account"],[data-jump="profile"],[data-jump="stats"],[data-jump="guide"],[data-jump="themes"],[data-jump="settings"]',
      );
      if (!target || target.closest('.user-settings')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const page = target.dataset.jump;
      const targetSettings = page === 'settings' || target.matches('.shell-settings-open,[data-shell-settings-open]');
      settings(
        target.hasAttribute('data-chat-blocked')
          ? 'blocked'
          : target.hasAttribute('data-notification-sounds')
            ? 'notifications'
            : target.hasAttribute('data-theme-cycle') || page === 'themes'
              ? 'theme'
              : page === 'stats'
                ? 'statistics'
                : page === 'guide'
                  ? 'help'
                  : 'profile',
        targetSettings ? 'settings' : page,
      );
    },
    true,
  );
  window.openChatSettings = settings;
  el('msgProfile').onclick = settings;
  el('msgSettings').onclick = settings;
  el('msgNew').onclick = newChat;
  el('msgContacts').onclick = showContacts;
  el('msgContactsTab').onclick = showContacts;
  el('msgChats').onclick = () => {
    if (!ready) connect();
    listMode = 'chats';
    el('msgRoomSearch').value = '';
    badge();
    paintRooms();
    panel('left', true);
  };
  el('msgExit').onclick = () => window.enquizVisit('home');
  el('msgHideList').onclick = () => {
    panel('left', false);
    scheduleRead();
  };
  el('msgListBack').onclick = () => panel('left', true);
  el('msgHideInfo').onclick = () => {
    rightMode = '';
    panel('right', false);
    scheduleRead();
  };
  el('msgSearch').onclick = showSearch;
  el('msgInfo').onclick = () => {
    if (prefs.right && rightMode === 'info' && !el('msgRight').hidden) {
      rightMode = '';
      panel('right', false);
      scheduleRead();
      return;
    }
    showInfo(infoTab).catch((error) => status(error.message));
  };
  el('msgRoomInfo').onclick = el('msgInfo').onclick;
  el('msgRoomSearch').oninput = paintRooms;
  el('msgUnread').onclick = () => {
    unreadOnly = !unreadOnly;
    el('msgUnread').setAttribute('aria-pressed', String(unreadOnly));
    paintRooms();
  };
  el('msgLatest').onclick = () => {
    timeline.scrollTop = timeline.scrollHeight;
    el('msgLatest').hidden = true;
    scheduleRead();
  };
  document.addEventListener('click', async (event) => {
    const target = event.target.closest(
      '[data-msg-open],[data-msg-original],[data-msg-room],[data-msg-category],[data-msg-reply],[data-msg-forward],[data-contact-id],[data-msg-quote],[data-msg-exam],[data-msg-cancel-reply],[data-remove-file],[data-emoji],[data-emoji-category],[data-info-tab],[data-search-id],[data-msg-menu],[data-reaction],[data-relation],[data-chat-blocked],[data-cancel-upload],[data-msg-unpin]',
    );
    if (!target) return;
    try {
      if (target.hasAttribute('data-msg-open')) {
        if (!current()) return;
        window.enquizVisit('messages');
        checkAuth();
        if (!ready) connect();
      } else if (target.dataset.msgRoom) await openRoom(target.dataset.msgRoom);
      else if (target.dataset.msgOriginal) {
        const gen = generation,
          source = room,
          result = await request('original', { roomId: source, id: Number(target.dataset.msgOriginal) });
        if (gen !== generation || room !== source) return;
        kind = result.category;
        await openRoom(result.roomId);
        await focusMessage(result.messageId, result.category);
      } else if (target.dataset.msgCategory) {
        closeEmoji();
        closeContext();
        clearSelection();
        chatListView = '';
        contactGroupView = null;
        listMode = 'chats';
        kind = target.dataset.msgCategory;
        badge();
        paintRooms();
        await history();
      } else if (target.dataset.contactId) {
        const result = await request('open', { kind: 'direct', accountId: target.dataset.contactId });
        upsertRoom(result.room);
        kind = 'personal';
        await openRoom(result.roomId);
      } else if (target.dataset.msgReply)
        await replyMessage(state()?.rows.find((m) => m.id === Number(target.dataset.msgReply)));
      else if (target.dataset.msgForward) forwardMessage(Number(target.dataset.msgForward));
      else if (target.dataset.msgMenu) {
        const box = target.getBoundingClientRect();
        messageMenu(
          state()?.rows.find((m) => m.id === Number(target.dataset.msgMenu)),
          box.right,
          box.bottom,
        );
      } else if (target.dataset.reaction)
        await request('react', { roomId: room, id: Number(target.dataset.reactionId), emoji: target.dataset.reaction });
      else if (target.dataset.relation) {
        const result = await request('relation', { roomId: room, action: target.dataset.relation });
        upsertRoom(result.room);
        paintRooms();
      } else if (target.hasAttribute('data-chat-blocked')) await blockedUsers();
      else if (target.hasAttribute('data-msg-cancel-reply')) {
        reply = null;
        paintDraft();
        remember();
      } else if (target.dataset.msgQuote) {
        const parent = findMessage(Number(target.closest('[data-msg-id]')?.dataset.msgId));
        await focusMessage(Number(target.dataset.msgQuote), parent?.replyCategory || kind, parent?.replyText || '');
      } else if (target.dataset.msgExam) {
        const result = await domain('/exam?id=' + target.dataset.msgExam);
        if (result.studentId) {
          await openStudentPages({ id: result.studentId, role: 'USER' });
          if (viewAccount?.id !== result.studentId) throw new Error('Exit the current student pages first.');
        }
        await examPull(true);
        examCurrentId = result.examId;
        window.enquizVisit('examblocks');
      } else if (target.dataset.removeFile) {
        files = files.filter((f) => f.id !== target.dataset.removeFile);
        paintDraft();
        remember();
      } else if (target.dataset.cancelUpload) {
        const id = target.dataset.cancelUpload;
        if (id.startsWith('file:')) {
          if (busy) return;
          files = files.filter((file) => file.id !== id.slice(5));
          paintDraft();
          remember();
        } else cancelUploads(id);
      } else if (target.dataset.emoji) {
        const value = target.dataset.emoji;
        if (composer.value.length + value.length > 4000) return;
        if (!window.TextColors?.insert(composer, value))
          composer.setRangeText(value, composer.selectionStart, composer.selectionEnd, 'end');
        closeEmoji();
        remember();
        focusComposer();
      } else if (target.dataset.emojiCategory) paintEmoji(target.dataset.emojiCategory);
      else if (target.dataset.infoTab) await showInfo(target.dataset.infoTab);
      else if (target.dataset.searchId) await focusMessage(Number(target.dataset.searchId), kind, '', true);
      else if (target.dataset.msgUnpin) {
        const result = await request('pin', {
          roomId: room,
          id: Number(target.dataset.msgUnpin),
          pinned: false,
        });
        if (result.room) upsertRoom(result.room);
        paintRooms();
        const cache = state();
        if (cache?.rows) for (const message of cache.rows) mergeNode(message);
      }
    } catch (error) {
      status(error.message);
    }
  });
  // Keep account navigation owned by the application; chat adds only its entry points.
  for (const button of document.querySelectorAll('[data-jump="stats"]')) {
    if (document.body.dataset.roleNavigation && !button.closest('#account,#profile')) continue;
    if (button.parentElement?.querySelector('[data-msg-open]')) continue;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = button.className;
    next.dataset.msgOpen = '';
    next.textContent = 'Messages';
    button.after(next);
  }
  for (const root of document.querySelectorAll('.side-foot,.mobile-tools'))
    if (!document.body.dataset.roleNavigation && !root.querySelector('[data-msg-open]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn ghost';
      button.dataset.msgOpen = '';
      button.textContent = 'Messages';
      const anchor = root.querySelector('[data-jump="account"]');
      if (anchor) anchor.after(button);
      else root.prepend(button);
    }
  for (const root of document.querySelectorAll('#account,#profile')) {
    const row = root.querySelector('[data-jump="stats"]')?.parentElement;
    if (row && !row.querySelector('[data-chat-blocked]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.chatBlocked = '';
      button.textContent = 'Blocked users';
      row.append(button);
    }
  }
  if (typeof dayScreens !== 'undefined') dayScreens.messages = 'account';
