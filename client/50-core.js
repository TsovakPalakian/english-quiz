    const TEXT_KEY = "enquiz-texts";
    let openTextId = "";
    function loadTexts() {
      try { return JSON.parse(localStorage.getItem(TEXT_KEY) || "[]"); }
      catch (e) { return []; }
    }
    function textsApiPath(forId) {
      if (forId) return "/api/admin/users/" + encodeURIComponent(forId) + "/texts";
      if (viewAccount && viewAccount.id) return "/api/admin/users/" + encodeURIComponent(viewAccount.id) + "/texts";
      return "/api/texts";
    }
    function writeTexts(list) {
      localStorage.setItem(TEXT_KEY, JSON.stringify(list));
      paintTextCount();
      if (authUser && !viewSwitching && accountReady) {
        const forId = viewAccount && viewAccount.id ? viewAccount.id : "";
        const path = textsApiPath(forId);
        const payload = JSON.stringify({ texts: list });
        textsInFlight = textsInFlight.catch(() => {}).then(() =>
          accountFetch(path, { method: "PUT", body: payload })
        );
        // Keep the chain rejectable for drainUserState; do not swallow here.
      }
    }
    function paintTextCount() {
      const node = document.getElementById("textCount");
      const n = loadTexts().length;
      if (node) node.textContent = String(n);
      const title = document.querySelector("#texts h1");
      if (title) title.textContent = "Text · " + n;
    }
    function mergeTextLists(local, remote) {
      const map = new Map();
      (local || []).forEach((item) => { if (item && item.id) map.set(item.id, item); });
      (remote || []).forEach((item) => {
        if (!item || !item.id) return;
        const have = map.get(item.id);
        if (!have || String(item.updatedAt || "") >= String(have.updatedAt || "")) map.set(item.id, item);
      });
      return Array.from(map.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    }
    function textWordKeys(text) {
      const found = String(text || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || [];
      const keys = [];
      const seen = new Set();
      found.forEach((word) => {
        const key = word.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        keys.push(key);
      });
      return keys;
    }
    function textAbout(item) {
      const learnedSet = loadLearned();
      const keys = textWordKeys(item && item.text);
      let learned = 0;
      keys.forEach((key) => { if (learnedSet.has(key)) learned += 1; });
      const expressions = item && item.analysis && item.analysis.expressions ? item.analysis.expressions : [];
      let fresh = 0;
      let phrasal = 0;
      let idioms = 0;
      expressions.forEach((expr) => {
        if (expr.type === "PHRASAL_VERB") phrasal += 1;
        else if (expr.type === "IDIOM") idioms += 1;
        if (expressionSaved(expr)) fresh += 1;
      });
      return statsLine({ words: keys.length, fresh: fresh, learned: learned, left: Math.max(0, keys.length - learned), phrasal: phrasal, idioms: idioms });
    }
    function renderTextList() {
      paintTextCount();
      const box = document.getElementById("textList");
      if (!box) return;
      const list = loadTexts();
      if (!list.length) {
        box.innerHTML = "<p class=\"hint\">No texts yet.</p>";
        return;
      }
      box.innerHTML = list.map((item, index) => songRow(index + 1, item.title || "Text", "", textAbout(item), 'data-text-open="' + esc(item.id) + '"')).join("");
    }
    function paintTexts() {
      renderTextList();
      if (!authUser || viewSwitching || !accountReady) return;
      const forId = viewAccount ? viewAccount.id : "";
      const gen = viewGen;
      accountFetch(textsApiPath(forId)).then((data) => {
        if (gen !== viewGen || viewSwitching || !accountReady) return;
        const stillViewing = !!(viewAccount && viewAccount.id === forId);
        if (forId && !stillViewing) return;
        if (!forId && viewAccount) return;
        const remote = Array.isArray(data.texts) ? data.texts : [];
        // Always merge so an in-flight local write is not wiped by a stale GET.
        const merged = mergeTextLists(loadTexts(), remote);
        localStorage.setItem(TEXT_KEY, JSON.stringify(merged));
        renderTextList();
      }).catch(() => {});
    }
    function openTextEditor(item) {
      openTextId = item && item.id ? item.id : "";
      document.getElementById("textEditTitle").textContent = openTextId ? "Edit text" : "Add a text";
      document.getElementById("textTitle").value = item && item.title ? item.title : "";
      document.getElementById("textBody").value = item && item.text ? item.text : "";
      window.TextColors?.mount(document.getElementById('textBody'));window.TextColors?.sync(document.getElementById('textBody'),item?.colorText);
      document.getElementById("textStatus").textContent = "";
      show("textedit");
    }
    function storeText(analyze) {
      const title = document.getElementById("textTitle").value.trim();
      const text = keepTextBreaks(document.getElementById("textBody").value).trim();
      const status = document.getElementById("textStatus");
      if (!title || !text) {
        status.textContent = "Add a title and a text.";
        return;
      }
      if (text.length > 2000000) {
        status.textContent = "That text is too long (" + text.length + " characters). Limit is 2000000.";
        return;
      }
      const list = loadTexts();
      let item = openTextId ? list.find((row) => row.id === openTextId) : null;
      if (!item) {
        item = { id: Math.random().toString(36).slice(2, 10), title: title, text: text, analysis: null };
        list.unshift(item);
      }
      if (item.text !== text) item.analysis = null;
      item.title = title;
      item.text = text;
      item.updatedAt = new Date().toISOString();
      openTextId = item.id;
      writeTexts(list);
      if (!analyze) {
        status.textContent = "Saved.";
        showText(item.id);
        return;
      }
      status.textContent = "Analyzing…";
      runTextAnalysis(item, status);
    }
    function showText(id) {
      const item = loadTexts().find((row) => row.id === id);
      if (!item) { show("texts"); return; }
      openTextId = id;
      document.getElementById("textReadTitle").textContent = item.title;
      paintTextBody(item.text);
      window.TextColors?.paintValue(document.getElementById('textReadBody'),item.text,item.colorText);
      const count = item.analysis && item.analysis.expressions ? item.analysis.expressions.length : 0;
      document.getElementById("textReadStatus").textContent = item.analysis ? count + " expressions. The whole text was checked." : "";
      paintExpressions(item);
      visit("textread");
      fitTextBody();
    }
    function keepTextBreaks(text) {
      return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u2028|\u2029/g, "\n");
    }
    function paintTextBody(text) {
      const body = document.getElementById("textReadBody");
      const more = document.getElementById("textReadMore");
      body.textContent = keepTextBreaks(text);
      body.classList.add("collapsed");
      more.hidden = true;
      more.textContent = "Show the rest";
    }
    function fitTextBody() {
      const body = document.getElementById("textReadBody");
      const more = document.getElementById("textReadMore");
      const overflow = body.scrollHeight > body.clientHeight + 1;
      if (!overflow) body.classList.remove("collapsed");
      more.hidden = !overflow;
    }
    function expressionHead(canonical) {
      const raw = String(canonical || "").trim();
      const head = raw.split(" + ")[0].trim();
      return head || raw;
    }
    function expressionIdentity(expr) {
      return (expr.canonicalForm || expressionHead(expr.exactText) || "").toLowerCase() + "|" + (expr.type || "");
    }
    function addedExpressionIdentity(row) {
      if (row && row.expressionKey) return String(row.expressionKey).toLowerCase();
      const form = row && row.data && row.data.grammar && row.data.grammar.form;
      if (!form) return "";
      const type = row.place === "phrasal" ? "PHRASAL_VERB" : row.place === "idioms" ? "IDIOM" : (row.expressionType || "");
      return String(form).toLowerCase() + "|" + type;
    }
    function uniqueExpressions(list) {
      const seen = new Set();
      return (list || []).filter((expr) => {
        const key = expressionIdentity(expr);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    function paintExpressions(item) {
      const box = document.getElementById("textExpressions");
      const rows = item.analysis && item.analysis.expressions ? item.analysis.expressions : [];
      if (!rows.length) {
        box.innerHTML = "";
        return;
      }
      box.innerHTML = rows.map((expr, index) => {
        const pct = (value) => Math.round((Number(value) || 0) * 100) + "%";
        const reverso = "https://context.reverso.net/translation/english-russian/" + encodeURIComponent(expressionHead(expr.canonicalForm) || expr.exactText || "");
        const children = (expr.children || []).map((child) => esc(child.canonicalForm || child.exactText)).join(", ");
        const times = expr.occurrences && expr.occurrences.length > 1 ? expr.occurrences.length : 0;
        const saved = expressionSaved(expr);
        return "<article class=\"card expression-card" + (saved ? " expression-added" : "") + "\" style=\"margin-bottom:10px\">"
          + "<div class=\"expression-fold\"><b>" + esc(expr.exactText || "") + "</b>"
          + expressionCardButton(expr, index) + "</div>"
          + "<div class=\"expression-more\">"
          + (times ? "<p class=\"hint\">Found " + times + " times.</p>" : "")
          + "<p class=\"hint\">Type: " + esc(expr.type || "") + "</p>"
          + "<p class=\"hint\">Canonical form: " + esc(expr.canonicalForm || "") + "</p>"
          + "<p>" + esc(expr.meaning || "") + "</p>"
          + "<p class=\"hint\">Context: " + esc(expr.context || "") + "</p>"
          + "<p class=\"hint\">Confidence " + pct(expr.confidence) + " · Usefulness " + pct(expr.usefulnessScore) + "</p>"
          + (children ? "<p class=\"hint\">Related: " + children + "</p>" : "")
          + "<div class=\"row\"><a class=\"btn\" href=\"" + reverso + "\" target=\"_blank\" rel=\"noopener\">Open in Reverso</a></div>"
          + "</div></article>";
      }).join("");
    }
    function runTextAnalysis(item, status) {
      accountFetch("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ text: item.text, contentType: "TEXT" })
      }).then((result) => {
        const list = loadTexts();
        const saved = list.find((row) => row.id === item.id);
        if (saved) {
          saved.analysis = { expressions: uniqueExpressions(result.expressions || []), stats: result.stats || null, at: new Date().toISOString() };
          writeTexts(list);
        }
        if (status) status.textContent = (result.expressions || []).length + " expressions.";
        showText(item.id);
      }).catch((error) => {
        if (status) status.textContent = error.message || "Analysis service temporarily unavailable.";
      });
    }
    function expressionPlace(expr) {
      if (!expr) return "text";
      if (expr.type === "PHRASAL_VERB") return "phrasal";
      if (expr.type === "IDIOM") return "idioms";
      return "text";
    }
    function expressionDeckName(place, fromText) {
      if (fromText && (!place || place === "mine")) return "Text";
      return PLACE_LABEL[place] || "My cards";
    }
    function findExpressionCard(expr) {
      const place = expressionPlace(expr);
      const word = expressionHead(expr.canonicalForm) || expr.exactText || "";
      const key = expressionIdentity(expr);
      if (!word) return null;
      return loadAdded().find((row) => ((row.place || "mine") === place || (place === "text" && row.fromText && (row.place || "mine") === "mine")) && (addedExpressionIdentity(row) === key || String(row.word || "").toLowerCase() === word.toLowerCase())) || null;
    }
    function expressionSaved(expr) {
      return !!findExpressionCard(expr);
    }
    function expressionCardButton(expr, index) {
      const place = expressionPlace(expr);
      const saved = findExpressionCard(expr);
      const deck = expressionDeckName(place, !!(saved && saved.fromText));
      if (saved) return "<button class=\"btn ok\" type=\"button\" data-text-open-card=\"" + index + "\">In " + esc(deck) + "</button>";
      return "<button class=\"btn primary\" type=\"button\" data-text-card=\"" + index + "\">Add to Cards</button>";
    }
    function markExpressionButton(button, place, fromText) {
      if (!button) return;
      const index = button.getAttribute("data-text-card") || button.getAttribute("data-text-open-card");
      button.textContent = "In " + expressionDeckName(place, fromText);
      button.disabled = false;
      button.classList.remove("primary");
      button.classList.add("ok");
      button.removeAttribute("data-text-card");
      if (index != null) button.setAttribute("data-text-open-card", index);
      const article = button.closest("article");
      if (article) article.classList.add("expression-added");
    }
    function openExpressionCard(expr) {
      const card = findExpressionCard(expr);
      if (!card) return;
      if (card.data && card.data.usages && card.data.usages.length) renderMade(card);
      else openUsages(card.word, card.ru);
    }
    function localExpressionCard(expr) {
      return {
        word: expressionHead(expr.canonicalForm) || expr.exactText || "",
        ru: "",
        place: expressionPlace(expr),
        fromText: true,
        expressionKey: expressionIdentity(expr),
        expressionType: expr.type || "",
        data: {
          usages: expr.context ? [{ en: expr.context, ru: "" }] : [],
          grammar: { form: expr.canonicalForm || "", note: expr.meaning || "" }
        }
      };
    }
    function storeExpressionCard(expr, button, item) {
      const place = item.place || expressionPlace(expr);
      const fromText = !!(item && item.fromText);
      const deck = expressionDeckName(place, fromText);
      const list = loadAdded();
      const status = document.getElementById("textReadStatus");
      if (expressionSaved(expr)) {
        if (status) status.textContent = "Already in " + deck + ".";
        markExpressionButton(button, place, fromText);
        return;
      }
      list.unshift(item);
      saveAdded(list, null);
      syncChange({ op: "put-text-card", card: item });
      if (status) status.textContent = "Added to " + deck + ".";
      markExpressionButton(button, place, fromText);
      paintAdded();
    }
    function addExpressionCard(expr, button) {
      const place = expressionPlace(expr);
      const saved = findExpressionCard(expr);
      const fromText = !!(saved && saved.fromText);
      const deck = expressionDeckName(saved ? saved.place || place : place, fromText);
      const word = expressionHead(expr.canonicalForm) || expr.exactText || "";
      const status = document.getElementById("textReadStatus");
      if (!word) return;
      if (saved) {
        if (status) status.textContent = "Already in " + deck + ".";
        markExpressionButton(button, saved.place || place, fromText);
        return;
      }
      if (button) {
        button.disabled = true;
        button.textContent = "Looking up…";
      }
      accountFetch("/api/phrase-card", {
        method: "POST",
        body: JSON.stringify({
          exactText: expr.exactText,
          canonicalForm: expr.canonicalForm,
          type: expr.type,
          meaning: expr.meaning,
          context: expr.context
        })
      }).then((result) => {
        const card = result && result.card;
        storeExpressionCard(expr, button, card && card.word ? card : localExpressionCard(expr));
      }).catch(() => {
        storeExpressionCard(expr, button, localExpressionCard(expr));
      });
    }
    document.getElementById("textReadMore").addEventListener("click", () => {
      const body = document.getElementById("textReadBody");
      const more = document.getElementById("textReadMore");
      const collapsed = body.classList.toggle("collapsed");
      more.textContent = collapsed ? "Show the rest" : "Show less";
    });
    document.getElementById("textSave").addEventListener("click", () => storeText(false));
    document.getElementById("textSaveAnalyze").addEventListener("click", () => storeText(true));
    document.getElementById("textEdit").addEventListener("click", () => {
      const item = loadTexts().find((row) => row.id === openTextId);
      if (item) openTextEditor(item);
    });
    document.getElementById("textAnalyze").addEventListener("click", () => {
      const item = loadTexts().find((row) => row.id === openTextId);
      if (!item) return;
      const status = document.getElementById("textReadStatus");
      status.textContent = "Analyzing…";
      runTextAnalysis(item, status);
    });
    document.getElementById("textList").addEventListener("click", (event) => {
      const button = event.target.closest("[data-text-open]");
      if (button) showText(button.getAttribute("data-text-open"));
    });
    document.getElementById("textExpressions").addEventListener("click", (event) => {
      const opener = event.target.closest("[data-text-open-card]");
      const button = opener || event.target.closest("[data-text-card]");
      if (!button) return;
      const item = loadTexts().find((row) => row.id === openTextId);
      const expr = item && item.analysis && item.analysis.expressions[Number(button.getAttribute("data-text-open-card") || button.getAttribute("data-text-card"))];
      if (!expr) return;
      if (opener) openExpressionCard(expr);
      else addExpressionCard(expr, button);
    });
    const LM_KEY = "enquiz-material-demo";
    const lmFiles = {};
    let lmLibrary = null;
    let lmState = null;
    let lmSaveTimer = 0;
    let lmFontRange = null;
    let lmServerReady = false;
    let lmPushTimer = 0;
    let classGroups = [];
    let classGroupsReady = false;
    let classGroupsPulling = false;
    let classGroupId = "";
    let classGroupsDirty = false;
    let classGroupsSaveVersion = 0;
    function groupId() {
      return "group-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }
    function groupReset() {
      classGroups = [];
      classGroupsReady = false;
      classGroupsPulling = false;
      classGroupId = "";
      classGroupsDirty = false;
      classGroupsSaveVersion = 0;
    }
    function groupNormalize() {
      if (!classGroups.length) classGroups = [{ id: "group-default", title: "Group 1", date: lmToday(), hidden: false, lessonIds: [] }];
      if (!classGroups.some((group) => group.id === classGroupId)) classGroupId = classGroups[0].id;
      const assigned = new Set();
      classGroups.forEach((group) => {
        group.lessonIds = (Array.isArray(group.lessonIds) ? group.lessonIds : []).filter((id) => {
          if (!id || assigned.has(id)) return false;
          assigned.add(id);
          return true;
        });
      });
      if (lmLibrary) lmLibrary.materials.forEach((material) => {
        if (material && material.id && !assigned.has(material.id)) {
          classGroups[0].lessonIds.push(material.id);
          assigned.add(material.id);
        }
      });
    }
    let groupPullToken = 0;
    function groupPull(force = false) {
      if (!authUser || (!force && (classGroupsPulling || classGroupsReady)) || typeof accountFetch !== "function") return Promise.resolve();
      const token = ++groupPullToken, actor = authUser.id, generation = viewGen;
      classGroupsPulling = true;
      return accountFetch("/api/groups" + (viewAccount ? "?for=" + encodeURIComponent(viewAccount.id) : "")).then((data) => {
        if (token !== groupPullToken || actor !== authUser?.id || generation !== viewGen) return;
        classGroups = Array.isArray(data && data.groups) ? data.groups.map((group) => ({
          id: group.id,
          title: group.title || "Untitled group",
          date: group.date || lmToday(),
          hidden: !!group.hidden,
          personalHidden: !!group.personalHidden,
          revision: group.revision, studentCount: Number(group.studentCount)||0, examIds: group.examIds || [],
          lessonIds: Array.isArray(group.lessonIds) ? group.lessonIds.slice() : []
        })) : [];
        classGroupsReady = true;
        groupNormalize();
        paintGroups();
        paintLmDays();
        if(document.querySelector('section.on')?.id==='exams')examPaintList();
      }).catch((error) => window.LearningMain?.notice(error.message, true)).finally(() => { if (token === groupPullToken) classGroupsPulling = false; });
    }
    function groupSave() {
      classGroupsDirty = true;
      const version = ++classGroupsSaveVersion;
      if (!classGroupsReady || !lmServerReady || !canEditLessons() || viewSwitching || typeof accountFetch !== "function") return Promise.resolve();
      groupNormalize();
      const saved = new Set((lmLibrary && lmLibrary.materials || []).filter((row) => row && row.stageRevision).map((row) => row.id));
      const groups = classGroups.map((group) => ({
        ...(Number.isSafeInteger(group.id) && group.id > 0 ? { id: group.id } : {}),
        title: group.title,
        date: group.date || lmToday(),
        hidden: !!group.hidden,
        lessonIds: group.lessonIds.filter((id) => saved.has(id) && Number.isSafeInteger(id) && id > 0)
      }));
      return accountFetch("/api/groups", { method: "POST", body: JSON.stringify({ groups: groups }) })
        .then((data) => {
          if (data && Array.isArray(data.ids)) data.ids.forEach((id, index) => { if (classGroups[index]) classGroups[index].id = id; });
          if (version === classGroupsSaveVersion) classGroupsDirty = false;
        }).catch(() => {});
    }
    let groupViewLevel = '', examViewLevel = '', examViewGroup = null;
    document.addEventListener('input',event=>{if(event.target.id==='groupSearch')paintGroups();});
    function metricPairs(rows,compact=false){if(!authUser||viewAccount||!['ADMIN','DEVELOPER'].includes(authUser.role))return '';return '<span class="metric-pairs'+(compact?' metric-pairs--compact':'')+'">'+rows.map(([label,value])=>'<span>'+esc(compact?({'groups':'group','assigned works':'assigned','ready for review':'ready'}[label]||label):label)+' · <b>'+esc(String(value))+'</b></span>').join('')+'</span>';}
    function levelButtons(rows,attribute) {
      const levels = rows.some(row=>accountGroupLevel(row)==='unassigned') ? [...adminLevels,'unassigned'] : adminLevels;
      return '<div class="decks">' + levels.filter(level=>canEditLessons()||rows.some(row=>accountGroupLevel(row)===level)).map(level=>{const groups=rows.filter(row=>accountGroupLevel(row)===level),pairs=[['groups',groups.length],['students',groups.reduce((sum,g)=>sum+(g.studentCount||0),0)],['lessons',groups.reduce((sum,g)=>sum+(g.lessonIds?.length||0),0)]];return '<button class="file-card" type="button" '+attribute+'="'+level+'"><b>'+esc(level==='unassigned'?'Unassigned':level)+'</b><span class="label">'+metricPairs(pairs,true)+'</span></button>';}).join('')+'</div>';
    }
    document.addEventListener('click',event=>{
      const group=event.target.closest('[data-group-level]'), level=event.target.closest('[data-exam-level]'), subgroup=event.target.closest('[data-exam-group-view]');
      if(group){pushHistory();groupViewLevel=group.dataset.groupLevel;const search=document.getElementById('groupSearch');if(search)search.value='';paintGroups();rememberPlace();}
      if(level){pushHistory();examViewLevel=level.dataset.examLevel;examViewGroup=null;examPaintList();rememberPlace();}
      if(subgroup){pushHistory();examViewGroup=subgroup.dataset.examGroupView;examPaintList();rememberPlace();}
    });
    function paintGroups() {
      const box = document.getElementById("groupList");
      const newer = document.getElementById("groupNew");
      if (newer) newer.hidden = !canEditLessons();
      if (!box) return;
      if (authUser && !classGroupsReady && !classGroupsPulling) groupPull();
      groupNormalize();
      const visible = new Set((lmLibrary && lmLibrary.materials || []).filter(lmLessonVisibleToViewer).map((row) => row.id));
      document.querySelector('#groups .meta h1').textContent=groupViewLevel?(groupViewLevel==='unassigned'?'Unassigned':groupViewLevel):'Groups';
      paintPagePath('groups');
      const allRows = classGroups.filter((group) => canEditLessons() || canTuneStudentLessons() || !group.hidden).slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
      const controls=document.getElementById('groupControls');if(controls)controls.hidden=!groupViewLevel;
      const levelRows=groupViewLevel?allRows.filter(group=>accountGroupLevel(group)===groupViewLevel):allRows;
      const overview=document.getElementById('groupOverview');if(overview)overview.innerHTML=metricPairs([['groups',levelRows.length],['students',levelRows.reduce((sum,g)=>sum+(g.studentCount||0),0)],['lessons',levelRows.reduce((sum,g)=>sum+g.lessonIds.length,0)]]);
      if(!groupViewLevel){box.innerHTML=levelButtons(allRows,'data-group-level');return;}
      const query=document.getElementById('groupSearch')?.value.trim().toLocaleLowerCase()||'';
      const rows=levelRows.filter(group=>group.title.toLocaleLowerCase().includes(query));
      box.innerHTML = rows.map((group) => {
        const count = group.lessonIds.filter((id) => visible.has(id)).length;
        const hiddenCount = viewAccount ? group.lessonIds.filter(id => { const lesson = lmLibrary?.materials?.find(row => row.id === id); return !lesson || !lesson.published || lmLessonHidden(lesson); }).length : 0;
        const chip = lmDateChip(group.date);
        const hidden = viewAccount ? group.personalHidden : group.hidden;
        const about = hidden ? (viewAccount ? "Hidden for this student" : "Hidden") : (viewAccount && hiddenCount ? "Hidden " + hiddenCount + " / " + group.lessonIds.length + " lessons" : count + " lessons");
        const eye = hidden
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
        const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
        const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
        const tools = canEditLessons() || canTuneStudentLessons() ? '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-group-hide="' + esc(group.id) + '" aria-label="' + (hidden ? "Show" : "Hide") + '">' + eye + '</button>' + (canEditLessons() ? '<button class="day-edit" type="button" data-group-edit="' + esc(group.id) + '" aria-label="Edit group" title="Edit group">' + pencil + '</button><button class="day-del" type="button" data-group-delete="' + esc(group.id) + '" aria-label="Delete group">' + trash + '</button>' : '') + '</div>' : '';
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + '"><button class="day" type="button" data-group-open="' + esc(group.id) + '"><span class="date"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(group.title) + '</b><span class="label about">' + metricPairs([['students',group.studentCount||0],['lessons',count]],true)+(hidden||hiddenCount?'<span>'+esc(about)+'</span>':'') + "</span></button>" + tools + "</div>";
      }).join("");
    }
    function groupOpen(id) {
      id = domEntityId(id);
      if (!classGroups.some((group) => group.id === id)) return;
      classGroupId = id;
      visit("days");
    }
    function groupCreate() {
      if (!canEditLessons()) return;
      openItemEditor(document.getElementById("groupNew"), { title: (adminLevels.includes(groupViewLevel)?groupViewLevel:'A1')+' Group', date: lmToday(), label: "Group name" }, (value) => {
        if(accountGroupLevel({title:value.title})==='unassigned')value.title=(adminLevels.includes(groupViewLevel)?groupViewLevel:'A1')+' '+value.title;
        const actor=authUser?.id,generation=viewGen;
        accountFetch('/api/groups/manage',{method:'POST',body:JSON.stringify({action:'create',title:value.title,date:value.date})}).then(()=>{if(actor===authUser?.id&&generation===viewGen){const search=document.getElementById('groupSearch');if(search)search.value='';return groupPull(true);}}).catch(error=>{if(actor===authUser?.id&&generation===viewGen)window.LearningMain?.notice(error.message,true);});
      });
    }
    function groupEdit(id, button) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      const group = classGroups.find((row) => row.id === id);
      if (!group || !button) return;
      openItemEditor(button, { title: group.title, date: group.date, label: "Group name" }, (value) => {
        if(accountGroupLevel({title:value.title})==='unassigned'){window.LearningMain?.notice('Start the group name with a standard level and a space.',true);return;}
        group.title = value.title;
        groupViewLevel = accountGroupLevel(group);
        group.date = value.date;
        paintGroups();
        groupSave().then(()=>groupPull(true)).then(()=>examPull(true));
      });
    }
    function groupHide(id) {
      id = domEntityId(id);
      const group = classGroups.find((row) => row.id === id);
      if (!group) return;
      if (viewAccount) return toggleManagedVisibility(group, 'group');
      if (!canEditLessons()) return;
      group.hidden = !group.hidden;
      paintGroups();
      groupSave();
    }
    function groupDelete(id) {
      id = domEntityId(id);
      if (!canEditLessons() || classGroups.length < 2) return;
      const group = classGroups.find((row) => row.id === id);
      if (!group || !confirm("Move this group to Archive? Its classes will move to the first group.")) return;
      window.LearningMain.perform(async () => {
        await window.LearningMain.archiveItem("group", id);
        const rest = classGroups.filter((row) => row.id !== id);
        rest[0].lessonIds.push(...group.lessonIds.filter((lessonId) => !rest[0].lessonIds.includes(lessonId)));
        classGroups = rest;if (classGroupId === id) classGroupId = rest[0].id;paintGroups();
      });
    }
    const LM_FONTS = {
      serif: "Georgia, 'Times New Roman', serif",
      sans: "system-ui, sans-serif",
      mono: "'Courier New', monospace",
      georgia: "Georgia, serif",
      verdana: "Verdana, sans-serif",
      palatino: "Palatino, 'Palatino Linotype', serif",
      trebuchet: "'Trebuchet MS', sans-serif",
      courier: "'Courier New', Courier, monospace"
    };
    function lmSeed() {
      return {
        id: "lm-demo",
        title: "Present Perfect",
        description: "Grammar explanation and examples",
        className: "English B1",
        unit: "Unit 4",
        lesson: "Grammar",
        date: "",
        published: true,
        mode: "preview",
        demoVersion: 4,
        blocks: [
          { id: "lm-h1", type: "heading", level: "h2", text: "Present Perfect", collapsed: false },
          { id: "lm-t1", type: "text", collapsed: false, html: "<p>The <b>Present Perfect</b> connects past actions with the present.</p><p>We use it when the exact time is not important.</p><ul><li>experience</li><li>a result you can see now</li><li>unfinished time</li></ul>" },
          { id: "lm-l1", type: "link", collapsed: false, title: "British Council Grammar", url: "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/present-perfect", description: "A short explanation with examples." },
          { id: "lm-p1", type: "pdf", collapsed: false, name: "present-perfect.pdf", size: "2.4 MB", sample: true },
          { id: "lm-c1", type: "cards", collapsed: false, title: "Vocabulary", items: [
            { front: "already", back: "уже", example: "I've already finished." },
            { front: "yet", back: "еще", example: "Have you finished yet?" },
            { front: "just", back: "только что", example: "I've just arrived." }
          ] },
          { id: "lm-t2", type: "text", collapsed: false, html: "<p>Look for words like <i>already</i>, <i>yet</i> and <i>just</i>. They often sit with the Present Perfect.</p>" }
        ].concat(lmExtraBlocks())
      };
    }
    function lmExtraBlocks() {
      return [
        { id: "lm-img1", type: "image", collapsed: true, name: "coffee.jpg", size: "180 KB", caption: "A finished cup of coffee — the result is now.", sample: true },
        { id: "lm-au1", type: "audio", collapsed: true, name: "already.mp3", size: "240 KB", sample: true },
        { id: "lm-vid1", type: "video", collapsed: true, source: "link", url: "", title: "Present Perfect clip" },
        { id: "lm-voc1", type: "vocab", collapsed: true, title: "Time words", items: [
          { word: "already", translation: "уже", ipa: "/ɔːlˈredi/", example: "I've already finished." },
          { word: "yet", translation: "еще", ipa: "/jet/", example: "Have you finished yet?" }
        ] },
        { id: "lm-ex1", type: "exercise", collapsed: true, items: [
          { prompt: "Choose the correct sentence.", kind: "choice", options: ["I have seen that film.", "I have saw that film.", "I seen that film."], answer: 0, write: "" },
          { prompt: "Complete: I've ___ finished.", kind: "write", options: ["", "", ""], answer: 0, write: "already" }
        ] },
        { id: "lm-qz1", type: "quiz", collapsed: true, title: "Quick check", items: [
          { prompt: "Which word fits a question?", options: ["already", "yet", "ago"], answer: 1 },
          { prompt: "I've just arrived. Just means…", options: ["a long time ago", "только что", "never"], answer: 1 }
        ] },
        { id: "lm-note1", type: "note", collapsed: true, tone: "tip", text: "Use yet in questions and negatives. Use already when the action is done." },
        { id: "lm-dg1", type: "dialogue", collapsed: true, title: "At the office", lines: [
          { speaker: "Anna", text: "Have you finished the report yet?" },
          { speaker: "Ben", text: "Yes, I've already sent it." }
        ] },
        { id: "lm-rd1", type: "reading", collapsed: true, title: "A short note", text: "I have lived here since 2019. I have already met most of the neighbours, but I have not joined the book club yet.", marks: [] },
        { id: "lm-pr1", type: "pronunciation", collapsed: true, word: "already", ipa: "/ɔːlˈredi/", name: "", size: "", sample: false },
        { id: "lm-tb1", type: "table", collapsed: true, columns: ["Word", "Use"], rows: [["already", "I've already eaten."], ["yet", "I haven't eaten yet."]] },
        { id: "lm-task1", type: "task", collapsed: true, title: "Write two sentences", text: "Write one sentence with already and one with yet.", response: "" },
        { id: "lm-file1", type: "file", collapsed: true, name: "worksheet.docx", size: "48 KB", sample: true },
        { id: "lm-div1", type: "divider", collapsed: true, label: "Practice" },
        { id: "lm-ph1", type: "phrase", collapsed: true, items: [
          { phrase: "look forward to", meaning: "ждать с нетерпением", example: "I'm looking forward to the trip." },
          { phrase: "give up", meaning: "бросить", example: "I've given up sugar." }
        ] }
      ];
    }
    function lmSep7() {
      return {
        id: "lm-sep7",
        title: "Get to know each other",
        description: "Monday. Level A2. An example of the 7 Sep lesson, built only from content blocks.",
        className: "English A2",
        unit: "Speaking",
        lesson: "Questions",
        date: "2026-09-07",
        published: true,
        mode: "preview",
        blocks: [
          { id: "s7-h1", type: "heading", level: "h2", text: "What you will learn", collapsed: false },
          { id: "s7-t1", type: "text", collapsed: false, html: "<p>How to open a question about another person, answer, then hand the question back.</p><p>How to agree and disagree with <b>Most people…</b></p><ul><li>a reading about habits we share</li><li>speaking problems and solutions</li></ul>" },
          { id: "s7-h2", type: "heading", level: "h2", text: "Key phrases", collapsed: false },
          { id: "s7-ph", type: "phrase", collapsed: false, items: [
            { phrase: "So, tell me about …", meaning: "Расскажи мне о …", example: "So, tell me about your city." },
            { phrase: "I'd like to know about …", meaning: "Я хотел бы узнать о …", example: "I'd like to know about your hobbies." },
            { phrase: "Can you tell me a little about …?", meaning: "Можешь немного рассказать о …?", example: "Can you tell me a little about your job?" },
            { phrase: "What about you?", meaning: "А ты?", example: "I live in Yerevan. What about you?" }
          ] },
          { id: "s7-note", type: "note", collapsed: false, tone: "tip", text: "You start, then the other person answers and asks you back. What about you? and And you? also live on the real 16 Sep page." },
          { id: "s7-dg", type: "dialogue", collapsed: false, title: "Agree or disagree", lines: [
            { speaker: "A", text: "Most people never read books." },
            { speaker: "B", text: "I agree. That's true." },
            { speaker: "A", text: "Most people love Monday mornings." },
            { speaker: "B", text: "I disagree." }
          ] },
          { id: "s7-h3", type: "heading", level: "h2", text: "Grammar from this lesson", collapsed: false },
          { id: "s7-t2", type: "text", collapsed: false, html: "<p>The questions are mostly <b>Present Simple</b>, with a few <b>be going to</b> lines.</p><ul><li>Do you…? / What do you…? for habits</li><li>I'm going to… for a plan after the lesson</li></ul>" },
          { id: "s7-div", type: "divider", collapsed: false, label: "Practice" },
          { id: "s7-task", type: "task", collapsed: false, title: "Questions", text: "Answer, then ask back and add a follow-up. Cover two things you did before this lesson, the city where you live, one country you want to visit, two hobbies, three things that make you happy, and one thing you are going to do after the lesson.", response: "" },
          { id: "s7-r1", type: "reading", collapsed: false, title: "Student 1 · at home", text: "Do you look at people around you and say to yourself, 'Wow, we're all so different!'? Well, recently I had the opposite idea. I think that in many ways we're all the same. We all dance in the kitchen to our favourite music and we look in the fridge for no reason. We put a key behind a book and then forget where it is. We make a cup of tea or coffee, and then we forget to drink it until it gets completely cold.", marks: [] },
          { id: "s7-r2", type: "reading", collapsed: false, title: "Student 2 · outside", text: "What about outside the home? Nobody likes waiting, so it's not surprising that we all hate traffic. In the cinema we all cry at the sad part of the film. We join gyms and pay a lot of money to be a member, and then we never go. We go to the supermarket with a good plan, but we always buy crisps, chocolate and other snacks that are not on the list.", marks: [] },
          { id: "s7-tb", type: "table", collapsed: false, columns: ["Problem", "A way forward"], rows: [
            ["Grammar", "Write short sentences every day"],
            ["When I speak, I forget everything", "Mistakes are normal"],
            ["I don't understand native speakers", "Slow down, ask them to repeat"],
            ["I can't catch the words", "Slow the speed, use subtitles"],
            ["I am shy to speak", "Talk to yourself"],
            ["Pronunciation feels terrible", "People need the main idea"],
            ["I forget words", "Use the words, connect them to your life"],
            ["I'm not making progress", "Answer one question now, and again in 3 months"]
          ] },
          { id: "s7-ex", type: "exercise", collapsed: false, items: [
            { prompt: "Which line opens a question about the other person?", kind: "choice", options: ["So, tell me about your weekend.", "I agree. That's true.", "Homework is progress."], answer: 0, write: "" },
            { prompt: "Complete: I'm ____ to cook after the lesson.", kind: "write", options: ["", "", ""], answer: 0, write: "going" }
          ] },
          { id: "s7-qz", type: "quiz", collapsed: false, title: "Quick check", items: [
            { prompt: "What about you? is used to…", options: ["hand the question back", "disagree", "start the homework"], answer: 0 },
            { prompt: "Most people never read books. A possible answer is…", options: ["I agree. That's true.", "So, tell me about …", "Once a week"], answer: 0 }
          ] },
          { id: "s7-note2", type: "note", collapsed: false, tone: "note", text: "Formal points from the class: communication in Telegram, payment at the end of the month, a new agreement. If you are late, let me know. Homework is progress." },
          { id: "s7-hw", type: "task", collapsed: false, title: "Homework", text: "Listen to the podcast (5 min). Make a list of activities they find relaxing. If you have time, listen again with the script. If you have only 10 minutes, catch the main idea and do the task.", response: "" },
          { id: "s7-pdf", type: "pdf", collapsed: false, name: "get-to-know.pdf", size: "Lesson PDF", sample: true },
          { id: "s7-pr", type: "pronunciation", collapsed: false, word: "about", ipa: "/əˈbaʊt/", name: "", size: "", sample: false }
        ]
      };
    }
    function lmDateChip(iso) {
      if (!iso) return { day: "—", month: "date" };
      const date = new Date(iso + "T12:00:00");
      if (Number.isNaN(date.getTime())) return { day: "—", month: "date" };
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return { day: String(date.getDate()).padStart(2, "0"), month: months[date.getMonth()] };
    }
    function lmCourseBits(material) {
      const row = material || {};
      return [
        ["Class", row.className],
        ["Unit", row.unit],
        ["Lesson", row.lesson]
      ].filter((pair) => String(pair[1] || "").trim());
    }
    function lmCourseValue(label, value) {
      return String(value || "").trim().replace(new RegExp("^" + label + "\\s+", "i"), "");
    }
    function lmCourseHtml(material) {
      const bits = lmCourseBits(material);
      if (!bits.length) return "";
      return '<p class="lm-read-meta">' + bits.map((pair) => '<span><b>' + esc(pair[0]) + "</b> " + esc(lmCourseValue(pair[0], pair[1])) + "</span>").join("") + "</p>";
    }
    function lmBlockCounts(material) {
      const blocks = material && Array.isArray(material.blocks) ? material.blocks : [];
      if (blocks.length) {
        let words = 0, phrases = 0, rules = 0;
        for (const block of blocks) {
          if (block.type === "wordcard" || block.type === "word") {
            if ((block.tab || "") === "phrases") phrases += 1;
            else if ((block.tab || "") === "words") words += 1;
          } else if (block.type === "phrase") phrases += 1;
          else if (block.type === 'vocab' && block.tab === 'words') words += (block.items || []).filter(item => item.word).length;
          else if (block.type === 'cards' && block.tab === 'words') words += (block.items || []).filter(item => item.front || item.back || item.example).length;
          else if (block.type === "rule") rules += 1;
        }
        return { words, phrases, rules };
      }
      return {
        words: Number(material && material.wordCount) || 0,
        phrases: Number(material && material.phraseCount) || 0,
        rules: Number(material && material.ruleCount) || 0
      };
    }
    function lmIsNewestLesson(material, n) {
      if (!material) return false;
      lmEnsure();
      return lmLibrary.materials.filter((row) => lmLessonVisibleToViewer(row)).slice().sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      }).slice(0, n).some((row) => row.id === material.id);
    }
    function lmLongDate(iso) {
      if (!iso) return "";
      const date = new Date(iso + "T12:00:00");
      if (Number.isNaN(date.getTime())) return "";
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      return days[date.getDay()] + ", " + date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
    }
    function lmToday() {
      const date = new Date();
      return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
    }
    function lmIsDemoId(id) {
      return id === "lm-demo" || id === "lm-sep7";
    }
    function lmBlankMaterial() {
      return { id: lmId(), title: "", description: "", className: "", unit: "", lesson: "", date: "", published: false, mode: "edit", blocks: [] };
    }
    function lmLoadLibrary() {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(LM_KEY) || "null"); } catch (e) {}
      let materials = [];
      if (raw && Array.isArray(raw.materials)) materials = raw.materials;
      else if (raw && Array.isArray(raw.blocks)) {
        if (!raw.id) raw.id = "lm-local";
        if (!raw.date) raw.date = "";
        materials = lmIsDemoId(raw.id) ? [] : [raw];
      }
      materials = materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      const removed = raw && Array.isArray(raw.removed) ? raw.removed.filter((id) => !lmIsDemoId(id)) : [];
      const activeId = raw && raw.activeId && materials.some((row) => row.id === raw.activeId) ? raw.activeId : (materials[0] ? materials[0].id : "");
      return { materials: materials, activeId: activeId, removed: removed };
    }
    function lmPersist() {
      if (lmState && lmState.examOwned) { examSync(); return; }
      if (!lmLibrary) return;
      if (lmState) {
        const index = lmLibrary.materials.findIndex((row) => row.id === lmState.id);
        if (index >= 0) {
          lmLibrary.materials[index] = lmState;
          lmLibrary.activeId = lmState.id;
        }
      }
      lmLibrary.materials = lmLibrary.materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
      lmSchedulePush();
    }
    function lmSchedulePush() {
      if (!canEditLessons() || viewAccount || viewSwitching || !lmServerReady || !authUser) return;
      clearTimeout(lmPushTimer);
      lmPushTimer = setTimeout(lmPushToServer, 500);
    }
    function lmPushToServer() {
      if (!canEditLessons() || viewAccount || viewSwitching || !authUser || !lmLibrary) return Promise.resolve();
      const materials = lmLibrary.materials.filter((row) => row && row.id && !lmIsDemoId(row.id));
      return accountFetch("/api/lessons", {
        method: "PUT",
        body: JSON.stringify({ materials: materials })
      }).catch(() => {});
    }
    function lmMergeRemote(localList, remoteList) {
      const map = new Map();
      (remoteList || []).forEach((row) => {
        if (!row || !row.id || lmIsDemoId(row.id)) return;
        map.set(row.id, row);
      });
      (localList || []).forEach((row) => {
        if (!row || !row.id || lmIsDemoId(row.id)) return;
        const have = map.get(row.id);
        if (!have) {
          map.set(row.id, row);
          return;
        }
        const localBlocks = Array.isArray(row.blocks) ? row.blocks.length : 0;
        const remoteBlocks = Array.isArray(have.blocks) ? have.blocks.length : 0;
        if (localBlocks > remoteBlocks) map.set(row.id, row);
        else if (localBlocks === remoteBlocks && String(row.title || "") && !String(have.title || "")) map.set(row.id, row);
      });
      return Array.from(map.values());
    }
    function lmApplyRemote(materials, opts) {
      lmEnsure();
      const lessonState = lmState && !lmState.examOwned ? lmState : null;
      const next = (materials || []).filter((row) => row && row.id && !row.examOwned && !lmIsDemoId(row.id));
      const byId = new Map();
      lmLibrary.materials.forEach((row) => {
        if (row && row.id && !row.examOwned && !lmIsDemoId(row.id)) byId.set(row.id, row);
      });
      next.forEach((row) => {
        if (!byId.has(row.id)) byId.set(row.id, row);
        else if (!lessonState || lessonState.id !== row.id) byId.set(row.id, row);
      });
      if (lessonState && lessonState.id && !lmIsDemoId(lessonState.id) && !byId.has(lessonState.id)) byId.set(lessonState.id, lessonState);
      const openId = lessonState && lessonState.id;
      lmLibrary.materials = Array.from(byId.values());
      if (openId && byId.has(openId)) {
        lmState = byId.get(openId);
        lmLibrary.activeId = openId;
      } else if (!byId.has(lmLibrary.activeId)) lmLibrary.activeId = lmLibrary.materials[0] ? lmLibrary.materials[0].id : "";
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
      if (opts && opts.push) lmSchedulePush();
    }
    function lmPullFromServer() {
      if (!authUser || viewSwitching) return Promise.resolve();
      const bootGen = viewGen;
      const viewing = !!(viewAccount && viewAccount.id);
      return accountFetch("/api/lessons").then((data) => {
        if (bootGen !== viewGen || viewSwitching) return;
        const stillViewing = !!(viewAccount && viewAccount.id);
        if (viewing !== stillViewing) return;
        lmServerReady = true;
        const remote = data && Array.isArray(data.materials) ? data.materials : [];
        lmEnsure();
        const local = lmLibrary.materials.slice();
        const canMerge = canEditLessons() && !viewAccount;
        const merged = canMerge ? lmMergeRemote(local, remote) : remote.filter((row) => row && !lmIsDemoId(row.id));
        const richerLocal = canMerge && local.some((row) => {
          if (!row || lmIsDemoId(row.id)) return false;
          const remoteRow = remote.find((item) => item && item.id === row.id);
          const localBlocks = Array.isArray(row.blocks) ? row.blocks.length : 0;
          const remoteBlocks = remoteRow && Array.isArray(remoteRow.blocks) ? remoteRow.blocks.length : 0;
          return localBlocks > remoteBlocks;
        });
        lmApplyRemote(merged, { push: !!richerLocal || (canMerge && !remote.length && local.length) });
        if (classGroupsDirty) groupSave();
      }).catch(() => {
        if (bootGen !== viewGen || viewSwitching) return;
        lmServerReady = !!authUser;
      });
    }
    function lmSchedule() {
      clearTimeout(lmSaveTimer);
      lmSaveTimer = setTimeout(lmPersist, 400);
    }
    function lmId() { return "lm-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function lmUniqueId() {
      const used = {};
      if (lmLibrary && Array.isArray(lmLibrary.materials)) {
        lmLibrary.materials.forEach((row) => { if (row && row.id) used[row.id] = 1; });
      }
      let id = lmId();
      let n = 2;
      while (used[id]) {
        id = lmId() + "-" + n;
        n += 1;
      }
      return id;
    }
    function lmBlock(id) { return (lmState.blocks || []).find((row) => row.id === domEntityId(id)); }
    function lmPlain(html) {
      const parsed = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
      const box = parsed.body && parsed.body.firstElementChild ? parsed.body.firstElementChild : null;
      return ((box && box.textContent) || "").replace(/\s+/g, " ").trim();
    }
    function lmClean(html) {
      // Parse off-document so <img onerror> etc. cannot run during sanitize.
      const parsed = new DOMParser().parseFromString("<div>" + (html || "") + "</div>", "text/html");
      const box = parsed.body && parsed.body.firstElementChild ? parsed.body.firstElementChild : parsed.createElement("div");
      Array.from(box.querySelectorAll("*")).forEach((node) => {
        if (!node.parentNode) return;
        const tag = node.tagName;
        if (tag === "SPAN") {
          const px = /^(\d+(?:\.\d+)?)px$/.exec(String(node.style.fontSize || ""));
          const familyKey = lmFontKey(node.style.fontFamily);
          const color=node.style.color;
          while (node.attributes.length) node.removeAttribute(node.attributes[0].name);
          if (px) {
            const size = Math.min(96, Math.max(10, Math.round(Number(px[1]))));
            node.style.fontSize = size + "px";
          }
          if (familyKey) node.style.fontFamily = LM_FONTS[familyKey];
          if(color)node.style.color=color;
          if (!node.getAttribute("style")) {
            const parent = node.parentNode;
            while (node.firstChild) parent.insertBefore(node.firstChild, node);
            parent.removeChild(node);
          }
          return;
        }
        if (!/^(B|STRONG|I|EM|U|A|UL|OL|LI|P|BR|DIV)$/.test(tag)) {
          const parent = node.parentNode;
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
          return;
        }
        Array.from(node.attributes).forEach((attr) => {
          if (tag === "A" && attr.name === "href") return;
          node.removeAttribute(attr.name);
        });
        if (tag === "A") {
          const href = node.getAttribute("href") || "";
          if (!/^https?:\/\//i.test(href)) node.removeAttribute("href");
          else { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noreferrer"); }
        }
      });
      return box.innerHTML;
    }
    function lmFontFamily(key) {
      return LM_FONTS[key] || "";
    }
    function lmFontKey(value) {
      const clean = String(value || "").replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!clean) return "";
      const keys = Object.keys(LM_FONTS);
      for (let i = 0; i < keys.length; i++) {
        const stack = LM_FONTS[keys[i]].replace(/["']/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        if (stack === clean) return keys[i];
      }
      return "";
    }
    function lmTextStyle(block) {
      const bits = [];
      const size = Math.round(Number(block && block.fontSize));
      if (size >= 10 && size <= 96) bits.push("font-size:" + size + "px");
      const family = lmFontFamily(block && block.fontFamily);
      if(/^#[a-f0-9]{6}$/i.test(block?.textColor||''))bits.push('color:'+block.textColor);
      if (family) bits.push("font-family:" + family);
      return bits.length ? ' style="' + esc(bits.join(";")) + '"' : "";
    }
    function lmTextTools(block) {
      const size = block.fontSize >= 10 && block.fontSize <= 96 ? block.fontSize : 17;
      const fonts = [["", "Font"], ["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"], ["georgia", "Georgia"], ["verdana", "Verdana"], ["palatino", "Palatino"], ["trebuchet", "Trebuchet"], ["courier", "Courier"]];
      const options = fonts.map((pair) => '<option value="' + pair[0] + '"' + (block.fontFamily === pair[0] ? " selected" : "") + ">" + pair[1] + "</option>").join("");
      return '<div class="lm-tools"><select data-font-family="' + block.id + '" aria-label="Font">' + options + '</select><button type="button" data-font="up" aria-label="Larger text">A+</button><button type="button" data-font="down" aria-label="Smaller text">A−</button><input class="lm-font-size" type="number" min="10" max="96" step="1" data-font-size="' + block.id + '" value="' + size + '" aria-label="Font size" /><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList">List</button><button type="button" data-cmd="link">Link</button><input type="color" data-lm-color="' + block.id + '" value="' + esc(block.textColor || '#173832') + '" title="Text color" aria-label="Text color" /></div>';
    }
    function lmActiveFontRange(rich) {
      const sel = window.getSelection();
      let range = null;
      if (sel && sel.rangeCount && rich && rich.contains(sel.anchorNode)) range = sel.getRangeAt(0);
      if ((!range || range.collapsed) && lmFontRange && lmFontRange.startContainer && rich && rich.contains(lmFontRange.startContainer)) range = lmFontRange;
      return range && !range.collapsed ? range : null;
    }
    function lmCurrentTextSize(rich, block) {
      const range = lmActiveFontRange(rich);
      const node = range && range.startContainer;
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (el && rich && rich.contains(el)) {
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px) return Math.round(px);
      }
      const saved = Math.round(Number(block && block.fontSize));
      return saved >= 10 && saved <= 96 ? saved : 17;
    }
    function lmApplyTextFont(rich, block, patch) {
      if (!rich || !block) return;
      const range = lmActiveFontRange(rich);
      if (range) {
        const span = document.createElement("span");
        if (patch.size) span.style.fontSize = patch.size + "px";
        if (patch.family) span.style.fontFamily = lmFontFamily(patch.family);
        try {
          span.appendChild(range.extractContents());
          range.insertNode(span);
          const next = document.createRange();
          next.selectNodeContents(span);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(next);
          lmFontRange = next.cloneRange();
          block.html = rich.innerHTML;
        } catch (e) {
          if (patch.size) block.fontSize = patch.size;
          if (patch.family !== undefined) block.fontFamily = patch.family;
        }
      } else {
        if (patch.size) {
          block.fontSize = patch.size;
          rich.style.fontSize = patch.size + "px";
        }
        if (patch.family !== undefined) {
          block.fontFamily = patch.family;
          rich.style.fontFamily = lmFontFamily(patch.family);
        }
      }
      lmSchedule();
    }
    function lmFileSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    function lmTab() {
      const id = lmState && lmState.tab;
      if (id === "words" || id === "phrases" || id === "rules" || id === "classwork" || id === "homework" || id === "pdf") return id;
      return "overview";
    }
    function lmBlocksFor(tab) {
      const id = tab || lmTab();
      return (lmState && lmState.blocks || []).filter((block) => (block.tab || "overview") === id);
    }
    function lmWordCardHtml(block) {
      const card = { word: block.word, en: block.word, ru: block.ru || "", uk: block.uk || "", us: block.us || "", data: block.data || null };
      if (examStudentRestricted()) return '<details class="lm-study-card"><summary>' + esc(block.word || '') + '</summary><div class="lm-study-card-body">' + ipaHtml(card) + (block.pos ? '<p>' + esc(block.pos) + '</p>' : '') + '</div></details>';
      return '<button class="wcard" type="button" data-lm-word="' + esc(block.id) + '">' + wordPic(block.word) + '<div class="en">' + esc(block.word || "") + '</div>' + (block.pos ? '<div class="pos">' + esc(block.pos) + "</div>" : "") + ipaHtml(card) + '<div class="label">' + esc(block.ru || "") + "</div></button>";
    }
    function lmRuleCardHtml(block, link) {
      const topic = block.compare ? null : topicById(block.topic);
      const compare = block.compare ? ((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((item) => item.id === block.topic)[0] : null;
      const name = (topic && topic.name) || (compare && compare.title) || block.name || "Rule";
      const form = (topic && topic.form) || (compare ? "compare" : "open");
      const tone = (topic && topic.tone) || (compare && compare.tone) || "advanced";
      const attr = link ? (block.compare ? ' data-compare="' + esc(block.topic) + '"' : ' data-topic="' + esc(block.topic) + '"') : "";
      const tag = link ? "button" : "div";
      return "<" + tag + ' class="g-topic tone-' + esc(tone) + '"' + attr + (link ? ' type="button"' : "") + "><b>" + esc(name) + '</b><span class="form">' + esc(form) + "</span></" + tag + ">";
    }
    function lmQuizBlankItem(quizType) {
      const kind = quizType || "Choice";
      if (kind === "Flip" || kind === "Reverse") return { front: "", back: "" };
      if (kind === "Choice") return { prompt: "", options: ["", "", ""], answer: 0 };
      if (kind === "Type" || kind === "Listen" || kind === "Definition") return { prompt: "", answer: "" };
      if (kind === "Gap") return { shown: "", answer: "", hint: "" };
      if (kind === "Build") return { parts: "", answer: "" };
      if (kind === "Match" || kind === "Memory") return { left: "", right: "" };
      if (kind === "True / false") return { prompt: "", answer: "true" };
      if (kind === "Tap") return { text: "", answer: "" };
      if (kind === "Select all") return { prompt: "", options: ["", "", ""], answers: [] };
      if (kind === "Spell" || kind === "Letters" || kind === "Hangman") return { word: "" };
      if (kind === "Odd one out") return { options: ["", "", "", ""], answer: 0 };
      return { prompt: "", options: ["", "", ""], answer: 0 };
    }
    function lmQuizType(block) {
      return (block && block.quizType) || "Choice";
    }
    function lmBlank(type, quizType) {
      const id = lmId();
      const base = { id: id, type: type, collapsed: false, tab: lmTab() };
      if (['quiz','exercise','task'].includes(type)) Object.assign(base,{gradeMode:'assignment',maxPoints:lmState?.examOwned?'':1,assignmentId:'a-' + crypto.randomUUID(),...(lmState?.examOwned?{scoringVersion:2}:{})});
      if (type === "heading") return Object.assign(base, { level: "h2", text: "New heading" });
      if (type === "text" || type === "reading") return Object.assign(base, type === "text" ? { html: "<p></p>" } : { title: "Reading", text: "", marks: [] });
      if (type === "pdf" || type === "image" || type === "audio" || type === "file") return Object.assign(base, { name: "", size: "", caption: "", title: "" });
      if (type === "link") return Object.assign(base, { title: "", url: "", description: "" });
      if (type === "cards") return Object.assign(base, { title: "Vocabulary", items: [{ front: "", back: "", example: "" }] });
      if (type === "video") return Object.assign(base, { source: "link", url: "", title: "", name: "", size: "" });
      if (type === "vocab") return Object.assign(base, { title: "Vocabulary", items: [{ word: "", translation: "", ipa: "", example: "" }] });
      if (type === "exercise") return Object.assign(base, { items: [{ prompt: "", kind: "choice", options: ["", "", ""], answer: 0, write: "" }] });
      if (type === "quiz") {
        const kind = quizType || "Choice";
        const quiz = { title: kind, quizType: kind, items: [lmQuizBlankItem(kind)] };
        if (kind === "Memory") quiz.memorySize = 4;
        return Object.assign(base, quiz);
      }
      if (type === "note") return Object.assign(base, { tone: "tip", text: "" });
      if (type === "dialogue") return Object.assign(base, { title: "Dialogue", lines: [{ speaker: "", text: "" }] });
      if (type === "pronunciation") return Object.assign(base, { word: "", ipa: "", name: "", size: "" });
      if (type === "table") return Object.assign(base, { columns: ["", ""], rows: [["", ""], ["", ""]] });
      if (type === "task") return Object.assign(base, { title: "Task", text: "", response: "" });
      if (type === "divider") return Object.assign(base, { label: "" });
      if (type === "phrase") return Object.assign(base, { items: [{ phrase: "", meaning: "", example: "" }] });
      return Object.assign(base, { title: "Vocabulary", items: [{ front: "", back: "", example: "" }], type: "cards" });
    }
    function lmNewItem(kind, quizType) {
      if (kind === "vocab") return { word: "", translation: "", ipa: "", example: "" };
      if (kind === "dialogue") return { speaker: "", text: "" };
      if (kind === "phrase") return { phrase: "", meaning: "", example: "" };
      if (kind === "exercise") return { prompt: "", kind: "choice", options: ["", "", ""], answer: 0, write: "" };
      if (kind === "quiz") return lmQuizBlankItem(quizType || "Choice");
      return { front: "", back: "", example: "" };
    }
    function lmSummary(block) {
      if (block.type === "heading") return block.text || "Heading";
      if (block.type === "text" || block.type === "reading") return lmPlain(block.html || block.text) || block.title || "Text";
      if (block.type === "pdf" || block.type === "audio" || block.type === "file" || block.type === "image") return block.title || block.caption || block.name || "No file yet";
      if (block.type === "link" || block.type === "video") return block.title || block.url || block.name || "Link";
      if (block.type === "note") return block.text || "Note";
      if (block.type === "divider") return block.label || "Divider";
      if (block.type === "pronunciation") return [block.word, block.ipa].filter(Boolean).join(" ") || "Pronunciation";
      if (block.type === "task") return block.title || block.text || "Task";
      if (block.type === "table") return (block.columns || []).filter(Boolean).join(" · ") || "Table";
      if (block.type === "dialogue") return (block.lines || []).map((line) => line.speaker).filter(Boolean).join(" · ") || "Dialogue";
      if (block.type === "vocab") return (block.items || []).map((row) => row.word).filter(Boolean).join(" · ") || "Vocabulary";
      if (block.type === "phrase") return (block.items || []).map((row) => row.phrase).filter(Boolean).join(" · ") || "Phrase";
      if (block.type === "wordcard") return block.word || "Word";
      if (block.type === "rule") return block.name || "Rule";
      if (block.type === "exercise") return (block.items || []).map((row) => row.prompt).filter(Boolean).join(" · ") || "Questions";
      if (block.type === "quiz") {
        const kind = lmQuizType(block);
        const items = block.items || [];
        const bits = items.map((row) => row.prompt || row.front || row.word || row.shown || row.text || row.left || row.definition || "").filter(Boolean);
        return (kind + (bits.length ? " · " + bits.join(" · ") : "")) || block.title || "Quiz";
      }
      return (block.items || []).map((card) => card.front).filter(Boolean).join(" · ") || "Cards";
    }
    function lmEmbed(url) {
      const raw = String(url || "").trim();
      let match = raw.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{6,})/i);
      if (match) return "https://www.youtube-nocookie.com/embed/" + match[1];
      match = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
      if (match) return "https://player.vimeo.com/video/" + match[1];
      match = raw.match(/(?:youtube\.com\/live\/)([\w-]{6,})/i);
      if (match) return "https://www.youtube-nocookie.com/embed/" + match[1];
      return "";
    }
    function lmHostLabel(url) {
      try { return new URL(url).hostname.replace(/^www\./, ""); }
      catch (e) { return ""; }
    }
    function lmUrlKind(url) {
      const href = String(url || "").trim();
      if (!/^https?:\/\//i.test(href)) return { kind: "", href: "" };
      const embed = lmEmbed(href);
      if (embed) return { kind: "video-embed", href: href, src: embed };
      if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(href)) return { kind: "video-file", href: href, src: href };
      if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|#|$)/i.test(href)) return { kind: "audio-file", href: href, src: href };
      return { kind: "page", href: href, src: href };
    }
    function lmVideoFrame(src, title) {
      return (title ? "<h3>" + esc(title) + "</h3>" : "") + '<div class="lm-frame-video"><iframe src="' + esc(src) + '" title="' + esc(title || "Video") + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }
    function lmLinkCard(block, href) {
      const title = block.title || href || "Link";
      const host = lmHostLabel(href);
      const note = block.description || "";
      return '<a class="lm-link-card" href="' + esc(href || "#") + '" target="_blank" rel="noreferrer" data-link-preview="' + esc(href) + '"' + (note ? ' data-keep-desc="1"' : "") + '>' +
        '<span class="lm-link-card-media" aria-hidden="true"></span>' +
        '<span class="lm-link-card-copy"><b>' + esc(title) + '</b><span class="lm-link-card-desc">' + esc(note) + '</span><small class="lm-link-card-host">' + esc(host) + "</small></span></a>";
    }
    function lmDecodeEntities(text) {
      const value = String(text || "");
      if (!value || value.indexOf("&") < 0) return value;
      const box = document.createElement("textarea");
      box.innerHTML = value;
      return box.value;
    }
    function lmHydrateLinkPreviews(root) {
      const box = root || document.getElementById("lmPreview");
      if (!box || !authUser) return;
      box.querySelectorAll("[data-link-preview]").forEach((card) => {
        const href = card.getAttribute("data-link-preview") || "";
        if (!href || card.dataset.previewLoaded) return;
        card.dataset.previewLoaded = "1";
        accountFetch("/api/link-preview?url=" + encodeURIComponent(href)).then((data) => {
          if (!data || !card.isConnected) return;
          const title = card.querySelector("b");
          const host = card.querySelector(".lm-link-card-host");
          const desc = card.querySelector(".lm-link-card-desc");
          const media = card.querySelector(".lm-link-card-media");
          if (title && data.title && card.getAttribute("data-keep-title") !== "1") title.textContent = lmDecodeEntities(data.title);
          if (host && data.host) host.textContent = data.host;
          if (desc && card.getAttribute("data-keep-desc") !== "1") {
            desc.textContent = lmDecodeEntities(data.description || "") || data.host || "";
          }
          if (media && data.image) {
            let imageUrl = "";
            try {
              const parsed = new URL(String(data.image || "").trim());
              if (parsed.protocol === "http:" || parsed.protocol === "https:") imageUrl = parsed.toString();
            } catch (e) {}
            if (imageUrl) {
              media.style.backgroundImage = "url(\"" + imageUrl.replace(/\\/g, "\\\\").replace(/"/g, "%22") + "\")";
              media.classList.add("has-image");
            }
          }
        }).catch(() => {});
      });
    }
    function lmFileUrl(id) {
      return "/api/lesson-file?id=" + encodeURIComponent(id);
    }
    function lmExternalFile(block) {
      if (block && block.hasFile) return "";
      try {
        const url = new URL(block && block.remoteUrl);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
      } catch (e) { return ""; }
    }
    function lmSrc(block) {
      if (block?.archiveMediaUrl) return block.archiveMediaUrl;
      if (!block || !block.id) return "";
      if (lmFiles[block.id]) return lmFiles[block.id];
      if (lmExternalFile(block)) return lmExternalFile(block);
      if (block.hasFile || (block.hasFile !== false && block.name && !block.sample)) return lmFileUrl(block.id);
      return "";
    }
    function lmUploadFile(id, file) {
      if (!authUser || !canEditLessons() || !id || !file) return Promise.resolve(false);
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", lmFileUrl(id));
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
        xhr.send(file);
      });
    }
    function lmDeleteRemoteFile(id) {
      if (!authUser || !canEditLessons() || !id) return Promise.resolve();
      return fetch(lmFileUrl(id), { method: "DELETE", credentials: "include" }).catch(() => {});
    }
    function lmMedia(id, kind) {
      const block = lmBlock(id);
      const url = lmSrc(block) || lmFiles[id];
      if (!url) return "";
      if (kind === "image") return '<img class="lm-shot" alt="" src="' + esc(url) + '" />';
      if (kind === "audio") return '<audio class="lm-player" controls src="' + esc(url) + '"></audio>';
      if (kind === "video") return '<video class="lm-player" controls src="' + esc(url) + '"></video>';
      return "";
    }
    function lmFileBox(block, accept, emptyText, kind) {
      const preview = lmMedia(block.id, kind);
      if (!block.name) return '<label class="lm-drop">' + emptyText + '<small>or click to upload</small><input type="file" accept="' + accept + '" data-file="' + block.id + '" /></label>';
      return preview + '<div class="lm-file"><span aria-hidden="true">📄</span><div class="lm-file-copy"><b>' + esc(block.name) + "</b><small>" + esc(block.size || "") + '</small></div><div class="lm-file-actions"><label class="lm-linkish">Replace<input type="file" accept="' + accept + '" data-file="' + block.id + '" hidden /></label><button class="lm-linkish" type="button" data-file-clear="' + block.id + '">Remove</button></div></div>';
    }
    function lmFileTitle(block) {
      return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" placeholder="Name for learners" /></label>';
    }
    function lmItemTools(blockId, list, index) {
      return '<div class="lm-card-actions"><button class="lm-icon" type="button" data-item-up="' + blockId + ":" + list + ":" + index + '" aria-label="Move up">↑</button><button class="lm-icon" type="button" data-item-down="' + blockId + ":" + list + ":" + index + '" aria-label="Move down">↓</button><button class="lm-icon danger" type="button" data-item-del="' + blockId + ":" + list + ":" + index + '" aria-label="Delete">×</button></div>';
    }
    function lmItemField(block, list, index, key, label, wide) {
      const item = block[list][index] || {};
      return '<label' + (wide ? ' class="lm-span"' : "") + ">" + label + '<input type="text" data-item-field="' + key + '" data-item-list="' + list + '" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(item[key] || "") + '" /></label>';
    }
    function lmItemRows(block, list, fields) {
      return (block[list] || []).map((item, index) => '<div class="lm-card-row"><div class="lm-card-fields">' + fields.map((field) => lmItemField(block, list, index, field[0], field[1], field[2])).join("") + "</div>" + lmItemTools(block.id, list, index) + "</div>").join("");
    }
    function lmChoiceEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="radio" name="ans-' + block.id + "-" + index + '" data-correct="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.answer) === oi ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmSelectAllEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      const answers = Array.isArray(question.answers) ? question.answers.map(Number) : [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="checkbox" data-select-ans="' + block.id + ":" + index + ":" + oi + '"' + (answers.indexOf(oi) >= 0 ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmOddEditor(block, index) {
      const question = block.items[index];
      const options = question.options || [];
      return '<div class="lm-opts">' + options.map((opt, oi) => '<label class="lm-opt"><input type="radio" name="odd-' + block.id + "-" + index + '" data-correct="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.answer) === oi ? " checked" : "") + ' /><input type="text" data-opt="' + block.id + ":" + index + ":" + oi + '" value="' + esc(opt) + '" placeholder="Option" /></label>').join("") + '</div><button class="lm-add-card" type="button" data-opt-add="' + block.id + ":" + index + '">+ Option</button>';
    }
    function lmQuizItemEditor(block, index) {
      const kind = lmQuizType(block);
      const item = block.items[index];
      if (kind === "Flip" || kind === "Reverse") {
        return lmItemField(block, "items", index, "front", kind === "Reverse" ? "Russian" : "Front", true) +
          lmItemField(block, "items", index, "back", kind === "Reverse" ? "English" : "Back", true);
      }
      if (kind === "Choice") {
        return lmItemField(block, "items", index, "prompt", "Question", true) + lmChoiceEditor(block, index);
      }
      if (kind === "Type" || kind === "Listen") {
        return lmItemField(block, "items", index, "prompt", kind === "Listen" ? "Prompt / transcript" : "Prompt", true) +
          lmItemField(block, "items", index, "answer", "Answer", true);
      }
      if (kind === "Definition") {
        return lmItemField(block, "items", index, "prompt", "Definition", true) +
          lmItemField(block, "items", index, "answer", "Word", true);
      }
      if (kind === "Gap") {
        return lmItemField(block, "items", index, "shown", "Sentence with ___", true) +
          lmItemField(block, "items", index, "answer", "Missing word", true) +
          lmItemField(block, "items", index, "hint", "Hint", true);
      }
      if (kind === "Build") {
        return lmItemField(block, "items", index, "parts", "Parts (space-separated)", true) +
          lmItemField(block, "items", index, "answer", "Correct sentence", true);
      }
      if (kind === "Match" || kind === "Memory") {
        return lmItemField(block, "items", index, "left", "Left", true) +
          lmItemField(block, "items", index, "right", "Right", true);
      }
      if (kind === "True / false") {
        const yes = String(item.answer) !== "false";
        return lmItemField(block, "items", index, "prompt", "Statement", true) +
          '<label>Answer<select data-item-field="answer" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="true"' + (yes ? " selected" : "") + '>True</option><option value="false"' + (yes ? "" : " selected") + ">False</option></select></label>";
      }
      if (kind === "Tap") {
        return lmItemField(block, "items", index, "text", "Sentence", true) +
          lmItemField(block, "items", index, "answer", "Word to tap", true);
      }
      if (kind === "Select all") {
        return lmItemField(block, "items", index, "prompt", "Question", true) + lmSelectAllEditor(block, index);
      }
      if (kind === "Spell" || kind === "Letters" || kind === "Hangman") {
        return lmItemField(block, "items", index, "word", "Word", true);
      }
      if (kind === "Odd one out") {
        return '<p class="lm-note">Mark the odd one out.</p>' + lmOddEditor(block, index);
      }
      return lmItemField(block, "items", index, "prompt", "Question", true) + lmChoiceEditor(block, index);
    }
    function lmQuizItems(block) {
      const kind = lmQuizType(block);
      const addLabel = (kind === "Match" || kind === "Memory") ? "+ Add pair" : (kind === "Spell" || kind === "Letters" || kind === "Hangman") ? "+ Add word" : "+ Add card";
      const memory = kind === "Memory" ? '<label>Pairs in one set<input type="number" min="2" data-field="memorySize" data-block="' + block.id + '" value="' + esc(String(block.memorySize || 4)) + '" /></label>' : "";
      const rows = (block.items || []).map((item, index) =>
        '<div class="lm-card-row"><div class="lm-card-fields">' + lmQuizItemEditor(block, index) + "</div>" + lmItemTools(block.id, "items", index) + "</div>"
      ).join("");
      return memory + '<div class="lm-card-list">' + rows + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':quiz">'+ addLabel + "</button>";
    }
    function contentCopyButton(type, id, parent, parentId, className) {
      if (!canEditLessons() || !Number.isSafeInteger(id) || id < 1 || (parent && !Number.isSafeInteger(parentId))) return "";
      const source = [type, id, parent, parentId].filter(value => value !== undefined).join(":");
      return '<button class="' + (className || 'day-edit') + ' content-copy-icon" type="button" data-content-copy="' + esc(source) + '" aria-label="Copy" title="Copy"><span aria-hidden="true">&#10697;</span></button>';
    }
    function lmHead(block, label) {
      const copy = contentCopyButton('material', block.id, lmState.examOwned ? 'exam-block' : 'lesson', lmState.id, 'lm-icon');
      return '<div class="lm-block-head"><button class="lm-grip" type="button" data-grip="' + block.id + '" aria-label="Move">≡</button><span class="lm-type">' + label + '</span><div class="lm-head-actions"><button class="lm-icon" type="button" data-lm-fold="' + block.id + '" aria-label="Collapse">' + (block.collapsed ? "▸" : "▾") + '</button><button class="lm-icon" type="button" data-lm-up="' + block.id + '" aria-label="Move up">↑</button><button class="lm-icon" type="button" data-lm-down="' + block.id + '" aria-label="Move down">↓</button><button class="lm-icon" type="button" data-lm-menu="' + block.id + '" aria-label="More">⋮</button>' + copy + '<button class="lm-icon danger" type="button" data-lm-del="' + block.id + '" aria-label="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button><div class="lm-pop" data-pop="' + block.id + '" hidden><button type="button" data-lm-edit="' + block.id + '">Edit</button></div></div></div><p class="lm-summary">' + esc(lmSummary(block)) + "</p>";
    }
    function lmQuestions(block) {
      return (block.items || []).map((question, index) => {
        const write = block.type === "exercise" && question.kind === "write";
        const kind = block.type === "exercise" ? '<label>Answer type<select data-item-field="kind" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '"><option value="choice"' + (write ? "" : " selected") + '>Choices</option><option value="write"' + (write ? " selected" : "") + ">Type the answer</option></select></label>" : "";
        const body = write ? '<label class="lm-span">Correct answer<input type="text" data-item-field="write" data-item-list="items" data-block="' + block.id + '" data-item="' + index + '" value="' + esc(question.write || "") + '" /></label>' : lmChoiceEditor(block, index);
        return '<div class="lm-card-row"><div class="lm-card-fields">' + lmItemField(block, "items", index, "prompt", "Question", true) + kind + body + "</div>" + lmItemTools(block.id, "items", index) + "</div>";
      }).join("");
    }
    function lmBody(block) {
      if (block.type === "heading") {
        return '<label>Heading<input type="text" data-field="text" data-block="' + block.id + '" value="' + esc(block.text || "") + '" /></label><label>Level<select data-field="level" data-block="' + block.id + '"><option value="h2"' + (block.level !== "h3" ? " selected" : "") + '>H2</option><option value="h3"' + (block.level === "h3" ? " selected" : "") + ">H3</option></select></label>";
      }
      if (block.type === "text") {
        return lmTextTools(block) + '<div class="lm-rich" contenteditable="true" data-rich="' + block.id + '"' + lmTextStyle(block) + ">" + lmClean(block.html) + "</div>";
      }
      if (block.type === "pdf") return lmFileTitle(block) + lmFileBox(block, "application/pdf,.pdf", "Drop PDF here", "");
      if (block.type === "image") return lmFileBox(block, "image/*", "Drop image here", "image") + '<label>Caption<input type="text" data-field="caption" data-block="' + block.id + '" value="' + esc(block.caption || "") + '" /></label>';
      if (block.type === "audio") return lmFileTitle(block) + lmFileBox(block, "audio/*", "Drop audio here", "audio");
      if (block.type === "file") return lmFileTitle(block) + lmFileBox(block, "*/*", "Drop a file here", "");
      if (block.type === "link") {
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Description<input type="text" data-field="description" data-block="' + block.id + '" value="' + esc(block.description || "") + '" /></label><label>URL<input type="text" data-field="url" data-block="' + block.id + '" value="' + esc(block.url || "") + '" placeholder="https://" /></label>';
      }
      if (block.type === "video") {
        const link = block.source !== "file";
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Source<select data-field="source" data-block="' + block.id + '"><option value="link"' + (link ? " selected" : "") + '>Link</option><option value="file"' + (link ? "" : " selected") + ">File</option></select></label>" + (link ? '<label>URL<input type="text" data-field="url" data-block="' + block.id + '" value="' + esc(block.url || "") + '" placeholder="https://www.youtube.com/watch?v=..." /></label>' : lmFileBox(block, "video/*", "Drop video here", "video"));
      }
      if (block.type === "note") {
        return '<label>Kind<select data-field="tone" data-block="' + block.id + '"><option value="note"' + (block.tone === "tip" ? "" : " selected") + '>Note</option><option value="tip"' + (block.tone === "tip" ? " selected" : "") + ">Tip</option></select></label><label>Text<textarea data-field=\"text\" data-block=\"" + block.id + '">' + esc(block.text || "") + "</textarea></label>";
      }
      if (block.type === "divider") return '<label>Label<input type="text" data-field="label" data-block="' + block.id + '" value="' + esc(block.label || "") + '" placeholder="Optional" /></label><div class="lm-divider">' + esc(block.label || "") + "</div>";
      if (block.type === "reading") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Text<textarea data-field="text" data-block="' + block.id + '">' + esc(block.text || "") + "</textarea></label><p class=\"lm-note\">In Preview, click a word to highlight it.</p>";
      if (block.type === "pronunciation") return '<label>Word<input type="text" data-field="word" data-block="' + block.id + '" value="' + esc(block.word || "") + '" /></label><label>Transcription<input type="text" data-field="ipa" data-block="' + block.id + '" value="' + esc(block.ipa || "") + '" /></label>' + lmFileBox(block, "audio/*", "Drop pronunciation audio", "audio");
      if (block.type === "task") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><label>Instructions<textarea data-field="text" data-block="' + block.id + '">' + esc(block.text || "") + "</textarea></label>";
      if (block.type === "table") {
        const cols = block.columns || [];
        const head = "<tr>" + cols.map((col, c) => '<th><input type="text" data-col="' + block.id + ":" + c + '" value="' + esc(col) + '" /></th>').join("") + "<th></th></tr>";
        const rows = (block.rows || []).map((row, r) => "<tr>" + cols.map((col, c) => '<td><input type="text" data-cell="' + block.id + ":" + r + ":" + c + '" value="' + esc(row[c] || "") + '" /></td>').join("") + '<td><button class="lm-icon danger" type="button" data-row-del="' + block.id + ":" + r + '" aria-label="Delete">×</button></td></tr>').join("");
        return '<table class="lm-grid"><thead>' + head + "</thead><tbody>" + rows + '</tbody></table><button class="lm-add-card" type="button" data-col-add="' + block.id + '">+ Column</button><button class="lm-add-card" type="button" data-col-del="' + block.id + '">− Column</button><button class="lm-add-card" type="button" data-row-add="' + block.id + '">+ Row</button>';
      }
      if (block.type === "vocab") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list">' + lmItemRows(block, "items", [["word", "Word"], ["translation", "Translation"], ["ipa", "Transcription", true], ["example", "Example", true]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':vocab">+ Add word</button>';
      if (block.type === "dialogue") return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list lm-lines">' + lmItemRows(block, "lines", [["speaker", "Speaker"], ["text", "Line"]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':dialogue">+ Add line</button>';
      if (block.type === "phrase") return '<div class="lm-card-list">' + lmItemRows(block, "items", [["phrase", "Phrase"], ["meaning", "Meaning"], ["example", "Example", true]]) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':phrase">+ Add phrase</button>';
      if (block.type === "wordcard") return '<div class="words">' + lmWordCardHtml(block) + "</div>";
      if (block.type === "rule") return lmRuleCardHtml(block, false);
      if (block.type === "exercise") {
        return '<div class="lm-card-list">' + lmQuestions(block) + '</div><button class="lm-add-card" type="button" data-item-add="' + block.id + ':exercise">+ Add question</button>';
      }
      if (block.type === "quiz") {
        return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || lmQuizType(block)) + '" /></label>' + lmQuizItems(block);
      }
      const rows = (block.items || []).map((card, index) => '<div class="lm-card-row"><div class="lm-card-fields"><label>Front<input type="text" data-card-field="front" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.front || "") + '" /></label><label>Back<input type="text" data-card-field="back" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.back || "") + '" /></label><label>Example<input type="text" data-card-field="example" data-block="' + block.id + '" data-card="' + index + '" value="' + esc(card.example || "") + '" /></label></div><div class="lm-card-actions"><button class="lm-icon" type="button" data-card-up="' + block.id + ":" + index + '" aria-label="Move up">↑</button><button class="lm-icon" type="button" data-card-down="' + block.id + ":" + index + '" aria-label="Move down">↓</button><button class="lm-icon danger" type="button" data-card-del="' + block.id + ":" + index + '" aria-label="Delete">×</button></div></div>').join("");
      return '<label>Title<input type="text" data-field="title" data-block="' + block.id + '" value="' + esc(block.title || "") + '" /></label><div class="lm-card-list">' + rows + '</div><button class="lm-add-card" type="button" data-card-add="' + block.id + '">+ Add card</button>';
    }
    function lmEditorLesson() {
      const root = document.getElementById("material");
      const id = root && domEntityId(root.dataset.lmBound);
      if (!id) return lmState;
      if (lmState && lmState.id === id) return lmState;
      if (root.dataset.lmKind === "exam") return null;
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (found) return found;
      return null;
    }
    function lmBindEditor() {
      const root = document.getElementById("material");
      if (root && lmState && lmState.id) {
        root.dataset.lmBound = lmState.id;
        root.dataset.lmKind = lmState.examOwned ? "exam" : "lesson";
      }
      paintPagePath("material");
    }
    function lmRenderEditor() {
      const box = document.getElementById("lmBlocks");
      if (!box || !lmState) return;
      lmBindEditor();
      document.getElementById("lmTitle").value = lmState.title || "";
      document.getElementById("lmDescription").value = lmState.description || "";
      if(!lmState.descriptionFormatting)lmState.descriptionFormatting=lmState.blocks?.find(block=>block.documentFormatting)?.documentFormatting?.description;
      if(lmState.descriptionFormatting&&lmState.blocks[0]){lmState.blocks[0].documentFormatting||={};lmState.blocks[0].documentFormatting.description=lmState.descriptionFormatting;}
      const descriptionField=document.getElementById('lmDescription');
      window.TextColors?.mount(descriptionField,{format:lmState.descriptionFormatting,onChange:format=>{lmState.descriptionFormatting=format;if(lmState.blocks[0]){lmState.blocks[0].documentFormatting||={};lmState.blocks[0].documentFormatting.description=format;}lmSchedule();}});
      window.TextColors?.sync(descriptionField,lmState.descriptionFormatting);
      document.getElementById("lmDate").value = lmState.date || "";
      document.getElementById("lmClass").value = lmState.className || "";
      document.getElementById("lmUnit").value = lmState.unit || "";
      document.getElementById("lmLesson").value = lmState.lesson || "";
      const status = document.getElementById("lmStatus");
      if (status) {
        status.textContent = lmState.published ? "Published" : "Draft";
        status.classList.toggle("is-live", !!lmState.published);
      }
      const labels = { heading: "Heading", text: "Text", pdf: "PDF", link: "Link", cards: "Cards", image: "Image", audio: "Audio", video: "Video", vocab: "Vocabulary", exercise: "Exercise", quiz: "Quiz", note: "Note", dialogue: "Dialogue", reading: "Reading", pronunciation: "Pronunciation", table: "Table", task: "Task", file: "File", divider: "Divider", phrase: "Phrase", wordcard: "Word", rule: "Rule" };
      const blocks = lmBlocksFor();
      box.innerHTML = blocks.length ? blocks.map((block) => {
        const label = block.type === "quiz" ? ("Quiz · " + lmQuizType(block)) : (labels[block.type] || "Block");
        const grading = ["quiz", "exercise", "task"].includes(block.type);
        const assessed = grading && !lmState.examOwned ? '<label><input type="checkbox" data-field="assessed" data-block="' + block.id + '"' + (block.assessed ? ' checked' : '') + '> Assessed task</label>' : '';
        const derived=lmState.examOwned&&examScoringChildren(lmState.blocks,block).length>0;
        const maximum = grading ? '<label class="lm-max-score">Maximum points<input type="text" inputmode="decimal" data-field="maxPoints" data-block="' + block.id + '"'+(derived?' readonly':'')+' value="' + esc(String(derived?examScoringMax(lmState.blocks,block):block.maxPoints??(block.scoringVersion===2?'':assessmentUnitMax(block)))) + '"></label>' : '';
        const head = lmHead(block,label).replace('<div class="lm-head-actions">','<div class="lm-head-actions">' + maximum);
        return '<article class="lm-block' + (block.collapsed ? " is-shut" : "") + '" data-block-id="' + block.id + '">' + head + '<div class="lm-body">' + assessed + assessmentGroupEditor(block) + lmBody(block) + (grading ? '<label>Grading criteria<textarea data-field="criteria" data-block="' + block.id + '" placeholder="Content | 3&#10;Grammar | 2">' + esc(block.criteria || '') + '</textarea></label>' : '') + "</div></article>";
      }).join("") : (lmTab() === "rules" ? '<p class="hint">Nothing on this page yet. Click a grammar topic above to add it.</p>' : '<p class="hint">Nothing on this page yet.</p>');
      box.querySelectorAll('textarea[data-field],input[type=text][data-field],textarea[data-item-field],input[type=text][data-item-field],input[type=text][data-card-field]').forEach(field=>{
        const name=field.dataset.field||field.dataset.itemField||field.dataset.cardField;if(['criteria','url','remoteUrl','ipa','maxPoints','memorySize','answer','write'].includes(name))return;
        const part=lmBlock(field.dataset.block);if(!part)return;const key=[name,field.dataset.item??field.dataset.card??''].join(':');
        window.TextColors?.mount(field,{format:part.textFormatting?.[key],onChange:format=>{part.textFormatting||={};part.textFormatting[key]=format;lmSchedule();}});
      });
      dressWords(box);
      lmPaintChrome();
      lmPaintTabTools();
    }
    function lmPreviewFile(block, label, action, attr) {
      const external = lmExternalFile(block);
      if (external) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><div style="margin-top:8px"><a class="lm-btn lm-btn-primary" href="' + esc(external) + '" target="_blank" rel="noopener noreferrer">' + esc(action) + '</a></div></div>';
      if (block.hasFile === false && !lmSrc(block)) return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + '</b><span>' + esc(block.name || '') + '</span><p class="hint">No file attached.</p></div>';
      return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || label) + "</b><span>" + esc([block.name && block.title ? block.name : "", block.size || ""].filter(Boolean).join(" · ")) + '</span><div style="margin-top:8px"><button class="lm-btn lm-btn-primary" type="button" ' + attr + '="' + block.id + '">' + action + "</button></div></div>";
    }
    function lmPreviewChoices(block, index, question) {
      return (question.options || []).map((opt, oi) => '<label class="lm-opt"><input type="radio" name="pv-' + block.id + "-" + index + '" data-pick="' + block.id + ":" + index + ":" + oi + '"' + (Number(question.picked) === oi ? " checked" : "") + " /> " + esc(opt || "Option") + "</label>").join("");
    }
    function lmPreviewBlock(block) {
      if (block.type === "heading") {
        const tag = block.level === "h3" ? "h3" : "h2";
        return "<" + tag + ">" + esc(block.text || "") + "</" + tag + ">";
      }
      if (block.type === "text") return '<div class="lm-copy"' + lmTextStyle(block) + ">" + lmClean(block.html) + "</div>";
      if (block.type === "link") {
        const media = lmUrlKind(block.url);
        if (media.kind === "video-embed") return lmVideoFrame(media.src, block.title);
        if (media.kind === "video-file") return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame-video"><video controls src="' + esc(media.src) + '"></video></div>';
        if (media.kind === "audio-file") return '<div class="lm-read-pdf"><b>' + esc(block.title || "Audio") + '</b><audio class="lm-player" controls src="' + esc(media.src) + '"></audio></div>';
        if (media.kind === "page") {
          const card = lmLinkCard(block, media.href);
          return block.title ? card.replace('data-link-preview=', 'data-keep-title="1" data-link-preview=') : card;
        }
        return '<a class="lm-read-link" href="#"><b>' + esc(block.title || "Link") + "</b><span>" + esc(block.description || block.url || "") + "</span></a>";
      }
      if (block.type === "pdf") return lmPreviewFile(block, "PDF", "Open PDF", "data-pdf-open");
      if (block.type === "image") {
        const src = lmSrc(block);
        const pic = src ? '<img class="lm-shot" alt="' + esc(block.caption || "") + '" src="' + esc(src) + '" />' : '<div class="lm-shot lm-shot-empty">' + esc(block.name || "Image") + "</div>";
        return '<figure class="lm-figure">' + pic + (block.caption ? "<figcaption>" + esc(block.caption) + "</figcaption>" : "") + "</figure>";
      }
      if (block.type === "audio" || block.type === "pronunciation") {
        const src = lmSrc(block);
        const player = src ? '<audio class="lm-player" controls src="' + esc(src) + '"></audio>' : "<span>" + esc(block.sample ? "Sample clip. Drop a real audio file to play it." : "No audio yet") + "</span>";
        if (block.type === "pronunciation") return '<div class="lm-pron"><b>' + esc(block.word || "Word") + "</b><small>" + esc(block.ipa || "") + "</small>" + player + "</div>";
        return '<div class="lm-read-pdf"><b>' + esc(block.title || block.name || "Audio") + "</b>" + player + "</div>";
      }
      if (block.type === "video") {
        if (block.source === "file" && lmSrc(block)) return '<div class="lm-frame-video"><video controls src="' + esc(lmSrc(block)) + '"></video></div>';
        const media = lmUrlKind(block.url);
        if (media.kind === "video-embed") return lmVideoFrame(media.src, block.title);
        if (media.kind === "video-file") return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame-video"><video controls src="' + esc(media.src) + '"></video></div>';
        if (media.kind === "audio-file") return '<div class="lm-read-pdf"><b>' + esc(block.title || "Audio") + '</b><audio class="lm-player" controls src="' + esc(media.src) + '"></audio></div>';
        if (media.kind === "page") return lmLinkCard(block, media.href);
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-frame lm-shot-empty">' + esc(block.name || "YouTube link or video file") + "</div>";
      }
      if (block.type === "file") return lmPreviewFile(block, "File", "Open file", "data-file-open");
      if (block.type === "note") return '<aside class="lm-callout' + (block.tone === "tip" ? " is-tip" : "") + '"><b>' + (block.tone === "tip" ? "Tip" : "Note") + "</b>" + esc(block.text || "") + "</aside>";
      if (block.type === "divider") return '<div class="lm-divider">' + esc(block.label || "") + "</div>";
      if (block.type === "reading") {
        let n = 0;
        const marks = new Set(block.marks || []);
        const words = esc(block.text || "").replace(/\S+/g, (word) => {
          const on = marks.has(n) ? " is-on" : "";
          const button = '<button type="button" class="lm-word' + on + '" data-read="' + block.id + ":" + n + '">' + word + "</button>";
          n += 1;
          return button;
        });
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-copy lm-reading">' + words + "</div>";
      }
      if (block.type === "task") return "<h3>" + esc(block.title || "Task") + '</h3><p>' + esc(block.text || "") + '</p><label>Your answer<textarea data-response="' + block.id + '">' + esc(block.response || "") + "</textarea></label>";
      if (block.type === "table") {
        const cols = block.columns || [];
        const head = "<tr>" + cols.map((col) => "<th>" + esc(col) + "</th>").join("") + "</tr>";
        const rows = (block.rows || []).map((row) => "<tr>" + cols.map((col, c) => "<td>" + esc(row[c] || "") + "</td>").join("") + "</tr>").join("");
        return "<table><thead>" + head + "</thead><tbody>" + rows + "</tbody></table>";
      }
      if (block.type === "vocab") {
        const restricted = authUser?.role === 'USER' && !viewAccount && lmState.examOwned;
        const rows = (block.items || []).map(row => '<details class="lm-study-card"><summary><b>' + esc(row.word || 'Word') + '</b></summary><div>' + (row.ipa ? '<p>' + esc(row.ipa) + '</p>' : '') + (!restricted ? '<p>' + esc(row.translation || '') + '</p><p>' + esc(row.example || '') + '</p>' : '') + '</div></details>').join('');
        return '<h3>' + esc(block.title || 'Vocabulary') + '</h3><div class="lm-read-cards">' + rows + '</div>';
      }
      if (block.type === "dialogue") {
        const lines = (block.lines || []).map((line) => '<p class="lm-line"><b>' + esc(line.speaker || "") + "</b> " + esc(line.text || "") + "</p>").join("");
        return (block.title ? "<h3>" + esc(block.title) + "</h3>" : "") + '<div class="lm-dialogue">' + lines + "</div>";
      }
      if (block.type === "phrase") {
        const rows = (block.items || []).filter((row) => row.phrase || row.meaning || row.example).map((row) => '<article class="lm-read-card"><b>' + esc(row.phrase || "") + "</b><span>" + esc(row.meaning || "") + "</span><i>" + esc(row.example || "") + "</i></article>").join("");
        return '<div class="lm-read-cards">' + rows + "</div>";
      }
      if (block.type === "exercise") {
        const questions = (block.items || []).map((question, index) => {
          const body = question.kind === "write" ? '<input type="text" data-write="' + block.id + ":" + index + '" value="' + esc(question.typed || "") + '" placeholder="Your answer" />' : lmPreviewChoices(block, index, question);
          const mark = question.marked ? '<p class="lm-result ' + (question.correct ? "is-ok" : "is-no") + '">' + (question.correct ? "Correct" : "Not quite") + "</p>" : "";
          return '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + body + mark + "</div>";
        }).join("");
        return questions + '<button class="lm-btn lm-btn-primary lm-check" type="button" data-ex-check="' + block.id + '">Check</button>';
      }
      if (block.type === "quiz") {
        const kind = lmQuizType(block);
        const title = block.title ? "<h3>" + esc(block.title) + "</h3>" : "<h3>" + esc(kind) + "</h3>";
        if (kind === "Choice" || (!block.quizType && (block.items || []).some((row) => row.options))) {
          const questions = (block.items || []).map((question, index) => '<div class="lm-q"><b>' + esc(question.prompt || "Question") + "</b>" + lmPreviewChoices(block, index, question) + "</div>").join("");
          return title + questions + '<button class="lm-btn lm-btn-primary lm-check" type="button" data-quiz-check="' + block.id + '">Check</button><p class="lm-result" data-quiz-score="' + block.id + '">' + esc(block.score || "") + "</p>";
        }
        const cards = (block.items || []).map((item) => {
          if (kind === "Flip" || kind === "Reverse") return '<article class="lm-read-card"><b>' + esc(item.front || "") + "</b><span>" + esc(item.back || "") + "</span></article>";
          if (kind === "Type" || kind === "Listen" || kind === "Definition") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc(item.answer || "") + "</span></article>";
          if (kind === "Gap") return '<article class="lm-read-card"><b>' + esc(item.shown || "") + "</b><span>" + esc(item.answer || "") + "</span><i>" + esc(item.hint || "") + "</i></article>";
          if (kind === "Build") return '<article class="lm-read-card"><b>' + esc(item.parts || "") + "</b><span>" + esc(item.answer || "") + "</span></article>";
          if (kind === "Match" || kind === "Memory") return '<article class="lm-read-card"><b>' + esc(item.left || "") + "</b><span>" + esc(item.right || "") + "</span></article>";
          if (kind === "True / false") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc(String(item.answer) === "false" ? "False" : "True") + "</span></article>";
          if (kind === "Tap") return '<article class="lm-read-card"><b>' + esc(item.text || "") + '</b><span>Tap: ' + esc(item.answer || "") + '</span></article>';
          if (kind === "Select all") return '<article class="lm-read-card"><b>' + esc(item.prompt || "") + "</b><span>" + esc((item.options || []).filter(Boolean).join(" · ")) + "</span></article>";
          if (kind === "Spell" || kind === "Letters" || kind === "Hangman") return '<article class="lm-read-card"><b>' + esc(item.word || "") + "</b></article>";
          if (kind === "Odd one out") return '<article class="lm-read-card"><b>' + esc((item.options || []).filter(Boolean).join(" · ")) + '</b><span>Odd: ' + esc((item.options || [])[Number(item.answer)] || "") + '</span></article>';
          return '<article class="lm-read-card"><b>' + esc(item.prompt || item.front || item.word || "") + "</b></article>";
        }).join("");
        return title + '<p class="lm-note">' + esc(kind) + (kind === "Memory" ? " · " + (block.memorySize || 4) + " pairs" : "") + '</p><div class="lm-read-cards">' + cards + "</div>";
      }
      if (block.type === "wordcard") return '<div class="words">' + lmWordCardHtml(block) + "</div>";
      if (block.type === "rule") return lmRuleCardHtml(block, true);
      const cards = (block.items || []).filter((card) => card.front || card.back || card.example).map((card) => '<article class="lm-read-card"><b>' + esc(card.front || "") + "</b><span>" + esc(card.back || "") + "</span><i>" + esc(card.example || "") + "</i></article>").join("");
      return "<h3>" + esc(block.title || "Vocabulary") + '</h3><div class="lm-read-cards">' + cards + "</div>";
    }
    function lmPreviewParts(blocks) {
      const grouped = new Map();
      for (const part of blocks) { const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (!grouped.has(key)) grouped.set(key,[]); grouped.get(key).push(part); }
      const assignments = new Map();
      const taskKeys = new Set((lmState.blocks || []).filter(part => ['quiz','exercise','task'].includes(part.type)).map(part => part.assignmentKey || part.assignmentId || ('part-' + part.id)));
      for (const part of lmState.blocks || []) { const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (taskKeys.has(key) && !assignments.has(key)) assignments.set(key,assignments.size + 1); }
      return [...grouped].map(([key,parts]) => {
        const content = lmPreviewPartsFlat(parts), number = assignments.get(key);
        if (!number) return content;
        const leader = parts.find(p => p.assignmentId === key && ['quiz','exercise','task'].includes(p.type)) || parts.find(p => ['quiz','exercise','task'].includes(p.type));
        return '<div class="lm-assignment lm-assignment-tone-' + ((number - 1) % 4) + '" data-assignment="' + esc(key) + '"><header><h3>Task ' + number + (leader?.title ? ' · ' + esc(leader.title) : '') + '</h3></header>' + content + '</div>';
      }).join('');
    }
    function lmPreviewPartsFlat(blocks) {
      let html = "";
      let cards = [];
      const flush = () => {
        if (!cards.length) return;
        html += '<div class="lm-panel"><div class="words">' + cards.join("") + "</div></div>";
        cards = [];
      };
      blocks.forEach((block) => {
        if (block.type === "wordcard") {
          const copy = contentCopyButton('material',block.id,lmState.examOwned?'exam-block':'lesson',lmState.id);
          cards.push(copy ? '<div class="lm-copy-word"><div class="lm-copy-tools">' + copy + '</div>' + lmWordCardHtml(block) + '</div>' : lmWordCardHtml(block));
        }
        else {
          flush();
          const copy = contentCopyButton('material',block.id,lmState.examOwned?'exam-block':'lesson',lmState.id);
          html += '<div class="lm-panel" data-lm-panel="' + block.id + '">' + (copy ? '<div class="lm-copy-tools">' + copy + '</div>' : '') + lmPreviewBlock(block) + "</div>";
        }
      });
      flush();
      return html;
    }
    function lmRenderPreview() {
      const box = document.getElementById("lmPreview");
      if (!box || !lmState) return;
      const parts = lmPreviewParts(lmBlocksFor());
      const when = lmLongDate(lmState.date);
      box.innerHTML = '<article class="lm-read">' + (when ? '<p class="lm-read-date">' + esc(when) + "</p>" : "") + '<h2 class="lm-read-title">' + esc(lmState.title || "Lesson") + "</h2>" + lmCourseHtml(lmState) + '<p class="lm-read-lead">' + window.TextColors.html(lmState.description||'',lmState.descriptionFormatting||lmState.blocks?.find(part=>part.documentFormatting)?.documentFormatting?.description) + "</p>" + lmChromeHtml() + parts + "</article>";
      dressWords(box);
      box.querySelectorAll('.lm-read-card').forEach(card => {
        const title = card.querySelector('b'), details = document.createElement('details'); details.className = 'lm-study-card';
        const summary = document.createElement('summary'); if (title) summary.append(title); else summary.textContent = 'Card';
        details.append(summary); while (card.firstChild) details.append(card.firstChild); card.replaceWith(details);
      });
      lmHydrateLinkPreviews(box);
      box.querySelectorAll('[data-lm-panel]').forEach(panel=>{const part=lmState.blocks.find(part=>String(part.id)===panel.dataset.lmPanel);if(part)window.TextColors?.paint(panel,part);});
    }
    function lmChromeHtml() {
      const tab = lmTab();
      const counts = lmBlockCounts(lmState);
      const tabs = [["overview", "Overview"], ["words", "Words · " + counts.words], ["phrases", "Phrases · " + counts.phrases], ["rules", "Rules · " + counts.rules]];
      const tools = [["quiz", "Day quiz", false], ["classwork", "Classwork", true], ["homework", "Homework", true], ["pdf", "Lesson PDF", true]];
      const tabBtns = tabs.map(pair => '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? 'on' : '') + '" role="tab" aria-selected="' + (pair[0] === tab ? 'true' : 'false') + '">' + pair[1] + '</button>').join('');
      const toolBtns = tools.map((pair) => {
        if (pair[2]) {
          return '<button type="button" data-lm-tab="' + pair[0] + '" class="' + (pair[0] === tab ? "on" : "") + '" role="tab" aria-selected="' + (pair[0] === tab ? "true" : "false") + '">' + pair[1] + "</button>";
        }
        return '<button type="button" data-lm-tool="' + pair[0] + '">' + pair[1] + "</button>";
      }).join("");
      return '<div class="lm-chrome"><div class="seg" role="tablist" aria-label="This lesson">' + tabBtns + '</div><div class="lm-daytools" role="tablist" aria-label="Lesson tools">' + toolBtns + '</div></div>';
    }
    function lmQuizCards() {
      if (!lmState) return [];
      const seen = new Set();
      const cards = [];
      (lmState.blocks || []).forEach((block) => {
        if (block.type !== "wordcard") return;
        const tab = block.tab || "overview";
        if (tab !== "words" && tab !== "phrases") return;
        const en = String(block.word || "").trim();
        const key = en.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        const looked = cardQuizLookup(en) || {};
        const data = block.data && typeof block.data === "object" ? block.data : {};
        const cam = data.cambridge && typeof data.cambridge === "object" ? data.cambridge : {};
        const usages = Array.isArray(data.usages) ? data.usages : [];
        const usageEn = (usages.find((row) => row && row.en) || {}).en || "";
        const camEx = Array.isArray(cam.examples) ? cam.examples.find((row) => row) : "";
        const ex = String(usageEn || (typeof camEx === "string" ? camEx : (camEx && camEx.en)) || looked.ex || "").trim();
        cards.push({
          quizKey: block.quizKey,
          en: looked.en || en,
          ru: block.ru || looked.ru || "",
          pos: block.pos || cam.pos || looked.pos || "",
          uk: block.uk || looked.uk || "",
          us: block.us || looked.us || "",
          ex: ex,
          gloss: cam.definition || looked.gloss || "",
          gap: looked.gap || ""
        });
      });
      return cards;
    }
    function lmOpenDayQuiz() {
      lmEnsure();
      if (!lmState) return;
      // Only words/phrases from this material. Custom quizzes weave in per card at Start.
      const cards = lmQuizCards();
      dayPoolOverride = cards;
      dayPoolStrict = true;
      dayQuizPlace = "material";
      studyTitle = "This day's quiz";
      studyScreen = "daysetup";
      dayReturn = "material";
      document.getElementById("daySetupTitle").textContent = "This day's quiz";
      document.getElementById("daySetupBack").dataset.fallback = "material";
      document.getElementById("dayqBack").dataset.fallback = "material";
      const label = lmState.title || lmLongDate(lmState.date) || "Lesson";
      paintDaySetupNote(label, cards, label + " · no cards yet. Add words or phrases first.");
      visit("daysetup");
    }
    function lmPaintChrome() {
      const slot = document.getElementById("lmChromeSlot");
      if (slot) slot.innerHTML = lmChromeHtml();
    }
    let lmGrammarArea = "";
    function lmPaintGrammar() {
      const box = document.getElementById("lmGrammarNav");
      if (!box) return;
      const data = window.GRAMMAR;
      if (!data || !data.areas) {
        box.innerHTML = '<p class="hint">Grammar is not loaded.</p>';
        return;
      }
      if (!lmGrammarArea) {
        const areas = data.areas.map((area) => '<button class="g-area tone-' + esc(area.tone || "advanced") + '" type="button" data-lm-area="' + esc(area.id) + '"><b>' + esc(area.title) + '</b><span class="label">' + esc(area.blurb || "") + "</span></button>").join("");
        const compare = (data.comparisons || []).length ? '<button class="g-area tone-advanced" type="button" data-lm-area="compare"><b>Often confused</b><span class="label">Pairs of rules that are easy to mix up.</span></button>' : "";
        box.innerHTML = '<p class="label">Grammar</p><div class="lm-grammar">' + areas + compare + "</div>";
        return;
      }
      if (lmGrammarArea === "compare") {
        const rows = (data.comparisons || []).map((item) => {
          const have = lmState.blocks.some((block) => block.type === "rule" && block.compare && block.topic === item.id);
          return '<button class="g-topic tone-' + esc(item.tone || "advanced") + '" type="button" data-lm-rule="' + esc(item.id) + '" data-lm-compare="1"' + (have ? " disabled" : "") + "><b>" + esc(item.title) + '</b><span class="form">compare</span></button>';
        }).join("");
        box.innerHTML = '<button class="lm-btn lm-grammar-back" type="button" data-lm-area="">← Grammar</button><p class="g-head">Often confused</p><p class="hint">Click a pair to add it to this lesson.</p>' + rows;
        return;
      }
      const area = areaById(lmGrammarArea);
      if (!area) { lmGrammarArea = ""; lmPaintGrammar(); return; }
      let html = '<button class="lm-btn lm-grammar-back" type="button" data-lm-area="">← Grammar</button><p class="label">' + esc(area.title) + '</p><p class="hint">Click a topic to add it to this lesson.</p>';
      (area.groups || []).forEach((group) => {
        html += '<p class="g-head tone-' + esc(group.tone || area.tone || "advanced") + '">' + esc(group.title) + "</p>";
        html += (group.items || []).map((itemId) => {
          const topic = topicById(itemId);
          if (!topic) return "";
          const have = lmState.blocks.some((block) => block.type === "rule" && !block.compare && block.topic === itemId && (block.tab || "rules") === "rules");
          return '<button class="g-topic tone-' + esc(topic.tone || group.tone || area.tone || "advanced") + '" type="button" data-lm-rule="' + esc(itemId) + '"' + (have ? " disabled" : "") + "><b>" + esc(topic.name) + '</b><span class="form">' + esc(topic.form || "") + "</span></button>";
        }).join("");
      });
      box.innerHTML = html;
    }
    function lmPaintTabTools() {
      const tab = lmTab();
      const names = { overview: "Overview", words: "Words", phrases: "Phrases", rules: "Rules", classwork: "Classwork", homework: "Homework", pdf: "Lesson PDF" };
      const title = document.getElementById("lmPageTitle");
      if (title) title.textContent = names[tab] || "Overview";
      const word = document.getElementById("lmWordAdd");
      const rule = document.getElementById("lmRuleAdd");
      if (word) word.hidden = tab !== "words" && tab !== "phrases";
      if (rule) rule.hidden = tab !== "rules";
      if (tab === "rules") lmPaintGrammar();
    }
    function lmSelectTab(id) {
      if (!lmState || !id) return;
      if (lmTab() === id && lmState.tab) return;
      stopPageMedia(document.getElementById('material'));
      lmState.tab = id;
      if (id !== "rules") lmGrammarArea = "";
      const status = document.getElementById("lmWordStatus");
      if (status) { status.textContent = ""; status.classList.remove("bad"); }
      const picker = document.getElementById("lmPicker");
      if (picker) picker.hidden = true;
      const editing = lmState.mode !== "preview" && canEditLessons();
      if (editing) {
        document.querySelectorAll("#lmChromeSlot [data-lm-tab]").forEach((btn) => {
          const on = btn.getAttribute("data-lm-tab") === id;
          btn.classList.toggle("on", on);
          btn.setAttribute("aria-selected", on ? "true" : "false");
        });
        lmRenderEditor();
      } else { lmRenderPreview(); examDress(); }
    }
    function lmMoveTabBlock(id, dir) {
      id = domEntityId(id);
      const ids = lmBlocksFor().map((block) => block.id);
      const at = ids.indexOf(id);
      const next = at + dir;
      if (at < 0 || next < 0 || next >= ids.length) return;
      const from = lmState.blocks.findIndex((block) => block.id === ids[at]);
      const to = lmState.blocks.findIndex((block) => block.id === ids[next]);
      const item = lmState.blocks[from];
      lmState.blocks[from] = lmState.blocks[to];
      lmState.blocks[to] = item;
    }
    function lmInsertBlockFront(block) {
      if (!lmState) return;
      if (!Array.isArray(lmState.blocks)) lmState.blocks = [];
      const tab = block.tab || "overview";
      const at = lmState.blocks.findIndex((row) => (row.tab || "overview") === tab);
      if (at < 0) lmState.blocks.push(block);
      else lmState.blocks.splice(at, 0, block);
    }
    function lmSortWordcardsForPublish() {
      if (!lmState || !Array.isArray(lmState.blocks)) return;
      ["words", "phrases"].forEach((tab) => {
        const indices = [];
        const cards = [];
        lmState.blocks.forEach((block, index) => {
          if (block.type === "wordcard" && (block.tab || "overview") === tab) {
            indices.push(index);
            cards.push(block);
          }
        });
        if (cards.length < 2) return;
        cards.sort((a, b) => {
          const aa = Number(a.addedAt) || 0;
          const bb = Number(b.addedAt) || 0;
          if (aa && bb && aa !== bb) return aa - bb;
          if (aa && !bb) return 1;
          if (!aa && bb) return -1;
          return 0;
        });
        indices.forEach((index, n) => { lmState.blocks[index] = cards[n]; });
      });
    }
    async function lmLookupWord() {
      const input = document.getElementById("lmWordInput");
      const status = document.getElementById("lmWordStatus");
      const button = document.getElementById("lmWordGo");
      const write = (text, bad) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (!input || !lmState) return;
      const word = input.value.trim();
      const tab = lmTab();
      if (tab !== "words" && tab !== "phrases") return;
      if (!word) { write("Type one word.", true); return; }
      write("Looking up the dictionaries…", false);
      if (button) button.disabled = true;
      try {
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (!res.ok || !data.found) { write((data && data.error) || "No such word or phrase.", true); return; }
        const key = String(data.word || word).toLowerCase();
        if (lmBlocksFor(tab).some((block) => block.type === "wordcard" && String(block.word || "").toLowerCase() === key)) {
          write("Already on this page.", true);
          return;
        }
        const cam = data.cambridge || {};
        const wh = data.wooordhunt || {};
        lmInsertBlockFront({
          id: lmId(),
          type: "wordcard",
          tab: tab,
          collapsed: false,
          addedAt: Date.now(),
          word: data.word || word,
          ru: data.ru || "",
          pos: cam.pos || "",
          uk: cam.uk || wh.uk || "",
          us: cam.us || wh.us || "",
          data: data
        });
        input.value = "";
        write("", false);
        lmRenderEditor();
        lmSchedule();
        const first = document.querySelector('#lmBlocks [data-block-id]');
        if (first) first.scrollIntoView({ block: "nearest" });
      } catch (err) {
        write("The dictionary lookup is not running. Start it, then try again.", true);
      } finally {
        if (button) button.disabled = false;
      }
    }
    function lmShow(mode) {
      if (!canEditLessons()) mode = "preview";
      if (viewAccount && assessmentActive(lmState)) mode = "preview";
      lmState.mode = mode;
      const editing = mode !== "preview";
      document.getElementById("lmEditor").hidden = !editing;
      document.getElementById("lmPreview").hidden = editing;
      document.getElementById("lmEditBack").hidden = editing || !canEditLessons() || !!viewAccount && assessmentActive(lmState);
      document.getElementById("lmSave").hidden = !editing;
      document.getElementById("lmPublish").hidden = !editing;
      const copy = document.getElementById("lmCopy");
      if (copy) {
        copy.hidden = !canEditLessons() || !Number.isSafeInteger(lmState.id) || lmState.id < 1;
        copy.dataset.contentCopy = (lmState.examOwned ? "exam-block" : "lesson") + ":" + lmState.id;
      }
      const heading = document.querySelector("#material .lm-meta h1");
      if (heading) heading.textContent = editing ? "Learning material" : (lmLongDate(lmState.date) || lmState.title || "Lesson");
      lmPaintChrome();
      lmBindEditor();
      if (editing) lmRenderEditor();
      else lmRenderPreview();
      examDress();
      if (assessmentActive(lmState) && !editing && (!canEditLessons() || canTuneStudentLessons()) && !lmState.assessmentReady) assessmentRead(lmState);
      const top = document.getElementById("material");
      if (top) top.scrollIntoView({ block: "start" });
    }
    function lmMove(list, index, dir) {
      const next = index + dir;
      if (next < 0 || next >= list.length) return;
      const item = list.splice(index, 1)[0];
      list.splice(next, 0, item);
    }
    function lmNote(text) {
      const note = document.getElementById("lmNote");
      if (!note) return;
      note.textContent = text;
      note.classList.toggle("is-ok", !!(lmState && lmState.examOwned && text === "Draft saved."));
    }
    function lmTakeFile(id, file) {
      const block = lmBlock(id);
      if (!block || !file) return;
      block.name = file.name;
      block.size = lmFileSize(file.size);
      block.sample = false;
      block.hasFile = true;
      block.fileType = file.type || "";
      if (lmFiles[id]) URL.revokeObjectURL(lmFiles[id]);
      lmFiles[id] = URL.createObjectURL(file);
      lmRenderEditor();
      lmSchedule();
      lmUploadFile(id, file).then((ok) => {
        if (!ok) {
          block.hasFile = false;
          lmNote("The file stayed in this browser only. Check the connection and drop it again.");
        } else {
          lmPersist();
        }
      });
    }
    function lmClearFile(id) {
      const block = lmBlock(id);
      if (block) { block.name = ""; block.size = ""; block.sample = false; block.hasFile = false; block.fileType = ""; }
      if (lmFiles[id]) { URL.revokeObjectURL(lmFiles[id]); delete lmFiles[id]; }
      lmDeleteRemoteFile(id);
      lmRenderEditor();
      lmSchedule();
    }
    async function lmResolveFile(id) {
      if (lmFiles[id]) return lmFiles[id];
      try {
        const res = await fetch(lmFileUrl(id), { credentials: "include" });
        if (!res.ok) return "";
        const blob = await res.blob();
        lmFiles[id] = URL.createObjectURL(blob);
        return lmFiles[id];
      } catch (e) {
        return "";
      }
    }
    function lmList(block, name) {
      if (name === "lines") return block.lines || (block.lines = []);
      return block.items || (block.items = []);
    }
    function lmEnsure() {
      if (lmState && lmState.examOwned) {
        if (!lmLibrary) lmLibrary = lmLoadLibrary();
        return;
      }
      if (lmLibrary && lmState) return;
      if (!lmLibrary) lmLibrary = lmLoadLibrary();
      lmState = lmLibrary.materials.find((row) => row.id === lmLibrary.activeId) || lmLibrary.materials[0] || null;
      if (lmState) lmLibrary.activeId = lmState.id;
    }
    function loadHiddenLessons() {
      try {
        const list = JSON.parse(localStorage.getItem(HIDDEN_LESSONS_KEY) || "[]");
        return Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    }
    function saveHiddenLessons(list) {
      const next = Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(HIDDEN_LESSONS_KEY, JSON.stringify(next)); } catch (e) {}
      syncChange({ op: "put-setting", key: "hiddenLessons", value: next });
      flushUserState();
      return next;
    }
    function installHiddenLessons(value) {
      const list = Array.isArray(value) ? value.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(HIDDEN_LESSONS_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function loadAllowedLessons() {
      try {
        const list = JSON.parse(localStorage.getItem(ALLOWED_LESSONS_KEY) || "[]");
        return Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      } catch (e) {
        return [];
      }
    }
    function saveAllowedLessons(list) {
      const next = Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(ALLOWED_LESSONS_KEY, JSON.stringify(next)); } catch (e) {}
      syncChange({ op: "put-setting", key: "allowedLessons", value: next });
      flushUserState();
      return next;
    }
    function installAllowedLessons(value) {
      const list = Array.isArray(value) ? value.map((id) => String(id || "").trim()).filter(Boolean) : [];
      try { localStorage.setItem(ALLOWED_LESSONS_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function lmHiddenForStudent(id) {
      return loadHiddenLessons().indexOf(String(id || "")) >= 0;
    }
    function lmAllowedForStudent(id) {
      return loadAllowedLessons().indexOf(String(id || "")) >= 0;
    }
    function lmToggleIdInList(list, id) {
      const next = list.slice();
      const at = next.indexOf(id);
      if (at >= 0) next.splice(at, 1);
      else next.push(id);
      return next;
    }
    function lmLessonHidden(material) {
      if (!material) return false;
      if (viewAccount || (authUser && authUser.role === "USER")) {
        if (material.hiddenFromStudents) return !lmAllowedForStudent(material.id);
        return lmHiddenForStudent(material.id);
      }
      return !!material.hiddenFromStudents;
    }
    function lmLessonVisibleToViewer(material) {
      if (!material) return false;
      if (!viewAccount && authUser && authUser.login === "TsovakDev") return true;
      if (canEditLessons() || (canTuneStudentLessons() && material.published)) return true;
      if (!material.published) return false;
      if (material.hiddenFromStudents && !lmAllowedForStudent(material.id)) return false;
      if (lmHiddenForStudent(material.id)) return false;
      return true;
    }
    function paintLmDays() {
      const box = document.getElementById("lmDayList");
      const newer = document.getElementById("lmNew");
      if (newer) newer.hidden = !canEditLessons();
      if (!box) return;
      lmEnsure();
      groupNormalize();
      const group = classGroups.find((row) => row.id === classGroupId) || classGroups[0];
      const title = document.getElementById("lmGroupTitle");
      if (title) title.textContent = group?.title || "Lessons";
      const name = document.getElementById("lmGroupName");
      if (name) name.innerHTML = metricPairs([['students',group?.studentCount||0],['lessons',(group?.lessonIds||[]).filter(id=>lmLibrary.materials.some(row=>row.id===id&&lmLessonVisibleToViewer(row))).length]]);
      paintPagePath("days");
      const groupLessons = new Set(group ? group.lessonIds : []);
      const rows = lmLibrary.materials.filter((row) => groupLessons.has(row.id) && lmLessonVisibleToViewer(row)).slice().sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return -1;
        if (!b.date) return 1;
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      box.innerHTML = rows.map((material) => {
        const chip = lmDateChip(material.date);
        const globalHidden = !!material.hiddenFromStudents;
        const personalHidden = viewAccount && !globalHidden ? lmHiddenForStudent(material.id) : false;
        const personalAllowed = viewAccount && globalHidden ? lmAllowedForStudent(material.id) : false;
        const hidden = lmLessonHidden(material);
        let about = material.published ? "Published lesson" : "Draft";
        if (viewAccount && globalHidden) about = personalAllowed ? "Hidden · allowed for this student" : "Hidden from students";
        else if (globalHidden) about = "Hidden from students";
        else if (personalHidden) about = "Hidden for this student";
        const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
        const eye = hidden
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
        let hideLabel = globalHidden ? "Show to students" : "Hide from students";
        if (viewAccount) {
          if (globalHidden) hideLabel = personalAllowed ? "Remove access for this student" : "Allow for this student";
          else hideLabel = personalHidden ? "Show to this student" : "Hide for this student";
        }
        const tools = (canEditLessons() || canTuneStudentLessons())
          ? '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-lm-hide="' + material.id + '" aria-label="' + hideLabel + '" title="' + hideLabel + '">' + eye + '</button>' +
            (canEditLessons() ? contentCopyButton('lesson',material.id) + '<button class="day-del" type="button" data-lm-delete="' + material.id + '" aria-label="Delete lesson">' + trash + "</button>" : "") +
            "</div>"
          : "";
        const course = lmCourseBits(material);
        const courseHtml = course.length ? '<span class="label lm-course">' + course.map((pair) => "<b>" + esc(pair[0]) + "</b> " + esc(lmCourseValue(pair[0], pair[1]))).join('<span class="dot"> · </span>') + "</span>" : "";
        return '<div class="day-row' + (hidden ? " is-hidden" : "") + '"><button class="day" type="button" data-lm-open="' + material.id + '"><span class="date"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(material.title || "Untitled lesson") + "</b>" + courseHtml + '<span class="label about">' + esc(about) + "</span></button>" + tools + "</div>";
      }).join("");
    }
    function lmOpenLesson(id) {
      id = domEntityId(id);
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (!found) return;
      if (!lmLessonVisibleToViewer(found)) return;
      const group = classGroups.find((row) => row.lessonIds.includes(id));
      if (group) classGroupId = group.id;
      lmState = found;
      lmLibrary.activeId = id;
      found.mode = canEditLessons() && !found.published ? "edit" : "preview";
      visit("material");
    }
    function lmKeepLesson() {
      if (lmState && lmState.examOwned) { examSync(); return; }
      const index = lmLibrary.materials.findIndex((row) => row.id === lmState.id);
      if (index < 0) lmLibrary.materials.unshift(lmState);
      else lmLibrary.materials[index] = lmState;
      lmLibrary.activeId = lmState.id;
    }
    function lmDeleteLesson(id) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      lmEnsure();
      const found = lmLibrary.materials.find((row) => row.id === id);
      const unsaved = !found && lmState && lmState.id === id;
      if (!found && !unsaved) return;
      if (!confirm("Move this lesson to Archive?")) return;
      if (found) {
        lmLibrary.materials = lmLibrary.materials.filter((row) => row.id !== id);
        if (!Array.isArray(lmLibrary.removed)) lmLibrary.removed = [];
        if (lmLibrary.removed.indexOf(id) < 0) lmLibrary.removed.push(id);
        if (!lmLibrary.materials.some((row) => row.id === lmLibrary.activeId)) lmLibrary.activeId = lmLibrary.materials[0] ? lmLibrary.materials[0].id : "";
        try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
        classGroups.forEach((group) => { group.lessonIds = group.lessonIds.filter((lessonId) => lessonId !== id); });
        groupSave();
        lmSchedulePush();
      }
      if (lmState && lmState.id === id) lmState = null;
      const on = document.querySelector("section.on");
      if (on && on.id === "material") show("days");
      else paintLmDays();
    }
    function lmHideLesson(id) {
      id = domEntityId(id);
      if (!canEditLessons() && !canTuneStudentLessons()) return;
      lmEnsure();
      if (viewAccount) {
        const found = lmLibrary.materials.find((row) => row.id === id);
        if (found && found.hiddenFromStudents) {
          saveAllowedLessons(lmToggleIdInList(loadAllowedLessons(), id));
        } else {
          saveHiddenLessons(lmToggleIdInList(loadHiddenLessons(), id));
        }
        paintLmDays();
        return;
      }
      const found = lmLibrary.materials.find((row) => row.id === id);
      if (!found) return;
      found.hiddenFromStudents = !found.hiddenFromStudents;
      if (lmState && lmState.id === id) lmState.hiddenFromStudents = found.hiddenFromStudents;
      try { localStorage.setItem(LM_KEY, JSON.stringify(lmLibrary)); } catch (e) {}
      paintLmDays();
    }
    function lmCreateLesson() {
      if (!canEditLessons()) return;
      lmEnsure();
      const fresh = lmBlankMaterial();
      fresh.id = lmUniqueId();
      fresh.date = lmToday();
      groupNormalize();
      const group = classGroups.find((row) => row.id === classGroupId) || classGroups[0];
      if (group && !group.lessonIds.includes(fresh.id)) group.lessonIds.push(fresh.id);
      lmState = fresh;
      fresh.mode = "edit";
      lmKeepLesson();
      visit("material");
    }
    function paintMaterial() {
      lmEnsure();
      if (!lmState) { show("days"); return; }
      lmShow(lmState.mode === "preview" ? "preview" : "edit");
    }
    window.paintLmDays = paintLmDays;
    window.lmOpenLesson = lmOpenLesson;
    window.lmDeleteLesson = lmDeleteLesson;
    window.lmHideLesson = lmHideLesson;
    window.lmOpenDayQuiz = lmOpenDayQuiz;
    window.paintMaterial = paintMaterial;
    const lmRoot = document.getElementById("material");
    if (lmRoot) {
      lmRoot.addEventListener("mousedown", (event) => {
        const tool = event.target.closest("[data-cmd], [data-font], [data-font-size], [data-font-family], [data-lm-color]");
        if (!tool) return;
        const tools = tool.closest(".lm-tools");
        const rich = tools && tools.nextElementSibling;
        const sel = window.getSelection();
        if (rich && sel && sel.rangeCount && rich.contains(sel.anchorNode)) lmFontRange = sel.getRangeAt(0).cloneRange();
        else lmFontRange = null;
        if (event.target.closest("[data-cmd], [data-font]")) event.preventDefault();
      });
      lmRoot.addEventListener("input", (event) => {
        const lesson = lmEditorLesson();
        if (!lesson) return;
        if (lmState !== lesson) lmState = lesson;
        const meta = event.target.closest("[data-meta]");
        if (meta && lmState) { lmState[meta.dataset.meta] = meta.value; lmSchedule(); return; }
        const field = event.target.closest("[data-field]");
        if (field) {
          const block = lmBlock(field.dataset.block);
          if (block) {
            if (field.dataset.field === "memorySize") block.memorySize = Math.max(2, Number(field.value) || 4);
            else block[field.dataset.field] = field.type === "checkbox" ? field.checked : field.value;
            if (['maxPoints','criteria'].includes(field.dataset.field)) {block.gradeMode = 'assignment';if(lmState.examOwned)block.scoringVersion=2;}
            if (field.dataset.field === 'assignmentKey' && field.value) {
              const leader = lesson.blocks.find(part => part.assignmentId === field.value);
              if (leader) { block.tab = leader.tab || 'overview'; if (['quiz','exercise','task'].includes(block.type)) block.gradeMode = 'assignment'; leader.gradeMode = 'assignment'; }
            }
          }
          if (field.tagName === "SELECT") lmRenderEditor();
          lmSchedule();
          return;
        }
        const cardField = event.target.closest("[data-card-field]");
        if (cardField) {
          const block = lmBlock(cardField.dataset.block);
          const card = block && block.items && block.items[Number(cardField.dataset.card)];
          if (card) card[cardField.dataset.cardField] = cardField.value;
          lmSchedule();
          return;
        }
        const itemField = event.target.closest("[data-item-field]");
        if (itemField) {
          const block = lmBlock(itemField.dataset.block);
          const list = block && lmList(block, itemField.dataset.itemList);
          const item = list && list[Number(itemField.dataset.item)];
          if (item) item[itemField.dataset.itemField] = itemField.value;
          if (itemField.tagName === "SELECT") lmRenderEditor();
          lmSchedule();
          return;
        }
        const opt = event.target.closest("input[data-opt]");
        if (opt) {
          const bits = opt.dataset.opt.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.options[Number(bits[2])] = opt.value;
          lmSchedule();
          return;
        }
        const col = event.target.closest("[data-col]");
        if (col) {
          const bits = col.dataset.col.split(":");
          const block = lmBlock(bits[0]);
          if (block && block.columns) block.columns[Number(bits[1])] = col.value;
          lmSchedule();
          return;
        }
        const cell = event.target.closest("[data-cell]");
        if (cell) {
          const bits = cell.dataset.cell.split(":");
          const block = lmBlock(bits[0]);
          const row = block && block.rows && block.rows[Number(bits[1])];
          if (row) row[Number(bits[2])] = cell.value;
          lmSchedule();
          return;
        }
        const response = event.target.closest("[data-response]");
        if (response) { const block = lmBlock(response.dataset.response); if (block) block.response = response.value; lmSchedule(); return; }
        const write = event.target.closest("[data-write]");
        if (write) {
          const bits = write.dataset.write.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.typed = write.value;
          lmSchedule();
          return;
        }
        const rich = event.target.closest("[data-rich]");
        if (rich) { const block = lmBlock(rich.dataset.rich); if (block) block.html = rich.innerHTML; lmSchedule(); }
      });
      lmRoot.addEventListener("change", (event) => {
        const palette=event.target.closest('[data-lm-color]');
        if(palette){
          const rich=palette.closest('.lm-tools').nextElementSibling,block=lmBlock(palette.dataset.lmColor),range=lmActiveFontRange(rich);
          rich.focus();if(range){const span=document.createElement('span');span.style.color=palette.value;span.append(range.extractContents());range.insertNode(span);range.selectNodeContents(span);const selected=getSelection();selected.removeAllRanges();selected.addRange(range);}
          else{block.textColor=palette.value;rich.style.color=palette.value;}
          block.html=rich.innerHTML;lmSchedule();return;
        }
        const fontSize = event.target.closest("[data-font-size]");
        if (fontSize) {
          const rich = fontSize.closest(".lm-tools") && fontSize.closest(".lm-tools").nextElementSibling;
          const block = lmBlock(fontSize.dataset.fontSize);
          const size = Math.min(96, Math.max(10, Math.round(Number(fontSize.value) || 17)));
          fontSize.value = size;
          lmApplyTextFont(rich, block, { size: size });
          return;
        }
        const fontFamily = event.target.closest("[data-font-family]");
        if (fontFamily) {
          const rich = fontFamily.closest(".lm-tools") && fontFamily.closest(".lm-tools").nextElementSibling;
          const block = lmBlock(fontFamily.dataset.fontFamily);
          lmApplyTextFont(rich, block, { family: fontFamily.value });
          return;
        }
        const file = event.target.closest("[data-file], [data-pdf]");
        if (file && file.files && file.files[0]) lmTakeFile(file.dataset.file || file.dataset.pdf, file.files[0]);
        const correct = event.target.closest("[data-correct]");
        if (correct) {
          const bits = correct.dataset.correct.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.answer = Number(bits[2]);
          lmSchedule();
        }
        const selectAns = event.target.closest("[data-select-ans]");
        if (selectAns) {
          const bits = selectAns.dataset.selectAns.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) {
            const oi = Number(bits[2]);
            const answers = Array.isArray(question.answers) ? question.answers.map(Number) : [];
            const at = answers.indexOf(oi);
            if (selectAns.checked && at < 0) answers.push(oi);
            if (!selectAns.checked && at >= 0) answers.splice(at, 1);
            question.answers = answers;
          }
          lmSchedule();
        }
        const pick = event.target.closest("[data-pick]");
        if (pick) {
          const bits = pick.dataset.pick.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.picked = Number(bits[2]);
        }
      });
      lmRoot.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-lm-tab]");
        if (tab) { lmSelectTab(tab.getAttribute("data-lm-tab")); return; }
        const tool = event.target.closest("[data-lm-tool]");
        if (tool && tool.getAttribute("data-lm-tool") === "quiz") {
          lmOpenDayQuiz();
          return;
        }
        const areaPick = event.target.closest("[data-lm-area]");
        if (areaPick) {
          lmGrammarArea = areaPick.getAttribute("data-lm-area") || "";
          lmPaintGrammar();
          return;
        }
        const rulePick = event.target.closest("[data-lm-rule]");
        if (rulePick && lmState) {
          const topicId = rulePick.getAttribute("data-lm-rule");
          const compare = rulePick.getAttribute("data-lm-compare") === "1";
          if (!Array.isArray(lmState.blocks)) lmState.blocks = [];
          if (lmState.blocks.some((block) => block.type === "rule" && !!block.compare === compare && block.topic === topicId && (compare || (block.tab || "rules") === "rules"))) {
            lmNote("This rule is already on this page.");
            return;
          }
          const topic = compare ? null : topicById(topicId);
          const named = compare ? (((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((item) => item.id === topicId)[0] || {}).title : (topic && topic.name);
          lmInsertBlockFront({ id: lmId(), type: "rule", tab: "rules", collapsed: false, topic: topicId, compare: compare, name: named || "Rule" });
          lmKeepLesson();
          lmState.ruleCount = (lmState.blocks || []).filter((block) => block.type === "rule").length;
          lmRenderEditor();
          lmNote("Rule added. Click Save draft or Publish.");
          return;
        }
        if (event.target.closest("#lmWordGo")) { lmLookupWord(); return; }
        const fontBtn = event.target.closest("[data-font]");
        if (fontBtn) {
          event.preventDefault();
          const tools = fontBtn.closest(".lm-tools");
          const rich = tools && tools.nextElementSibling;
          const block = rich && lmBlock(rich.dataset.rich);
          if (!block) return;
          const current = lmCurrentTextSize(rich, block);
          const size = fontBtn.dataset.font === "up" ? Math.min(96, current + 2) : Math.max(10, current - 2);
          lmApplyTextFont(rich, block, { size: size });
          const field = tools.querySelector("[data-font-size]");
          if (field) field.value = size;
          return;
        }
        const cmd = event.target.closest("[data-cmd]");
        if (cmd) {
          event.preventDefault();
          const rich = cmd.parentElement && cmd.parentElement.nextElementSibling;
          if (rich) rich.focus();
          if (cmd.dataset.cmd === "link") {
            const href = window.prompt("Link address", "https://");
            if (href && /^https?:\/\//i.test(href)) document.execCommand("createLink", false, href);
          } else document.execCommand(cmd.dataset.cmd, false, null);
          if (rich) { const block = lmBlock(rich.dataset.rich); if (block) block.html = rich.innerHTML; lmSchedule(); }
          return;
        }
        const add = event.target.closest("[data-add-block]");
        if (add) {
          const block = lmBlank(add.dataset.addBlock, add.dataset.quiz || "");
          lmState.blocks.push(block);
          document.getElementById("lmPicker").hidden = true;
          lmRenderEditor();
          lmSchedule();
          const made = lmRoot.querySelector('[data-block-id="' + block.id + '"]');
          if (made) made.scrollIntoView({ block: "nearest" });
          return;
        }
        const fold = event.target.closest("[data-lm-fold]");
        if (fold) { const block = lmBlock(fold.dataset.lmFold); if (block) block.collapsed = !block.collapsed; lmRenderEditor(); lmSchedule(); return; }
        const edit = event.target.closest("[data-lm-edit]");
        if (edit) {
          const block = lmBlock(edit.dataset.lmEdit);
          if (block) block.collapsed = false;
          lmRenderEditor();
          const made = lmRoot.querySelector('[data-block-id="' + edit.dataset.lmEdit + '"] input, [data-block-id="' + edit.dataset.lmEdit + '"] .lm-rich');
          if (made) made.focus();
          return;
        }
        const menu = event.target.closest("[data-lm-menu]");
        if (menu) {
          const pop = lmRoot.querySelector('[data-pop="' + menu.dataset.lmMenu + '"]');
          lmRoot.querySelectorAll(".lm-pop").forEach((item) => { if (item !== pop) item.hidden = true; });
          if (pop) pop.hidden = !pop.hidden;
          return;
        }
        const up = event.target.closest("[data-lm-up]");
        if (up) { lmMoveTabBlock(up.dataset.lmUp, -1); lmRenderEditor(); lmSchedule(); return; }
        const down = event.target.closest("[data-lm-down]");
        if (down) { lmMoveTabBlock(down.dataset.lmDown, 1); lmRenderEditor(); lmSchedule(); return; }
        const del = event.target.closest("[data-lm-del]");
        if (del) {
          const id = domEntityId(del.dataset.lmDel);
          lmState.blocks = lmState.blocks.filter((row) => row.id !== id);
          if (Array.isArray(lmState.stageBlockOrder)) lmState.stageBlockOrder = lmState.stageBlockOrder.filter((row) => row !== id);
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const cardAdd = event.target.closest("[data-card-add]");
        if (cardAdd) { const block = lmBlock(cardAdd.dataset.cardAdd); if (block) block.items.push({ front: "", back: "", example: "" }); lmRenderEditor(); lmSchedule(); return; }
        const cardDel = event.target.closest("[data-card-del]");
        if (cardDel) { const bits = cardDel.dataset.cardDel.split(":"); const block = lmBlock(bits[0]); if (block) block.items.splice(Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const cardUp = event.target.closest("[data-card-up]");
        if (cardUp) { const bits = cardUp.dataset.cardUp.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(block.items, Number(bits[1]), -1); lmRenderEditor(); lmSchedule(); return; }
        const cardDown = event.target.closest("[data-card-down]");
        if (cardDown) { const bits = cardDown.dataset.cardDown.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(block.items, Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const itemAdd = event.target.closest("[data-item-add]");
        if (itemAdd) {
          const bits = itemAdd.dataset.itemAdd.split(":");
          const block = lmBlock(bits[0]);
          if (block) {
            const kind = bits[1];
            if (kind === "quiz") lmList(block, "items").push(lmNewItem("quiz", lmQuizType(block)));
            else lmList(block, kind === "dialogue" ? "lines" : "items").push(lmNewItem(kind));
          }
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const itemDel = event.target.closest("[data-item-del]");
        if (itemDel) { const bits = itemDel.dataset.itemDel.split(":"); const block = lmBlock(bits[0]); if (block) lmList(block, bits[1]).splice(Number(bits[2]), 1); lmRenderEditor(); lmSchedule(); return; }
        const itemUp = event.target.closest("[data-item-up]");
        if (itemUp) { const bits = itemUp.dataset.itemUp.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(lmList(block, bits[1]), Number(bits[2]), -1); lmRenderEditor(); lmSchedule(); return; }
        const itemDown = event.target.closest("[data-item-down]");
        if (itemDown) { const bits = itemDown.dataset.itemDown.split(":"); const block = lmBlock(bits[0]); if (block) lmMove(lmList(block, bits[1]), Number(bits[2]), 1); lmRenderEditor(); lmSchedule(); return; }
        const optAdd = event.target.closest("[data-opt-add]");
        if (optAdd) {
          const bits = optAdd.dataset.optAdd.split(":");
          const block = lmBlock(bits[0]);
          const question = block && block.items && block.items[Number(bits[1])];
          if (question) question.options.push("");
          lmRenderEditor();
          lmSchedule();
          return;
        }
        const colAdd = event.target.closest("[data-col-add]");
        if (colAdd) { const block = lmBlock(colAdd.dataset.colAdd); if (block) { block.columns.push(""); block.rows.forEach((row) => row.push("")); } lmRenderEditor(); lmSchedule(); return; }
        const colDel = event.target.closest("[data-col-del]");
        if (colDel) { const block = lmBlock(colDel.dataset.colDel); if (block && block.columns.length > 1) { block.columns.pop(); block.rows.forEach((row) => row.pop()); } lmRenderEditor(); lmSchedule(); return; }
        const rowAdd = event.target.closest("[data-row-add]");
        if (rowAdd) { const block = lmBlock(rowAdd.dataset.rowAdd); if (block) block.rows.push(block.columns.map(() => "")); lmRenderEditor(); lmSchedule(); return; }
        const rowDel = event.target.closest("[data-row-del]");
        if (rowDel) { const bits = rowDel.dataset.rowDel.split(":"); const block = lmBlock(bits[0]); if (block) block.rows.splice(Number(bits[1]), 1); lmRenderEditor(); lmSchedule(); return; }
        const readWord = event.target.closest("[data-read]");
        if (readWord) {
          const bits = readWord.dataset.read.split(":");
          const block = lmBlock(bits[0]);
          if (block) {
            const index = Number(bits[1]);
            block.marks = block.marks || [];
            const at = block.marks.indexOf(index);
            if (at >= 0) block.marks.splice(at, 1);
            else block.marks.push(index);
            readWord.classList.toggle("is-on", at < 0);
            lmSchedule();
          }
          return;
        }
        const exCheck = event.target.closest("[data-ex-check]");
        if (exCheck) {
          const block = lmBlock(exCheck.dataset.exCheck);
          if (block) block.items.forEach((question) => {
            question.marked = true;
            question.correct = question.kind === "write" ? String(question.typed || "").trim().toLowerCase() === String(question.write || "").trim().toLowerCase() : Number(question.picked) === Number(question.answer);
          });
          lmRenderPreview();
          lmSchedule();
          return;
        }
        const quizCheck = event.target.closest("[data-quiz-check]");
        if (quizCheck) {
          const block = lmBlock(quizCheck.dataset.quizCheck);
          if (block) {
            const score = block.items.reduce((sum, question) => sum + (Number(question.picked) === Number(question.answer) ? 1 : 0), 0);
            block.score = score + " / " + block.items.length;
            const out = lmRoot.querySelector('[data-quiz-score="' + block.id + '"]');
            if (out) out.textContent = block.score;
            lmSchedule();
          }
          return;
        }
        const clearFile = event.target.closest("[data-file-clear], [data-pdf-clear]");
        if (clearFile) { lmClearFile(clearFile.dataset.fileClear || clearFile.dataset.pdfClear); return; }
        const openPdfBtn = event.target.closest("[data-pdf-open], [data-file-open]");
        if (openPdfBtn) {
          const id = openPdfBtn.dataset.pdfOpen || openPdfBtn.dataset.fileOpen;
          const block = lmBlock(id);
          const title = block && (block.title || block.name);
          const external = lmExternalFile(block);
          if (external) { window.open(external, "_blank", "noopener,noreferrer"); return; }
          const openStored = async () => {
            const href = await lmResolveFile(id);
            if (!href) {
              const msg = document.createElement("p");
              msg.className = "lm-pdf-msg";
              msg.textContent = block && block.sample
                ? "This sample shows the block. Drop a real file in the editor to open it."
                : "This file is not on the server yet. Open the editor and drop it again.";
              const holder = openPdfBtn.parentElement;
              const old = holder.querySelector(".lm-pdf-msg");
              if (old) old.remove();
              holder.appendChild(msg);
              return;
            }
            if (openPdfBtn.dataset.pdfOpen) openPdf(href, title);
            else {
              const link = document.createElement("a");
              link.href = href;
              link.download = (block && block.name) || "file";
              link.click();
            }
          };
          openStored();
          return;
        }
        if (!event.target.closest(".lm-pop") && !event.target.closest("[data-lm-menu]")) lmRoot.querySelectorAll(".lm-pop").forEach((item) => { item.hidden = true; });
        if (!event.target.closest(".lm-add-wrap")) {
          const picker = document.getElementById("lmPicker");
          if (picker) picker.hidden = true;
        }
      });
      lmRoot.addEventListener("dragstart", (event) => {
        const block = event.target.closest(".lm-block");
        if (!block || !block.getAttribute("draggable")) return;
        event.dataTransfer.setData("text/plain", block.dataset.blockId);
      });
      lmRoot.addEventListener("dragover", (event) => {
        if (event.target.closest(".lm-block") || event.target.closest(".lm-drop")) event.preventDefault();
        const over = event.target.closest(".lm-block");
        lmRoot.querySelectorAll(".lm-block").forEach((item) => item.classList.toggle("is-over", item === over && event.target.closest("[data-grip], .lm-block") && !event.target.closest(".lm-drop")));
      });
      lmRoot.addEventListener("drop", (event) => {
        const drop = event.target.closest(".lm-drop");
        if (drop) {
          const input = drop.querySelector("[data-file], [data-pdf]");
          const file = event.dataTransfer.files && event.dataTransfer.files[0];
          if (input && file) { event.preventDefault(); lmTakeFile(input.dataset.file || input.dataset.pdf, file); }
          return;
        }
        const block = event.target.closest(".lm-block");
        const from = event.dataTransfer.getData("text/plain");
        if (!block || !from) return;
        event.preventDefault();
        const list = lmState.blocks;
        const source = list.findIndex((row) => row.id === domEntityId(from));
        const target = list.findIndex((row) => row.id === domEntityId(block.dataset.blockId));
        if (source < 0 || target < 0 || source === target) return;
        const item = list.splice(source, 1)[0];
        list.splice(target, 0, item);
        lmRenderEditor();
        lmSchedule();
      });
      lmRoot.addEventListener("dragend", () => {
        lmRoot.querySelectorAll(".lm-block").forEach((item) => { item.classList.remove("is-over"); item.removeAttribute("draggable"); });
      });
      lmRoot.addEventListener("pointerdown", (event) => {
        const grip = event.target.closest("[data-grip]");
        const block = grip && grip.closest(".lm-block");
        if (block) block.setAttribute("draggable", "true");
      });
      lmRoot.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        const input = event.target.closest("#lmWordInput");
        if (!input) return;
        event.preventDefault();
        lmLookupWord();
      });
      document.getElementById("lmAdd").addEventListener("click", () => {
        const picker = document.getElementById("lmPicker");
        picker.hidden = !picker.hidden;
      });
      document.getElementById("lmPreviewBtn").addEventListener("click", () => { lmShow("preview"); lmPersist(); });
      document.getElementById("lmEditBack").addEventListener("click", () => { if (canEditLessons()) lmShow("edit"); });
      document.getElementById("lmSave").addEventListener("click", () => { if (!canEditLessons()) return; lmState.published = false; lmState.mode = "edit"; lmKeepLesson(); lmPersist(); lmRenderEditor(); lmNote(lmState && lmState.examOwned ? "Draft saved." : "Draft saved. The lesson is in Classes."); });
      document.getElementById("lmPublish").addEventListener("click", () => {
        if (!canEditLessons()) return;
        lmSortWordcardsForPublish();
        lmState.published = true;
        lmState.mode = "preview";
        lmKeepLesson();
        lmPersist();
        lmNote("");
        lmShow("preview");
      });
      const lmNew = document.getElementById("lmNew");
      if (lmNew) lmNew.addEventListener("click", lmCreateLesson);
      const groupNew = document.getElementById("groupNew");
      if (groupNew) groupNew.addEventListener("click", groupCreate);
      paintLmDays();
    }

    let examHold = null;
    let examCurrentId = "";
    let examKnown = null;
    let examReady = false;
    let examPulling = false;
    let examFlight = null;
    let examSession = 0;
    function examPreload() {
      examPull();
      examPullWork();
    }
    function examResetAccount() {
      examSection='active';
      examSession += 1;
      examKnown = null;
      examReady = false;
      examPulling = false;
      examFlight = null;
      examResetWork();
    }
    function examLoad() {
      if (authUser?.role === "USER" && !examReady) return [];
      try {
        const list = JSON.parse(localStorage.getItem("enquiz-exams") || "[]");
        return Array.isArray(list) ? list : [];
      } catch (e) { return []; }
    }
    function examWire(exam) {
      const numeric = (value) => Number.isSafeInteger(value) && value > 0;
      return {
        ...(numeric(exam.id) ? { id: exam.id } : {}),
        ...(numeric(exam.groupId) ? {groupId:exam.groupId} : {}),
        title: exam.title || "Exam",
        date: exam.date || "",
        published: !!exam.published,
        hidden: !!exam.hidden,
        blocks: (exam.blocks || []).map((block) => {
          const doc = block.doc || {};
          return {
            ...(numeric(block.id) ? { id: block.id } : {}),
            title: doc.title || "Examination block",
            published: !!doc.published,
            hidden: !!block.hidden,
            materials: (doc.blocks || []).map((part) => {
              const copy = JSON.parse(JSON.stringify(part));
              if (!numeric(copy.id)) delete copy.id;
              if (Array.isArray(copy.items)) copy.items.forEach((item) => { if (item) delete item.given; });
              return copy;
            })
          };
        })
      };
    }
    function examFromWire(row) {
      return {
        id: row.id,
        stageRevision: row.revision || 0,
        groupId: row.groupId || null,
        instanceStatus:row.instanceStatus||null,
        groupTitle:row.groupTitle||'',
        completedAt:row.completedAt||null,
        studentId:row.studentId||null,
        studentName:row.studentName||'',
        maximumPoints:row.maximumPoints,
        earnedPoints:row.earnedPoints,
        title: row.title || "Exam",
        date: row.date || "",
        published: !!row.published,
        hidden: !!row.hidden,
        personalHidden: !!row.personalHidden,
        created: row.created || Date.now(),
        blocks: (row.blocks || []).map((block) => ({
          id: block.id,
          hidden: !!block.hidden,
          personalHidden: !!block.personalHidden,
          doc: {
            id: block.id,
            title: block.title || "Examination block",
            description: block.materials?.find(part=>part.documentFormatting)?.documentFormatting?.description?.runs?.map(run=>run.text).join('')||"",
            className: "",
            unit: "",
            lesson: "",
            date: row.date || "",
            published: !!block.published,
            mode: block.published ? "preview" : "edit",
            blocks: block.materials || [],
            examOwned: true,
            examId: row.id,
            blockId: block.id,
            studentSaved: false
          }
        }))
      };
    }
    function examMergeLocal(remote, local) {
      return remote || local;
    }
    function examRemoteSave(exam) {
      if (!exam || typeof accountFetch !== "function") return Promise.resolve();
      const session = examSession, actor = authUser?.id;
      return accountFetch("/api/exams", { method: "POST", body: JSON.stringify({ exam: examWire(exam) }) }).then((saved) => {
        if (session !== examSession || actor !== authUser?.id) return;
        if (!saved || !saved.id) return;
        const exams = examLoad();
        const local = exams.find((row) => row.id === exam.id);
        if (!local) return;
        local.id = saved.id;
        if (examCurrentId === exam.id) examCurrentId = saved.id;
        (saved.blocks || []).forEach((block, index) => {
          const previous = local.blocks?.[index];
          if (!previous) return;
          const oldId = previous.id;
          previous.id = block.id;
          Object.assign(previous.doc, { id: block.id, examId: saved.id, blockId: block.id });
          if (lmState?.examOwned && lmState.examId === exam.id && lmState.blockId === oldId) {
            Object.assign(lmState, { id: block.id, examId: saved.id, blockId: block.id });
            lmBindEditor();
            rememberPlace();
          }
        });
        try { localStorage.setItem("enquiz-exams", JSON.stringify(exams)); } catch (e) {}
        return saved;
      });
    }
    function examRemoteDrop(id) {
      if (!Number.isSafeInteger(id) || id < 1 || typeof accountFetch !== "function") return Promise.resolve();
      return window.LearningMain.archiveItem("exam", id);
    }
    function examPush(list) {
      if (!examReady || !canEditLessons() || typeof accountFetch !== "function") return Promise.resolve();
      const rows = Array.isArray(list) ? list.filter(row=>!row.instanceStatus) : [];
      const ids = new Set(rows.map((row) => row && row.id).filter(Boolean));
      const instanceIds=new Set((list||[]).filter(row=>row.instanceStatus).map(row=>row.id));
      const gone = examKnown ? [...examKnown].filter((id) => !ids.has(id)&&!instanceIds.has(id)) : [];
      examKnown = ids;
      return Promise.all(gone.map(examRemoteDrop).concat(rows.map(examRemoteSave)));
    }
    let examSaveQueue = Promise.resolve();
    function examSave(list) {
      try { localStorage.setItem("enquiz-exams", JSON.stringify(list)); } catch (e) {}
      const session = examSession, actor = authUser?.id;
      const task = examSaveQueue.catch(() => {}).then(() => {
        if (session !== examSession || actor !== authUser?.id) return;
        return examPush(examLoad());
      });
      examSaveQueue = task;
      task.catch((error) => window.LearningMain?.notice(error.message, true));
      return task;
    }
    function examPull(force = false) {
      if (!force && examPulling) return examFlight || Promise.resolve();
      if ((!force && examReady) || !authUser || typeof accountFetch !== "function") return Promise.resolve();
      if (force) examSession += 1;
      examPulling = true;
      const session = examSession;
      const actorId = authUser.id;
      const target = viewAccount?.id || '', generation = viewGen;
      examFlight = accountFetch("/api/exams" + (target ? "?for=" + encodeURIComponent(target) : "")).then((data) => {
        if (session !== examSession || !authUser || authUser.id !== actorId || generation !== viewGen || target !== (viewAccount?.id || '')) return;
        const remote = Array.isArray(data && data.exams) ? data.exams.map(examFromWire) : [];
        examKnown = new Set(remote.filter(row=>!row.instanceStatus).map((row) => row.id));
        examReady = true;
        examPulling = false;
        try { localStorage.setItem("enquiz-exams", JSON.stringify(remote)); } catch (e) {}
        examPaintList();
        const blocks = document.getElementById("examblocks");
        if (examCurrentId && blocks && blocks.classList.contains("on")) examPaintBlocks();
      }).catch((error) => {
        if (session === examSession && authUser && authUser.id === actorId) examPulling = false;
        window.LearningMain?.notice(error.message, true);
      });
      return examFlight;
    }
    function examFind(id) {
      id = domEntityId(id);
      return examLoad().find((row) => row.id === id) || null;
    }
    let examWork = {};
    let examWorkLoadedFor = "";
    let examWorkPulling = false;
    let examWorkSession = 0;
    function examResetWork() {
      examWorkSession += 1;
      examWorkLoadedFor = "";
      examWorkPulling = false;
    }
    function examWorkAccount() {
      return (viewAccount && viewAccount.id) || (authUser && authUser.id) || "";
    }
    function examWorkBag() {
      const id = examWorkAccount();
      if (!id) return {};
      if (!examWork[id]) {
        try { examWork[id] = JSON.parse(localStorage.getItem("enquiz-exam-work-" + id) || "{}"); }
        catch (e) { examWork[id] = {}; }
      }
      return examWork[id];
    }
    function examWorkWrite() {
      const id = examWorkAccount();
      if (!id) return;
      try { localStorage.setItem("enquiz-exam-work-" + id, JSON.stringify(examWork[id] || {})); } catch (e) {}
    }
    function assessmentActive(doc) { return !!doc && (!!doc.examOwned || (doc.blocks || []).some(part => part.assessed)); }
    function assessmentRubric(item) {
      return String(item.criteria || '').split('\n').map(line => { const [label, points] = line.split('|'); return {label:label.trim(), max:Number(String(points).replace(',','.'))}; }).filter(row => row.label && Number.isFinite(row.max) && row.max > 0 && row.max <= 1e12).slice(0,20);
    }
    function assessmentMax(part, index) {
      const item = part.type === 'task' ? part : (part.items || [])[index] || {}, criteria = assessmentRubric(item);
      return criteria.length ? criteria.reduce((n,c) => n + c.max,0) : Number(String(item.maxPoints ?? part.maxPoints ?? 1).replace(',','.'));
    }
    function assessmentAnswerQuestions(doc) {
      return (doc.blocks || []).filter(part => ['quiz','exercise','task'].includes(part.type) && (doc.examOwned || part.assessed)&&(!doc.examOwned||!doc.blocks.some(p=>p.scoringVersion===2)||!examScoringChildren(doc.blocks,part).length)).flatMap(part => (part.type === 'task' ? [part] : part.items || []).map((item,index) => ({part,index,max:assessmentMax(part,index)})));
    }
    function assessmentEditor(block,index) {
      const item = index == null ? block : block.items[index], attr = index == null ? 'data-field=' : 'data-item-list="items" data-item="' + index + '" data-item-field=';
      const field = name => attr + '"' + name + '" data-block="' + block.id + '"';
      return '<label>Maximum points<input type="number" min="0" max="10000" step="any" ' + field('maxPoints') + ' value="' + esc(String(item.maxPoints ?? 1)) + '"></label><label>Criteria<textarea ' + field('criteria') + ' placeholder="Content | 3&#10;Grammar | 2">' + esc(item.criteria || '') + '</textarea></label>';
    }
    function assessmentUnitMax(part) {
      if(lmState?.examOwned&&lmState.blocks?.some(p=>p.scoringVersion===2))return examScoringMax(lmState.blocks,part);
      const criteria = assessmentRubric(part);
      if (criteria.length) return criteria.reduce((n,c) => n + c.max,0);
      if (part.gradeMode === 'assignment') return Number(String(part.maxPoints ?? 1).replace(',','.'));
      return part.type === 'task' ? assessmentMax(part,0) : (part.items || []).reduce((n,_,i) => n + assessmentMax(part,i),0);
    }
    function assessmentQuestions(doc) {
      if(doc.examOwned&&doc.blocks.some(part=>part.scoringVersion===2))return doc.blocks.filter(part=>['quiz','exercise','task'].includes(part.type)&&!examScoringChildren(doc.blocks,part).length).map(part=>({part,index:0,max:examScoringMax(doc.blocks,part)}));
      const seen = new Set(), result = [];
      for (const part of (doc.blocks || []).filter(p => ['quiz','exercise','task'].includes(p.type) && (doc.examOwned || p.assessed))) {
        if (part.gradeMode !== 'assignment') { result.push(...assessmentAnswerQuestions({...doc,blocks:[part]})); continue; }
        const key = part.assignmentKey || part.assignmentId || ('part-' + part.id); if (seen.has(key)) continue; seen.add(key);
        const leader = (doc.blocks || []).find(p => p.assignmentId === key && p.gradeMode === 'assignment' && ['quiz','exercise','task'].includes(p.type)) || part;
        result.push({part:leader,index:0,max:assessmentUnitMax(leader)});
      }
      return result;
    }
    function examScoringChildren(parts,part){return parts.filter(child=>child!==part&&['task','quiz','exercise'].includes(child.type)&&child.assignmentKey&&child.assignmentKey===(part.assignmentId||('part-'+part.id)));}
    function examScoringMax(parts,part,seen=new Set()){
      if(seen.has(part))return 0;seen.add(part);const children=examScoringChildren(parts,part);
      if(children.length)return Number(children.reduce((sum,child)=>sum+examScoringMax(parts,child,new Set(seen)),0).toFixed(10));
      const criteria=assessmentRubric(part);return criteria.length?criteria.reduce((sum,row)=>sum+row.max,0):Number(String(part.maxPoints??1).replace(',','.'));
    }
    function assessmentGroupEditor(block) {
      const tasks = (lmState.blocks || []).filter(p => ['quiz','exercise','task'].includes(p.type));
      if (!tasks.length) return '';
      tasks.forEach(p => { p.assignmentId ||= 'a-' + crypto.randomUUID(); });
      return '<label>Assignment<select data-field="assignmentKey" data-block="' + block.id + '"><option value="">Standalone</option>' + tasks.filter(p => p.id !== block.id && !p.assignmentKey).map(p => '<option value="' + esc(p.assignmentId) + '"' + (block.assignmentKey === p.assignmentId ? ' selected' : '') + '>' + esc(p.title || lmSummary(p) || 'Task') + '</option>').join('') + '</select></label>';
    }
    function assessmentKey(doc) { return (doc.examOwned ? doc.examId : 'lesson') + '/' + (doc.examOwned ? doc.blockId : doc.id); }
    function assessmentApply(doc,row) {
      doc.studentSaved = !!row.saved; doc.assessmentState = row.state || (row.saved ? 'submitted' : 'draft'); doc.assessmentRevision = row.revision || 0;
      doc.examCorrections = row.corrections || {}; doc.examPoints = row.points || {}; doc.examErrors = row.errors || {}; doc.examCriteriaPoints = row.criteriaPoints || {};
      doc.examReviewText = row.reviewText || {};
      doc.examAnswerText=row.answerText||{};doc.examCommentFormatting=row.commentFormatting||{};
      if (row.saved && row.materials?.length) {
        if (doc.examOwned) doc.blocks = row.materials;
        else doc.blocks = (doc.blocks || []).map(part => row.materials.find(p => String(p.id) === String(part.id)) || part);
      }
      (doc.blocks || []).forEach(part => {
        if (!doc.examOwned && !part.assessed) return;
        const given = (row.answers || {})[part.id] || {};
        if (part.type === 'task') part.response = given[0] || '';
        (part.items || []).forEach((item,index) => { item.given = given[index] ?? ''; });
      });
      doc.assessmentReady = true;
    }
    function assessmentStatus(message,doc=lmState) {
      if (doc !== lmState) return;
      let box = document.getElementById('assessmentSummary');
      if (!box) { box = document.createElement('div'); box.id = 'assessmentSummary'; box.className = 'assessment-summary'; document.querySelector('#material .lm-meta')?.after(box); }
      box.hidden = !assessmentActive(doc);
      if (box.hidden) return;
      const qs = assessmentQuestions(doc), max = Math.round(qs.reduce((n,q) => n + q.max,0)*1e8)/1e8, graded = qs.filter(q => doc.examPoints?.[q.part.id]?.[q.index] != null && doc.examPoints[q.part.id][q.index] !== '');
      const earned = Math.round(graded.reduce((n,q) => n + Number(String(doc.examPoints[q.part.id][q.index]).replace(',','.')),0)*1e8)/1e8;
      const states = {draft:'Draft',submitted:'Submitted',reviewing:'Being reviewed',published:'Results published'};
      box.innerHTML = '<strong>' + esc(states[doc.assessmentState] || 'Draft') + '</strong><span>Maximum: ' + esc(String(max)) + ' points</span>' + (canTuneStudentLessons() || doc.assessmentState === 'published' ? '<span>' + esc(String(earned)) + ' / ' + esc(String(max)) + ' · ' + graded.length + ' / ' + qs.length + ' graded</span>' : '') + '<span role="status" aria-live="polite">' + esc(message || doc.assessmentMessage || '') + '</span>';
      if (doc.assessmentError) box.innerHTML += '<button class="lm-btn" type="button" id="assessmentRetry">Retry saving</button>';
    }
    async function assessmentRead(doc) {
      if (doc.assessmentLoading) return;
      doc.assessmentLoading = true;
      const account = examWorkAccount(), kind = doc.examOwned ? 'exam-block' : 'lesson', id = doc.examOwned ? doc.blockId : doc.id;
      assessmentStatus('Loading answers…',doc);
      try {
        if (assessmentPendingDoc && assessmentKey(assessmentPendingDoc) === assessmentKey(doc)) {
          clearTimeout(assessmentTimer); const pendingDoc = assessmentPendingDoc; assessmentPendingDoc = null;
          await assessmentWrite(pendingDoc,'draft').catch(() => {});
        }
        await assessmentQueue.catch(() => {});
        const target=doc.reviewStudentId||viewAccount?.id;
        const row = await accountFetch('/api/assessment?kind=' + kind + '&id=' + id + (target ? '&student=' + encodeURIComponent(target) : ''),{signal:AbortSignal.timeout(20000)});
        if (account !== examWorkAccount()) return;
        const pending = examWorkBag()[assessmentKey(doc)]?.pendingAnswers;
        const recovered = pending && !row.saved ? {...row,answers:pending,pendingAnswers:pending} : row;
        assessmentApply(doc,recovered); examWorkBag()[assessmentKey(doc)] = recovered; examWorkWrite();
        if (pending && !row.saved) { doc.assessmentError = true; doc.assessmentMessage = 'Unsaved answers recovered. Retry saving.'; }
        else { doc.assessmentError = false; doc.assessmentMessage = ''; }
        if (doc === lmState) { lmRenderPreview(); examDress(); }
      } catch(error) { doc.assessmentError = true; doc.assessmentMessage = error.message || 'Could not load answers.'; if (doc === lmState) assessmentStatus(doc.assessmentMessage,doc); }
      finally { doc.assessmentLoading = false; }
    }
    let assessmentQueue = Promise.resolve(), assessmentTimer, assessmentPendingDoc;
    function assessmentWrite(doc,action,extra={}) {
      const account = examWorkAccount(), actor = authUser?.id, target = doc.reviewStudentId||viewAccount?.id;
      const payload = {kind:doc.examOwned ? 'exam-block' : 'lesson',id:doc.examOwned ? doc.blockId : doc.id,action,answers:examCollectAnswers(doc),points:JSON.parse(JSON.stringify(doc.examPoints || {})),corrections:JSON.parse(JSON.stringify(doc.examCorrections || {})),errors:JSON.parse(JSON.stringify(doc.examErrors || {})),criteriaPoints:JSON.parse(JSON.stringify(doc.examCriteriaPoints || {})),...extra};
      if (target) payload.studentId = target;
      payload.reviewText = JSON.parse(JSON.stringify(doc.examReviewText || {}));
      payload.answerText=JSON.parse(JSON.stringify(doc.examAnswerText||{}));payload.commentFormatting=JSON.parse(JSON.stringify(doc.examCommentFormatting||{}));
      const task = assessmentQueue.catch(() => {}).then(async () => {
        if (actor !== authUser?.id || account !== examWorkAccount()) throw new Error('Account changed. Reopen the material.');
        if (!doc.assessmentReady) throw new Error('Load answers before saving.');
        payload.expectedRevision = doc.assessmentRevision || 0;
        assessmentStatus('Saving…',doc);
        const row = await accountFetch('/api/assessment',{method:'POST',body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
        doc.assessmentRevision = row.revision; doc.assessmentState = row.state; doc.studentSaved = !!row.saved; doc.assessmentError = false;
        doc.assessmentMessage = action === 'draft' ? 'Draft saved' : action === 'submit' ? 'Submitted' : action === 'publish' ? 'Results published' : 'Saved';
        const pending = examWorkBag()[assessmentKey(doc)]?.pendingAnswers;
        examWorkBag()[assessmentKey(doc)] = {...row,...(action === 'draft' && pending && JSON.stringify(pending) !== JSON.stringify(row.answers) ? {pendingAnswers:pending} : {})}; examWorkWrite();
        if (action !== 'draft') {
          assessmentApply(doc,row);
          if (doc === lmState) { lmRenderPreview(); examDress(); }
        }
        assessmentStatus(doc.assessmentMessage,doc); examPaintList(); if (examCurrentId) examPaintBlocks();
        if(doc.examOwned&&['submit','publish','amend'].includes(action))await examPull(true);
        return row;
      }).catch(error => { doc.assessmentError = true; doc.assessmentMessage = error.message || 'Not saved. Retry.'; assessmentStatus(doc.assessmentMessage,doc); throw error; });
      assessmentQueue = task; return task;
    }
    function assessmentAutosave(doc) {
      clearTimeout(assessmentTimer);
      if (assessmentPendingDoc && assessmentPendingDoc !== doc && !assessmentPendingDoc.studentSaved) assessmentWrite(assessmentPendingDoc,'draft').catch(() => {});
      assessmentPendingDoc = doc; doc.assessmentMessage = 'Unsaved changes'; assessmentStatus(doc.assessmentMessage,doc);
      const bag = examWorkBag(), key = assessmentKey(doc);
      const answers = examCollectAnswers(doc); bag[key] = {...bag[key],answers,pendingAnswers:answers}; examWorkWrite();
      assessmentTimer = setTimeout(() => { assessmentPendingDoc = null; assessmentWrite(doc,'draft').catch(() => {}); },700);
    }
    function examPullWork() {
      const account = examWorkAccount();
      if (!account || examWorkPulling || typeof accountFetch !== "function") return;
      examWorkPulling = true;
      examWorkLoadedFor = account;
      const session = examSession;
      const workSession = examWorkSession;
      const reviewTarget=viewAccount?.id||(typeof materialReviewStudent!=='undefined'&&materialReviewStudent?.id);
      const path = "/api/exams/work" + (reviewTarget ? "?student=" + encodeURIComponent(reviewTarget) : "");
      accountFetch(path).then((data) => {
        if (session !== examSession || workSession !== examWorkSession || account !== examWorkAccount()) return;
        const cached = examWorkBag(), bag = {};
        (data && data.work || []).forEach((row) => {
          const key = row.examId + '/' + row.blockId;
          bag[key] = { ...row, saved: !!row.saved, answers: row.answers || {}, corrections: row.corrections || {}, points: row.points || {}, ...(!row.saved && cached[key]?.pendingAnswers ? {pendingAnswers:cached[key].pendingAnswers} : {}) };
        });
        for (const [key,row] of Object.entries(cached)) if (!bag[key] && (key.startsWith('lesson/') || row.pendingAnswers)) bag[key] = row;
        examWork[account] = bag;
        examWorkWrite();
        examWorkPulling = false;
        examPaintList();
        const blocks = document.getElementById("examblocks");
        if (examCurrentId && blocks && blocks.classList.contains("on")) examPaintBlocks();
      }).catch(() => {
        if (session !== examSession || workSession !== examWorkSession) return;
        examWorkPulling = false;
        examWorkLoadedFor = "";
      });
    }
    function examApplyWork(exam) {
      const bag = examWorkBag();
      (exam.blocks || []).forEach((block) => {
        const row = bag[exam.id + "/" + block.id];
        if (!row || !block.doc) return;
        block.doc.studentSaved = !!row.saved;
        block.doc.assessmentState = row.state || (row.saved ? 'submitted' : 'draft');
        block.doc.assessmentRevision = row.revision || 0;
        block.doc.examErrors = row.errors || {};
        block.doc.examCriteriaPoints = row.criteriaPoints || {};
        block.doc.examCorrections = row.corrections || {};
        block.doc.examPoints = row.points || {};
        const answers = row.answers || {};
        (block.doc.blocks || []).forEach((part) => {
          const given = answers[part.id] || {};
          if (part.type === "task") part.response = given[0] || "";
          (part.items || []).forEach((item, index) => { if (item && given[index] != null) item.given = given[index]; });
        });
      });
      return exam;
    }
    function examView(id) {
      const exam = examFind(id);
      if (!exam) return null;
      return examApplyWork(JSON.parse(JSON.stringify(exam)));
    }
    function examShown() {
      return examLoad().map((exam) => examApplyWork(JSON.parse(JSON.stringify(exam))));
    }
    function examStripDoc(doc) {
      if (!doc) return;
      delete doc.studentSaved;
      delete doc.examPoints;
      delete doc.examCorrections;
      for (const key of Object.keys(doc)) if (key.startsWith('assessment') || ['examErrors','examCriteriaPoints'].includes(key)) delete doc[key];
      (doc.blocks || []).forEach(part => { if (part.type === 'task') delete part.response; });
      (doc.blocks || []).forEach((part) => (part.items || []).forEach((item) => { if (item) delete item.given; }));
    }
    function examCollectAnswers(doc) {
      const answers = {};
      (doc.blocks || []).forEach((part) => {
        if (!part || !["quiz", "exercise", "task"].includes(part.type)) return;
        if (!doc.examOwned && !part.assessed) return;
        const row = {};
        if (part.type === "task" && part.response) row[0] = part.response;
        (part.items || []).forEach((item, index) => { if (item && item.given != null && item.given !== "") row[index] = item.given; });
        if (Object.keys(row).length) answers[part.id] = row;
      });
      return answers;
    }
    function examPointsTotal(block) {
      const map = (block.doc && block.doc.examPoints) || {};
      let sum = 0;
      Object.keys(map).forEach((partId) => {
        const row = map[partId] || {};
        Object.keys(row).forEach((index) => { sum += Number(String(row[index]).replace(',','.')) || 0; });
      });
      return sum;
    }
    function examVisibleBlocks(exam) {
      return (exam.blocks || []).filter((block) => canEditLessons() || (block.doc && block.doc.published && !block.hidden));
    }
    function examReadyForReview(exam) {
      const blocks = examVisibleBlocks(exam);
      return blocks.length > 0 && blocks.every((block) => block.doc && block.doc.studentSaved);
    }
    function examStamp(exam) {
      if (!exam) return false;
      if(exam.instanceStatus)return false;
      const published = (exam.blocks || []).some((block) => block.doc && block.doc.published);
      if (!!exam.published === published) return false;
      exam.published = published;
      return true;
    }
    function examSync() {
      if (!lmState || !lmState.examOwned || !canEditLessons()) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === lmState.examId);
      const block = exam && (exam.blocks || []).find((row) => row.id === lmState.blockId);
      if (!block) return;
      const copy = JSON.parse(JSON.stringify(lmState));
      examStripDoc(copy);
      block.doc = copy;
      examStamp(exam);
      return examSave(exams);
    }
    globalThis.examSync = examSync;
    function examLeave() {
      if (lmState && lmState.examOwned) {
        examSync();
        lmState = examHold;
      }
      examHold = null;
      const root = document.getElementById("material");
      if (root) {
        root.classList.remove("is-exam-locked");
        root.classList.remove("is-exam-restricted", "notranslate");
        root.removeAttribute("translate");
        const back = root.querySelector("[data-nav-back]");
        if (back) {
          back.dataset.fallback = "days";
          back.classList.remove("back-text");
          back.classList.add("icon");
          back.setAttribute("aria-label", "Back");
          back.innerHTML = backArrow;
        }
      }
      document.querySelectorAll("[data-exam-quiz]").forEach((btn) => { btn.hidden = true; });
      const save = document.getElementById("examSave");
      if (save) save.hidden = true;
    }
    function examStudentRestricted() {
      return authUser?.role === "USER" && !viewAccount && lmState?.examOwned && document.querySelector("section.on")?.id === "material";
    }
    document.addEventListener("click", (event) => {
      if (!examStudentRestricted() || !event.target.closest("#material")) return;
      if (event.target.closest("[data-read], [data-lm-word], [data-rule-open], [data-content-copy], [data-ex-check], [data-quiz-check], [data-usages]")) {
        event.preventDefault(); event.stopImmediatePropagation(); hideSelpop();
      }
    }, true);
    for (const type of ["copy", "cut", "paste", "contextmenu", "selectstart", "dragstart", "drop"]) document.addEventListener(type, (event) => {
      if (!examStudentRestricted() || !event.target.closest?.("#material")) return;
      if (type === "selectstart" && event.target.closest("input, textarea")) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    function examDress() {
      const root = document.getElementById("material");
      const owned = assessmentActive(lmState);
      const reviewer = owned && canTuneStudentLessons();
      const taking = owned && !canEditLessons() && !reviewer;
      const locked = taking && !!lmState.studentSaved;
      if (root) root.classList.toggle("is-exam-locked", locked);
      if (root) {
        const restricted = !!lmState?.examOwned && authUser?.role === "USER" && !viewAccount;
        root.classList.toggle("is-exam-restricted", restricted);
        root.classList.toggle("notranslate", restricted);
        if (restricted) { root.setAttribute("translate", "no"); hideSelpop(); }
        else root.removeAttribute("translate");
      }
      const save = document.getElementById("examSave");
      if (save) { save.hidden = reviewer ? !lmState.studentSaved || lmState.assessmentState === 'published' : (!taking || locked); save.textContent = reviewer ? 'Save review' : 'Submit'; save.disabled = !lmState?.assessmentReady || !!lmState?.assessmentBusy; }
      document.getElementById('assessmentPublish').textContent = lmState?.examOwned ? 'Publish review' : 'Publish results';
      document.getElementById('assessmentAmend').textContent = lmState?.examOwned ? 'Reopen review' : 'Amend review';
      for (const [id,visible] of [['assessmentPublish',reviewer && lmState.studentSaved && lmState.assessmentState !== 'published'],['assessmentReopen',reviewer && lmState.studentSaved && !lmState.examOwned],['assessmentAmend',reviewer && lmState.assessmentState === 'published'],['assessmentHistory',reviewer]]) {
        const button = document.getElementById(id); if (button) { button.hidden = !visible; button.disabled = !lmState?.assessmentReady || !!lmState?.assessmentBusy; }
      }
      assessmentStatus();
      document.querySelectorAll("[data-exam-quiz]").forEach((btn) => { btn.hidden = !owned || !canEditLessons(); });
      if (!owned || !root) return;
      const back = root.querySelector("[data-nav-back]");
      if (back && lmState.examOwned) {
        back.dataset.fallback = "examblocks";
        back.classList.remove("back-text");
        back.classList.add("icon");
        back.setAttribute("aria-label", "Back");
        back.innerHTML = backArrow;
      }
      const heading = root.querySelector(".lm-meta h1");
      if (heading && lmState.examOwned) heading.textContent = "Examination block";
      if (lmState.examOwned) root.querySelectorAll(".lm-chrome").forEach((chrome) => { chrome.hidden = true; });
      if (taking || reviewer) examFillAnswers();
      if ((taking || reviewer) && !lmState.assessmentReady) root.querySelectorAll('[data-exam-given],[data-exam-response],[data-exam-points],[data-exam-fix],[data-exam-error],[data-exam-criterion]').forEach(input => { input.disabled = true; });
      if (reviewer && (!lmState.studentSaved || lmState.assessmentState === 'published')) root.querySelectorAll('[data-exam-points],[data-exam-fix],[data-exam-error],[data-exam-criterion]').forEach(input => { input.disabled = true; });
    }
    globalThis.examDress = examDress;
    function examSame(given, right) {
      if (Array.isArray(right)) {
        const left = (Array.isArray(given) ? given : []).map(Number).sort().join(",");
        return left === right.map(Number).slice().sort().join(",");
      }
      return String(given == null ? "" : given).trim().toLowerCase() === String(right == null ? "" : right).trim().toLowerCase();
    }
    function examRight(item, kind) {
      if (!item) return null;
      if (kind === "Select all") return Array.isArray(item.answers) ? item.answers : null;
      if (kind === "Match" || kind === "Memory") return item.right || "";
      if (item.answer == null || item.answer === "") return null;
      return item.answer;
    }
    function examMarkClass(reviewer, given, right, value) {
      if (!reviewer || right == null || right === "") return "";
      if (Array.isArray(right)) {
        const correct = right.map(Number);
        const chosen = (Array.isArray(given) ? given : []).map(Number);
        if (correct.indexOf(Number(value)) >= 0) return " exam-hit";
        if (chosen.indexOf(Number(value)) >= 0) return " exam-miss";
        return "";
      }
      if (examSame(value, right)) return " exam-hit";
      if (examSame(given, value)) return " exam-miss";
      return "";
    }
    function examPointInput(block, index, whole=false) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      const individual=lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2);
      if(individual&&!whole){const mark=lmState.examErrors?.[block.id]?.[index]||'';return '<label>Review<select data-exam-error="'+block.id+':'+index+'"><option value="">Unmarked</option><option value="correct"'+(mark==='correct'?' selected':'')+'>Correct</option><option value="needs-work"'+(mark==='needs-work'?' selected':'')+'>Needs work</option></select></label>';}
      if (!individual&&block.gradeMode === 'assignment' && !whole) return '';
      const value = ((lmState.examPoints || {})[block.id] || {})[index];
      const shown = value == null || value === "" ? "" : String(value);
      const mark = ((lmState.examErrors || {})[block.id] || {})[index] || '';
      const item = individual||whole || block.type === 'task' ? block : (block.items || [])[index] || {}, criteria = assessmentRubric(item);
      const maximum = individual||whole ? assessmentUnitMax(block) : assessmentMax(block,index);
      const criteriaHtml = criteria.map((criterion,i) => '<label>' + esc(criterion.label) + ' / ' + criterion.max + '<input type="number" min="0" max="' + criterion.max + '" step="any" data-exam-criterion="' + block.id + ':' + index + ':' + i + '" value="' + esc(String(lmState.examCriteriaPoints?.[block.id]?.[index]?.[i] ?? '')) + '"></label>').join('');
      return '<div class="assessment-grading">' + criteriaHtml + '<label class="exam-point">Points / ' + maximum + ' <input class="exam-points" type="text" inputmode="decimal" data-exam-points="' + block.id + ":" + index + '" value="' + esc(shown) + '" /></label><label>Review<select data-exam-error="' + block.id + ':' + index + '"><option value="">Unmarked</option><option value="correct"' + (mark === 'correct' ? ' selected' : '') + '>Correct</option><option value="needs-work"' + (mark === 'needs-work' ? ' selected' : '') + '>Needs work</option></select></label></div>';
    }
    function examFixInput(block, index) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      const value = ((lmState.examCorrections || {})[block.id] || {})[index] || "";
      return '<label>Feedback<textarea maxlength="3000" data-exam-fix="' + block.id + ":" + index + '">' + esc(value) + '</textarea></label>';
    }
    function reviewHtml(value) {
      return (value?.runs || []).map(run => {
        const m = run.marks || {}, style = [];
        if (m.color && /^#[a-f0-9]{6}$/i.test(m.color)) style.push('color:' + m.color);
        if (m.size >= 10 && m.size <= 96) style.push('font-size:' + m.size + 'px');
        if (m.bold) style.push('font-weight:bold'); if (m.italic) style.push('font-style:italic');
        const decoration = [m.underline ? 'underline' : '',m.strike ? 'line-through' : ''].filter(Boolean).join(' ');
        if (decoration) style.push('text-decoration:' + decoration);
        return '<span style="' + esc(style.join(';')) + '">' + esc(run.text) + '</span>';
      }).join('');
    }
    function reviewRuns(editor) {
      const runs = [];
      function visit(node,inherited={}) {
        if (node.nodeType === 3) { if (node.textContent) runs.push({text:node.textContent,marks:inherited}); return; }
        if (node.nodeType !== 1) return;
        if (node.tagName === 'BR') { runs.push({text:'\n',marks:inherited}); return; }
        const marks = {...inherited}, style = node.style;
        if (['B','STRONG'].includes(node.tagName) || style.fontWeight === 'bold') marks.bold = true;
        if (['I','EM'].includes(node.tagName) || style.fontStyle === 'italic') marks.italic = true;
        if (node.tagName === 'U' || style.textDecoration.includes('underline')) marks.underline = true;
        if (['S','STRIKE','DEL'].includes(node.tagName) || style.textDecoration.includes('line-through')) marks.strike = true;
        const color = style.color || node.getAttribute('color') || '', rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (/^#[a-f0-9]{6}$/i.test(color)) marks.color = color;
        else if (rgb) marks.color = '#' + rgb.slice(1).map(n => Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('');
        const size = parseFloat(style.fontSize); if (size >= 10 && size <= 96) marks.size = size;
        node.childNodes.forEach(child => visit(child,marks));
        if (node !== editor && ['P','DIV','LI'].includes(node.tagName)) runs.push({text:'\n',marks:inherited});
      }
      editor.childNodes.forEach(child => visit(child)); return {runs};
    }
    function reviewEditor(part,index,original) {
      const key = part.id + ':' + index, saved = lmState.examReviewText?.[part.id]?.[index] || {runs:[{text:String(original || ''),marks:{}}]};
      const published = lmState.assessmentState === 'published' || !lmState.studentSaved || lmState.assessmentBusy;
      return '<div class="review-answer"><details><summary>Original answer</summary><p>' + esc(String(original || 'Not answered')) + '</p></details>' + (!published ? '<div class="review-toolbar" data-review-toolbar="' + key + '"><button type="button" data-review-command="bold" title="Bold"><b>B</b></button><button type="button" data-review-command="italic" title="Italic"><i>I</i></button><button type="button" data-review-command="underline" title="Underline"><u>U</u></button><button type="button" data-review-command="strikeThrough" title="Strike through"><s>S</s></button><input type="color" data-review-color aria-label="Text color" value="#c62828"><input type="number" data-review-size min="10" max="96" value="18" aria-label="Text size"></div>' : '') + '<div class="review-edit" role="textbox" aria-multiline="true" aria-label="Reviewed answer" contenteditable="' + (!published) + '" data-review-text="' + key + '">' + reviewHtml(saved) + '</div></div>';
    }
    let reviewSelection;
    document.addEventListener('selectionchange',() => {
      const selection = window.getSelection(), node = selection?.anchorNode, element = node?.nodeType === 1 ? node : node?.parentElement;
      if (selection?.rangeCount && element?.closest('.review-edit')) reviewSelection = selection.getRangeAt(0).cloneRange();
    });
    document.addEventListener('mousedown',event => { if (event.target.closest('[data-review-command]')) event.preventDefault(); });
    document.addEventListener('paste',event => {
      const editor = event.target.closest?.('.review-edit[contenteditable="true"]');
      if (!editor) return;
      event.preventDefault(); document.execCommand('insertText',false,event.clipboardData?.getData('text/plain') || ''); examRemember(editor);
    });
    function reviewFormat(control) {
      if (!canTuneStudentLessons() || !lmState.studentSaved || lmState.assessmentState === 'published') return;
      const toolbar = control.closest('[data-review-toolbar]'), editor = toolbar?.nextElementSibling;
      if (!editor) return;
      editor.focus(); const selection = window.getSelection();
      if (reviewSelection && editor.contains(reviewSelection.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(reviewSelection); }
      if (control.dataset.reviewCommand) document.execCommand(control.dataset.reviewCommand,false,null);
      else if (control.matches('[data-review-color]')) document.execCommand('foreColor',false,control.value);
      else if (control.matches('[data-review-size]')) {
        const size = Math.max(10,Math.min(96,Number(control.value) || 18));
        if (selection.rangeCount && !selection.isCollapsed && editor.contains(selection.anchorNode)) {
          const range = selection.getRangeAt(0), span = document.createElement('span'); span.style.fontSize = size + 'px'; span.append(range.extractContents()); range.insertNode(span); range.selectNodeContents(span); selection.removeAllRanges(); selection.addRange(range); reviewSelection = range.cloneRange();
        } else { editor.querySelectorAll('span').forEach(span => { span.style.fontSize = size + 'px'; }); }
      }
      if (selection.rangeCount && editor.contains(selection.anchorNode)) reviewSelection = selection.getRangeAt(0).cloneRange();
      examRemember(editor);
    }
    document.addEventListener('click',event => { const control = event.target.closest('[data-review-command]'); if (control) reviewFormat(control); });
    document.addEventListener('change',event => { if (event.target.matches('[data-review-color],[data-review-size]')) reviewFormat(event.target); });
    function assessmentFeedback(block,index) {
      if (block.assessmentSource) { index = block.assessmentIndex; block = block.assessmentSource; }
      if(lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2)){
        if(lmState.assessmentState!=='published')return '';
        const comment=lmState.examCorrections?.[block.id]?.[index]||'',mark=lmState.examErrors?.[block.id]?.[index]||'';
        return '<div class="assessment-feedback">'+(mark?'<span>'+esc(mark==='correct'?'Correct':'Needs work')+'</span>':'')+(comment?'<p>'+window.TextColors.html(comment,lmState.examCommentFormatting?.[block.id]?.[index])+'</p>':'')+'</div>';
      }
      if (block.gradeMode === 'assignment') return '';
      let html = '<p class="assessment-question-score">Maximum: ' + assessmentMax(block,index) + ' points</p>';
      if (lmState.assessmentState !== 'published') return html;
      const points = lmState.examPoints?.[block.id]?.[index], feedback = lmState.examCorrections?.[block.id]?.[index], mark = lmState.examErrors?.[block.id]?.[index];
      html += '<div class="assessment-feedback"><strong>' + esc(String(points ?? 'Not graded')) + ' / ' + assessmentMax(block,index) + '</strong>' + (mark ? '<span>' + (mark === 'correct' ? 'Correct' : 'Needs work') + '</span>' : '') + (feedback ? '<p>' + esc(feedback) + '</p>' : '') + '</div>';
      return html;
    }
    function examTextReview(block, item, index, kind) {
      const right = examRight(item, kind);
      const given = item.given || "";
      const known = right != null && right !== "";
      const same = known && examSame(given, right);
      let html = "";
      if (!known) html = '<p class="exam-miss exam-strike">' + esc(given || "—") + "</p>";
      else if (same) html = '<p class="exam-hit">' + esc(given || right) + "</p>";
      else html = '<p class="exam-miss exam-strike">' + esc(given || "—") + '</p><p class="exam-hit">' + esc(right) + "</p>";
      const source = block.assessmentSource || block, sourceIndex = block.assessmentIndex ?? index;
      return html + reviewEditor(source,sourceIndex,given) + examFixInput(block, index) + examPointInput(block, index);
    }
    function examAnswerHtml(block) {
      const kind = lmQuizType(block);
      const title = "<h3>" + esc(block.title || kind) + "</h3>";
      const reviewer = canTuneStudentLessons();
      const lock = reviewer || lmState.studentSaved ? " disabled" : "";
      const items = block.items || [];
      const tail = (index) => reviewer ? (["Choice", "Odd one out", "Select all", "True / false"].includes(kind) ? examFixInput(block, index) : "") + examPointInput(block, index) : assessmentFeedback(block,index);
      if (kind === "Choice" || kind === "Odd one out") {
        return title + items.map((item, index) => {
          const given = Number(item.given);
          const right = examRight(item, kind);
          const inputs = (item.options || []).map((opt, oi) => '<label class="lm-opt' + examMarkClass(reviewer, given, right, oi) + '"><input type="radio" name="ex-' + block.id + "-" + index + '" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + oi + '"' + (given === oi ? " checked" : "") + lock + " /> " + esc(opt || "Option") + "</label>").join("");
          return '<div class="lm-q"><b>' + esc(item.prompt || kind) + "</b>" + inputs + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Select all") {
        return title + items.map((item, index) => {
          const given = Array.isArray(item.given) ? item.given.map(Number) : [];
          const right = examRight(item, kind);
          const inputs = (item.options || []).map((opt, oi) => '<label class="lm-opt' + examMarkClass(reviewer, given, right, oi) + '"><input type="checkbox" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + oi + '"' + (given.indexOf(oi) >= 0 ? " checked" : "") + lock + " /> " + esc(opt || "Option") + "</label>").join("");
          return '<div class="lm-q"><b>' + esc(item.prompt || "Question") + "</b>" + inputs + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "True / false") {
        return title + items.map((item, index) => {
          const right = examRight(item, kind);
          const radio = (value, label) => '<label class="lm-opt' + examMarkClass(reviewer, item.given, right, value) + '"><input type="radio" name="ex-' + block.id + "-" + index + '" data-exam-given="' + block.id + ":" + index + '" data-exam-value="' + value + '"' + (item.given === value ? " checked" : "") + lock + " /> " + label + "</label>";
          return '<div class="lm-q"><b>' + esc(item.prompt || "Statement") + "</b>" + radio("true", "True") + radio("false", "False") + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Match" || kind === "Memory") {
        const rights = block.answerOptions || items.map((item) => item.right || "").filter(Boolean);
        return title + items.map((item, index) => {
          if (reviewer) {
            const ok = examSame(item.given, item.right);
            const mark = ok ? '<p class="exam-hit">' + esc(item.given || item.right || "") + "</p>" : '<p class="exam-miss exam-strike">' + esc(item.given || "—") + '</p><p class="exam-hit">' + esc(item.right || "") + "</p>";
            return '<div class="lm-q"><b>' + esc(item.left || "Left") + "</b>" + mark + examFixInput(block, index) + tail(index) + "</div>";
          }
          const options = '<option value="">Choose</option>' + rights.map((right) => '<option' + (item.given === right ? " selected" : "") + ">" + esc(right) + "</option>").join("");
          return '<div class="lm-q"><b>' + esc(item.left || "Left") + '</b><select data-exam-given="' + block.id + ":" + index + '"' + lock + ">" + options + "</select>" + tail(index) + "</div>";
        }).join("");
      }
      if (kind === "Gap" || kind === "Build") {
        const prompt = (item) => kind === "Gap" ? (item.shown || "Fill the gap") : (item.parts || "Build the phrase");
        return title + items.map((item, index) => '<div class="lm-q"><b>' + esc(prompt(item)) + "</b>" + (reviewer ? examTextReview(block, item, index, kind) : '<input type="text" data-exam-given="' + block.id + ":" + index + '" value="' + esc(item.given || "") + '"' + lock + " />") + "</div>").join("");
      }
      return title + items.map((item, index) => {
        const prompt = item.prompt || item.front || item.word || item.text || kind;
        const field = reviewer ? examTextReview(block, item, index, kind) : '<input type="text" data-exam-given="' + block.id + ":" + index + '" value="' + esc(item.given || "") + '"' + lock + " />";
        return '<div class="lm-q"><b>' + esc(prompt) + "</b>" + field + "</div>";
      }).join("");
    }
    function examFillAnswers() {
      document.querySelectorAll('#lmPreview .assignment-score').forEach(node => node.remove());
      (lmState.blocks || []).forEach((block) => {
        if (!["quiz", "exercise", "task"].includes(block.type) || !lmState.examOwned && !block.assessed) return;
        const panel = document.querySelector('#lmPreview [data-lm-panel="' + block.id + '"]');
        if (!panel) return;
        if (block.type === "quiz") panel.innerHTML = examAnswerHtml(block);
        else if (block.type === "task") {
          if(lmState.blocks.some(p=>p.scoringVersion===2)&&examScoringChildren(lmState.blocks,block).length){panel.innerHTML='<h3>'+esc(block.title||'Task')+'</h3><p>'+esc(block.text||'')+'</p>';return;}
          const reviewer = canTuneStudentLessons(), given = block.response || "";
          panel.innerHTML = "<h3>" + esc(block.title || "Task") + "</h3><p>" + esc(block.text || "") + '</p><label>Your answer<textarea data-exam-response="' + block.id + '"' + (reviewer || lmState.studentSaved ? " disabled" : "") + ">" + esc(given) + "</textarea></label>" + (reviewer ? examFixInput(block, 0) + examPointInput(block, 0) : assessmentFeedback(block,0));
        } else {
          panel.innerHTML = '<h3>' + esc(block.title || 'Exercise') + '</h3>' + (block.items || []).map((item, index) => examAnswerHtml({ ...block, assessmentSource:block, assessmentIndex:index, quizType: item.kind === "write" ? "Type" : "Choice", items: [{...item,answer:item.kind==='write'?item.write:item.answer}] }).replace(/^<h3>.*?<\/h3>/,'').replaceAll('data-exam-given="' + block.id + ':0"', 'data-exam-given="' + block.id + ':' + index + '"').replaceAll('ex-' + block.id + '-0', 'ex-' + block.id + '-' + index)).join("");
        }
      });
      if (canTuneStudentLessons()) {
        document.querySelectorAll('#lmPreview [data-exam-response],#lmPreview input[type="text"][data-exam-given]').forEach(field => {
          const key = field.dataset.examGiven || field.dataset.examResponse + ':0', [id,index] = key.split(':'), part = lmState.blocks.find(p => String(p.id) === id);
          if (!part) return;
          const original = field.value; field.hidden = true;
          field.insertAdjacentHTML('afterend',reviewEditor(part,Number(index),original));
        });
      } else if (lmState.assessmentState === 'published') {
        for (const [id,items] of Object.entries(lmState.examReviewText || {})) for (const [index,value] of Object.entries(items)) {
          const field = document.querySelector('[data-exam-given="' + id + ':' + index + '"],[data-exam-response="' + id + '"]');
          field?.insertAdjacentHTML('afterend','<div class="review-edit review-published"><b>Teacher review</b><div>' + reviewHtml(value) + '</div></div>');
        }
      }
      const individualScoring=lmState.examOwned&&lmState.blocks.some(part=>part.scoringVersion===2);
      const leaders = individualScoring?[]:assessmentQuestions(lmState).filter(q => q.part.gradeMode === 'assignment');
      for (const q of leaders) {
        const panel = document.querySelector('#lmPreview [data-lm-panel="' + q.part.id + '"]'); if (!panel) continue;
        const target = panel.closest('.lm-assignment')?.querySelector('header') || panel;
        let html = '<div class="assignment-score"><strong>Maximum: ' + q.max + ' points</strong>';
        if (canTuneStudentLessons()) html += examPointInput(q.part,0,true);
        else if (lmState.assessmentState === 'published') html += '<p>Score: ' + esc(String(lmState.examPoints?.[q.part.id]?.[0] ?? 'Not graded')) + ' / ' + q.max + '</p>';
        target.insertAdjacentHTML('beforeend',html + '</div>');
      }
      if(individualScoring){
        const parts=lmState.blocks,earned=part=>{const children=examScoringChildren(parts,part);return children.length?Number(children.reduce((sum,child)=>sum+earned(child),0).toFixed(10)):(Number(String(lmState.examPoints?.[part.id]?.[0]||0).replace(',','.'))||0);};
        if(canTuneStudentLessons())for(const {part} of assessmentQuestions(lmState)){
          const panel=document.querySelector('#lmPreview [data-lm-panel="'+part.id+'"]');if(!panel)continue;
          const grading=document.createElement('div');grading.className='exam-element-grading';grading.innerHTML=examPointInput(part,0,true);grading.querySelector('[data-exam-error]')?.closest('label')?.remove();panel.prepend(grading);
        }
        for(const part of parts.filter(part=>['task','quiz','exercise'].includes(part.type))){
          if(examScoringChildren(parts,part).length||part.type==='task'&&!part.assignmentKey)continue;
          const panel=document.querySelector('#lmPreview [data-lm-panel="'+part.id+'"]');if(!panel)continue;
          panel.classList.add('exam-scored-element');panel.insertAdjacentHTML('afterbegin','<div class="exam-element-maximum">Maximum '+assessmentUnitMax(part)+(lmState.assessmentState==='published'?' · Score '+earned(part):'')+'</div>');
        }
        document.querySelectorAll('#lmPreview .lm-assignment').forEach(group=>{
          const key=group.dataset.assignment,partsInGroup=parts.filter(part=>(part.assignmentKey||part.assignmentId||('part-'+part.id))===key&&['task','quiz','exercise'].includes(part.type));
          const roots=partsInGroup.filter(part=>!part.assignmentKey),graded=roots.length?roots:partsInGroup;
          const max=graded.reduce((sum,part)=>sum+examScoringMax(parts,part),0),score=graded.reduce((sum,part)=>sum+earned(part),0);
          group.querySelector('header')?.insertAdjacentHTML('beforeend','<div class="assignment-score">Maximum '+Number(max.toFixed(10))+((canTuneStudentLessons()||lmState.assessmentState==='published')?' · Score <span data-exam-task-earned="'+esc(key)+'">'+Number(score.toFixed(10))+'</span>':'')+'</div>');
        });
      }
      document.querySelectorAll('#lmPreview .lm-q').forEach(question => {
        const details = document.createElement('details'), summary = document.createElement('summary'); details.className = 'lm-study-card exam-question-card'; details.open = true;
        const title = question.querySelector('b'); if (title) summary.append(title); else summary.textContent = 'Question';
        question.before(details); details.append(summary,question);
      });
      if (!canTuneStudentLessons()) (lmState.blocks || []).filter(part => ['quiz','exercise'].includes(part.type) && (lmState.examOwned || part.assessed)).forEach(part => {
        document.querySelectorAll('#lmPreview [data-lm-panel="' + part.id + '"] .lm-q').forEach((question,index) => { if (!question.querySelector('.assessment-question-score')) question.insertAdjacentHTML('beforeend',assessmentFeedback(part,index)); });
      });
      const preview=document.getElementById('lmPreview');
      preview.querySelectorAll('textarea[data-exam-response],input[type=text][data-exam-given],textarea[data-exam-fix]').forEach(field=>{
        const feedback=field.dataset.examFix,key=feedback||field.dataset.examGiven||field.dataset.examResponse+':0',[id,index]=key.split(':');
        const map=feedback?(lmState.examCommentFormatting||={}):(lmState.examAnswerText||={}),format=map[id]?.[index];
        if(field.disabled&&format){field.hidden=true;field.insertAdjacentHTML('afterend','<div class="text-color-rich">'+window.TextColors.html(field.value,format)+'</div>');return;}
        window.TextColors?.mount(field,{format,onChange:value=>{if(!value.runs.map(run=>run.text).join(''))delete map[id]?.[index];else (map[id]||={})[index]=value;}});
      });
      preview.querySelectorAll('[data-lm-panel]').forEach(panel=>{const part=lmState.blocks.find(part=>String(part.id)===panel.dataset.lmPanel);if(part)window.TextColors?.paint(panel,part);});
    }
    function examRemember(input) {
      if (!assessmentActive(lmState) || canEditLessons() && !canTuneStudentLessons() || !lmState.assessmentReady) return;
      const reviewer = canTuneStudentLessons();
      if (!reviewer && lmState.studentSaved) return;
      if (reviewer && lmState.assessmentState === 'published') return;
      const reviewed = input.closest('[data-review-text]');
      if (reviewed && reviewer) {
        const [id,index] = reviewed.dataset.reviewText.split(':'); lmState.examReviewText ||= {}; (lmState.examReviewText[id] ||= {})[index] = reviewRuns(reviewed); assessmentStatus('Unsaved review'); return;
      }
      const errorMark = input.closest('[data-exam-error]'), criterion = input.closest('[data-exam-criterion]');
      if ((errorMark || criterion) && reviewer) {
        const source = errorMark || criterion, bits = (source.dataset.examError || source.dataset.examCriterion).split(':');
        if (errorMark) { lmState.examErrors ||= {}; (lmState.examErrors[bits[0]] ||= {})[bits[1]] = source.value; }
        else {
          lmState.examCriteriaPoints ||= {}; const scores = ((lmState.examCriteriaPoints[bits[0]] ||= {})[bits[1]] ||= {}); scores[bits[2]] = source.value;
          const part = lmState.blocks.find(p => String(p.id) === bits[0]), item = ['task','text'].includes(part.type) || part.gradeMode === 'assignment' ? part : part.items[Number(bits[1])];
          const rows = assessmentRubric(item), complete = rows.every((_,i) => scores[i] != null && scores[i] !== '');
          const total = complete ? rows.reduce((n,_,i) => n + Number(scores[i]),0) : '';
          (lmState.examPoints[bits[0]] ||= {})[bits[1]] = total;
          const field = document.querySelector('[data-exam-points="' + bits[0] + ':' + bits[1] + '"]'); if (field) field.value = total;
        }
        assessmentStatus('Unsaved review');examRefreshTaskScores(); return;
      }
      const points = input.closest("[data-exam-points]");
      const fix = input.closest("[data-exam-fix]");
      if (points || fix) {
        const source = points || fix;
        const bits = (source.dataset.examPoints || source.dataset.examFix || "").split(":");
        const partId = bits[0];
        const index = bits[1];
        const bucket = points ? "examPoints" : "examCorrections";
        if (!lmState[bucket]) lmState[bucket] = {};
        if (!lmState[bucket][partId]) lmState[bucket][partId] = {};
        lmState[bucket][partId][index] = points ? source.value : source.value;
        assessmentStatus('Unsaved review');
        examRefreshTaskScores();
        return;
      }
      const source = input.closest("[data-exam-given]");
      const response = input.closest("[data-exam-response]");
      if (response && !reviewer) {
        const block = lmState.blocks.find(row => String(row.id) === response.dataset.examResponse);
        if (block) { block.response = response.value; assessmentAutosave(lmState); }
        return;
      }
      if (!source || reviewer) return;
      const bits = source.dataset.examGiven.split(":");
      const block = (lmState.blocks || []).find((row) => row.id === domEntityId(bits[0]));
      const item = block && (block.items || [])[Number(bits[1])];
      if (!item) return;
      if (source.type === "checkbox") {
        item.given = [...source.closest(".lm-q").querySelectorAll("input:checked")].map((box) => Number(box.dataset.examValue));
      } else if (source.type === "radio") {
        item.given = source.dataset.examValue === "true" || source.dataset.examValue === "false" ? source.dataset.examValue : Number(source.dataset.examValue);
      } else item.given = source.value;
      assessmentAutosave(lmState);
    }
    function examRefreshTaskScores(){
      if(!lmState?.examOwned||!lmState.blocks.some(part=>part.scoringVersion===2))return;
      const questions=assessmentQuestions(lmState);
      document.querySelectorAll('[data-exam-task-earned]').forEach(node=>{const key=node.dataset.examTaskEarned,total=questions.filter(q=>(q.part.assignmentKey||q.part.assignmentId||('part-'+q.part.id))===key).reduce((sum,q)=>sum+(Number(String(lmState.examPoints?.[q.part.id]?.[0]||0).replace(',','.'))||0),0);node.textContent=String(Number(total.toFixed(10)));});
    }
    function examRow(chip, title, about, attr, locked, hidden, tools) {
      return '<div class="day-row' + (locked ? " exam-locked" : "") + (hidden ? " is-hidden" : "") + '"><button class="day" type="button" ' + attr + '><span class="date"><b>' + esc(chip.day) + "</b><small>" + esc(chip.month) + "</small></span><b>" + esc(title) + '</b><span class="label about">' + esc(about) + "</span></button>" + (tools || "") + "</div>";
    }
    function examTools(kind, id, hidden) {
      if (!canEditLessons() && !canTuneStudentLessons()) return "";
      const eye = hidden
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';
      const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>';
      const pencil = kind === "exam" && canEditLessons() ? '<button class="day-edit" type="button" data-exam-edit="' + id + '" aria-label="Edit exam" title="Edit exam"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12 6l4 4"/></svg></button>' : "";
      const hideLabel = hidden ? "Show" : "Hide";
      return '<div class="day-tools"><button class="day-hide' + (hidden ? " is-on" : "") + '" type="button" data-exam-hide="' + kind + ":" + id + '" aria-label="' + hideLabel + '" title="' + hideLabel + '">' + eye + "</button>" + pencil + (canEditLessons() ? contentCopyButton(kind==='exam'?'exam':'exam-block',id) + '<button class="day-del" type="button" data-exam-del="' + kind + ":" + id + '" aria-label="Delete">' + trash + '</button>' : '') + '</div>';
    }
    function examStudentSees(exam) {
      if (!exam || exam.hidden) return false;
      return (exam.blocks || []).some((block) => block.doc && block.doc.published && !block.hidden);
    }
    let examSection='active';
    function examPaintList() {
      const box = document.getElementById("examList");
      const newer = document.getElementById("examNew");
      if (newer) newer.hidden = !canEditLessons() || !classGroups.some(group=>String(group.id)===String(examViewGroup));
      if (!box) return;
      if (authUser && !examReady && !examPulling) examPull();
      const account = examWorkAccount();
      if (authUser && account && examWorkLoadedFor !== account && !examWorkPulling) examPullWork();
      const stored = examLoad();
      let dirty = false;
      stored.forEach((exam) => { if (examStamp(exam)) dirty = true; });
      if (dirty) examSave(stored);
      const exams = examShown();
      document.querySelectorAll('[data-exam-section]').forEach(button=>button.classList.toggle('primary',button.dataset.examSection===examSection));
      const rows = exams.filter(exam=>(exam.instanceStatus==='completed')===(examSection==='completed')).filter((exam) => canEditLessons() || canTuneStudentLessons() || examStudentSees(exam)).slice().sort((a, b) => {
        const groups = String(a.groupTitle || classGroups.find(g => g.id === a.groupId)?.title || 'Unassigned').localeCompare(String(b.groupTitle || classGroups.find(g => g.id === b.groupId)?.title || 'Unassigned'));
        if (groups) return groups;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.created || 0) - (a.created || 0);
      });
      const groupFor=exam=>classGroups.find(g=>g.id===exam.groupId)||{id:exam.groupId||'unassigned',title:exam.groupTitle||'Unassigned'};
      const groups=[...new Map(rows.map(exam=>{const group=groupFor(exam);return [String(group.id),group];})).values()];
      if(!examViewLevel){box.innerHTML=levelButtons(groups,'data-exam-level');return;}
      const back='<button class="btn ghost" type="button" data-exam-level="">Back</button><h2>'+esc(examViewLevel==='unassigned'?'Unassigned':examViewLevel)+'</h2>';
      if(examViewGroup===null){box.innerHTML=back+'<div class="decks">'+groups.filter(group=>accountGroupLevel(group)===examViewLevel).map(group=>'<button class="file-card" type="button" data-exam-group-view="'+esc(group.id)+'"><b>'+esc(group.title)+'</b><span class="label">'+rows.filter(exam=>String(groupFor(exam).id)===String(group.id)).length+' exams</span></button>').join('')+'</div>';return;}
      const selectedGroup=groups.find(group=>String(group.id)===String(examViewGroup));
      box.innerHTML = '<button class="btn ghost" type="button" data-exam-level="'+esc(examViewLevel)+'">Back</button><h2>'+esc(selectedGroup?.title||'Unassigned')+'</h2>' + rows.filter(exam=>String(groupFor(exam).id)===String(examViewGroup)).map((exam) => {
        const chip = lmDateChip(exam.date);
        const mine = !canEditLessons();
        const ready = mine && examReadyForReview(exam);
        const sum = mine ? examVisibleBlocks(exam).reduce((total, block) => total + examPointsTotal(block), 0) : 0;
        let about = exam.hidden ? "Hidden" : (ready ? "Ready for review" : (exam.published ? "Published" : "Draft"));
        const visible = examVisibleBlocks(exam), maximum = Math.round(visible.reduce((n,b) => n + assessmentQuestions({...b.doc,examOwned:true}).reduce((m,q) => m + q.max,0),0)*1e8)/1e8;
        const reviewed = visible.filter(b => b.doc?.assessmentState === 'published').length;
        about += ' · Maximum ' + maximum;
        if (mine && (canTuneStudentLessons() || reviewed)) about += ' · ' + sum + ' points · ' + reviewed + ' / ' + visible.length + ' reviewed';
        const hidden = viewAccount ? !!exam.personalHidden : !!exam.hidden;
        if (hidden) about = viewAccount ? 'Hidden for this student' : about;
        if (viewAccount && !hidden) { const hiddenBlocks = (exam.blocks || []).filter(block => block.personalHidden || block.hidden || !block.doc?.published).length; if (hiddenBlocks) about += " · Hidden " + hiddenBlocks + " / " + (exam.blocks || []).length + " blocks"; }
        if(exam.instanceStatus==='completed')about='Completed · Maximum '+exam.maximumPoints+' · '+exam.earnedPoints+' points';
        return examRow(chip, (exam.title || "Exam")+(canEditLessons()&&exam.studentName?' · '+exam.studentName:''), about, 'data-exam-open="' + exam.id + '"', ready, hidden, exam.instanceStatus==='completed' ? '' : examTools("exam", exam.id, hidden));
      }).join("");
    }
    function examPaintBlocks() {
      const box = document.getElementById("examBlocks");
      const newer = document.getElementById("examBlockNew");
      const date = document.getElementById("examBlocksDate");
      const exam = examView(examCurrentId);
      if (canTuneStudentLessons() && examWorkLoadedFor !== examWorkAccount() && !examWorkPulling) examPullWork();
      if (newer) newer.hidden = !canEditLessons();
      const name = document.getElementById("examBlocksName");
      if (name) name.textContent = exam ? exam.title || "Exam" : "";
      if (date && exam) date.textContent = lmLongDate(exam.date) || "";
      paintPagePath("examblocks");
      if (!box || !exam) return;
      box.innerHTML = (exam.blocks || []).map((block, index) => {
        if (!canEditLessons() && !canTuneStudentLessons() && (!(block.doc && block.doc.published) || block.hidden)) return "";
        const saved = !canEditLessons() && block.doc && block.doc.studentSaved;
        const mine = !canEditLessons();
        const sum = mine ? examPointsTotal(block) : 0;
        let about = block.hidden ? "Hidden" : (block.doc?.assessmentState === 'published' ? 'Results published' : saved ? "Submitted" : (block.doc && block.doc.published ? "Published" : "Draft"));
        if (canTuneStudentLessons() && !block.hidden) about = ({draft:'Not submitted',submitted:'Submitted',reviewing:'Being reviewed',published:'Results published'})[block.doc?.assessmentState] || (examWorkLoadedFor === examWorkAccount() && !examWorkPulling ? 'Not submitted' : 'Loading status…');
        const maximum = Math.round(assessmentQuestions({...block.doc,examOwned:true}).reduce((n,q) => n + q.max,0)*1e8)/1e8;
        about += ' · Maximum ' + maximum;
        if (mine && (canTuneStudentLessons() || block.doc?.assessmentState === 'published')) about += ' · ' + sum + ' points';
        const hidden = viewAccount ? !!block.personalHidden : !!block.hidden;
        if (hidden) about = viewAccount ? 'Hidden for this student' : about;
        return examRow({ day: String(index + 1), month: "" }, (block.doc && block.doc.title) || "Examination block", about, 'data-exam-block="' + block.id + '"', saved, hidden, exam.instanceStatus==='completed' ? '' : examTools("block", block.id, hidden));
      }).join("");
    }
    function examHide(kind, id) {
      id = domEntityId(id);
      if (viewAccount) {
        const exam = examFind(kind === 'exam' ? id : examCurrentId);
        const row = kind === 'exam' ? exam : exam?.blocks?.find(block => block.id === id);
        if (row) return toggleManagedVisibility(row, kind === 'exam' ? 'exam' : 'exam-block');
        return;
      }
      if (!canEditLessons()) return;
      const exams = examLoad();
      if (kind === "exam") {
        const exam = exams.find((row) => row.id === id);
        if (!exam) return;
        exam.hidden = !exam.hidden;
      } else {
        const exam = exams.find((row) => row.id === examCurrentId);
        const block = exam && (exam.blocks || []).find((row) => row.id === id);
        if (!block) return;
        block.hidden = !block.hidden;
      }
      examSave(exams);
      if (kind === "exam") examPaintList();
      else examPaintBlocks();
    }
    function toggleManagedVisibility(row, type) {
      if (!canTuneStudentLessons() || !accountReady || viewSwitching) return;
      const target = viewAccount.id, generation = viewGen;
      return window.LearningMain.perform(async () => {
        await window.LearningMain.setManagedVisibility(target, type, row.id, !!row.personalHidden, !row.personalHidden);
        if (generation !== viewGen || viewAccount?.id !== target) return;
        window.ContentCache?.drop('account:');
        if (type === 'group') await groupPull(true);
        else await examPull(true);
      });
    }
    function examDelete(kind, id) {
      id = domEntityId(id);
      if (!canEditLessons()) return;
      if (!confirm(kind === "exam" ? "Move this exam to Archive?" : "Move this examination block to Archive?")) return;
      const exams = examLoad();
      if (kind === "exam") {
        return window.LearningMain.perform(async () => {
          await window.LearningMain.archiveItem("exam", id);
          if (examCurrentId === id) examCurrentId = "";
          examPaintList();
        });
      }
      const exam = exams.find((row) => row.id === examCurrentId);
      if (!exam) return;
      return window.LearningMain.perform(async () => {
        await window.LearningMain.archiveItem("exam-block", id);
        examPaintBlocks();
      });
    }
    function examTool(event) {
      const dateBtn = event.target.closest("[data-exam-edit]");
      const del = event.target.closest("[data-exam-del]");
      const hide = event.target.closest("[data-exam-hide]");
      if (!dateBtn && !del && !hide) return false;
      event.preventDefault();
      if (dateBtn) { examEdit(dateBtn.getAttribute("data-exam-edit"), dateBtn); return true; }
      const raw = (del || hide).getAttribute(del ? "data-exam-del" : "data-exam-hide") || "";
      const kind = raw.slice(0, raw.indexOf(":"));
      const id = raw.slice(kind.length + 1);
      if (del) examDelete(kind, id);
      else examHide(kind, id);
      return true;
    }
    let examCalPick = null;
    let examCalAnchor = null;
    let examCalView = null;
    function examCloseCalendar() {
      const pop = document.getElementById("examCal");
      if (pop) pop.hidden = true;
      examCalPick = null;
      examCalAnchor = null;
    }
    function examCalShift(step) {
      examCalView.m += step;
      if (examCalView.m < 1) { examCalView.m = 12; examCalView.y -= 1; }
      if (examCalView.m > 12) { examCalView.m = 1; examCalView.y += 1; }
    }
    function examRenderCalendar() {
      let pop = document.getElementById("examCal");
      if (!pop) {
        pop = document.createElement("div");
        pop.id = "examCal";
        pop.className = "exam-cal";
        pop.setAttribute("role", "dialog");
        pop.setAttribute("aria-label", "Choose a date");
        document.body.appendChild(pop);
        pop.addEventListener("pointerdown", (event) => event.stopPropagation());
        pop.addEventListener("click", (event) => {
          const btn = event.target.closest("[data-cal]");
          if (!btn || !examCalView) return;
          const act = btn.getAttribute("data-cal");
          if (act === "prev") examCalShift(-1);
          else if (act === "next") examCalShift(1);
          else if (act === "prev-year") examCalView.y -= 1;
          else if (act === "next-year") examCalView.y += 1;
          else if (act === "day") {
            const date = btn.getAttribute("data-date");
            const pick = examCalPick;
            examCloseCalendar();
            if (pick && date) pick(date);
            return;
          }
          examRenderCalendar();
        });
      }
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const y = examCalView.y;
      const m = examCalView.m;
      const first = new Date(y, m - 1, 1);
      const lead = (first.getDay() + 6) % 7;
      const count = new Date(y, m, 0).getDate();
      const today = lmToday();
      let cells = "";
      for (let i = 0; i < lead; i++) cells += '<span class="exam-cal-pad"></span>';
      for (let day = 1; day <= count; day++) {
        const iso = y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
        const on = iso === examCalView.selected ? " is-on" : "";
        const now = iso === today ? " is-today" : "";
        cells += '<button class="exam-cal-day' + on + now + '" type="button" data-cal="day" data-date="' + iso + '">' + day + "</button>";
      }
      pop.innerHTML = '<div class="exam-cal-nav"><button type="button" data-cal="prev-year" aria-label="Previous year">«</button><button type="button" data-cal="prev" aria-label="Previous month">‹</button><strong>' + months[m - 1] + " " + y + '</strong><button type="button" data-cal="next" aria-label="Next month">›</button><button type="button" data-cal="next-year" aria-label="Next year">»</button></div><div class="exam-cal-week"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="exam-cal-grid">' + cells + "</div>";
      pop.hidden = false;
      const rect = examCalAnchor.getBoundingClientRect();
      const width = pop.offsetWidth;
      const height = pop.offsetHeight;
      let left = rect.left;
      let top = rect.bottom + 8;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
      pop.style.left = Math.max(8, left) + "px";
      pop.style.top = Math.max(8, top) + "px";
    }
    function examOpenCalendar(anchor, value, onPick) {
      if (!anchor) return;
      const picked = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
      const base = picked || lmToday();
      const parts = base.split("-").map(Number);
      examCalPick = onPick;
      examCalAnchor = anchor;
      examCalView = { y: parts[0], m: parts[1], selected: picked };
      examRenderCalendar();
    }
    function closeItemEditor() {
      const pop = document.getElementById("itemEditPop");
      if (pop) pop.remove();
    }
    function openItemEditor(anchor, value, onSave) {
      closeItemEditor();
      const pop = document.createElement("form");
      pop.id = "itemEditPop";
      pop.className = "item-edit-pop";
      pop.innerHTML = '<label>' + esc(value.label || "Name") + '<input type="text" name="title" maxlength="120" value="' + esc(value.title || "") + '"></label><label>Date<span class="date-control"><input type="text" name="date" inputmode="numeric" placeholder="YYYY-MM-DD" maxlength="10" value="' + esc(value.date || "") + '"><button class="date-picker-btn" type="button" data-item-calendar aria-label="Choose date"></button></span></label><div class="item-edit-actions"><button class="btn ghost" type="button" data-item-cancel>Cancel</button><button class="btn primary" type="submit">Save</button></div>';
      document.body.appendChild(pop);
      pop.addEventListener("pointerdown", (event) => event.stopPropagation());
      pop.querySelector("[data-item-cancel]").addEventListener("click", closeItemEditor);
      pop.querySelector("[data-item-calendar]").addEventListener("click", (event) => {
        const input = pop.elements.date;
        examOpenCalendar(event.currentTarget, input.value, (date) => { input.value = date; });
      });
      pop.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = pop.elements.title.value.trim().slice(0, 120);
        const date = pop.elements.date.value.trim();
        if (!title) { pop.elements.title.focus(); return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { pop.elements.date.focus(); return; }
        closeItemEditor();
        onSave({ title: title, date: date });
      });
      pop.elements.title.focus();
      pop.elements.title.select();
    }
    function examEdit(id, button) {
      id = domEntityId(id);
      const exam = examFind(id);
      if (!exam || !button) return;
      openItemEditor(button, { title: exam.title || "Exam", date: exam.date || "", label: "Exam name" }, (value) => examSetMeta(id, value));
    }
    function examGroupName(title,groupId) {
      const group=classGroups.find(group=>group.id===groupId),level=group&&accountGroupLevel(group);
      if(!adminLevels.includes(level))return title;
      const old=accountGroupLevel({title:title});
      const suffix=old==='unassigned'?title:title===old?'Exam':title.startsWith(old+' ')?title.slice(old.length+1):title.slice(0,-old.length-1);
      return (level+' '+(suffix||'Exam')).slice(0,120);
    }
    function examSetMeta(id, value) {
      if (!canEditLessons() || !value.title || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === id);
      if (!exam) return;
      exam.title = examGroupName(value.title,exam.groupId);
      exam.date = value.date;
      (exam.blocks || []).forEach((block) => { if (block.doc) block.doc.date = value.date; });
      if (lmState && lmState.examOwned && lmState.examId === id) lmState.date = value.date;
      examSave(exams);
      examPaintList();
    }
    function examAdd() {
      if (!canEditLessons()) return;
      openItemEditor(document.getElementById("examNew"), { title: (adminLevels.includes(examViewLevel)?examViewLevel+' ':'')+'Exam', date: lmToday(), label: "Exam name" }, (value) => {
        const exams = examLoad();
        const groupId=classGroups.some(group=>String(group.id)===String(examViewGroup))?Number(examViewGroup):null;
        exams.push({ id: "exam-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), groupId, title: examGroupName(value.title,groupId), date: value.date, created: Date.now(), blocks: [] });
        examSave(exams);
        examPaintList();
      });
    }
    function examAddBlock() {
      if (!canEditLessons()) return;
      const exams = examLoad();
      const exam = exams.find((row) => row.id === examCurrentId);
      if (!exam) return;
      const doc = lmBlankMaterial();
      doc.id = "exb-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      doc.title = "Examination block";
      doc.date = exam.date || lmToday();
      doc.examOwned = true;
      doc.examId = exam.id;
      doc.blockId = doc.id;
      doc.studentSaved = false;
      exam.blocks = exam.blocks || [];
      exam.blocks.push({ id: doc.id, doc: doc });
      examSave(exams);
      examPaintBlocks();
    }
    function examOpenBlock(blockId) {
      blockId = domEntityId(blockId);
      const exam = examView(examCurrentId);
      const block = exam && (exam.blocks || []).find((row) => row.id === blockId);
      if (!block || !block.doc) return;
      if (!examHold) examHold = lmState && lmState.examOwned ? null : lmState;
      lmState = block.doc;
      lmState.examOwned = true;
      lmState.examId = exam.id;
      lmState.blockId = block.id;
      if(typeof materialReviewStudent!=='undefined'&&materialReviewStudent&&!viewAccount)lmState.reviewStudentId=materialReviewStudent.id;
      if (!canEditLessons()) lmState.mode = "preview";
      visit("material");
    }
    function examBoot() {
      const openScreen = show;
      show = function (id) {
        if ((examHold || (lmState && lmState.examOwned)) && !(id === "material" && lmState && lmState.examOwned)) examLeave();
        const result = openScreen(id);
        if (id === "exams") examPaintList();
        if (id === "examblocks") examPaintBlocks();
        return result;
      };
      const newer = document.getElementById("examNew");
      const blockNew = document.getElementById("examBlockNew");
      const list = document.getElementById("examList");
      const blocks = document.getElementById("examBlocks");
      const save = document.getElementById("examSave");
      if (newer) newer.addEventListener("click", examAdd);
      document.addEventListener("click", (event) => {
        const button = event.target.closest("[data-date-picker]");
        if (!button) return;
        const input = document.getElementById(button.dataset.datePicker);
        if (!input) return;
        examOpenCalendar(button, input.value, (date) => {
          input.value = date;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
      document.addEventListener("pointerdown", (event) => {
        const pop = document.getElementById("examCal");
        const editor = document.getElementById("itemEditPop");
        if (pop && !pop.hidden && !pop.contains(event.target)) examCloseCalendar();
        if (editor && !editor.contains(event.target)) closeItemEditor();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { examCloseCalendar(); closeItemEditor(); }
      });
      if (blockNew) blockNew.addEventListener("click", examAddBlock);
      document.addEventListener('click',event => {
        const open = event.target.closest('#adminGroupDetail [data-exam-open]');
        if (!open || !isTeacher() || viewAccount) return;
        examCurrentId = domEntityId(open.dataset.examOpen); visit('examblocks');
      });
      document.getElementById('examSections')?.addEventListener('click',event=>{const button=event.target.closest('[data-exam-section]');if(button){examSection=button.dataset.examSection;examPaintList();rememberPlace();}});
      if (list) list.addEventListener("click", async (event) => {
        if (examTool(event)) return;
        const open = event.target.closest("[data-exam-open]");
        if (!open) return;
        const instance=examFind(open.dataset.examOpen);
        if(instance?.studentId&&canEditLessons()){
          await openStudentPages({id:instance.studentId,name:instance.studentName,role:'USER'});
          await examPull(true);
        }
        examCurrentId = domEntityId(open.dataset.examOpen);
        visit("examblocks");
      });
      if (blocks) blocks.addEventListener("click", (event) => {
        if (examTool(event)) return;
        const open = event.target.closest("[data-exam-block]");
        if (!open) return;
        examOpenBlock(open.dataset.examBlock);
      });
      async function assessmentAction(action,extra={}) {
        const doc = lmState;
        if (!assessmentActive(doc) || !doc.assessmentReady || doc.assessmentBusy) return;
        if (assessmentPendingDoc === doc) { clearTimeout(assessmentTimer); assessmentPendingDoc = null; }
        doc.assessmentBusy = true; examDress();
        try { await assessmentWrite(doc,action,extra); }
        catch(error) { assessmentStatus(error.message,doc); }
        finally { doc.assessmentBusy = false; if (doc === lmState) examDress(); }
      }
      if (save) save.addEventListener('click',async () => {
        if (!assessmentActive(lmState) || canEditLessons() && !canTuneStudentLessons()) return;
        if (canTuneStudentLessons()) return assessmentAction('review');
        if (lmState.studentSaved) return;
        const answers = examCollectAnswers(lmState), missing = assessmentAnswerQuestions(lmState).filter(q => answers[q.part.id]?.[q.index] == null || answers[q.part.id][q.index] === '' || Array.isArray(answers[q.part.id][q.index]) && !answers[q.part.id][q.index].length).length;
        if (!confirm((missing ? missing + ' unanswered question(s). ' : '') + 'Submit your answers?'+(lmState.examOwned?' Your answers will be permanently locked.':' You cannot change them unless your teacher reopens the submission.'))) return;
        await assessmentAction('submit');
      });
      document.getElementById('assessmentPublish')?.addEventListener('click',() => { if (confirm('Publish scores and feedback for this student?')) assessmentAction('publish'); });
      for (const [id,action] of [['assessmentReopen','reopen'],['assessmentAmend','amend']]) document.getElementById(id)?.addEventListener('click',() => {
        if(lmState?.examOwned&&action==='amend'){assessmentAction(action);return;}
        const reason = prompt(action === 'reopen' ? 'Why are you reopening the submission?' : 'Why are you amending the published review?');
        if (reason?.trim()) assessmentAction(action,{reason:reason.trim()});
      });
      document.getElementById('assessmentHistory')?.addEventListener('click',async () => {
        const doc = lmState;
        try {
          const result = await accountFetch('/api/assessment?history=1&kind=' + (doc.examOwned ? 'exam-block' : 'lesson') + '&id=' + (doc.examOwned ? doc.blockId : doc.id) + '&student=' + encodeURIComponent(doc.reviewStudentId||viewAccount?.id||examWorkAccount()));
          const rows = result.history || [];
          const dialog = document.createElement('dialog'); dialog.className = 'assessment-history';
          dialog.innerHTML = '<form method="dialog"><button class="lm-btn" aria-label="Close">Close</button></form><h2>Submission history</h2>' + (rows.length ? rows.map(row => '<p><strong>' + esc(row.action) + '</strong> · ' + esc(new Date(row.createdAt * 1000).toLocaleString()) + '</p>' + (row.reason ? '<p>' + esc(row.reason) + '</p>' : '')).join('') : '<p>No changes yet.</p>');
          document.body.append(dialog); dialog.addEventListener('close',() => dialog.remove()); dialog.showModal();
        } catch(error) { assessmentStatus(error.message); }
      });
      document.addEventListener('click',event => { if (event.target.closest('#assessmentRetry')) { if (!lmState.assessmentReady) assessmentRead(lmState); else assessmentAction(canTuneStudentLessons() ? 'review' : lmState.studentSaved ? 'review' : 'draft'); } });
      document.addEventListener("input", (event) => examRemember(event.target));
      document.addEventListener("change", (event) => examRemember(event.target));
    }
    function installListSearch(id, label, selector, scopeKey) {
      const list = document.getElementById(id);
      if (!list) return;
      const control = document.createElement('div');
      control.className = 'list-search';
      const input = document.createElement('input');
      input.type = 'search'; input.id = id + 'Search';
      input.placeholder = label; input.setAttribute('aria-label', label);
      const status = document.createElement('p');
      status.className = 'hint'; status.setAttribute('role', 'status'); status.hidden = true;
      control.append(input, status); list.before(control);
      const originalHidden = new WeakMap(), originalOpen = new WeakMap();
      let scope;
      const apply = () => {
        if (scopeKey) {
          const next = scopeKey();
          if (scope !== next) { input.value = ''; scope = next; }
        }
        const query = input.value.trim().toLocaleLowerCase();
        if(id==='examList')control.hidden=!examViewLevel||examViewGroup===null;
        const rows = [...list.querySelectorAll(selector)].filter(row => !row.parentElement.closest(selector) || !list.contains(row.parentElement.closest(selector)));
        if (id === 'adminBody') {
          control.hidden = adminTab === 'accounts' || adminTab === 'groups';
          if (adminTab === 'groups') input.value = '';
          input.placeholder = adminTab === 'groups' ? 'Search groups' : adminTab === 'requests' ? 'Search approval requests' : 'Search registration history';
          input.setAttribute('aria-label', input.placeholder);
        }
        let matches = 0;
        rows.forEach(row => {
          if (!originalHidden.has(row)) originalHidden.set(row, row.hidden);
          row.hidden = originalHidden.get(row) || !!query && !row.textContent.toLocaleLowerCase().includes(query);
          if (!row.hidden) matches++;
        });
        list.querySelectorAll('.accounts-fold, .archive-group').forEach(group => {
          const children = rows.filter(row => group.contains(row));
          if (!children.length) return;
          group.hidden = !!query && children.every(row => row.hidden);
          if (group.tagName === 'DETAILS') {
            if (query && !originalOpen.has(group)) originalOpen.set(group, group.open);
            if (query && !group.hidden) group.open = true;
            if (!query && originalOpen.has(group)) { group.open = originalOpen.get(group); originalOpen.delete(group); }
          }
        });
        list.querySelectorAll(':scope > .lib-h').forEach(heading => {
          let row = heading.nextElementSibling, visible = false;
          while (row && !row.matches('.lib-h')) { if (rows.includes(row) && !row.hidden) visible = true; row = row.nextElementSibling; }
          heading.hidden = !!query && !visible;
        });
        status.hidden = !query;
        status.textContent = matches ? matches + ' results' : 'No matches.';
      };
      input.addEventListener('input', apply);
      new MutationObserver(apply).observe(list, {childList: true, subtree: true, characterData: true});
      apply();
    }
    for (const [id, label, selector, scope] of [
      ['lmDayList', 'Search lessons', '.day-row', () => classGroupId],
      ['examList', 'Search exams', '.day-row', () => [examViewLevel,examViewGroup,examSection].join(':')],
      ['examBlocks', 'Search examination blocks', '.day-row', () => examCurrentId],
      ['textList', 'Search texts', '[data-text-open]'],
      ['textExpressions', 'Search expressions', '.expression-card', () => openTextId],
      ['speakoutList', 'Search Speakout', '.file-card, .tense', () => [speakView,speakLevel,speakUnit,speakLesson].join(':')],
      ['archiveList', 'Search archive', '.day-row'],
      ['bugList', 'Search bugs', '.bug-item'],
      ['adminBody', 'Search groups', '[data-admin-group-fold], [data-list-row]', () => adminTab],
      ['adminGroupDetail', 'Search students, lessons or exams', '.day-row, .path', () => adminGroupId]
    ]) installListSearch(id, label, selector, scope);
    const textSearch = document.createElement('input');
    textSearch.type = 'search'; textSearch.id = 'textBodySearch'; textSearch.className = 'text-body-search';
    textSearch.placeholder = 'Search in this text'; textSearch.setAttribute('aria-label', 'Search in this text');
    const textBody = document.getElementById('textReadBody');
    const textSearchBar = document.createElement('div'); textSearchBar.className = 'text-search-bar';
    textBody.before(textSearchBar); textSearchBar.append(textSearch);
    const textSearchNav = document.createElement('div'); textSearchNav.className = 'text-search-nav'; textSearchNav.hidden = true;
    const textMatchNumber = document.createElement('span'); textMatchNumber.className = 'text-match-number'; textMatchNumber.setAttribute('role', 'status');
    function textIconButton(label, path) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn icon';
      button.title = label; button.setAttribute('aria-label', label);
      button.innerHTML = '<svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
      return button;
    }
    const textPrevious = textIconButton('Previous match', 'm18 15-6-6-6 6');
    const textNext = textIconButton('Next match', 'm6 9 6 6 6-6');
    textSearchNav.append(textPrevious, textMatchNumber, textNext); textSearchBar.append(textSearchNav);
    const textCollapse = textIconButton('Collapse text', 'm7 11 5-5 5 5 M7 18l5-5 5 5');
    textCollapse.id = 'textCollapse'; textCollapse.hidden = true;
    document.getElementById('textread').append(textCollapse);
    const textSearchStatus = document.createElement('p'); textSearchStatus.className = 'hint'; textSearchStatus.hidden = true;
    textSearchStatus.setAttribute('role', 'status'); textSearchBar.after(textSearchStatus);
    let textWasCollapsed = false, textMatches = [], textMatchIndex = -1;
    function goToTextMatch(index, focus = true) {
      if (!textMatches.length) return;
      textMatches[textMatchIndex]?.classList.remove('is-current');
      textMatchIndex = (index + textMatches.length) % textMatches.length;
      const match = textMatches[textMatchIndex]; match.classList.add('is-current'); match.tabIndex = -1;
      textBody.classList.remove('collapsed'); document.getElementById('textReadMore').hidden = true;
      textMatchNumber.textContent = (textMatchIndex + 1) + ' / ' + textMatches.length;
      if (focus) match.focus({preventScroll: true});
      match.scrollIntoView({block: 'center', behavior: 'auto'});
    }
    textPrevious.addEventListener('click', () => goToTextMatch(textMatchIndex - 1));
    textNext.addEventListener('click', () => goToTextMatch(textMatchIndex + 1));
    textSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); goToTextMatch(textMatchIndex + (event.shiftKey ? -1 : 1), false); }
    });
    textCollapse.addEventListener('click', () => {
      textWasCollapsed = true; textBody.classList.add('collapsed');
      const more = document.getElementById('textReadMore'); more.hidden = false; more.textContent = 'Show the rest';
      textSearchBar.scrollIntoView({block: 'start'}); textSearch.focus({preventScroll: true});
    });
    new MutationObserver(() => { textCollapse.hidden = textBody.classList.contains('collapsed') || !textBody.textContent.trim(); })
      .observe(textBody, {attributes: true, attributeFilter: ['class'], childList: true});
    function findInText() {
      const query = textSearch.value.trim().toLocaleLowerCase();
      const raw = textBody.textContent;
      const fragment = document.createDocumentFragment();
      let start = 0, count = 0;
      const pattern = query && new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
      for (const match of pattern ? raw.matchAll(pattern) : []) {
        count++;
        if (count > 1000) continue;
        fragment.append(document.createTextNode(raw.slice(start, match.index)));
        const mark = document.createElement('mark'); mark.textContent = match[0]; fragment.append(mark);
        start = match.index + match[0].length;
      }
      fragment.append(document.createTextNode(raw.slice(start))); textBody.replaceChildren(fragment);
      textMatches = [...textBody.querySelectorAll('mark')]; textMatchIndex = -1;
      textSearchNav.hidden = !textMatches.length;
      if (query) {
        if (!textSearch.dataset.searching) textWasCollapsed = textBody.classList.contains('collapsed');
        textSearch.dataset.searching = '1'; textBody.classList.remove('collapsed');
        document.getElementById('textReadMore').hidden = true;
      } else if (textSearch.dataset.searching) {
        delete textSearch.dataset.searching; textBody.classList.toggle('collapsed', textWasCollapsed); fitTextBody();
      }
      textSearchStatus.hidden = !query; textSearchStatus.textContent = count ? count + ' matches' + (count > 1000 ? ' · First 1000 highlighted' : '') : 'No matches.';
      if (textMatches.length) goToTextMatch(0, false);
    }
    let textSearchTimer;
    textSearch.addEventListener('input', () => { clearTimeout(textSearchTimer); textSearchTimer = setTimeout(findInText, 120); });
    new MutationObserver(() => {
      clearTimeout(textSearchTimer); textSearch.value = ''; delete textSearch.dataset.searching;
      textSearchStatus.hidden = true; textSearchNav.hidden = true; textMatches = []; textMatchIndex = -1;
    }).observe(document.getElementById('textReadTitle'), {childList: true});
    examBoot();
    paintTextCount();
    paintHomeStats();
    resumePlace();
    initAccount();
