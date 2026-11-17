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
    const prefs = getNotificationSettings();
    const today = (typeof lmToday === 'function') ? lmToday() : new Date().toISOString().slice(0, 10);

    if (prefs.lessonReminders && typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      classGroups.filter((group) => group && group.date === today && !group.hidden).forEach((group) => {
        list.push({
          id: 'lesson-today-' + (group.id || 'current'),
          type: 'lesson',
          open: 'classes',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
          title: 'Scheduled Class Today',
          desc: (group.title || 'Lesson group') + ' has an active session scheduled for today.',
          badge: 'Today',
          badgeClass: 'badge-today'
        });
      });
    }

    if (prefs.lessonReminders && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary?.materials)) {
      lmLibrary.materials.filter((item) => item && item.date === today && !item.hidden).forEach((item) => {
        list.push({
          id: 'material-today-' + item.id,
          type: 'lesson',
          lessonId: item.id,
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
          title: 'Lesson Material Today',
          desc: (item.title || 'Active material') + ' is assigned for today.',
          badge: 'Today',
          badgeClass: 'badge-today'
        });
      });
    }

    if (prefs.dailyReview && typeof examLoad === 'function') {
      examLoad().forEach((exam) => {
        const blocks = Array.isArray(exam?.blocks) ? exam.blocks : [];
        const waiting = exam?.instanceStatus === 'ready' || (!exam?.instanceStatus && blocks.some((block) => ['submitted', 'reviewing'].includes(block?.doc?.assessmentState || block?.assessmentState)));
        const published = exam?.instanceStatus === 'completed' || blocks.some((block) => (block?.doc?.assessmentState || block?.assessmentState) === 'published');
        if (waiting) {
          list.push({
            id: 'teacher-review-' + exam.id,
            type: 'review',
            examId: exam.id,
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
            title: 'Work is waiting for review',
            desc: exam.title || 'Exam',
            badge: 'Review',
            badgeClass: 'badge-review'
          });
        }
        if (published) {
          list.push({
            id: 'student-review-' + exam.id,
            type: 'review',
            examId: exam.id,
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>',
            title: 'Review published',
            desc: exam.title || 'Exam',
            badge: 'Review',
            badgeClass: 'badge-review'
          });
        }
      });
    }

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

    const itemsHtml = notifications.length ? notifications.map(item =>
      '<button type="button" class="lesson-notify-card" data-notify-id="' + esc(item.id) + '">' +
        '<div class="lesson-notify-card-icon ' + esc(item.type) + '">' + item.icon + '</div>' +
        '<div class="lesson-notify-card-body">' +
          '<div class="lesson-notify-card-top">' +
            '<span class="lesson-notify-card-title">' + esc(item.title) + '</span>' +
            '<span class="lesson-notify-badge ' + esc(item.badgeClass) + '">' + esc(item.badge) + '</span>' +
          '</div>' +
          '<p class="lesson-notify-card-desc">' + esc(item.desc) + '</p>' +
        '</div>' +
      '</button>'
    ).join('') : '<p class="lesson-notify-card-desc">No reminders.</p>';

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
                '<span>Hide or show today class and lesson cards</span>' +
              '</div>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="lessonReminders"' + (settings.lessonReminders ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref-row">' +
              '<div class="lesson-notify-pref-label">' +
                '<strong>Daily word review</strong>' +
                '<span>Hide or show review cards</span>' +
              '</div>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="dailyReview"' + (settings.dailyReview ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref-row">' +
              '<div class="lesson-notify-pref-label">' +
                '<strong>Audio alert sounds</strong>' +
                '<span>Stored on this device. It does not send an alert.</span>' +
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

    modal.querySelectorAll('.lesson-notify-card').forEach((card) => {
      card.onclick = () => {
        const item = notifications.find((entry) => entry.id === card.getAttribute('data-notify-id'));
        closeLessonNotifications();
        if (!item) return;
        if (item.lessonId && typeof lmOpenLesson === 'function') lmOpenLesson(item.lessonId);
        else if (item.examId && typeof visit === 'function') {
          examCurrentId = item.examId;
          visit('examblocks');
        } else if (item.open === 'classes' && typeof visit === 'function') visit('groups');
      };
    });

    modal.querySelectorAll('.lesson-notify-toggle').forEach(input => {
      input.onchange = (e) => {
        const key = input.dataset.prefKey;
        setNotificationSetting(key, input.checked);
        renderModalContent();
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
