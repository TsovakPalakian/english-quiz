(function initLessonNotifications() {
  const PREF_KEYS = {
    lessonReminders: 'lumiscia-notify-lesson-reminders',
    dailyReview: 'lumiscia-notify-daily-review',
    audioAlerts: 'lumiscia-notify-sound'
  };
  const READ_KEY = 'lumiscia-notify-read-ts';
  const READ_IDS_KEY = 'lumiscia-notify-read-ids';
  const TIMING_KEY = 'lumiscia-notify-sound-alerts';
  const ANKI_DUE_KEY = 'lumiscia-anki-next-due';
  const DEFAULT_TIMINGS = [180, 60, 15, 5];

  const safeEsc = typeof esc === 'function' ? esc : (s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

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

  function getSoundAlertTimings() {
    try {
      const raw = localStorage.getItem(TIMING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
        }
      }
    } catch {}
    return [...DEFAULT_TIMINGS];
  }

  function saveSoundAlertTimings(arr) {
    try {
      localStorage.setItem(TIMING_KEY, JSON.stringify(arr));
    } catch {}
  }

  function formatAlertTiming(minutes) {
    if (minutes >= 60 && minutes % 60 === 0) {
      return (minutes / 60) + 'h before';
    }
    return minutes + 'm before';
  }

  function playChimeNotification() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const notes = [659.25, 830.61, 987.77];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.35);
      });
      setTimeout(() => { ctx.close().catch(() => {}); }, 1500);
    } catch {}
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

    // Anki cards FSRS reminders
    if (prefs.dailyReview) {
      let ankiInfo = null;
      try {
        const raw = localStorage.getItem(ANKI_DUE_KEY);
        if (raw) ankiInfo = JSON.parse(raw);
      } catch {}

      if (!ankiInfo && typeof curLesson !== 'undefined' && Array.isArray(curLesson?.cards)) {
        const fsrsCards = curLesson.cards.filter(c => c && (c.type === 'FSRS Flashcard' || c.quizType === 'FSRS Flashcard'));
        if (fsrsCards.length > 0) {
          ankiInfo = {
            count: fsrsCards.length,
            stage: 'Due tomorrow',
            timeDesc: 'tomorrow at 10:00'
          };
        }
      }

      if (ankiInfo) {
        list.push({
          id: 'anki-cards-spaced-repetition',
          kind: 'anki',
          name: 'Anki cards · Spaced repetition',
          stage: ankiInfo.stage || 'Due tomorrow',
          line: (ankiInfo.count || 1) + ' card due for essential review · Scheduled for ' + (ankiInfo.timeDesc || 'tomorrow at 10:00')
        });
      }
    }

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

  let bellAlertTimers = [];
  function stopBellAlertCycle() {
    bellAlertTimers.forEach(t => clearTimeout(t));
    bellAlertTimers = [];
    document.querySelectorAll('.shell-header-bell-btn').forEach(b => b.classList.remove('is-ringing'));
  }
  window.stopBellAlertCycle = stopBellAlertCycle;

  function triggerBellAlertCycle() {
    stopBellAlertCycle();
    const schedule = [
      { start: 0, duration: 1000 },
      { start: 3000, duration: 1000 },
      { start: 9000, duration: 1000 }
    ];
    schedule.forEach(({ start, duration }) => {
      const ringTimer = setTimeout(() => {
        document.querySelectorAll('.shell-header-bell-btn').forEach(b => b.classList.add('is-ringing'));
        playChimeNotification();
        const stopTimer = setTimeout(() => {
          document.querySelectorAll('.shell-header-bell-btn').forEach(b => b.classList.remove('is-ringing'));
        }, duration);
        bellAlertTimers.push(stopTimer);
      }, start);
      bellAlertTimers.push(ringTimer);
    });
  }

  function syncBellAndAvatarVisibility(unread) {
    const isUnread = unread > 0;
    document.documentElement.setAttribute('data-notify-unread', isUnread ? '1' : '0');
    document.querySelectorAll('.shell-header-bell-btn').forEach(b => {
      b.hidden = !isUnread;
    });
    document.querySelectorAll('.user-profile-pill-wrap').forEach(w => {
      w.hidden = isUnread;
    });
    if (isUnread) {
      triggerBellAlertCycle();
    } else {
      stopBellAlertCycle();
    }
  }
  window.syncBellAndAvatarVisibility = syncBellAndAvatarVisibility;

  function pillText(unread) {
    return unread > 0 ? (unread + ' active') : 'All read';
  }

  function showUnreadDot(unread) {
    syncBellAndAvatarVisibility(unread);
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
      '<button type="button" class="lesson-notify-card" data-notify-id="' + safeEsc(item.id) + '"' +
        (item.kind === 'anki' ? ' style="border-left: 3px solid var(--acc);"' : '') + '>' +
        '<span class="lesson-notify-card-top">' +
          '<span class="lesson-notify-card-title">' + safeEsc(item.name) + '</span>' +
          '<span class="lesson-notify-card-stage">' + safeEsc(item.stage) + '</span>' +
        '</span>' +
        '<span class="lesson-notify-card-desc">' + safeEsc(item.line) + '</span>' +
      '</button>'
    ).join('') : '<p class="lesson-notify-empty">No active reminders.</p>';

    const timings = getSoundAlertTimings();
    const chipsHtml = timings.map((m) =>
      '<span class="lesson-notify-chip">' +
        '🔔 ' + safeEsc(formatAlertTiming(m)) + ' ' +
        '<button type="button" class="lesson-notify-chip-del" data-timing-mins="' + safeEsc(String(m)) + '" aria-label="Remove alert">×</button>' +
      '</span>'
    ).join('');

    modal.innerHTML =
      '<div class="lesson-notifications-backdrop" id="lessonNotifyBackdrop"></div>' +
      '<div class="lesson-notifications-dialog" id="lessonNotifyDialog">' +
        '<div class="lesson-notify-head">' +
          '<div class="lesson-notify-head-title">' +
            '<svg class="lesson-notify-bell-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
            '<h2 id="lessonNotifyModalTitle">Lesson Notifications</h2>' +
            '<span class="lesson-notify-count-badge' + (unread ? '' : ' is-read') + '" id="lessonNotifyCountBadge">' + safeEsc(pillText(unread)) + '</span>' +
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
          '<div class="lesson-notify-timing-section" id="notifyAudioScheduleSection">' +
            '<div class="lesson-notify-section-title is-follow">SOUND ALERT TIMING</div>' +
            '<p class="lesson-notify-timing-note" style="margin-bottom: 8px;">Sound alert triggers before training starts:</p>' +
            '<div class="lesson-notify-chips">' + chipsHtml + '</div>' +
            '<div class="lesson-notify-adder">' +
              '<input type="number" class="lesson-notify-input" id="notifyNewAlertMinutes" min="1" max="1440" placeholder="e.g. 30" />' +
              '<select class="lesson-notify-select" id="notifyNewAlertUnit">' +
                '<option value="m">minutes before</option>' +
                '<option value="h">hours before</option>' +
              '</select>' +
              '<button type="button" class="lesson-notify-add-btn" id="notifyAddAlertBtn">+ Add alert</button>' +
            '</div>' +
          '</div>' +
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
        if (item.kind === 'anki') {
          if (typeof dayQuizMode === 'function') {
            dayQuizMode('fsrs');
          } else if (typeof startDayStudy === 'function') {
            startDayStudy();
          }
        } else if (item.kind === 'class' && typeof visit === 'function') {
          visit('groups');
        } else if (item.kind === 'material' && item.lessonId && typeof lmOpenLesson === 'function') {
          lmOpenLesson(item.lessonId);
        } else if ((item.kind === 'waiting' || item.kind === 'published') && item.examId && typeof visit === 'function') {
          examCurrentId = item.examId;
          visit('examblocks');
        }
      };
    });

    modal.querySelectorAll('.lesson-notify-toggle').forEach((input) => {
      input.onchange = () => {
        setNotificationSetting(input.dataset.prefKey, input.checked);
        if (input.dataset.prefKey === 'audioAlerts' && input.checked) {
          playChimeNotification();
        }
        renderModalContent({ touchDot: false });
      };
    });

    modal.querySelectorAll('.lesson-notify-chip-del').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const mins = Number(btn.getAttribute('data-timing-mins'));
        const current = getSoundAlertTimings().filter(m => m !== mins);
        saveSoundAlertTimings(current);
        renderModalContent({ touchDot: false });
      };
    });

    const addAlertBtn = modal.querySelector('#notifyAddAlertBtn');
    if (addAlertBtn) {
      addAlertBtn.onclick = () => {
        const input = modal.querySelector('#notifyNewAlertMinutes');
        const unitSelect = modal.querySelector('#notifyNewAlertUnit');
        const val = Number(input?.value);
        if (!val || val <= 0) {
          if (input) {
            input.focus();
            input.style.borderColor = 'var(--acc)';
          }
          return;
        }
        const unit = unitSelect?.value || 'm';
        const mins = unit === 'h' ? Math.round(val * 60) : Math.round(val);
        const current = getSoundAlertTimings();
        if (!current.includes(mins)) {
          current.push(mins);
          current.sort((a, b) => b - a);
          saveSoundAlertTimings(current);
          if (settings.audioAlerts) {
            playChimeNotification();
          }
        }
        renderModalContent({ touchDot: false });
      };
    }
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

  function setAnkiNextDue(info) {
    try {
      if (!info) localStorage.removeItem(ANKI_DUE_KEY);
      else localStorage.setItem(ANKI_DUE_KEY, JSON.stringify(info));
    } catch {}
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
  window.playChimeNotification = playChimeNotification;
  window.getSoundAlertTimings = getSoundAlertTimings;
  window.saveSoundAlertTimings = saveSoundAlertTimings;
  window.formatAlertTiming = formatAlertTiming;
  window.setAnkiNextDue = setAnkiNextDue;
})();
