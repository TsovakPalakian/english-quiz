    function pullAccountState() {
      if (!authUser || viewAccount || !accountReady || syncSending || syncQueue.length || accountPulling) return;
      accountPulling = true;
      accountFetch("/api/me/state?summary=1").then((state) => {
        if (viewAccount) return;
        const shared = applySharedStudy(state);
        if (!shared && !takeNewCards(state)) return;
        paintAdded();
        if (shared) {
          paintLyrics();
          refreshCatalog();
        }
        paintAllWords();
        paintHomeStats();
        paintHomeAccount();
      }).catch(() => {}).then(() => { accountPulling = false; });
    }
    function stopAccountPull() {
      clearInterval(accountPullTimer);
      accountPullTimer = 0;
    }
    function startAccountPull() {
      stopAccountPull();
    }
    function fillEmptyFromAccount(state) {
      if (!state) return;
      if (applySharedStudy(state)) {
        paintAdded();
        paintLyrics();
        refreshCatalog();
        paintHomeStats();
        paintHomeAccount();
      }
      takeNewCards(state);
      const savedSongs = Array.isArray(state.songs) ? state.songs : [];
      if (savedSongs.length) {
        const localSongs = loadSongs();
        const seen = {};
        localSongs.forEach((song) => { if (song && song.id) seen[song.id] = 1; });
        let changed = false;
        savedSongs.forEach((song) => {
          if (!song || !song.id || seen[song.id]) return;
          localSongs.push(song);
          seen[song.id] = 1;
          changed = true;
        });
        if (changed) writeSongs(localSongs);
      }
      const mistakes = loadMistakeMap();
      const savedMistakes = state.stats && Array.isArray(state.stats.mistakes) ? state.stats.mistakes : [];
      if (!Object.keys(mistakes).length && savedMistakes.length) {
        const map = {};
        savedMistakes.forEach((row) => {
          if (row && row.en && row.type && row.misses > 0) map[String(row.en).toLowerCase() + "|" + row.type] = row;
        });
        try { localStorage.setItem(MISTAKE_KEY, JSON.stringify(map)); } catch (e) {}
      }
      if (!loadLearned().size && Array.isArray(state.learned) && state.learned.length) {
        try { localStorage.setItem(LEARNED_KEY, JSON.stringify(state.learned)); } catch (e) {}
      }
      let localVariants = {};
      try { localVariants = JSON.parse(localStorage.getItem(VARIANT_KEY) || "{}") || {}; } catch (e) { localVariants = {}; }
      if (!Object.keys(localVariants).length && state.variants && Object.keys(state.variants).length) {
        try { localStorage.setItem(VARIANT_KEY, JSON.stringify(state.variants)); } catch (e) {}
      }
      if (state.stats && state.stats.lyricSize && !localStorage.getItem("enquiz-lyric-size")) {
        localStorage.setItem("enquiz-lyric-size", String(state.stats.lyricSize));
        lyricSize = Number(state.stats.lyricSize) || lyricSize;
      }
      if (state.stats && state.stats.demonstratives && !localStorage.getItem("enquiz-demonstratives")) {
        try { localStorage.setItem("enquiz-demonstratives", JSON.stringify(state.stats.demonstratives)); } catch (e) {}
        if (window.paintDemonstratives) window.paintDemonstratives();
      }
      let localEdits = {};
      try { localEdits = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}") || {}; } catch (e) { localEdits = {}; }
      if (!Object.keys(localEdits).length && state.stats && state.stats.cardEdits && Object.keys(state.stats.cardEdits).length) {
        try { localStorage.setItem(EDIT_KEY, JSON.stringify(state.stats.cardEdits)); } catch (e) {}
      }
      installCardQuizzes(state.stats && state.stats.cardQuizzes);
      // Only upload local-only words (missing on server). Never push a full local-wins
      // map on login — that can overwrite newer shared edits from another device.
      if (cardQuizCanEdit()) {
        const server = plainCardQuizMap(state.stats && state.stats.cardQuizzes);
        const local = loadCardQuizzes();
        const orphan = {};
        let hasOrphan = false;
        Object.keys(local).forEach((key) => {
          if (!Array.isArray(local[key]) || !local[key].length) return;
          if (key in server) return;
          orphan[key] = local[key];
          hasOrphan = true;
        });
        if (hasOrphan) syncChange({ op: "put-setting", key: "cardQuizzes", value: orphan });
      }
      let localLinks = {};
      try { localLinks = JSON.parse(localStorage.getItem(LINK_KEY) || "{}") || {}; } catch (e) { localLinks = {}; }
      if (!Object.keys(localLinks).length && state.stats && state.stats.dayLinks && Object.keys(state.stats.dayLinks).length) {
        try { localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks)); } catch (e) {}
      }
      installCustomThemes(
        state.stats && Array.isArray(state.stats.customThemes) && state.stats.customThemes.length
          ? state.stats.customThemes
          : loadCustomThemes()
      );
      installHiddenLessons(state.stats && state.stats.hiddenLessons);
      installAllowedLessons(state.stats && state.stats.allowedLessons);
      const pendingTheme = syncQueue.some((change) => change && change.op === "put-setting" && change.key === "theme");
      const savedTheme = state.stats && typeof state.stats.theme === "string" ? state.stats.theme : "";
      if (!pendingTheme && savedTheme) applyTheme(savedTheme, { sync: false, keepPainted: true });
      settleThemeAudience();
      paintAdded();
      paintLyrics();
      paintTexts();
      if (window.paintLmDays) window.paintLmDays();
      refreshCatalog();
      paintHomeStats();
      paintHomeAccount();
    }
    function applyAccountThemes(pack) {
      if (!pack || viewAccount) return;
      if (pack.accountId && pack.accountId !== authUser?.id) return;
      pack = Object.assign({}, pack, window.LearningMain?.themePreferences?.() || {});
      if (Array.isArray(pack.themes)) installCustomThemes(pack.themes.map((row) => Object.assign({}, row, { owner: authUser?.login || row.owner || "" })));
      if (typeof paintThemeSegs === "function") paintThemeSegs();
      const saved = typeof pack.theme === "string" ? pack.theme : "";
      if (saved) applyTheme(saved, { sync: false });
    }
    function loadAccountThemes() {
      if (viewAccount) return Promise.resolve(null);
      return accountFetch("/api/me/themes").then((pack) => pack).catch(() => null);
    }
    const idleLimit = 3 * 60 * 60 * 1000;
    let idleActor = "", idleRenewed = 0, idleFlight = false, idleExpiring = false;
    function expireIdleAccount() {
      if (idleExpiring) return;
      idleExpiring = true;
      localStorage.setItem('enquiz-idle-expired', '1');
      // Hide the previous screen immediately, including while offline cleanup runs.
      document.body.style.visibility = 'hidden';
      const logout = fetch('/api/logout', {method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(5000)}).catch(() => null);
      Promise.allSettled([logout, leaveAccount({signedOut:true})]).then(() => location.reload());
    }
    function accountIdleCheck(activity = false) {
      if (!authUser) { idleActor = ""; return; }
      if (idleExpiring) return;
      if (localStorage.getItem('enquiz-idle-expired')) { expireIdleAccount(); return; }
      const key = "enquiz-last-activity:" + authUser.id;
      const time = Date.now();
      let last = Number(localStorage.getItem(key)) || time;
      if (idleActor !== authUser.id) {
        idleActor = authUser.id;
        if (!localStorage.getItem(key)) localStorage.setItem(key, String(time));
      }
      if (time - last >= idleLimit) {
        expireIdleAccount();
        return;
      }
      if (!activity) return;
      localStorage.setItem(key, String(time));
      if (idleFlight || time - idleRenewed < 30000) return;
      idleFlight = true;
      fetch("/api/me/activity", { method: "POST", credentials: "same-origin" }).then(response => {
        if (response.status === 401) expireIdleAccount();
        else if (response.ok) idleRenewed = time;
      }).catch(() => {}).finally(() => { idleFlight = false; });
    }
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(type => {
      document.addEventListener(type, event => { if (event.isTrusted) accountIdleCheck(true); }, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) accountIdleCheck(); });
    window.addEventListener('pageshow', () => accountIdleCheck());
    window.addEventListener('storage', event => { if (event.key === 'enquiz-idle-expired') accountIdleCheck(); });
    setInterval(() => accountIdleCheck(), 15000);
    function initAccount() {
      const pendingId = localStorage.getItem("enquiz-view-id");
      const pendingLogin = localStorage.getItem("enquiz-view-login") || "";
      const pendingRole = localStorage.getItem("enquiz-view-role") || "";
      const pendingEmail = localStorage.getItem("enquiz-view-email") || "";
      const pendingName = localStorage.getItem("enquiz-view-name") || "";
      const ready = localStorage.getItem('enquiz-idle-expired') ? fetch('/api/logout', {method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(5000)}).then(response => {
        if (!response.ok) throw new Error('Session logout pending.');
        localStorage.removeItem('enquiz-idle-expired');
      }) : pendingId ? restoreDeveloper().then(() => {
        forgetViewFlags();
        addedCache = null;
      }) : Promise.resolve();
      ready.then(() => {
      const themesFlight = loadAccountThemes();
      return accountFetch("/api/me").then((data) => {
        accountChecked = true;
        if (!data.user) {
          const personal = localStorage.getItem(SONG_KEY) || localStorage.getItem(ADDED_KEY) || localStorage.getItem(LEARNED_KEY) || localStorage.getItem(MISTAKE_KEY) || localStorage.getItem(VARIANT_KEY) || localStorage.getItem(EDIT_KEY) || localStorage.getItem("enquiz-auth-on") || localStorage.getItem("enquiz-dev-stash") || localStorage.getItem("enquiz-view-id");
          if (personal) { leaveAccount(); return; }
          try { localStorage.removeItem(CUSTOM_THEME_KEY); localStorage.removeItem(THEME_PICTURE_KEY); } catch (e) {}
          settleThemeAudience();
          paintHomeAccount();
          finishPlace();
          return;
        }
        signedOutHello = false;
        authUser = data.user;
        const lastActivity = Number(localStorage.getItem('enquiz-last-activity:' + authUser.id));
        if (lastActivity && Date.now() - lastActivity >= idleLimit) { expireIdleAccount(); return; }
        paintHomeHello();
        paintDeveloperChrome();
        localStorage.setItem("enquiz-auth-on", "1");
        paintAccount();
        examPreload();
        groupPull();
        themesFlight.then((pack) => applyAccountThemes(pack)).then(() => accountFetch("/api/me/state?summary=1")).then((state) => {
          fillEmptyFromAccount(state);
          accountReady = true;
          paintGuestAccess();
          paintThemeSegs();
          startAccountPull();
          const lessonsReady = lmPullFromServer();
          if (syncQueue.length) scheduleStateSave();
          if (pendingId && data.user && (data.user.role === "DEVELOPER" || (data.user.role === "ADMIN" && pendingRole === "USER"))) openStudentPages({ id: pendingId, login: pendingLogin, role: pendingRole, email: pendingEmail, name: pendingName });
          else Promise.resolve(lessonsReady).then(() => finishPlace());
        }).catch(() => {
          accountReady = !!(loadAdded().length || loadSongs().length);
          if (syncQueue.length) scheduleStateSave();
          finishPlace();
        });
      }).catch(() => { accountChecked = true; paintHomeAccount(); finishPlace(); });
      }).catch(() => leaveAccount({signedOut:true}));
    }
