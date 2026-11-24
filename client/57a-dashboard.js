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
        panel.classList.add('is-empty-slim');
        content.innerHTML = '<div class="warmup-slim-banner"><span class="warmup-slim-icon">🎉</span><div class="warmup-slim-text"><strong>All caught up for today!</strong> <span>' +
          (warmupStats?.masteredItems ? warmupStats.masteredItems + ' items mastered · ' : '') +
          'No mistakes due for review. Keep up the great streak!</span></div></div>';
        return;
      }
      panel.classList.remove('is-empty-slim');
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
      const cardShownAt = Date.now();
      const checkBtn = document.getElementById('warmupCheckBtn');
      if (checkBtn) {
        checkBtn.onclick = async () => {
          const input = document.getElementById('warmupAnswer');
          const val = input ? input.value.trim() : '';
          if (!val) return;
          checkBtn.disabled = true;
          try {
            const latencyMs = Math.max(1, Date.now() - cardShownAt);
            const result = await accountFetch('/api/error-bank', { method: 'POST', body: JSON.stringify({ itemId: item.id, answer: val, latencyMs }) });
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
    function wireMasteryBanner({pct}) {
      const currentTarget = Number(localStorage.getItem('lmLessonTargetPct') || 80);
      const chips = document.querySelectorAll('.home-target-chip');
      chips.forEach(chip => {
        const chipPct = Number(chip.dataset.targetPct);
        chip.classList.toggle('active', chipPct === currentTarget);
        chip.onclick = () => {
          localStorage.setItem('lmLessonTargetPct', String(chipPct));
          wireMasteryBanner({pct});
        };
      });

      const tiers = [
        { tier: 1, minPct: 80 },
        { tier: 2, minPct: 85 },
        { tier: 3, minPct: 90 },
        { tier: 4, minPct: 95 },
        { tier: 5, minPct: 100 }
      ];
      tiers.forEach(({tier, minPct}) => {
        const card = document.querySelector('.home-tier-card[data-tier="' + tier + '"]');
        if (card) {
          const unlocked = (pct || 0) >= minPct;
          card.classList.toggle('is-unlocked', unlocked);
          card.classList.toggle('is-locked', !unlocked);
          const pill = card.querySelector('.home-tier-pill');
          if (pill) {
            pill.textContent = unlocked ? 'Unlocked 🏆' : 'Level ' + tier;
            pill.style.background = unlocked ? 'var(--ok-s, #d1fae5)' : 'var(--acc-s)';
            pill.style.color = unlocked ? 'var(--ok, #047857)' : 'var(--acc)';
          }
        }
      });

      const openBadgesBtn = document.getElementById('openBadgesBtn');
      if (openBadgesBtn) {
        openBadgesBtn.onclick = () => {
          const dlg = document.getElementById('homeBadgesDialog');
          if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
        };
      }
      const closeBtn = document.getElementById('homeBadgesDialogClose');
      if (closeBtn) {
        closeBtn.onclick = () => {
          document.getElementById('homeBadgesDialog')?.close();
        };
      }
      const dlg = document.getElementById('homeBadgesDialog');
      if (dlg) {
        dlg.onclick = (e) => {
          if (e.target === dlg) dlg.close();
        };
      }
    }

    function homeFindNextLesson(targetPct = 80) {
      if (!authUser || authUser.role !== 'USER' || viewAccount) return null;
      const groups = (authUser && typeof classGroups !== 'undefined' ? classGroups : []).filter(row => Number.isSafeInteger(row.id));
      const group = groups.find(row => row.id === classGroupId) || groups[0];
      if (!group) return null;
      const materials = (typeof lmLibrary !== 'undefined' ? lmLibrary?.materials : []) || [];
      const lessons = materials.filter(row => group.lessonIds?.includes(row.id) && (typeof lmLessonVisibleToViewer === 'function' ? lmLessonVisibleToViewer(row) : true));
      if (!lessons.length) return null;

      const sorted = lessons.slice().sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return (group.lessonIds?.indexOf(a.id) ?? 0) - (group.lessonIds?.indexOf(b.id) ?? 0);
      });

      const learned = typeof loadLearned === 'function' ? loadLearned() : new Set();
      const started = typeof loadStarted === 'function' ? loadStarted() : [];

      for (const lesson of sorted) {
        const words = typeof lmLessonWordList === 'function' ? lmLessonWordList(lesson) : [];
        let pct = 0;
        if (words.length > 0) {
          const learnedCount = words.filter(w => (typeof learned?.has === 'function' ? learned.has(w) : (Array.isArray(learned) && learned.includes(w)))).length;
          pct = Math.round((learnedCount / words.length) * 100);
        } else if (started.includes(lesson.id)) {
          pct = 100;
        }
        if (pct < targetPct) {
          return lesson;
        }
      }
      return null;
    }

    function homeOpenNextUnstudiedLesson() {
      const targetPct = Number(localStorage.getItem('lmLessonTargetPct') || 80);
      const nextLesson = homeFindNextLesson(targetPct);
      if (nextLesson && typeof lmOpenLesson === 'function') {
        lmOpenLesson(nextLesson.id);
        return true;
      }
      return false;
    }
    window.homeFindNextLesson = homeFindNextLesson;
    window.homeOpenNextUnstudiedLesson = homeOpenNextUnstudiedLesson;

    function paintHomeDashboard({learned,total,pct}) {
      const text = (id,value) => { const node=document.getElementById(id);if(node)node.textContent=value; };
      const nameSpan = document.getElementById('homeStudentName');
      if (nameSpan) nameSpan.textContent = authUser?.name || authUser?.username || 'Student';
      const welcomeHeading = document.getElementById('homeWelcomeHeading');
      if (welcomeHeading && authUser && !authUser.firstLogin) {
        const studentName = typeof esc === 'function' ? esc(authUser.name || authUser.username || 'Student') : (authUser.name || authUser.username || 'Student');
        welcomeHeading.innerHTML = 'Welcome back, <span id="homeStudentName">' + studentName + '</span>! 👋';
      }
      text('shellProgressPercent',pct+'%');text('shellProgressCount',learned+' of '+total+' cards learned');
      const bar=document.getElementById('shellProgressBar');
      if(bar){bar.style.width=pct+'%';if(bar.parentElement)bar.parentElement.setAttribute('aria-valuenow',String(pct));}
      const isHomeSection = document.getElementById('home')?.classList.contains('on');
      const progress=document.querySelector('.shell-progress');
      if(progress)progress.hidden=!(authUser?.role==='USER'&&!viewAccount)||!!isHomeSection;
      const continueBtns = document.querySelectorAll('[data-home-continue]');
      continueBtns.forEach(btn => {
        btn.textContent = (pct === 0 || !learned) ? 'Start studying' : 'Continue studying';
      });
      const dashboard=document.getElementById('homeDashboard');if(!dashboard)return;
      dashboard.hidden=!authUser;
      const masteryBanner=document.getElementById('homeMasteryBanner');
      if(masteryBanner)masteryBanner.hidden=!(authUser?.role==='USER'&&!viewAccount);
      const groups=(authUser&&typeof classGroups!=='undefined'?classGroups:[]).filter(row=>Number.isSafeInteger(row.id));
      const group=groups.find(row=>row.id===classGroupId)||groups[0];
      text('homeGroupTitle',group?.title||'No group assigned');
      const lessons=group&&(typeof lmLibrary!=='undefined'?lmLibrary?.materials:[])?.filter(row=>group.lessonIds?.includes(row.id)&&lmLessonVisibleToViewer(row))||[];
      const metrics=document.getElementById('homeGroupMetrics');
      const liveStudentCount=(typeof groupLiveStudentCount==='function'&&!isDeveloper())?groupLiveStudentCount(group):undefined;
      const studentCount=liveStudentCount!==undefined?liveStudentCount:(group?.studentCount||0);
      if(metrics)metrics.innerHTML=group?[['student',studentCount],['lesson',lessons.length],['exam',group.examIds?.length||0]].filter(([,count])=>count>0).map(([name,count])=>'<span class="saas-badge saas-badge-muted">'+count+' '+name+(count===1?'':'s')+'</span>').join(''):'';
      const today=new Date(),date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
      const next=lessons.filter(row=>row.published&&/^\d{4}-\d{2}-\d{2}$/.test(row.date)&&row.date>=date).sort((a,b)=>a.date.localeCompare(b.date))[0];
      const slotDate = document.getElementById('homeNextLessonSlotDate');
      const slotNote = document.getElementById('homeNextLessonSlotNote');
      const slotBtn = document.getElementById('homeNextLessonSlotBtn');
      const slotBadge = document.getElementById('homeNextLessonSlotBadge');
      const oldNextLessonTile = document.getElementById('homeNextLesson');
      if(next){
        const formatted = next.date.split('-').reverse().join('.');
        text('homeNextLessonLabel',formatted);
        text('homeNextLessonNote',next.title||'Untitled lesson');
        if(slotDate)slotDate.textContent=formatted;
        if(slotNote)slotNote.textContent=next.title||'Upcoming lesson';
        if(slotBadge){slotBadge.textContent='Scheduled';slotBadge.className='saas-badge saas-badge-active';}
        if(slotBtn){
          slotBtn.textContent='Open lesson';
          slotBtn.disabled=false;
          slotBtn.style.pointerEvents='auto';
          slotBtn.style.cursor='pointer';
          slotBtn.style.opacity='1';
          slotBtn.onclick=()=>{if(typeof lmOpenLesson==='function')lmOpenLesson(next.id);else show('days');};
        }
        if(oldNextLessonTile){oldNextLessonTile.style.pointerEvents='auto';oldNextLessonTile.style.cursor='pointer';}
      }else{
        text('homeNextLessonLabel','\u2014');
        text('homeNextLessonNote','No upcoming lessons');
        if(slotDate)slotDate.textContent='\u2014';
        if(slotNote)slotNote.textContent='No upcoming lessons';
        if(slotBadge){slotBadge.textContent='None';slotBadge.className='saas-badge saas-badge-muted';}
        if(slotBtn){
          slotBtn.textContent='\u2014 Inactive';
          slotBtn.disabled=true;
          slotBtn.style.pointerEvents='none';
          slotBtn.style.cursor='default';
          slotBtn.style.opacity='0.6';
          slotBtn.onclick=null;
        }
        if(oldNextLessonTile){oldNextLessonTile.style.pointerEvents='none';oldNextLessonTile.style.cursor='default';}
      }
      const recent=document.getElementById('homeRecentList'),rows=homeRecentItems();
      if(recent)recent.innerHTML=rows.length?rows.map(row=>'<button class="home-recent-row" type="button" data-jump="'+row.screen+'"><span class="home-recent-mark" aria-hidden="true">'+homeScreenLabels[row.screen].slice(0,2).toUpperCase()+'</span><span><b>'+homeScreenLabels[row.screen]+'</b><small>Opened on this device</small></span><time class="saas-badge saas-badge-muted" datetime="'+new Date(row.at).toISOString()+'">'+esc(new Date(row.at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}))+'</time></button>').join(''):'<p class="hint">No recent activity on this device.</p>';
      const student=authUser?.role==='USER'&&!viewAccount;
      document.querySelectorAll('[data-home-continue]').forEach(node=>{node.dataset.jump=student?'days':'groups';node.hidden=!authUser;});
      document.querySelectorAll('[data-home-groups]').forEach(node=>{node.dataset.jump='groups';node.hidden=!authUser;});
      document.querySelectorAll('[data-home-group-open]').forEach(node=>{node.dataset.jump=student?'days':'groups';node.hidden=!authUser;});
      const open=document.querySelector('[data-home-group-open]');if(open)open.disabled=!group;
      wireMasteryBanner({pct});
      if(student)fetchWarmupData().then(()=>renderWarmupCard()).catch(()=>{});
      else{const panel=document.getElementById('homeWarmupPanel');if(panel)panel.hidden=true;}
    }
    function installShellBranding() {
      document.querySelectorAll('[data-copyright-year]').forEach(node=>{node.textContent=String(new Date().getFullYear());});
      const icons=()=>document.querySelectorAll('.shell-settings-open,.side nav,.tabbar').forEach(root=>{window.lucide?.createIcons({root});root.querySelectorAll('svg[data-lucide]').forEach(node=>node.removeAttribute('data-lucide'));});
      if(window.ensureChatIcons)window.ensureChatIcons().then(icons).catch(()=>{});else icons();
    }
