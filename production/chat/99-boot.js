  function checkAuth() {
    if (databaseResetting) return;
    const user = signedIn(),
      next = user ? user.id + ':' + user.role : '';
    if (signature !== next) window.NotificationSounds?.load(user?.id || '');
    if (signature !== next) {
      chatListView = '';
      section.classList.remove('chat-detached');
    }
    if (signature !== next) {
      remember();
      cancelUploads();
      closeContext();
      clearSelection();
      cancelRecording();
      disconnect();
      document.querySelectorAll('dialog.chat-dialog').forEach((d) => d.close());
      generation++;
      signature = next;
      account = user?.id || '';
      seq = 0;
      data = { rooms: [], contacts: [], groups: [], total: 0 };
      room = '';
      reply = null;
      pending = null;
      files = [];
      historyCache.clear();
      membersCache.clear();
      cursors.clear();
      timeline.replaceChildren();
      composer.value = '';
      prefs = { left: true, right: false, enter: true, notifications: false };
      try {
        Object.assign(prefs, JSON.parse(localStorage.getItem('english-chat-settings:' + account) || '{}'));
      } catch {}
      if (innerWidth <= 700) prefs.right = false;
      el('msgRight').hidden = !prefs.right;
      el('msgRooms').closest('.chat-list').hidden = !prefs.left;
      el('msgListBack').hidden = !!prefs.left;
      el('msgProfile').textContent = initials(user?.name || user?.login);
      badge();
      paintRooms();
      if (user) {
        reconnectCount = 0;
        connect();
      }
    }
    if (profileViews._account !== account) {
      profileViews = Object.create(null);
      profileViews._account = account;
      profileRequested.clear();
    }
    const face = el('msgProfile');
    face.dataset.avatarSubject = user?.id || '';
    face.dataset.avatarName = user?.name || user?.login || '';
    const interactive = current()?.id || '';
    if (interactiveAccount !== interactive) {
      interactiveAccount = interactive;
      badge();
    }
    document
      .querySelectorAll('[data-msg-open],#account [data-chat-blocked],#profile [data-chat-blocked]')
      .forEach((b) => (b.hidden = !current()));
    if (!current() && active() && typeof accountChecked !== 'undefined' && accountChecked)
      window.enquizVisit('account');
    document.body.classList.toggle('chat-active', active() && !!current());
    if (active()) fitPanels();
  }
  window.addEventListener('database-context-reset', () => {
    databaseResetting = true;
    generation++;
    disconnect();
    cancelUploads();
    cancelRecording();
    account = '';
    room = '';
    pending = null;
    reply = null;
    files = [];
    historyCache.clear();
    membersCache.clear();
    cursors.clear();
    timeline.replaceChildren();
    composer.value = '';
  });
  const observer = new MutationObserver(checkAuth);
  for (const id of ['account', 'profile']) if (el(id)) observer.observe(el(id), { childList: true, subtree: true });
  const profileObserver = new MutationObserver((rows) => {
    if (
      rows.some(
        (row) =>
          !row.target.closest?.('[data-avatar-subject],.account-avatar-row') &&
          [...row.addedNodes].some((n) => n.nodeType === 1 && !n.matches('svg')),
      )
    )
      scheduleProfiles();
  });
  for (const id of ['account', 'profile', 'admin', 'adminuser'])
    if (el(id)) profileObserver.observe(el(id), { childList: true, subtree: true });
  new MutationObserver(() => {
    checkAuth();
    if (active()) {
      if (ready && room) history().catch((error) => status(error.message));
      if (!ready) connect();
    } else if (recordGesture) cancelRecording();
  }).observe(section, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAuth();
      if (!socket && current()) connect();
      scheduleRead();
    }
  });
  window.addEventListener('focus', scheduleRead);
  let wasNarrow = innerWidth <= 700,
    desktopLeft = null;
  window.addEventListener('resize', () => {
    closeContext();
    const narrow = innerWidth <= 700;
    if (narrow && !wasNarrow && room) {
      desktopLeft = prefs.left;
      panel('right', false);
      panel('left', false);
    } else if (!narrow && wasNarrow && desktopLeft !== null) {
      panel('left', desktopLeft);
      desktopLeft = null;
    }
    if (narrow && prefs.left && prefs.right) panel('right', false);
    wasNarrow = narrow;
    fitPanels();
  });
  function fitKeyboard() {
    if (window.visualViewport) {
      section.style.height = visualViewport.height + 'px';
      section.style.top = visualViewport.offsetTop + 'px';
    }
    scheduleInputFit();
  }
  window.visualViewport?.addEventListener('resize', fitKeyboard);
  window.visualViewport?.addEventListener('scroll', fitKeyboard);
  fitKeyboard();
  checkAuth();
  icons();
  scheduleProfiles();
})();
