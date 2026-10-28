    let groupDirectory = null, groupDirectoryJob = null;
    function groupDirectoryKey() { return authUser?.id+':'+viewGen; }
    function groupDirectoryReady() { return isTeacher()&&!viewAccount&&groupDirectory?.key===groupDirectoryKey()&&groupDirectory.ready&&Date.now()-groupDirectory.at<30000; }
    function loadGroupDirectory(force=false) {
      if(!isTeacher()||viewAccount)return Promise.resolve(null);
      const key=groupDirectoryKey();
      if(!force&&groupDirectoryReady())return Promise.resolve(groupDirectory);
      if(groupDirectoryJob?.key===key)return groupDirectoryJob.promise;
      const state={key,at:Date.now(),ready:false,users:[],members:[],assignments:[],error:''};
      groupDirectory=state;
      const job={key};groupDirectoryJob=job;
      job.promise=Promise.all([accountFetch('/api/admin/users'),accountFetch('/api/groups/members'),accountFetch('/api/accounts/group-teachers')]).then(([users,members,teachers])=>{
        if(key!==groupDirectoryKey()||groupDirectory!==state||!isTeacher()||viewAccount)return null;
        Object.assign(state,{ready:true,users:(users.users||[]).filter(accountVisible),members:members.members||[],assignments:teachers.assignments||[]});
        return state;
      }).catch(error=>{if(groupDirectory===state){state.ready=true;state.error=error.message;}return null;}).finally(()=>{if(groupDirectoryJob===job)groupDirectoryJob=null;});
      return job.promise;
    }
    function groupDirectoryPeople(groups,teachers=true) {
      if(!groupDirectoryReady()||groupDirectory.error)return [];
      const ids=new Set(groups.map(group=>String(group.id)));
      const accounts=new Set(teachers?groupDirectory.assignments.filter(row=>ids.has(String(row.groupId))).flatMap(row=>row.teacherIds||[]):groupDirectory.members.filter(row=>ids.has(String(row.groupId))).map(row=>row.accountId));
      return groupDirectory.users.filter(user=>accounts.has(user.id)&&(teachers?['ADMIN','DEVELOPER'].includes(user.role):user.role==='USER')).sort((a,b)=>(a.name||a.login||'').localeCompare(b.name||b.login||'')||(a.login||'').localeCompare(b.login||''));
    }
    function groupLiveStudentCount(group){
      if(!authUser||viewAccount||!isTeacher())return undefined;
      if(!groupDirectoryReady()||groupDirectory.error)return undefined;
      const members=new Set(groupDirectory.members.filter(row=>String(row.groupId)===String(group.id)).map(row=>row.accountId));
      return new Set(groupDirectory.users.filter(user=>members.has(user.id)&&user.role==='USER'&&user.active!==false&&user.active!==0&&!user.hidden&&!user.revoked).map(user=>user.id)).size;
    }
    function refreshGroupStudentCounts(){
      if(!isTeacher()||viewAccount)return;
      const key=groupDirectoryKey();
      const pending=loadGroupDirectory(true);
      const current=document.querySelector('section.on')?.id;
      if(current==='days')paintLmDays();
      if(current==='exams')examPaintList();
      return pending.then(()=>{
        if(key!==groupDirectoryKey())return;
        const page=document.querySelector('section.on')?.id;
        if(page==='days')paintLmDays();
        if(page==='exams')examPaintList();
      });
    }
    function groupPeopleHTML(users) {
      return users.length?users.map((user,index)=>{
        const inspect=user.role==='USER'&&canInspectAccount(user),tag=inspect?'button':'div';
        return '<'+tag+' class="group-person saas-card" data-people-search="'+esc([user.name,user.login,user.email].filter(Boolean).join(' ').toLocaleLowerCase())+'"'+(inspect?' type="button" data-account="user" data-id="'+esc(user.id)+'"':'')+'><span class="saas-badge saas-badge-muted" style="margin-right:8px;">'+(index+1)+'.</span><b>'+esc(user.name||'—')+'</b>'+(inspect?'<span class="saas-badge saas-badge-info" style="margin-left:auto;">Inspect ↗</span>':'')+'</'+tag+'>';
      }).join(''):'<p class="hint">None assigned.</p>';
    }
    function groupExamMetrics(group) {
      const rows=examShown().filter(row=>String(row.groupId)===String(group.id)||group.examIds?.includes(row.id));
      return [['exam',rows.filter(row=>!row.studentId).length],['assigned works',rows.filter(row=>row.instanceStatus==='active').length],['ready for review',rows.filter(row=>typeof examNeedsReview==='function'?examNeedsReview(row):row.instanceStatus==='ready').length],['completed',rows.filter(row=>row.instanceStatus==='completed').length]];
    }
    function paintGroupDetail() {
      if(!isTeacher()||viewAccount)return;
      const group=classGroups.find(row=>row.id===classGroupId);
      const status=document.getElementById('groupDetailStatus');
      status.textContent=groupDirectory?.key===groupDirectoryKey()?groupDirectory.error:'';
      document.getElementById('groupDetailRetry').hidden=!status.textContent;
      document.getElementById('groupDetailTitle').textContent=group?.title||'Group';
      if(!group){status.textContent=classGroupsReady?'Group unavailable.':'Loading group…';return;}
      for(const [id,teachers] of [['groupDetailTeachers',true],['groupDetailStudents',false]])document.getElementById(id).innerHTML=groupDirectoryReady()&&!groupDirectory.error?groupPeopleHTML(groupDirectoryPeople([group],teachers)):'<p class="hint">'+(groupDirectory?.error?'Directory unavailable.':'Loading…')+'</p>';
      if(groupDirectoryReady()&&!groupDirectory.error){
        document.getElementById('groupDetailTeacherCount').textContent=accountCount('Teachers',groupDirectoryPeople([group],true).length);
        document.getElementById('groupDetailStudentCount').textContent=accountCount('Students',groupDirectoryPeople([group],false).length);
      }
      const lessons=(lmLibrary?.materials||[]).filter(row=>group.lessonIds.includes(row.id)&&lmLessonVisibleToViewer(row));
      const metrics=groupExamMetrics(group);
      document.getElementById('groupDetailLessonCount').textContent='Lessons · '+lessons.length;
      document.getElementById('groupDetailExamCount').textContent='Exams · '+metrics[0][1];
      document.getElementById('groupDetailExamSummary').innerHTML=metrics.map(([label,count])=>'<span'+(label==='assigned works'&&count>0?' class="has-assigned-works"':'')+'>'+label+(count?' · <b>'+count+'</b>':'')+'</span>').join('');
      paintGroupDiagnostic(group.id);
      paintPagePath('groupdetail');
    }
    let currentDiagGroupId = null;
    async function paintGroupDiagnostic(groupId) {
      const panel = document.getElementById('groupDetailDiagnostic');
      if (!panel) return;
      if (!isTeacher() || viewAccount || !groupId) {
        panel.hidden = true;
        return;
      }
      currentDiagGroupId = groupId;
      panel.hidden = false;
      const badge = document.getElementById('groupDiagTotalErrors');
      const bars = document.getElementById('groupDiagBars');
      const legend = document.getElementById('groupDiagLegend');
      const advice = document.getElementById('groupDiagAdvice');
      if (!bars || !legend || !advice) return;

      try {
        const res = await fetch(accountApi() + '/api/error-bank?action=subgroup-diagnostic&groupId=' + encodeURIComponent(groupId), {
          credentials: 'include'
        }).then(r => r.ok ? r.json() : null).catch(() => null);

        if (currentDiagGroupId !== groupId) return;
        if (!res || !res.totalErrors) {
          if (badge) badge.textContent = '0 errors';
          bars.innerHTML = '<div class="group-diag-bar is-clean" style="width:100%"></div>';
          legend.innerHTML = '<span class="group-diag-pill is-clean">● All clear</span>';
          advice.innerHTML = '<p class="group-diag-clean-note"><strong>Great performance! 🎉</strong> No recent errors recorded for this subgroup.</p>';
          return;
        }

        if (badge) badge.textContent = res.totalErrors + (res.totalErrors === 1 ? ' error' : ' errors');

        const colors = {
          l1_transfer: { color: '#f59e0b', label: 'L1 Transfer (Russian calques & word order)' },
          overgeneralization: { color: '#8b5cf6', label: 'Overgeneralization (irregular forms)' },
          collocation_clash: { color: '#3b82f6', label: 'Collocations (do vs make)' },
          grammar: { color: '#06b6d4', label: 'General Grammar' },
          vocabulary: { color: '#10b981', label: 'Vocabulary Gaps' },
          typo: { color: '#64748b', label: 'Spelling & Typos' }
        };

        const pct = res.percentages || {};
        let barHtml = '';
        let legendHtml = '';

        for (const [key, cfg] of Object.entries(colors)) {
          const val = pct[key] || 0;
          if (val > 0) {
            barHtml += '<div class="group-diag-bar-segment" style="width:' + val + '%;background:' + cfg.color + '" title="' + esc(cfg.label) + ': ' + val + '%"></div>';
            legendHtml += '<span class="group-diag-pill" style="border-left-color:' + cfg.color + '"><b>' + val + '%</b> ' + esc(cfg.label) + '</span>';
          }
        }
        bars.innerHTML = barHtml;
        legend.innerHTML = legendHtml;

        let patternsHtml = '';
        if (res.topPatterns && res.topPatterns.length) {
          patternsHtml = '<div class="group-diag-top-patterns"><b>Frequent error patterns:</b><ul>' +
            res.topPatterns.map(p => '<li><code>' + esc(p.pattern) + '</code> (' + p.count + ' ' + (p.count === 1 ? 'student' : 'students') + ')</li>').join('') +
            '</ul></div>';
        }

        advice.innerHTML = '<div class="group-diag-advice-box"><div class="group-diag-advice-head"><span>💡 Recommended lesson focus</span></div>' +
          '<p class="group-diag-advice-text">' + esc(res.recommendation || '') + '</p>' +
          patternsHtml +
          '</div>';
      } catch (err) {
        panel.hidden = true;
      }
    }
    function paintGroupPeople() {
      paintGroupDetail();
      const page=document.querySelector('section.on'),group=classGroups.find(row=>row.id===classGroupId);
      document.querySelectorAll('[data-people-group-name]').forEach(node=>node.textContent=group?.title||'Group unavailable');
      const query=(document.getElementById('groupStudentSearch')?.value||'').trim().toLocaleLowerCase();
      document.querySelectorAll('#groupDetailStudents .group-person').forEach(row=>row.hidden=!row.dataset.peopleSearch.includes(query));
      if(page)paintPagePath(page.id);
    }
    document.getElementById('groupStudentSearch')?.addEventListener('input',paintGroupPeople);
    function prepareGroupDetail() {
      if(!isTeacher()||viewAccount)return;
      const key=groupDirectoryKey(),id=classGroupId;
      paintGroupDetail();
      Promise.all([loadGroupDirectory(),!lmServerReady&&typeof stageQueueLessons==='function'?stageQueueLessons():Promise.resolve(),!examReady?examPull():Promise.resolve(),!classGroupsReady?groupPull():Promise.resolve()]).then(()=>{
        if(key===groupDirectoryKey()&&id===classGroupId&&['groupdetail','groupteachers','groupstudents'].includes(document.querySelector('section.on')?.id))paintGroupPeople();
      }).catch(error=>{if(key===groupDirectoryKey())window.LearningMain?.notice?.(error.message,true);});
    }
    document.addEventListener('click',event=>{
      if(!isTeacher()||viewAccount)return;
      const group=classGroups.find(row=>row.id===classGroupId);
      if(event.target.closest('[data-group-directory-retry]')){groupDirectory=null;if(document.querySelector('section.on')?.id==='groupdetail')prepareGroupDetail();else paintGroups();return;}
      if(!group)return;
      const people=event.target.closest('[data-detail-people]');
      if(people){document.getElementById('groupStudentSearch').value='';visit(people.dataset.detailPeople==='teachers'?'groupteachers':'groupstudents');}
      if(event.target.closest('[data-detail-lessons]'))visit('days');
      const exam=event.target.closest('[data-detail-exam]');
      if(exam||event.target.closest('[data-detail-exams]')){
        examViewGroup=group.id;examViewLevel=accountGroupLevel(group);examSection='active';
        if(exam){void examOpenSelected(exam.dataset.detailExam);}else visit('exams');
      }
      if(event.target.closest('[data-account-teacher-toggle],[data-account-group]'))groupDirectory=null;
    });
