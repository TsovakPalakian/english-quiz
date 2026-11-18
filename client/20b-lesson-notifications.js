(function initLessonNotifications() {
  const PREF_KEYS = {
    lessonReminders: 'lumiscia-notify-lesson-reminders',
    dailyReview: 'lumiscia-notify-daily-review',
    audioAlerts: 'lumiscia-notify-sound'
  };
  const READ_KEY = 'lumiscia-notify-read-ts';
  const READ_IDS_KEY = 'lumiscia-notify-read-ids';

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

  function notifyName(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
  }

  function reviewFlags(exam) {
    const blocks = Array.isArray(exam?.blocks) ? exam.blocks : [];
    const stateOf = (block) => block?.doc?.assessmentState || block?.assessmentState;
    const submitted = exam?.instanceStatus === 'ready' || (!exam?.instanceStatus && blocks.some((block) => ['submitted', 'reviewing'].includes(stateOf(block))));
    const published = exam?.instanceStatus === 'completed' || blocks.some((block) => stateOf(block) === 'published');
    return { waiting: submitted && !published, published };
  }

  function getActiveNotifications() {
    const list = [];
    if (typeof viewAccount !== 'undefined' && viewAccount) return list;
    const prefs = getNotificationSettings();
    const today = (typeof lmToday === 'function') ? lmToday() : new Date().toISOString().slice(0, 10);
    const teacher = typeof isTeacher === 'function' && isTeacher();

    if (prefs.lessonReminders && typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      classGroups.filter((group) => group && group.date === today && !group.hidden).forEach((group) => {
        list.push({
          id: 'lesson-today-' + (group.id || 'current'),
          kind: 'class',
          name: notifyName(group.title, 'Lesson group'),
          stage: 'Today',
          line: 'Class today'
        });
      });
    }

    if (prefs.lessonReminders && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary?.materials)) {
      lmLibrary.materials.filter((item) => item && item.date === today && !item.hidden).forEach((item) => {
        list.push({
          id: 'material-today-' + (item.id || 'current'),
          kind: 'material',
          lessonId: item.id,
          name: notifyName(item.title, 'Active material'),
          stage: 'Today',
          line: 'Material today'
        });
      });
    }

    if (prefs.dailyReview && typeof examLoad === 'function') {
      examLoad().forEach((exam) => {
        const flags = reviewFlags(exam);
        if (teacher && flags.waiting) {
          list.push({
            id: 'teacher-review-' + (exam.id || 'current'),
            kind: 'waiting',
            examId: exam.id,
            name: notifyName(exam.title, 'Exam'),
            stage: 'Waiting',
            line: 'Waiting for review'
          });
        }
        if (!teacher && flags.published) {
          list.push({
            id: 'student-review-' + (exam.id || 'current'),
            kind: 'published',
            examId: exam.id,
            name: notifyName(exam.title, 'Exam'),
            stage: 'Published',
            line: 'Review published'
          });
        }
      });
    }

    return list;
  }

  function markedIds() {
    try {
      const raw = JSON.parse(localStorage.getItem(READ_IDS_KEY) || 'null');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set();
    }
  }

  function unreadCount(list) {
    let marked = false;
    try { marked = !!localStorage.getItem(READ_KEY); } catch {}
    if (!marked) return list.length;
    const seen = markedIds();
    return list.filter((item) => !seen.has(item.id)).length;
  }

  function pillText(unread) {
    return unread > 0 ? (unread + ' active') : 'All read';
  }

  function showUnreadDot(unread) {
    document.documentElement.setAttribute('data-notify-unread', unread > 0 ? '1' : '0');
  }

  function markAllNotificationsAsRead(list) {
    if (!list.length) return;
    try {
      localStorage.setItem(READ_KEY, String(Date.now()));
      localStorage.setItem(READ_IDS_KEY, JSON.stringify(list.map((item) => item.id)));
    } catch {}
    showUnreadDot(0);
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

  function renderModalContent(options) {
    const modal = ensureModalElement();
    const notifications = getActiveNotifications();
    const settings = getNotificationSettings();
    const unread = unreadCount(notifications);
    const touchDot = !options || options.touchDot !== false;
    if (touchDot) showUnreadDot(unread);

    const itemsHtml = notifications.length ? notifications.map((item) =>
      '<button type="button" class="lesson-notify-card" data-notify-id="' + esc(item.id) + '">' +
        '<span class="lesson-notify-card-top">' +
          '<span class="lesson-notify-card-title">' + esc(item.name) + '</span>' +
          '<span class="lesson-notify-card-stage">' + esc(item.stage) + '</span>' +
        '</span>' +
        '<span class="lesson-notify-card-desc">' + esc(item.line) + '</span>' +
      '</button>'
    ).join('') : '<p class="lesson-notify-empty">No active reminders.</p>';

    modal.innerHTML =
      '<div class="lesson-notifications-backdrop" id="lessonNotifyBackdrop"></div>' +
      '<div class="lesson-notifications-dialog" id="lessonNotifyDialog">' +
        '<div class="lesson-notify-head">' +
          '<div class="lesson-notify-head-title">' +
            '<svg class="lesson-notify-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '<h2 id="lessonNotifyModalTitle">Lesson Notifications</h2>' +
            '<span class="lesson-notify-count-badge' + (unread ? '' : ' is-read') + '" id="lessonNotifyCountBadge">' + esc(pillText(unread)) + '</span>' +
          '</div>' +
          '<button type="button" class="lesson-notify-close-btn" id="lessonNotifyCloseBtn" aria-label="Close notifications">×</button>' +
        '</div>' +
        '<div class="lesson-notify-scroll">' +
          '<div class="lesson-notify-section-title">ACTIVE REMINDERS</div>' +
          '<div class="lesson-notify-list">' + itemsHtml + '</div>' +
          '<div class="lesson-notify-section-title is-follow">NOTIFICATION PREFERENCES</div>' +
          '<div class="lesson-notify-settings">' +
            '<label class="lesson-notify-pref">' +
              '<span class="lesson-notify-pref-name">Today</span>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="lessonReminders"' + (settings.lessonReminders ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref">' +
              '<span class="lesson-notify-pref-name">Reviews</span>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="dailyReview"' + (settings.dailyReview ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
            '<label class="lesson-notify-pref">' +
              '<span class="lesson-notify-pref-name">Sound</span>' +
              '<input type="checkbox" class="lesson-notify-toggle" data-pref-key="audioAlerts"' + (settings.audioAlerts ? ' checked' : '') + ' />' +
              '<span class="lesson-notify-switch"></span>' +
            '</label>' +
          '</div>' +
          '<p class="lesson-notify-sound-note">Sound stays on this device.</p>' +
        '</div>' +
        '<div class="lesson-notify-foot">' +
          '<button type="button" class="btn lesson-notify-read-all-btn" id="lessonNotifyReadAllBtn">Mark all as read</button>' +
          '<button type="button" class="btn primary lesson-notify-done-btn" id="lessonNotifyDoneBtn">Done</button>' +
        '</div>' +
      '</div>';

    const closeBtn = modal.querySelector('#lessonNotifyCloseBtn');
    const doneBtn = modal.querySelector('#lessonNotifyDoneBtn');
    const backdrop = modal.querySelector('#lessonNotifyBackdrop');
    const readAllBtn = modal.querySelector('#lessonNotifyReadAllBtn');
    if (closeBtn) closeBtn.onclick = closeLessonNotifications;
    if (doneBtn) doneBtn.onclick = closeLessonNotifications;
    if (backdrop) backdrop.onclick = closeLessonNotifications;
    if (readAllBtn) {
      readAllBtn.onclick = () => {
        markAllNotificationsAsRead(notifications);
      };
    }

    modal.querySelectorAll('.lesson-notify-card').forEach((card) => {
      card.onclick = () => {
        const item = notifications.find((entry) => entry.id === card.getAttribute('data-notify-id'));
        closeLessonNotifications();
        if (!item) return;
        if (item.kind === 'class' && typeof visit === 'function') visit('groups');
        else if (item.kind === 'material' && item.lessonId && typeof lmOpenLesson === 'function') lmOpenLesson(item.lessonId);
        else if ((item.kind === 'waiting' || item.kind === 'published') && item.examId && typeof visit === 'function') {
          examCurrentId = item.examId;
          visit('examblocks');
        }
      };
    });

    modal.querySelectorAll('.lesson-notify-toggle').forEach((input) => {
      input.onchange = () => {
        setNotificationSetting(input.dataset.prefKey, input.checked);
        renderModalContent({ touchDot: false });
      };
    });
  }

  function openLessonNotifications() {
    renderModalContent({ touchDot: true });
    const modal = ensureModalElement();
    modal.hidden = false;
    document.body.classList.add('has-modal-open');
    const closeBtn = modal.querySelector('#lessonNotifyCloseBtn');
    if (closeBtn) closeBtn.focus();
  }

  function closeLessonNotifications() {
    const modal = document.getElementById('lessonNotificationsModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('has-modal-open');
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('lessonNotificationsModal');
      if (modal && !modal.hidden) closeLessonNotifications();
    }
  });

  window.openLessonNotifications = openLessonNotifications;
  window.closeLessonNotifications = closeLessonNotifications;
  window.getNotificationSettings = getNotificationSettings;
  window.markAllNotificationsAsRead = () => markAllNotificationsAsRead(getActiveNotifications());
})();
