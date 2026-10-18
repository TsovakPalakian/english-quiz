    function viewKeys() {
      // Personal browser keys swapped while viewing another account.
      // CARD_QUIZ_KEY is stashed separately: shared install overwrites it during view, then restore brings the teacher's local map back.
      // LM_KEY must stash too — otherwise lmPullFromServer overwrites local drafts while viewing.
      return [ADDED_KEY, SONG_KEY, LEARNED_KEY, VARIANT_KEY, MISTAKE_KEY, "enquiz-lyric-size", "enquiz-demonstratives", EDIT_KEY, CUSTOM_THEME_KEY, THEME_PICTURE_KEY, THEME_KEY, TEXT_KEY, HIDDEN_LESSONS_KEY, ALLOWED_LESSONS_KEY, LINK_KEY, STARTED_KEY, LM_KEY];
    }
    function stashDeveloper() {
      // Always refresh stash from current keys so an orphan IDB stash cannot restore stale teacher data.
      const snap = {};
      viewKeys().forEach((key) => { snap[key] = localStorage.getItem(key); });
      snap[CARD_QUIZ_KEY] = localStorage.getItem(CARD_QUIZ_KEY);
      Object.keys(songBlobUrls).forEach(forgetBlobUrl);
      return idbPutStash(snap).then(() => {
        stashOwned = true;
        viewKeys().forEach((key) => localStorage.removeItem(key));
        addedCache = null;
        lmLibrary = null;
        lmState = null;
        localStorage.removeItem("enquiz-dev-stash");
        // Drop shared song blobs/overflow so Open pages cannot play/write colliding ids.
        return clearMediaStore(["files", "songs", "added"]);
      });
    }
    function applyStash(snap) {
      if (!snap) return;
      viewKeys().forEach((key) => {
        if (snap[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, snap[key]);
      });
      if (Object.prototype.hasOwnProperty.call(snap, CARD_QUIZ_KEY)) {
        if (snap[CARD_QUIZ_KEY] == null) localStorage.removeItem(CARD_QUIZ_KEY);
        else localStorage.setItem(CARD_QUIZ_KEY, snap[CARD_QUIZ_KEY]);
      }
      addedCache = null;
    }
    function restoreDeveloper() {
      const raw = localStorage.getItem("enquiz-dev-stash");
      let legacy = null;
      if (raw != null) {
        try { legacy = JSON.parse(raw) || {}; } catch (e) { legacy = {}; }
      }
      Object.keys(songBlobUrls).forEach(forgetBlobUrl);
      let applied = false;
      return idbGetStash().then((snap) => {
        const use = snap || legacy;
        if (!use) {
          const err = new Error("Could not restore your pages.");
          err.code = "NO_STASH";
          throw err;
        }
        applyStash(use);
        applied = true;
        localStorage.removeItem("enquiz-dev-stash");
        return Promise.all([idbDeleteStash(), clearMediaStore(["files", "songs", "added"])]).then(() => {
          stashOwned = false;
        });
      }).catch((err) => {
        if (err && typeof err === "object") err.stashApplied = applied;
        throw err || new Error("Could not restore your pages.");
      });
    }
    function paintViewBar() {
      let bar = document.getElementById("viewBar");
      if (!viewAccount) {
        if (bar) bar.remove();
        paintSongGate();
        return;
      }
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "viewBar";
        bar.className = "view-bar";
        document.body.insertBefore(bar, document.body.firstChild);
      }
      bar.innerHTML = "<span>Viewing " + esc(viewAccount.login) + "</span>" +
        '<button class="btn" type="button" data-account="exit-view">Exit</button>';
      paintSongGate();
    }
    function paintSongGate() {
      const hide = hideStudentSongs();
      document.querySelectorAll('[data-jump="music"]').forEach((el) => { el.hidden = hide; });
      document.querySelectorAll('[data-jump="texts"], [data-jump="themes"], [data-theme-cycle], [data-page-study], [data-all-study], [data-deck-study], [data-add-study], [data-verb-study], [data-song-study], #homeStudy, #homeStudyAlt').forEach(el => {
        if (hide) { if (!Object.hasOwn(el.dataset, "teacherViewHidden")) el.dataset.teacherViewHidden = el.hidden ? "1" : "0"; el.hidden = true; }
        else if (Object.hasOwn(el.dataset, "teacherViewHidden")) { el.hidden = el.dataset.teacherViewHidden === "1"; delete el.dataset.teacherViewHidden; }
      });
      if (hide) applyTheme(DEFAULT_THEME, { sync: false, persist: false });
      paintDeveloperChrome();
    }
    function paintDeveloperChrome() {
      if (archivePreviewContext && (archivePreviewContext.actor !== authUser?.id || archivePreviewContext.generation !== viewGen || viewAccount)) closeArchivePreview();
      const allow = isDeveloper();
      const student = !!(authUser && authUser.role === "USER" && !viewAccount);
      const staff = !!(authUser && ["ADMIN", "DEVELOPER"].includes(authUser.role) && !viewAccount);
      document.querySelectorAll("[data-developer-only]").forEach((el) => { el.hidden = !allow; });
      document.querySelectorAll('[data-teacher-only]').forEach(el => { el.hidden = !isTeacher() || !!viewAccount; });
      document.querySelectorAll("[data-nav-role]").forEach((el) => {
        const role = el.dataset.navRole;
        el.hidden = role === "student" ? !student : role === "staff" ? !staff : false;
      });
      refreshAccountsCount();
      document.querySelectorAll("[data-archive-only]").forEach((el) => { el.hidden = !authUser || !!viewAccount; });
    }
