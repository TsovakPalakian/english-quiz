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
    const adminTeachers=groupId=>adminAccounts.filter(user=>['ADMIN','DEVELOPER'].includes(user.role)&&adminTeacherAssignments.some(row=>row.groupId===groupId&&row.teacherIds.includes(user.id)));
    document.addEventListener('click',event=>{if(event.target.closest('[data-jump="admin"]')&&isTeacher()&&!viewAccount){adminBucket='';adminTab='accounts';adminSearch='';}},true);
    let adminSearch = '', adminSelectedUser = null;
    let adminAccountId = null;
    const adminLevels = ['A1','A2','A2+','B1','B1+','B2','B2+','C1','C2'];
    let adminGroupLevel = 'A1';
    function accountGroupLevel(group) {
      return adminLevels.find(level => group.title === level || group.title.startsWith(level + ' ') || group.title.endsWith(' ' + level)) || 'unassigned';
    }
    function accountGroupMetrics(groups,extra={}) {
      const ids=new Set(groups.map(group=>group.id)),students=new Set(adminAccounts.filter(user=>user.role==='USER').map(user=>user.id));
      return {groups:ids.size,teachers:new Set([...groups.flatMap(group=>adminTeachers(group.id).map(user=>user.id)),...(extra.teachers||[]).map(user=>user.id)]).size,students:new Set([...adminMembers.filter(member=>ids.has(member.groupId)&&students.has(member.accountId)).map(member=>member.accountId),...(extra.students||[]).map(user=>user.id)]).size,lessons:new Set(groups.flatMap(group=>group.lessonIds||[])).size,exams:new Set(groups.flatMap(group=>group.examIds||[])).size};
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
      else if(adminBucket==='unassigned')list.innerHTML=adminAccountRows(accounts.filter(user=>user.role==='USER'&&!adminMembers.some(m=>m.accountId===user.id)))+adminGroups.filter(group=>accountGroupLevel(group)==='unassigned'&&(!query||group.title.toLocaleLowerCase().includes(query))).map(group=>'<button class="path" type="button" data-admin-group="'+group.id+'"><span><b>'+esc(group.title)+'</b>'+accountMetricsHTML([group])+'</span></button>').join('');
      else if(query)list.innerHTML=adminAccountRows(accounts)||'<p class="hint">No matching accounts.</p>';
      else{
        const staff=adminAccounts.filter(user=>user.role!=='USER'),unassigned=adminAccounts.filter(user=>user.role==='USER'&&!adminMembers.some(m=>m.accountId===user.id));
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
      return '<div class="accounts-invite-panel invite-form" data-group-invites data-group-id="'+(selected?.id||'')+'"><h2>Invite</h2><div><span id="inviteGroupLabel">Group</span><details class="invite-group-picker" data-invite-group-picker><summary aria-labelledby="inviteGroupLabel inviteGroupValue" aria-controls="inviteGroupOptions" aria-expanded="false"><span id="inviteGroupValue" data-invite-selected-group>'+esc(selected?.title||'Choose group')+'</span></summary><div class="invite-group-menu"><input type="search" data-invite-group-search aria-label="Search groups" aria-controls="inviteGroupOptions" placeholder="Search groups" autocomplete="off"><div class="invite-group-options" id="inviteGroupOptions" role="listbox" aria-label="Groups">'+groups.map(group=>'<button type="button" role="option" data-invite-group-option="'+group.id+'" aria-selected="'+(group.id===selected?.id)+'">'+esc(group.title)+'</button>').join('')+'</div><p class="hint" role="status" data-invite-group-empty'+(groups.length?' hidden':'')+'>'+(groups.length?'No matching groups.':'No groups available.')+'</p></div></details></div><label><span>Invite</span><select data-invite-kind><option value="student">Student</option><option value="teacher">Teacher</option></select></label><label data-invite-student><span>Teacher</span><select data-invite-teacher disabled></select></label><p class="hint" data-invite-unassigned>Choose a group first.</p><label hidden data-invite-staff><span>Invited teacher email (optional)</span><input type="email" maxlength="120" data-invite-email autocomplete="off" placeholder="Optional email"></label><p class="hint">Single use · expires in 72 hours</p><div class="row"><button class="btn primary" type="button" data-invite-create disabled>Create invite</button></div><input type="text" readonly hidden data-invite-url aria-label="Copy invite link" title="Copy invite link"><button type="button" class="invite-qr" data-invite-qr hidden aria-label="Copy QR image" title="Copy QR image"></button><p class="hint" role="status" data-invite-status></p></div>';
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
        if(candidates.some(user=>user.id===preferred))select.value=preferred;
        else if(candidates.some(user=>user.id===authUser?.id))select.value=authUser.id;
      }
      const teacher=box.querySelector('[data-invite-kind]').value==='teacher';
      box.querySelectorAll('[data-invite-staff]').forEach(node=>node.hidden=!teacher);
      box.querySelector('[data-invite-student]').hidden=teacher;
      select.disabled=!candidates.length;
      const permitted=sessionIsDeveloper()||candidates.some(user=>user.id===authUser?.id);
      const note=box.querySelector('[data-invite-unassigned]');
      note.hidden=!!group&&(teacher||candidates.length>0&&permitted);
      note.textContent=!group?'Choose a group first.':!candidates.length?'Assign an active teacher to this group first.':'You must be assigned to this group to invite a student.';
      box.querySelector('[data-invite-email]').required=false;
      box.querySelector('[data-invite-create]').disabled=box.getAttribute('aria-busy')==='true'||!group||!teacher&&(!candidates.length||!permitted||!candidates.some(user=>user.id===select.value));
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
    function paintAdminGroup() {
      if (!isTeacher() || viewAccount) return;
      const selected = adminGroups.find(group => group.id === adminGroupId);
      if (!selected) { if (document.querySelector('section.on')?.id === 'admingroup') goBack('admin'); return; }
      document.getElementById('adminGroupTitle').textContent = selected.title;
      const detail = document.getElementById('adminGroupDetail');
      const folds=Object.fromEntries(['students','lessons','exams','teachers','teachers-list'].map(name=>[name,detail.dataset.groupId===String(selected.id)&&!!detail.querySelector('[data-group-'+name+']')?.open]));
      const students = adminAccounts.filter(user => user.role === 'USER' && adminMembers.some(m => m.accountId === user.id && m.groupId === selected.id));
      const exams = examLoad().filter(exam=>!exam.instanceStatus), lessons = lmLibrary?.materials || [];
      const examRows = exams.map(exam => {
        const assigned = (selected.examIds || []).includes(exam.id), owner = adminGroups.find(group => (group.examIds || []).includes(exam.id));
        const label = assigned ? 'Unassign' : 'Assign';
        const icon = '<svg class="lucide lucide-circle-' + (assigned ? 'minus' : 'plus') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>' + (assigned ? '' : '<path d="M12 8v8"/>') + '</svg>';
        return '<div class="day-row accounts-exam-row" data-group-exam="' + exam.id + '"><button class="path" type="button" data-exam-open="' + exam.id + '"><span><b>' + esc(exam.title) + '</b><br><span class="label">' + esc(owner?.title || 'Unassigned') + (assigned ? ' · Assigned' : '') + '</span></span></button><div class="day-tools"><button class="day-hide" type="button" data-account-group="' + (assigned ? 'unassign-exam' : 'exam') + '" data-exam-id="' + exam.id + '" aria-label="' + label + '" title="' + label + '">' + icon + '</button></div></div>';
      }).join('');
      detail.innerHTML = '<h2>' + esc(selected.title) + '</h2><div class="row"><input id="accountGroupTitle" aria-label="Group name" maxlength="120" value="' + esc(selected.title) + '"><button class="btn" type="button" data-account-group="rename">Rename group</button><button class="btn stop" type="button" data-account-group="archive">Archive group</button></div><details class="accounts-fold" data-group-students><summary>'+esc(accountCount('Students',students.length))+'</summary>' + adminAccountRows(students) + '</details><details class="accounts-fold" data-group-lessons><summary>'+esc(accountCount('Lessons',selected.lessonIds.length))+'</summary>' + selected.lessonIds.map(id => '<button class="path" type="button" data-lm-open="' + id + '">' + esc(lessons.find(l => l.id === id)?.title || 'Lesson') + '</button>').join('') + '</details><details class="accounts-fold" data-group-exams><summary>'+esc(accountCount('Exams',exams.length))+'</summary>' + (examRows || '<p class="hint">No exams yet.</p>') + '</details>';
      const teachers=adminTeachers(selected.id),assignment=adminTeacherAssignments.find(row=>row.groupId===selected.id),candidates=adminAccounts.filter(user=>['ADMIN','DEVELOPER'].includes(user.role)&&user.active!==false&&user.active!==0);
      detail.querySelector('[data-group-students]').insertAdjacentHTML('beforebegin','<details class="accounts-fold" data-group-teachers-list><summary>'+esc(accountCount('Teachers',teachers.length))+'</summary>'+adminAccountRows(teachers,false)+'<details class="accounts-fold" data-group-teachers data-group-id="'+selected.id+'" data-revision="'+(assignment?.revision||0)+'"><summary>Assign teachers</summary>'+candidates.map(user=>{const assigned=assignment?.teacherIds.includes(user.id),label=assigned?'Unassign':'Assign';return '<div class="day-row accounts-teacher-row"><div class="path account-static-row"><span><b>'+esc(user.name||user.login)+'</b><br><span class="label">'+esc(user.email||user.login)+' · '+roleLabel(user.role)+accountMark(user)+'</span></span></div><div class="day-tools"><button class="day-hide" type="button" data-account-teacher-toggle="'+esc(user.id)+'" aria-pressed="'+!!assigned+'" aria-label="'+label+'" title="'+label+'"></button></div></div>';}).join('')+'<p class="hint" role="status" data-account-teachers-status></p></details></details>');
      detail.querySelectorAll('[data-account-teacher-toggle]').forEach(button=>{const glyph=window.lucide?.icons[button.getAttribute('aria-pressed')==='true'?'CircleMinus':'CirclePlus'];if(glyph)button.append(window.lucide.createElement(glyph));});
      detail.dataset.groupId = String(selected.id);
      for(const [name,open] of Object.entries(folds))detail.querySelector('[data-group-'+name+']').open=open;
      paintPagePath('admingroup');
    }
    document.addEventListener('click',async event=>{
      const button=event.target.closest('#adminGroupDetail [data-account-teacher-toggle]');if(!button||button.disabled||!isTeacher()||viewAccount)return;
      const form=button.closest('[data-group-teachers]'),status=form.querySelector('[data-account-teachers-status]'),actor=authUser?.id,generation=viewGen,groupId=Number(form.dataset.groupId),teacherId=button.dataset.accountTeacherToggle;
      const current=adminTeacherAssignments.find(row=>row.groupId===groupId),ids=new Set(current?.teacherIds||[]);if(ids.has(teacherId))ids.delete(teacherId);else ids.add(teacherId);
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
        const accountIds = new Set(accounts.map((row) => row.id));
        const history = (regs.registrations || []).filter((row) => accountVisible(row) && (!row.user_id || accountIds.has(row.user_id)));
        const changeRows = (changes.changes || []).filter((row) => row.status === 'pending' && accountVisible(row) && accountIds.has(row.user_id));
        paintAccountsCount(waiting.length+changeRows.length);
        const changesHtml = '<div class="card"><p class="label">Account change requests</p>' +
          (changeRows.length ? recentRows(changeRows, (row, n) => {
            if (row.status !== "pending") {
              return '<div style="margin:8px 0"><b>' + n + ". " + esc(row.from_login) + '</b> · ' + statusLabel(row.status) +
                changeHtml(row) +
                '<p class="hint">' + esc(when(row.decided_at || row.created_at)) + '</p></div>';
            }
            const own = authUser && row.user_id === authUser.id;
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
            '<div class="account-approval-row" data-list-row><div><b>' + esc(row.login) + '</b><br><span class="hint">' + esc(row.email) + (row.name ? " · " + esc(row.name) : "") + ' · ' + roleLabel(row.role) + '</span></div>' +
            '<div>'+(sessionIsDeveloper()&&!row.inviteGroupId?'<select aria-label="Approved role" data-registration-role="'+esc(row.id)+'"><option value="USER"'+(row.role!=='ADMIN'?' selected':'')+'>Student</option><option value="ADMIN"'+(row.role==='ADMIN'?' selected':'')+'>Teacher</option></select>':'')+(row.role==='ADMIN'?'<span class="hint">Teachers and staff</span>':'<select aria-label="Student group" data-registration-group="' + esc(row.id) + '"'+(row.inviteGroupId?' disabled':'')+'>' + adminGroupOptions(row.inviteGroupId||null) + '</select>')+'</div><button class="btn primary" type="button" data-account="approve" data-id="' + esc(row.id) + '"'+(row.inviteCanApprove===false||row.role==='ADMIN'&&!sessionIsDeveloper()&&row.inviteCanApprove!==true?' disabled title="Only the inviting teacher or a developer can approve"':'')+'>Approve</button>' +
            '<button class="btn" type="button" data-account="reject" data-id="' + esc(row.id) + '">Reject</button></div>'
          ).join("") : '<p class="hint">No one is waiting.</p>') +
          '</div>';
        const historyHtml = '<div class="card"><p class="label">Registration history</p>' +
          (history.length ? recentRows(history, (row, n) =>
            '<p data-list-row><b>' + n + ". " + esc(row.login) + '</b> · ' + esc(row.email) + '<br><span class="hint">' + statusLabel(row.status) + ' · ' + esc(when(row.created_at)) + '</span></p>'
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
      if(!canInspectAccount(adminAccounts.find(user=>user.id===id))){slot.innerHTML='<p class="hint">Account details are not available for this role.</p>';return;}
      const token = ++adminUserPaintToken, actor = authUser?.id, generation = viewGen;
      if (adminSelectedUser === id) { adminSelectedUser = null; slot.innerHTML = ''; return; }
      adminSelectedUser = id;
      const still = () => token === adminUserPaintToken && actor === authUser?.id && generation === viewGen && slot.isConnected;
      viewFresh('adminuser:' + id, () => accountFetch("/api/admin/users/" + encodeURIComponent(id)), (data, refresh) => {
        if (!still() || refresh && editingIn(slot)) return;
        const user = data.user;
        const openPages = canOpenPages(user)
          ? '<button class="btn primary" type="button" data-account="open-pages" data-id="' + esc(user.id) + '" data-login="' + esc(user.login) + '" data-role="' + esc(user.role) + '" data-email="' + esc(user.email) + '" data-name="' + esc(user.name || "") + '">Open pages</button>'
          : "";
        slot.innerHTML = '<div class="card"><p class="stat-kicker">' + esc(user.login) + '</p>' +
          '<p class="hint">' + roleLabel(user.role) + accountMark(user) + '</p>' +
          (user.role === 'USER' ? '<div class="account-group-row"><label><span>Group</span><select data-student-group data-original-group="' + esc(String(adminMembers.find(member => member.accountId === user.id)?.groupId || '')) + '">' + adminGroupOptions(adminMembers.find(member => member.accountId === user.id)?.groupId) + '</select></label><button class="btn" type="button" data-account="assign-group" data-id="' + esc(user.id) + '" disabled>Reassign group</button></div>' : '') +
          (isDeveloper() && (user.role === "USER" || user.role === "ADMIN") ?
            '<p class="label">Login</p><input data-profile-login type="text" value="' + esc(user.login) + '" autocomplete="off" />' +
            '<p class="label">Email</p><input data-profile-email type="email" value="' + esc(user.email) + '" autocomplete="off" />' +
            '<p class="label">Name</p><input data-profile-name type="text" value="' + esc(user.name || "") + '" autocomplete="off" />' +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="save-profile" data-id="' + esc(user.id) + '">Save details</button>' +
            openPages + '</div>' +
            '<p class="label">Role</p><select data-role-pick>' +
            '<option value="USER"' + (user.role === "USER" ? " selected" : "") + '>Student</option>' +
            '<option value="ADMIN"' + (user.role === "ADMIN" ? " selected" : "") + '>Teacher</option>' +
            '<option value="DEVELOPER"' + (user.role === "DEVELOPER" ? " selected" : "") + '>Developer</option></select>' +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="set-role" data-id="' + esc(user.id) + '">Save role</button>' +
            '<button class="btn" type="button" data-account="hide-user" data-id="' + esc(user.id) + '" data-hidden="' + (user.hidden ? "1" : "") + '">' + (user.hidden ? "Show account" : "Hide account") + '</button>' +
            '<button class="btn" type="button" data-account="active-user" data-id="' + esc(user.id) + '" data-active="' + (user.active === false ? "" : "1") + '">' + (user.active === false ? "Activate" : "Deactivate") + '</button>' +
            '<button class="btn stop" type="button" data-account="archive-user" data-id="' + esc(user.id) + '">Archive account</button></div>'
            : '<p>' + esc(user.email) + (user.name ? " · " + esc(user.name) : "") + '</p>' +
              '<div class="row" style="margin-top:8px">'+openPages+(user.role==='USER'?'<button class="btn stop" type="button" data-account="archive-user" data-id="'+esc(user.id)+'">Archive account</button>':'')+'</div>' +
              (isDeveloper() ? '<p class="label">Role</p><select data-role-pick>' +
                '<option value="USER"' + (user.role === "USER" ? " selected" : "") + '>Student</option>' +
                '<option value="ADMIN"' + (user.role === "ADMIN" ? " selected" : "") + '>Teacher</option>' +
                '<option value="DEVELOPER"' + (user.role === "DEVELOPER" ? " selected" : "") + '>Developer</option></select>' +
                '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="set-role" data-id="' + esc(user.id) + '">Save role</button>' +
                '<button class="btn" type="button" data-account="hide-user" data-id="' + esc(user.id) + '" data-hidden="' + (user.hidden ? "1" : "") + '">' + (user.hidden ? "Show account" : "Hide account") + '</button>' +
                '<button class="btn" type="button" data-account="active-user" data-id="' + esc(user.id) + '" data-active="' + (user.active === false ? "" : "1") + '">' + (user.active === false ? "Activate" : "Deactivate") + '</button></div>' : "")) +
          '<p class="hint">Passwords are not shown and cannot be changed here.</p></div>';
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
