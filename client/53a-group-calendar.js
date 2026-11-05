// Group Calendar & Attendance interactive component matching the Dark Minimalist reference.
(() => {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const groupWidgetStates = new Map();

  function getMonthData(state, monthKey) {
    if (!state.monthCache) state.monthCache = new Map();
    if (!state.monthCache.has(monthKey)) {
      state.monthCache.set(monthKey, {
        lessonDates: new Set(),
        attendance: {},
        revision: 0,
        loaded: false
      });
    }
    return state.monthCache.get(monthKey);
  }

  function getGroupState(groupId, groupTitle) {
    if (!groupWidgetStates.has(groupId)) {
      const year = 2026;
      const monthIndex = 10; // November (0-based)
      const selectedDate = '2026-11-05';
      const initialMonthKey = '2026-11';
      const monthCache = new Map();
      monthCache.set(initialMonthKey, {
        lessonDates: new Set(),
        attendance: {},
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
      grp = classGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (!grp && typeof adminGroups !== 'undefined' && Array.isArray(adminGroups)) {
      grp = adminGroups.find(g => Number(g.id) === Number(groupId));
    }
    if (grp && typeof groupDirectoryPeople === 'function') {
      const people = groupDirectoryPeople([grp], false);
      if (Array.isArray(people) && people.length) {
        list = people.map(u => ({ id: u.id, name: u.name || u.login || 'Student', login: u.login || '' }));
      }
    }
    if (!list.length && typeof adminAccounts !== 'undefined' && Array.isArray(adminAccounts) &&
        typeof adminMembers !== 'undefined' && Array.isArray(adminMembers)) {
      const filtered = adminAccounts.filter(u => u.role === 'USER' && adminMembers.some(m => String(m.accountId) === String(u.id) && Number(m.groupId) === Number(groupId)));
      if (filtered.length) {
        list = filtered.map(u => ({ id: u.id, name: u.name || u.login || 'Student', login: u.login || '' }));
      }
    }
    return list.slice().sort((a, b) => (a.name || a.login || '').localeCompare(b.name || b.login || '', undefined, { sensitivity: 'base' }));
  }

  function calculateAttendancePct(lessonDates, students, attendance) {
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
      return 33;
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
        if ((lessonIds.includes(String(m.id)) || Number(m.groupId) === Number(groupId)) && m.date === dateStr) {
          matches.push({ id: m.id, material: m, title: m.title || 'Lesson', time: m.time || '' });
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

  function showEventChoiceDialog(dateStr, lessons, exams) {
    const existing = document.getElementById('gcwChoiceDialog');
    if (existing) existing.remove();

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

    dialog.innerHTML =
      '<div class="gcw-choice-head">' +
        '<h3>Activities on ' + esc(dateStr) + '</h3>' +
        '<button type="button" class="gcw-choice-close-btn" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="gcw-choice-list">' + itemsHtml + '</div>';

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

  function handleDateItemClick(groupId, dateStr, isScheduled, anchorEl, canEdit, onCancelDate) {
    const lessons = getLessonsForDate(groupId, dateStr);
    const exams = getExamsForDate(groupId, dateStr);
    const total = lessons.length + exams.length;

    if (total > 1) {
      showEventChoiceDialog(dateStr, lessons, exams);
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
      showGcwRedAlert(anchorEl, 'No lesson available for this date', canEdit ? onCancelDate : null);
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
      const monthKey = state.year + '-' + String(state.monthIndex + 1).padStart(2, '0');
      const monthData = getMonthData(state, monthKey);
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
        pricePerLesson: 30,
        currency: 'BYN',
        paymentDeadline: '',
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

      let dotsHtml = '';
      if (isGreen) dotsHtml += '<span class="gcw-dot is-green"></span>';
      if (isBlue) dotsHtml += '<span class="gcw-dot is-blue"></span>';
      if (isRed) dotsHtml += '<span class="gcw-dot is-red"></span>';
      if (isOrange) dotsHtml += '<span class="gcw-dot is-orange"></span>';

      const tooltipParts = [];
      if (lessons.length) {
        lessons.forEach(l => {
          const title = (l.material && l.material.title) || (isScheduled ? ('Lesson ' + (sortedMonthLessons.indexOf(dateStr) + 1)) : 'Lesson');
          tooltipParts.push(title.startsWith('Lesson') ? title : ('Lesson: ' + title));
        });
      } else if (isScheduled) {
        tooltipParts.push('Lesson ' + (sortedMonthLessons.indexOf(dateStr) + 1));
      }
      if (exams.length) {
        exams.forEach(ex => {
          tooltipParts.push(ex.title ? ('Exam: ' + ex.title) : 'Exam');
        });
      }

      const tooltip = tooltipParts.join(' • ');
      const tooltipAttr = tooltip ? (' data-gcw-tooltip="' + esc(tooltip) + '" title="' + esc(tooltip) + '"') : '';
      const ariaLabel = tooltip || dateStr;

      let dayClasses = 'gcw-day';
      if (isScheduled || hasLesson) dayClasses += ' has-lesson';
      if (isSelected) dayClasses += ' is-selected';
      if (roClass) dayClasses += roClass;

      gridHtml += '<button type="button" class="' + dayClasses + '" data-gcw-date="' + dateStr + '"' + tooltipAttr + ' aria-label="' + esc(ariaLabel) + '">';
      gridHtml += '<span class="gcw-day-num">' + d + '</span>';
      if (dotsHtml) {
        gridHtml += '<div class="gcw-dots">' + dotsHtml + '</div>';
      }
      gridHtml += '</button>';
    }

    // Attendance Journal View HTML
    let journalHtml = '<div class="gcw-journal-wrap" style="overflow-x:auto; margin-bottom:24px;">';
    const hintText = canEdit
      ? 'Click date to open activities; click to mark present (✓), double-click to mark absent (✕)'
      : 'Click date to open activities';
    journalHtml += '<p class="gcw-hint">' + hintText + '</p>';
    const sortedLessonDates = Array.from(monthLessonDates).sort();
    if (!sortedLessonDates.length) {
      journalHtml += '<p class="hint" style="color:var(--saas-text-muted, var(--mute, #71717a)); padding:16px;">No lessons scheduled for ' + monthName + ' ' + year + '. Click calendar dates to schedule lessons.</p>';
    } else {
      journalHtml += '<table class="gcw-table"><thead><tr>';
      journalHtml += '<th class="gcw-th-student">Student</th>';
      for (const d of sortedLessonDates) {
        const shortDate = d.slice(8) + '.' + d.slice(5, 7);
        journalHtml += '<th class="gcw-th-date"><button type="button" class="gcw-date-header-btn" data-gcw-open-date="' + esc(d) + '" title="Open activity for ' + shortDate + '">' + shortDate + '</button></th>';
      }
      journalHtml += '</tr></thead><tbody>';

      for (const s of students) {
        const stId = String(s.id);
        const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
        let cells = '';
        for (const d of sortedLessonDates) {
          const st = stDates[d] || 'unmarked';
          const sym = st === 'present' ? '✓' : st === 'absent' ? '✕' : '';
          const cellClass = st === 'present' ? 'is-present' : st === 'absent' ? 'is-absent' : 'is-unmarked';
          const roClass = canEdit ? '' : ' is-readonly';
          cells += '<td><button type="button" class="gcw-cell-btn ' + cellClass + roClass + '" data-gcw-student="' + esc(stId) + '" data-gcw-date="' + esc(d) + '" aria-label="' + esc(s.name) + ' ' + d + ': ' + st + '">' + sym + '</button></td>';
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
        journalHtml += '<td>' + pctStr + '</td>';
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
    const focusSelector = hadFocus && document.activeElement && document.activeElement.className ? '.' + document.activeElement.className.split(' ')[0] : null;

    container.innerHTML =
      '<div class="gcw-header">' +
        '<div class="gcw-tabs" role="tablist">' +
          '<button class="gcw-tab' + (state.activeTab === 'calendar' ? ' is-active' : '') + '" type="button" data-gcw-tab="calendar" role="tab" aria-selected="' + (state.activeTab === 'calendar') + '">Calendar</button>' +
          '<button class="gcw-tab' + (state.activeTab === 'attendance' ? ' is-active' : '') + '" type="button" data-gcw-tab="attendance" role="tab" aria-selected="' + (state.activeTab === 'attendance') + '">Attendance</button>' +
          '<button class="gcw-tab' + (state.activeTab === 'statistics' ? ' is-active' : '') + '" type="button" data-gcw-tab="statistics" role="tab" aria-selected="' + (state.activeTab === 'statistics') + '">Statistics</button>' +
        '</div>' +
        '<div class="gcw-month-nav" tabindex="0" role="region" aria-label="Calendar month navigation">' +
          '<button class="gcw-nav-arrow" type="button" data-gcw-nav="prev" aria-label="Previous month">←</button>' +
          '<span class="gcw-month-label">' + monthName + ' ' + year + '</span>' +
          '<button class="gcw-nav-arrow" type="button" data-gcw-nav="next" aria-label="Next month">→</button>' +
        '</div>' +
        '<div class="gcw-header-spacer">' +
          '<button class="gcw-today-btn" type="button" data-gcw-nav="today" aria-label="Go to current month">Today</button>' +
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
          '<span class="gcw-badge">Lessons · <b>' + lessonCount + '</b></span>' +
          '<span class="gcw-badge">Exams · <b>' + examCount + '</b></span>' +
          '<span class="gcw-badge">Students · <b>' + studentCount + '</b></span>' +
          '<span class="gcw-badge">Attendance · <b>' + attendancePct + '%</b></span>' +
        '</div>' +
        (canEdit ? '<button class="gcw-report-btn" type="button" data-gcw-action="report-chat">Report to chat</button>' : '') +
      '</div>' +
      '<p class="hint" data-gcw-status style="margin-top:10px; color:var(--ok, #10b981); font-size:12px; display:none;"></p>';

    bindGroupCalendarEvents(container, groupId, state, canEdit);

    if (hadFocus) {
      const target = focusSelector ? container.querySelector(focusSelector) : null;
      if (target && typeof target.focus === 'function') target.focus();
      else container.focus();
    }
  }

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

      if (canEdit && isScheduled) {
        dayBtn.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          startX = e.clientX;
          startY = e.clientY;
          longPressFired = false;
          dayBtn.classList.add('is-pressing');
          pressTimer = setTimeout(() => {
            longPressFired = true;
            dayBtn.classList.remove('is-pressing');
            monthData.lessonDates.delete(dateStr);
            saveGroupAttendanceData(groupId, state, container);
            paintGroupCalendarWidget(container, groupId, state);
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
          if (longPressFired) {
            e.preventDefault();
          }
        });
      }

      let clickTimer = null;

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

        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }

        const executeClick = () => {
          handleDateItemClick(groupId, dateStr, isScheduled, dayBtn, canEdit, () => {
            monthData.lessonDates.delete(dateStr);
            saveGroupAttendanceData(groupId, state, container);
            paintGroupCalendarWidget(container, groupId, state);
          });
        };

        if (canEdit && isScheduled) {
          clickTimer = setTimeout(executeClick, 250);
        } else {
          executeClick();
        }
      };

      if (canEdit) {
        dayBtn.ondblclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          clearPress();
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
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
        });
      };
    });

    if (canEdit) {
      // Teacher gestures: Single click -> checkmark (present), Double click -> cross (absent)
      container.querySelectorAll('.gcw-cell-btn[data-gcw-student]').forEach(cellBtn => {
        let clickTimer = null;
        cellBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.detail === 1) {
            clickTimer = setTimeout(() => {
              const stId = cellBtn.dataset.gcwStudent;
              const d = cellBtn.dataset.gcwDate;
              if (!monthData.attendance[stId]) monthData.attendance[stId] = {};
              const cur = monthData.attendance[stId][d] || 'unmarked';
              // Single click marks present, or toggles back to unmarked
              monthData.attendance[stId][d] = cur === 'present' ? 'unmarked' : 'present';
              saveGroupAttendanceData(groupId, state, container);
              paintGroupCalendarWidget(container, groupId, state);
            }, 220);
          }
        });

        cellBtn.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          const stId = cellBtn.dataset.gcwStudent;
          const d = cellBtn.dataset.gcwDate;
          if (!monthData.attendance[stId]) monthData.attendance[stId] = {};
          const cur = monthData.attendance[stId][d] || 'unmarked';
          // Double click marks absent (cross), or toggles back to unmarked
          monthData.attendance[stId][d] = cur === 'absent' ? 'unmarked' : 'absent';
          saveGroupAttendanceData(groupId, state, container);
          paintGroupCalendarWidget(container, groupId, state);
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

        const attendancePct = calculateAttendancePct(monthLessonDates, students, monthData.attendance);

        const reportLines = [
          'Attendance Report: ' + state.groupTitle + ' (' + monthName + ' ' + state.year + ')',
          'Lessons: ' + lessonCount + ' | Exams: ' + examCount + ' | Students: ' + students.length + ' | Attendance: ' + attendancePct + '%',
          '',
          'Students:'
        ];

        for (const s of students) {
          const stId = String(s.id);
          const stDates = monthData.attendance[stId] || monthData.attendance['u' + stId] || monthData.attendance['s' + stId] || {};
          let pres = 0;
          let abs = 0;
          for (const d of monthLessonDates) {
            if (stDates[d] === 'present') pres++;
            else if (stDates[d] === 'absent') abs++;
          }
          const totalMarked = pres + abs;
          const stPct = totalMarked > 0 ? Math.round((pres / totalMarked) * 100) : 0;
          reportLines.push('• ' + (s.name || s.login) + ': ' + stPct + '% (' + pres + ' attended, ' + abs + ' missed)');
        }

        const msgText = reportLines.join('\n');

        if (statusNode) {
          statusNode.textContent = 'Report dispatched to ' + state.groupTitle + ' chat.';
          statusNode.style.display = 'block';
          setTimeout(() => { if (statusNode) statusNode.style.display = 'none'; }, 4000);
        }

        try {
          if (typeof window.sendGroupChatMessage === 'function') {
            await window.sendGroupChatMessage(groupId, msgText);
          } else {
            const fetchFn = typeof accountFetch === 'function' ? accountFetch : fetch;
            await fetchFn('/api/messages/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ kind: 'group', groupId }),
              quietBug: true
            }).catch(() => {});

            await fetchFn('/api/messages/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                roomId: 'group:' + groupId,
                category: 'learning',
                clientKey: 'gcw-report-' + Date.now() + '-' + Math.random().toString(36).slice(2),
                text: msgText
              }),
              quietBug: true
            }).catch(() => {});
          }
        } catch {}
      };
    }
  }
})();
