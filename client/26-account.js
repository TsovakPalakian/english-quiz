    function applyViewState(state) {
      authSyncLock = true;
      const added = Array.isArray(state.added) ? state.added : [];
      rememberAdded(hideStudentSongs() ? added.filter((card) => (card.place || "mine") !== "music") : added);
      songCache = hideStudentSongs() ? [] : (Array.isArray(state.songs) ? state.songs.slice() : []);
      try { localStorage.setItem(SONG_KEY, JSON.stringify(songCache)); } catch (e) {}
      localStorage.setItem(LEARNED_KEY, JSON.stringify(Array.isArray(state.learned) ? state.learned : []));
      localStorage.setItem(VARIANT_KEY, JSON.stringify(state.variants && typeof state.variants === "object" ? state.variants : {}));
      if (state.stats && state.stats.lyricSize) localStorage.setItem("enquiz-lyric-size", String(state.stats.lyricSize));
      else localStorage.removeItem("enquiz-lyric-size");
      const mistakeMap = {};
      const serverMistakes = state.stats && Array.isArray(state.stats.mistakes) ? state.stats.mistakes : [];
      serverMistakes.forEach((row) => {
        if (row && row.en && row.type && row.misses > 0) mistakeMap[String(row.en).toLowerCase() + "|" + row.type] = row;
      });
      localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeMap));
      if (state.stats && state.stats.demonstratives) localStorage.setItem("enquiz-demonstratives", JSON.stringify(state.stats.demonstratives));
      else localStorage.removeItem("enquiz-demonstratives");
      if (state.stats && state.stats.cardEdits) localStorage.setItem(EDIT_KEY, JSON.stringify(state.stats.cardEdits));
      else localStorage.removeItem(EDIT_KEY);
      installCardQuizzes(state.stats && state.stats.cardQuizzes);
      if (state.stats && state.stats.dayLinks) localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks));
      else localStorage.removeItem(LINK_KEY);
      installCustomThemes(!hideStudentSongs() && state.stats && Array.isArray(state.stats.customThemes) ? state.stats.customThemes : []);
      installHiddenLessons(state.stats && state.stats.hiddenLessons);
      installAllowedLessons(state.stats && state.stats.allowedLessons);
      const viewTheme = state.stats && typeof state.stats.theme === "string" ? state.stats.theme : "";
      applyTheme(viewTheme || DEFAULT_THEME, { sync: false });
      settleThemeAudience();
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
      paintAdded();
      paintLyrics();
      paintTexts();
      paintHomeStats();
      if (window.paintDemonstratives) window.paintDemonstratives();
      if (window.paintLmDays) window.paintLmDays();
      authSyncLock = false;
    }
    function rememberView(user) {
      viewAccount = {
        id: user.id,
        login: user.login || "",
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
        email: user.email || "",
        name: user.name || ""
      };
      viewGen += 1;
      localStorage.setItem("enquiz-view-id", viewAccount.id);
      localStorage.setItem("enquiz-view-login", viewAccount.login);
      localStorage.setItem("enquiz-view-role", viewAccount.role);
      localStorage.setItem("enquiz-view-email", viewAccount.email);
      localStorage.setItem("enquiz-view-name", viewAccount.name);
    }
    function forgetViewFlags() {
      ["enquiz-view-id", "enquiz-view-login", "enquiz-view-role", "enquiz-view-email", "enquiz-view-name"].forEach((key) => localStorage.removeItem(key));
    }
    function canOpenPages(user) {
      if (!user || !user.id || !authUser) return false;
      if (sessionIsDeveloper()) return user.role === "USER" || user.role === "ADMIN";
      return authUser.role === "ADMIN" && user.role === "USER";
    }
    function openStudentPages(user) {
      if (!canOpenPages(user)) return;
      if (viewAccount || viewSwitching) {
        alert("Exit the current pages first.");
        return;
      }
      // Flush teacher ops to /api/me/state before switching the sync target.
      return drainUserState().then(() => {
        accountReady = false;
        viewSwitching = true;
        syncQueue.length = 0;
        return stashDeveloper().then(() => {
          rememberView(user);
          examResetWork();
          examPullWork();
          const openedGen = viewGen;
          const openedId = user.id;
          refreshCatalog();
          paintViewBar();
          show("home");
          return accountFetch("/api/admin/users/" + encodeURIComponent(user.id) + "/state?summary=1").then((state) => {
            if (openedGen !== viewGen || !viewAccount || viewAccount.id !== openedId) {
              viewSwitching = false;
              return;
            }
            addedCache = null;
            applyViewState(state || {});
            viewSwitching = false;
            accountReady = true;
            lmPullFromServer();
            paintViewBar();
            paintTexts();
            show("home");
          }).catch((err) => {
            if (openedGen !== viewGen) {
              viewSwitching = false;
              return;
            }
            viewSwitching = false;
            return exitStudentPages().then(() => alert(err.message));
          });
        }).catch(() => {
          viewAccount = null;
          viewGen += 1;
          examResetWork();
          forgetViewFlags();
          const done = () => {
            viewSwitching = false;
            accountReady = !!authUser;
            alert("This browser could not switch pages. Your own pages are still here.");
          };
          // Only restore if we actually wrote a stash; otherwise LS is still the teacher and an orphan stash must not apply.
          if (stashOwned) {
            return restoreDeveloper().then(done).catch(() => {
              stashOwned = false;
              done();
            });
          }
          done();
        });
      }).catch((err) => {
        viewSwitching = false;
        accountReady = !!authUser;
        alert(err && err.message ? err.message : "Some changes could not be saved. Try again.");
      });
    }
    function exitStudentPages() {
      return drainUserState().then(() => {
        accountReady = false;
        viewSwitching = true;
        syncQueue.length = 0;
        // Keep viewAccount until stash is restored so stray paths cannot write teacher LS as /api/me.
        return restoreDeveloper().then(() => {
          viewAccount = null;
          viewGen += 1;
          examResetWork();
          examPullWork();
          forgetViewFlags();
          addedCache = null;
          lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
          // Reload lesson materials from restored LM_KEY after viewing.
          lmLibrary = null;
          lmState = null;
          applyLessonEdits();
          applySongEdits();
          refreshCatalog();
          paintLyrics();
          paintTexts();
          paintHomeStats();
          paintHomeAccount();
          paintAccount();
          applyTheme(currentTheme(), { sync: false, persist: false });
          settleThemeAudience();
          queueThemePhotos(loadCustomThemes());
          paintViewBar();
          viewSwitching = false;
          accountReady = !!authUser;
          show("home");
          if (window.paintLmDays) window.paintLmDays();
          lmPullFromServer();
          // Reconcile shared quizzes after restore: keep teacher local-only keys, prefer server elsewhere.
          return accountFetch("/api/me/state?summary=1").then((state) => {
            installCardQuizzes(state && state.stats && state.stats.cardQuizzes);
            if (cardQuizCanEdit()) {
              const server = plainCardQuizMap(state && state.stats && state.stats.cardQuizzes);
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
          }).catch(() => {});
        }).catch((err) => {
          if (err && err.stashApplied) {
            // Teacher LS already applied — clear viewAccount so we never write teacher data as the student.
            viewAccount = null;
            viewGen += 1;
            forgetViewFlags();
            viewSwitching = false;
            accountReady = !!authUser;
            paintViewBar();
          } else {
            viewSwitching = false;
            accountReady = false;
          }
          throw err || new Error("Could not restore your pages.");
        });
      }).catch((err) => {
        viewSwitching = false;
        if (!viewAccount) accountReady = !!authUser;
        alert(err && err.message ? err.message : "Some changes could not be saved. Try again.");
      });
    }
