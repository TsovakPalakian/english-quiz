// Group Calendar & Attendance interactive component matching the Dark Minimalist reference.
(() => {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function dispatchCalendarChat(groupId, text, options) {
    if (typeof window.sendGroupChatMessage !== 'function') throw new Error('Chat is unavailable.');
    const res = await window.sendGroupChatMessage(groupId, text, options);
    if (!res || !(res.id || res.success || res.message || res.roomId)) throw new Error('Message dispatch unconfirmed');
    return res;
  }

  const groupWidgetStates = new Map();

  function getMonthData(state, monthKey) {
    if (!state || typeof state !== 'object') {
      return {
        lessonDates: new Set(),
        attendance: {},
        paymentDeadline: '',
        paymentRequisites: '',
        studentPayments: {},
        scheduleData: {},
        reportingClosed: false,
        revision: 0,
        loaded: false
      };
    }
    if (!state.monthCache) state.monthCache = new Map();
    if (!state.monthCache.has(monthKey)) {
      state.monthCache.set(monthKey, {
        lessonDates: new Set(),
        attendance: {},
        paymentDeadline: '',
        paymentRequisites: '',
        studentPayments: {},
        scheduleData: {},
        reportingClosed: false,
        revision: 0,
        loaded: false
      });
    }
    return state.monthCache.get(monthKey);
  }

  function getGroupState(groupId, groupTitle) {
    if (!groupWidgetStates.has(groupId)) {
      const now = new Date();
      const year = now.getFullYear();
      const monthIndex = now.getMonth();
      const selectedDate = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const initialMonthKey = year + '-' + String(monthIndex + 1).padStart(2, '0');
      const monthCache = new Map();
      monthCache.set(initialMonthKey, {
        lessonDates: new Set(),
        attendance: {},
        paymentDeadline: '',
        paymentRequisites: '',
        studentPayments: {},
        scheduleData: {},
        revision: 0,
        loaded: false
      });
      groupWidgetStates.set(groupId, {
        year,
        monthIndex,
        selectedDate,
        activeTab: 'calendar',
        monthCache,
        groupTitle: groupTitle || 'B1 Group'
      });
    }
    const state = groupWidgetStates.get(groupId);
    if (groupTitle && state.groupTitle !== groupTitle) {
      state.groupTitle = groupTitle;
    }
    return state;
  }

  function getGroupStudents(groupId) {
    let list = [];
    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => String(g.id) === String(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => String(g.id) === String(groupId));
    }
    if (grp && typeof groupDirectoryPeople === 'function') {
      const people = groupDirectoryPeople([grp], false);
      if (Array.isArray(people) && people.length) {
        list = people.map(u => ({ id: u.id, name: u.name || u.login || 'Student', login: u.login || '' }));
      }
    }
    if (!list.length && typeof groupDirectory !== 'undefined' && groupDirectory && Array.isArray(groupDirectory.members) && Array.isArray(groupDirectory.users)) {
      const memberIds = new Set(groupDirectory.members.filter(m => String(m.groupId) === String(groupId)).map(m => String(m.accountId)));
      const filtered = groupDirectory.users.filter(u => memberIds.has(String(u.id)) && u.role === 'USER' && !u.hidden);
      if (filtered.length) {
        list = filtered.map(u => ({ id: u.id, name: u.name || u.login || 'Student', login: u.login || '' }));
      }
    }
    if (!list.length && typeof adminAccounts !== 'undefined' && Array.isArray(adminAccounts) &&
        typeof adminMembers !== 'undefined' && Array.isArray(adminMembers)) {
      const filtered = adminAccounts.filter(u => u.role === 'USER' && !u.hidden && adminMembers.some(m => String(m.accountId) === String(u.id) && String(m.groupId) === String(groupId)));
      if (filtered.length) {
        list = filtered.map(u => ({ id: u.id, name: u.name || u.login || 'Student', login: u.login || '' }));
      }
    }
    return list.slice().sort((a, b) => (a.name || a.login || '').localeCompare(b.name || b.login || '', undefined, { sensitivity: 'base' }));
  }

  function calculateAttendancePct(lessonDates, students, attendance) {
    if (!lessonDates || !(lessonDates.size || lessonDates.length) || !students || !students.length || !attendance) {
      return 0;
    }
    let presents = 0;
    let marked = 0;
    for (const s of students) {
      const datesMap = attendance[s.id] || attendance['u' + s.id] || attendance['s' + s.id];
      if (!datesMap || typeof datesMap !== 'object') continue;
      for (const d of lessonDates) {
        if (datesMap[d] === 'present') { presents++; marked++; }
        else if (datesMap[d] === 'absent') { marked++; }
      }
    }
    if (!marked) {
      return 0;
    }
    return Math.round((presents / marked) * 100);
  }

  function getLessonsForDate(groupId, dateStr) {
    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    const lessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];
    const matches = [];
    if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
      for (const m of lmLibrary.materials) {
        const isGroupLesson = lessonIds.includes(String(m.id)) || Number(m.groupId) === Number(groupId);
        if (isGroupLesson) {
          const hasDate = m.date === dateStr || (Array.isArray(m.dates) && m.dates.includes(dateStr));
          if (hasDate) {
            matches.push({ id: m.id, material: m, title: m.title || 'Lesson', time: m.time || '' });
          }
        }
      }
    }
    if (matches.length === 0 && typeof groupWidgetStates !== 'undefined') {
      const widgetState = groupWidgetStates.get(groupId) || groupWidgetStates.get(Number(groupId));
      if (widgetState && widgetState.monthCache) {
        const mKey = dateStr.slice(0, 7);
        const mData = widgetState.monthCache.get(mKey);
        const sched = mData && mData.scheduleData ? mData.scheduleData[dateStr] : null;
        if (sched && sched.materialId && (sched.published || sched.active)) {
          const mat = lmLibrary && Array.isArray(lmLibrary.materials)
            ? lmLibrary.materials.find(m => String(m.id) === String(sched.materialId))
            : null;
          if (mat) {
            matches.push({ id: mat.id, material: mat, title: mat.title || 'Lesson', time: sched.startTime || mat.time || '' });
          }
        }
      }
    }
    return matches;
  }

  function getExamsForDate(groupId, dateStr) {
    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    const examIds = grp && Array.isArray(grp.examIds) ? grp.examIds.map(String) : [];
    const matches = [];
    if (typeof examShown === 'function') {
      const exams = examShown();
      if (Array.isArray(exams)) {
        for (const e of exams) {
          if ((examIds.includes(String(e.id)) || Number(e.groupId) === Number(groupId)) && e.date === dateStr) {
            matches.push({ id: e.id, exam: e, title: e.title || 'Exam', time: e.time || '' });
          }
        }
      }
    }
    return matches;
  }

  function showEventChoiceDialog(dateStr, lessons, exams, options) {
    const existing = document.getElementById('gcwChoiceDialog');
    if (existing) existing.remove();

    const opts = options || {};
    const canEdit = opts.canEdit !== undefined ? opts.canEdit : (typeof isTeacher === 'function' && isTeacher() && (typeof viewAccount === 'undefined' || !viewAccount));

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwChoiceDialog';
    dialog.className = 'gcw-choice-dialog';

    let itemsHtml = '';
    lessons.forEach((l, idx) => {
      const title = l.title || ('Lesson ' + (idx + 1));
      const timeInfo = l.time ? '<small>' + esc(l.time) + '</small>' : '';
      itemsHtml +=
        '<button type="button" class="gcw-choice-item" data-action="open-lesson" data-id="' + esc(l.id) + '">' +
          '<span class="gcw-choice-badge is-lesson">Lesson</span>' +
          '<div class="gcw-choice-info"><b>' + esc(title) + '</b>' + timeInfo + '</div>' +
          '<span class="gcw-choice-arrow">Open →</span>' +
        '</button>';
    });
    exams.forEach((ex, idx) => {
      const title = ex.title || ('Exam ' + (idx + 1));
      const timeInfo = ex.time ? '<small>' + esc(ex.time) + '</small>' : '';
      itemsHtml +=
        '<button type="button" class="gcw-choice-item" data-action="open-exam" data-id="' + esc(ex.id) + '">' +
          '<span class="gcw-choice-badge is-exam">Exam</span>' +
          '<div class="gcw-choice-info"><b>' + esc(title) + '</b>' + timeInfo + '</div>' +
          '<span class="gcw-choice-arrow">Open →</span>' +
        '</button>';
    });

    let footHtml = '';
    if (!canEdit && opts.groupId) {
      footHtml =
        '<div style="margin-top:12px; border-top:1px solid var(--saas-border, #e2e8f0); padding-top:10px;">' +
          '<button type="button" class="btn secondary" id="gcwChoiceAbsenceBtn" style="width:100%; color:#b91c1c; border-color:#fca5a5; font-size:13px;">⚠️ Report absence for this date</button>' +
        '</div>';
    }

    dialog.innerHTML =
      '<div class="gcw-choice-head">' +
        '<h3>Activities on ' + esc(dateStr) + '</h3>' +
        '<button type="button" class="gcw-choice-close-btn" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="gcw-choice-list">' + itemsHtml + '</div>' +
      footHtml;

    document.body.appendChild(dialog);

    const closeDialog = () => {
      if (typeof dialog.close === 'function') dialog.close();
      dialog.remove();
    };

    const closeBtn = dialog.querySelector('.gcw-choice-close-btn');
    if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeDialog(); };

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) closeDialog();
    });

    const choiceAbsenceBtn = dialog.querySelector('#gcwChoiceAbsenceBtn');
    if (choiceAbsenceBtn) {
      choiceAbsenceBtn.onclick = (e) => {
        e.stopPropagation();
        closeDialog();
        showStudentLessonDialog(opts.groupId, dateStr, lessons[0] || null, exams[0] || null, opts.state, opts.container);
      };
    }

    dialog.querySelectorAll('.gcw-choice-item').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        closeDialog();
        if (action === 'open-lesson' && typeof window.lmOpenLesson === 'function') {
          window.lmOpenLesson(id);
        } else if (action === 'open-exam') {
          if (typeof examOpenSelected === 'function') {
            void examOpenSelected(id);
          } else if (typeof window.examOpenSelected === 'function') {
            void window.examOpenSelected(id);
          }
        }
      };
    });

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function handleDateItemClick(groupId, dateStr, isScheduled, anchorEl, canEdit, onCancelDate, state, container) {
    const monthKey = state ? (state.year + '-' + String(state.monthIndex + 1).padStart(2, '0')) : dateStr.slice(0, 7);
    const monthData = state ? getMonthData(state, monthKey) : null;
    const isPaymentDeadline = monthData && monthData.paymentDeadline === dateStr;

    const lessons = getLessonsForDate(groupId, dateStr);
    const exams = getExamsForDate(groupId, dateStr);
    const total = lessons.length + exams.length;

    if (!canEdit && isPaymentDeadline && total === 0) {
      showStudentPaymentDialog(groupId, dateStr, state, container);
      return;
    }

    if (!canEdit && (isScheduled || total > 0)) {
      if (total > 1) {
        showEventChoiceDialog(dateStr, lessons, exams, { canEdit: false, groupId, state, container });
      } else {
        showStudentLessonDialog(groupId, dateStr, lessons[0] || null, exams[0] || null, state, container);
      }
      return;
    }

    if (total > 1) {
      showEventChoiceDialog(dateStr, lessons, exams, { canEdit: true, groupId, state, container });
    } else if (total === 1) {
      if (lessons.length === 1 && typeof window.lmOpenLesson === 'function') {
        window.lmOpenLesson(lessons[0].id);
      } else if (exams.length === 1) {
        if (typeof examOpenSelected === 'function') {
          void examOpenSelected(exams[0].id);
        } else if (typeof window.examOpenSelected === 'function') {
          void window.examOpenSelected(exams[0].id);
        }
      }
    } else if (isScheduled) {
      if (canEdit) {
        showLessonSchedulerModal(groupId, dateStr, state, container);
      } else {
        showGcwRedAlert(anchorEl, 'No lesson available for this date', onCancelDate);
      }
    } else if (isPaymentDeadline) {
      if (canEdit) {
        showPaymentDeadlineModal(groupId, dateStr, state, container);
      } else {
        showStudentPaymentDialog(groupId, dateStr, state, container);
      }
    } else if (!canEdit) {
      showGcwRedAlert(anchorEl, 'No lesson scheduled for this date');
    }
  }

  function showGcwRedAlert(anchorEl, message, onCancelDate) {
    if (!anchorEl) return;
    const existing = document.querySelector('.gcw-alert-tooltip');
    if (existing) {
      if (existing.dataset.timer) clearTimeout(Number(existing.dataset.timer));
      const parent = existing.parentElement;
      if (parent) parent.classList.remove('has-alert');
      existing.remove();
    }
    const alert = document.createElement('div');
    alert.className = 'gcw-alert-tooltip';
    alert.setAttribute('role', 'alert');
    let inner = '<span class="gcw-alert-msg">' + message + '</span>';
    if (typeof onCancelDate === 'function') {
      inner += '<button type="button" class="gcw-alert-cancel-btn">Cancel date</button>';
    }
    alert.innerHTML = inner;
    anchorEl.style.position = 'relative';
    anchorEl.classList.add('has-alert');
    anchorEl.appendChild(alert);

    if (typeof onCancelDate === 'function') {
      const cancelBtn = alert.querySelector('.gcw-alert-cancel-btn');
      if (cancelBtn) {
        cancelBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          anchorEl.classList.remove('has-alert');
          alert.remove();
          onCancelDate();
        };
      }
    }

    const timer = setTimeout(() => {
      alert.classList.add('is-hiding');
      setTimeout(() => {
        anchorEl.classList.remove('has-alert');
        alert.remove();
      }, 200);
    }, 2500);
    alert.dataset.timer = String(timer);
  }

  async function loadGroupAttendanceData(groupId, state) {
    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    try {
      const url = '/api/groups/attendance?groupId=' + groupId + '&month=' + encodeURIComponent(monthKey);
      const res = await (typeof accountFetch === 'function' ? accountFetch(url, { quietBug: true }) : fetch(url, { credentials: 'include' }).then(r => r.ok ? r.json() : null));
      if (res && res.exists) {
        if (Array.isArray(res.lessonDates)) {
          monthData.lessonDates = new Set(res.lessonDates.filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')));
        }
        if (res.attendance && typeof res.attendance === 'object') {
          const cleanAtt = {};
          for (const [stId, dates] of Object.entries(res.attendance)) {
            if (dates && typeof dates === 'object') {
              cleanAtt[stId] = {};
              for (const [d, val] of Object.entries(dates)) {
                if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
                  cleanAtt[stId][d] = val;
                }
              }
            }
          }
          monthData.attendance = cleanAtt;
        }
        monthData.paymentDeadline = String(res.paymentDeadline || '');
        monthData.paymentRequisites = String(res.paymentRequisites || '');
        monthData.studentPayments = (res.studentPayments && typeof res.studentPayments === 'object') ? res.studentPayments : {};
        if (res.pricePerLesson) {
          monthData.pricePerLesson = Number(res.pricePerLesson);
        }
        if (res.scheduleData && typeof res.scheduleData === 'object') {
          monthData.scheduleData = res.scheduleData;
        } else if (!monthData.scheduleData) {
          monthData.scheduleData = {};
        }
        monthData.reportingClosed = Boolean(res.reportingClosed || (res.scheduleData && res.scheduleData.reportingClosed));
        monthData.revision = Number(res.revision) || 0;
      }
    } catch {
      // Retain existing state in offline / mock mode
    }
    monthData.loaded = true;
  }

  let saveAttendanceChain = Promise.resolve();

  async function saveGroupAttendanceData(groupId, state, container) {
    saveAttendanceChain = saveAttendanceChain.catch(() => {}).then(async () => {
      let actualState = state;
      if (typeof state === 'number' || !state || !state.monthCache) {
        actualState = groupWidgetStates.get(groupId) || groupWidgetStates.get(Number(groupId)) || state;
      }
      if (!actualState || typeof actualState !== 'object') return;
      const monthKey = actualState.year + '-' + String(actualState.monthIndex + 1).padStart(2, '0');
      const monthData = getMonthData(actualState, monthKey);
      const filteredDates = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();
      const filteredAttendance = {};
      if (monthData.attendance && typeof monthData.attendance === 'object') {
        for (const [stId, dates] of Object.entries(monthData.attendance)) {
          if (dates && typeof dates === 'object') {
            filteredAttendance[stId] = {};
            for (const [d, mark] of Object.entries(dates)) {
              if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
                filteredAttendance[stId][d] = mark;
              }
            }
          }
        }
      }
      const payload = {
        groupId,
        month: monthKey,
        monthKey,
        lessonDates: filteredDates,
        attendance: filteredAttendance,
        pricePerLesson: Number(monthData.pricePerLesson) || 30,
        currency: monthData.currency || 'BYN',
        paymentDeadline: monthData.paymentDeadline || '',
        paymentRequisites: monthData.paymentRequisites || '',
        studentPayments: monthData.studentPayments || {},
        scheduleData: {
          ...(monthData.scheduleData || {}),
          reportingClosed: Boolean(monthData.reportingClosed)
        },
        reportingClosed: Boolean(monthData.reportingClosed),
        expectedRevision: monthData.revision
      };
      const url = '/api/groups/attendance';
      try {
        const res = await (typeof accountFetch === 'function'
          ? accountFetch(url, { method: 'POST', body: JSON.stringify(payload), quietBug: true })
          : fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) }).then(r => r.json()));
        if (res && res.revision) {
          monthData.revision = res.revision;
        }
      } catch (err) {
        if (err && err.status === 409) {
          try {
            const reloadUrl = '/api/groups/attendance?groupId=' + groupId + '&month=' + encodeURIComponent(monthKey);
            const latest = await (typeof accountFetch === 'function'
              ? accountFetch(reloadUrl, { quietBug: true })
              : fetch(reloadUrl, { credentials: 'include' }).then(r => r.ok ? r.json() : null));
            if (latest && latest.exists) {
              if (Array.isArray(latest.lessonDates)) {
                for (const d of latest.lessonDates) {
                  if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
                    monthData.lessonDates.add(d);
                  }
                }
              }
              const mergedAttendance = {};
              if (latest.attendance && typeof latest.attendance === 'object') {
                for (const [stId, dates] of Object.entries(latest.attendance)) {
                  if (dates && typeof dates === 'object') {
                    mergedAttendance[stId] = {};
                    for (const [d, mark] of Object.entries(dates)) {
                      if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
                        mergedAttendance[stId][d] = mark;
                      }
                    }
                  }
                }
              }
              if (monthData.attendance && typeof monthData.attendance === 'object') {
                for (const [stId, dates] of Object.entries(monthData.attendance)) {
                  if (!mergedAttendance[stId]) mergedAttendance[stId] = {};
                  if (dates && typeof dates === 'object') {
                    for (const [d, mark] of Object.entries(dates)) {
                      if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
                        if (mark === 'unmarked') {
                          delete mergedAttendance[stId][d];
                        } else {
                          mergedAttendance[stId][d] = mark;
                        }
                      }
                    }
                  }
                }
              }
              monthData.attendance = mergedAttendance;
              monthData.revision = Number(latest.revision) || 0;
              const retryDates = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();
              const retryPayload = {
                groupId,
                month: monthKey,
                monthKey,
                lessonDates: retryDates,
                attendance: monthData.attendance,
                pricePerLesson: 30,
                currency: 'BYN',
                paymentDeadline: '',
                expectedRevision: monthData.revision
              };
              const retryRes = await (typeof accountFetch === 'function'
                ? accountFetch(url, { method: 'POST', body: JSON.stringify(retryPayload), quietBug: true })
                : fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(retryPayload) }).then(r => r.json()));
              if (retryRes && retryRes.revision) {
                monthData.revision = retryRes.revision;
              }
              if (container && container.isConnected) {
                paintGroupCalendarWidget(container, groupId, state);
              }
            }
          } catch {
            // Retain local state
          }
        }
      }
    });
    return saveAttendanceChain;
  }

  window.isCurrentTimeInScheduledLesson = function() {
    try {
      const today = (typeof lmToday === 'function') ? lmToday() : new Date().toISOString().slice(0, 10);
      const monthKey = today.slice(0, 7);
      for (const state of groupWidgetStates.values()) {
        if (!state || !state.monthCache) continue;
        const monthData = state.monthCache.get(monthKey);
        if (monthData && monthData.scheduleData && monthData.scheduleData[today]) {
          const item = monthData.scheduleData[today];
          if (item && item.startTime) {
            const parts = item.startTime.split(':').map(Number);
            const duration = Number(item.durationMinutes) || 60;
            const now = new Date();
            const start = new Date(now);
            start.setHours(parts[0], parts[1], 0, 0);
            const end = new Date(start.getTime() + duration * 60 * 1000);
            if (now >= start && now <= end) return true;
          }
        }
      }
    } catch {}
    return false;
  };

  window.renderGroupCalendarWidget = function(container, groupId, groupTitle) {
    if (!container) return;
    const gId = Number(groupId);
    if (!Number.isSafeInteger(gId) || gId <= 0) return;

    const state = getGroupState(gId, groupTitle);
    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);

    if (typeof loadGroupDirectory === 'function' && typeof groupDirectoryReady === 'function' && !groupDirectoryReady()) {
      loadGroupDirectory().then(() => {
        if (container.isConnected) {
          paintGroupCalendarWidget(container, gId, state);
        }
      });
    }

    if (!monthData.loaded) {
      loadGroupAttendanceData(gId, state).then(() => {
        if (container.isConnected) {
          paintGroupCalendarWidget(container, gId, state);
        }
      });
    }

    paintGroupCalendarWidget(container, gId, state);
  };

  function paintGroupCalendarWidget(container, groupId, state) {
    const canEdit = typeof isTeacher === 'function' && isTeacher() && (typeof viewAccount === 'undefined' || !viewAccount);
    const students = getGroupStudents(groupId);
    const studentCount = students.length;

    const monthName = MONTH_NAMES[state.monthIndex];
    const year = state.year;
    const monthKey = year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);

    // Combine scheduled dates and lmLibrary lesson dates for current month
    const monthLessonDates = new Set();
    for (const d of monthData.lessonDates) {
      if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
        monthLessonDates.add(d);
      }
    }
    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    const lessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];
    if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
      for (const m of lmLibrary.materials) {
        if ((lessonIds.includes(String(m.id)) || Number(m.groupId) === Number(groupId)) && typeof m.date === 'string' && m.date.startsWith(monthKey + '-')) {
          monthLessonDates.add(m.date);
        }
      }
    }
    const lessonCount = monthLessonDates.size;

    // Calculate exams for this month
    const monthExamDates = new Set();
    const examIds = grp && Array.isArray(grp.examIds) ? grp.examIds.map(String) : [];
    if (typeof examShown === 'function') {
      const exams = examShown();
      if (Array.isArray(exams)) {
        for (const e of exams) {
          if ((examIds.includes(String(e.id)) || Number(e.groupId) === Number(groupId)) && typeof e.date === 'string' && e.date.startsWith(monthKey + '-')) {
            monthExamDates.add(e.id || e.date);
          }
        }
      }
    }
    const examCount = monthExamDates.size;

    const attendancePct = calculateAttendancePct(monthLessonDates, students, monthData.attendance);

    // Calendar Grid Days Calculation
    const daysInMonth = new Date(year, state.monthIndex + 1, 0).getDate();
    const firstDayDow = (new Date(year, state.monthIndex, 1).getDay() + 6) % 7; // Monday = 0
    const sortedMonthLessons = Array.from(monthLessonDates).sort();

    let gridHtml = '';
    for (const wd of WEEKDAYS) {
      gridHtml += '<div class="gcw-weekday">' + wd + '</div>';
    }
    for (let i = 0; i < firstDayDow; i++) {
      gridHtml += '<div class="gcw-day-empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = monthKey + '-' + String(d).padStart(2, '0');
      const isScheduled = monthData.lessonDates.has(dateStr);
      const isSelected = state.selectedDate === dateStr;
      const roClass = canEdit ? '' : ' is-readonly';
      const lessons = getLessonsForDate(groupId, dateStr);
      const exams = getExamsForDate(groupId, dateStr);

      const hasLesson = lessons.length > 0;
      const hasExam = exams.length > 0;
      const isGreen = Boolean(hasLesson && isScheduled);
      const isBlue = Boolean(hasLesson && !isScheduled);
      const isRed = Boolean(!hasLesson && isScheduled);
      const isOrange = Boolean(hasExam);

      const isPaymentDeadline = monthData.paymentDeadline === dateStr;

      let dotsHtml = '';
      if (isGreen) dotsHtml += '<span class="gcw-dot is-green"></span>';
      if (isBlue) dotsHtml += '<span class="gcw-dot is-blue"></span>';
      if (isRed) dotsHtml += '<span class="gcw-dot is-red"></span>';
      if (isOrange) dotsHtml += '<span class="gcw-dot is-orange"></span>';
      if (isPaymentDeadline) dotsHtml += '<span class="gcw-dot is-payment" title="Payment Due"></span>';

      const tooltipParts = [];
      const totalEvents = lessons.length + exams.length;
      if (lessons.length) {
        lessons.forEach(l => {
          const title = (l.material && l.material.title) || (isScheduled ? ('Lesson ' + (sortedMonthLessons.indexOf(dateStr) + 1)) : 'Lesson');
          const cleanTitle = title.startsWith('Lesson') ? title : ('Lesson: ' + title);
          tooltipParts.push((totalEvents > 1 ? (tooltipParts.length + 1) + '. ' : '') + cleanTitle);
        });
      } else if (isScheduled) {
        const sched = (monthData.scheduleData && monthData.scheduleData[dateStr]) || null;
        let schedMatTitle = '';
        if (sched && sched.materialId && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
          const foundMat = lmLibrary.materials.find(m => String(m.id) === String(sched.materialId));
          if (foundMat && foundMat.title) {
            schedMatTitle = foundMat.title;
          }
        }
        if (schedMatTitle) {
          tooltipParts.push('Lesson: ' + schedMatTitle + ' (Draft)');
        } else {
          tooltipParts.push('Lesson ' + (sortedMonthLessons.indexOf(dateStr) + 1));
        }
      }
      if (exams.length) {
        exams.forEach(ex => {
          const cleanTitle = ex.title ? ('Exam: ' + ex.title) : 'Exam';
          tooltipParts.push((totalEvents > 1 ? (tooltipParts.length + 1) + '. ' : '') + cleanTitle);
        });
      }
      if (isPaymentDeadline) {
        tooltipParts.push('💳 Payment Deadline');
      }
      if (monthData.scheduleData && monthData.scheduleData[dateStr]) {
        const sched = monthData.scheduleData[dateStr];
        if (sched && sched.startTime) {
          const endT = formatEndTime(sched.startTime, sched.durationMinutes || 60);
          tooltipParts.push('🕒 ' + sched.startTime + (endT ? ' – ' + endT : '') + (sched.durationMinutes ? ' (' + sched.durationMinutes + ' min)' : ''));
        }
      }

      const tooltip = tooltipParts.join('\n');
      const tooltipAttr = tooltip ? (' data-gcw-tooltip="' + esc(tooltip) + '"') : '';
      const ariaLabel = tooltip ? tooltip.replace(/\n/g, ', ') : dateStr;

      const now = new Date();
      const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const isToday = dateStr === todayStr;

      let dayClasses = 'gcw-day';
      if (isScheduled || hasLesson) dayClasses += ' has-lesson';
      if (isSelected) dayClasses += ' is-selected';
      if (isToday) dayClasses += ' is-today';
      if (roClass) dayClasses += roClass;

      const numColorClass = (isRed || isPaymentDeadline)
        ? ' is-color-red'
        : (isOrange
          ? ' is-color-orange'
          : (isBlue
            ? ' is-color-blue'
            : (isGreen
              ? ' is-color-green'
              : '')));

      gridHtml += '<button type="button" class="' + dayClasses + '" data-gcw-date="' + dateStr + '"' + tooltipAttr + ' aria-label="' + esc(ariaLabel) + '">';
      gridHtml += '<span class="gcw-day-num' + numColorClass + '">' + d + '</span>';
      if (isToday) {
        gridHtml += '<span class="gcw-today-badge">Today</span>';
      }
      if (dotsHtml) {
        gridHtml += '<div class="gcw-dots">' + dotsHtml + '</div>';
      }
      gridHtml += '</button>';
    }

    // Attendance Journal View HTML
    let journalHtml = '<div class="gcw-journal-wrap" style="overflow-x:auto; margin-bottom:24px;">';
    const isLocked = Boolean(monthData.reportingClosed);
    const canMarkAttendance = canEdit && !isLocked;
    if (isLocked) {
      journalHtml += '<div class="gcw-locked-banner"><span>🔒</span> <span>Attendance reporting for this month is closed and locked for editing.</span></div>';
    }
    const hintText = isLocked
      ? '🔒 Attendance reporting is closed for this month. All records are locked in read-only mode.'
      : (canEdit
        ? 'Click date to open activities; click to mark present (✓), double-click to mark absent (✕)'
        : 'Click date to open activities');
    journalHtml += '<p class="gcw-hint">' + hintText + '</p>';
    const sortedLessonDates = Array.from(monthLessonDates).sort();
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    let targetFocusDate = '';
    if (sortedLessonDates.includes(todayStr)) {
      targetFocusDate = todayStr;
    } else {
      const pastDates = sortedLessonDates.filter(d => d < todayStr);
      if (pastDates.length > 0) {
        targetFocusDate = pastDates[pastDates.length - 1];
      } else if (sortedLessonDates.length > 0) {
        targetFocusDate = sortedLessonDates[0];
      }
    }
    if (!sortedLessonDates.length) {
      journalHtml += '<p class="hint" style="color:var(--saas-text-muted, var(--mute, #71717a)); padding:16px;">No lessons scheduled for ' + monthName + ' ' + year + '. Click calendar dates to schedule lessons.</p>';
    } else {
      journalHtml += '<table class="gcw-table"><thead><tr>';
      journalHtml += '<th class="gcw-th-student">Student</th>';
      for (const d of sortedLessonDates) {
        const shortDate = d.slice(8) + '.' + d.slice(5, 7);
        const isFocused = (d === targetFocusDate);
        const thClass = 'gcw-th-date' + (isFocused ? ' is-focused-date' : '');
        const btnClass = 'gcw-date-header-btn' + (isFocused ? ' is-focused' : '');
        const focusedAttr = isFocused ? ' data-gcw-focused-date="true"' : '';
        journalHtml += '<th class="' + thClass + '"><button type="button" class="' + btnClass + '" data-gcw-open-date="' + esc(d) + '"' + focusedAttr + ' title="Open activity for ' + shortDate + '">' + shortDate + '</button></th>';
      }
      journalHtml += '</tr></thead><tbody>';

      for (const s of students) {
        const stId = String(s.id);
        const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
        let cells = '';
        for (const d of sortedLessonDates) {
          const isFuture = (d > todayStr);
          const canEditCell = canMarkAttendance && !isFuture;
          const st = stDates[d] || 'unmarked';
          let sym = st === 'present' ? '✓' : st === 'absent' ? '✕' : (canEdit ? '+' : '');
          if (!canEditCell && sym === '+') sym = '';
          let cellClass = st === 'present' ? 'is-present' : st === 'absent' ? 'is-absent' : 'is-unmarked';
          if (isFuture) cellClass += ' is-future';
          const roClass = canEditCell ? '' : ' is-readonly';
          const isFocused = (d === targetFocusDate);
          const tdColClass = isFocused ? ' td-focused-col' : '';
          const ariaExtra = isFuture ? ' (future date - cannot mark)' : (isLocked ? ' (reporting closed)' : '');
          cells += '<td class="' + tdColClass + '"><button type="button" class="gcw-cell-btn ' + cellClass + roClass + '" data-gcw-student="' + esc(stId) + '" data-gcw-date="' + esc(d) + '" data-gcw-student-name="' + esc(s.name || s.login || 'Student') + '" aria-label="' + esc(s.name || s.login) + ' ' + d + ': ' + st + ariaExtra + '"' + (isFuture || !canMarkAttendance ? ' disabled' : '') + '>' + sym + '</button></td>';
        }
        journalHtml += '<tr>';
        journalHtml += '<td class="gcw-td-student">' + esc(s.name || s.login) + '</td>';
        journalHtml += cells;
        journalHtml += '</tr>';
      }

      // Bottom Row: Date Attendance Percentages
      journalHtml += '<tr class="gcw-table-footer-row"><td class="gcw-td-student"></td>';
      for (const d of sortedLessonDates) {
        let presents = 0;
        let marked = 0;
        for (const s of students) {
          const stDates = monthData.attendance[s.id] || monthData.attendance['u' + s.id] || monthData.attendance['s' + s.id] || {};
          const st = stDates[d];
          if (st === 'present') { presents++; marked++; }
          else if (st === 'absent') { marked++; }
        }
        const pctStr = marked > 0 ? (students.length ? Math.round((presents / students.length) * 100) + '%' : '—') : '—';
        journalHtml += '<td data-gcw-footer-date="' + esc(d) + '">' + pctStr + '</td>';
      }
      journalHtml += '</tr>';

      journalHtml += '</tbody></table>';
    }
    journalHtml += '</div>';

    // Statistics View HTML
    let statsHtml = '<div class="gcw-stats-list">';
    const statsStudents = [...students].sort((a, b) => (a.name || a.login || '').localeCompare(b.name || b.login || '', undefined, { sensitivity: 'base' }));
    if (!statsStudents.length) {
      statsHtml += '<p class="hint" style="padding:16px;">No students assigned to this group.</p>';
    } else {
      for (const s of statsStudents) {
        const stId = String(s.id);
        const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
        let stPresent = 0;
        let stAbsent = 0;
        for (const d of sortedLessonDates) {
          const st = stDates[d];
          if (st === 'present') stPresent++;
          else if (st === 'absent') stAbsent++;
        }
        const totalMarked = stPresent + stAbsent;
        const pct = totalMarked > 0 ? Math.round((stPresent / totalMarked) * 100) : 0;
        const missedHtml = stAbsent > 0 ? '<span class="gcw-stat-missed">' + (stAbsent === 1 ? '1 missed' : stAbsent + ' missed') + '</span>' : '';
        statsHtml +=
          '<div class="gcw-stat-row">' +
            '<span class="gcw-stat-name">' + esc(s.name || s.login) + '</span>' +
            '<div class="gcw-stat-track"><div class="gcw-stat-fill" style="width:' + pct + '%;"></div></div>' +
            '<div class="gcw-stat-meta">' +
              '<span class="gcw-stat-pct">' + pct + '%</span>' +
              missedHtml +
            '</div>' +
          '</div>';
      }
    }
    statsHtml += '</div>';

    // Main Component Structure with Centered Month Navigation
    const hadFocus = container.contains(document.activeElement) || document.activeElement === container;
    let focusSelector = null;
    if (hadFocus && document.activeElement) {
      if (document.activeElement.dataset?.gcwTab) {
        focusSelector = '[data-gcw-tab="' + document.activeElement.dataset.gcwTab + '"]';
      } else if (document.activeElement.dataset?.gcwNav) {
        focusSelector = '[data-gcw-nav="' + document.activeElement.dataset.gcwNav + '"]';
      } else if (document.activeElement.dataset?.gcwAction) {
        focusSelector = '[data-gcw-action="' + document.activeElement.dataset.gcwAction + '"]';
      } else if (document.activeElement.className) {
        const primaryClass = document.activeElement.className.split(' ').find(c => c && !['gcw-tab', 'is-active'].includes(c));
        if (primaryClass) focusSelector = '.' + primaryClass;
      }
    }

    let draftSlotsCount = 0;
    if (canEdit && monthData.lessonDates) {
      for (const d of monthData.lessonDates) {
        if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
          const dLessons = getLessonsForDate(groupId, d);
          if (dLessons.length === 0) {
            draftSlotsCount++;
          }
        }
      }
    }

    const oldJournal = container.querySelector('.gcw-journal-wrap');
    const savedJournalScroll = oldJournal ? oldJournal.scrollLeft : null;

    let scheduledDropdownHtml = '';
    if (sortedLessonDates.length === 0) {
      scheduledDropdownHtml = '<div class="gcw-scheduled-dropdown-empty">No scheduled lessons for this month</div>';
    } else {
      for (const d of sortedLessonDates) {
        const shortD = d.slice(8) + '.' + d.slice(5, 7);
        const dObj = new Date(d + 'T12:00:00');
        const weekday = dObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dLessons = getLessonsForDate(groupId, d);
        const sched = monthData.scheduleData && monthData.scheduleData[d];
        let lessonTitle = dLessons[0] ? dLessons[0].title : '';
        if (!lessonTitle && sched && sched.materialId && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
          const mat = lmLibrary.materials.find(m => String(m.id) === String(sched.materialId));
          if (mat && mat.title) lessonTitle = mat.title;
        }
        if (!lessonTitle) lessonTitle = 'Lesson ' + (sortedLessonDates.indexOf(d) + 1);
        const timeStr = (sched && sched.startTime) ? sched.startTime : (dLessons[0] && dLessons[0].time ? dLessons[0].time : '');
        scheduledDropdownHtml += '<button type="button" class="gcw-scheduled-dropdown-item" data-gcw-dropdown-date="' + esc(d) + '">' +
          '<span><b>' + shortD + '</b> (' + weekday + ')' + (timeStr ? ' · ' + esc(timeStr) : '') + '</span>' +
          '<span style="color:var(--saas-text-muted, var(--mute, #64748b)); font-size:12px; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(lessonTitle) + '</span>' +
        '</button>';
      }
    }

    container.innerHTML =
      '<div class="gcw-header">' +
        '<div class="gcw-tier-top">' +
          '<div class="gcw-month-nav" tabindex="0" role="region" aria-label="Calendar month navigation">' +
            '<button class="gcw-nav-arrow" type="button" data-gcw-nav="prev" aria-label="Previous month">←</button>' +
            '<span class="gcw-month-label">' + monthName + ' ' + year + '</span>' +
            '<button class="gcw-nav-arrow" type="button" data-gcw-nav="next" aria-label="Next month">→</button>' +
          '</div>' +
        '</div>' +
        '<div class="gcw-tier-bottom">' +
          '<div class="gcw-tabs" role="tablist">' +
            '<button class="gcw-tab' + (state.activeTab === 'calendar' ? ' is-active' : '') + '" type="button" data-gcw-tab="calendar" role="tab" aria-selected="' + (state.activeTab === 'calendar') + '">Calendar</button>' +
            '<button class="gcw-tab' + (state.activeTab === 'attendance' ? ' is-active' : '') + '" type="button" data-gcw-tab="attendance" role="tab" aria-selected="' + (state.activeTab === 'attendance') + '">Attendance</button>' +
            '<button class="gcw-tab' + (state.activeTab === 'statistics' ? ' is-active' : '') + '" type="button" data-gcw-tab="statistics" role="tab" aria-selected="' + (state.activeTab === 'statistics') + '">Statistics</button>' +
          '</div>' +
          '<div class="gcw-header-spacer"' + (state.activeTab !== 'calendar' ? ' style="display:none;"' : '') + '>' +
            (canEdit && draftSlotsCount > 0 ? '<button class="btn-publish-all" type="button" data-gcw-action="publish-all-scheduled" title="Activate all scheduled draft lessons at once" aria-label="Publish all scheduled lessons">⚡ Publish all scheduled (' + draftSlotsCount + ')</button>' : '') +
            (canEdit ? '<button class="gcw-set-schedule-btn" type="button" data-gcw-action="set-group-schedule" aria-label="Set group schedule">📅 Set group schedule</button>' : '') +
            '<button class="gcw-today-btn" type="button" data-gcw-nav="today" aria-label="Go to current month">Today</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="gcw-view-panel" data-gcw-panel="calendar"' + (state.activeTab !== 'calendar' ? ' hidden' : '') + '>' +
        '<div class="gcw-grid">' + gridHtml + '</div>' +
      '</div>' +
      '<div class="gcw-view-panel" data-gcw-panel="attendance"' + (state.activeTab !== 'attendance' ? ' hidden' : '') + '>' +
        journalHtml +
      '</div>' +
      '<div class="gcw-view-panel" data-gcw-panel="statistics"' + (state.activeTab !== 'statistics' ? ' hidden' : '') + '>' +
        statsHtml +
      '</div>' +
      '<div class="gcw-footer">' +
        '<div class="gcw-stats">' +
          '<div class="gcw-dropdown-wrap">' +
            '<button class="gcw-badge gcw-badge-btn" type="button" data-gcw-action="toggle-scheduled-dropdown" aria-haspopup="true" aria-expanded="false" title="Click to view scheduled lesson dates">Scheduled lessons · <b>' + lessonCount + '</b> ▾</button>' +
            '<div class="gcw-scheduled-dropdown" style="display:none;" role="menu">' + scheduledDropdownHtml + '</div>' +
          '</div>' +
          '<span class="gcw-badge">Scheduled exams · <b>' + examCount + '</b></span>' +
          '<span class="gcw-badge">Students · <b>' + studentCount + '</b></span>' +
          '<span class="gcw-badge" data-gcw-metric="attendance-pct">Attendance · <b>' + attendancePct + '%</b></span>' +
        '</div>' +
        '<div class="gcw-footer-actions">' +
          (canEdit ? '<button class="gcw-lock-reporting-btn' + (isLocked ? ' is-locked' : '') + '" type="button" data-gcw-action="toggle-lock-reporting" title="' + (isLocked ? 'Click to reopen attendance reporting' : 'Click to lock attendance records for this month') + '">' + (isLocked ? '🔓 Reopen reporting' : '🔒 Close reporting') + '</button>' : '') +
          (canEdit ? '<button class="gcw-report-btn" type="button" data-gcw-action="report-chat">Report to chat</button>' : '') +
        '</div>' +
      '</div>' +
      '<p class="hint" data-gcw-status style="margin-top:10px; color:var(--ok, #10b981); font-size:12px; display:none;"></p>';

    bindGroupCalendarEvents(container, groupId, state, canEdit);

    if (savedJournalScroll !== null) {
      const newJournal = container.querySelector('.gcw-journal-wrap');
      if (newJournal) {
        newJournal.scrollLeft = savedJournalScroll;
      }
    }

    if (state.activeTab === 'attendance') {
      const focusedBtn = container.querySelector('[data-gcw-focused-date="true"]');
      if (focusedBtn) {
        setTimeout(() => {
          focusedBtn.focus({ preventScroll: true });
          if (savedJournalScroll === null && typeof focusedBtn.scrollIntoView === 'function') {
            focusedBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
          }
        }, 50);
      }
    }

    if (hadFocus) {
      const target = focusSelector ? container.querySelector(focusSelector) : null;
      if (target && typeof target.focus === 'function') target.focus();
      else container.focus();
    }
  }

  function formatEndTime(startStr, durMin) {
    if (!startStr || typeof startStr !== 'string' || !startStr.includes(':')) return '';
    const [h, m] = startStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const totalMin = h * 60 + m + (Number(durMin) || 0);
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    return String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
  }

  function getDatesForPeriod(baseDateStr, period, customStart, customEnd, currentMonthKey, selectedDays) {
    const base = new Date(baseDateStr + 'T00:00:00');
    const targetDay = base.getDay();
    const daysSet = (selectedDays && (selectedDays instanceof Set ? selectedDays.size : selectedDays.length))
      ? (selectedDays instanceof Set ? selectedDays : new Set(selectedDays))
      : new Set([targetDay]);
    let startD = new Date(base);
    let endD = new Date(base);

    if (period === 'single') {
      return [baseDateStr];
    } else if (period === 'month') {
      const [y, m] = currentMonthKey.split('-').map(Number);
      startD = new Date(y, m - 1, 1);
      endD = new Date(y, m, 0);
    } else if (period === 'academic_year') {
      const [y, m] = currentMonthKey.split('-').map(Number);
      const startYear = m >= 9 ? y : y - 1;
      startD = new Date(startYear, 8, 1);
      endD = new Date(startYear + 1, 4, 31);
    } else if (period === 'custom') {
      if (customStart && customEnd) {
        startD = new Date(customStart + 'T00:00:00');
        endD = new Date(customEnd + 'T00:00:00');
      }
    }

    const dates = [];
    const cur = new Date(startD);
    while (cur <= endD) {
      if (daysSet.has(cur.getDay())) {
        const yStr = cur.getFullYear();
        const mStr = String(cur.getMonth() + 1).padStart(2, '0');
        const dStr = String(cur.getDate()).padStart(2, '0');
        dates.push(yStr + '-' + mStr + '-' + dStr);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  function calculateStudentTuition(groupId, state, studentId) {
    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    const pricePerLesson = Number(monthData.pricePerLesson) || 30;
    const sortedLessonDates = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();

    const [y, m] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const lastDayOfMonth = monthKey + '-' + String(daysInMonth).padStart(2, '0');
    const lastLessonDate = sortedLessonDates[sortedLessonDates.length - 1] || '';
    const isEndMonth = Boolean(lastLessonDate && lastLessonDate === lastDayOfMonth);

    const datesMap = (monthData.attendance && (monthData.attendance[studentId] || monthData.attendance['u' + studentId] || monthData.attendance['s' + studentId])) || {};
    let attendedCount = 0;
    sortedLessonDates.forEach(d => {
      if (datesMap[d] === 'present') attendedCount++;
    });

    const autoAmount = attendedCount * pricePerLesson;
    const sp = (monthData.studentPayments && monthData.studentPayments[studentId]) || {};
    const hasManual = sp.manualAmount != null && sp.manualAmount !== '';
    const finalAmount = hasManual ? Number(sp.manualAmount) : autoAmount;
    const isPaid = Boolean(sp.paid);
    const paidAt = sp.paidAt || '';

    let nextMonthFirst = '';
    if (isEndMonth) {
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      nextMonthFirst = nextY + '-' + String(nextM).padStart(2, '0') + '-01';
    }

    return {
      attendedCount,
      totalLessons: sortedLessonDates.length,
      pricePerLesson,
      autoAmount,
      finalAmount,
      manualAmount: hasManual ? sp.manualAmount : '',
      isPaid,
      paidAt,
      isEndMonth,
      lastLessonDate,
      lastDayOfMonth,
      nextMonthFirst
    };
  }

  async function postPaymentInvoiceToChat(groupId, groupTitle, state, deadlineDate, customRequisites, deadlineTime, remindersList, isAnchorToCycleEnd) {
    try {
      if (typeof window.ensureMessages === 'function') {
        await window.ensureMessages();
      }

      const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
      const monthData = getMonthData(state, monthKey);
      const dObj = new Date(state.year, state.monthIndex, 1);
      const monthName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const currency = monthData.currency || 'BYN';
      const students = getGroupStudents(groupId);
      const sortedLessonDates = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();
      const lastLessonDate = sortedLessonDates[sortedLessonDates.length - 1] || '';
      const [y, m] = monthKey.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const lastDayOfMonth = monthKey + '-' + String(daysInMonth).padStart(2, '0');
      const isEndMonth = Boolean(lastLessonDate && lastLessonDate === lastDayOfMonth);

      const effectiveDeadline = (isEndMonth && !deadlineDate) ? (m === 12 ? (y + 1) + '-01-01' : y + '-' + String(m + 1).padStart(2, '0') + '-01') : (deadlineDate || monthData.paymentDeadline || (monthKey + '-25'));
      const effectiveTime = deadlineTime || monthData.paymentDeadlineTime || '18:00';
      const requisitesText = customRequisites || monthData.paymentRequisites || 'Bank: Alfa-Bank CJSC · IBAN: BY00 ALFA 0000 0000 0000 0000\nRecipient: English Study Academy · Purpose: Tuition for ' + monthName + '\nERIP: Education & Development > English Study > Invoice ID: #ST-GRP-42';

      const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
      const icsUrl = `${origin}/api/groups/payment-deadline.ics?groupId=${encodeURIComponent(groupId)}&date=${encodeURIComponent(effectiveDeadline)}&title=${encodeURIComponent('Tuition Payment Due · ' + groupTitle)}&isEndMonth=${isEndMonth}&requisites=${encodeURIComponent(requisitesText)}`;

      const dtClean = effectiveDeadline.replace(/-/g, '');
      const timeClean = effectiveTime.replace(/:/g, '') + '00';
      const gCalUrl = new URL('https://calendar.google.com/calendar/render');
      gCalUrl.searchParams.set('action', 'TEMPLATE');
      gCalUrl.searchParams.set('text', `Tuition Payment Due · ${groupTitle}`);
      gCalUrl.searchParams.set('dates', `${dtClean}T${timeClean}/${dtClean}T${timeClean}`);
      gCalUrl.searchParams.set('details', `Payment due for ${monthName}.\nRequisites:\n${requisitesText}`);
      gCalUrl.searchParams.set('ctz', 'Europe/Minsk');

      // Private delivery to each student with pending tuition (matching Screenshot 11 and Screenshot 21)
      for (const s of students) {
        const tuition = calculateStudentTuition(groupId, state, s.id);
        const studentName = s.name || s.login || 'Student';
        const personalMsg = [
          `⚠️ Tuition Payment Reminder · Study alerts`,
          `Hello, ${studentName}! This is a reminder regarding tuition for ${monthName}.`,
          '',
          `• Deadline: ${effectiveDeadline} ${effectiveTime}`,
          `• Total Due: ${tuition.finalAmount} ${currency}`,
          `• Classes Completed: ${tuition.attendedCount} of ${tuition.totalLessons}${lastLessonDate ? ' (ended ' + lastLessonDate + ')' : ''}`,
          `• Status: ${tuition.isPaid ? 'Paid' : 'Pending'}`,
          '',
          'Payment Requisites:',
          requisitesText,
          '',
          '👉 Add payment deadline to your calendar:',
          `• [📅 Add to Google Calendar](${gCalUrl.toString()})`,
          `• [📥 Download .ics Reminder](${icsUrl})`,
          '',
          `• [✅ I have paid (${tuition.finalAmount} ${currency})](${origin}/?action=confirm-payment&groupId=${groupId}&month=${monthKey}&studentId=${s.id})`
        ].join('\n');

        if (typeof window.sendDirectChatMessage === 'function') {
          try {
            await window.sendDirectChatMessage(s.id, personalMsg, { category: 'learning' });
          } catch {}
        }
      }

      // Group invoice announcement without leaking individual student financials
      const lines = [
        '💳 TUITION INVOICE & PAYMENT DETAILS',
        'Group: ' + groupTitle,
        'Billing Month: ' + monthName,
        'Payment Deadline: ' + effectiveDeadline + ' ' + effectiveTime + (isEndMonth ? ' (Issued on 1st of next month)' : ''),
        '',
        '📢 Individual invoices and attendance breakdowns have been dispatched privately to each student in their Study alerts chat.',
        '',
        'Payment Requisites:',
        requisitesText,
        '',
        '👉 Add payment deadline to your calendar:',
        `• [📅 Add to Google Calendar](${gCalUrl.toString()})`,
        `• [📥 Download .ics Reminder](${icsUrl})`,
        ''
      ];
      if (isEndMonth) {
        lines.push('🔔 Note: Since the last lesson falls on the last day of the month, the bill is issued on the 1st of the next month with same-day notice.');
      } else if (Array.isArray(remindersList) && remindersList.length > 0) {
        const remStrs = remindersList.map(r => `${r.value} ${r.unit.toLowerCase()}`).join(', ');
        lines.push(`🔔 Reminder alerts scheduled: ${remStrs} before deadline.`);
      } else {
        lines.push('🔔 Reminder alerts are preconfigured at 2 days, 1 day, and 1 hour before the payment deadline.');
      }
      lines.push('');
      lines.push('👉 Students: After completing payment, please click «I have paid» in the Group Calendar widget to notify the teacher.');

      const messageText = lines.join('\n');
      if (typeof window.sendGroupChatMessage === 'function') {
        await window.sendGroupChatMessage(groupId, messageText, { category: 'learning' });
      }
    } catch {
      // Non-blocking dispatch
    }
  }

  function showPaymentDeadlineModal(groupId, dateStr, state, container) {
    const existing = document.getElementById('gcwPaymentModal');
    if (existing) existing.remove();

    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    const students = getGroupStudents(groupId);
    const currency = monthData.currency || 'BYN';
    let currentPrice = Number(monthData.pricePerLesson) || 30;
    const dObj = new Date(state.year, state.monthIndex, 1);
    const monthName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const currentRequisites = monthData.paymentRequisites || `Bank: Alfa-Bank CJSC · IBAN: BY00 ALFA 0000 0000 0000 0000\nRecipient: English Study Academy · Purpose: Tuition for ${monthName}\nERIP: Education & Development > English Study > Invoice ID: #ST-GRP-42`;
    const currentDeadline = monthData.paymentDeadline || (dateStr || (monthKey + '-25'));
    const currentDeadlineTime = monthData.paymentDeadlineTime || '18:00';
    const isAnchorChecked = monthData.anchorToCycleEnd !== false;

    const sortedLessonDates = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();
    const lastLessonDate = sortedLessonDates[sortedLessonDates.length - 1] || '';
    let lastLessonBadgeText = 'No lessons scheduled';
    if (lastLessonDate) {
      const [ly, lm, ld] = lastLessonDate.split('-').map(Number);
      const lObj = new Date(ly, lm - 1, ld);
      const shortMonth = lObj.toLocaleDateString('en-US', { month: 'short' });
      const lastSched = (monthData.scheduleData && monthData.scheduleData[lastLessonDate]) || null;
      const lastTime = lastSched && lastSched.startTime ? ` · ${lastSched.startTime}` : ' · 19:30';
      lastLessonBadgeText = `Last Lesson: ${ld} ${shortMonth}${lastTime}`;
    }

    let rules = (Array.isArray(monthData.paymentReminders) && monthData.paymentReminders.length > 0)
      ? JSON.parse(JSON.stringify(monthData.paymentReminders))
      : [
          { value: 3, unit: 'Days' },
          { value: 1, unit: 'Days' },
          { value: 4, unit: 'Hours' },
          { value: 1, unit: 'Hours' }
        ];

    function formatRuleTarget(deadlineDate, deadlineTime, val, unit) {
      if (!deadlineDate) return '';
      const [y, m, d] = deadlineDate.split('-').map(Number);
      const [hh, mm] = (deadlineTime || '18:00').split(':').map(Number);
      const dt = new Date(y, m - 1, d, hh || 0, mm || 0);
      if (isNaN(dt.getTime())) return `${val} ${unit} prior`;
      const num = Number(val) || 0;
      if (unit === 'Weeks') dt.setDate(dt.getDate() - (num * 7));
      else if (unit === 'Days') dt.setDate(dt.getDate() - num);
      else if (unit === 'Hours') dt.setHours(dt.getHours() - num);
      const shortM = dt.toLocaleDateString('en-US', { month: 'short' });
      const dayNum = dt.getDate();
      const timeStr = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
      return `${dayNum} ${shortM} · ${timeStr}`;
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwPaymentModal';
    dialog.className = 'gcw-scheduler-dialog gcw-payment-dialog';

    const html = `
      <div class="gcw-scheduler-head">
        <h3><span>💳</span> Tuition Deadline & Payment Management</h3>
        <button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>
      </div>

      <!-- Clean Tab Navigation (Screenshot 8, 9, 10) -->
      <div class="gcw-payment-tabs">
        <button type="button" class="gcw-payment-tab is-active" data-tab="deadline">
          <span>⏰</span> Deadline & Reminders
        </button>
        <button type="button" class="gcw-payment-tab" data-tab="invoices">
          <span>📋</span> Student Invoices
          <span class="gcw-tab-badge" id="gcwInvoicesTabBadge"></span>
        </button>
        <button type="button" class="gcw-payment-tab" data-tab="requisites">
          <span>🏦</span> Payment Requisites
        </button>
      </div>

      <div class="gcw-scheduler-body" style="padding:16px 20px; max-height:65vh; overflow-y:auto;">
        <!-- TAB 1: Deadline & Reminders (Screenshot 8) -->
        <div class="gcw-payment-panel is-active" data-panel="deadline">
          <div class="gcw-grid-two">
            <div class="gcw-field-group">
              <label for="gcwModalDeadlineDate">Payment Deadline Date</label>
              <div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:8px;">
                <input type="text" id="gcwModalDeadlineDate" value="${esc(currentDeadline)}" placeholder="YYYY-MM-DD" style="flex:1;" readonly>
                <button type="button" class="btn icon-btn gcw-cal-btn" id="gcwModalDeadlineDateBtn" title="Choose date" aria-label="Choose date" style="min-width:38px; height:38px; padding:0 8px;">📅</button>
              </div>
            </div>
            <div class="gcw-field-group">
              <label for="gcwModalDeadlineTime">Deadline Exact Time</label>
              <input type="time" id="gcwModalDeadlineTime" class="gcw-time-input" value="${esc(currentDeadlineTime)}">
            </div>
          </div>

          <!-- Smart Anchor to Last Lesson -->
          <div class="gcw-anchor-card">
            <div class="gcw-anchor-left">
              <input type="checkbox" id="gcwModalAnchorToggle" ${isAnchorChecked ? 'checked' : ''} style="accent-color:#16a34a; width:16px; height:16px; margin:0;">
              <label for="gcwModalAnchorToggle" class="gcw-anchor-text" style="cursor:pointer; margin:0;">
                <b>Anchor to cycle end:</b> Withhold invoices & alerts until final lesson completes.
              </label>
            </div>
            <span class="gcw-anchor-badge">${esc(lastLessonBadgeText)}</span>
          </div>

          <!-- Dynamic Reminders List (Any quantity, any period) -->
          <div class="gcw-reminders-section">
            <div class="gcw-reminders-header">
              <span><span>🔔</span> Reminder Intervals (Any Quantity & Period)</span>
              <button type="button" class="gcw-add-reminder-btn" id="gcwAddReminderBtn"><span>+</span> Add Reminder</button>
            </div>
            <div class="gcw-rule-list" id="gcwReminderRuleList"></div>
          </div>
        </div>

        <!-- TAB 2: Student Invoices (Screenshot 9, 31) -->
        <div class="gcw-payment-panel" data-panel="invoices">
          <!-- Rate per Lesson Card (Screenshot 31) -->
          <div class="gcw-rate-setting-row">
            <div>
              <div class="gcw-rate-setting-title">
                <span>💰</span> Price Per Lesson (${currency})
              </div>
              <div class="gcw-rate-setting-desc">
                Base rate for auto-calculation: (Attended Lessons × Price). Changes update totals in real time.
              </div>
            </div>
            <div class="gcw-price-input-wrap">
              <input type="number" id="gcwModalPricePerLesson" class="gcw-price-input" value="${currentPrice}" min="0" step="1">
              <span class="gcw-price-currency">${currency}</span>
            </div>
          </div>

          <div class="gcw-summary-banner">
            <div class="gcw-stat-col">
              <span class="gcw-stat-label">Total Invoiced</span>
              <span class="gcw-stat-value" id="gcwTotalInvoiced">0 ${currency}</span>
            </div>
            <div class="gcw-stat-col">
              <span class="gcw-stat-label">Collected</span>
              <span class="gcw-stat-value green" id="gcwTotalCollected">0 ${currency}</span>
            </div>
            <div class="gcw-stat-col">
              <span class="gcw-stat-label">Pending</span>
              <span class="gcw-stat-value amber" id="gcwTotalPending">0 ${currency}</span>
            </div>
          </div>

          <div style="background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.4; display:flex; align-items:flex-start; gap:6px;">
            <span>💡</span>
            <div>
              <b>Manual Amount:</b> overrides the total invoice amount for that student (custom discount or flat rate). Leave empty to use the auto-calculated amount.
            </div>
          </div>

          <div style="overflow-x:auto;">
            <table class="gcw-invoices-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th style="text-align:center;">Attended</th>
                  <th style="text-align:center;">Auto Calc</th>
                  <th style="text-align:center;">
                    Manual Amount <span class="gcw-info-hint" title="Overrides total sum for this student. Leave blank to use Auto Amount." style="cursor:help; font-size:11px; font-weight:700; background:#e2e8f0; color:#475569; border-radius:50%; width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; margin-left:4px;">i</span>
                  </th>
                  <th style="text-align:center;">Status</th>
                </tr>
              </thead>
              <tbody id="gcwInvoicesTableBody"></tbody>
            </table>
          </div>

          <div class="gcw-private-note">
            <span>🔒</span>
            <span><b>Private Delivery:</b> Invoices and personal bills will be dispatched strictly to each student's direct Study alerts chat.</span>
          </div>
        </div>

        <!-- TAB 3: Payment Requisites (Screenshot 10) -->
        <div class="gcw-payment-panel" data-panel="requisites">
          <div class="gcw-field-group">
            <label for="gcwModalRequisites">
              <span>Payment Requisites & Bank Information</span>
              <span class="gcw-label-hint">Auto-expands to fit text</span>
            </label>
            <textarea id="gcwModalRequisites" class="gcw-auto-expand-textarea" rows="4">${esc(currentRequisites)}</textarea>
          </div>

          <div class="gcw-info-callout">
            💡 <b>Auto-Included:</b> These requisites are attached directly to each private invoice and reminder alert sent to students in their Study alerts chat.
          </div>
        </div>
      </div>

      <div class="gcw-scheduler-foot" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          ${monthData.paymentDeadline ? '<button type="button" class="btn danger-text" data-action="clear-deadline" style="color:var(--bad, #dc2626); background:transparent; border:none; font-weight:600; cursor:pointer;">Clear Deadline</button>' : ''}
        </div>
        <div style="display:flex; gap:10px;">
          <button type="button" class="btn ghost" data-action="close">Cancel</button>
          <button type="button" class="btn primary" data-action="save"><span>🔒</span> Save & Send Invoices Privately</button>
        </div>
      </div>`;

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    const deadlineInput = dialog.querySelector('#gcwModalDeadlineDate');
    const deadlineBtn = dialog.querySelector('#gcwModalDeadlineDateBtn');
    const deadlineTimeInput = dialog.querySelector('#gcwModalDeadlineTime');

    if (deadlineBtn && deadlineInput) {
      const openPicker = () => {
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(deadlineBtn, deadlineInput.value, (newDate) => {
            deadlineInput.value = newDate;
            renderRules();
          });
        }
      };
      deadlineBtn.onclick = openPicker;
      deadlineInput.onclick = openPicker;
    }

    if (deadlineTimeInput) {
      deadlineTimeInput.onchange = () => renderRules();
    }

    const priceInput = dialog.querySelector('#gcwModalPricePerLesson');
    if (priceInput) {
      priceInput.oninput = () => {
        const val = Number(priceInput.value);
        currentPrice = isNaN(val) || val < 0 ? 0 : val;
        monthData.pricePerLesson = currentPrice;
        updateInvoicesDisplay();
      };
    }

    // Auto-expanding textarea
    const reqTextarea = dialog.querySelector('#gcwModalRequisites');
    const adjustHeight = () => {
      if (!reqTextarea) return;
      reqTextarea.style.height = 'auto';
      reqTextarea.style.height = Math.max(140, reqTextarea.scrollHeight + 8) + 'px';
    };
    if (reqTextarea) {
      reqTextarea.oninput = adjustHeight;
      setTimeout(adjustHeight, 0);
    }

    // Tab switching
    dialog.querySelectorAll('.gcw-payment-tab').forEach(tabBtn => {
      tabBtn.onclick = () => {
        dialog.querySelectorAll('.gcw-payment-tab').forEach(t => t.classList.remove('is-active'));
        dialog.querySelectorAll('.gcw-payment-panel').forEach(p => p.classList.remove('is-active'));
        tabBtn.classList.add('is-active');
        const targetPanel = dialog.querySelector(`.gcw-payment-panel[data-panel="${tabBtn.dataset.tab}"]`);
        if (targetPanel) {
          targetPanel.classList.add('is-active');
          if (tabBtn.dataset.tab === 'requisites') {
            setTimeout(adjustHeight, 10);
          }
        }
      };
    });

    // Render Dynamic Reminders
    function renderRules() {
      const listEl = dialog.querySelector('#gcwReminderRuleList');
      if (!listEl) return;
      listEl.innerHTML = rules.map((r, idx) => `
        <div class="gcw-rule-row" data-rule-index="${idx}">
          <div class="gcw-rule-left">
            <span>Remind before deadline:</span>
            <input type="number" class="gcw-rule-num" value="${r.value}" min="1" data-field="value">
            <select class="gcw-rule-unit" data-field="unit">
              <option value="Days"${r.unit === 'Days' ? ' selected' : ''}>Days</option>
              <option value="Hours"${r.unit === 'Hours' ? ' selected' : ''}>Hours</option>
              <option value="Weeks"${r.unit === 'Weeks' ? ' selected' : ''}>Weeks</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="gcw-rule-target-date">${esc(formatRuleTarget(deadlineInput.value, deadlineTimeInput.value, r.value, r.unit))}</span>
            <button type="button" class="gcw-delete-rule-btn" data-rule-delete="${idx}" aria-label="Delete reminder">✕</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.gcw-delete-rule-btn').forEach(btn => {
        btn.onclick = () => {
          const i = Number(btn.dataset.ruleDelete);
          rules.splice(i, 1);
          renderRules();
        };
      });

      listEl.querySelectorAll('input, select').forEach(el => {
        el.onchange = () => {
          const row = el.closest('.gcw-rule-row');
          if (!row) return;
          const i = Number(row.dataset.ruleIndex);
          if (el.dataset.field === 'value') {
            rules[i].value = Math.max(1, Number(el.value) || 1);
          } else if (el.dataset.field === 'unit') {
            rules[i].unit = el.value;
          }
          renderRules();
        };
      });
    }

    const addReminderBtn = dialog.querySelector('#gcwAddReminderBtn');
    if (addReminderBtn) {
      addReminderBtn.onclick = () => {
        rules.push({ value: 1, unit: 'Days' });
        renderRules();
      };
    }
    renderRules();

    // Invoices and financial calculation
    function updateInvoicesDisplay() {
      let totalInvoiced = 0;
      let totalCollected = 0;
      let totalPending = 0;
      let paidCount = 0;
      let pendingCount = 0;

      let rowsHtml = '';
      students.forEach(s => {
        const tuition = calculateStudentTuition(groupId, state, s.id);
        totalInvoiced += tuition.finalAmount;
        if (tuition.isPaid) {
          totalCollected += tuition.finalAmount;
          paidCount++;
        } else {
          totalPending += tuition.finalAmount;
          pendingCount++;
        }

        const statusBadge = tuition.isPaid
          ? `<button type="button" class="gcw-badge-paid" data-toggle-paid="${esc(s.id)}" title="Click to mark as Pending" style="cursor:pointer; border:1px solid #a7f3d0; background:#ecfdf5;">✅ Paid</button>`
          : `<button type="button" class="gcw-badge-pending" data-toggle-paid="${esc(s.id)}" title="Click to mark as Paid" style="cursor:pointer; border:1px solid #fde68a; background:#fffbeb;">⏳ Pending</button>`;

        rowsHtml += `
          <tr>
            <td><b>${esc(s.name || s.login)}</b></td>
            <td style="text-align:center;">${tuition.attendedCount} / ${tuition.totalLessons}</td>
            <td style="text-align:center;">${tuition.autoAmount} ${currency}</td>
            <td style="text-align:center;">
              <input type="number" class="gcw-amt-input gcw-manual-amt-input" data-student-id="${esc(s.id)}" value="${esc(tuition.manualAmount)}" placeholder="${tuition.autoAmount}" title="Enter custom total amount or leave blank to use Auto Amount" style="width:80px; height:32px; padding:4px 8px; font-size:13px; text-align:center; border:1px solid var(--saas-border, #cbd5e1); border-radius:6px;">
            </td>
            <td style="text-align:center;">${statusBadge}</td>
          </tr>`;
      });

      const tbody = dialog.querySelector('#gcwInvoicesTableBody');
      if (tbody) tbody.innerHTML = rowsHtml;

      const totInvEl = dialog.querySelector('#gcwTotalInvoiced');
      if (totInvEl) totInvEl.textContent = `${totalInvoiced} ${currency}`;

      const colEl = dialog.querySelector('#gcwTotalCollected');
      if (colEl) colEl.textContent = `${totalCollected} ${currency} (${paidCount} Paid)`;

      const pendEl = dialog.querySelector('#gcwTotalPending');
      if (pendEl) pendEl.textContent = `${totalPending} ${currency} (${pendingCount} Due)`;

      const tabBadge = dialog.querySelector('#gcwInvoicesTabBadge');
      if (tabBadge) tabBadge.textContent = `${pendingCount} due`;

      // Manual amount editing
      dialog.querySelectorAll('.gcw-manual-amt-input').forEach(input => {
        input.oninput = () => {
          const stId = input.dataset.studentId;
          const val = input.value.trim();
          if (!monthData.studentPayments) monthData.studentPayments = {};
          if (!monthData.studentPayments[stId]) monthData.studentPayments[stId] = {};
          monthData.studentPayments[stId].manualAmount = val === '' ? null : Number(val);
          updateInvoicesDisplay();
        };
      });

      // Toggle paid status
      dialog.querySelectorAll('[data-toggle-paid]').forEach(btn => {
        btn.onclick = () => {
          const stId = btn.dataset.togglePaid;
          if (!monthData.studentPayments) monthData.studentPayments = {};
          if (!monthData.studentPayments[stId]) monthData.studentPayments[stId] = {};
          const currPaid = Boolean(monthData.studentPayments[stId].paid);
          monthData.studentPayments[stId].paid = !currPaid;
          monthData.studentPayments[stId].paidAt = !currPaid ? new Date().toISOString() : null;
          updateInvoicesDisplay();
        };
      });
    }
    updateInvoicesDisplay();

    // Close handler
    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = () => {
        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();
      };
    });

    // Clear deadline handler
    const clearBtn = dialog.querySelector('[data-action="clear-deadline"]');
    if (clearBtn) {
      clearBtn.onclick = async () => {
        monthData.paymentDeadline = '';
        monthData.paymentDeadlineTime = '';
        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();
        await saveGroupAttendanceData(groupId, state, container);
        paintGroupCalendarWidget(container, groupId, state);
      };
    }

    // Save handler
    const saveBtn = dialog.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        const newDeadline = deadlineInput.value || currentDeadline;
        const newDeadlineTime = deadlineTimeInput.value || '18:00';
        const newReq = dialog.querySelector('#gcwModalRequisites')?.value || currentRequisites;
        const newPrice = Number(dialog.querySelector('#gcwModalPricePerLesson')?.value) || currentPrice;
        const isAnchor = dialog.querySelector('#gcwModalAnchorToggle')?.checked !== false;

        monthData.paymentDeadline = newDeadline;
        monthData.paymentDeadlineTime = newDeadlineTime;
        monthData.paymentRequisites = newReq;
        monthData.pricePerLesson = newPrice;
        monthData.anchorToCycleEnd = isAnchor;
        monthData.paymentReminders = rules;

        if (!monthData.studentPayments) monthData.studentPayments = {};
        dialog.querySelectorAll('.gcw-manual-amt-input').forEach(input => {
          const stId = input.dataset.studentId;
          const val = input.value.trim();
          if (!monthData.studentPayments[stId]) monthData.studentPayments[stId] = {};
          monthData.studentPayments[stId].manualAmount = val === '' ? null : Number(val);
        });

        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();

        await saveGroupAttendanceData(groupId, state, container);
        paintGroupCalendarWidget(container, groupId, state);

        void postPaymentInvoiceToChat(groupId, state.groupTitle || 'Group', state, newDeadline, newReq, newDeadlineTime, rules, isAnchor);
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function showStudentLessonDialog(groupId, dateStr, lesson, exam, state, container) {
    const existing = document.getElementById('gcwStudentLessonModal');
    if (existing) existing.remove();

    const monthKey = state ? (state.year + '-' + String(state.monthIndex + 1).padStart(2, '0')) : dateStr.slice(0, 7);
    const monthData = state ? getMonthData(state, monthKey) : null;
    const authId = (typeof authUser !== 'undefined' && authUser) ? String(authUser.id) : '';
    const stDates = (monthData && monthData.attendance) ? (monthData.attendance[authId] || monthData.attendance['u' + authId] || monthData.attendance['s' + authId] || {}) : {};
    const currentAtt = stDates[dateStr];

    const title = lesson ? (lesson.title || 'Lesson') : (exam ? (exam.title || 'Exam') : 'Scheduled Group Lesson');
    const sched = (monthData && monthData.scheduleData && monthData.scheduleData[dateStr]) || null;
    const timeStr = sched ? `${sched.startTime} (${sched.durationMinutes || 60} min)` : '';

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwStudentLessonModal';
    dialog.className = 'gcw-scheduler-dialog';

    let statusBadge = '';
    if (currentAtt === 'absent') {
      statusBadge = '<div class="gcw-attendance-status-badge is-absent" style="margin-top:8px; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#991b1b; font-size:13px; font-weight:600;">⚠️ You have reported absence for this lesson.</div>';
    } else if (currentAtt === 'present') {
      statusBadge = '<div class="gcw-attendance-status-badge is-present" style="margin-top:8px; padding:8px 12px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:13px; font-weight:600;">✅ Attendance recorded: Present.</div>';
    }

    let openActionHtml = '';
    if (lesson && typeof window.lmOpenLesson === 'function') {
      openActionHtml = '<button type="button" class="btn primary" id="gcwStudentOpenLessonBtn" style="width:100%; margin-top:10px;">📖 Open Lesson Material</button>';
    } else if (exam && (typeof examOpenSelected === 'function' || typeof window.examOpenSelected === 'function')) {
      openActionHtml = '<button type="button" class="btn primary" id="gcwStudentOpenLessonBtn" style="width:100%; margin-top:10px;">📝 Open Exam</button>';
    }

    let html = `
      <div class="gcw-scheduler-head">
        <h3>Lesson details · ${esc(dateStr)}</h3>
        <button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>
      </div>
      <div class="gcw-scheduler-body">
        <div style="font-size:16px; font-weight:700; color:var(--ink);">${esc(title)}</div>
        ${timeStr ? `<div style="font-size:13px; color:var(--mute, #64748b); margin-top:4px;">🕒 Time: ${esc(timeStr)}</div>` : ''}
        ${statusBadge}
        ${openActionHtml}

        <div id="gcwStudentAbsenceSection" style="margin-top:16px; border-top:1px solid var(--saas-border, #e2e8f0); padding-top:12px;">
          ${currentAtt === 'absent' ? `
            <div style="font-size:13px; color:var(--mute, #64748b);">
              If your plans changed and you can attend, please notify your teacher in the group chat.
            </div>
          ` : `
            <div style="font-weight:600; font-size:13px; margin-bottom:4px; color:var(--ink);">Cannot attend this lesson?</div>
            <p style="font-size:12px; color:var(--mute, #64748b); margin:0 0 8px 0;">
              Notify your teacher directly so they can adjust the group plan.
            </p>
            <label style="display:block; font-size:12px; color:var(--mute, #64748b); margin-bottom:4px;">Reason for absence (optional):</label>
            <textarea id="gcwAbsenceReason" class="input" rows="2" style="width:100%; font-size:13px; margin-bottom:10px; resize:vertical; box-sizing:border-box;" placeholder="Doctor appointment, illness, travel..."></textarea>
            <button type="button" class="btn secondary" id="gcwReportAbsenceBtn" style="color:#b91c1c; border-color:#fca5a5;">⚠️ Report absence</button>
            <div id="gcwAbsenceStatus" style="display:none; font-size:13px; margin-top:8px;"></div>
          `}
        </div>
      </div>
      <div class="gcw-scheduler-foot">
        <button type="button" class="btn ghost" data-action="close">Close</button>
      </div>`;

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    const closeDialog = () => {
      if (typeof dialog.close === 'function') dialog.close();
      dialog.remove();
    };

    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = closeDialog;
    });

    const openBtn = dialog.querySelector('#gcwStudentOpenLessonBtn');
    if (openBtn) {
      openBtn.onclick = () => {
        closeDialog();
        if (lesson && typeof window.lmOpenLesson === 'function') {
          window.lmOpenLesson(lesson.id);
        } else if (exam) {
          if (typeof examOpenSelected === 'function') examOpenSelected(exam.id);
          else if (typeof window.examOpenSelected === 'function') window.examOpenSelected(exam.id);
        }
      };
    }

    const reportBtn = dialog.querySelector('#gcwReportAbsenceBtn');
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const reasonInput = dialog.querySelector('#gcwAbsenceReason');
        const reason = reasonInput ? reasonInput.value.trim() : '';
        const statusBox = dialog.querySelector('#gcwAbsenceStatus');

        reportBtn.disabled = true;
        reportBtn.textContent = 'Reporting...';

        try {
          const fetchFn = typeof accountFetch === 'function' ? accountFetch : fetch;
          const res = await fetchFn('/api/groups/absence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ groupId: Number(groupId), date: dateStr, reason }),
            quietBug: true
          });

          if (!res || !res.ok) {
            throw new Error('Failed to record absence');
          }

          if (monthData) {
            if (!monthData.attendance) monthData.attendance = {};
            if (!monthData.attendance[authId]) monthData.attendance[authId] = {};
            monthData.attendance[authId][dateStr] = 'absent';
          }

          const studentName = (typeof authUser !== 'undefined' && authUser) ? (authUser.name || authUser.login || 'Student') : 'Student';
          const msgLines = [
            `📢 Absence Notice: ${studentName}`,
            `Date: ${dateStr}`,
            `Lesson: ${title}`
          ];
          if (timeStr) msgLines.push(`Time: ${timeStr}`);
          msgLines.push(reason ? `Reason: ${reason}` : 'Reason: Not specified');
          const chatMsg = msgLines.join('\n');

          try {
            await dispatchCalendarChat(groupId, chatMsg, { category: 'personal' });
          } catch {
            if (statusBox) {
              statusBox.style.display = 'block';
              statusBox.style.color = '#b91c1c';
              statusBox.textContent = 'Absence recorded. The chat notice could not be sent. Check the chat connection.';
            }
            reportBtn.remove();
            if (reasonInput) reasonInput.disabled = true;
            if (container && state && typeof renderCalendar === 'function') renderCalendar(container, state);
            return;
          }

          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.color = '#065f46';
            statusBox.innerHTML = '<b>✅ Absence recorded.</b> Teacher notified in group chat.';
          }
          reportBtn.remove();
          if (reasonInput) reasonInput.disabled = true;

          if (container && state && typeof renderCalendar === 'function') {
            renderCalendar(container, state);
          }
        } catch (err) {
          reportBtn.disabled = false;
          reportBtn.textContent = '⚠️ Report absence';
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.color = '#b91c1c';
            statusBox.textContent = 'Failed to record absence. Please try again or message teacher.';
          }
        }
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function showStudentPaymentDialog(groupId, dateStr, state, container) {
    const existing = document.getElementById('gcwStudentPaymentModal');
    if (existing) existing.remove();

    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    const currency = monthData.currency || 'BYN';
    const authId = (typeof authUser !== 'undefined' && authUser) ? String(authUser.id) : '';
    const tuition = calculateStudentTuition(groupId, state, authId);

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwStudentPaymentModal';
    dialog.className = 'gcw-scheduler-dialog';

    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    const icsUrl = `${origin}/api/groups/payment-deadline.ics?groupId=${encodeURIComponent(groupId)}&date=${encodeURIComponent(dateStr)}&title=${encodeURIComponent('Tuition Payment Due')}&isEndMonth=${tuition.isEndMonth}&requisites=${encodeURIComponent(monthData.paymentRequisites || '')}`;

    const dtClean = dateStr.replace(/-/g, '');
    const gCalUrl = new URL('https://calendar.google.com/calendar/render');
    gCalUrl.searchParams.set('action', 'TEMPLATE');
    gCalUrl.searchParams.set('text', `Tuition Payment Due · ${state.groupTitle || 'Group'}`);
    gCalUrl.searchParams.set('dates', `${dtClean}T100000/${dtClean}T120000`);
    gCalUrl.searchParams.set('details', `Payment due for ${monthKey}.\nAmount: ${tuition.finalAmount} ${currency}\nRequisites:\n${monthData.paymentRequisites || 'Bank transfer / Card / ERIP'}`);
    gCalUrl.searchParams.set('ctz', 'Europe/Minsk');

    let html = `
      <div class="gcw-scheduler-head">
        <h3>Tuition Payment & Bill</h3>
        <button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>
      </div>
      <div class="gcw-scheduler-body">
        <div style="font-size:15px; font-weight:700; color:var(--ink);">
          Payment Due: ${tuition.finalAmount} ${currency}
        </div>
        <div style="font-size:13px; color:var(--mute, #64748b);">
          Attendance: ${tuition.attendedCount} / ${tuition.totalLessons} lessons attended (${tuition.pricePerLesson} ${currency} per lesson)
        </div>
        <div style="font-size:13px; color:var(--ink); margin-top:8px;">
          <b>Deadline Date:</b> ${esc(dateStr)}
        </div>
        <div class="gcw-field-group" style="margin-top:8px;">
          <label>Payment Requisites</label>
          <div style="padding:10px 12px; background:var(--saas-card-muted, #f8fafc); border:1px solid var(--saas-border, #e2e8f0); border-radius:8px; font-size:13px; white-space:pre-wrap;">
            ${esc(monthData.paymentRequisites || 'Bank transfer / Card / ERIP: BY00 ALFA 0000 0000 0000 0000 0000 (Recipient: English Study)')}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; font-size:13px; margin-top:6px;">
          <a href="${gCalUrl.toString()}" target="_blank" rel="noopener noreferrer" style="color:var(--acc, #0d9488); font-weight:600;">📅 Add reminder to Google Calendar</a>
          <a href="${icsUrl}" download="payment-deadline.ics" style="color:var(--acc, #0d9488); font-weight:600;">📥 Download .ics Calendar File</a>
        </div>
        <div id="gcwPaymentStatusBox" style="margin-top:12px; padding:10px 14px; border-radius:8px; background:${tuition.isPaid ? '#ecfdf5' : '#fffbeb'}; border:1px solid ${tuition.isPaid ? '#a7f3d0' : '#fde68a'}; font-size:13px;">
          ${tuition.isPaid
            ? '<b style="color:#065f46;">✅ Payment Confirmed!</b> Thank you for paying on time.'
            : '<b style="color:#92400e;">⏳ Pending Payment.</b> Once transferred, click the button below.'}
        </div>
      </div>
      <div class="gcw-scheduler-foot">
        <button type="button" class="btn ghost" data-action="close">Close</button>
        ${!tuition.isPaid ? '<button type="button" class="btn primary" id="gcwStudentPaidBtn">✅ I have paid</button>' : ''}
      </div>`;

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = () => {
        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();
      };
    });

    const paidBtn = dialog.querySelector('#gcwStudentPaidBtn');
    if (paidBtn) {
      paidBtn.onclick = async () => {
        paidBtn.disabled = true;
        if (!monthData.studentPayments) monthData.studentPayments = {};
        if (!monthData.studentPayments[authId]) monthData.studentPayments[authId] = {};
        monthData.studentPayments[authId].paid = true;
        monthData.studentPayments[authId].paidAt = new Date().toISOString();

        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();

        await saveGroupAttendanceData(groupId, state, container);
        paintGroupCalendarWidget(container, groupId, state);

        try {
          if (typeof window.ensureMessages === 'function') await window.ensureMessages();
          const studentName = (typeof authUser !== 'undefined' && authUser) ? (authUser.name || authUser.login || 'Student') : 'Student';
          const msg = `✅ PAYMENT CONFIRMATION: Student ${studentName} confirmed tuition payment of ${tuition.finalAmount} ${currency} for ${monthKey}.`;
          if (typeof window.sendGroupChatMessage === 'function') {
            await window.sendGroupChatMessage(groupId, msg);
          }
        } catch {}
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeCalendarContextMenu() {
    const existing = document.getElementById('gcwContextMenu');
    if (existing) existing.remove();
  }

  function openCalendarContextMenu(clientX, clientY, groupId, dateStr, isScheduled, dayBtn, state, container, canEdit) {
    closeCalendarContextMenu();
    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    const lessons = getLessonsForDate(groupId, dateStr);
    const exams = getExamsForDate(groupId, dateStr);
    const isDeadline = monthData.paymentDeadline === dateStr;

    const menu = document.createElement('div');
    menu.id = 'gcwContextMenu';
    menu.className = 'gcw-context-menu';
    menu.setAttribute('role', 'menu');

    let menuHtml = '';
    if (!canEdit) {
      if (lessons.length > 0) {
        menuHtml += '<button type="button" class="gcw-menu-item" data-action="open-lesson">📖 Open lesson (' + esc(lessons[0].title) + ')</button>';
      } else if (exams.length > 0) {
        menuHtml += '<button type="button" class="gcw-menu-item" data-action="open-exam">📝 Open exam</button>';
      }
      menuHtml += '<button type="button" class="gcw-menu-item" data-action="report-absence" style="color:#b91c1c;">⚠️ Report absence</button>';
      if (isDeadline) {
        menuHtml += '<div class="gcw-menu-divider"></div>';
        menuHtml += '<button type="button" class="gcw-menu-item" data-action="payment-dialog">💳 View tuition bill</button>';
      }
    } else {
      menuHtml += '<button type="button" class="gcw-menu-item" data-action="schedule">📅 Schedule lesson</button>';
      if (lessons.length > 0) {
        menuHtml += '<button type="button" class="gcw-menu-item" data-action="open-lesson">📖 Open lesson (' + esc(lessons[0].title) + ')</button>';
      } else {
        menuHtml += '<button type="button" class="gcw-menu-item" data-action="open-lesson" disabled>📖 Open lesson</button>';
      }
      menuHtml += '<button type="button" class="gcw-menu-item" data-action="toggle-scheduled">🔄 ' + (isScheduled ? 'Remove from schedule' : 'Mark as scheduled date') + '</button>';
      menuHtml += '<div class="gcw-menu-divider"></div>';
      menuHtml += '<button type="button" class="gcw-menu-item" data-action="payment-deadline">💳 ' + (isDeadline ? 'Clear payment deadline' : 'Set as payment deadline') + '</button>';
    }

    menu.innerHTML = menuHtml;
    document.body.appendChild(menu);

    const menuWidth = 220;
    const menuHeight = 160;
    let left = clientX;
    let top = clientY;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - menuWidth - 8);
    }
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuHeight - 8);
    }
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.gcw-menu-item');
      if (!btn || btn.disabled) return;
      const action = btn.dataset.action;
      closeCalendarContextMenu();

      if (action === 'schedule') {
        showLessonSchedulerModal(groupId, dateStr, state, container);
      } else if (action === 'open-lesson') {
        if (lessons.length === 1 && typeof window.lmOpenLesson === 'function') {
          window.lmOpenLesson(lessons[0].id);
        } else if (lessons.length > 1) {
          showEventChoiceDialog(dateStr, lessons, [], { canEdit, groupId, state, container });
        }
      } else if (action === 'open-exam') {
        if (exams.length === 1) {
          if (typeof examOpenSelected === 'function') examOpenSelected(exams[0].id);
          else if (typeof window.examOpenSelected === 'function') window.examOpenSelected(exams[0].id);
        } else if (exams.length > 1) {
          showEventChoiceDialog(dateStr, [], exams, { canEdit, groupId, state, container });
        }
      } else if (action === 'report-absence') {
        showStudentLessonDialog(groupId, dateStr, lessons[0] || null, exams[0] || null, state, container);
      } else if (action === 'payment-dialog') {
        showStudentPaymentDialog(groupId, dateStr, state, container);
      } else if (action === 'toggle-scheduled') {
        state.selectedDate = dateStr;
        if (isScheduled) {
          showRemoveScheduleModal(groupId, dateStr, state, container);
        } else {
          monthData.lessonDates.add(dateStr);
          saveGroupAttendanceData(groupId, state.monthIndex, monthData);
          paintGroupCalendarWidget(container, groupId, state);
        }
      } else if (action === 'payment-deadline') {
        state.selectedDate = dateStr;
        showPaymentDeadlineModal(groupId, dateStr, state, container);
      }
    });

    setTimeout(() => {
      function onDocClick(ev) {
        if (!menu.contains(ev.target)) {
          closeCalendarContextMenu();
          document.removeEventListener('click', onDocClick, true);
          document.removeEventListener('keydown', onKey);
        }
      }
      function onKey(ev) {
        if (ev.key === 'Escape') {
          closeCalendarContextMenu();
          document.removeEventListener('click', onDocClick, true);
          document.removeEventListener('keydown', onKey);
        }
      }
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKey);
    }, 10);
  }

  async function postLessonAlertToChat(groupId, groupTitle, dateStr, startTime, durationMinutes, period, materialTitle, isReschedule, selectedDayCodes, customUntilDate) {
    try {
      if (typeof window.ensureMessages === 'function') {
        await window.ensureMessages();
      }

      const dObj = new Date(dateStr + 'T00:00:00');
      const weekdayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
      const [sh, sm] = startTime.split(':').map(Number);
      const totalMin = (isNaN(sh) ? 18 : sh) * 60 + (isNaN(sm) ? 30 : sm) + durationMinutes;
      const eh = Math.floor(totalMin / 60) % 24;
      const em = totalMin % 60;
      const endTime = String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');

      const dtClean = dateStr.replace(/-/g, '');
      const stClean = String(isNaN(sh) ? 18 : sh).padStart(2, '0') + String(isNaN(sm) ? 30 : sm).padStart(2, '0') + '00';
      const etClean = String(eh).padStart(2, '0') + String(em).padStart(2, '0') + '00';
      const googleDates = `${dtClean}T${stClean}/${dtClean}T${etClean}`;

      const [y, m] = dateStr.split('-').map(Number);
      const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      const defaultDayCode = dayCodes[dObj.getDay()];
      let byDayStr = defaultDayCode;
      if (Array.isArray(selectedDayCodes) && selectedDayCodes.length > 0) {
        byDayStr = Array.from(new Set(selectedDayCodes)).join(',');
      } else if (typeof selectedDayCodes === 'string' && selectedDayCodes.length > 0) {
        byDayStr = selectedDayCodes;
      }

      let gRecur = '';
      if (period === 'month') {
        const lastDay = new Date(y, m, 0).getDate();
        gRecur = `RRULE:FREQ=WEEKLY;BYDAY=${byDayStr};UNTIL=${y}${String(m).padStart(2, '0')}${String(lastDay).padStart(2, '0')}T235959Z`;
      } else if (period === 'academic_year') {
        const endYear = m >= 9 ? y + 1 : y;
        gRecur = `RRULE:FREQ=WEEKLY;BYDAY=${byDayStr};UNTIL=${endYear}0531T235959Z`;
      } else if (period === 'custom' && customUntilDate) {
        const untilClean = String(customUntilDate).replace(/-/g, '');
        gRecur = `RRULE:FREQ=WEEKLY;BYDAY=${byDayStr};UNTIL=${untilClean}T235959Z`;
      }

      const gCalUrl = new URL('https://calendar.google.com/calendar/render');
      gCalUrl.searchParams.set('action', 'TEMPLATE');
      gCalUrl.searchParams.set('text', `English Lesson · ${groupTitle}`);
      gCalUrl.searchParams.set('dates', googleDates);
      gCalUrl.searchParams.set('details', `English Lesson (${materialTitle || 'Group Lesson'}). Reminders preconfigured 1 hour and 15 minutes before class.`);
      if (gRecur) gCalUrl.searchParams.set('recur', gRecur);
      gCalUrl.searchParams.set('ctz', 'Europe/Minsk');

      const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
      const icsUrl = `${origin}/api/groups/calendar.ics?groupId=${encodeURIComponent(groupId)}&date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(startTime)}&duration=${durationMinutes}&period=${encodeURIComponent(period)}&title=${encodeURIComponent(groupTitle)}&material=${encodeURIComponent(materialTitle || '')}`;

      const periodLabel = period === 'month'
        ? 'Current Month (Weekly)'
        : period === 'academic_year'
          ? 'Academic Year (Weekly Sep – May)'
          : period === 'custom'
            ? 'Custom Period'
            : 'Single Session';

      const headerTitle = isReschedule
        ? '⚠️ SCHEDULE UPDATE: Lesson Rescheduled'
        : '📅 CLASS SCHEDULE ANNOUNCEMENT';

      const lines = [
        headerTitle,
        'Group: ' + groupTitle,
        'Date: ' + weekdayName + ', ' + dateStr,
        'Time: ' + startTime + ' – ' + endTime + ' (' + durationMinutes + ' min)',
        materialTitle ? ('Material: ' + materialTitle) : null,
        'Period: ' + periodLabel,
        '',
        '👉 Students, please add this lesson to your calendar so you do not miss it:',
        `• [📅 Add to Google Calendar](${gCalUrl.toString()})`,
        `• [📥 Download .ics Reminder](${icsUrl})`,
        '',
        '🔔 Reminders are preconfigured to notify you 1 hour and 15 minutes before the lesson.'
      ].filter(l => l !== null);

      const messageText = lines.join('\n');

      if (typeof window.sendGroupChatMessage === 'function') {
        await window.sendGroupChatMessage(groupId, messageText);
      }
    } catch {
      // Non-blocking notification dispatch
    }
  }
  window.postLessonAlertToChat = postLessonAlertToChat;

  function showSetGroupScheduleModal(groupId, state, container) {
    const existingModal = document.getElementById('gcwSetGroupScheduleDialog');
    if (existingModal) existingModal.remove();

    let currentStartTime = '18:30';
    let currentDuration = 60;
    let currentPeriod = 'month';

    const weekdaysDef = [
      { day: 1, label: 'Mo', name: 'Monday' },
      { day: 2, label: 'Tu', name: 'Tuesday' },
      { day: 3, label: 'We', name: 'Wednesday' },
      { day: 4, label: 'Th', name: 'Thursday' },
      { day: 5, label: 'Fr', name: 'Friday' },
      { day: 6, label: 'Sa', name: 'Saturday' },
      { day: 0, label: 'Su', name: 'Sunday' }
    ];
    const selectedDays = new Set([1, 3]);

    const dRef = new Date(state.year, state.monthIndex, 1);
    const monthName = dRef.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    const groupLessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];
    const groupMaterials = [];
    if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
      for (const mat of lmLibrary.materials) {
        const isGroupLesson = groupLessonIds.includes(String(mat.id)) || Number(mat.groupId) === Number(groupId);
        if (!mat.hidden && isGroupLesson) {
          groupMaterials.push(mat);
        }
      }
    }

    const tzName = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Minsk';

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwSetGroupScheduleDialog';
    dialog.className = 'gcw-scheduler-dialog';

    let html = '';
    html += '<div class="gcw-scheduler-head">';
    html += '<h3><span>📅</span> Set Group Schedule</h3>';
    html += '<button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>';
    html += '</div>';

    html += '<div class="gcw-scheduler-body">';

    html += '<div class="gcw-field-group">';
    html += '<label>Days of the Week</label>';
    html += '<div class="gcw-weekday-chips-row">';
    weekdaysDef.forEach(w => {
      const isAct = selectedDays.has(w.day) ? ' is-active' : '';
      html += '<button type="button" class="gcw-day-chip' + isAct + '" data-day="' + w.day + '" title="' + esc(w.name) + '">' + esc(w.label) + '</button>';
    });
    html += '</div>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label for="gcwGroupSchedStartTime">Start Time</label>';
    html += '<input type="time" id="gcwGroupSchedStartTime" value="' + esc(currentStartTime) + '">';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label>Duration</label>';
    html += '<div class="gcw-duration-group">';
    [45, 60, 90, 120].forEach(dur => {
      const activeClass = dur === currentDuration ? ' is-active' : '';
      html += '<button type="button" class="gcw-duration-btn' + activeClass + '" data-dur="' + dur + '">' + dur + ' min</button>';
    });
    html += '</div>';
    html += '<div class="gcw-custom-duration-wrap">';
    html += '<label for="gcwGroupCustomDurInput">Custom:</label>';
    html += '<input type="number" id="gcwGroupCustomDurInput" class="gcw-custom-duration-input" placeholder="' + currentDuration + '" min="15" max="360" step="5">';
    html += '<span>min</span>';
    html += '</div>';
    html += '</div>';

    const initialEndTime = formatEndTime(currentStartTime, currentDuration);
    html += '<div class="gcw-time-preview" id="gcwGroupTimePreview">';
    html += '<span>🕒</span> <span>Class window: <strong>' + esc(currentStartTime) + ' – ' + esc(initialEndTime) + '</strong> (' + currentDuration + ' min)</span>';
    html += '</div>';

    html += '<div class="gcw-tz-preview-box">';
    html += '<div class="gcw-tz-title">Group Timezone & Sync Preview</div>';
    html += '<div>Timezone: <b>' + esc(tzName) + ' (Teacher / Group Timezone)</b></div>';
    html += '<div class="gcw-tz-hint">Mode: Automatic "In Class" status will activate during this scheduled window.</div>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label>Schedule Recurrence Period</label>';
    html += '<div class="gcw-period-options">';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwGroupPeriod" value="month"' + (currentPeriod === 'month' ? ' checked' : '') + '> <span id="gcwGroupRadioMonthLabel">Current Month (' + esc(monthName) + ')</span></label>';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwGroupPeriod" value="academic_year"' + (currentPeriod === 'academic_year' ? ' checked' : '') + '> <span>Academic Year (Sep 1 – May 31)</span></label>';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwGroupPeriod" value="custom"' + (currentPeriod === 'custom' ? ' checked' : '') + '> <span>Custom Period</span></label>';
    html += '</div>';
    const defStart = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0') + '-01';
    html += '<div id="gcwGroupCustomBox" style="display:none; gap:10px; margin-top:8px;">';
    html += '<label style="flex:1;">From' +
      '<div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:6px; margin-top:4px;">' +
        '<input type="text" id="gcwGroupCustStart" value="' + esc(defStart) + '" placeholder="YYYY-MM-DD" style="flex:1;" readonly>' +
        '<button type="button" class="btn icon-btn" id="gcwGroupCustStartBtn" title="Choose date" aria-label="Choose date" style="min-width:34px; height:34px; padding:0 6px;">📅</button>' +
      '</div>' +
    '</label>';
    html += '<label style="flex:1;">To' +
      '<div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:6px; margin-top:4px;">' +
        '<input type="text" id="gcwGroupCustEnd" value="' + esc(defStart) + '" placeholder="YYYY-MM-DD" style="flex:1;" readonly>' +
        '<button type="button" class="btn icon-btn" id="gcwGroupCustEndBtn" title="Choose date" aria-label="Choose date" style="min-width:34px; height:34px; padding:0 6px;">📅</button>' +
      '</div>' +
    '</label>';
    html += '</div>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label><input type="checkbox" id="gcwSequentialMaterials" checked style="margin-right:6px; accent-color:var(--pri, #0284c7);"> Sequentially distribute course lessons across dates</label>';
    html += '<div style="font-size:12px; color:var(--mute, #64748b); margin-top:4px;">' + (groupMaterials.length ? (groupMaterials.length + ' available materials in group course will be assigned one by one to scheduled dates.') : 'No materials linked yet; dates will be scheduled as standard group sessions.') + '</div>';
    html += '<div id="gcwGroupRepeatWarning" class="gcw-repeat-warning" style="display:none;">';
    html += '<span style="font-size:14px; line-height:1; margin-right:4px;">⚠️</span>';
    html += '<span id="gcwGroupRepeatWarningText"></span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="gcw-field-group gcw-publish-immediately-group">';
    html += '<label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">';
    html += '<input type="checkbox" id="gcwPublishImmediately" checked style="margin-top:2px; accent-color:#16a34a; width:16px; height:16px;">';
    html += '<div>';
    html += '<span style="font-size:13px; font-weight:700; color:#166534;">Publish and activate lessons immediately <span class="highlight-pill" style="display:inline-block; padding:2px 7px; background:#dcfce7; color:#15803d; border-radius:4px; font-size:11px; font-weight:700; margin-left:6px;">Recommended</span></span>';
    html += '<div style="font-size:11px; font-weight:400; color:#15803d; margin-top:2px; line-height:1.4;">Immediately binds materials to dates and activates them as live group sessions (green dots) instead of leaving them as unlinked draft slots (red dots).</div>';
    html += '</div>';
    html += '</label>';
    html += '</div>';

    html += '</div>'; // gcw-scheduler-body

    html += '<div class="gcw-scheduler-foot">';
    html += '<button type="button" class="btn ghost" data-action="close">Cancel</button>';
    html += '<button type="button" class="btn primary" data-action="save">Save Group Schedule</button>';
    html += '</div>';

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    function updateRepeatWarning() {
      const warnEl = dialog.querySelector('#gcwGroupRepeatWarning');
      const warnTextEl = dialog.querySelector('#gcwGroupRepeatWarningText');
      if (!warnEl || !warnTextEl) return;
      const seqMaterials = dialog.querySelector('#gcwSequentialMaterials')?.checked;
      const custStartVal = dialog.querySelector('#gcwGroupCustStart')?.value;
      const custEndVal = dialog.querySelector('#gcwGroupCustEnd')?.value;
      const targetDates = computeTargetDates(currentPeriod, custStartVal, custEndVal);
      if (seqMaterials && groupMaterials.length > 0 && targetDates.length > groupMaterials.length) {
        warnEl.style.display = 'flex';
        warnTextEl.innerHTML = '<strong>Material repeating notice:</strong> ' + groupMaterials.length + ' available materials will be repeated in cycle to fill ' + targetDates.length + ' selected dates.';
      } else {
        warnEl.style.display = 'none';
      }
    }

    function updatePreview() {
      const timeIn = dialog.querySelector('#gcwGroupSchedStartTime');
      currentStartTime = timeIn ? timeIn.value : currentStartTime;
      const endT = formatEndTime(currentStartTime, currentDuration);
      const prevEl = dialog.querySelector('#gcwGroupTimePreview');
      if (prevEl) {
        prevEl.innerHTML = '<span>🕒</span> <span>Class window: <strong>' + esc(currentStartTime) + ' – ' + esc(endT) + '</strong> (' + currentDuration + ' min)</span>';
      }
    }

    dialog.querySelectorAll('.gcw-duration-btn').forEach(btn => {
      btn.onclick = () => {
        dialog.querySelectorAll('.gcw-duration-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentDuration = Number(btn.dataset.dur) || 60;
        const custIn = dialog.querySelector('#gcwGroupCustomDurInput');
        if (custIn) custIn.value = '';
        updatePreview();
      };
    });

    const custDurInput = dialog.querySelector('#gcwGroupCustomDurInput');
    if (custDurInput) {
      custDurInput.oninput = () => {
        const val = parseInt(custDurInput.value, 10);
        if (val && val >= 15 && val <= 360) {
          dialog.querySelectorAll('.gcw-duration-btn').forEach(b => b.classList.remove('is-active'));
          currentDuration = val;
          updatePreview();
        }
      };
    }

    dialog.querySelectorAll('.gcw-day-chip').forEach(chip => {
      chip.onclick = () => {
        const day = Number(chip.dataset.day);
        if (selectedDays.has(day)) {
          if (selectedDays.size > 1) {
            selectedDays.delete(day);
            chip.classList.remove('is-active');
          }
        } else {
          selectedDays.add(day);
          chip.classList.add('is-active');
        }
        updateRepeatWarning();
      };
    });

    const timeInput = dialog.querySelector('#gcwGroupSchedStartTime');
    if (timeInput) timeInput.onchange = updatePreview;

    const customBox = dialog.querySelector('#gcwGroupCustomBox');
    dialog.querySelectorAll('input[name="gcwGroupPeriod"]').forEach(r => {
      r.onchange = () => {
        currentPeriod = r.value;
        if (customBox) {
          customBox.style.display = currentPeriod === 'custom' ? 'flex' : 'none';
        }
        updateRepeatWarning();
      };
    });

    const startBtn = dialog.querySelector('#gcwGroupCustStartBtn');
    if (startBtn) {
      startBtn.onclick = () => {
        const custStart = dialog.querySelector('#gcwGroupCustStart');
        const curVal = custStart ? custStart.value : defStart;
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(startBtn, curVal, (newDate) => {
            if (newDate && custStart) {
              custStart.value = newDate;
              updateRepeatWarning();
            }
          });
        }
      };
    }

    const endBtn = dialog.querySelector('#gcwGroupCustEndBtn');
    if (endBtn) {
      endBtn.onclick = () => {
        const custEnd = dialog.querySelector('#gcwGroupCustEnd');
        const curVal = custEnd ? custEnd.value : defStart;
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(endBtn, curVal, (newDate) => {
            if (newDate && custEnd) {
              custEnd.value = newDate;
              updateRepeatWarning();
            }
          });
        }
      };
    }

    const seqCheckbox = dialog.querySelector('#gcwSequentialMaterials');
    if (seqCheckbox) {
      seqCheckbox.onchange = updateRepeatWarning;
    }
    updateRepeatWarning();

    const closeDialog = () => {
      dialog.close();
      dialog.remove();
    };

    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = closeDialog;
    });

    function computeTargetDates(period, customStart, customEnd) {
      const dates = [];
      let startD, endD;
      if (period === 'month') {
        startD = new Date(state.year, state.monthIndex, 1);
        endD = new Date(state.year, state.monthIndex + 1, 0);
      } else if (period === 'academic_year') {
        const y = state.year;
        const m = state.monthIndex + 1;
        startD = new Date(y, m - 1, 1);
        const endYear = m >= 9 ? y + 1 : y;
        endD = new Date(endYear, 4, 31);
      } else {
        startD = customStart ? new Date(customStart + 'T00:00:00') : new Date(state.year, state.monthIndex, 1);
        endD = customEnd ? new Date(customEnd + 'T00:00:00') : new Date(state.year, state.monthIndex + 1, 0);
      }
      const cur = new Date(startD);
      while (cur <= endD) {
        if (selectedDays.has(cur.getDay())) {
          const ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
          dates.push(ds);
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }

    const saveBtn = dialog.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const custStartVal = dialog.querySelector('#gcwGroupCustStart')?.value;
        const custEndVal = dialog.querySelector('#gcwGroupCustEnd')?.value;
        const targetDates = computeTargetDates(currentPeriod, custStartVal, custEndVal);
        if (!targetDates.length) {
          alert('No dates match the selected days of the week.');
          return;
        }

        const seqMaterials = dialog.querySelector('#gcwSequentialMaterials')?.checked;
        const publishImmediately = dialog.querySelector('#gcwPublishImmediately')?.checked;

        targetDates.forEach((d, idx) => {
          const mKey = d.slice(0, 7);
          const mData = getMonthData(state, mKey);
          if (!mData.lessonDates) {
            mData.lessonDates = new Set();
          } else if (Array.isArray(mData.lessonDates)) {
            mData.lessonDates = new Set(mData.lessonDates);
          }
          mData.lessonDates.add(d);
          if (!mData.scheduleData) mData.scheduleData = {};
          let assignedMat = null;
          if (seqMaterials && groupMaterials.length > 0) {
            assignedMat = groupMaterials[idx % groupMaterials.length];
          }
          mData.scheduleData[d] = {
            startTime: currentStartTime,
            durationMinutes: currentDuration,
            period: currentPeriod,
            materialId: assignedMat ? String(assignedMat.id) : (mData.scheduleData[d]?.materialId || ''),
            published: Boolean(publishImmediately && assignedMat)
          };

          if (publishImmediately && assignedMat) {
            assignedMat.date = d;
            if (!Array.isArray(assignedMat.dates)) {
              assignedMat.dates = assignedMat.date ? [assignedMat.date] : [];
            }
            if (!assignedMat.dates.includes(d)) assignedMat.dates.push(d);
            assignedMat.time = currentStartTime;
            if (!assignedMat.groupId) assignedMat.groupId = groupId;
            if (grp && Array.isArray(grp.lessonIds) && !grp.lessonIds.map(String).includes(String(assignedMat.id))) {
              grp.lessonIds.push(assignedMat.id);
            }
          }
        });

        if (publishImmediately && typeof lmPersist === 'function') {
          lmPersist();
        }

        await saveGroupAttendanceData(groupId, state, container);

        const firstDate = targetDates[0];
        const alertMaterialTitle = (seqMaterials && groupMaterials.length > 0) ? groupMaterials[0].title : 'Group Course Lessons';
        const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        const selectedDayCodes = Array.from(new Set(targetDates.map(d => {
          const [dy, dm, dd] = d.split('-').map(Number);
          return dayMap[new Date(dy, dm - 1, dd).getDay()];
        })));
        void postLessonAlertToChat(groupId, state.groupTitle || 'Group', firstDate, currentStartTime, currentDuration, currentPeriod, alertMaterialTitle, false, selectedDayCodes, custEndVal);

        closeDialog();
        window.renderGroupCalendarWidget(container, groupId, state.groupTitle);
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function showRemoveScheduleModal(groupId, dateStr, state, container) {
    const existingModal = document.getElementById('gcwRemoveScheduleDialog');
    if (existingModal) existingModal.remove();

    const dObj = new Date(dateStr + 'T00:00:00');
    let weekdayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
    let monthName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const weekdaysDef = [
      { day: 1, label: 'Mo', name: 'Monday' },
      { day: 2, label: 'Tu', name: 'Tuesday' },
      { day: 3, label: 'We', name: 'Wednesday' },
      { day: 4, label: 'Th', name: 'Thursday' },
      { day: 5, label: 'Fr', name: 'Friday' },
      { day: 6, label: 'Sa', name: 'Saturday' },
      { day: 0, label: 'Su', name: 'Sunday' }
    ];
    const selectedDays = new Set([dObj.getDay()]);

    function getDaysText() {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const active = order.filter(d => selectedDays.has(d));
      if (!active.length) return weekdayName;
      return active.map(d => weekdaysDef.find(w => w.day === d)?.label || '').join(', ');
    }

    let currentPeriod = 'single';

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwRemoveScheduleDialog';
    dialog.className = 'gcw-scheduler-dialog gcw-remove-dialog';

    let html = '';
    html += '<div class="gcw-scheduler-head">';
    html += '<h3><span>🗑️</span> Remove from Schedule</h3>';
    html += '<button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>';
    html += '</div>';

    html += '<div class="gcw-scheduler-body">';

    html += '<div class="gcw-field-group">';
    html += '<label for="gcwRemoveDateBtn">Selected Date</label>';
    html += '<button type="button" class="gcw-date-picker-btn" id="gcwRemoveDateBtn" title="Click to choose a date from calendar">';
    html += '<span id="gcwRemoveDateText">' + esc(weekdayName) + ', ' + esc(dateStr) + '</span>';
    html += '<span aria-hidden="true">📅</span>';
    html += '</button>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label>Remove on Days of the Week</label>';
    html += '<div class="gcw-weekday-chips-row">';
    weekdaysDef.forEach(w => {
      const isAct = selectedDays.has(w.day) ? ' is-active' : '';
      html += '<button type="button" class="gcw-day-chip' + isAct + '" data-day="' + w.day + '" title="' + esc(w.name) + '">' + esc(w.label) + '</button>';
    });
    html += '</div>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label>Removal Recurrence Period</label>';
    html += '<div class="gcw-period-options">';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwRemovePeriod" value="single"' + (currentPeriod === 'single' ? ' checked' : '') + '> <span>This date only (' + esc(dateStr) + ')</span></label>';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwRemovePeriod" value="month"' + (currentPeriod === 'month' ? ' checked' : '') + '> <span id="gcwRemoveRadioMonthLabel">Current Month (every ' + esc(getDaysText()) + ' in ' + esc(monthName) + ')</span></label>';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwRemovePeriod" value="academic_year"' + (currentPeriod === 'academic_year' ? ' checked' : '') + '> <span id="gcwRemoveRadioYearLabel">Academic Year (every ' + esc(getDaysText()) + ' Sep 1 – May 31)</span></label>';
    html += '<label class="gcw-radio-label"><input type="radio" name="gcwRemovePeriod" value="custom"' + (currentPeriod === 'custom' ? ' checked' : '') + '> <span>Custom Period</span></label>';
    html += '</div>';
    html += '<div id="gcwRemoveCustomBox" style="display:none; gap:10px; margin-top:8px;">';
    html += '<label style="flex:1;">From' +
      '<div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:6px; margin-top:4px;">' +
        '<input type="text" id="gcwRemoveCustStart" value="' + esc(dateStr) + '" placeholder="YYYY-MM-DD" style="flex:1;" readonly>' +
        '<button type="button" class="btn icon-btn" id="gcwRemoveCustStartBtn" title="Choose date" aria-label="Choose date" style="min-width:34px; height:34px; padding:0 6px;">📅</button>' +
      '</div>' +
    '</label>';
    html += '<label style="flex:1;">To' +
      '<div class="gcw-date-picker-wrap" style="display:flex; align-items:center; gap:6px; margin-top:4px;">' +
        '<input type="text" id="gcwRemoveCustEnd" value="' + esc(dateStr) + '" placeholder="YYYY-MM-DD" style="flex:1;" readonly>' +
        '<button type="button" class="btn icon-btn" id="gcwRemoveCustEndBtn" title="Choose date" aria-label="Choose date" style="min-width:34px; height:34px; padding:0 6px;">📅</button>' +
      '</div>' +
    '</label>';
    html += '</div>';
    html += '</div>';

    html += '<div class="gcw-warning-note">';
    html += '⚠️ Selected dates will be removed from the calendar schedule and group attendance tracking.';
    html += '</div>';

    html += '</div>';

    html += '<div class="gcw-scheduler-foot">';
    html += '<button type="button" class="btn ghost" data-action="close">Cancel</button>';
    html += '<button type="button" class="btn danger" data-action="remove-confirm">Remove from Schedule</button>';
    html += '</div>';

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    function updateLabels() {
      const text = getDaysText();
      const mLabel = dialog.querySelector('#gcwRemoveRadioMonthLabel');
      if (mLabel) mLabel.textContent = 'Current Month (every ' + text + ' in ' + monthName + ')';
      const yLabel = dialog.querySelector('#gcwRemoveRadioYearLabel');
      if (yLabel) yLabel.textContent = 'Academic Year (every ' + text + ' Sep 1 – May 31)';
    }

    const dateBtn = dialog.querySelector('#gcwRemoveDateBtn');
    if (dateBtn) {
      dateBtn.onclick = () => {
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(dateBtn, dateStr, (newDate) => {
            if (!newDate || newDate === dateStr) return;
            dateStr = newDate;
            const newDObj = new Date(dateStr + 'T00:00:00');
            weekdayName = newDObj.toLocaleDateString('en-US', { weekday: 'long' });
            monthName = newDObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const dateText = dialog.querySelector('#gcwRemoveDateText');
            if (dateText) dateText.textContent = weekdayName + ', ' + dateStr;

            selectedDays.clear();
            selectedDays.add(newDObj.getDay());
            dialog.querySelectorAll('.gcw-day-chip').forEach(chip => {
              const day = Number(chip.dataset.day);
              if (selectedDays.has(day)) chip.classList.add('is-active');
              else chip.classList.remove('is-active');
            });

            updateLabels();

            const custStart = dialog.querySelector('#gcwRemoveCustStart');
            if (custStart) custStart.value = dateStr;
            const custEnd = dialog.querySelector('#gcwRemoveCustEnd');
            if (custEnd) custEnd.value = dateStr;
          });
        }
      };
    }

    dialog.querySelectorAll('.gcw-day-chip').forEach(chip => {
      chip.onclick = () => {
        const day = Number(chip.dataset.day);
        if (selectedDays.has(day)) {
          if (selectedDays.size > 1) {
            selectedDays.delete(day);
            chip.classList.remove('is-active');
          }
        } else {
          selectedDays.add(day);
          chip.classList.add('is-active');
        }
        updateLabels();
      };
    });

    const customBox = dialog.querySelector('#gcwRemoveCustomBox');
    dialog.querySelectorAll('input[name="gcwRemovePeriod"]').forEach(r => {
      r.onchange = () => {
        currentPeriod = r.value;
        if (customBox) {
          customBox.style.display = currentPeriod === 'custom' ? 'flex' : 'none';
        }
      };
    });

    const startBtn = dialog.querySelector('#gcwRemoveCustStartBtn');
    if (startBtn) {
      startBtn.onclick = () => {
        const custStart = dialog.querySelector('#gcwRemoveCustStart');
        const curVal = custStart ? custStart.value : dateStr;
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(startBtn, curVal, (newDate) => {
            if (newDate && custStart) custStart.value = newDate;
          });
        }
      };
    }

    const endBtn = dialog.querySelector('#gcwRemoveCustEndBtn');
    if (endBtn) {
      endBtn.onclick = () => {
        const custEnd = dialog.querySelector('#gcwRemoveCustEnd');
        const curVal = custEnd ? custEnd.value : dateStr;
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(endBtn, curVal, (newDate) => {
            if (newDate && custEnd) custEnd.value = newDate;
          });
        }
      };
    }

    const closeDialog = () => {
      dialog.close();
      dialog.remove();
    };

    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = closeDialog;
    });

    function computeRemovalDates(period, customStart, customEnd) {
      if (period === 'single') return [dateStr];
      const dates = [];
      let startD, endD;
      if (period === 'month') {
        const [y, m] = dateStr.split('-').map(Number);
        startD = new Date(y, m - 1, 1);
        endD = new Date(y, m, 0);
      } else if (period === 'academic_year') {
        const [y, m] = dateStr.split('-').map(Number);
        startD = new Date(y, m - 1, 1);
        const endYear = m >= 9 ? y + 1 : y;
        endD = new Date(endYear, 4, 31);
      } else {
        startD = customStart ? new Date(customStart + 'T00:00:00') : new Date(dateStr + 'T00:00:00');
        endD = customEnd ? new Date(customEnd + 'T00:00:00') : new Date(dateStr + 'T00:00:00');
      }
      const cur = new Date(startD);
      while (cur <= endD) {
        if (selectedDays.has(cur.getDay())) {
          const ds = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0') + '-' + String(cur.getDate()).padStart(2, '0');
          dates.push(ds);
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }

    const removeBtn = dialog.querySelector('[data-action="remove-confirm"]');
    if (removeBtn) {
      removeBtn.onclick = () => {
        const custStartVal = dialog.querySelector('#gcwRemoveCustStart')?.value;
        const custEndVal = dialog.querySelector('#gcwRemoveCustEnd')?.value;
        const targetDates = computeRemovalDates(currentPeriod, custStartVal, custEndVal);
        if (!targetDates.length) {
          alert('No dates match the selected removal criteria.');
          return;
        }

        const existingConfirm = document.getElementById('gcwConfirmRemovalDialog');
        if (existingConfirm) existingConfirm.remove();
        const confirmDialog = document.createElement('dialog');
        confirmDialog.id = 'gcwConfirmRemovalDialog';
        confirmDialog.className = 'gcw-scheduler-dialog gcw-confirm-dialog';
        confirmDialog.innerHTML = `
          <div class="gcw-scheduler-head" style="border-bottom: 2px solid #fee2e2;">
            <h3 style="color:#b91c1c; display:flex; align-items:center; gap:8px;">
              <span>⚠️</span> Confirm Removal from Schedule
            </h3>
            <button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>
          </div>
          <div class="gcw-scheduler-body" style="padding:18px 20px;">
            <p style="font-size:14px; color:#1e293b; margin:0 0 12px; font-weight:600;">
              Are you sure you want to remove ${targetDates.length} lesson(s) from the schedule?
            </p>
            <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px; color:#991b1b; font-size:13px; line-height:1.5;">
              <b>Warning:</b> This will remove the selected dates from the calendar and permanently delete all student attendance records for these sessions.
            </div>
            <div style="margin-top:12px; font-size:12px; color:#64748b; max-height:100px; overflow-y:auto; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #e2e8f0;">
              <b>Dates to remove (${targetDates.length}):</b><br>
              ${targetDates.slice(0, 10).join(', ')}${targetDates.length > 10 ? ' and ' + (targetDates.length - 10) + ' more' : ''}
            </div>
          </div>
          <div class="gcw-scheduler-foot" style="display:flex; justify-content:flex-end; gap:10px;">
            <button type="button" class="btn ghost" data-action="cancel">Cancel</button>
            <button type="button" class="btn danger" data-action="confirm-delete" style="background:#dc2626; color:#ffffff; font-weight:600;">Yes, Remove Lessons</button>
          </div>
        `;
        document.body.appendChild(confirmDialog);

        const closeConfirm = () => {
          if (typeof confirmDialog.close === 'function') confirmDialog.close();
          confirmDialog.remove();
        };

        confirmDialog.querySelectorAll('[data-action="close"], [data-action="cancel"]').forEach(b => {
          b.onclick = closeConfirm;
        });

        const doDeleteBtn = confirmDialog.querySelector('[data-action="confirm-delete"]');
        if (doDeleteBtn) {
          doDeleteBtn.onclick = async () => {
            doDeleteBtn.disabled = true;
            targetDates.forEach(d => {
              const dMonthKey = d.slice(0, 7);
              const targetMonthData = getMonthData(state, dMonthKey);
              if (targetMonthData.lessonDates) {
                if (targetMonthData.lessonDates instanceof Set) {
                  targetMonthData.lessonDates.delete(d);
                } else if (Array.isArray(targetMonthData.lessonDates)) {
                  targetMonthData.lessonDates = targetMonthData.lessonDates.filter(x => x !== d);
                }
              }
              if (targetMonthData.scheduleData && targetMonthData.scheduleData[d]) {
                delete targetMonthData.scheduleData[d];
              }
              if (targetMonthData.attendance) {
                for (const stId of Object.keys(targetMonthData.attendance)) {
                  if (targetMonthData.attendance[stId] && targetMonthData.attendance[stId][d] !== undefined) {
                    delete targetMonthData.attendance[stId][d];
                  }
                }
              }
              if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
                for (const m of lmLibrary.materials) {
                  if (m.date === d) m.date = '';
                  if (Array.isArray(m.dates)) m.dates = m.dates.filter(x => x !== d);
                }
              }
            });

            if (typeof lmPersist === 'function') {
              lmPersist();
            }

            closeConfirm();
            closeDialog();

            await saveGroupAttendanceData(groupId, state, container);
            window.renderGroupCalendarWidget(container, groupId, state.groupTitle);

            const statusNode = container.querySelector('[data-gcw-status]');
            if (statusNode) {
              statusNode.textContent = `✓ Removed ${targetDates.length} lesson(s) from schedule`;
              statusNode.style.display = 'block';
              statusNode.style.color = 'var(--ok, #10b981)';
              setTimeout(() => { if (statusNode) statusNode.style.display = 'none'; }, 4000);
            }
          };
        }

        if (typeof confirmDialog.showModal === 'function') confirmDialog.showModal();
        else confirmDialog.setAttribute('open', '');
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  window.showRemoveScheduleModal = showRemoveScheduleModal;

  function showLessonSchedulerModal(groupId, dateStr, state, container) {
    const existingModal = document.getElementById('gcwSchedulerDialog');
    if (existingModal) existingModal.remove();

    const initialDateStr = dateStr;
    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);
    if (!monthData.scheduleData) monthData.scheduleData = {};
    const existing = monthData.scheduleData[dateStr] || {};

    let currentStartTime = existing.startTime || '18:30';
    let currentDuration = Number(existing.durationMinutes) || 60;
    let currentPeriod = existing.period || 'month';
    let currentMaterialId = existing.materialId || '';

    let dObj = new Date(dateStr + 'T00:00:00');
    let weekdayName = dObj.toLocaleDateString('en-US', { weekday: 'long' });
    let monthName = dObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const weekdaysDef = [
      { day: 1, label: 'Mo', name: 'Monday' },
      { day: 2, label: 'Tu', name: 'Tuesday' },
      { day: 3, label: 'We', name: 'Wednesday' },
      { day: 4, label: 'Th', name: 'Thursday' },
      { day: 5, label: 'Fr', name: 'Friday' },
      { day: 6, label: 'Sa', name: 'Saturday' },
      { day: 0, label: 'Su', name: 'Sunday' }
    ];
    const initialDay = dObj.getDay();
    const selectedDays = new Set([initialDay]);
    function getDaysText() {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const active = order.filter(d => selectedDays.has(d));
      if (!active.length) return weekdayName;
      return active.map(d => weekdaysDef.find(w => w.day === d)?.label || '').join(', ');
    }

    const dialog = document.createElement('dialog');
    dialog.id = 'gcwSchedulerDialog';
    dialog.className = 'gcw-scheduler-dialog';

    let grp = null;
    if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    const groupLessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];

    let materialsHtml = '<option value="">(None / Draft material)</option>';
    if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
      for (const mat of lmLibrary.materials) {
        const isGroupLesson = groupLessonIds.includes(String(mat.id)) || Number(mat.groupId) === Number(groupId);
        if (!mat.hidden && isGroupLesson) {
          const isSel = String(mat.id) === String(currentMaterialId) ? ' selected' : '';
          materialsHtml += '<option value="' + esc(mat.id) + '"' + isSel + '>' + esc(mat.title || 'Lesson ' + mat.id) + '</option>';
        }
      }
    }

    const tzName = (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Minsk';

    let html = '';
    html += '<div class="gcw-scheduler-head">';
    html += '<h3><span>📅</span> Schedule Single Lesson</h3>';
    html += '<button type="button" class="gcw-choice-close-btn" data-action="close" aria-label="Close">✕</button>';
    html += '</div>';

    html += '<div class="gcw-scheduler-body">';
    html += '<div class="gcw-field-group">';
    html += '<label for="gcwSchedDateBtn">Lesson Date <span style="display:inline-block; padding:2px 6px; font-size:10px; font-weight:700; background:#e0f2fe; color:#0369a1; border-radius:4px; margin-left:6px;">Click to change</span></label>';
    html += '<button type="button" class="gcw-date-picker-btn" id="gcwSchedDateBtn" title="Click to choose a date from calendar">';
    html += '<span id="gcwSchedDateText">' + esc(weekdayName) + ', ' + esc(dateStr) + '</span>';
    html += '<span aria-hidden="true">📅</span>';
    html += '</button>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label for="gcwSchedMaterial">Learning Material</label>';
    html += '<select id="gcwSchedMaterial">' + materialsHtml + '</select>';
    html += '<div id="gcwSchedMaterialHint" style="color:var(--bad, #dc2626); font-size:12px; margin-top:4px; display:none;">⚠️ Please select a learning material to schedule a lesson.</div>';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label for="gcwSchedStartTime">Start Time</label>';
    html += '<input type="time" id="gcwSchedStartTime" value="' + esc(currentStartTime) + '">';
    html += '</div>';

    html += '<div class="gcw-field-group">';
    html += '<label>Duration</label>';
    html += '<div class="gcw-duration-group">';
    [45, 60, 90, 120].forEach(dur => {
      const activeClass = dur === currentDuration ? ' is-active' : '';
      const durLabel = dur === 60 ? '60 min (1 h)' : dur === 90 ? '90 min (1.5 h)' : dur === 120 ? '120 min (2 h)' : (dur + ' min');
      html += '<button type="button" class="gcw-duration-btn' + activeClass + '" data-dur="' + dur + '">' + durLabel + '</button>';
    });
    html += '</div>';
    html += '<div class="gcw-custom-duration-wrap">';
    html += '<label for="gcwSchedCustomDurInput">Custom:</label>';
    html += '<input type="number" id="gcwSchedCustomDurInput" class="gcw-custom-duration-input" placeholder="' + currentDuration + '" min="15" max="360" step="5">';
    html += '<span>min</span>';
    html += '</div>';
    html += '</div>';

    const initialEndTime = formatEndTime(currentStartTime, currentDuration);
    html += '<div class="gcw-time-preview" id="gcwTimePreview">';
    html += '<span>🕒</span> <span>Class window: <strong>' + esc(currentStartTime) + ' – ' + esc(initialEndTime) + '</strong> (' + currentDuration + ' min)</span>';
    html += '</div>';

    html += '<div class="gcw-tz-preview-box">';
    html += '<div class="gcw-tz-title">Group Timezone & Sync Preview</div>';
    html += '<div>Timezone: <b>' + esc(tzName) + ' (Teacher / Group Timezone)</b></div>';
    html += '<div class="gcw-tz-hint">Mode: Automatic "In Class" status will activate during this scheduled window.</div>';
    html += '</div>';

    html += '<div class="gcw-single-session-note" style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; font-size:12px; color:#0369a1; line-height:1.45;">' +
      '💡 <b>Single Session:</b> This assigns the selected lesson to this specific date only. To configure regular recurring classes for the entire group, use the <b>📅 Set group schedule</b> button in the calendar header.' +
    '</div>';

    html += '</div>';

    html += '<div class="gcw-scheduler-foot">';
    html += '<button type="button" class="btn ghost" data-action="close">Cancel</button>';
    html += '<button type="button" class="btn primary" data-action="save">Save Single Lesson</button>';
    html += '</div>';

    dialog.innerHTML = html;
    document.body.appendChild(dialog);

    function updatePreview() {
      const timeIn = dialog.querySelector('#gcwSchedStartTime');
      currentStartTime = timeIn ? timeIn.value : currentStartTime;
      const endT = formatEndTime(currentStartTime, currentDuration);
      const prevEl = dialog.querySelector('#gcwTimePreview');
      if (prevEl) {
        prevEl.innerHTML = '<span>🕒</span> <span>Class window: <strong>' + esc(currentStartTime) + ' – ' + esc(endT) + '</strong> (' + currentDuration + ' min)</span>';
      }
    }

    const dateBtn = dialog.querySelector('#gcwSchedDateBtn');
    if (dateBtn) {
      dateBtn.onclick = () => {
        if (window.openUniversalDatePicker) {
          window.openUniversalDatePicker(dateBtn, dateStr, (newDate) => {
            if (!newDate || newDate === dateStr) return;
            dateStr = newDate;
            const newDObj = new Date(dateStr + 'T00:00:00');
            weekdayName = newDObj.toLocaleDateString('en-US', { weekday: 'long' });
            monthName = newDObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const dateText = dialog.querySelector('#gcwSchedDateText');
            if (dateText) dateText.textContent = weekdayName + ', ' + dateStr;
          });
        }
      };
    }

    dialog.querySelectorAll('.gcw-duration-btn').forEach(btn => {
      btn.onclick = () => {
        dialog.querySelectorAll('.gcw-duration-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentDuration = Number(btn.dataset.dur) || 60;
        const custIn = dialog.querySelector('#gcwSchedCustomDurInput');
        if (custIn) custIn.value = '';
        updatePreview();
      };
    });

    const schedCustDurInput = dialog.querySelector('#gcwSchedCustomDurInput');
    if (schedCustDurInput) {
      schedCustDurInput.oninput = () => {
        const val = parseInt(schedCustDurInput.value, 10);
        if (val && val >= 15 && val <= 360) {
          dialog.querySelectorAll('.gcw-duration-btn').forEach(b => b.classList.remove('is-active'));
          currentDuration = val;
          updatePreview();
        }
      };
    }

    const timeInput = dialog.querySelector('#gcwSchedStartTime');
    if (timeInput) {
      timeInput.addEventListener('input', updatePreview);
    }

    dialog.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.onclick = () => {
        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();
      };
    });

    const saveBtn = dialog.querySelector('[data-action="save"]');
    const matSelect = dialog.querySelector('#gcwSchedMaterial');
    const matHint = dialog.querySelector('#gcwSchedMaterialHint');
    function updateMaterialValidation() {
      const hasMat = Boolean(matSelect && matSelect.value);
      if (saveBtn) {
        saveBtn.disabled = !hasMat;
        saveBtn.title = hasMat ? '' : 'Please select a learning material to schedule a lesson';
      }
      if (matHint) {
        matHint.style.display = hasMat ? 'none' : 'block';
      }
      if (matSelect) {
        matSelect.style.borderColor = hasMat ? '' : 'var(--bad, #dc2626)';
      }
    }
    if (matSelect) {
      matSelect.addEventListener('change', updateMaterialValidation);
      updateMaterialValidation();
    }

    if (saveBtn) {
      saveBtn.onclick = async () => {
        const matSelectEl = dialog.querySelector('#gcwSchedMaterial');
        const selectedMatId = matSelectEl ? matSelectEl.value : '';
        if (!selectedMatId) {
          updateMaterialValidation();
          return;
        }
        saveBtn.disabled = true;
        const selectedPeriod = 'single';

        const dMonthKey = dateStr.slice(0, 7);
        const targetMonthData = getMonthData(state, dMonthKey);
        if (!targetMonthData.scheduleData) targetMonthData.scheduleData = {};
        if (!targetMonthData.lessonDates) {
          targetMonthData.lessonDates = new Set();
        } else if (Array.isArray(targetMonthData.lessonDates)) {
          targetMonthData.lessonDates = new Set(targetMonthData.lessonDates);
        }
        targetMonthData.lessonDates.add(dateStr);
        targetMonthData.scheduleData[dateStr] = {
          startTime: currentStartTime,
          durationMinutes: currentDuration,
          materialId: selectedMatId || null,
          period: selectedPeriod
        };

        const hadPreviousSchedule = Boolean(existing.startTime);
        const isReschedule = hadPreviousSchedule && (existing.startTime !== currentStartTime || existing.durationMinutes !== currentDuration || initialDateStr !== dateStr);

        if (hadPreviousSchedule && initialDateStr && initialDateStr !== dateStr) {
          const oldMonthKey = initialDateStr.slice(0, 7);
          const oldMonthData = getMonthData(state, oldMonthKey);
          if (oldMonthData) {
            if (oldMonthData.lessonDates) {
              if (oldMonthData.lessonDates instanceof Set) oldMonthData.lessonDates.delete(initialDateStr);
              else if (Array.isArray(oldMonthData.lessonDates)) {
                oldMonthData.lessonDates = oldMonthData.lessonDates.filter(d => d !== initialDateStr);
              }
            }
            if (oldMonthData.scheduleData) {
              delete oldMonthData.scheduleData[initialDateStr];
            }
          }
        }

        let selectedMaterialTitle = '';
        if (selectedMatId && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
          const mat = lmLibrary.materials.find(m => String(m.id) === String(selectedMatId));
          if (mat) {
            selectedMaterialTitle = mat.title || '';
            mat.date = dateStr;
            if (!Array.isArray(mat.dates)) mat.dates = mat.date ? [mat.date] : [];
            if (!mat.dates.includes(dateStr)) mat.dates.push(dateStr);
            mat.time = currentStartTime;
            if (!mat.groupId) mat.groupId = groupId;
            if (typeof lmPersist === 'function') lmPersist();
          }
        }
        targetMonthData.scheduleData[dateStr].published = true;

        if (typeof dialog.close === 'function') dialog.close();
        dialog.remove();

        await saveGroupAttendanceData(groupId, state, container);
        window.renderGroupCalendarWidget(container, groupId, state.groupTitle);

        void postLessonAlertToChat(groupId, state.groupTitle || 'Group', dateStr, currentStartTime, currentDuration, selectedPeriod, selectedMaterialTitle, isReschedule);
      };
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  const showSingleLessonModal = showLessonSchedulerModal;
  window.showSingleLessonModal = showSingleLessonModal;
  window.showLessonSchedulerModal = showLessonSchedulerModal;

  function bindGroupCalendarEvents(container, groupId, state, canEdit) {
    const prevBtn = container.querySelector('[data-gcw-nav="prev"]');
    if (prevBtn) {
      prevBtn.onclick = () => {
        if (state.monthIndex === 0) {
          state.monthIndex = 11;
          state.year--;
        } else {
          state.monthIndex--;
        }
        const res = window.renderGroupCalendarWidget(container, groupId, state.groupTitle);
        if (res && typeof res.then === 'function') {
          res.then(() => {
            const nav = container.querySelector('.gcw-month-nav');
            if (nav) nav.focus();
          });
        }
      };
    }

    const nextBtn = container.querySelector('[data-gcw-nav="next"]');
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (state.monthIndex === 11) {
          state.monthIndex = 0;
          state.year++;
        } else {
          state.monthIndex++;
        }
        const res = window.renderGroupCalendarWidget(container, groupId, state.groupTitle);
        if (res && typeof res.then === 'function') {
          res.then(() => {
            const nav = container.querySelector('.gcw-month-nav');
            if (nav) nav.focus();
          });
        }
      };
    }

    const publishAllBtn = container.querySelector('[data-gcw-action="publish-all-scheduled"]');
    if (publishAllBtn) {
      publishAllBtn.onclick = async () => {
        publishAllBtn.disabled = true;
        const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
        const monthData = getMonthData(state, monthKey);
        let grp = null;
        if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
          grp = classGroups.find(g => Number(g.id) === Number(groupId));
        }
        if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
          grp = adminGroups.find(g => Number(g.id) === Number(groupId));
        }
        if (!grp) {
          grp = { id: groupId, lessonIds: [] };
        }
        if (!Array.isArray(grp.lessonIds)) grp.lessonIds = [];

        let activatedAny = false;
        if (monthData.lessonDates) {
          const sortedD = Array.from(monthData.lessonDates).filter(d => typeof d === 'string' && d.startsWith(monthKey + '-')).sort();
          for (const d of sortedD) {
            const currentLessons = getLessonsForDate(groupId, d);
            if (currentLessons.length === 0) {
              const sched = monthData.scheduleData && monthData.scheduleData[d];
              let mat = null;
              if (sched && sched.materialId && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
                mat = lmLibrary.materials.find(m => String(m.id) === String(sched.materialId));
              }
              if (!mat && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
                const groupMaterials = lmLibrary.materials.filter(m => !m.hidden && (grp.lessonIds.map(String).includes(String(m.id)) || Number(m.groupId) === Number(groupId)));
                if (groupMaterials.length > 0) {
                  mat = groupMaterials[0];
                }
              }
              if (mat) {
                mat.date = d;
                if (!Array.isArray(mat.dates)) {
                  mat.dates = mat.date ? [mat.date] : [];
                }
                if (!mat.dates.includes(d)) mat.dates.push(d);
                if (sched && sched.startTime) mat.time = sched.startTime;
                if (!mat.groupId) mat.groupId = groupId;
                if (!grp.lessonIds.map(String).includes(String(mat.id))) {
                  grp.lessonIds.push(mat.id);
                }
                if (!monthData.scheduleData) monthData.scheduleData = {};
                if (!monthData.scheduleData[d]) monthData.scheduleData[d] = {};
                monthData.scheduleData[d].materialId = String(mat.id);
                monthData.scheduleData[d].published = true;
                activatedAny = true;
              }
            }
          }
        }

        if (activatedAny) {
          if (typeof lmPersist === 'function') {
            lmPersist();
          }
          await saveGroupAttendanceData(groupId, state, container);
        }

        window.renderGroupCalendarWidget(container, groupId, state.groupTitle);
      };
    }

    const setScheduleBtn = container.querySelector('[data-gcw-action="set-group-schedule"]');
    if (setScheduleBtn) {
      setScheduleBtn.onclick = () => {
        showSetGroupScheduleModal(groupId, state, container);
      };
    }

    const todayBtn = container.querySelector('[data-gcw-nav="today"]');
    if (todayBtn) {
      todayBtn.onclick = () => {
        const now = new Date();
        state.year = now.getFullYear();
        state.monthIndex = now.getMonth();
        const todayDateStr = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        state.selectedDate = todayDateStr;
        state.activeTab = 'calendar';
        const res = window.renderGroupCalendarWidget(container, groupId, state.groupTitle);
        const focusToday = () => {
          const todayEl = container.querySelector('.gcw-day[data-gcw-date="' + todayDateStr + '"]');
          if (todayEl) {
            todayEl.focus();
            todayEl.classList.remove('is-pulse');
            void todayEl.offsetWidth;
            todayEl.classList.add('is-pulse');
          }
        };
        if (res && typeof res.then === 'function') {
          res.then(focusToday);
        } else {
          focusToday();
        }
      };
    }

    const handleKeyNav = (e) => {
      if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        if (prevBtn) prevBtn.click();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        if (nextBtn) nextBtn.click();
      }
    };

    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', state.groupTitle + ' calendar and attendance widget');
    container.onkeydown = handleKeyNav;

    container.querySelectorAll('[data-gcw-tab]').forEach(tab => {
      tab.onclick = () => {
        state.activeTab = tab.dataset.gcwTab;
        paintGroupCalendarWidget(container, groupId, state);
      };
    });

    const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
    const monthData = getMonthData(state, monthKey);

    container.querySelectorAll('.gcw-day[data-gcw-date]').forEach(dayBtn => {
      const dateStr = dayBtn.dataset.gcwDate;
      const isScheduled = monthData.lessonDates.has(dateStr);

      let pressTimer = null;
      let longPressFired = false;
      let startX = 0;
      let startY = 0;

      function clearPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
        dayBtn.classList.remove('is-pressing');
      }

      const dateLessons = getLessonsForDate(groupId, dateStr);
      const dateExams = getExamsForDate(groupId, dateStr);
      const hasDateEvents = isScheduled || dateLessons.length > 0 || dateExams.length > 0 || (monthData.paymentDeadline === dateStr);
      if (canEdit || hasDateEvents) {
        dayBtn.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          startX = e.clientX;
          startY = e.clientY;
          longPressFired = false;
          dayBtn.classList.add('is-pressing');
          pressTimer = setTimeout(() => {
            longPressFired = true;
            dayBtn.classList.remove('is-pressing');
            const rect = dayBtn.getBoundingClientRect();
            openCalendarContextMenu(rect.left + rect.width / 2, rect.bottom + 4, groupId, dateStr, isScheduled, dayBtn, state, container, canEdit);
          }, 500);
        });

        dayBtn.addEventListener('pointermove', (e) => {
          if (!pressTimer) return;
          if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
            clearPress();
          }
        });

        dayBtn.addEventListener('pointerup', () => {
          clearPress();
        });

        dayBtn.addEventListener('pointercancel', () => {
          clearPress();
        });

        dayBtn.addEventListener('mouseleave', () => {
          clearPress();
        });

        dayBtn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          clearPress();
          openCalendarContextMenu(e.clientX, e.clientY, groupId, dateStr, isScheduled, dayBtn, state, container, canEdit);
        });
      }

      dayBtn.onclick = (e) => {
        if (longPressFired) {
          e.preventDefault();
          e.stopPropagation();
          longPressFired = false;
          return;
        }
        e.stopPropagation();
        state.selectedDate = dateStr;
        container.querySelectorAll('.gcw-day.is-selected').forEach(el => el.classList.remove('is-selected'));
        dayBtn.classList.add('is-selected');

        handleDateItemClick(groupId, dateStr, isScheduled, dayBtn, canEdit, () => {
          monthData.lessonDates.delete(dateStr);
          saveGroupAttendanceData(groupId, state, container);
          paintGroupCalendarWidget(container, groupId, state);
        }, state, container);
      };

      if (canEdit) {
        dayBtn.ondblclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          clearPress();
          state.selectedDate = dateStr;
          if (isScheduled) {
            monthData.lessonDates.delete(dateStr);
          } else {
            monthData.lessonDates.add(dateStr);
          }
          saveGroupAttendanceData(groupId, state, container);
          paintGroupCalendarWidget(container, groupId, state);
        };
      }
    });

    container.querySelectorAll('.gcw-date-header-btn[data-gcw-open-date]').forEach(dateBtn => {
      const dateStr = dateBtn.dataset.gcwOpenDate;
      const isScheduled = monthData.lessonDates.has(dateStr);
      dateBtn.onclick = (e) => {
        e.stopPropagation();
        handleDateItemClick(groupId, dateStr, isScheduled, dateBtn, canEdit, () => {
          monthData.lessonDates.delete(dateStr);
          saveGroupAttendanceData(groupId, state, container);
          paintGroupCalendarWidget(container, groupId, state);
        }, state, container);
      };
    });

    // Scheduled lessons dropdown toggle
    const schedDropdownBtn = container.querySelector('[data-gcw-action="toggle-scheduled-dropdown"]');
    const schedDropdownMenu = container.querySelector('.gcw-scheduled-dropdown');
    if (schedDropdownBtn && schedDropdownMenu) {
      schedDropdownBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = schedDropdownMenu.style.display !== 'none';
        schedDropdownMenu.style.display = isOpen ? 'none' : 'flex';
        schedDropdownBtn.setAttribute('aria-expanded', String(!isOpen));
      };
      schedDropdownMenu.querySelectorAll('[data-gcw-dropdown-date]').forEach(itemBtn => {
        itemBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          schedDropdownMenu.style.display = 'none';
          schedDropdownBtn.setAttribute('aria-expanded', 'false');
          const targetD = itemBtn.dataset.gcwDropdownDate;
          if (state.activeTab === 'attendance') {
            const dateHeader = container.querySelector('[data-gcw-open-date="' + targetD + '"]');
            if (dateHeader) {
              dateHeader.focus({ preventScroll: false });
              if (typeof dateHeader.scrollIntoView === 'function') {
                dateHeader.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
              }
            }
          } else if (state.activeTab === 'calendar') {
            const calDay = container.querySelector('.gcw-day[data-gcw-date="' + targetD + '"]');
            if (calDay) calDay.click();
          }
        };
      });
      const onDropdownDocClick = (e) => {
        if (!schedDropdownBtn.contains(e.target) && !schedDropdownMenu.contains(e.target)) {
          schedDropdownMenu.style.display = 'none';
          schedDropdownBtn.setAttribute('aria-expanded', 'false');
        }
      };
      document.addEventListener('click', onDropdownDocClick);
    }

    // Lock/Close reporting button
    const lockReportingBtn = container.querySelector('[data-gcw-action="toggle-lock-reporting"]');
    if (lockReportingBtn) {
      lockReportingBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        monthData.reportingClosed = !monthData.reportingClosed;
        if (!monthData.scheduleData) monthData.scheduleData = {};
        monthData.scheduleData.reportingClosed = monthData.reportingClosed;
        await saveGroupAttendanceData(groupId, state, container);
        paintGroupCalendarWidget(container, groupId, state);
      };
    }

    if (canEdit && !monthData.reportingClosed) {
      const now = new Date();
      const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const students = getGroupStudents(groupId);
      const monthLessonDates = new Set();
      for (const d of monthData.lessonDates) {
        if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
          monthLessonDates.add(d);
        }
      }
      let grp = null;
      if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
        grp = classGroups.find(g => Number(g.id) === Number(groupId));
      }
      if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
        grp = adminGroups.find(g => Number(g.id) === Number(groupId));
      }
      const lessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];
      if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
        for (const m of lmLibrary.materials) {
          if ((lessonIds.includes(String(m.id)) || Number(m.groupId) === Number(groupId)) && typeof m.date === 'string' && m.date.startsWith(monthKey + '-')) {
            monthLessonDates.add(m.date);
          }
        }
      }

      const updateAttendanceCellDOM = (targetBtn, newStatus, studentName, dateStr) => {
        targetBtn.classList.remove('is-present', 'is-absent', 'is-unmarked');
        if (newStatus === 'present') {
          targetBtn.classList.add('is-present');
          targetBtn.textContent = '✓';
        } else if (newStatus === 'absent') {
          targetBtn.classList.add('is-absent');
          targetBtn.textContent = '✕';
        } else {
          targetBtn.classList.add('is-unmarked');
          targetBtn.textContent = '+';
        }
        targetBtn.setAttribute('aria-label', (studentName || 'Student') + ' ' + dateStr + ': ' + newStatus);

        // Update column footer percentage without full re-render
        const footerTd = container.querySelector('.gcw-table-footer-row td[data-gcw-footer-date="' + dateStr + '"]');
        if (footerTd) {
          let presents = 0;
          let marked = 0;
          for (const s of students) {
            const stDates = monthData.attendance[s.id] || monthData.attendance['u' + s.id] || monthData.attendance['s' + s.id] || {};
            const st = stDates[dateStr];
            if (st === 'present') { presents++; marked++; }
            else if (st === 'absent') { marked++; }
          }
          const pctStr = marked > 0 ? (students.length ? Math.round((presents / students.length) * 100) + '%' : '—') : '—';
          footerTd.textContent = pctStr;
        }

        // Update footer overall attendance percentage badge
        const overallBadge = container.querySelector('[data-gcw-metric="attendance-pct"] b');
        if (overallBadge) {
          const newPct = calculateAttendancePct(monthLessonDates, students, monthData.attendance);
          overallBadge.textContent = newPct + '%';
        }
      };

      // Teacher gestures: Single click -> checkmark (present), Double click -> cross (absent)
      container.querySelectorAll('.gcw-cell-btn[data-gcw-student]').forEach(cellBtn => {
        let clickTimer = null;
        cellBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const d = cellBtn.dataset.gcwDate;
          if (d > todayStr || monthData.reportingClosed) {
            return;
          }
          if (e.detail === 1) {
            clickTimer = setTimeout(() => {
              const stId = cellBtn.dataset.gcwStudent;
              const studentName = cellBtn.dataset.gcwStudentName;
              if (!monthData.attendance[stId]) monthData.attendance[stId] = {};
              const cur = monthData.attendance[stId][d] || 'unmarked';
              const nextStatus = cur === 'present' ? 'unmarked' : 'present';
              monthData.attendance[stId][d] = nextStatus;
              updateAttendanceCellDOM(cellBtn, nextStatus, studentName, d);
              saveGroupAttendanceData(groupId, state, container);
            }, 220);
          }
        });

        cellBtn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const d = cellBtn.dataset.gcwDate;
          if (d > todayStr || monthData.reportingClosed) {
            return;
          }
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          const stId = cellBtn.dataset.gcwStudent;
          const studentName = cellBtn.dataset.gcwStudentName;
          if (!monthData.attendance[stId]) monthData.attendance[stId] = {};
          const cur = monthData.attendance[stId][d] || 'unmarked';
          const nextStatus = cur === 'absent' ? 'unmarked' : 'absent';
          monthData.attendance[stId][d] = nextStatus;
          updateAttendanceCellDOM(cellBtn, nextStatus, studentName, d);
          saveGroupAttendanceData(groupId, state, container);
        });
      });
    }

    const reportBtn = container.querySelector('[data-gcw-action="report-chat"]');
    const statusNode = container.querySelector('[data-gcw-status]');
    if (reportBtn) {
      reportBtn.onclick = async (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const monthName = MONTH_NAMES[state.monthIndex];
        const students = getGroupStudents(groupId);

        const monthLessonDates = new Set();
        for (const d of monthData.lessonDates) {
          if (typeof d === 'string' && d.startsWith(monthKey + '-')) {
            monthLessonDates.add(d);
          }
        }
        let grp = null;
        if (typeof classGroups !== 'undefined' && Array.isArray(classGroups)) {
          grp = classGroups.find(g => Number(g.id) === Number(groupId));
        }
        if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
          grp = adminGroups.find(g => Number(g.id) === Number(groupId));
        }
        const lessonIds = grp && Array.isArray(grp.lessonIds) ? grp.lessonIds.map(String) : [];
        if (typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
          for (const m of lmLibrary.materials) {
            if ((lessonIds.includes(String(m.id)) || Number(m.groupId) === Number(groupId)) && typeof m.date === 'string' && m.date.startsWith(monthKey + '-')) {
              monthLessonDates.add(m.date);
            }
          }
        }
        const lessonCount = monthLessonDates.size;

        const monthExamDates = new Set();
        const examIds = grp && Array.isArray(grp.examIds) ? grp.examIds.map(String) : [];
        if (typeof examShown === 'function') {
          const exams = examShown();
          if (Array.isArray(exams)) {
            for (const ex of exams) {
              if ((examIds.includes(String(ex.id)) || Number(ex.groupId) === Number(groupId)) && typeof ex.date === 'string' && ex.date.startsWith(monthKey + '-')) {
                monthExamDates.add(ex.id || ex.date);
              }
            }
          }
        }
        const examCount = monthExamDates.size;

        const sortedDates = Array.from(monthLessonDates).sort();
        const attendancePct = calculateAttendancePct(monthLessonDates, students, monthData.attendance);

        let msgText = '';

        if (state.activeTab === 'calendar') {
          // TAB 1: Calendar Schedule Report (Screenshot 2, Plan Stage 5)
          const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
          const icsUrl = `${origin}/api/groups/schedule.ics?groupId=${encodeURIComponent(groupId)}&month=${encodeURIComponent(monthKey)}`;
          const gCalUrl = new URL('https://calendar.google.com/calendar/render');
          gCalUrl.searchParams.set('action', 'TEMPLATE');
          gCalUrl.searchParams.set('text', `Group Schedule · ${state.groupTitle}`);
          gCalUrl.searchParams.set('ctz', 'Europe/Minsk');

          const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
          if (sortedDates.length > 0) {
            const firstDate = sortedDates[0];
            const firstSched = (monthData.scheduleData && monthData.scheduleData[firstDate]) || null;
            const startTime = firstSched && firstSched.startTime ? firstSched.startTime : '18:30';
            const dur = firstSched && firstSched.durationMinutes ? firstSched.durationMinutes : 60;
            const [sh, sm] = startTime.split(':').map(Number);
            const startHours = isNaN(sh) ? 18 : sh;
            const startMins = isNaN(sm) ? 30 : sm;
            const totalEndMin = startHours * 60 + startMins + dur;
            const endHours = Math.floor(totalEndMin / 60) % 24;
            const endMins = totalEndMin % 60;
            const dtClean = firstDate.replace(/-/g, '');
            const stClean = String(startHours).padStart(2, '0') + String(startMins).padStart(2, '0') + '00';
            const etClean = String(endHours).padStart(2, '0') + String(endMins).padStart(2, '0') + '00';
            gCalUrl.searchParams.set('dates', `${dtClean}T${stClean}/${dtClean}T${etClean}`);

            const distinctDays = Array.from(new Set(sortedDates.map(d => {
              const [dy, dm, dd] = d.split('-').map(Number);
              return dayMap[new Date(dy, dm - 1, dd).getDay()];
            }))).join(',');
            const lastDayNum = new Date(state.year, state.monthIndex + 1, 0).getDate();
            const untilDate = `${state.year}${String(state.monthIndex + 1).padStart(2, '0')}${String(lastDayNum).padStart(2, '0')}`;
            if (distinctDays) {
              gCalUrl.searchParams.set('recur', `RRULE:FREQ=WEEKLY;BYDAY=${distinctDays};UNTIL=${untilDate}T235959Z`);
            }
            gCalUrl.searchParams.set('details', `Lessons for ${monthName} ${state.year} (${state.groupTitle}). Reminders preconfigured 1 hour and 15 minutes before class.`);
          } else {
            const fallbackDt = `${state.year}${String(state.monthIndex + 1).padStart(2, '0')}01`;
            gCalUrl.searchParams.set('dates', `${fallbackDt}T183000/${fallbackDt}T193000`);
            gCalUrl.searchParams.set('details', `Lessons for ${monthName} ${state.year}`);
          }

          const scheduleLines = [
            `📅 Schedule Report: ${state.groupTitle} (${monthName} ${state.year})`,
            `Scheduled lessons: ${lessonCount} | Scheduled exams: ${examCount}`,
            '',
            'Schedule:'
          ];

          if (sortedDates.length === 0) {
            scheduleLines.push('No sessions scheduled for this month.');
          } else {
            for (const d of sortedDates) {
              const [y, m, dayNum] = d.split('-').map(Number);
              const dObj = new Date(y, m - 1, dayNum);
              const weekday = dObj.toLocaleDateString('en-US', { weekday: 'short' });
              const shortMo = dObj.toLocaleDateString('en-US', { month: 'short' });
              const sched = (monthData.scheduleData && monthData.scheduleData[d]) || null;
              const startTime = sched && sched.startTime ? sched.startTime : '18:30';
              const dur = sched && sched.durationMinutes ? sched.durationMinutes : 60;
              const [sh, sm] = startTime.split(':').map(Number);
              const endDt = new Date(y, m - 1, dayNum, sh, sm + dur);
              const endTime = String(endDt.getHours()).padStart(2, '0') + ':' + String(endDt.getMinutes()).padStart(2, '0');

              const lessons = getLessonsForDate(groupId, d);
              const exams = getExamsForDate(groupId, d);
              let title = lessons[0] ? lessons[0].title : (exams[0] ? 'Exam: ' + exams[0].title : '');
              if (!title && sched && sched.materialId && typeof lmLibrary !== 'undefined' && Array.isArray(lmLibrary.materials)) {
                const foundMat = lmLibrary.materials.find(m => String(m.id) === String(sched.materialId));
                if (foundMat && foundMat.title) {
                  title = foundMat.title;
                }
              }
              if (!title) {
                title = 'Group Lesson';
              }

              scheduleLines.push(`• ${weekday}, ${shortMo} ${dayNum} · ${startTime} – ${endTime} · ${title}`);
            }
          }

          scheduleLines.push('');
          scheduleLines.push('👉 Add schedule to your calendar:');
          scheduleLines.push(`• [📅 Add to Google Calendar](${gCalUrl.toString()})`);
          scheduleLines.push(`• [📥 Download .ics Calendar File](${icsUrl})`);

          msgText = scheduleLines.join('\n');
        } else if (state.activeTab === 'attendance') {
          // TAB 2: Attendance Journal with personal dispatches to students (Plan Stage 5)
          const sessionRecords = [];
          let markedDatesCount = 0;
          for (const d of sortedDates) {
            const [y, m, dayNum] = d.split('-').map(Number);
            const dObj = new Date(y, m - 1, dayNum);
            const weekday = dObj.toLocaleDateString('en-US', { weekday: 'short' });
            const shortMo = dObj.toLocaleDateString('en-US', { month: 'short' });

            let presCount = 0;
            const absentNames = [];
            for (const s of students) {
              const stId = String(s.id);
              const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
              if (stDates[d] === 'present') presCount++;
              else if (stDates[d] === 'absent') absentNames.push(s.name || s.login);
            }
            const totalMarked = presCount + absentNames.length;
            if (totalMarked > 0) markedDatesCount++;
            const pct = totalMarked > 0 ? Math.round((presCount / totalMarked) * 100) : 0;
            const absStr = absentNames.length > 0 ? `Absent: ${absentNames.join(', ')}` : 'All present';
            sessionRecords.push(`• ${weekday}, ${shortMo} ${dayNum}: ${pct}% (${presCount} present · ${absStr})`);
          }

          // Personal student dispatches
          for (const s of students) {
            const stId = String(s.id);
            const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
            let pres = 0;
            let abs = 0;
            const personalSessions = [];
            for (const d of sortedDates) {
              const [y, m, dayNum] = d.split('-').map(Number);
              const dObj = new Date(y, m - 1, dayNum);
              const weekday = dObj.toLocaleDateString('en-US', { weekday: 'short' });
              const shortMo = dObj.toLocaleDateString('en-US', { month: 'short' });
              if (stDates[d] === 'present') {
                pres++;
                personalSessions.push(`• ${weekday}, ${shortMo} ${dayNum}: Present ✅`);
              } else if (stDates[d] === 'absent') {
                abs++;
                personalSessions.push(`• ${weekday}, ${shortMo} ${dayNum}: Absent ⚠️`);
              }
            }
            const totalMarked = pres + abs;
            const stPct = totalMarked > 0 ? Math.round((pres / totalMarked) * 100) : 0;
            const personalJournalLines = [
              `📋 Personal Attendance Journal: ${state.groupTitle} (${monthName} ${state.year})`,
              `Student: ${s.name || s.login}`,
              `Attendance: ${stPct}% (${pres} attended, ${abs} missed of ${totalMarked})`,
              '',
              'Your Sessions:'
            ];
            if (personalSessions.length > 0) {
              personalJournalLines.push(...personalSessions);
            } else {
              personalJournalLines.push('No sessions recorded yet.');
            }
            const personalMsg = personalJournalLines.join('\n');
            if (typeof window.sendDirectChatMessage === 'function') {
              try {
                await window.sendDirectChatMessage(s.id, personalMsg, { category: 'learning' });
              } catch {}
            }
          }

          const journalLines = [
            `📋 Attendance Journal: ${state.groupTitle} (${monthName} ${state.year})`,
            `Sessions held: ${markedDatesCount} of ${sortedDates.length} | Average Presence: ${attendancePct}%`,
            '',
            'Session Records:'
          ];
          if (sessionRecords.length > 0) {
            journalLines.push(...sessionRecords);
          } else {
            journalLines.push('No session records found.');
          }
          msgText = journalLines.join('\n');
        } else {
          // TAB 3: Statistics Rankings Report (Plan Stage 5)
          let totalAttended = 0;
          let totalMissed = 0;
          const studentStats = [];

          for (const s of students) {
            const stId = String(s.id);
            const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
            let pres = 0;
            let abs = 0;
            for (const d of sortedDates) {
              if (stDates[d] === 'present') pres++;
              else if (stDates[d] === 'absent') abs++;
            }
            totalAttended += pres;
            totalMissed += abs;
            const totalMarked = pres + abs;
            const stPct = totalMarked > 0 ? Math.round((pres / totalMarked) * 100) : 0;
            studentStats.push({
              name: s.name || s.login,
              pct: stPct,
              pres,
              abs,
              totalLessons: sortedDates.length
            });
          }

          // Sort descending by attendance percentage
          studentStats.sort((a, b) => b.pct - a.pct || b.pres - a.pres);

          const statsLines = [
            `📊 Group Statistics: ${state.groupTitle} (${monthName} ${state.year})`,
            `Total Lessons: ${lessonCount} | Total Exams: ${examCount} | Students: ${students.length}`,
            `Group Attendance: ${attendancePct}% (${totalAttended} attended, ${totalMissed} missed)`,
            '',
            'Attendance Rankings:'
          ];

          studentStats.forEach((st, idx) => {
            statsLines.push(`${idx + 1}. ${st.name} — ${st.pct}% (${st.pres} attended, ${st.abs} missed of ${st.totalLessons})`);
          });

          msgText = statsLines.join('\n');
        }

        reportBtn.disabled = true;
        if (statusNode) {
          statusNode.textContent = 'Dispatching report to chat...';
          statusNode.style.display = 'block';
          statusNode.style.color = 'var(--mute, #64748b)';
        }

        try {
          if (typeof window.ensureMessages === 'function') {
            await window.ensureMessages();
          }

          await dispatchCalendarChat(groupId, msgText, { category: 'learning' });

          if (statusNode) {
            statusNode.textContent = 'Report dispatched to ' + state.groupTitle + ' chat.';
            statusNode.style.display = 'block';
            statusNode.style.color = '#065f46';
            setTimeout(() => { if (statusNode) statusNode.style.display = 'none'; }, 4000);
          }
        } catch (err) {
          if (statusNode) {
            statusNode.textContent = 'Failed to dispatch report. Please check chat connection.';
            statusNode.style.display = 'block';
            statusNode.style.color = '#b91c1c';
            setTimeout(() => { if (statusNode) statusNode.style.display = 'none'; }, 5000);
          }
        } finally {
          reportBtn.disabled = false;
        }
      };
    }
  }

  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[href*="action=confirm-payment"]');
    if (!link) return;
    e.preventDefault();
    try {
      const url = new URL(link.href, window.location.origin);
      const gId = url.searchParams.get('groupId');
      const mKey = url.searchParams.get('month');
      const stId = url.searchParams.get('studentId') || ((typeof authUser !== 'undefined' && authUser) ? String(authUser.id) : '');
      if (gId && mKey && stId) {
        const state = groupWidgetStates.get(Number(gId)) || groupWidgetStates.get(String(gId));
        if (state) {
          const mData = getMonthData(state, mKey);
          if (!mData.studentPayments) mData.studentPayments = {};
          if (!mData.studentPayments[stId]) mData.studentPayments[stId] = {};
          mData.studentPayments[stId].paid = true;
          mData.studentPayments[stId].paidAt = new Date().toISOString();
          await saveGroupAttendanceData(gId, state);
          const container = document.getElementById('groupCalendarWidget');
          if (container) paintGroupCalendarWidget(container, gId, state);
        }
        link.textContent = '✓ Payment confirmed';
        link.style.background = '#dcfce7';
        link.style.borderColor = '#16a34a';
        link.style.color = '#15803d';
        link.style.pointerEvents = 'none';
      }
    } catch {}
  });
})();
