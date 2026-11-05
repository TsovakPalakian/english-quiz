(function initLessonNotifications() {
  const PREF_KEYS = {
    lessonReminders: 'lumiscia-notify-lesson-reminders',
    dailyReview: 'lumiscia-notify-daily-review',
    audioAlerts: 'lumiscia-notify-sound'
  };

  const READ_KEY = 'lumiscia-notify-read-ts';

  function getNotificationSettings() {
    return {
      lessonReminders: localStorage.getItem(PREF_KEYS.lessonReminders) !== 'false',
      dailyReview: localStorage.getItem(PREF_KEYS.dailyReview) !== 'false',
      audioAlerts: localStorage.getItem(PREF_KEYS.audioAlerts) === 'true'
    };
  }

  function setNotificationSetting(key, val) {
    if (PREF_KEYS[key]) {
      try {
        localStorage.setItem(PREF_KEYS[key], String(val));
      } catch {}
    }
  }

  function getActiveNotifications() {
    const list = [];
    const today = (typeof lmToday === 'function') ? lmToday() : new Date().toISOString().slice(0, 10);
    const user = (typeof viewAccount !== 'undefined' && viewAccount) || (typeof authUser !== 'undefined' && authUser) || null;

    // 1. Check for scheduled lesson today
    let todayLessonFound = false;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      const activeGroup = classGroups.find(g => g && g.date === today && !g.hidden);
      if (activeGroup) {
        todayLessonFound = true;
        list.push({
          id: 'lesson-today-' + (activeGroup.id || 'current'),
          type: 'lesson',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
          title: 'Scheduled Class Today',
          desc: (activeGroup.title || 'Lesson group') + ' has an active session scheduled for today.',
          badge: 'Today',
          badgeClass: 'badge-today'
        });
      }
    }

    if (!todayLessonFound && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary?.materials)) {
      const mat = lmLibrary.materials.find(m => m && m.date === today && !m.hidden);
      if (mat) {
        list.push({
          id: 'material-today-' + mat.id,
          type: 'lesson',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
          title: 'Lesson Material Today',
          desc: (mat.title || 'Active material') + ' is assigned for today.',
          badge: 'Today',
          badgeClass: 'badge-today'
        });
      }
    }

    // 2. Word review reminder
    list.push({
      id: 'fsrs-review-card',
      type: 'review',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>',
      title: 'Vocabulary Review Ready',
      desc: 'Spaced repetition cards are queued for retention practice.',
      badge: 'Review',
      badgeClass: 'badge-review'
    });

    // 3. System release reminder
    list.push({
      id: 'system-v240',
      type: 'system',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      title: 'Lumiscia Studio Updated',
      desc: 'Version 2.4.0 active: improved isolated workbench and unified profile bar.',
      badge: 'v2.4.0',
      badgeClass: 'badge-system'
    });

    return list;
  }

  function markAllNotificationsAsRead() {
    try {
      localStorage.setItem(READ_KEY, String(Date.now()));
    } catch {}
    const dots = document.querySelectorAll('.popover-notify-dot');
    dots.forEach(dot => { dot.style.display = 'none'; });
    const badge = document.getElementById('lessonNotifyCountBadge');
    if (badge) {
      badge.textContent = 'All read';
      badge.className = 'lesson-notify-count-badge is-read';
    }
  }

  function ensureModalElement() {
    let modal = document.getElementById('lessonNotificationsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'lessonNotificationsModal';
      modal.className = 'lesson-notifications-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'lessonNotifyModalTitle');
      modal.hidden = true;
      document.body.appendChild(modal);
    }
    return modal;
  }

  function renderModalContent() {
    const modal = ensureModalElement();
    const notifications = getActiveNotifications();
    const settings = getNotificationSettings();
    const readTs = Number(localStorage.getItem(READ_KEY) || '0');
    const isRecentlyRead = (Date.now() - readTs) < (24 * 60 * 60 * 1000);

    const itemsHtml = notifications.map(item =>
      '<div class="lesson-notify-card" data-notify-id="' + esc(item.id) + '">' +
        '<div class="lesson-notify-card-icon ' + esc(item.type) + '">' + item.icon + '</div>' +
        '<div class="lesson-notify-card-body">' +
          '<div class="lesson-notify-card-top">' +
            '<span class="lesson-notify-card-title">' + esc(item.title) + '</span>' +
            '<span class="lesson-notify-badge ' + esc(item.badgeClass) + '">' + esc(item.badge) + '</span>' +
          '</div>' +
          '<p class="lesson-notify-card-desc">' + esc(item.desc) + '</p>' +
        '</div>' +
      '</div>'
    ).join('');

    modal.innerHTML =
      '<div class="lesson-notifications-backdrop" id="lessonNotifyBackdrop"></div>' +
      '<div class="lesson-notifications-dialog" id="lessonNotifyDialog">' +
        '<div class="lesson-notify-head">' +
          '<div class="lesson-notify-head-title">' +
            '<svg class="lesson-notify-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '<h2 id="lessonNotifyModalTitle">Lesson Notifications</h2>' +
            '<span class="lesson-notify-count-badge' + (isRecentlyRead ? ' is-read' : '') + '" id="lessonNotifyCountBadge">' +
              (isRecentlyRead ? 'All read' : (notifications.length + ' active')) +
            '</span>' +
          '</div>' +
          '<button type="button" class="lesson-notify-close-btn" id="lessonNotifyCloseBtn" aria-label="Close notifications">×</button>' +
        '</div>' +
        '<div class="lesson-notify-scroll">' +
          '<div class="lesson-notify-section-title">ACTIVE REMINDERS</div>' +
          '<div class="lesson-notify-list">' + itemsHtml + '</div>' +
          '<div class="lesson-notify-section-title" style="margin-top:20px;">NOTIFICATION PREFERENCES</div>' +
          '<div class="lesson-notify-settings">' +
            '<label class="lesson-notify-pref-row">' +
              '<div class="lesson-notify-pref-label">' +
                '<strong>Lesson start reminders</strong>' +
                '<span>Receive an alert 15 minutes prior to class</span>' +
              '</div>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="lessonReminders"' + (settings.lessonReminders ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref-row">' +
              '<div class="lesson-notify-pref-label">' +
                '<strong>Daily word review</strong>' +
                '<span>Spaced repetition queue alerts for retention</span>' +
              '</div>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="dailyReview"' + (settings.dailyReview ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref-row">' +
              '<div class="lesson-notify-pref-label">' +
                '<strong>Audio alert sounds</strong>' +
                '<span>Play notification tone for timely awareness</span>' +
              '</div>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="audioAlerts"' + (settings.audioAlerts ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
          '</div>' +
        '</div>' +
        '<div class="lesson-notify-foot">' +
          '<button type="button" class="btn lesson-notify-read-all-btn" id="lessonNotifyReadAllBtn">Mark all as read</button>' +
          '<button type="button" class="btn primary lesson-notify-done-btn" id="lessonNotifyDoneBtn">Done</button>' +
        '</div>' +
      '</div>';

    // Hook events
    const closeBtn = modal.querySelector('#lessonNotifyCloseBtn');
    const doneBtn = modal.querySelector('#lessonNotifyDoneBtn');
    const backdrop = modal.querySelector('#lessonNotifyBackdrop');
    const readAllBtn = modal.querySelector('#lessonNotifyReadAllBtn');

    if (closeBtn) closeBtn.onclick = closeLessonNotifications;
    if (doneBtn) doneBtn.onclick = closeLessonNotifications;
    if (backdrop) backdrop.onclick = closeLessonNotifications;

    if (readAllBtn) {
      readAllBtn.onclick = () => {
        markAllNotificationsAsRead();
      };
    }

    modal.querySelectorAll('.lesson-notify-toggle').forEach(input => {
      input.onchange = (e) => {
        const key = input.dataset.prefKey;
        setNotificationSetting(key, input.checked);
      };
    });
  }

  function openLessonNotifications() {
    renderModalContent();
    const modal = ensureModalElement();
    modal.hidden = false;
    document.body.classList.add('has-modal-open');
    const closeBtn = modal.querySelector('#lessonNotifyCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function closeLessonNotifications() {
    const modal = document.getElementById('lessonNotificationsModal');
    if (modal) {
      modal.hidden = true;
    }
    document.body.classList.remove('has-modal-open');
  }

  // Global escape listener
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('lessonNotificationsModal');
      if (modal && !modal.hidden) {
        closeLessonNotifications();
      }
    }
  });

  window.openLessonNotifications = openLessonNotifications;
  window.closeLessonNotifications = closeLessonNotifications;
  window.getNotificationSettings = getNotificationSettings;
  window.markAllNotificationsAsRead = markAllNotificationsAsRead;
})();
