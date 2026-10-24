    function accountApi() {
      if (String(location.port) === "8766") return location.protocol + "//" + location.hostname + ":8767";
      return "";
    }
    function lookupBase() {
      return accountApi();
    }
    function accountFetch(path, options) {
      const opts = Object.assign({ credentials: "include" }, options || {});
      const headers = Object.assign({ "Content-Type": "application/json" }, (options && options.headers) || {});
      opts.headers = headers;
      if (opts.method && opts.method.toUpperCase() !== "GET") viewCache.clear();
      return fetch(accountApi() + path, opts).then(async (res) => {
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) viewCache.clear();
          const plain = text && text.length <= 180 && text.indexOf("<") < 0 ? text.trim() : "";
          throw new Error(data.error || plain || "The server could not finish this request.");
        }
        return data;
      });
    }
    // Read-only views: paint the last answer at once, then repaint if the server differs.
    function viewFresh(name, load, paint, loading) {
      const key = (authUser?.id || "") + ":" + viewGen, hit = viewCache.get(name), cached = hit && hit.key === key ? hit.data : null;
      if (cached) paint(cached, false); else if (loading) loading();
      let request;
      try { request = Promise.resolve(load()); } catch (error) { request = Promise.reject(error); }
      return request.then((data) => {
        if ((authUser?.id || "") + ":" + viewGen !== key) return;
        viewCache.delete(name); viewCache.set(name, { key, data });
        while (viewCache.size > 50) viewCache.delete(viewCache.keys().next().value);
        if (!cached || JSON.stringify(cached) !== JSON.stringify(data)) paint(data, !!cached);
      }, (error) => { viewCache.delete(name); throw error; });
    }
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 30000 || !authUser) return;
      hiddenAt = 0;
      const active = document.querySelector('section.on')?.id;
      if (active === 'admin' && !editingIn(document.getElementById('adminBody'))) paintAdmin();
      if (active === 'stats') paintStats();
    });
    function editingIn(root) {
      const node = document.activeElement;
      return !!node && !!root && root.contains(node) && node.matches('input:not([type="search"]),select,textarea,[contenteditable="true"]');
    }
    function accountSnapshot() {
      const read = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key) || fallback); }
        catch (e) { return JSON.parse(fallback); }
      };
      const songs = read(SONG_KEY, "[]");
      songs.forEach((song) => { if (song && typeof song === "object") delete song.blob; });
      const stats = {};
      const size = Number(localStorage.getItem("enquiz-lyric-size")) || 0;
      if (size) stats.lyricSize = size;
      stats.mistakes = Object.keys(loadMistakeMap()).map((key) => loadMistakeMap()[key]);
      try { stats.demonstratives = JSON.parse(localStorage.getItem("enquiz-demonstratives") || "null"); } catch (e) { stats.demonstratives = null; }
      try { stats.cardEdits = JSON.parse(localStorage.getItem(EDIT_KEY) || "null"); } catch (e) { stats.cardEdits = null; }
      try { stats.cardQuizzes = JSON.parse(localStorage.getItem(CARD_QUIZ_KEY) || "null"); } catch (e) { stats.cardQuizzes = null; }
      try { stats.dayLinks = JSON.parse(localStorage.getItem(LINK_KEY) || "null"); } catch (e) { stats.dayLinks = null; }
      stats.customThemes = loadCustomThemes();
      try { stats.hiddenLessons = JSON.parse(localStorage.getItem(HIDDEN_LESSONS_KEY) || "[]"); } catch (e) { stats.hiddenLessons = []; }
      if (!Array.isArray(stats.hiddenLessons)) stats.hiddenLessons = [];
      try { stats.allowedLessons = JSON.parse(localStorage.getItem(ALLOWED_LESSONS_KEY) || "[]"); } catch (e) { stats.allowedLessons = []; }
      if (!Array.isArray(stats.allowedLessons)) stats.allowedLessons = [];
      return {
        added: addedCache || read(ADDED_KEY, "[]"),
        songs: songs,
        learned: read(LEARNED_KEY, "[]"),
        variants: read(VARIANT_KEY, "{}"),
        stats: stats
      };
    }
    function syncChange(change) {
      if (!change || !change.op) return;
      // Drop mutations while Open pages is mid-stash/restore so payloads cannot retarget.
      if (viewSwitching) return;
      // While viewing with sync frozen, do not enqueue teacher/student LS as the wrong target.
      if (!accountReady && viewAccount) return;
      let next = change;
      // Coalesce pending cardQuizzes patches (merge keys; newer values win).
      if (change.op === "put-setting" && change.key === "cardQuizzes") {
        let merged = Object.assign({}, plainCardQuizMap(change.value));
        for (let i = syncQueue.length - 1; i >= 0; i--) {
          const prev = syncQueue[i];
          if (!prev || prev.op !== "put-setting" || prev.key !== "cardQuizzes") continue;
          if (syncSending && i === 0) continue;
          merged = Object.assign({}, plainCardQuizMap(prev.value), merged);
          syncQueue.splice(i, 1);
        }
        next = { op: "put-setting", key: "cardQuizzes", value: merged };
      }
      // Shared card quizzes and catalog edits always target the signed-in teacher.
      const selfTarget = (next.op === "put-setting" && next.key === "cardQuizzes") || next.op === "delete-card-quiz" || next.op === "put-edit";
      // Stamp intended account at enqueue time so flush never retargets across view switches.
      next.forUserId = selfTarget ? null : (viewAccount && viewAccount.id ? viewAccount.id : null);
      syncQueue.push(next);
      scheduleStateSave();
    }
    function scheduleStateSave() {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(flushUserState, 150);
    }
    function flushUserState() {
      if (syncSending) return syncInFlight || Promise.resolve();
      if (authSyncLock || viewSwitching || !authUser || !accountReady || !syncQueue.length) return Promise.resolve();
      syncSending = true;
      const change = syncQueue[0];
      const selfTarget = change && (
        (change.op === "put-setting" && change.key === "cardQuizzes") ||
        change.op === "delete-card-quiz" ||
        change.op === "put-edit"
      );
      let targetUserId = null;
      if (!selfTarget) {
        if (Object.prototype.hasOwnProperty.call(change, "forUserId")) targetUserId = change.forUserId || null;
        else if (viewAccount && viewAccount.id) targetUserId = viewAccount.id;
      }
      const target = targetUserId
        ? "/api/admin/users/" + encodeURIComponent(targetUserId) + "/state"
        : "/api/me/state";
      const body = Object.assign({}, change);
      delete body.forUserId;
      syncInFlight = accountFetch(target, { method: "PUT", body: JSON.stringify(body) }).then(() => {
        syncFails = 0;
        // Only drop the op we actually sent. Queue may have been cleared/replaced (view switch).
        if (syncQueue[0] === change) syncQueue.shift();
        else {
          const idx = syncQueue.indexOf(change);
          if (idx >= 0) syncQueue.splice(idx, 1);
        }
        syncSending = false;
        syncInFlight = null;
        if (syncQueue.length) return flushUserState();
      }).catch((error) => {
        syncSending = false;
        syncInFlight = null;
        syncFails += 1;
        if (syncFails >= 3) {
          syncFails = 0;
          // Keep the failed op at the front; stop auto-drop so data is not silently lost.
          const message = error && error.message ? error.message : "The change could not be saved on the server.";
          alert(message);
          return;
        }
        return new Promise((resolve) => {
          syncTimer = setTimeout(() => resolve(flushUserState()), 2000);
        });
      });
      return syncInFlight;
    }
    function drainUserState() {
      clearTimeout(syncTimer);
      syncTimer = 0;
      const pump = () => {
        if (!syncQueue.length) return Promise.resolve();
        if (syncSending) return (syncInFlight || Promise.resolve()).then(pump);
        const before = syncQueue.length;
        return flushUserState().then(() => {
          if (!syncQueue.length) return;
          // Stalled after repeated failures — do not wipe the queue.
          if (syncQueue.length === before && !syncSending) {
            throw new Error("Some changes could not be saved. Try again.");
          }
          return pump();
        });
      };
      return (syncInFlight || Promise.resolve()).then(pump).then(() => {
        // Fail closed: wait until the latest texts PUT head has settled (a late writeTexts can chain after the first await).
        const waitTexts = () => {
          const head = textsInFlight;
          return head.then(() => {}, (err) => {
            throw err || new Error("Some texts could not be saved. Try again.");
          }).then(() => {
            if (textsInFlight !== head) return waitTexts();
          });
        };
        return waitTexts();
      });
    }
    window.addEventListener("pagehide", () => { flushUserState(); });
    window.syncDemoProgress = function () {
      let value = null;
      try { value = JSON.parse(localStorage.getItem("enquiz-demonstratives") || "null"); } catch (e) { value = null; }
      if (!viewAccount && !viewSwitching) syncChange({ op: "put-setting", key: "demonstratives", value: value });
    };
    function stashAnon() {
      if (localStorage.getItem("enquiz-auth-on") === "1") return;
      const snap = {};
      [ADDED_KEY, SONG_KEY, LEARNED_KEY, VARIANT_KEY, MISTAKE_KEY, "enquiz-lyric-size", "enquiz-demonstratives", EDIT_KEY].forEach((key) => {
        snap[key] = localStorage.getItem(key);
      });
      localStorage.setItem("enquiz-anon-backup", JSON.stringify(snap));
      localStorage.setItem("enquiz-auth-on", "1");
    }
    function restoreAnon() {
      if (localStorage.getItem("enquiz-auth-on") !== "1") return;
      let snap = null;
      try { snap = JSON.parse(localStorage.getItem("enquiz-anon-backup") || "null"); }
      catch (e) { snap = null; }
      [ADDED_KEY, SONG_KEY, LEARNED_KEY, VARIANT_KEY, MISTAKE_KEY, "enquiz-lyric-size", "enquiz-demonstratives", EDIT_KEY].forEach((key) => {
        const value = snap ? snap[key] : null;
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      });
      addedCache = null;
      localStorage.removeItem("enquiz-anon-backup");
      localStorage.removeItem("enquiz-auth-on");
    }
    function mergeAdded(localList, serverList) {
      const out = [];
      const seen = {};
      function push(item) {
        if (!item || !String(item.word || "").trim()) return;
        const key = (item.place || "mine") + "|" + String(item.word).trim().toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        out.push(item);
      }
      serverList.forEach(push);
      localList.forEach(push);
      return out;
    }
    function applyAccountState(state) {
      authSyncLock = true;
      const localSongs = loadSongs();
      const serverSongs = Array.isArray(state.songs) ? state.songs : [];
      const songs = serverSongs.length ? serverSongs : localSongs;
      writeSongs(songs);
      const localAdded = loadAdded();
      const serverAdded = Array.isArray(state.added) ? state.added : [];
      const added = mergeAdded(localAdded, serverAdded);
      const pushAdded = added.length > serverAdded.length;
      rememberAdded(added);
      localStorage.setItem(LEARNED_KEY, JSON.stringify(state.learned || []));
      localStorage.setItem(VARIANT_KEY, JSON.stringify(state.variants || {}));
      if (state.stats && state.stats.lyricSize) localStorage.setItem("enquiz-lyric-size", String(state.stats.lyricSize));
      const mistakeMap = {};
      const serverMistakes = state.stats && Array.isArray(state.stats.mistakes) ? state.stats.mistakes : [];
      serverMistakes.forEach((row) => {
        if (row && row.en && row.type && row.misses > 0) mistakeMap[String(row.en).toLowerCase() + "|" + row.type] = row;
      });
      localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeMap));
      if (state.stats && state.stats.demonstratives) localStorage.setItem("enquiz-demonstratives", JSON.stringify(state.stats.demonstratives));
      if (window.paintDemonstratives) window.paintDemonstratives();
      if (state.stats && state.stats.cardEdits) localStorage.setItem(EDIT_KEY, JSON.stringify(state.stats.cardEdits));
      else localStorage.removeItem(EDIT_KEY);
      installCardQuizzes(state.stats && state.stats.cardQuizzes);
      if (state.stats && state.stats.dayLinks) localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks));
      installCustomThemes(!hideStudentSongs() && state.stats && Array.isArray(state.stats.customThemes) ? state.stats.customThemes : []);
      installHiddenLessons(state.stats && state.stats.hiddenLessons);
      installAllowedLessons(state.stats && state.stats.allowedLessons);
      settleThemeAudience();
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
      paintAdded();
      paintLyrics();
      paintHomeAccount();
      if (window.paintLmDays) window.paintLmDays();
      authSyncLock = false;
      if (syncQueue.length) scheduleStateSave();
    }
    function personalCounts() {
      return {
        learned: loadLearned().size,
        words: loadAdded().length,
        songs: loadSongs().filter((song) => !song.archived).length
      };
    }
    function paintHomeStats() {
      const rows = authUser ? studyCards() : [];
      const buckets = homeBuckets(rows);
      const learned = buckets.learned.length;
      const total = rows.length;
      const pct = total ? Math.round(learned * 100 / total) : 0;
      const count = document.getElementById("homeLearnedCount");
      const pctEl = document.getElementById("homeLearnedPct");
      const ring = document.querySelector("#homeDemo .ring-fg");
      const learning = document.getElementById("homeLearningCount");
      const unread = document.getElementById("homeUnreadCount");
      const next = document.getElementById("homeNextLessonLabel");
      if (count) count.innerHTML = learned + " <span>of " + total + "</span>";
      if (pctEl) pctEl.textContent = pct + "%";
      if (learning) learning.textContent = String(buckets.learning.length);
      if (unread) {
        const totalUnread = Number(window.__chatUnreadTotal || 0);
        unread.textContent = String(authUser ? totalUnread : 0);
      }
      if (next) {
        const group = (typeof classGroups !== "undefined" && classGroups || []).find((row) => row.id === classGroupId) || (typeof classGroups !== "undefined" && classGroups || [])[0];
        next.textContent = authUser && group ? String(group.title || "Lesson").slice(0, 12) : "—";
      }
      if (ring) {
        const whole = total || 1;
        ring.setAttribute("pathLength", String(whole));
        ring.setAttribute("stroke-dasharray", learned + " " + (whole - learned));
        ring.style.strokeLinecap = learned ? "round" : "butt";
      }
      if (typeof paintHomeDashboard === 'function') paintHomeDashboard({learned,total,pct});
    }
    const CLASS_PAGES = [
      { id: "lesson07", place: "lesson-07" },
      { id: "lesson09", place: "lesson-09" },
      { id: "lesson14", place: "lesson-14" },
      { id: "lesson16", place: "lesson-16" },
      { id: "lesson", place: "lesson-21" },
      { id: "lesson23", place: "lesson-23" }
    ];
    const STARTED_KEY = "enquiz-started";
    function loadStarted() {
      try {
        const list = JSON.parse(localStorage.getItem(STARTED_KEY) || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }
    function markClassStarted(id) {
      const list = loadStarted().filter((item) => item !== id);
      list.push(id);
      try { localStorage.setItem(STARTED_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function classFinished(place) {
      const cards = lessonPool(place);
      if (!cards.length) return false;
      const learned = loadLearned();
      return cards.every((card) => learned.has(String(card.en || "").toLowerCase()));
    }
    function classTouched(place, learned) {
      return lessonPool(place).some((card) => learned.has(String(card.en || "").toLowerCase()));
    }
    function paintHomeStudy() {
      const btn = document.getElementById("homeStudy");
      const alt = document.getElementById("homeStudyAlt");
      if (!btn) return;
      const started = loadStarted();
      const learned = loadLearned();
      const begun = started.length > 0 || CLASS_PAGES.some((row) => classTouched(row.place, learned));
      const allDone = CLASS_PAGES.every((row) => classFinished(row.place));
      if (begun && allDone) {
        btn.textContent = "Study words";
        btn.dataset.jump = "setup";
        if (alt) alt.hidden = false;
        return;
      }
      if (alt) alt.hidden = true;
      const studyJump = authUser?.role === "USER" && !viewAccount ? "days" : "groups";
      if (!begun) {
        btn.textContent = "Start studying";
        btn.dataset.jump = studyJump;
        return;
      }
      btn.textContent = "Continue studying";
      const recent = started.slice().reverse().find((id) => {
        const row = CLASS_PAGES.find((item) => item.id === id);
        return row && !classFinished(row.place);
      });
      const next = CLASS_PAGES.find((row) => !classFinished(row.place));
      btn.dataset.jump = recent || (next ? next.id : studyJump);
    }
    let signedOutHello = false;
    function paintHomeHello() {
      const hello = document.querySelector("#home .hello");
      if (!hello) return;
      hello.textContent = authUser ? (authUser.firstLogin ? "Welcome! Let's get started" : "Welcome back") : signedOutHello ? "See you soon" : "Hello!";
      hello.style.visibility = accountChecked ? "" : "hidden";
      document.body?.classList?.toggle("guest-goodbye", !authUser && !!signedOutHello && !!accountChecked);
      const guestActions = document.getElementById("homeAuth");
      if (guestActions) guestActions.hidden = !!authUser || !accountChecked;
    }
    function paintHomeAccount() {
      document.body?.classList.toggle('guest-home',!authUser&&accountChecked&&document.querySelector('section.on')?.id==='home');
      document.querySelectorAll('#home [data-stat]').forEach(button=>button.disabled=!authUser);
      const who = document.getElementById("homeWho");
      const demo = document.getElementById("homeDemo");
      if (!who || !demo) return;
      demo.classList.toggle('guest-progress', !authUser);
      who.hidden = true;
      who.innerHTML = "";
      demo.hidden = !authUser;
      paintHomeHello();
      paintHomeStats();
      paintHomeStudy();
      paintGuestAccess();
      refreshAccountsCount();
      offerTeacherInvite();
    }
    let accountsCountActor = '', accountsCountAt = 0, accountsCountFlight = null;
    function paintAccountsCount(count) {
      const suffix = count ? ' · ' + count : '';
      document.querySelectorAll('[data-jump="admin"]').forEach(button => {
        button.childNodes.forEach(node => { if (node.nodeType === 3 && node.textContent.trim()) node.textContent = 'Accounts' + suffix; });
      });
      const tab = document.querySelector('[data-admin-tab="requests"]');
      if (tab) tab.textContent = 'Approval requests' + suffix;
    }
    function refreshAccountsCount() {
      const actor = authUser?.id;
      if (!isTeacher() || viewAccount) {
        accountsCountActor = ''; accountsCountAt = 0; accountsCountFlight = null;
        paintAccountsCount(0); return;
      }
      if (accountsCountActor !== actor) {
        accountsCountActor = actor; accountsCountAt = 0; accountsCountFlight = null;
        paintAccountsCount(0);
      }
      if (accountsCountFlight || Date.now() - accountsCountAt < 30000) return;
      const requestedAt=Date.now();
      const flight = Promise.all([accountFetch('/api/admin/registrations'),accountFetch('/api/admin/changes')]).then(([data,changes]) => {
        if (authUser?.id !== actor || viewAccount || !isTeacher()) return;
        if(accountsCountAt>requestedAt)return;
        paintAccountsCount([...(data.registrations||[]),...(changes.changes||[])].filter(row => row.status === 'pending' && accountVisible(row)).length);
        accountsCountAt = Date.now();
      }).catch(() => {}).finally(() => { if (accountsCountFlight === flight) accountsCountFlight = null; });
      accountsCountFlight = flight;
    }
    function paintAccount() {
      const box = document.getElementById("accountBody");
      if (!box) return;
      if (authUser) {
        const person = faceUser();
        box.innerHTML = '<div class="card"><p class="stat-kicker">' + roleLabel(person.role) + '</p>' +
          '<p class="entry">' + esc(person.login) + '</p><p class="hint">' + esc(person.email) + '</p>' +
          '<div class="row"><button class="btn primary" type="button" data-jump="profile">Account</button>' +
          (viewAccount ? "" : '<button class="btn" type="button" data-user-settings>Settings</button><button class="btn" type="button" data-account="logout">Log out</button>') +
          '</div></div>';
        return;
      }
      let register=false;
      try{register=sessionStorage.getItem('enquiz-auth-form')==='register';}catch{}
      paintAccountForm(register);
    }
    function paintAccountForm(register) {
      const box = document.getElementById("accountBody");
      if (!box || authUser) return;
      if(window.MicrosoftSignIn?.pending()){window.MicrosoftSignIn.paint(box);return;}
      if(window.TelegramSignIn?.pending()){window.TelegramSignIn.paint(box);return;}
      try{sessionStorage.setItem('enquiz-auth-form',register?'register':'login');}catch{}
      let flash = "";
      try {
        flash = sessionStorage.getItem("enquiz-auth-flash") || "";
        if (flash) sessionStorage.removeItem("enquiz-auth-flash");
      } catch (e) {}
      const flashHtml = flash ? '<p class="hint" style="margin-bottom:10px">' + esc(flash) + "</p>" : "";
      const tabs='<div class="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected="'+!register+'" data-account="show-login">Log in</button><button type="button" role="tab" aria-selected="'+!!register+'" data-account="show-register">Create account</button></div>';
      const passwordField=(create)=>'<label for="authPassword">Password</label><div class="auth-password"><i class="auth-field-icon" data-lucide="lock-keyhole" aria-hidden="true"></i><input id="authPassword" name="password" type="password" placeholder="Password" maxlength="32" '+(create?'minlength="8" aria-describedby="authPasswordHint" autocomplete="new-password"':'autocomplete="current-password"')+' required /><button type="button" data-auth-password aria-controls="authPassword" aria-label="Show password" title="Show password" aria-pressed="false">Show</button></div>'+(create?'<p class="hint auth-password-hint" id="authPasswordHint">8–32 characters</p>':'');
      const decorate=()=>{void window.MicrosoftSignIn?.decorate(box);void window.TelegramSignIn?.decorate(box);const draw=()=>window.lucide?.createIcons({root:box});if(window.ensureChatIcons)window.ensureChatIcons().then(draw).catch(()=>{});else draw();};
      const authDivider='<div class="auth-divider"><span>OR CONTINUE WITH</span></div>';
      const microsoft='<button class="btn auth-google" type="button" data-microsoft-auth hidden><svg class="auth-google-icon" viewBox="0 0 21 21" aria-hidden="true"><path fill="#f25022" d="M1 1h9v9H1z"/><path fill="#7fba00" d="M11 1h9v9h-9z"/><path fill="#00a4ef" d="M1 11h9v9H1z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg><span>Sign in with Microsoft</span></button>';
      const telegram='<button class="btn auth-google" type="button" data-telegram-auth hidden><svg class="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#26a5e4" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Z"/><path fill="#fff" d="m5.5 11.7 11.6-4.5c.5-.2.9.1.7.9l-2 9.2c-.1.7-.5.8-1 .5l-3-2.2-1.4 1.4c-.2.2-.3.3-.6.3l.2-3.1 5.6-5.1c.2-.2 0-.3-.3-.1l-6.9 4.3-3-.9c-.7-.2-.7-.5.1-.7Z"/></svg><span>Sign in with Telegram</span></button>';
      const google='<button class="btn auth-google" type="button" data-google-auth><svg class="auth-google-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24.8v7.42h10.55a9.03 9.03 0 0 1-3.91 5.93v4.93h6.34c3.71-3.42 5.83-8.46 5.83-14.36Z"/><path fill="#34A853" d="M24.8 43.6c5.29 0 9.72-1.75 12.96-4.78l-6.34-4.93c-1.76 1.18-4.01 1.9-6.62 1.9-5.1 0-9.43-3.44-10.98-8.08H7.28v5.08A19.59 19.59 0 0 0 24.8 43.6Z"/><path fill="#FBBC05" d="M13.82 27.71a11.76 11.76 0 0 1 0-7.42v-5.08H7.28a19.59 19.59 0 0 0 0 17.58l6.54-5.08Z"/><path fill="#EA4335" d="M24.8 12.21c2.89 0 5.46 1 7.51 2.95l5.63-5.63A18.85 18.85 0 0 0 24.8 4.4 19.59 19.59 0 0 0 7.28 15.21l6.54 5.08c1.55-4.64 5.88-8.08 10.98-8.08Z"/></svg><span>Continue with Google</span></button>';
      if (register) {
        let invite = "";
        try { invite = sessionStorage.getItem("enquiz-invite") || ""; } catch (e) {}
        if(invite&&!inviteDetails){
          box.innerHTML='<div class="account-gate"><div class="card"><h1 class="auth-title">Create account</h1><p class="hint" role="status" data-invite-loading>'+esc(inviteDetailsError||'Loading invitation…')+'</p></div></div>';
          return;
        }
        const teacherInvite=inviteDetails?.kind==='teacher'&&!!invite;
        const inviteHint = invite
          ? '<p class="hint">'+(teacherInvite?'Verify your invited email. Your account needs approval by the inviting teacher or a developer before you join the group.':'Your invitation approves your student account automatically and adds you to the group.')+'</p>'
          : '<p class="hint auth-approval">Your account needs teacher approval before you can sign in.</p>';
        box.innerHTML = '<div class="account-gate"><div class="card"><h1 class="auth-title">Create account</h1>' + flashHtml +
          '<form id="registerForm"><label for="authLogin">Login</label><input id="authLogin" name="login" type="text" autocomplete="username" placeholder="Your login" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" title="3 to 32 Latin letters, digits or underscores; no spaces" required />' +
          '<label for="authEmail">Email</label><input id="authEmail" name="email" type="email" maxlength="120" autocomplete="email" placeholder="you@example.com" required />' +
          '<label for="authName">Name</label><input id="authName" name="name" type="text" autocomplete="name" placeholder="Your name" maxlength="80" required />' +
          passwordField(true)+
          (teacherInvite?'<button class="btn auth-code-send" type="button" data-invite-email-send>Send code</button><label data-otp-step hidden for="inviteEmailCode">Email code</label><input data-otp-step hidden disabled id="inviteEmailCode" name="emailCode" inputmode="numeric" autocomplete="one-time-code" required />':'')+
          '<p class="hint" role="status" data-form-status></p><button class="btn primary" type="submit">Create account</button></form>' +(invite?inviteHint:'')+'<div data-registration-providers hidden>'+authDivider+'<div class="auth-providers">'+google+microsoft+telegram+'</div></div></div></div>';
        decorate();
        return;
      }
      box.innerHTML = '<div class="account-gate"><div class="card">'+tabs+'<h1 class="auth-title">Log in</h1>' + flashHtml +
        '<div class="auth-mode-switch"><button class="btn chip on" type="button" data-login-mode="password">Password</button><button class="btn chip" type="button" data-login-mode="otp">Email code</button></div>' +
        '<form id="loginForm" data-login-mode="password"><label for="authLogin">Login or email</label><div class="auth-login-field"><i class="auth-field-icon" data-lucide="mail" aria-hidden="true"></i><input id="authLogin" name="login" type="text" autocomplete="username" placeholder="Login or email" required /></div>' +
        passwordField(false)+
        '<p class="hint" role="status" data-form-status></p><button class="btn primary" type="submit">Enter the Studio</button></form><button type="button" class="auth-forgot" data-password-recovery>Forgot your password?</button>' +
        '<form id="otpLoginForm" data-login-mode="otp" hidden><label for="otpEmail">Email</label><input id="otpEmail" name="email" type="email" maxlength="120" autocomplete="email" placeholder="you@example.com" required />' +
        '<div class="row" style="margin:8px 0"><button class="btn" type="button" data-otp-send>Send code</button></div>' +
        '<label for="otpCode" data-otp-step hidden>Code</label><input id="otpCode" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="6-digit code" data-otp-step hidden disabled required />' +
        '<p class="hint" data-form-status></p><button class="btn primary" type="submit" data-otp-step hidden disabled>Sign in with code</button></form>' +
        authDivider+'<div class="auth-providers">'+(window.LumisciaPasskeys?.supported()?'<button class="btn auth-google" type="button" data-passkey-login aria-label="Log in with passkey" title="Log in with passkey"><i data-lucide="fingerprint" aria-hidden="true"></i><span>Log in with passkey</span></button>':'')+google+microsoft+telegram+'<button class="btn auth-google" type="button" data-login-mode="otp" aria-label="Sign in with email code" title="Sign in with email code"><i data-lucide="mail" aria-hidden="true"></i><span>Email code</span></button></div><p class="hint" role="status" data-passkey-status></p><p class="auth-create">New to Lumiscia? <button type="button" data-account="show-register">Create an account</button></p></div></div>';
      decorate();
    }
    function paintProfile() {
      const box = document.getElementById("profileBody");
      if (!box) return;
      if (!authUser) {
        box.innerHTML = '<div class="card"><p>Sign in to see your profile.</p><button class="btn primary" type="button" data-jump="account">Profile</button></div>';
        return;
      }
      const person = faceUser();
      const counts = personalCounts();
      box.innerHTML = '<div class="card"><p class="stat-kicker">' + roleLabel(person.role) + '</p>' +
        '<p class="entry">' + esc(person.login) + '</p><p class="hint">' + esc(person.email) + '</p>' +
        '<div class="row">' +
        (viewAccount ? "" : '<button class="btn" type="button" data-user-settings>Settings</button><button class="btn" type="button" data-account="logout">Log out</button>') +
        '</div></div>' +
        (viewAccount ? "" : '<div class="card" id="ownAccount"><p class="hint">Loading…</p></div>') +
        '<div class="overview"><button class="stat-tile" type="button" data-stat="learned"><b>' + counts.learned + '</b><span>Learned</span></button><button class="stat-tile" type="button" data-jump="allwords"><b>' + counts.words + '</b><span>Words</span></button></div>' +
        (viewAccount ? "" : '<p class="hint">Words, songs and progress stay with the account. Signing out removes them from this browser. They come back after you sign in.</p>' +
        '<div class="row"><button class="btn stop" type="button" data-account="revoke">Delete my data</button></div>');
      if (!viewAccount) {
        if (ownAccountData) renderOwnAccount(ownAccountData);
        else loadOwnAccount();
      }
    }
    function changeLines(row) {
      const lines = [];
      if (!row) return lines;
      if (row.from_login !== row.login) lines.push(["Login", row.from_login, row.login]);
      if (row.from_email !== row.email) lines.push(["Email", row.from_email, row.email]);
      if ((row.from_name || "") !== (row.name || "")) lines.push(["Name", row.from_name || "(empty)", row.name || "(empty)"]);
      return lines;
    }
    function changeHtml(row) {
      return changeLines(row).map((line) => '<p class="hint">' + esc(line[0]) + ": " + esc(line[1]) + " → " + esc(line[2]) + "</p>").join("");
    }
    let ownAccountData = null;
    function renderOwnAccount(data) {
      ownAccountData = data;
      const box = document.getElementById("ownAccount");
      if (!box || !data || !data.user) return;
      const change = data.change && data.change.status === "pending" ? data.change : null;
      box.innerHTML = (change ? changeHtml(change) + '<p class="hint">Waiting for approval.</p>' : "") +
        '<div class="row"><button class="btn" type="button" data-account="edit-details">Change details</button>' +
        '<button class="btn" type="button" data-account="edit-password">Change password</button></div>' +
        '<div id="ownAccountFormSlot" hidden></div><div id="ownPasswordSlot" hidden></div>';
    }
    function openOwnAccountForm() {
      const slot = document.getElementById("ownAccountFormSlot");
      const data = ownAccountData;
      if (!slot || !data || !data.user) return;
      const passwordSlot = document.getElementById('ownPasswordSlot');
      if (passwordSlot) { passwordSlot.hidden = true; passwordSlot.innerHTML = ''; }
      if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ""; return; }
      const user = data.user;
      if (data.locked) {
        slot.hidden = false;
        slot.innerHTML = '<p class="hint">You can change these details after a second active teacher joins.</p>';
        return;
      }
      const change = data.change && data.change.status === "pending" ? data.change : null;
      slot.hidden = false;
      slot.innerHTML = '<form id="ownAccountForm"><p class="hint">Account changes require approval. The request shows the current value and the new one.</p>' +
        '<p class="label">Login</p><input name="login" type="text" autocomplete="username" required />' +
        '<p class="label">Email</p><input name="email" type="email" autocomplete="email" required />' +
        '<p class="label">Name</p><input name="name" type="text" autocomplete="name" />' +
        (change ? '<button class="btn" type="button" data-account="cancel-change">Cancel request</button>' : "") +
        '<p class="hint" data-form-status></p><button class="btn primary" type="submit">Request change</button></form>';
      const form = document.getElementById("ownAccountForm");
      if (!form) return;
      form.login.value = change ? change.login : user.login;
      form.email.value = change ? change.email : user.email;
      form.name.value = change ? change.name : (user.name || "");
    }
    function openOwnPasswordForm() {
      const slot = document.getElementById("ownPasswordSlot");
      if (!slot) return;
      const detailsSlot = document.getElementById('ownAccountFormSlot');
      if (detailsSlot) { detailsSlot.hidden = true; detailsSlot.innerHTML = ''; }
      if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ""; return; }
      slot.hidden = false;
      slot.innerHTML = '<form id="ownPasswordForm"><p class="hint">The new password is saved immediately.</p>' +
        '<p class="label">Current password</p><input name="current" type="password" autocomplete="current-password" required />' +
        '<p class="label">New password</p><input name="password" type="password" minlength="8" maxlength="32" autocomplete="new-password" placeholder="8 to 32 characters" required />' +
        '<p class="label">Repeat new password</p><input name="repeat" type="password" minlength="8" maxlength="32" autocomplete="new-password" required />' +
        '<p class="hint" data-form-status></p><button class="btn primary" type="submit">Save password</button></form>';
    }
    const guestLogo = document.querySelector('.guest-brand');
    let logoTaps = 0, logoLastTap = 0, logoHideTimer, logoReloadTimer;
    function reloadGuestHome(){
      try{sessionStorage.removeItem('enquiz-place');}catch{}
      location.reload();
    }
    document.addEventListener('click',event=>{
      if(authUser||!event.target.closest('.auth-brand'))return;
      event.preventDefault();event.stopImmediatePropagation();reloadGuestHome();
    },true);
    function logoMottoHeight(motto) {
      const top=motto.getBoundingClientRect().top;
      return Math.max(0,...[...motto.querySelectorAll('b,span')].map(node=>node.getBoundingClientRect().bottom-top));
    }
    function positionLogoMotto(motto) {
      document.getElementById('home').style.setProperty('--guest-motto-offset',Math.ceil(logoMottoHeight(motto)+16)+'px');
    }
    window.addEventListener('resize',()=>{
      const motto=document.getElementById('brandMotto');
      if(motto&&!motto.hidden&&!motto.classList.contains('is-dissolving'))positionLogoMotto(motto);
    });
    function scatterLogoMotto(motto) {
      const bounds = motto.getBoundingClientRect();
      const source = document.createElement('canvas');
      source.width = Math.ceil(bounds.width);
      source.height = Math.ceil(Math.max(bounds.height,logoMottoHeight(motto)));
      const ink = source.getContext('2d', {willReadFrequently: true});
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!ink || !context || !source.width || !source.height) return;
      // Sample the actual letter positions so particles originate in the lettering.
      for (const line of motto.querySelectorAll('b, span')) {
        const style = getComputedStyle(line);
        ink.font = style.font;
        ink.fillStyle = style.color;
        ink.textBaseline = 'alphabetic';
        const text = line.firstChild;
        if (!text) continue;
        const range = document.createRange();
        for (let i = 0; i < text.length; i++) {
          range.setStart(text, i); range.setEnd(text, i + 1);
          const rect = range.getBoundingClientRect();
          ink.fillText(text.textContent[i], rect.left - bounds.left,
            rect.bottom - bounds.top - parseFloat(style.fontSize) * 0.18);
        }
      }
      const pixels = ink.getImageData(0, 0, source.width, source.height).data;
      const colors = ['#e86586', '#edb44b', '#53ba95', '#49b8db', '#a486df'];
      const width = window.innerWidth, height = window.innerHeight;
      const particles = [];
      for (let y = 0; y < source.height; y += 2) {
        for (let x = 0; x < source.width; x += 2) {
          const offset = (y * source.width + x) * 4;
          if (pixels[offset + 3] < 45) continue;
          const angle = Math.random() * Math.PI * 2;
          const originX = bounds.left + x, originY = bounds.top + y;
          const dx = Math.cos(angle), dy = Math.sin(angle);
          const edgeX = dx > 0 ? (width - originX) / dx : -originX / dx;
          const edgeY = dy > 0 ? (height - originY) / dy : -originY / dy;
          const distance = Math.min(edgeX, edgeY) * (0.75 + Math.random() * 0.4);
          particles.push({x: originX, y: originY, vx: dx * distance, vy: dy * distance,
            size: 0.7 + Math.random() * 1.1, delay: Math.random() * 0.18,
            color: colors[Math.floor(Math.random() * colors.length)]});
        }
      }
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      canvas.className = 'brand-motto-particles';
      canvas.setAttribute('aria-hidden', 'true');
      context.scale(ratio, ratio);
      document.body.append(canvas);
      const started = performance.now();
      function frame(now) {
        const progress = Math.min((now - started) / 1600, 1);
        context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
        for (const particle of particles) {
          const age = Math.max(0, progress - particle.delay) / (1 - particle.delay);
          const travel = 1 - Math.pow(1 - age, 2);
          context.globalAlpha = Math.min(1, (1 - age) / 0.45);
          context.fillStyle = particle.color;
          context.beginPath();
          context.arc(particle.x + particle.vx * travel,
            particle.y + particle.vy * travel,
            particle.size * (1 - progress * 0.6), 0, Math.PI * 2);
          context.fill();
        }
        if (progress < 1 && canvas.isConnected) requestAnimationFrame(frame);
      }
      frame(started);
      return canvas;
    }
    function hideLogoMotto(motto) {
      clearTimeout(logoHideTimer);
      guestLogo.setAttribute('aria-expanded', 'false');
      document.getElementById('home').style.removeProperty('--guest-motto-offset');
      logoTaps = 0;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        motto.hidden = true;
        return;
      }
      const particles = scatterLogoMotto(motto);
      motto.classList.add('is-dissolving');
      logoHideTimer = setTimeout(() => {
        motto.hidden = true;
        motto.classList.remove('is-dissolving');
        particles?.remove();
      }, 1600);
    }
    guestLogo?.addEventListener('click', () => {
      if(document.body.matches('.guest-home'))return;
      clearTimeout(logoReloadTimer);
      logoReloadTimer=setTimeout(reloadGuestHome,450);
      const motto = document.getElementById('brandMotto');
      if (!motto) return;
      if (motto.classList.contains('is-dissolving')) return;
      const now = Date.now();
      logoTaps = now - logoLastTap < 450 ? logoTaps + 1 : 1;
      logoLastTap = now;
      if (logoTaps < 3) return;
      clearTimeout(logoReloadTimer);
      if (motto.classList.contains('is-dissolving')) return;
      logoTaps = 0;
      guestLogo.setAttribute('aria-expanded', 'true');
      motto.hidden = false;
      positionLogoMotto(motto);
      clearTimeout(logoHideTimer);
      logoHideTimer = setTimeout(() => hideLogoMotto(motto), 3000);
    });
    let ownAccountFlight = null;
    function loadOwnAccount() {
      const actor = authUser?.id, generation = viewGen;
      if (ownAccountFlight?.actor === actor && ownAccountFlight.generation === generation) return ownAccountFlight.promise;
      const flight = { actor, generation };
      const valid = () => authUser?.id === actor && generation === viewGen && !viewAccount;
      flight.promise = accountFetch("/api/me/account").then((data) => { if (valid()) renderOwnAccount(data); }).catch((err) => {
        if (!valid()) return;
        const box = document.getElementById("ownAccount");
        if (box) box.innerHTML = '<p class="hint bad">' + esc(err.message) + '</p>';
      }).finally(() => { if (ownAccountFlight === flight) ownAccountFlight = null; });
      ownAccountFlight = flight;
      return flight.promise;
    }
