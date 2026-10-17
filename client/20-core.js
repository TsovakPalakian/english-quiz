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
      document.querySelectorAll("[data-developer-only]").forEach((el) => { el.hidden = !allow; });
      document.querySelectorAll('[data-teacher-only]').forEach(el => { el.hidden = !isTeacher() || !!viewAccount; });
      refreshAccountsCount();
      document.querySelectorAll("[data-archive-only]").forEach((el) => { el.hidden = !authUser || !!viewAccount; });
    }
    function archiveLabel(type) {
      return { lesson: "Lessons", group: "Groups", exam: "Exams", "exam-block": "Examination blocks", card: "Cards", song: "Songs", text: "Texts" }[type] || "Other";
    }
    let archivePaintToken = 0;
    function paintArchive() {
      const box = document.getElementById("archiveList");
      if (!box || !authUser || viewAccount || !window.LearningMain) return;
      const token = ++archivePaintToken, actor = authUser.id, generation = viewGen;
      const render = (data) => {
        if (token !== archivePaintToken || authUser?.id !== actor || generation !== viewGen || viewAccount) return;
        const items = Array.isArray(data && data.items) ? data.items : [];
        if (!items.length) { box.innerHTML = '<p class="hint">Archive is empty.</p>'; return; }
        const groups = {};
        items.forEach((item) => { (groups[item.type] || (groups[item.type] = [])).push(item); });
        box.innerHTML = Object.keys(groups).map((type) => '<div class="archive-group"><h2 class="lib-h">' + esc(archiveLabel(type)) + '</h2>' + groups[type].map((item) => {
          const when = item.archivedAt ? new Date(item.archivedAt * 1000).toLocaleString() : "";
          const hidden = item.teacherHiddenAt ? " · hidden from teachers" : "";
          const token = esc(type + ":" + item.id), removeLabel = isDeveloper() ? "Delete permanently" : "Remove from archive";
          const icon = (path) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
          const tools = '<div class="day-tools"><button class="day-hide" type="button" data-archive-restore="' + token + '" aria-label="Restore" title="Restore">' + icon('<path d="M3 10a9 9 0 1 1 2.7 8M3 4v6h6"/>') + '</button><button class="day-del" type="button" data-archive-remove="' + token + '" aria-label="' + removeLabel + '" title="' + removeLabel + '">' + icon('<path d="M3 6h18M5 6v14h14V6M9 6V3h6v3M10 10v6M14 10v6"/>') + '</button></div>';
          const label = 'Deleted by ' + (item.archivedByName || item.archivedBy || "unknown") + (when ? " · " + when : "") + hidden;
          return examRow(lmDateChip(item.archivedAt ? new Date(item.archivedAt * 1000).toISOString().slice(0,10) : ""), item.title || "Untitled", label, 'data-archive-open="' + token + '"', false, false, tools);
        }).join("") + "</div>").join("");
      };
      const cached = window.LearningMain.archiveSnapshot?.();
      if (cached) render(cached);
      else box.innerHTML = '<p class="hint">Loading…</p>';
      return window.LearningMain.archiveList().then(render).catch((error) => {
        if (token === archivePaintToken && authUser?.id === actor && generation === viewGen) box.innerHTML = '<p class="hint">' + esc(error.message) + "</p>";
      });
    }
    function archiveAction(action, raw) {
      const split = String(raw || "").indexOf(":"), type = String(raw || "").slice(0, split), id = String(raw || "").slice(split + 1);
      if (split < 1 || !id || !window.LearningMain) return;
      let password = "";
      if (action === "remove" && authUser && authUser.role === "ADMIN") {
        password = prompt("Enter your password to remove this material from the teachers' archive:") || "";
        if (!password) return;
      }
      if (action === "remove" && isDeveloper() && !confirm("Delete this material permanently? This cannot be undone.")) return;
      window.LearningMain.perform(async () => {
        viewCache.delete('archive:' + raw);
        if (action === "restore") await window.LearningMain.restoreArchive(type, id);
        else await window.LearningMain.removeArchive(type, id, password);
        paintArchive();
      });
    }
    document.addEventListener("click", (event) => {
      const open = event.target.closest("[data-archive-open]");
      if (open) { void openArchivePreview(open.dataset.archiveOpen, open); return; }
      if (event.target.closest("[data-archive-close]")) closeArchivePreview();
      const restore = event.target.closest("[data-archive-restore]"), remove = event.target.closest("[data-archive-remove]");
      if (restore) archiveAction("restore", restore.dataset.archiveRestore);
      if (remove) archiveAction("remove", remove.dataset.archiveRemove);
    });
    let archivePreviewContext = null;
    function closeArchivePreview() {
      const trigger = archivePreviewContext?.trigger; archivePreviewContext = null;
      const dialog = document.getElementById("archivePreviewDialog"); if (dialog) dialog.hidden = true;
      const body = document.getElementById("archivePreviewBody"); if (body) body.innerHTML = "";
      if (trigger?.isConnected) trigger.focus();
    }
    async function openArchivePreview(raw, trigger) {
      if (!authUser || viewAccount || !window.LearningMain) return;
      const [type, id] = String(raw).split(":"), job = archivePreviewContext = { actor: authUser.id, generation: viewGen, trigger, raw };
      const dialog = document.getElementById("archivePreviewDialog"), body = document.getElementById("archivePreviewBody");
      document.getElementById("archivePreviewTitle").textContent = trigger.querySelector("b:not(.date b)")?.textContent || "Archived material";
      dialog.hidden = false; body.innerHTML = '<p class="hint">Loading…</p>'; dialog.querySelector('[aria-label="Close"]').focus();
      try {
        const name = 'archive:' + raw, key = job.actor + ':' + job.generation, hit = viewCache.get(name);
        const data = hit && hit.key === key ? hit.data : await window.LearningMain.archivePreview(type, id);
        viewCache.delete(name); viewCache.set(name, { key, data });
        while (viewCache.size > 50) viewCache.delete(viewCache.keys().next().value);
        if (archivePreviewContext !== job || authUser?.id !== job.actor || viewGen !== job.generation || viewAccount) return;
        const media = '/api/archive/media?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id);
        document.getElementById("archivePreviewTitle").textContent = data.title || "Archived material";
        body.innerHTML = (data.documents || []).map(doc => '<article class="lm-read"><h3>' + esc(doc.title || "") + '</h3><p>' + esc(doc.description || "") + '</p>' + (doc.blocks || []).map(part => {
          const block = { ...part };
          if (part.fileId || part.localMediaKey || !part.remoteUrl && !part.sample && (part.hasFile || part.name) && ['image','audio','pronunciation','pdf','file'].includes(part.type)) { block.archiveMediaUrl = new URL(media + '&fileId=' + encodeURIComponent(part.fileId || part.id), location.origin).href; delete block.fileId; }
          return '<div class="lm-panel">' + lmPreviewBlock(block) + '</div>';
        }).join("") + '</article>').join("");
        if (data.content) {
          const content = data.content;
          body.innerHTML += '<article class="lm-read"><p>' + esc(content.artist || "") + '</p>' + (data.hasMedia ? '<audio controls src="' + esc(media) + '"></audio>' : '') + (content.video ? videoHtml(content.video) : '') + (content.music ? musicHtml(content.music) : '') + '<div class="lm-copy">' + (type === "song" ? '<pre class="archive-text">' + esc(content.lyrics || "") + '</pre>' : lmClean(content.html || content.text || "")) + '</div></article>';
        }
        if (!body.innerHTML) body.innerHTML = '<p class="hint">No materials in this archived item.</p>';
        body.querySelectorAll('input,textarea,select').forEach(el => { el.disabled = true; });
        body.querySelectorAll('button').forEach(button => {
          if (button.matches('[data-ex-check],[data-quiz-check]')) { button.remove(); return; }
          const replacement = document.createElement('div'); replacement.className = button.className; replacement.innerHTML = button.innerHTML; button.replaceWith(replacement);
        });
        body.querySelectorAll('[data-read],[data-quiz-score],[data-response]').forEach(el => { delete el.dataset.read; delete el.dataset.quizScore; delete el.dataset.response; });
      } catch (error) { if (archivePreviewContext === job) body.innerHTML = '<p class="hint bad">' + esc(error.message) + '</p>'; }
    }
    document.addEventListener('learning-archive-changed', () => closeArchivePreview());
    document.addEventListener('keydown', event => {
      const dialog = document.getElementById('archivePreviewDialog'); if (!dialog || dialog.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeArchivePreview(); }
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button,a[href],audio,video,input,textarea')].filter(el => !el.disabled && el.getClientRects().length), first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    function bugWhen(ms, zone) {
      const time = Number(ms);
      if (!time) return "";
      const timeZone = zone || "UTC";
      try {
        const shown = new Intl.DateTimeFormat("en-GB", {
          timeZone: timeZone, day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          hourCycle: "h23", timeZoneName: "shortOffset"
        }).format(new Date(time));
        return timeZone === "UTC" ? shown : shown + " " + timeZone;
      } catch (e) {
        return new Date(time).toISOString() + " UTC";
      }
    }
    async function copyBugBody(button) {
      const item = button && button.closest(".bug-item");
      const detail = item && item.querySelector(".bug-detail");
      const text = detail ? detail.textContent : "";
      if (!text) return;
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
          const area = document.createElement("textarea");
          area.value = text;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
          area.remove();
        }
        button.textContent = "✓";
        setTimeout(() => { if (button.isConnected) button.textContent = "⧉"; }, 1200);
      } catch (e) {
        button.title = "Copy failed";
      }
    }
    function bugListHtml(rows, canResolve) {
      if (!rows.length) return '<p class="sub">No bugs yet.</p>';
      const ordered = rows.slice().sort((a, b) => {
        const fixed = Number(!!a.resolved) - Number(!!b.resolved);
        if (fixed) return fixed;
        const date = (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0);
        if (date) return date;
        return (Number(b.hits) || 0) - (Number(a.hits) || 0);
      });
      return ordered.map((row, index) => {
        const hits = Math.max(1, Number(row.hits) || 1);
        const who = (row.accounts || []).filter(Boolean).join(", ") || "Unknown account";
        const zone = row.timeZone || "UTC";
        const when = row.when || bugWhen(row.lastAt, zone);
        const first = row.firstWhen || bugWhen(row.firstAt, zone);
        const place = (() => {
          const raw = row.request && row.request.url ? String(row.request.url) : (row.path || "");
          const [path, query] = raw.split("#")[0].split("?");
          return ((row.method || "") + " " + path + (query ? "?" + query : "")).trim();
        })();
        const happened = ((row.status || row.status === 0 ? String(row.status) + " " : "") + (row.error || "")).trim();
        const ctx = row.request && row.request.context && typeof row.request.context === "object" ? row.request.context : {};
        const app = ctx.application && typeof ctx.application === "object" ? ctx.application : {};
        const headers = row.request && row.request.headers && typeof row.request.headers === "object" ? row.request.headers : {};
        const history = Array.isArray(row.request && row.request.history) ? row.request.history : [];
        const earlier = history.map((item) => [bugWhen(item && item.at, zone), item && item.url, item && item.body].filter(Boolean).join(" ")).join("\n");
        const detail = [
          "Bug ID: " + (row.id || ""), "Where: " + place, "What happened: " + happened, "Account: " + who, ctx.role ? "Role: " + ctx.role : "",
          app.name ? "Application: " + app.name : "", app.service ? "Service: " + app.service : "",
          app.deploymentId ? "Deployment ID: " + app.deploymentId : "", app.deploymentTag ? "Deployment tag: " + app.deploymentTag : "",
          app.deployedAt ? "Deployed: " + app.deployedAt : "", app.host ? "Host: " + app.host : "",
          "Count: " + hits, "Last: " + when, "First: " + first, ctx.screen ? "Screen: " + ctx.screen : "",
          ctx.href ? "Page: " + ctx.href : "", (ctx.userAgent || headers["user-agent"]) ? "Browser: " + (ctx.userAgent || headers["user-agent"]) : "",
          ctx.language ? "Language: " + ctx.language : "", ctx.viewport ? "Viewport: " + ctx.viewport : "",
          typeof ctx.online === "boolean" ? "Online: " + (ctx.online ? "yes" : "no") : "",
          ctx.stack ? "Stack:\n" + ctx.stack : "", earlier ? "Earlier:\n" + earlier : "",
          "", "Request", JSON.stringify(row.request || {}, null, 2), "", "Response", JSON.stringify(row.response || {}, null, 2)
        ].filter(Boolean).join("\n");
        const stamp = when ? '<small style="display:block;font-size:11px;font-weight:400">' + esc(when) + "</small>" : "";
        const caption = esc(happened) + " · " + esc(who) + stamp;
        const route = ((row.method || "") + " " + (row.path || "")).trim();
        const resolve = canResolve ? '<button class="day-hide bug-resolve" type="button" data-bug-resolve="' + esc(row.id) + '" aria-label="Resolve bug" title="Resolve bug">✓</button>' : "";
        const copy = '<button class="day-edit bug-copy" type="button" data-bug-copy="' + esc(row.id) + '" aria-label="Copy bug body" title="Copy bug body">⧉</button>';
        return '<div class="bug-item' + (row.resolved ? " is-fixed" : "") + '"><div class="day-row"><button class="day" type="button" data-bug="' + esc(row.id) + '"><span class="date"><b>' + (index + 1) + '</b><small>×' + hits + '</small></span><b>' + esc(route || place) + '</b><span class="label about">' + caption + '</span></button><div class="day-tools">' + resolve + copy + '</div></div><pre class="bug-detail" hidden>' + esc(detail) + "</pre></div>";
      }).join("");
    }
    let bugTab = "open";
    let bugCache = null;
    function paintBugs(preset) {
      const box = document.getElementById("bugList");
      if (!box) return;
      const draw = (rows) => {
        const shown = rows.filter((row) => bugTab === "done" ? row.resolved : !row.resolved);
        box.innerHTML = bugListHtml(shown, bugTab !== "done");
      };
      const onBugs = () => (document.querySelector("section.on") || {}).id === "bugs";
      if (Array.isArray(preset)) { draw(preset); return; }
      if (!isDeveloper()) return;
      if (bugCache) {
        draw(bugCache);
        accountFetch("/api/bugs?heads=1").then((data) => {
          if (!onBugs()) return;
          const heads = (data && data.heads) || [];
          const known = new Map(bugCache.map((row) => [row.id, row]));
          const need = [];
          heads.forEach((head) => {
            const row = known.get(head.id);
            if (!row || row.hits !== head.hits || !!row.resolved !== !!head.resolved) need.push(head.id);
          });
          const live = new Set(heads.map((head) => head.id));
          bugCache = bugCache.filter((row) => live.has(row.id));
          if (!need.length) { draw(bugCache); return; }
          return accountFetch("/api/bugs?ids=" + need.map((id) => encodeURIComponent(id)).join(",")).then((full) => {
            const map = new Map(bugCache.map((row) => [row.id, row]));
            ((full && full.bugs) || []).forEach((row) => map.set(row.id, row));
            bugCache = heads.map((head) => map.get(head.id)).filter(Boolean);
            if (onBugs()) draw(bugCache);
          });
        }).catch(() => {});
        return;
      }
      box.innerHTML = '<p class="sub">Loading…</p>';
      accountFetch("/api/bugs").then((data) => {
        if (!onBugs()) return;
        bugCache = (data && data.bugs) || [];
        draw(bugCache);
      }).catch(() => {
        if (onBugs()) box.innerHTML = '<p class="sub">The bug list could not be loaded.</p>';
      });
    }
    window.paintBugs = paintBugs;
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
