    let groupDirectory = null, groupDirectoryJob = null;
    function groupDirectoryKey() { return authUser?.id+':'+viewGen; }
    function groupDirectoryReady() { return isTeacher()&&!viewAccount&&groupDirectory?.key===groupDirectoryKey()&&groupDirectory.ready&&Date.now()-groupDirectory.at<30000; }
    function loadGroupDirectory() {
      if(!isTeacher()||viewAccount)return Promise.resolve(null);
      const key=groupDirectoryKey();
      if(groupDirectoryReady())return Promise.resolve(groupDirectory);
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
      return groupDirectory.users.filter(user=>accounts.has(user.id)&&(teachers?['ADMIN','DEVELOPER'].includes(user.role):user.role==='USER')).sort((a,b)=>(a.name||a.login).localeCompare(b.name||b.login));
    }
    function groupPeopleHTML(users) {
      return users.length?users.map(user=>{
        const inspect=user.role==='USER'&&canInspectAccount(user),tag=inspect?'button':'div';
        return '<'+tag+' class="group-person"'+(inspect?' type="button" data-account="user" data-id="'+esc(user.id)+'"':'')+'><b>'+esc(user.name||user.login)+'</b><span class="label">'+esc(roleLabel(user.role))+'</span></'+tag+'>';
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
      const invite=document.getElementById('groupDetailInvite'),inviteKey=groupDirectoryKey()+':'+group.id;
      if(invite.dataset.key!==inviteKey){invite.replaceChildren();delete invite.dataset.key;}
      if(groupDirectoryReady()&&!groupDirectory.error&&invite.dataset.key!==inviteKey){
        const candidates=groupDirectoryPeople([group],true).filter(user=>user.active!==false&&user.active!==0);
        invite.innerHTML=groupInviteHTML(group.id,candidates,classGroups,sessionIsDeveloper()||candidates.some(user=>user.id===authUser?.id));
        invite.dataset.key=inviteKey;
      }
      for(const [id,teachers] of [['groupDetailTeachers',true],['groupDetailStudents',false]])document.getElementById(id).innerHTML=groupDirectoryReady()&&!groupDirectory.error?groupPeopleHTML(groupDirectoryPeople([group],teachers)):'<p class="hint">'+(groupDirectory?.error?'Directory unavailable.':'Loading…')+'</p>';
      if(groupDirectoryReady()&&!groupDirectory.error){
        document.querySelector('#groupDetailTeachers').previousElementSibling.textContent=accountCount('Teachers',groupDirectoryPeople([group],true).length);
        document.querySelector('#groupDetailStudents').previousElementSibling.textContent=accountCount('Students',groupDirectoryPeople([group],false).length);
      }
      const lessons=(lmLibrary?.materials||[]).filter(row=>group.lessonIds.includes(row.id)&&lmLessonVisibleToViewer(row));
      const metrics=groupExamMetrics(group);
      document.getElementById('groupDetailLessonCount').textContent='Lessons · '+lessons.length;
      document.getElementById('groupDetailExamCount').textContent='Exams · '+metrics[0][1];
      document.getElementById('groupDetailExamSummary').innerHTML=metrics.map(([label,count])=>'<span'+(label==='assigned works'&&count>0?' class="has-assigned-works"':'')+'>'+label+(count?' · <b>'+count+'</b>':'')+'</span>').join('');
      paintPagePath('groupdetail');
    }
    function prepareGroupDetail() {
      if(!isTeacher()||viewAccount)return;
      const key=groupDirectoryKey(),id=classGroupId;
      paintGroupDetail();
      Promise.all([loadGroupDirectory(),!lmServerReady&&typeof stageQueueLessons==='function'?stageQueueLessons():Promise.resolve(),!examReady?examPull():Promise.resolve(),!classGroupsReady?groupPull():Promise.resolve()]).then(()=>{
        if(key===groupDirectoryKey()&&id===classGroupId&&document.querySelector('section.on')?.id==='groupdetail')paintGroupDetail();
      }).catch(error=>{if(key===groupDirectoryKey())window.LearningMain?.notice?.(error.message,true);});
    }
    document.addEventListener('click',event=>{
      if(!isTeacher()||viewAccount)return;
      const group=classGroups.find(row=>row.id===classGroupId);
      if(event.target.closest('[data-group-directory-retry]')){groupDirectory=null;if(document.querySelector('section.on')?.id==='groupdetail')prepareGroupDetail();else paintGroups();return;}
      if(!group)return;
      if(event.target.closest('[data-detail-lessons]'))visit('days');
      const exam=event.target.closest('[data-detail-exam]');
      if(exam||event.target.closest('[data-detail-exams]')){
        examViewGroup=group.id;examViewLevel=accountGroupLevel(group);examSection='active';
        if(exam){examCurrentId=domEntityId(exam.dataset.detailExam);visit('examblocks');}else visit('exams');
      }
      if(event.target.closest('[data-account-teacher-toggle],[data-account-group]'))groupDirectory=null;
    });
