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
        return "<article class=\"card saas-card expression-card" + (saved ? " expression-added" : "") + "\" style=\"margin-bottom:10px\">"
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
          + "<div class=\"row\"><a class=\"btn saas-btn\" href=\"" + reverso + "\" target=\"_blank\" rel=\"noopener\">Open in Reverso</a></div>"
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
      if (saved) return "<button class=\"btn ok saas-btn\" type=\"button\" data-text-open-card=\"" + index + "\">In " + esc(deck) + "</button>";
      return "<button class=\"btn primary saas-btn\" type=\"button\" data-text-card=\"" + index + "\">Add to Cards</button>";
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
