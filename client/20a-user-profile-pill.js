(function initUserProfilePill() {
  // User Profile Pill Badge & Settings Popover (Variant 1)
  const STATUS_MAP = {
    online: { label: 'Online', dotClass: 'is-online', dotColor: '#10b981' },
    in_class: { label: 'In Class', dotClass: 'is-in_class', dotColor: '#f59e0b' },
    away: { label: 'Away', dotClass: 'is-away', dotColor: '#94a3b8' },
    offline: { label: 'Offline', dotClass: 'is-offline', dotColor: '#cbd5e1' }
  };

  function isLessonActive() {
    const activeSection = document.querySelector('section.on');
    if (activeSection) {
      const lessonScreens = [
        'lesson', 'lesson07', 'lesson09', 'lesson14', 'lesson16', 'lesson23',
        'material', 'daystudy', 'speaklesson', 'daywords', 'daywork', 'daysetup',
        'dayq', 'daychoice', 'dayflip', 'dayjudge', 'quiz'
      ];
      if (lessonScreens.includes(activeSection.id)) return true;
    }
    if (typeof window.isCurrentTimeInScheduledLesson === 'function' && window.isCurrentTimeInScheduledLesson()) {
      return true;
    }
    try {
      const today = (typeof lmToday === 'function') ? lmToday() : new Date().toISOString().slice(0, 10);
      if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary?.materials)) {
        if (lmLibrary.materials.some(m => m && m.date === today && !m.hidden)) return true;
      }
      if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
        if (classGroups.some(g => g && g.date === today && !g.hidden)) return true;
      }
    } catch {}
    return false;
  }

  function getUserStatus() {
    const user = (typeof viewAccount !== 'undefined' && viewAccount) || (typeof authUser !== 'undefined' && authUser) || null;
    if (!user) return 'offline';
    try {
      const saved = localStorage.getItem('lumiscia-user-status');
      if (saved && Object.prototype.hasOwnProperty.call(STATUS_MAP, saved)) return saved;
    } catch {}
    if (isLessonActive()) return 'in_class';
    return 'online';
  }

  window.getUserStatus = getUserStatus;

  function setUserStatus(newStatus) {
    if (!Object.prototype.hasOwnProperty.call(STATUS_MAP, newStatus)) return;
    try {
      localStorage.setItem('lumiscia-user-status', newStatus);
    } catch {}
    syncStatusDots();
  }

  window.setUserStatus = setUserStatus;

  function syncStatusDots() {
    const status = getUserStatus();
    const statusInfo = STATUS_MAP[status] || STATUS_MAP.online;
    const pillDot = document.getElementById('pillStatusDot');
    if (pillDot) {
      pillDot.className = 'pill-status-dot ' + (statusInfo.dotClass || '');
    }
    const popoverDot = document.getElementById('popoverStatusDot');
    if (popoverDot) {
      popoverDot.className = 'popover-status-dot ' + (statusInfo.dotClass || '');
    }
    const tabbarDot = document.getElementById('tabbarStatusDot');
    if (tabbarDot) {
      tabbarDot.className = 'tabbar-status-dot ' + (statusInfo.dotClass || '');
    }
    const settingsDot = document.getElementById('settingsProfileStatusDot');
    if (settingsDot) {
      settingsDot.className = 'settings-profile-status-dot ' + (statusInfo.dotClass || '');
    }
    const host = document.getElementById('userProfilePillHost');
    if (host) {
      host.querySelectorAll('[data-status-val]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.statusVal === status);
      });
    }
  }

  function getUserRoleInfo(user) {
    if (!user) return { label: 'Guest', roleName: 'Guest', emoji: '👤', class: 'role-guest' };
    if ((typeof isDeveloper === 'function' && isDeveloper()) || user.role === 'DEVELOPER') {
      return { label: 'Support', roleName: 'Support', emoji: '👑', class: 'role-admin' };
    }
    if (user.role === 'ADMIN') {
      const login = String(user.login || '').toLowerCase();
      if (login.startsWith('teacher') || user.leadInstructor) {
        return { label: 'Teacher', roleName: 'Teacher', emoji: '📚', class: 'role-teacher' };
      }
      return { label: 'Support', roleName: 'Support', emoji: '👑', class: 'role-admin' };
    }
    if (user.role === 'LEAD_INSTRUCTOR' || user.leadInstructor || (typeof isTeacher === 'function' && isTeacher()) || user.role === 'TEACHER') {
      return { label: 'Teacher', roleName: 'Teacher', emoji: '📚', class: 'role-teacher' };
    }
    return { label: 'Student', roleName: 'Student', emoji: '🎒', class: 'role-student' };
  }

  function getUserInitials(name) {
    if (!name) return 'U';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function paintUserProfilePill() {
    const host = document.getElementById('userProfilePillHost');
    const header = document.getElementById('shellHeader');
    if (!host) return;

    const user = (typeof viewAccount !== 'undefined' && viewAccount) || (typeof authUser !== 'undefined' && authUser) || null;
    const isGuest = !user;
    if (isGuest) {
      if (header) header.hidden = true;
      host.innerHTML = '';
      return;
    }

    const activeSection = document.querySelector('section.on');
    const hideOnScreens = ['material', 'examblocks', 'speaklesson', 'speakouteditor'];
    if (activeSection && hideOnScreens.includes(activeSection.id)) {
      if (header) header.hidden = true;
    } else {
      if (header) header.hidden = false;
    }

    const name = user.name || user.login || 'User';
    const email = user.email || (user.login ? (user.login + '@lumiscia.edu') : '');
    const initials = getUserInitials(name);
    const role = getUserRoleInfo(user);
    const status = getUserStatus();
    const statusInfo = STATUS_MAP[status] || STATUS_MAP.online;
    let cachedAvatar = '';
    try {
      cachedAvatar = (typeof profileViews !== 'undefined' && profileViews && profileViews[user.id]?.avatarUrl) ||
                     localStorage.getItem('enquiz-user-avatar:' + user.id) || '';
    } catch {}
    const effectiveAvatar = user.avatarUrl || cachedAvatar;
    if (effectiveAvatar) {
      try { localStorage.setItem('enquiz-user-avatar:' + user.id, effectiveAvatar); } catch {}
    }
    const avatarContent = effectiveAvatar
      ? '<img src="' + esc(effectiveAvatar) + '" alt="' + esc(name) + '">'
      : '<span>' + esc(initials) + '</span>';

    host.innerHTML =
      '<div class="user-profile-pill-wrap" id="userProfilePillWrap">' +
        '<button type="button" class="user-profile-pill is-circle" id="userProfilePill" aria-expanded="false" aria-haspopup="true" aria-label="User profile and settings" title="' + esc(name) + '">' +
          '<div class="pill-avatar-wrap">' +
            '<div class="pill-avatar-img chat-avatar' + (effectiveAvatar ? ' has-avatar-photo' : '') + '" data-avatar-subject="' + esc(user.id) + '" data-avatar-name="' + esc(name) + '">' + avatarContent + '</div>' +
            '<span class="pill-status-dot ' + statusInfo.dotClass + '" id="pillStatusDot"></span>' +
          '</div>' +
          '<span class="pill-user-name" hidden>' + esc(name) + '</span>' +
          '<span class="pill-role-badge ' + role.class + '" hidden>' + esc(role.label) + '</span>' +
          '<svg class="pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" hidden><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="user-profile-popover" id="userProfilePopover" role="menu" hidden>' +
          '<div class="popover-header">' +
            '<div class="popover-user-row">' +
              '<div class="popover-avatar-wrap">' +
                '<div class="popover-avatar-img chat-avatar" data-avatar-subject="' + esc(user.id) + '" data-avatar-name="' + esc(name) + '">' + avatarContent + '</div>' +
                '<span class="popover-status-dot ' + statusInfo.dotClass + '" id="popoverStatusDot"></span>' +
              '</div>' +
              '<div class="popover-user-details">' +
                '<div class="popover-name">' + esc(name) + '</div>' +
                '<div class="popover-email">' + esc(email) + '</div>' +
                '<div class="popover-role-chip">' +
                  '<span>' + role.emoji + '</span>' +
                  '<span>' + esc(role.roleName) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="popover-status-bar">' +
              '<span class="popover-status-label">Status:</span>' +
              '<div class="popover-status-buttons">' +
                '<button type="button" class="popover-status-btn' + (status === 'online' ? ' is-active' : '') + '" data-status-val="online">Online</button>' +
                '<button type="button" class="popover-status-btn' + (status === 'in_class' ? ' is-active' : '') + '" data-status-val="in_class">In Class</button>' +
                '<button type="button" class="popover-status-btn' + (status === 'away' ? ' is-active' : '') + '" data-status-val="away">Away</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="popover-menu-items">' +
            '<button type="button" class="popover-item is-highlight" data-profile-action="settings">' +
              '<div class="popover-item-main">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
                '<span>Settings</span>' +
              '</div>' +
              '<span class="popover-kbd">⌘,</span>' +
            '</button>' +
            '<button type="button" class="popover-item" data-profile-action="notifications">' +
              '<div class="popover-item-main">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
                '<span>Lesson notifications</span>' +
              '</div>' +
              '<span class="popover-notify-dot"></span>' +
            '</button>' +
          '</div>' +
          '<div class="popover-footer">' +
            (isGuest
              ? '<button type="button" class="popover-logout-btn" data-profile-action="login">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' +
                  '<span>Log in</span>' +
                '</button>'
              : '<button type="button" class="popover-logout-btn" data-profile-action="logout">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                  '<span>Log out</span>' +
                '</button>') +
            '<span class="popover-version">v2.4.0 Lumiscia</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    const pillBtn = host.querySelector('#userProfilePill');
    const popover = host.querySelector('#userProfilePopover');

    if (pillBtn && popover) {
      pillBtn.onclick = (e) => {
        e.stopPropagation();
        const willOpen = popover.hidden;
        popover.hidden = !willOpen;
        pillBtn.classList.toggle('is-open', willOpen);
        pillBtn.setAttribute('aria-expanded', String(willOpen));
      };
    }

    host.querySelectorAll('[data-status-val]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        setUserStatus(btn.dataset.statusVal);
      };
    });

    host.querySelectorAll('[data-profile-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (popover) {
          popover.hidden = true;
          if (pillBtn) {
            pillBtn.classList.remove('is-open');
            pillBtn.setAttribute('aria-expanded', 'false');
          }
        }
        const act = btn.dataset.profileAction;
        if (act === 'settings') {
          if (typeof show === 'function') {
            show('settings');
          } else if (typeof window.enquizVisit === 'function') {
            window.enquizVisit('settings');
          }
        } else if (act === 'notifications') {
          if (typeof window.openLessonNotifications === 'function') {
            window.openLessonNotifications();
          } else if (typeof show === 'function') {
            show('settings');
          }
        } else if (act === 'logout') {
          setUserStatus('offline');
          if (typeof performLogout === 'function') {
            performLogout();
          } else {
            const logoutTrigger = document.querySelector('[data-account="logout"]');
            if (logoutTrigger) logoutTrigger.click();
            else if (typeof leaveAccount === 'function') leaveAccount({ signedOut: true });
          }
        } else if (act === 'login') {
          if (typeof show === 'function') {
            show('account');
          }
          const loginTrigger = document.querySelector('[data-account="show-login"]');
          if (loginTrigger) loginTrigger.click();
        }
      };
    });

    // Enhance mobile tabbar Profile / Settings button
    const tabbarSettingsBtn = document.querySelector('.tabbar [data-shell-settings-open], .tabbar [data-jump="settings"]');
    if (tabbarSettingsBtn) {
      tabbarSettingsBtn.hidden = false;
      tabbarSettingsBtn.setAttribute('data-mobile-profile-tab', '');
      tabbarSettingsBtn.setAttribute('data-chrome', 'settings,account,stats,themes');
      tabbarSettingsBtn.innerHTML =
        '<span class="tabbar-profile-icon" id="tabbarProfileIcon" aria-hidden="true">' +
          '<span class="tabbar-avatar-circle chat-avatar" id="tabbarAvatarCircle" data-avatar-subject="' + esc(user.id) + '" data-avatar-name="' + esc(name) + '">' + avatarContent + '</span>' +
          '<span class="tabbar-status-dot ' + (statusInfo.dotClass || '') + '" id="tabbarStatusDot"></span>' +
        '</span>' +
        '<span>Profile</span>';
    }
    if (typeof scheduleProfiles === 'function') scheduleProfiles();
    else if (typeof window.scheduleProfiles === 'function') window.scheduleProfiles();
  }

  // Global listener for closing popover on outside click and Escape, plus Cmd+, / Ctrl+, shortcut
  (function initUserProfilePillEvents() {
    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('userProfilePillWrap');
      if (!wrap || wrap.contains(e.target)) return;
      const popover = document.getElementById('userProfilePopover');
      const pillBtn = document.getElementById('userProfilePill');
      if (popover && !popover.hidden) {
        popover.hidden = true;
        if (pillBtn) {
          pillBtn.classList.remove('is-open');
          pillBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Automatically synchronize status dots on navigation or screen clicks
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-jump], [data-speak-lesson], [data-lesson-words], [data-lesson-rules], [data-view]')) {
        setTimeout(syncStatusDots, 50);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const popover = document.getElementById('userProfilePopover');
        const pillBtn = document.getElementById('userProfilePill');
        if (popover && !popover.hidden) {
          popover.hidden = true;
          if (pillBtn) {
            pillBtn.classList.remove('is-open');
            pillBtn.setAttribute('aria-expanded', 'false');
          }
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        const popover = document.getElementById('userProfilePopover');
        const pillBtn = document.getElementById('userProfilePill');
        if (popover && !popover.hidden) {
          popover.hidden = true;
          if (pillBtn) {
            pillBtn.classList.remove('is-open');
            pillBtn.setAttribute('aria-expanded', 'false');
          }
        }
        if (typeof authUser !== 'undefined' && authUser) {
          if (typeof show === 'function') {
            show('settings');
          } else if (typeof window.enquizVisit === 'function') {
            window.enquizVisit('settings');
          }
        }
      }
    });
  })();

  window.paintUserProfilePill = paintUserProfilePill;
  window.setUserStatus = setUserStatus;
  window.getUserStatus = getUserStatus;
  window.syncStatusDots = syncStatusDots;
  window.getUserStatus = getUserStatus;
  window.syncStatusDots = syncStatusDots;
  window.isLessonActive = isLessonActive;
})();
