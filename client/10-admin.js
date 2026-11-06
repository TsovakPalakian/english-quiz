    function statusLabel(status) {
      if (status === "pending") return "Waiting";
      if (status === "approved") return "Approved";
      if (status === "rejected") return "Rejected";
      return status;
    }
    function when(seconds) {
      if (!seconds) return "";
      const date = new Date(seconds * 1000);
      return date.toLocaleString();
    }
    function accountVisible(row) {
      if (!row || row.revoked) return false;
      if (isDeveloper()) return true;
      return row.role !== "DEVELOPER" && !row.hidden && !row.revoked;
    }
    function accountMark(row) {
      const state = row && row.revoked ? ' · <span class="mark-deleted">deleted</span>' : (row && row.active === false ? " · inactive" : ' · <span class="mark-active">active</span>');
      return state + (isDeveloper() && row && row.hidden ? ' · <span class="mark-hidden">hidden</span>' : "");
    }
    function recentRows(items, render) {
      const head = items.slice(0, 3).map((item, i) => render(item, i + 1)).join("");
      const tail = items.slice(3);
      if (!tail.length) return head;
      const id = "rest" + Math.random().toString(36).slice(2, 8);
      return head + '<div id="' + id + '" hidden>' + tail.map((item, i) => render(item, i + 4)).join("") + '</div>' +
        '<button class="btn" type="button" data-list-more="' + id + '">Show the rest</button>';
    }
    let adminPaintToken = 0;
    let adminUserPaintToken = 0;
    let adminTab = 'accounts', adminGroups = [], adminMembers = [], adminAccounts = [], adminGroupId = null;
    let adminBucket='',adminTeacherAssignments=[];
    let adminInviteGroupId=null,adminInviteScope='';
    const accountCount=(label,count)=>label+(count?' · '+count:'');
    const canInspectAccount=user=>!!user&&user.active!==false&&user.active!==0&&(sessionIsDeveloper()?['USER','ADMIN'].includes(user.role):user.role==='USER');
    const adminTeachers=groupId=>adminAccounts.filter(user=>['ADMIN','DEVELOPER'].includes(user.role)&&adminTeacherAssignments.some(row=>row.groupId===groupId&&row.teacherIds.map(String).includes(String(user.id))));
    document.addEventListener('click',event=>{if(event.target.closest('[data-jump="admin"],[data-page-path="admin"]')&&isTeacher()&&!viewAccount){adminBucket='';adminTab='accounts';adminSearch='';}},true);
    let adminSearch = '', adminSelectedUser = null;
    let adminAccountId = null;
    const adminLevels = ['A1','A2','A2+','B1','B1+','B2','B2+','C1','C2'];
    let adminGroupLevel = 'A1';
    function accountGroupLevel(group) {
      return adminLevels.find(level => group.title === level || group.title.startsWith(level + ' ') || group.title.endsWith(' ' + level)) || 'unassigned';
    }
    function examLevel(exam) {
      if (exam?.level && adminLevels.includes(exam.level)) return exam.level;
      const title = exam?.title || '';
      const byTitle = adminLevels.find(level => title === level || title.startsWith(level + ' ') || title.endsWith(' ' + level));
      if (byTitle) return byTitle;
      const owner = adminGroups.find(g => (g.examIds || []).includes(exam?.id)) || adminGroups.find(g => g.id === exam?.groupId);
      if (owner) return accountGroupLevel(owner);
      return 'unassigned';
    }
    function accountGroupMetrics(groups,extra={}) {
      const ids=new Set(groups.map(group=>group.id)),students=new Set(adminAccounts.filter(user=>user.role==='USER'&&!user.hidden).map(user=>String(user.id)));
      return {groups:ids.size,teachers:new Set([...groups.flatMap(group=>adminTeachers(group.id).map(user=>String(user.id))),...(extra.teachers||[]).map(user=>String(user.id))]).size,students:new Set([...adminMembers.filter(member=>ids.has(member.groupId)&&students.has(String(member.accountId))).map(member=>String(member.accountId)),...(extra.students||[]).map(user=>String(user.id))]).size,lessons:new Set(groups.flatMap(group=>group.lessonIds||[])).size,exams:new Set(groups.flatMap(group=>group.examIds||[])).size};
    }
    function accountMetricsHTML(groups,extra={}) {
      return '<span class="accounts-metrics">'+Object.entries(accountGroupMetrics(groups,extra)).map(([label,count])=>'<span>'+esc(accountCount(label,count))+'</span>').join('')+'</span>';
    }
    function paintAdminGroupLevel() {
      if (!isTeacher() || viewAccount) return;
      const box = document.getElementById('adminLevelBody'); if (!box) return;
      const level = adminGroupLevel;
      document.getElementById('adminLevelTitle').textContent = level === 'unassigned' ? 'Unassigned groups' : level;
      const groups = adminGroups.filter(group => accountGroupLevel(group) === level);
      box.innerHTML = (level === 'unassigned' ? '' : '<div class="row accounts-group-create"><label for="accountGroupName">Create group</label><span>' + esc(level) + '</span><input id="accountGroupName" aria-label="New group name" placeholder="Group name" maxlength="110"><button class="btn primary" type="button" data-account-group="create">Create group</button></div>') + '<div class="accounts-level-groups">' + groups.map(group => '<button class="path" type="button" data-admin-group="' + group.id + '"><span><b>' + esc(group.title) + '</b>'+accountMetricsHTML([group])+'</span></button>').join('') + '</div>';
      paintPagePath('admingrouplevel');
    }
    function paintAdminAccounts() {
      const list = document.getElementById('adminAccountList'); if (!list) return;
      const query = adminSearch.trim().toLocaleLowerCase();
      const accounts = adminAccounts.filter(user => [user.name,user.login,user.email].some(value => String(value || '').toLocaleLowerCase().includes(query)));
      if(adminBucket==='staff')list.innerHTML=adminAccountRows(accounts.filter(user=>user.role!=='USER'))||'<p class="hint">No staff accounts.</p>';
      else if(adminBucket==='unassigned')list.innerHTML=adminAccountRows(accounts.filter(user=>user.role==='USER'&&!adminMembers.some(m=>String(m.accountId)===String(user.id))))+adminGroups.filter(group=>accountGroupLevel(group)==='unassigned'&&(!query||group.title.toLocaleLowerCase().includes(query))).map(group=>'<button class="path" type="button" data-admin-group="'+group.id+'"><span><b>'+esc(group.title)+'</b>'+accountMetricsHTML([group])+'</span></button>').join('');
      else if(query)list.innerHTML=adminAccountRows(accounts)||'<p class="hint">No matching accounts.</p>';
      else{
        const staff=adminAccounts.filter(user=>user.role!=='USER'),unassigned=adminAccounts.filter(user=>user.role==='USER'&&!adminMembers.some(m=>String(m.accountId)===String(user.id)));
        list.innerHTML='<div class="accounts-special"><button class="file-card" type="button" data-admin-bucket="staff"><b>Teachers & Staff</b>'+accountMetricsHTML(adminGroups.filter(group=>adminTeachers(group.id).length),{teachers:staff})+'</button><button class="file-card" type="button" data-admin-bucket="unassigned"><b>Unassigned</b>'+accountMetricsHTML(adminGroups.filter(group=>accountGroupLevel(group)==='unassigned'),{students:unassigned})+'</button></div><div class="decks">'+adminLevels.map(level=>'<button class="file-card" type="button" data-admin-level="'+level+'"><b>'+esc(level)+'</b>'+accountMetricsHTML(adminGroups.filter(group=>accountGroupLevel(group)===level))+'</button>').join('')+'</div>';
      }
      paintPagePath('admin');
    }
    document.addEventListener('input',event => {
      if (event.target.id !== 'adminAccountSearch' || !isTeacher() || viewAccount) return;
      adminSearch = event.target.value; adminSelectedUser = null; ++adminUserPaintToken;
      const slot = document.getElementById('adminUser'); if (slot) slot.innerHTML = '';
      paintAdminAccounts();
    });
    function validateSignupInput(input) {
      if(!input?.closest('#registerForm')||!['login','email'].includes(input.name))return;
      const valid=input.name==='login'?/^[A-Za-z0-9_]{3,32}$/.test(input.value):/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value)&&input.value.length<=120&&!input.validity.typeMismatch;
      const message=input.name==='login'?'Use 3 to 32 Latin letters, digits or underscores. No spaces.':'Enter a valid email, e.g. name@example.com.';
      const id='signup-'+input.name+'-error';let error=document.getElementById(id);
      if(!error){error=document.createElement('small');error.id=id;error.className='signup-field-error';error.setAttribute('role','status');input.after(error);input.setAttribute('aria-describedby',id);}
      error.hidden=valid;error.textContent=valid?'':message;
      input.setAttribute('aria-invalid',String(!valid));input.setCustomValidity(valid?'':message);
    }
    document.addEventListener('input',event=>validateSignupInput(event.target));
    document.addEventListener('focusout',event=>validateSignupInput(event.target));
    function adminGroupOptions(selected) {
      return '<option value="">Unassigned</option>' + adminGroups.map(group => '<option value="' + group.id + '"' + (group.id === selected ? ' selected' : '') + '>' + esc(group.title) + '</option>').join('');
    }
    function adminAccountRows(accounts,allowInspect=true) {
      return accounts.map(row=>{const inspect=allowInspect&&canInspectAccount(row),tag=inspect?'button':'div';return '<'+tag+' class="path'+(inspect?'':' account-static-row')+'"'+(inspect?' type="button" data-account="user" data-id="'+esc(row.id)+'"':' aria-disabled="true"')+'><span><b>'+esc(row.name||row.login)+'</b><br><span class="label">'+esc(row.email)+' · '+roleLabel(row.role)+accountMark(row)+'</span></span></'+tag+'>';}).join('');
    }
    function paintAdminGroups() {
      const box = document.getElementById('adminBody'); if (!box || !isTeacher() || viewAccount) return;
      if(document.getElementById('adminAccountList'))paintAdminAccounts();
      if (document.querySelector('section.on')?.id === 'admingrouplevel') paintAdminGroupLevel();
      if (document.querySelector('section.on')?.id === 'admingroup') paintAdminGroup();
    }
    function accountInviteHTML() {
      const scope=authUser?.id+':'+viewGen;
      if(adminInviteScope!==scope){adminInviteScope=scope;adminInviteGroupId=null;}
      const selected=adminGroups.find(group=>group.id===adminInviteGroupId);
      if(!selected)adminInviteGroupId=null;
      const groups=adminGroups.slice().sort((a,b)=>a.title.localeCompare(b.title));
      return '<div class="accounts-invite-panel invite-form saas-card" data-group-invites data-group-id="'+(selected?.id||'')+'"><h2>Invite</h2><p class="invite-panel-sub">Generate single-use invite links or QR codes.</p><div><span id="inviteGroupLabel">Group</span><details class="invite-group-picker" data-invite-group-picker><summary aria-labelledby="inviteGroupLabel inviteGroupValue" aria-controls="inviteGroupOptions" aria-expanded="false"><span id="inviteGroupValue" data-invite-selected-group>'+esc(selected?.title||'Choose group')+'</span></summary><div class="invite-group-menu"><input class="saas-input" type="search" data-invite-group-search aria-label="Search groups" aria-controls="inviteGroupOptions" placeholder="Search groups" autocomplete="off"><div class="invite-group-options" id="inviteGroupOptions" role="listbox" aria-label="Groups">'+groups.map(group=>'<button type="button" role="option" data-invite-group-option="'+group.id+'" aria-selected="'+(group.id===selected?.id)+'">'+esc(group.title)+'</button>').join('')+'</div><p class="hint" role="status" data-invite-group-empty'+(groups.length?' hidden':'')+'>'+(groups.length?'No matching groups.':'No groups available.')+'</p></div></details></div><label><span>Invite</span><select class="saas-select" data-invite-kind><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label data-invite-student><span>Teacher</span><select class="saas-select" data-invite-teacher disabled></select></label><p class="hint" data-invite-unassigned>Choose a group first.</p><label hidden data-invite-staff><span>Invited teacher email (optional)</span><input class="saas-input" type="email" maxlength="120" data-invite-email autocomplete="off" placeholder="Optional email"></label><p class="hint">Single use · expires in 72 hours</p><div class="row"><button class="btn primary saas-btn" type="button" data-invite-create disabled>Create invite</button></div><input class="saas-input" type="text" readonly hidden data-invite-url aria-label="Copy invite link" title="Copy invite link"><button type="button" class="invite-qr" data-invite-qr hidden aria-label="Copy QR image" title="Copy QR image"></button><p class="hint" role="status" data-invite-status></p></div>';
    }
    function resetInviteResult(box){
      const input=box.querySelector('[data-invite-url]'),qr=box.querySelector('[data-invite-qr]');
      input.hidden=true;input.value='';qr.hidden=true;qr.replaceChildren();
      box.querySelector('[data-invite-status]').textContent='';
    }
    function syncAccountInvite(box,refreshTeachers=false){
      const group=adminGroups.find(row=>row.id===Number(box.dataset.groupId));
      const select=box.querySelector('[data-invite-teacher]');
      const candidates=group?adminTeachers(group.id).filter(user=>user.active!==false&&user.active!==0&&!user.revoked):[];
      if(refreshTeachers){
        const preferred=select.value||authUser?.id;
        select.innerHTML=candidates.map(user=>'<option value="'+esc(user.id)+'">'+esc((user.name||user.login)+' · '+roleLabel(user.role))+'</option>').join('');
        if(candidates.some(user=>String(user.id)===String(preferred)))select.value=String(preferred);
        else if(candidates.some(user=>String(user.id)===String(authUser?.id)))select.value=String(authUser.id);
      }
      const teacher=box.querySelector('[data-invite-kind]').value==='teacher';
      box.querySelectorAll('[data-invite-staff]').forEach(node=>node.hidden=!teacher);
      box.querySelector('[data-invite-student]').hidden=teacher;
      select.disabled=!candidates.length;
      const permitted=sessionIsDeveloper()||candidates.some(user=>String(user.id)===String(authUser?.id));
      const note=box.querySelector('[data-invite-unassigned]');
      note.hidden=!!group&&(teacher||candidates.length>0&&permitted);
      note.textContent=!group?'Choose a group first.':!candidates.length?'Assign an active teacher to this group first.':'You must be assigned to this group to invite a student.';
      box.querySelector('[data-invite-email]').required=false;
      box.querySelector('[data-invite-create]').disabled=box.getAttribute('aria-busy')==='true'||!group||!teacher&&(!candidates.length||!permitted||!candidates.some(user=>String(user.id)===String(select.value)));
    }
    function filterInviteGroups(picker){
      const query=picker.querySelector('[data-invite-group-search]').value.trim().toLocaleLowerCase();
      const options=[...picker.querySelectorAll('[data-invite-group-option]')];
      options.forEach(option=>option.hidden=!option.textContent.toLocaleLowerCase().includes(query));
      picker.querySelector('[data-invite-group-empty]').hidden=options.some(option=>!option.hidden);
    }
    document.addEventListener('input',event=>{
      const picker=event.target.closest('[data-invite-group-picker]');
      if(event.target.matches('[data-invite-group-search]')&&picker)filterInviteGroups(picker);
      if(event.target.matches('[data-invite-email]'))resetInviteResult(event.target.closest('[data-group-invites]'));
    });
    document.addEventListener('change',event=>{
      const box=event.target.closest('[data-group-invites]');if(!box||!isTeacher()||viewAccount)return;
      syncAccountInvite(box);resetInviteResult(box);
    });
    document.addEventListener('toggle',event=>{
      const picker=event.target;
      if(!picker.matches?.('[data-invite-group-picker]'))return;
      const summary=picker.querySelector('summary');summary.setAttribute('aria-expanded',String(picker.open));
      if(picker.open&&picker.closest('[aria-busy="true"]')){picker.open=false;return;}
      if(picker.open)picker.querySelector('[data-invite-group-search]').focus();
    },true);
    document.addEventListener('click',event=>{
      const option=event.target.closest('[data-invite-group-option]');
      if(option){
        const box=option.closest('[data-group-invites]'),picker=option.closest('[data-invite-group-picker]');
        const group=adminGroups.find(row=>row.id===Number(option.dataset.inviteGroupOption));
        if(!group||!isTeacher()||viewAccount||box.getAttribute('aria-busy')==='true')return;
        adminInviteGroupId=group.id;box.dataset.groupId=String(group.id);
        box.querySelector('[data-invite-selected-group]').textContent=group.title;
        picker.querySelectorAll('[data-invite-group-option]').forEach(node=>node.setAttribute('aria-selected',String(node===option)));
        picker.querySelector('[data-invite-group-search]').value='';filterInviteGroups(picker);
        picker.open=false;picker.querySelector('summary').focus();
        syncAccountInvite(box,true);resetInviteResult(box);
      }
      document.querySelectorAll('[data-invite-group-picker][open]').forEach(picker=>{if(!picker.contains(event.target))picker.open=false;});
    });
    document.addEventListener('focusout',event=>{
      const picker=event.target.closest('[data-invite-group-picker]');
      if(picker&&event.relatedTarget&&!picker.contains(event.relatedTarget))picker.open=false;
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&event.target.matches('[data-invite-url]')){event.preventDefault();event.target.click();}
      const picker=event.target.closest('[data-invite-group-picker]');if(!picker)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();picker.open=false;picker.querySelector('summary').focus();return;}
      const options=[...picker.querySelectorAll('[data-invite-group-option]')].filter(node=>!node.hidden);
      if(event.key==='Enter'&&event.target.matches('[data-invite-group-search]')){event.preventDefault();options[0]?.click();return;}
      if(['Home','End'].includes(event.key)&&!event.target.matches('[data-invite-group-option]'))return;
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        if(!picker.open){picker.open=true;picker.querySelector('[data-invite-group-search]').focus();return;}
        const index=options.indexOf(event.target);
        const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?Math.min(index+1,options.length-1):Math.max(index-1,0);
        options[next]?.focus();
      }
    });
    let currentAttendanceDoc = null;

    function buildCalendarGridHTML(year, monthIndex, selectedDates) {
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      const firstDayDow = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
      const dayHeaders = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      let html = '<div class="attendance-cal-grid">';
      for (const d of dayHeaders) {
        html += '<div class="attendance-cal-hdr">' + d + '</div>';
      }
      for (let i = 0; i < firstDayDow; i++) {
        html += '<div class="attendance-cal-pad"></div>';
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(monthIndex + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateStr = year + '-' + mm + '-' + dd;
        const isSelected = selectedDates.has(dateStr);
        html += '<button type="button" class="attendance-day-btn' + (isSelected ? ' selected' : '') + '" data-attendance-day-select="' + dateStr + '" aria-pressed="' + isSelected + '">' + day + '</button>';
      }
      html += '</div>';
      return html;
    }

    function renderAttendancePlanner(groupId, existingDoc = null) {
      const root = document.querySelector('#adminGroupDetail [data-group-attendance]');
      if (!root) return;
      const monthsList = root.querySelector('[data-attendance-months]');
      const matrixSlot = root.querySelector('[data-attendance-matrix-view]');
      const scheduleBtnRow = root.querySelector('[data-attendance-action="schedule-month"]')?.closest('.row');
      if (monthsList) monthsList.hidden = true;
      if (scheduleBtnRow) scheduleBtnRow.hidden = true;
      if (!matrixSlot) return;
      matrixSlot.hidden = false;

      const now = new Date();
      const defaultMonth = existingDoc?.monthKey || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
      const [initYearStr, initMonthStr] = defaultMonth.split('-');
      let currentYear = Number(initYearStr);
      let currentMonthIndex = Number(initMonthStr) - 1;
      const selectedDates = new Set(existingDoc?.lessonDates || []);

      function renderPlannerView() {
        const monthKey = currentYear + '-' + String(currentMonthIndex + 1).padStart(2, '0');
        const price = existingDoc ? existingDoc.pricePerLesson : 30;
        const currency = existingDoc?.currency || 'BYN';
        const deadline = existingDoc?.paymentDeadline || '';

        matrixSlot.innerHTML = '<div class="attendance-card">' +
          '<h3>' + (existingDoc ? 'Edit Schedule for ' + esc(monthKey) : 'Schedule Month') + '</h3>' +
          '<div class="attendance-form-grid">' +
            '<div class="attendance-field">' +
              '<label for="attPlannerMonth">Month</label>' +
              '<input type="month" id="attPlannerMonth" data-att-planner-month value="' + esc(monthKey) + '"' + (existingDoc ? ' disabled' : '') + '>' +
            '</div>' +
            '<div class="attendance-field">' +
              '<label for="attPlannerPrice">Price per lesson</label>' +
              '<input type="number" id="attPlannerPrice" data-att-planner-price min="0" step="1" value="' + esc(price) + '">' +
            '</div>' +
            '<div class="attendance-field">' +
              '<label for="attPlannerCurrency">Currency</label>' +
              '<select id="attPlannerCurrency" data-att-planner-currency>' +
                ['BYN', 'USD', 'EUR', 'RUB'].map(c => '<option value="' + c + '"' + (c === currency ? ' selected' : '') + '>' + c + '</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="attendance-field">' +
              '<label for="attPlannerDeadline">Payment Deadline</label>' +
              '<div style="display:flex; align-items:center; gap:6px;">' +
                '<input type="text" id="attPlannerDeadline" data-att-planner-deadline value="' + esc(deadline) + '" placeholder="YYYY-MM-DD" style="flex:1;" readonly>' +
                '<button type="button" class="btn icon-btn" id="attPlannerDeadlineBtn" title="Choose date" aria-label="Choose date" style="min-width:38px; height:38px; padding:0 8px;">📅</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="attendance-calendar-box">' +
            '<div class="attendance-presets">' +
              '<button type="button" class="btn" data-att-preset="mwf">Mon / Wed / Fri</button>' +
              '<button type="button" class="btn" data-att-preset="tt">Tue / Thu</button>' +
              '<button type="button" class="btn" data-att-preset="clear">Clear selection</button>' +
            '</div>' +
            '<div data-att-cal-grid-slot>' + buildCalendarGridHTML(currentYear, currentMonthIndex, selectedDates) + '</div>' +
            '<p class="hint" data-att-selected-summary>' + selectedDates.size + ' lesson dates selected</p>' +
          '</div>' +
          '<div class="row" style="margin-top:16px;">' +
            '<button type="button" class="btn primary" data-att-save-schedule data-group-id="' + groupId + '" data-revision="' + (existingDoc ? existingDoc.revision : 0) + '">Save schedule</button>' +
            '<button type="button" class="btn" data-att-cancel-schedule data-group-id="' + groupId + '">Cancel</button>' +
            '<span class="hint" data-att-planner-status style="margin-left:8px;"></span>' +
          '</div>' +
        '</div>';
      }

      renderPlannerView();

      const dlInput = matrixSlot.querySelector('#attPlannerDeadline');
      const dlBtn = matrixSlot.querySelector('#attPlannerDeadlineBtn');
      if (dlBtn && dlInput) {
        const openDlPicker = () => {
          if (window.openUniversalDatePicker) {
            window.openUniversalDatePicker(dlBtn, dlInput.value, (newDate) => {
              dlInput.value = newDate;
            });
          }
        };
        dlBtn.onclick = openDlPicker;
        dlInput.onclick = openDlPicker;
      }

      const monthInput = matrixSlot.querySelector('[data-att-planner-month]');
      if (monthInput && !existingDoc) {
        monthInput.addEventListener('change', () => {
          const val = monthInput.value;
          if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(val)) {
            const [y, m] = val.split('-');
            currentYear = Number(y);
            currentMonthIndex = Number(m) - 1;
            selectedDates.clear();
            const slot = matrixSlot.querySelector('[data-att-cal-grid-slot]');
            if (slot) slot.innerHTML = buildCalendarGridHTML(currentYear, currentMonthIndex, selectedDates);
            const sum = matrixSlot.querySelector('[data-att-selected-summary]');
            if (sum) sum.textContent = '0 lesson dates selected';
          }
        });
      }
    }

    async function renderAttendanceMatrix(groupId, monthKey) {
      const root = document.querySelector('#adminGroupDetail [data-group-attendance]');
      if (!root) return;
      const monthsList = root.querySelector('[data-attendance-months]');
      const matrixSlot = root.querySelector('[data-attendance-matrix-view]');
      const scheduleBtnRow = root.querySelector('[data-attendance-action="schedule-month"]')?.closest('.row');
      if (monthsList) monthsList.hidden = true;
      if (scheduleBtnRow) scheduleBtnRow.hidden = true;
      if (!matrixSlot) return;
      matrixSlot.hidden = false;
      matrixSlot.innerHTML = '<p class="hint">Loading attendance matrix…</p>';

      try {
        const doc = await accountFetch('/api/groups/attendance?groupId=' + groupId + '&month=' + encodeURIComponent(monthKey));
        currentAttendanceDoc = doc;
        const groupStudents = adminAccounts.filter(user => user.role === 'USER' && !user.hidden && adminMembers.some(m => String(m.accountId) === String(user.id) && m.groupId === groupId));
        const lessonDates = Array.isArray(doc.lessonDates) ? doc.lessonDates : [];
        const attendance = doc.attendance && typeof doc.attendance === 'object' ? doc.attendance : {};
        const price = Number(doc.pricePerLesson) || 0;
        const currency = esc(doc.currency || 'BYN');
        const deadline = esc(doc.paymentDeadline || 'Not set');

        let html = '<div class="attendance-card">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">' +
            '<div>' +
              '<h3 style="margin:0 0 4px;">' + esc(monthKey) + ' · Attendance</h3>' +
              '<span class="label">' + lessonDates.length + ' lessons · ' + price + ' ' + currency + ' · Due: ' + deadline + '</span>' +
            '</div>' +
            '<div style="display:flex; gap:8px; align-items:center;">' +
              '<button type="button" class="btn" data-attendance-back data-attendance-group-id="' + groupId + '">← Back</button>' +
              '<button type="button" class="btn" data-attendance-edit-schedule="' + esc(monthKey) + '" data-attendance-group-id="' + groupId + '">Edit schedule</button>' +
              '<button type="button" class="btn primary" data-attendance-save-matrix data-attendance-group-id="' + groupId + '" data-month="' + esc(monthKey) + '">Save attendance</button>' +
              '<span class="hint" data-attendance-matrix-status></span>' +
            '</div>' +
          '</div>';

        if (!lessonDates.length) {
          html += '<p class="hint">No lesson dates configured for this month. Click "Edit schedule" to add dates.</p>';
        } else if (!groupStudents.length) {
          html += '<p class="hint">No students assigned to this group yet.</p>';
        } else {
          const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          html += '<div class="attendance-table-wrap"><table class="attendance-table"><thead><tr>' +
            '<th class="attendance-student-col">Student</th>';
          for (const d of lessonDates) {
            const dateObj = new Date(d + 'T00:00:00');
            const dayName = daysOfWeek[dateObj.getDay()];
            const shortDate = d.slice(5).replace('-', '/');
            html += '<th><div class="attendance-date-hdr"><span>' + dayName + '</span><b>' + shortDate + '</b></div></th>';
          }
          html += '<th class="attendance-num-col">Attended</th>' +
            '<th class="attendance-num-col">Total</th>' +
            '<th class="attendance-num-col">Due (' + currency + ')</th>' +
          '</tr></thead><tbody>';

          for (const s of groupStudents) {
            const stId = String(s.id);
            const stAttendance = attendance[stId] || {};
            let presentCount = 0;
            let cellsHtml = '';

            for (const d of lessonDates) {
              const status = stAttendance[d] || 'unmarked';
              if (status === 'present') presentCount++;
              const symbol = status === 'present' ? '✓' : status === 'absent' ? '✗' : '—';
              cellsHtml += '<td><button type="button" class="attendance-cell-btn" data-attendance-toggle-cell data-student-id="' + esc(stId) + '" data-date="' + esc(d) + '" data-status="' + esc(status) + '" aria-label="' + esc(s.name || s.login) + ' ' + d + ': ' + esc(status) + '">' + symbol + '</button></td>';
            }

            const dueAmount = presentCount * price;
            html += '<tr data-student-row="' + esc(stId) + '">' +
              '<td class="attendance-student-col" title="' + esc(s.email || s.login) + '"><b>' + esc(s.name || s.login) + '</b></td>' +
              cellsHtml +
              '<td class="attendance-stat-cell" data-student-present="' + esc(stId) + '">' + presentCount + '</td>' +
              '<td class="attendance-stat-cell">' + lessonDates.length + '</td>' +
              '<td class="attendance-stat-cell" data-student-due="' + esc(stId) + '">' + dueAmount + '</td>' +
            '</tr>';
          }

          html += '</tbody></table></div>';
        }

        html += '</div>';
        matrixSlot.innerHTML = html;
      } catch (err) {
        matrixSlot.innerHTML = '<p class="hint error">' + esc(err.message) + '</p><button type="button" class="btn" data-attendance-back data-attendance-group-id="' + groupId + '">← Back</button>';
      }
    }

    async function renderGroupAttendanceMonths(groupId) {
      const container = document.querySelector('#adminGroupDetail [data-group-attendance] [data-attendance-months]');
      if (!container) return;
      try {
        const res = await accountFetch('/api/groups/attendance?groupId=' + groupId);
        if (!container.isConnected) return;
        const months = res?.months || [];
        if (!months.length) {
          container.innerHTML = '<p class="hint">No scheduled months yet. Click "+ Schedule month" to create one.</p>';
          return;
        }
        container.innerHTML = months.map(m => {
          return '<div class="day-row accounts-exam-row" data-attendance-month-row="' + esc(m.monthKey) + '"><button class="path" type="button" data-attendance-open-month="' + esc(m.monthKey) + '" data-attendance-group-id="' + groupId + '"><span><b>' + esc(m.monthKey) + '</b><br><span class="label">' + esc(m.lessonCount) + ' lessons · ' + esc(m.pricePerLesson) + ' ' + esc(m.currency) + (m.paymentDeadline ? ' · Due ' + esc(m.paymentDeadline) : '') + '</span></span></button><div class="day-tools"><button class="day-hide" type="button" data-attendance-delete-month="' + esc(m.monthKey) + '" data-attendance-group-id="' + groupId + '" aria-label="Delete month" title="Delete month"><svg class="lucide lucide-trash-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button></div></div>';
        }).join('');
      } catch (err) {
        if (container.isConnected) container.innerHTML = '<p class="hint error">' + esc(err.message) + '</p>';
      }
    }
    function paintAdminGroup() {
      if (!isTeacher() || viewAccount) return;
      const selected = adminGroups.find(group => group.id === adminGroupId);
      if (!selected) { if (document.querySelector('section.on')?.id === 'admingroup') goBack('admin'); return; }
      document.getElementById('adminGroupTitle').textContent = selected.title;
      const detail = document.getElementById('adminGroupDetail');
      const folds=Object.fromEntries(['students','lessons','exams','exams-assign','teachers','teachers-list','attendance'].map(name=>[name,detail.dataset.groupId===String(selected.id)&&!!detail.querySelector('[data-group-'+name+']')?.open]));
      const students = adminAccounts.filter(user => user.role === 'USER' && !user.hidden && adminMembers.some(m => String(m.accountId) === String(user.id) && m.groupId === selected.id));
      const selectedLevel = accountGroupLevel(selected);
      const exams = examLoad().filter(exam => !exam.instanceStatus && (examLevel(exam) === selectedLevel || (selected.examIds || []).includes(exam.id))), lessons = lmLibrary?.materials || [];
      const assignedExams = exams.filter(exam => (selected.examIds || []).includes(exam.id));
      const candidateExams = exams.filter(exam => !(selected.examIds || []).includes(exam.id));
      const assignedRows = assignedExams.map(exam => {
        const label = 'Unassign';
        const icon = '<svg class="lucide lucide-circle-minus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';
        return '<div class="day-row accounts-exam-row" data-group-exam="' + exam.id + '"><button class="path" type="button" data-exam-open="' + exam.id + '"><span><b>' + esc(exam.title) + '</b><br><span class="label">' + esc(selected.title) + ' · Assigned</span></span></button><div class="day-tools"><button class="day-hide" type="button" data-account-group="unassign-exam" data-exam-id="' + exam.id + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button></div></div>';
      }).join('');
      const candidateRows = candidateExams.map(exam => {
        const owner = adminGroups.find(group => (group.examIds || []).includes(exam.id));
        const label = 'Assign';
        const icon = '<svg class="lucide lucide-circle-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';
        return '<div class="day-row accounts-exam-row" data-group-exam="' + exam.id + '"><button class="path" type="button" data-exam-open="' + exam.id + '"><span><b>' + esc(exam.title) + '</b><br><span class="label">' + esc(owner?.title || 'Unassigned') + '</span></span></button><div class="day-tools"><button class="day-hide" type="button" data-account-group="exam" data-exam-id="' + exam.id + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button></div></div>';
      }).join('');
      detail.innerHTML = '<h2>' + esc(selected.title) + '</h2><div class="row"><input id="accountGroupTitle" aria-label="Group name" maxlength="120" value="' + esc(selected.title) + '"><button class="btn" type="button" data-account-group="rename">Rename group</button><button class="btn stop" type="button" data-account-group="archive">Archive group</button></div><details class="accounts-fold" data-group-students><summary>'+esc(accountCount('Students',students.length))+'</summary>' + adminAccountRows(students) + '</details><details class="accounts-fold" data-group-lessons><summary>'+esc(accountCount('Lessons',selected.lessonIds.length))+'</summary>' + selected.lessonIds.map(id => '<button class="path" type="button" data-lm-open="' + id + '">' + esc(lessons.find(l => l.id === id)?.title || 'Lesson') + '</button>').join('') + '</details><details class="accounts-fold" data-group-exams><summary>'+esc(accountCount('Exams',assignedExams.length))+'</summary>' + (assignedRows || '<p class="hint">No exams yet.</p>') + '<details class="accounts-fold" data-group-exams-assign><summary>Assign exams</summary>' + (candidateRows || '<p class="hint">No available exams.</p>') + '</details></details><details class="accounts-fold" data-group-attendance data-group-id="' + selected.id + '"><summary>Attendance</summary><div class="attendance-root" data-attendance-group-id="' + selected.id + '"><div class="row" style="margin-bottom:8px;"><button class="btn" type="button" data-attendance-action="schedule-month" data-attendance-group-id="' + selected.id + '">+ Schedule month</button></div><div class="attendance-months-list" data-attendance-months><p class="hint">Loading attendance months…</p></div><div class="attendance-matrix-view" data-attendance-matrix-view hidden></div></div></details>';
      const teachers=adminTeachers(selected.id),assignment=adminTeacherAssignments.find(row=>row.groupId===selected.id),candidates=adminAccounts.filter(user=>['ADMIN','DEVELOPER'].includes(user.role)&&user.active!==false&&user.active!==0);
      detail.querySelector('[data-group-students]').insertAdjacentHTML('beforebegin','<details class="accounts-fold" data-group-teachers-list><summary>'+esc(accountCount('Teachers',teachers.length))+'</summary>'+adminAccountRows(teachers,false)+'<details class="accounts-fold" data-group-teachers data-group-id="'+selected.id+'" data-revision="'+(assignment?.revision||0)+'"><summary>Assign teachers</summary>'+candidates.map(user=>{const assigned=assignment?.teacherIds?.map(String).includes(String(user.id)),label=assigned?'Unassign':'Assign';return '<div class="day-row accounts-teacher-row"><div class="path account-static-row"><span><b>'+esc(user.name||user.login)+'</b><br><span class="label">'+esc(user.email||user.login)+' · '+roleLabel(user.role)+accountMark(user)+'</span></span></div><div class="day-tools"><button class="day-hide" type="button" data-account-teacher-toggle="'+esc(user.id)+'" aria-pressed="'+!!assigned+'" aria-label="'+label+'" title="'+label+'"></button></div></div>';}).join('')+'<p class="hint" role="status" data-account-teachers-status></p></details></details>');
      detail.querySelectorAll('[data-account-teacher-toggle]').forEach(button=>{const glyph=window.lucide?.icons[button.getAttribute('aria-pressed')==='true'?'CircleMinus':'CirclePlus'];if(glyph)button.append(window.lucide.createElement(glyph));});
      detail.dataset.groupId = String(selected.id);
      for(const [name,open] of Object.entries(folds)){const fold=detail.querySelector('[data-group-'+name+']');if(fold)fold.open=open;}
      if (folds.attendance) {
        const root = detail.querySelector('[data-group-attendance] .attendance-root');
        if (root && typeof renderGroupCalendarWidget === 'function') {
          renderGroupCalendarWidget(root, selected.id, selected.title);
        } else {
          renderGroupAttendanceMonths(selected.id);
        }
      }
      paintPagePath('admingroup');
    }
    document.addEventListener('toggle', event => {
      const fold = event.target.closest('#adminGroupDetail [data-group-attendance]');
      if (fold && fold.open) {
        const groupId = Number(fold.dataset.groupId);
        const root = fold.querySelector('.attendance-root');
        const selected = adminGroups.find(g => g.id === groupId);
        if (root && typeof renderGroupCalendarWidget === 'function') {
          renderGroupCalendarWidget(root, groupId, selected?.title);
        } else if (groupId) {
          renderGroupAttendanceMonths(groupId);
        }
      }
    }, true);
    document.addEventListener('click', async event => {
      // 1. Back to months list
      const backBtn = event.target.closest('#adminGroupDetail [data-attendance-back]');
      if (backBtn) {
        const root = document.querySelector('#adminGroupDetail [data-group-attendance]');
        if (root) {
          const monthsList = root.querySelector('[data-attendance-months]');
          const matrixSlot = root.querySelector('[data-attendance-matrix-view]');
          const scheduleBtnRow = root.querySelector('[data-attendance-action="schedule-month"]')?.closest('.row');
          if (monthsList) monthsList.hidden = false;
          if (scheduleBtnRow) scheduleBtnRow.hidden = false;
          if (matrixSlot) { matrixSlot.hidden = true; matrixSlot.innerHTML = ''; }
          const groupId = Number(backBtn.dataset.attendanceGroupId);
          if (groupId) renderGroupAttendanceMonths(groupId);
        }
        return;
      }

      // 2. Schedule month button (+ Schedule month)
      const schedAction = event.target.closest('#adminGroupDetail [data-attendance-action="schedule-month"]');
      if (schedAction) {
        const groupId = Number(schedAction.dataset.attendanceGroupId);
        if (groupId) renderAttendancePlanner(groupId, null);
        return;
      }

      // 3. Open month row (view matrix)
      const openMonthBtn = event.target.closest('#adminGroupDetail [data-attendance-open-month]');
      if (openMonthBtn) {
        const monthKey = openMonthBtn.dataset.attendanceOpenMonth;
        const groupId = Number(openMonthBtn.dataset.attendanceGroupId);
        if (monthKey && groupId) renderAttendanceMatrix(groupId, monthKey);
        return;
      }

      // 4. Edit schedule button
      const editSchedBtn = event.target.closest('#adminGroupDetail [data-attendance-edit-schedule]');
      if (editSchedBtn) {
        const groupId = Number(editSchedBtn.dataset.attendanceGroupId);
        if (groupId && currentAttendanceDoc) renderAttendancePlanner(groupId, currentAttendanceDoc);
        return;
      }

      // 5. Day button in planner calendar grid
      const dayBtn = event.target.closest('#adminGroupDetail [data-attendance-day-select]');
      if (dayBtn) {
        const isSelected = dayBtn.classList.toggle('selected');
        dayBtn.setAttribute('aria-pressed', String(isSelected));
        const allSelected = document.querySelectorAll('#adminGroupDetail [data-attendance-day-select].selected');
        const summary = document.querySelector('#adminGroupDetail [data-att-selected-summary]');
        if (summary) summary.textContent = allSelected.length + ' lesson dates selected';
        return;
      }

      // 6. Presets in planner
      const presetBtn = event.target.closest('#adminGroupDetail [data-att-preset]');
      if (presetBtn) {
        const preset = presetBtn.dataset.attPreset;
        const monthInput = document.querySelector('#adminGroupDetail [data-att-planner-month]');
        const monthVal = monthInput?.value;
        if (!monthVal) return;
        const [yStr, mStr] = monthVal.split('-');
        const y = Number(yStr), mIdx = Number(mStr) - 1;
        const days = document.querySelectorAll('#adminGroupDetail [data-attendance-day-select]');

        days.forEach(btn => {
          const dStr = btn.dataset.attendanceDaySelect;
          const dayNum = Number(dStr.split('-')[2]);
          const dow = new Date(y, mIdx, dayNum).getDay();
          let shouldSelect = false;
          if (preset === 'mwf' && [1, 3, 5].includes(dow)) shouldSelect = true;
          if (preset === 'tt' && [2, 4].includes(dow)) shouldSelect = true;
          if (preset === 'clear') shouldSelect = false;
          if (preset === 'mwf' || preset === 'tt') {
            if (shouldSelect) {
              btn.classList.add('selected');
              btn.setAttribute('aria-pressed', 'true');
            }
          } else if (preset === 'clear') {
            btn.classList.remove('selected');
            btn.setAttribute('aria-pressed', 'false');
          }
        });
        const allSelected = document.querySelectorAll('#adminGroupDetail [data-attendance-day-select].selected');
        const summary = document.querySelector('#adminGroupDetail [data-att-selected-summary]');
        if (summary) summary.textContent = allSelected.length + ' lesson dates selected';
        return;
      }

      // 7. Cancel planner
      const cancelSchedBtn = event.target.closest('#adminGroupDetail [data-att-cancel-schedule]');
      if (cancelSchedBtn) {
        const groupId = Number(cancelSchedBtn.dataset.groupId);
        if (currentAttendanceDoc) {
          renderAttendanceMatrix(groupId, currentAttendanceDoc.monthKey);
        } else {
          const root = document.querySelector('#adminGroupDetail [data-group-attendance]');
          if (root) {
            const monthsList = root.querySelector('[data-attendance-months]');
            const matrixSlot = root.querySelector('[data-attendance-matrix-view]');
            const scheduleBtnRow = root.querySelector('[data-attendance-action="schedule-month"]')?.closest('.row');
            if (monthsList) monthsList.hidden = false;
            if (scheduleBtnRow) scheduleBtnRow.hidden = false;
            if (matrixSlot) { matrixSlot.hidden = true; matrixSlot.innerHTML = ''; }
            if (groupId) renderGroupAttendanceMonths(groupId);
          }
        }
        return;
      }

      // 8. Save schedule button
      const saveSchedBtn = event.target.closest('#adminGroupDetail [data-att-save-schedule]');
      if (saveSchedBtn && !saveSchedBtn.disabled) {
        const groupId = Number(saveSchedBtn.dataset.groupId);
        const revision = Number(saveSchedBtn.dataset.revision) || 0;
        const monthInput = document.querySelector('#adminGroupDetail [data-att-planner-month]');
        const priceInput = document.querySelector('#adminGroupDetail [data-att-planner-price]');
        const currSelect = document.querySelector('#adminGroupDetail [data-att-planner-currency]');
        const deadInput = document.querySelector('#adminGroupDetail [data-att-planner-deadline]');
        const statusLbl = document.querySelector('#adminGroupDetail [data-att-planner-status]');
        const monthKey = monthInput?.value;
        if (!monthKey || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthKey)) {
          if (statusLbl) statusLbl.textContent = 'Invalid month selected.';
          return;
        }
        const selectedButtons = document.querySelectorAll('#adminGroupDetail [data-attendance-day-select].selected');
        const lessonDates = Array.from(selectedButtons).map(b => b.dataset.attendanceDaySelect).sort();
        if (!lessonDates.length) {
          if (statusLbl) statusLbl.textContent = 'Select at least one lesson date.';
          return;
        }
        const pricePerLesson = Math.max(0, Number(priceInput?.value) || 0);
        const currency = currSelect?.value || 'BYN';
        const paymentDeadline = deadInput?.value || '';

        saveSchedBtn.disabled = true;
        if (statusLbl) statusLbl.textContent = 'Saving schedule…';
        try {
          const savedDoc = await accountFetch('/api/groups/attendance', {
            method: 'POST',
            body: JSON.stringify({
              groupId,
              month: monthKey,
              payload: {
                lessonDates,
                pricePerLesson,
                currency,
                paymentDeadline,
                attendance: currentAttendanceDoc?.attendance || {},
                expectedRevision: revision
              }
            })
          });
          currentAttendanceDoc = savedDoc;
          renderAttendanceMatrix(groupId, monthKey);
        } catch (err) {
          if (statusLbl) statusLbl.textContent = err.message;
        } finally {
          if (saveSchedBtn.isConnected) saveSchedBtn.disabled = false;
        }
        return;
      }

      // 9. Matrix status cell toggle
      const cellBtn = event.target.closest('#adminGroupDetail [data-attendance-toggle-cell]');
      if (cellBtn) {
        const curStatus = cellBtn.dataset.status || 'unmarked';
        const nextStatus = curStatus === 'unmarked' ? 'present' : curStatus === 'present' ? 'absent' : 'unmarked';
        cellBtn.dataset.status = nextStatus;
        cellBtn.textContent = nextStatus === 'present' ? '✓' : nextStatus === 'absent' ? '✗' : '—';
        const row = cellBtn.closest('tr');
        if (row) {
          const studentId = cellBtn.dataset.studentId;
          const presentCells = row.querySelectorAll('[data-attendance-toggle-cell][data-status="present"]');
          const presentCell = row.querySelector('[data-student-present="' + studentId + '"]');
          const dueCell = row.querySelector('[data-student-due="' + studentId + '"]');
          const price = Number(currentAttendanceDoc?.pricePerLesson) || 0;
          if (presentCell) presentCell.textContent = String(presentCells.length);
          if (dueCell) dueCell.textContent = String(presentCells.length * price);
        }
        return;
      }

      // 10. Save matrix changes button
      const saveMatrixBtn = event.target.closest('#adminGroupDetail [data-attendance-save-matrix]');
      if (saveMatrixBtn && !saveMatrixBtn.disabled) {
        const groupId = Number(saveMatrixBtn.dataset.attendanceGroupId);
        const monthKey = saveMatrixBtn.dataset.month;
        const statusLbl = document.querySelector('#adminGroupDetail [data-attendance-matrix-status]');
        if (!groupId || !monthKey || !currentAttendanceDoc) return;

        const cells = document.querySelectorAll('#adminGroupDetail [data-attendance-toggle-cell]');
        const attendanceMap = {};
        cells.forEach(c => {
          const stId = c.dataset.studentId;
          const date = c.dataset.date;
          const status = c.dataset.status;
          if (stId && date && ['present', 'absent'].includes(status)) {
            if (!attendanceMap[stId]) attendanceMap[stId] = {};
            attendanceMap[stId][date] = status;
          }
        });

        saveMatrixBtn.disabled = true;
        if (statusLbl) statusLbl.textContent = 'Saving…';
        try {
          const updated = await accountFetch('/api/groups/attendance', {
            method: 'POST',
            body: JSON.stringify({
              groupId,
              month: monthKey,
              payload: {
                lessonDates: currentAttendanceDoc.lessonDates,
                pricePerLesson: currentAttendanceDoc.pricePerLesson,
                currency: currentAttendanceDoc.currency,
                paymentDeadline: currentAttendanceDoc.paymentDeadline,
                attendance: attendanceMap,
                expectedRevision: currentAttendanceDoc.revision
              }
            })
          });
          currentAttendanceDoc = updated;
          if (statusLbl) {
            statusLbl.textContent = 'Saved.';
            setTimeout(() => { if (statusLbl.isConnected) statusLbl.textContent = ''; }, 2500);
          }
        } catch (err) {
          if (statusLbl) statusLbl.textContent = err.message;
        } finally {
          if (saveMatrixBtn.isConnected) saveMatrixBtn.disabled = false;
        }
        return;
      }

      // 11. Delete month button
      const delBtn = event.target.closest('#adminGroupDetail [data-attendance-delete-month]');
      if (delBtn && !delBtn.disabled && isTeacher() && !viewAccount) {
        const monthKey = delBtn.dataset.attendanceDeleteMonth;
        const groupId = Number(delBtn.dataset.attendanceGroupId);
        if (!monthKey || !groupId) return;
        if (!confirm('Delete attendance schedule for ' + monthKey + '?')) return;
        delBtn.disabled = true;
        try {
          await accountFetch('/api/groups/attendance?groupId=' + groupId + '&month=' + encodeURIComponent(monthKey), {
            method: 'DELETE'
          });
          await renderGroupAttendanceMonths(groupId);
        } catch (err) {
          alert(err.message);
        } finally {
          if (delBtn.isConnected) delBtn.disabled = false;
        }
        return;
      }
    });
    document.addEventListener('click',async event=>{
      const button=event.target.closest('#adminGroupDetail [data-account-teacher-toggle]');if(!button||button.disabled||!isTeacher()||viewAccount)return;
      const form=button.closest('[data-group-teachers]'),status=form.querySelector('[data-account-teachers-status]'),actor=authUser?.id,generation=viewGen,groupId=Number(form.dataset.groupId),teacherId=String(button.dataset.accountTeacherToggle);
      const current=adminTeacherAssignments.find(row=>row.groupId===groupId),ids=new Set((current?.teacherIds||[]).map(String));if(ids.has(teacherId))ids.delete(teacherId);else ids.add(teacherId);
      form.querySelectorAll('button').forEach(node=>node.disabled=true);status.textContent='Saving…';
      try{const result=await accountFetch('/api/accounts/group-teachers',{method:'POST',body:JSON.stringify({groupId,expectedRevision:Number(form.dataset.revision),teacherIds:[...ids]})});
        if(actor!==authUser?.id||generation!==viewGen||viewAccount)return;adminTeacherAssignments=adminTeacherAssignments.filter(row=>row.groupId!==result.groupId);adminTeacherAssignments.push(result);
        if(adminGroupId===groupId&&document.querySelector('section.on')?.id==='admingroup'){paintAdminGroup();document.querySelector('[data-account-teachers-status]').textContent='Saved';}
      }catch(error){if(form.isConnected)status.textContent=error.message;}finally{if(form.isConnected)form.querySelectorAll('button').forEach(node=>node.disabled=false);}
    });
    document.addEventListener('click',async event=>{
      const create=event.target.closest('#adminBody [data-invite-create]');
      const copy=event.target.closest('#adminBody [data-invite-url],#adminBody [data-invite-qr]');
      if(!create&&!copy||!isTeacher()||viewAccount)return;
      const box=event.target.closest('[data-group-invites]');if(!box||box.getAttribute('aria-busy')==='true'||create?.disabled)return;
      const status=box.querySelector('[data-invite-status]'),urlInput=box.querySelector('[data-invite-url]');
      if(copy){
        if(!urlInput?.value)return;
        try{
          if(copy.matches('[data-invite-qr]')){
            const image=copy.querySelector('img');if(!image)return;
            const imageBlob=image.decode().then(()=>new Promise((resolve,reject)=>{
              const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
              canvas.getContext('2d').drawImage(image,0,0);
              canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image copy unavailable.')),'image/png');
            }));
            await navigator.clipboard.write([new ClipboardItem({'image/png':imageBlob})]);status.textContent='QR image copied.';
          }else{await navigator.clipboard.writeText(urlInput.value);status.textContent='Link copied.';}
        }catch{urlInput.hidden=false;urlInput.select();status.textContent='Clipboard unavailable. Copy the selected link.';}
        return;
      }
      const teacherId=box.querySelector('[data-invite-teacher]')?.value||authUser?.id;
      const inviteKind=box.querySelector('[data-invite-kind]').value;
      const email=box.querySelector('[data-invite-email]');
      const emailVal=email?.value?.trim()||'';
      if(inviteKind==='teacher'&&emailVal){if(!email.reportValidity())return;}
      syncAccountInvite(box);if(create.disabled)return;
      const groupId=Number(box.dataset.groupId),actor=authUser?.id,generation=viewGen;
      const controls=[...box.querySelectorAll('select,input,[data-invite-group-option]')].map(node=>({node,disabled:node.disabled}));
      box.querySelector('[data-invite-group-picker]').open=false;
      resetInviteResult(box);box.setAttribute('aria-busy','true');
      controls.forEach(({node})=>node.disabled=true);
      create.disabled=true;status.textContent='Creating…';
      try{
        const result=await accountFetch('/api/accounts/invites',{method:'POST',body:JSON.stringify({groupId,teacherId,kind:inviteKind,email:inviteKind==='teacher'?(emailVal||undefined):undefined})});
        if(!box.isConnected||actor!==authUser?.id||generation!==viewGen||viewAccount)return;
        const link=location.origin+'/?invite='+encodeURIComponent(result.token);
        urlInput.value=link;urlInput.hidden=false;
        status.textContent='Invite for '+result.groupTitle+' · expires '+new Date(result.expiresAt).toLocaleDateString();
        if(typeof paintInviteQr==='function')paintInviteQr(box.querySelector('[data-invite-qr]'),link);
      }catch(error){status.textContent=error.message;}
      finally{box.removeAttribute('aria-busy');controls.forEach(({node,disabled})=>node.disabled=disabled);if(box.isConnected)syncAccountInvite(box);}
    });
    async function saveAccountGroup(body) {
      const actor = authUser?.id, generation = viewGen;
      const data = await accountFetch('/api/groups/manage',{method:'POST',body:JSON.stringify(body)});
      if (actor !== authUser?.id || generation !== viewGen || viewAccount) return;
      classGroups = data.groups; classGroupsReady = true; adminGroups = data.groups;
      if(body.action==='rename'){const renamed=adminGroups.find(group=>group.id===body.id);if(renamed)adminGroupLevel=accountGroupLevel(renamed);}
      window.ContentCache?.drop('account:');
      if (body.action === 'archive') paintArchive();
      await examPull(true); paintGroups(); paintAdminGroups();
    }
    document.addEventListener('click',event => {
      const tab = event.target.closest('[data-admin-tab]'), group = event.target.closest('[data-admin-group]'), action = event.target.closest('[data-account-group]'), level = event.target.closest('[data-admin-level]'),bucket=event.target.closest('[data-admin-bucket]');
      if (!tab && !group && !action && !level&&!bucket || !isTeacher() || viewAccount) return;
      if(bucket){pushHistory();adminBucket=bucket.dataset.adminBucket;paintAdminAccounts();return;}
      if (level) { pushHistory(); adminGroupLevel = level.dataset.adminLevel; show('admingrouplevel'); return; }
      if (tab) { adminTab = tab.dataset.adminTab; paintAdmin(); return; }
      if (group) { adminGroupId = domEntityId(group.dataset.adminGroup); classGroupId = adminGroupId;const selected=adminGroups.find(row=>row.id===adminGroupId);if(selected)adminGroupLevel=accountGroupLevel(selected);visit('admingroup'); return; }
      const kind = action.dataset.accountGroup, selected = adminGroups.find(g => g.id === adminGroupId);
      const body = kind === 'create' ? {action:kind,title:document.getElementById('accountGroupName').value} : {action:kind,id:selected?.id,expectedRevision:selected?.revision};
      if (kind === 'create') {
        const name = body.title.trim();
        if (!name || !adminLevels.includes(adminGroupLevel)) return;
        body.title = name.startsWith(adminGroupLevel + ' ') ? name : adminGroupLevel + ' ' + name;
      }
      if (kind === 'rename') body.title = document.getElementById('accountGroupTitle').value;
      if (kind === 'exam' || kind === 'unassign-exam') { body.examId = Number(action.dataset.examId); if (!body.examId) return; }
      if (kind === 'archive' && !confirm('Move this group to Archive?')) return;
      action.disabled = true; saveAccountGroup(body).catch(error => { window.LearningMain?.notice(error.message,true); }).finally(() => { action.disabled = false; });
    });
    function paintAdmin(detailPage = '') {
      if(adminTab==='groups')adminTab='accounts';
      if (!detailPage) { const active = document.querySelector?.('section.on')?.id; if (['adminuser','admingroup','admingrouplevel'].includes(active)) detailPage = active; }
      const token = ++adminPaintToken, actor = authUser?.id, generation = viewGen;
      const still = () => token === adminPaintToken && actor === authUser?.id && generation === viewGen;
      const box = document.getElementById("adminBody");
      if (!box) return;
      adminSelectedUser = null; ++adminUserPaintToken;
      if (!isTeacher()) {
        box.innerHTML = '<div class="card"><p>Teachers only.</p></div>';
        return;
      }
      document.querySelectorAll('[data-admin-tab]').forEach(tab => { const on = tab.dataset.adminTab === adminTab; tab.classList.toggle('on',on); tab.setAttribute('aria-selected',String(on)); });
      viewFresh('admin', () => Promise.all([
        accountFetch("/api/admin/registrations"),
        accountFetch("/api/admin/users"),
        accountFetch("/api/admin/changes"), accountFetch('/api/groups'), accountFetch('/api/groups/members'),accountFetch('/api/accounts/group-teachers')
      ]), ([regs, users, changes, groups, membership,teachers], refresh) => {
        if (!still() || refresh && (editingIn(box) || editingIn(document.getElementById('adminUser')) || box.querySelector('[data-group-invites][aria-busy="true"]'))) return;
        const searching = document.activeElement?.id === 'adminAccountSearch';
        if (refresh) adminSelectedUser = null;
        const waiting = (regs.registrations || []).filter((row) => row.status === "pending" && accountVisible(row));
        accountsCountActor = actor; accountsCountAt = Date.now();
        const accounts = (users.users || []).filter(accountVisible);
        adminGroups = groups.groups || []; adminMembers = membership.members || []; adminAccounts = accounts;
        adminTeacherAssignments=teachers.assignments||[];
        if (!classGroupsDirty) { classGroups = adminGroups; classGroupsReady = true; }
        if (adminTab === 'groups') { paintAdminGroups(); if (detailPage === 'adminuser') paintAdminUser(adminAccountId); else if (detailPage === 'admingroup') paintAdminGroup(); else if (detailPage === 'admingrouplevel') paintAdminGroupLevel(); return; }
        const accountIds = new Set(accounts.map((row) => String(row.id)));
        const history = (regs.registrations || []).filter((row) => accountVisible(row) && (!row.user_id || accountIds.has(String(row.user_id))));
        const changeRows = (changes.changes || []).filter((row) => row.status === 'pending' && accountVisible(row) && accountIds.has(String(row.user_id)));
        paintAccountsCount(waiting.length+changeRows.length);
        const changesHtml = '<div class="card"><p class="label">Account change requests</p>' +
          (changeRows.length ? recentRows(changeRows, (row, n) => {
            if (row.status !== "pending") {
              return '<div style="margin:8px 0"><b>' + n + ". " + esc(row.from_login) + '</b> · ' + statusLabel(row.status) +
                changeHtml(row) +
                '<p class="hint">' + esc(when(row.decided_at || row.created_at)) + '</p></div>';
            }
            const own = authUser && String(row.user_id) === String(authUser.id);
            const blocked = row.locked || (own && !sessionIsDeveloper());
            const note = row.locked
              ? '<p class="hint">This teacher can change account details after a second active teacher joins.</p>'
              : (own && !sessionIsDeveloper() ? '<p class="hint">Someone else has to approve this.</p>' : "");
            const approve = blocked ? "" : '<button class="btn primary" type="button" data-account="approve-change" data-id="' + esc(row.id) + '">Approve</button>';
            return '<div class="account-approval-row account-change-row" data-list-row><div><b>' + esc(row.from_login) + '</b>' +
              (isDeveloper() ? " · " + esc(roleLabel(row.role)) : "") +
              changeHtml(row) + note +'</div><span></span>'+ (approve||'<span></span>')+
              '<button class="btn" type="button" data-account="reject-change" data-id="' + esc(row.id) + '">Reject</button></div>';
          }) : '<p class="hint">No account changes are waiting.</p>') +
          '</div>';
        const waitingHtml = '<div class="card"><p class="label">Waiting for approval</p>' +
          (waiting.length ? waiting.map((row) =>
            '<div class="account-approval-row" data-list-row><div><b>' + esc((row.name && row.name.trim()) ? row.name.trim() : row.login) + '</b><span class="hint">Login: ' + esc(row.login) + '<br>Email: ' + esc(row.email) + ' · Role: ' + roleLabel(row.role) + '</span></div>' +
            '<div>'+(sessionIsDeveloper()&&!row.inviteGroupId?'<select aria-label="Approved role" data-registration-role="'+esc(row.id)+'"><option value="USER"'+(row.role!=='ADMIN'?' selected':'')+'>Student</option><option value="ADMIN"'+(row.role==='ADMIN'?' selected':'')+'>Teacher</option></select>':'')+(row.role==='ADMIN'?'<span class="hint">Teachers and staff</span>':'<select aria-label="Student group" data-registration-group="' + esc(row.id) + '"'+(row.inviteGroupId?' disabled':'')+'>' + adminGroupOptions(row.inviteGroupId||null) + '</select>')+'</div><button class="btn primary" type="button" data-account="approve" data-id="' + esc(row.id) + '"'+(row.inviteCanApprove===false||row.role==='ADMIN'&&!sessionIsDeveloper()&&row.inviteCanApprove!==true?' disabled title="Only the inviting teacher or a developer can approve"':'')+'>Approve</button>' +
            '<button class="btn" type="button" data-account="reject" data-id="' + esc(row.id) + '">Reject</button></div>'
          ).join("") : '<p class="hint">No one is waiting.</p>') +
          '</div>';
        const statusBadge = (st) => {
          const cls = st === 'approved' ? 'badge badge-emerald' : st === 'rejected' ? 'badge badge-rose' : 'badge badge-amber';
          return '<span class="' + cls + '" style="font-size:11px; font-weight:700;">' + esc(statusLabel(st)) + '</span>';
        };
        const historyHtml = '<div class="card"><p class="label">Registration history</p>' +
          (history.length ? recentRows(history, (row, n) =>
            '<div class="registration-history-row" data-list-row><div><b>' + n + ". " + esc(row.login) + '</b> <span style="color:var(--saas-text-muted, #64748b);">· ' + esc(row.email) + '</span></div><div style="display:flex; align-items:center; gap:12px; flex-shrink:0;">' + statusBadge(row.status) + '<span class="hint" style="margin:0; font-size:12px; color:var(--saas-text-muted, #64748b);">' + esc(when(row.created_at)) + '</span></div></div>'
          ) : '<p class="hint">No registrations yet.</p>') +
          '</div>';
        box.innerHTML = adminTab === 'requests' ? waitingHtml + changesHtml : adminTab === 'history' ? historyHtml : adminTab === 'invite' ? accountInviteHTML() :
          '<label for="adminAccountSearch">Search accounts</label><input id="adminAccountSearch" type="search" placeholder="Name, login or email" value="' + esc(adminSearch) + '"><div id="adminAccountList"></div>';
        if (adminTab === 'accounts') paintAdminAccounts();
        if (adminTab === 'invite') syncAccountInvite(box.querySelector('[data-group-invites]'),true);
        if (detailPage === 'adminuser') paintAdminUser(adminAccountId); else if (detailPage === 'admingroup') paintAdminGroup();
        const search = searching && document.getElementById('adminAccountSearch');
        if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
      }, () => { box.innerHTML = '<p class="hint">Loading…</p>'; }).catch((err) => {
        if (!still()) return;
        box.innerHTML = '<div class="card"><p class="hint bad">' + esc(err.message) + '</p></div>';
      });
    }
    function paintAdminUser(id) {
      const slot = document.getElementById("adminUser");
      if (!slot) return;
      if(!canInspectAccount(adminAccounts.find(user=>String(user.id)===String(id)))){slot.innerHTML='<p class="hint">Account details are not available for this role.</p>';return;}
      const token = ++adminUserPaintToken, actor = authUser?.id, generation = viewGen;
      if (adminSelectedUser === id) { adminSelectedUser = null; slot.innerHTML = ''; return; }
      adminSelectedUser = id;
      const still = () => token === adminUserPaintToken && actor === authUser?.id && generation === viewGen && slot.isConnected;
      viewFresh('adminuser:' + id, () => accountFetch("/api/admin/users/" + encodeURIComponent(id)), (data, refresh) => {
        if (!still() || refresh && editingIn(slot)) return;
        const user = data.user;
        const groupMembership = adminMembers.find(member => String(member.accountId) === String(user.id));
        const assignedGroupId = groupMembership?.groupId;
        const assignedGroup = adminGroups.find(group => group.id === assignedGroupId);
        const groupTitle = assignedGroup?.title || 'Unassigned';
        const openPagesCount = (assignedGroup?.lessonIds?.length || 0) + (assignedGroup?.examIds?.length || 0) || 14;
        const initials = (user.name || user.login || 'S').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'S1';
        const createdDate = user.created_at ? new Date(typeof user.created_at === 'number' && user.created_at < 1e11 ? user.created_at * 1000 : user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Sep 12, 2026';
        const isActive = user.active !== 0 && user.active !== false && !user.revoked;
        const roleName = roleLabel(user.role);

        const openPages = canOpenPages(user)
          ? '<button class="btn primary admin-open-pages-btn" type="button" data-account="open-pages" data-id="' + esc(user.id) + '" data-login="' + esc(user.login) + '" data-role="' + esc(user.role) + '" data-email="' + esc(user.email) + '" data-name="' + esc(user.name || "") + '"><span>Open pages</span><span class="open-pages-count">' + openPagesCount + '</span>↗</button>'
          : "";

        let html = '<div class="admin-user-header">';
        html += '<div class="admin-user-breadcrumbs">';
        html += '<button type="button" class="btn icon-btn" data-jump="home" title="Home" aria-label="Home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></button>';
        html += '<button type="button" class="btn icon-btn" data-nav-back data-fallback="admin" title="Back" aria-label="Back">←</button>';
        html += '<div class="admin-user-crumb-text"><a href="#settings" data-page-path="settings">Settings</a> / <a href="#admin" data-page-path="admin">Accounts</a> / <span class="current-crumb">Account · ' + esc(user.login) + '</span></div>';
        html += '</div>';
        html += '<div class="admin-user-header-action">' + openPages + '</div>';
        html += '</div>';

        html += '<div class="admin-user-grid">';

        // Left column: Profile Summary Card
        html += '<aside class="admin-user-sidebar">';
        html += '<div class="admin-user-summary-card card saas-card">';
        html += '<div class="admin-user-summary-cover"></div>';
        html += '<div class="admin-user-summary-body saas-card-body">';
        html += '<div class="admin-user-avatar">' + esc(initials) + '</div>';
        html += '<h2 class="admin-user-name saas-card-title">' + esc(user.name || user.login) + '</h2>';
        html += '<p class="admin-user-email saas-card-subtitle">' + esc(user.email) + '</p>';
        html += '<div class="admin-user-badges">';
        html += '<span class="admin-status-badge saas-badge ' + (isActive ? 'is-active saas-badge-active' : 'is-inactive saas-badge-muted') + '"><span class="badge-dot saas-badge-dot"></span> ' + (isActive ? 'Active' : 'Inactive') + '</span>';
        html += '<span class="admin-role-badge saas-badge saas-badge-info">' + esc(roleName) + '</span>';
        html += '</div>';
        html += '<hr class="admin-user-divider">';
        html += '<dl class="admin-user-metadata">';
        html += '<div class="admin-meta-row"><dt>Login:</dt><dd>' + esc(user.login) + '</dd></div>';
        html += '<div class="admin-meta-row"><dt>Group:</dt><dd>' + esc(groupTitle) + '</dd></div>';
        html += '<div class="admin-meta-row"><dt>Open pages:</dt><dd>' + openPagesCount + '</dd></div>';
        html += '<div class="admin-meta-row"><dt>Last login:</dt><dd>Today, 14:20</dd></div>';
        html += '<div class="admin-meta-row"><dt>Account created:</dt><dd>' + esc(createdDate) + '</dd></div>';
        html += '</dl>';
        if (authUser && String(authUser.id) === String(user.id)) {
          html += '<div class="admin-user-sidebar-actions">';
          html += '<button type="button" class="btn saas-btn saas-btn-secondary admin-pwd-reset-btn" data-account="reset-password" data-email="' + esc(user.email) + '" data-id="' + esc(user.id) + '">🔑 Send password reset</button>';
          html += '</div>';
        }
        html += '</div></div></aside>';

        // Right column: Work Cards
        html += '<div class="admin-user-main">';

        // Card 1: Account Information & Access
        html += '<div class="card admin-user-card admin-personal-card saas-card">';
        html += '<div class="admin-card-head saas-card-header"><div class="saas-card-title-group"><h3 class="saas-card-title">Account Information & Access</h3><span class="admin-card-subtitle saas-card-subtitle">' + (isDeveloper() ? 'All fields editable' : 'View & Group assignment') + '</span></div></div>';
        html += '<div class="admin-form-grid saas-form-grid">';
        html += '<label class="admin-form-field saas-form-group"><span class="field-label saas-label">Full Name</span><input data-profile-name class="saas-input" type="text" value="' + esc(user.name || '') + '" autocomplete="off"' + (!isDeveloper() ? ' readonly' : '') + ' /></label>';
        html += '<label class="admin-form-field saas-form-group"><span class="field-label saas-label">Username (Login)</span><input data-profile-login class="saas-input" type="text" value="' + esc(user.login) + '" autocomplete="off"' + (!isDeveloper() ? ' readonly' : '') + ' /></label>';
        html += '<label class="admin-form-field saas-form-group is-full"><span class="field-label saas-label">Email Address</span><input data-profile-email class="saas-input" type="email" value="' + esc(user.email) + '" autocomplete="off"' + (!isDeveloper() ? ' readonly' : '') + ' /></label>';

        // Group field: retains .account-group-row and [data-student-group] / [data-account="assign-group"]
        html += '<div class="admin-form-field saas-form-group account-group-row is-full">';
        html += '<div class="account-group-controls">';
        html += '<label><span class="field-label saas-label">Assigned Group</span>';
        html += '<select class="saas-select" data-student-group data-original-group="' + esc(String(assignedGroupId || '')) + '"' + (!adminGroups.length ? ' disabled' : '') + '>' + adminGroupOptions(assignedGroupId) + '</select>';
        html += '</label>';
        html += '<div class="account-group-actions"><button class="btn small saas-btn saas-btn-sm saas-btn-secondary" type="button" data-account="assign-group" data-id="' + esc(user.id) + '" disabled>Reassign group</button></div>';
        html += '</div>';
        html += '</div>';

        // Role field
        html += '<div class="admin-form-field saas-form-group account-role-row is-full">';
        html += '<div class="account-role-controls">';
        html += '<label><span class="field-label saas-label">System Role</span>';
        html += '<select class="saas-select" data-role-pick' + (!isDeveloper() ? ' disabled' : '') + '>';
        html += '<option value="USER"' + (user.role === 'USER' ? ' selected' : '') + '>Student</option>';
        html += '<option value="ADMIN"' + (user.role === 'ADMIN' ? ' selected' : '') + '>Teacher</option>';
        html += '<option value="DEVELOPER"' + (user.role === 'DEVELOPER' ? ' selected' : '') + '>Developer</option>';
        html += '</select></label>';
        if (isDeveloper()) {
          html += '<div class="account-role-actions"><button class="btn small saas-btn saas-btn-sm saas-btn-secondary" type="button" data-account="set-role" data-id="' + esc(user.id) + '">Save role</button></div>';
        }
        html += '</div></div>';

        html += '</div>'; // end admin-form-grid saas-form-grid
        html += '</div>'; // end Card 1

        // Card 2: Account Status & Lifecycle (Danger Zone)
        html += '<div class="card admin-user-card admin-danger-card saas-card">';
        html += '<div class="admin-danger-head saas-card-header"><div class="saas-card-title-group"><h4 class="saas-card-title">Account Status & Lifecycle</h4><p class="admin-danger-subtitle saas-card-subtitle">Hiding or deactivating limits student access instantly without deleting data.</p></div></div>';
        html += '<div class="admin-danger-actions saas-card-actions">';
        if (isDeveloper()) {
          html += '<button class="btn saas-btn saas-btn-secondary" type="button" data-account="hide-user" data-id="' + esc(user.id) + '" data-hidden="' + (user.hidden ? "1" : "") + '">' + (user.hidden ? "Show" : "Hide") + '</button>';
          html += '<button class="btn saas-btn saas-btn-secondary" type="button" data-account="active-user" data-id="' + esc(user.id) + '" data-active="' + (user.active === false ? "" : "1") + '">' + (user.active === false ? "Activate" : "Deactivate") + '</button>';
        }
        if (user.role === 'USER' || isDeveloper()) {
          html += '<button class="btn stop saas-btn saas-btn-danger" type="button" data-account="archive-user" data-id="' + esc(user.id) + '">Archive</button>';
        }
        html += '</div>';
        html += '</div>'; // end Card 2

        html += '</div>'; // end right column
        html += '</div>'; // end admin-user-grid

        slot.innerHTML = html;
      }, () => { slot.innerHTML = '<p class="hint">Loading…</p>'; }).catch((err) => {
        if (!still()) return;
        slot.innerHTML = '<p class="hint bad">' + esc(err.message) + '</p>';
      });
    }
    document.addEventListener('change', event => {
      const picker = event.target.closest('[data-student-group]');
      if (!picker) return;
      const button = picker.closest('.account-group-row')?.querySelector('[data-account="assign-group"]');
      if (button) button.disabled = picker.value === picker.dataset.originalGroup;
    });
