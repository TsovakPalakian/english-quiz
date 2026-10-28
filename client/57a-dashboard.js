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
    let warmupQueue = [], warmupCurrentIndex = 0, warmupStats = null, warmupFetching = false, warmupLoaded = false;
    async function fetchWarmupData(force=false) {
      if (!authUser || authUser.role !== 'USER' || viewAccount) return null;
      if (warmupLoaded && !force) return { stats: warmupStats, queue: warmupQueue };
      if (warmupFetching) return null;
      warmupFetching = true;
      try {
        const [statsRes, queueRes] = await Promise.all([
          fetch(accountApi() + '/api/error-bank?action=stats', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
          fetch(accountApi() + '/api/error-bank?action=queue&limit=10', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);
        if (!statsRes && !queueRes) return null;
        warmupStats = statsRes || { dueToday: 0 };
        warmupQueue = queueRes?.queue || [];
        warmupCurrentIndex = 0;
        warmupLoaded = true;
        return { stats: warmupStats, queue: warmupQueue };
      } catch { return null; }
      finally { warmupFetching = false; }
    }
    function renderWarmupCard() {
      const panel = document.getElementById('homeWarmupPanel');
      if (!panel) return;
      const student = authUser?.role === 'USER' && !viewAccount;
      if (!student) { panel.hidden = true; return; }
      panel.hidden = false;
      const badge = document.getElementById('homeWarmupBadge'), content = document.getElementById('homeWarmupContent');
      if (!content) return;
      const due = warmupStats?.dueToday || 0;
      if (badge) {
        badge.textContent = due ? due + ' due' : 'All clear';
        badge.classList.toggle('is-due', due > 0);
      }
      const item = warmupQueue[warmupCurrentIndex];
      if (!item) {
        if (!content.querySelector('.home-warmup-empty')) {
          content.innerHTML = '<div class="home-warmup-empty"><p><strong>All caught up! 🎉</strong></p><small>' +
            (warmupStats?.masteredItems ? warmupStats.masteredItems + ' items mastered · ' : '') +
            'No mistakes due for review today.</small></div>';
        }
        return;
      }
      const existingCard = content.querySelector('.home-warmup-card');
      if (existingCard && existingCard.dataset.warmupId === String(item.id)) {
        return;
      }
      const stageLabels = { 1: 'Level 1: Recognition', 2: 'Level 2: Cued Recall', 3: 'Level 3: Context Writing', 4: 'Level 4: Speech Recall' };
      let inputHtml = '';
      if (item.stage === 1) {
        inputHtml = '<div class="home-warmup-inputs"><input type="text" id="warmupAnswer" class="saas-input" placeholder="Type answer" autocomplete="off" autocorrect="off" autocapitalize="off" /><button class="btn primary saas-btn saas-btn-primary" type="button" id="warmupCheckBtn">Check</button></div>';
      } else if (item.stage === 2) {
        inputHtml = '<div class="home-warmup-inputs"><input type="text" id="warmupAnswer" class="saas-input" placeholder="' + esc(item.cuedHint || 'Fill in the gap') + '" autocomplete="off" /><button class="btn primary saas-btn saas-btn-primary" type="button" id="warmupCheckBtn">Check</button></div>';
      } else if (item.stage === 3) {
        inputHtml = '<div class="home-warmup-inputs"><textarea id="warmupAnswer" class="saas-textarea" placeholder="Write a complete sentence..." rows="2"></textarea><button class="btn primary saas-btn saas-btn-primary" type="button" id="warmupCheckBtn">Submit sentence</button></div>';
      } else {
        inputHtml = '<div class="home-warmup-inputs"><input type="text" id="warmupAnswer" class="saas-input" placeholder="Pronounce or confirm text" /><button class="btn primary saas-btn saas-btn-primary" type="button" id="warmupCheckBtn">Confirm</button></div>';
      }
      content.innerHTML = '<div class="home-warmup-card saas-card" data-warmup-id="' + item.id + '">' +
        '<div class="home-warmup-meta"><span class="home-warmup-stage saas-badge saas-badge-info">' + esc(stageLabels[item.stage] || 'Practice') + '</span><span class="home-warmup-counter saas-badge saas-badge-muted">' + (warmupCurrentIndex + 1) + ' of ' + warmupQueue.length + '</span></div>' +
        '<p class="home-warmup-prompt">' + esc(item.prompt) + '</p>' +
        (item.hint ? '<small class="home-warmup-hint">' + esc(item.hint) + '</small>' : '') +
        inputHtml +
        '<p id="warmupFeedback" class="home-warmup-feedback" hidden></p>' +
        '</div>';
      const checkBtn = document.getElementById('warmupCheckBtn');
      if (checkBtn) {
        checkBtn.onclick = async () => {
          const input = document.getElementById('warmupAnswer');
          const val = input ? input.value.trim() : '';
          if (!val) return;
          checkBtn.disabled = true;
          try {
            const result = await accountFetch('/api/error-bank', { method: 'POST', body: JSON.stringify({ itemId: item.id, answer: val }) });
            const fb = document.getElementById('warmupFeedback');
            if (fb) {
              fb.hidden = false;
              if (result.correct) {
                fb.className = 'home-warmup-feedback is-correct';
                fb.textContent = result.status === 'mastered' ? 'Mastered! 🎉 Great job!' : 'Correct! Advanced to ' + (stageLabels[result.stage] || 'next stage');
              } else {
                fb.className = 'home-warmup-feedback is-incorrect';
                fb.textContent = 'Keep practicing. Correct: ' + result.expected;
              }
            }
            setTimeout(() => {
              warmupCurrentIndex++;
              if (warmupStats && warmupStats.dueToday > 0) warmupStats.dueToday--;
              renderWarmupCard();
            }, 1200);
          } catch (err) {
            console.error('WARMUP ERROR:', err);
            checkBtn.disabled = false;
          }
        };
        const input = document.getElementById('warmupAnswer');
        if (input) input.onkeydown = e => { if (e.key === 'Enter' && item.stage !== 3) checkBtn.click(); };
      }
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
      if(metrics)metrics.innerHTML=group?[['student',group.studentCount||0],['lesson',lessons.length],['exam',group.examIds?.length||0]].filter(([,count])=>count>0).map(([name,count])=>'<span class="saas-badge saas-badge-muted">'+count+' '+name+(count===1?'':'s')+'</span>').join(''):'';
      const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
      const next=lessons.filter(row=>row.published&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&row.date>=date).sort((a,b)=>a.date.localeCompare(b.date))[0];
      text('homeNextLessonLabel',next?next.date.split('-').reverse().join('.'):'\u2014');
      text('homeNextLessonNote',next?.title||'No upcoming lessons');
      const recent=document.getElementById('homeRecentList'),rows=homeRecentItems();
      if(recent)recent.innerHTML=rows.length?rows.map(row=>'<button class="home-recent-row" type="button" data-jump="'+row.screen+'"><span class="home-recent-mark" aria-hidden="true">'+homeScreenLabels[row.screen].slice(0,2).toUpperCase()+'</span><span><b>'+homeScreenLabels[row.screen]+'</b><small>Opened on this device</small></span><time class="saas-badge saas-badge-muted" datetime="'+new Date(row.at).toISOString()+'">'+esc(new Date(row.at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))+'</time></button>').join(''):'<p class="hint">No recent activity on this device.</p>';
      const student=authUser?.role==='USER'&&!viewAccount;
      document.querySelectorAll('[data-home-continue],[data-home-groups],[data-home-group-open]').forEach(node=>{node.dataset.jump=student?'days':'groups';node.hidden=!authUser;});
      const open=document.querySelector('[data-home-group-open]');if(open)open.disabled=!group;
      if(student)fetchWarmupData().then(()=>renderWarmupCard()).catch(()=>{});
      else{const panel=document.getElementById('homeWarmupPanel');if(panel)panel.hidden=true;}
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
