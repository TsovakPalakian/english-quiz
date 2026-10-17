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
