    // User Profile Pill Badge & Settings Popover (Variant 1)
    const STATUS_MAP = {
      online: { labelRu: 'В сети', dotClass: 'is-online', dotColor: '#10b981' },
      in_class: { labelRu: 'На занятии', dotClass: 'is-in_class', dotColor: '#f59e0b' },
      away: { labelRu: 'Отошел', dotClass: 'is-away', dotColor: '#94a3b8' },
      offline: { labelRu: 'Не в сети', dotClass: 'is-offline', dotColor: '#cbd5e1' }
    };

    function getUserStatus() {
      try {
        const saved = localStorage.getItem('lumiscia-user-status');
        if (saved && Object.prototype.hasOwnProperty.call(STATUS_MAP, saved)) return saved;
      } catch {}
      return 'online';
    }

    function setUserStatus(newStatus) {
      if (!Object.prototype.hasOwnProperty.call(STATUS_MAP, newStatus)) return;
      try {
        localStorage.setItem('lumiscia-user-status', newStatus);
      } catch {}
      const host = document.getElementById('userProfilePillHost');
      if (!host) return;

      // Update dots
      const pillDot = host.querySelector('#pillStatusDot');
      if (pillDot) {
        pillDot.className = 'pill-status-dot ' + (STATUS_MAP[newStatus]?.dotClass || '');
      }
      const popoverDot = host.querySelector('#popoverStatusDot');
      if (popoverDot) {
        popoverDot.className = 'popover-status-dot ' + (STATUS_MAP[newStatus]?.dotClass || '');
      }
      const tabbarDot = document.getElementById('tabbarStatusDot');
      if (tabbarDot) {
        tabbarDot.className = 'tabbar-status-dot ' + (STATUS_MAP[newStatus]?.dotClass || '');
      }

      // Update buttons
      host.querySelectorAll('[data-status-val]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.statusVal === newStatus);
      });
    }

    function getUserRoleInfo(user) {
      if (!user) return { label: 'STUDENT', labelRu: 'Студент', emoji: '🎒', class: 'role-student' };
      if (typeof isDeveloper === 'function' && isDeveloper() || user.role === 'ADMIN') {
        return { label: 'ADMIN', labelRu: 'Администратор', emoji: '👑', class: 'role-admin' };
      }
      if (user.role === 'LEAD_INSTRUCTOR' || user.leadInstructor) {
        return { label: 'LEAD', labelRu: 'Ведущий методист', emoji: '🎓', class: 'role-lead' };
      }
      if (typeof isTeacher === 'function' && isTeacher()) {
        return { label: 'TEACHER', labelRu: 'Преподаватель', emoji: '📚', class: 'role-teacher' };
      }
      return { label: 'STUDENT', labelRu: 'Студент', emoji: '🎒', class: 'role-student' };
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
      if (!user) {
        host.innerHTML = '';
        if (header) header.hidden = true;
        const tabbarSettingsBtn = document.querySelector('.tabbar [data-mobile-profile-tab]');
        if (tabbarSettingsBtn) tabbarSettingsBtn.hidden = true;
        return;
      }

      if (header) header.hidden = false;

      const name = user.name || user.login || 'User';
      const email = user.email || (user.login ? (user.login + '@lumiscia.edu') : '');
      const initials = getUserInitials(name);
      const role = getUserRoleInfo(user);
      const status = getUserStatus();
      const statusInfo = STATUS_MAP[status] || STATUS_MAP.online;
      const avatarContent = user.avatarUrl
        ? '<img src="' + esc(user.avatarUrl) + '" alt="' + esc(name) + '">'
        : '<span>' + esc(initials) + '</span>';

      host.innerHTML =
        '<div class="user-profile-pill-wrap" id="userProfilePillWrap">' +
          '<button type="button" class="user-profile-pill" id="userProfilePill" aria-expanded="false" aria-haspopup="true" aria-label="User profile and settings">' +
            '<div class="pill-avatar-wrap">' +
              '<div class="pill-avatar-img">' + avatarContent + '</div>' +
              '<span class="pill-status-dot ' + statusInfo.dotClass + '" id="pillStatusDot"></span>' +
            '</div>' +
            '<span class="pill-user-name">' + esc(name) + '</span>' +
            '<span class="pill-role-badge ' + role.class + '">' + esc(role.label) + '</span>' +
            '<svg class="pill-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="user-profile-popover" id="userProfilePopover" role="menu" hidden>' +
            '<div class="popover-header">' +
              '<div class="popover-user-row">' +
                '<div class="popover-avatar-wrap">' +
                  '<div class="popover-avatar-img">' + avatarContent + '</div>' +
                  '<span class="popover-status-dot ' + statusInfo.dotClass + '" id="popoverStatusDot"></span>' +
                '</div>' +
                '<div class="popover-user-details">' +
                  '<div class="popover-name">' + esc(name) + '</div>' +
                  '<div class="popover-email">' + esc(email) + '</div>' +
                  '<div class="popover-role-chip">' +
                    '<span>' + role.emoji + '</span>' +
                    '<span>' + esc(role.labelRu) + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="popover-status-bar">' +
                '<span class="popover-status-label">Статус:</span>' +
                '<div class="popover-status-buttons">' +
                  '<button type="button" class="popover-status-btn' + (status === 'online' ? ' is-active' : '') + '" data-status-val="online">В сети</button>' +
                  '<button type="button" class="popover-status-btn' + (status === 'in_class' ? ' is-active' : '') + '" data-status-val="in_class">На занятии</button>' +
                  '<button type="button" class="popover-status-btn' + (status === 'away' ? ' is-active' : '') + '" data-status-val="away">Отошел</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="popover-menu-items">' +
              '<button type="button" class="popover-item is-highlight" data-profile-action="settings">' +
                '<div class="popover-item-main">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
                  '<span>Панель настроек (Settings)</span>' +
                '</div>' +
                '<span class="popover-kbd">⌘,</span>' +
              '</button>' +
              '<button type="button" class="popover-item" data-profile-action="profile">' +
                '<div class="popover-item-main">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
                  '<span>Мой профиль и данные</span>' +
                '</div>' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
              '</button>' +
              '<button type="button" class="popover-item" data-profile-action="roles">' +
                '<div class="popover-item-main">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
                  '<span>Роли и права в Lumiscia</span>' +
                '</div>' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
              '</button>' +
              '<button type="button" class="popover-item" data-profile-action="notifications">' +
                '<div class="popover-item-main">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
                  '<span>Уведомления уроков</span>' +
                '</div>' +
                '<span class="popover-notify-dot"></span>' +
              '</button>' +
            '</div>' +
            '<div class="popover-footer">' +
              '<button type="button" class="popover-logout-btn" data-profile-action="logout">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                '<span>Выйти</span>' +
              '</button>' +
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
          if (act === 'settings' || act === 'profile' || act === 'roles' || act === 'notifications') {
            if (typeof show === 'function') {
              show('settings');
            } else if (typeof window.enquizVisit === 'function') {
              window.enquizVisit('settings');
            }
          } else if (act === 'logout') {
            if (typeof performLogout === 'function') {
              performLogout();
            } else {
              const logoutTrigger = document.querySelector('[data-account="logout"]');
              if (logoutTrigger) logoutTrigger.click();
              else if (typeof leaveAccount === 'function') leaveAccount({ signedOut: true });
            }
          }
        };
      });

      // Enhance mobile tabbar Profile / Settings button
      const tabbarSettingsBtn = document.querySelector('.tabbar [data-shell-settings-open], .tabbar [data-jump="settings"]');
      if (tabbarSettingsBtn) {
        tabbarSettingsBtn.setAttribute('data-mobile-profile-tab', '');
        tabbarSettingsBtn.setAttribute('data-chrome', 'settings,account,stats,themes');
        tabbarSettingsBtn.innerHTML =
          '<span class="tabbar-profile-icon" id="tabbarProfileIcon" aria-hidden="true">' +
            '<span class="tabbar-avatar-circle" id="tabbarAvatarCircle">' + (user.avatarUrl ? '<img src="' + esc(user.avatarUrl) + '" alt="' + esc(name) + '">' : esc(initials)) + '</span>' +
            '<span class="tabbar-status-dot ' + (statusInfo.dotClass || '') + '" id="tabbarStatusDot"></span>' +
          '</span>' +
          '<span>Profile</span>';
      }
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
