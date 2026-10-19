    const homeScreenLabels = {days:'Lessons',exams:'Exams',allwords:'Words',tenses:'Grammar',library:'Entertainment'};
    function homeRecentItems() {
      if (!authUser || viewAccount) return [];
      try {
        const rows = JSON.parse(sessionStorage.getItem('enquiz-home-recent:'+authUser.id)||'[]');
        return Array.isArray(rows) ? rows.filter(row=>row&&Object.hasOwn(homeScreenLabels,row.screen)&&Number.isFinite(row.at)&&row.at>0&&row.at<=Date.now()+60000).slice(0,4) : [];
      } catch { return []; }
    }
    function rememberHomeNavigation(id) {
      if (!authUser || viewAccount || !Object.hasOwn(homeScreenLabels,id)) return;
      try {
        const rows = [{screen:id,at:Date.now()},...homeRecentItems().filter(row=>row.screen!==id)].slice(0,4);
        sessionStorage.setItem('enquiz-home-recent:'+authUser.id,JSON.stringify(rows));
      } catch {}
    }
    function paintHomeDashboard({learned,total,pct}) {
      const text = (id,value) => { const node=document.getElementById(id);if(node)node.textContent=value; };
      text('shellProgressPercent',pct+'%');text('shellProgressCount',learned+' of '+total+' cards learned');
      const bar=document.getElementById('shellProgressBar');
      if(bar){bar.style.width=pct+'%';bar.parentElement.setAttribute('aria-valuenow',String(pct));}
      const progress=document.querySelector('.shell-progress');if(progress)progress.hidden=!(authUser?.role==='USER'&&!viewAccount);
      const dashboard=document.getElementById('homeDashboard');if(!dashboard)return;
      dashboard.hidden=!authUser;
      const groups=(authUser&&typeof classGroups!=='undefined'?classGroups:[]).filter(row=>Number.isSafeInteger(row.id));
      const group=groups.find(row=>row.id===classGroupId)||groups[0];
      text('homeGroupTitle',group?.title||'No group assigned');
      const lessons=group&&(typeof lmLibrary!=='undefined'?lmLibrary?.materials:[])?.filter(row=>group.lessonIds?.includes(row.id)&&lmLessonVisibleToViewer(row))||[];
      const metrics=document.getElementById('homeGroupMetrics');
      if(metrics)metrics.innerHTML=group?[['student',group.studentCount||0],['lesson',lessons.length],['exam',group.examIds?.length||0]].filter(([,count])=>count>0).map(([name,count])=>'<span>'+count+' '+name+(count===1?'':'s')+'</span>').join(''):'';
      const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
      const next=lessons.filter(row=>row.published&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&row.date>=date).sort((a,b)=>a.date.localeCompare(b.date))[0];
      text('homeNextLessonLabel',next?next.date.split('-').reverse().join('.'):'\u2014');
      text('homeNextLessonNote',next?.title||'No upcoming lessons');
      const recent=document.getElementById('homeRecentList'),rows=homeRecentItems();
      if(recent)recent.innerHTML=rows.length?rows.map(row=>'<button class="home-recent-row" type="button" data-jump="'+row.screen+'"><span class="home-recent-mark" aria-hidden="true">'+homeScreenLabels[row.screen].slice(0,2).toUpperCase()+'</span><span><b>'+homeScreenLabels[row.screen]+'</b><small>Opened on this device</small></span><time datetime="'+new Date(row.at).toISOString()+'">'+esc(new Date(row.at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))+'</time></button>').join(''):'<p class="hint">No recent activity on this device.</p>';
      const student=authUser?.role==='USER'&&!viewAccount;
      document.querySelectorAll('[data-home-continue],[data-home-groups],[data-home-group-open]').forEach(node=>{node.dataset.jump=student?'days':'groups';node.hidden=!authUser;});
      const open=document.querySelector('[data-home-group-open]');if(open)open.disabled=!group;
    }
    function installShellBranding() {
      document.querySelectorAll('[data-copyright-year]').forEach(node=>{node.textContent=String(new Date().getFullYear());});
      const input=document.getElementById('shellSearch');
      input?.addEventListener('input',()=>{
        const query=input.value.trim().toLocaleLowerCase();
        document.querySelectorAll('.side nav button').forEach(node=>node.classList.toggle('is-nav-filtered',!!query&&!node.textContent.toLocaleLowerCase().includes(query)));
      });
      const icons=()=>document.querySelectorAll('.side-search,.shell-settings-open,.side nav,.tabbar').forEach(root=>{window.lucide?.createIcons({root});root.querySelectorAll('svg[data-lucide]').forEach(node=>node.removeAttribute('data-lucide'));});
      if(window.ensureChatIcons)window.ensureChatIcons().then(icons).catch(()=>{});else icons();
    }
