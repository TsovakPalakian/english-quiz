    function restoreOverflowStores() {
      const bootGen = viewGen;
      idbGetSongs().then((saved) => {
        if (bootGen !== viewGen || viewAccount || viewSwitching) return;
        if (!saved || !saved.length) return;
        const local = loadSongs();
        const seen = {};
        local.forEach((song) => { if (song && song.id) seen[song.id] = 1; });
        let changed = false;
        saved.forEach((song) => {
          if (!song || !song.id || seen[song.id]) return;
          local.push(song);
          seen[song.id] = 1;
          changed = true;
        });
        if (!changed) return;
        if (bootGen !== viewGen || viewAccount || viewSwitching) return;
        songCache = local;
        paintLyrics();
      });
      idbGetAdded().then((saved) => {
        if (bootGen !== viewGen || viewAccount || viewSwitching) return;
        if (!saved || !saved.length) return;
        if (localStorage.getItem(ADDED_KEY)) return;
        if (addedCache && addedCache.length) return;
        addedCache = saved;
        paintAdded();
      });
    }
    restoreOverflowStores();
    document.addEventListener("input", (e) => {
      if (!e.target.matches("[data-card-search]")) return;
      const section = e.target.closest("section");
        if (!e.target.value.trim()) {
        if (section.id === "allwords") paintAllWords();
        else if (section.id === "cardstat") paintStat();
        else if (section.id === "add") renderAddedList();
        else if (section.id === "verbs") paintVerbs();
        else if (section.id === "music") paintLyrics();
        else if (section.id === "phrasal" || section.id === "idioms") paintDeckGrids(section.id);
        applyCardSearch(section);
        return;
      }
      applyCardSearch(section);
    });
    const addWord = document.getElementById("addWord");
    const addGo = document.getElementById("addGo");
    if (addWord && addGo) {
      addWord.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addGo.click();
      });
      addGo.addEventListener("click", () => {
        saveWord("mine", addWord, document.getElementById("addStatus"), addGo, true);
      });
    }
    let dayQuizPlace = "lesson-21";
    let dayReturn = "lesson";
    let dayPoolOverride = null;
    let dayQueue = [];
    let dayAt = 0;
    let examMode = false;
    let examClosed = false;
    let examMistakes = 0;
    let examCorrect = 0;
    let examLog = [];
    let examStarted = 0;
    let examClock = 0;
    let studyTitle = "Study";
    let studyScreen = "setup";
    const MISTAKE_KEY = "enquiz-mistakes";
    const EXAM_MS = 20 * 60 * 1000;
    let sessionMs = EXAM_MS;
    let dayCardTotal = 0;
    let daySetupLabel = "";
    let dayPoolStrict = false;
    function quizPool() {
      const base = dayPoolOverride || lessonPool(dayQuizPlace);
      // Keep the active pool as-is. Custom quizzes weave in per card in buildDayQueue.
      // Material explicitly calls mergeCardQuizCards; do not pull unrelated custom words into lesson pools.
      return Array.isArray(base) ? base.slice() : [];
    }
    function cardFromQuizWord(key, list) {
      let en = key;
      let ru = "";
      (Array.isArray(list) ? list : []).forEach((quiz) => {
        const item = (quiz && quiz.items && quiz.items[0]) || {};
        const type = (quiz && quiz.type) || "";
        if (!en && item.front) en = item.front;
        if (!en && item.left) en = item.left;
        if (!ru && item.back) ru = item.back;
        if (!ru && item.right) ru = item.right;
        if (!ru && (type === "Choice" || type === "Listen" || type === "Definition") && Array.isArray(item.options)) {
          const packed = customQuizPackedOptions(item);
          ru = packed.right || item.word || "";
        }
        if (!ru && type === "Type") ru = item.prompt || "";
        if (!ru && type === "Reverse") ru = item.front || "";
      });
      const looked = cardQuizLookup(en || key);
      return {
        en: (looked && looked.en) || en || key,
        ru: ru || (looked && looked.ru) || "",
        pos: (looked && looked.pos) || "",
        uk: (looked && looked.uk) || "",
        us: (looked && looked.us) || "",
        ex: (looked && looked.ex) || "",
        gloss: (looked && looked.gloss) || ""
      };
    }
    function cardsFromSavedQuizzes() {
      const map = loadCardQuizzes();
      return Object.keys(map).filter((key) => !key.startsWith('copy-card:')).map((key) => cardFromQuizWord(key, map[key])).filter((card) => card.en);
    }
    function mergeCardQuizCards(cards) {
      const base = Array.isArray(cards) ? cards.slice() : [];
      const seen = new Set();
      base.forEach((card) => {
        const key = String(card && card.en || "").toLowerCase();
        if (key) seen.add(key);
      });
      cardsFromSavedQuizzes().forEach((card) => {
        const key = String(card.en || "").toLowerCase();
        if (!key || seen.has(key)) return;
        if (!cardQuizzesOf(key).some(customQuizReady)) return;
        seen.add(key);
        base.push(card);
      });
      return base;
    }
    function rowsForSong(rows, songId, inSong) {
      if (!songId) return rows;
      if (songId === "other") return songSlices(rows, inSong).left;
      const song = findSong(songId);
      return song ? rows.filter((row) => inSong(row, song.keys)) : rows;
    }
    function songStudyTitle(fallback, songId) {
      if (!songId) return fallback;
      if (songId === "other") return "Other words";
      const song = findSong(songId);
      return song ? song.number + " " + song.title : fallback;
    }
    function allSearchRows() {
      const rows = allRows();
      if (!allGroup) return rows;
      const shown = rows.filter((row) => sourceName(row) === allGroup);
      return allGroup === "Song lyrics" ? rowsForSong(shown, allSong, rowInKeys) : shown;
    }
    function addSearchRows() {
      const list = [];
      loadAdded().forEach((item, index) => {
        if (ownMine(item)) list.push({ item: item, index: index });
      });
      return list;
    }
    function statRows() {
      const rows = (homeBuckets(studyCards())[statKind] || []).slice().sort(byLesson);
      const shown = statGroup ? rows.filter((row) => sourceName(row) === statGroup) : rows;
      return statGroup === "Song lyrics" ? rowsForSong(shown, statSong, rowInKeys) : shown;
    }
    function cardsMatching(keys) {
      const seen = new Set();
      const cards = [];
      collectCards().forEach((row) => {
        if (!rowInKeys(row, keys)) return;
        const id = String(row.en || "").toLowerCase();
        if (!id || seen.has(id)) return;
        seen.add(id);
        cards.push(rowToCard(row));
      });
      return cards;
    }
    function withStage(card, source) {
      if (source && source.stageId) card.stageId = source.stageId;
      return card;
    }
    function rowToCard(row) {
      if(row.kind==='essential')return stageEssentialCard(row.key);
      const key = String(row.en || "").toLowerCase();
      const lesson = extraWords.find((item) => String(item.en).toLowerCase() === key) || words.find((item) => String(item.en).toLowerCase() === key) || phrases09.find((item) => String(item.en).toLowerCase() === key) || adverbs14.find((item) => String(item.en).toLowerCase() === key) || talk16.find((item) => String(item.en).toLowerCase() === key) || likes23.find((item) => String(item.en).toLowerCase() === key) || ask07.find((item) => String(item.en).toLowerCase() === key) || lines21.find((item) => String(item.en).toLowerCase() === key);
      if (lesson) return withStage({ en: lesson.en, ru: lesson.ru, pos: lesson.pos || "", uk: lesson.uk || "", us: lesson.us || "", ex: lesson.ex || "", gloss: lesson.gloss || "" }, lesson);
      const song = songCards[row.key] || songCards[key];
      if (song) return withStage({ en: song.en, ru: song.ru, pos: song.pos || "", uk: song.uk || "", us: song.us || "", ex: song.ex || "", gloss: song.gloss || "" }, song);
      if (key === "give up") return withStage({ en: "give up", ru: "сдаваться, бросать", pos: "phrasal verb", uk: "/ɡɪv ˈʌp/", us: "", ex: "I won't give up.", gloss: "to stop doing or having something." }, phrasalWords.find((item) => String(item.en || "").toLowerCase() === "give up"));
      const item = loadAdded().find((saved) => String(saved.word).toLowerCase() === key);
      if (item) {
        const cam = item.data && item.data.cambridge ? item.data.cambridge : {};
        const word = String(item.word || "");
        const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        const usage = item.data && item.data.usages ? item.data.usages.find((line) => re.test(line.en || "")) : null;
        const wh = item.data && item.data.wooordhunt ? item.data.wooordhunt : {};
        return withStage({
          en: word, ru: item.ru || "", pos: cam.pos || "",
          uk: cam.uk || wh.uk || (item.data && item.data.uk) || "",
          us: cam.us || wh.us || (item.data && item.data.us) || "",
          ex: usage ? usage.en : "", gloss: cam.definition || expressionNote(item) || ""
        }, item);
      }
      return withStage({ en: row.en, ru: row.ru || "", pos: "", uk: "", us: "", ex: "", gloss: "" }, row);
    }
    function lessonBank(place) {
      if (place === "lesson-07") return ask07;
      if (place === "lesson-09") return phrases09;
      if (place === "lesson-14") return adverbs14;
      if (place === "lesson-16") return talk16;
      if (place === "lesson-21") return words.concat(lines21);
      if (place === "lesson-23") return likes23;
      return [];
    }
    function lessonHome(place) {
      if (place === "lesson-07") return { id: "lesson07", label: "7 Sep" };
      if (place === "lesson-09") return { id: "lesson09", label: "9 Sep" };
      if (place === "lesson-14") return { id: "lesson14", label: "14 Sep" };
      if (place === "lesson-16") return { id: "lesson16", label: "16 Sep" };
      if (place === "lesson-23") return { id: "lesson23", label: "23 Sep" };
      return { id: "lesson", label: "21 Sep" };
    }
    function lessonPool(place) {
      const base = lessonBank(place).filter(cardVisible).map((w) => withStage({ en: w.en, ru: w.ru, pos: w.pos, uk: w.uk, us: w.us, ex: w.ex, gloss: w.gloss }, w));
      const extra = loadAdded().filter((item) => (item.place || "mine") === place).map((item) => {
        const cam = item.data && item.data.cambridge ? item.data.cambridge : {};
        const word = String(item.word || "");
        const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        const usage = item.data && item.data.usages ? item.data.usages.find((row) => re.test(row.en || "")) : null;
        const wh = item.data && item.data.wooordhunt ? item.data.wooordhunt : {};
        return withStage({
          en: word, ru: item.ru, pos: cam.pos || "",
          uk: cam.uk || wh.uk || (item.data && item.data.uk) || "",
          us: cam.us || wh.us || (item.data && item.data.us) || "",
          ex: usage ? usage.en : "", gloss: cam.definition || ""
        }, item);
      });
      return base.concat(extra);
    }
    function ruleHtml(list) {
      return (list || []).map((r) =>
        '<div class="rule"><b class="ru">' + r.title.ru + '</b><b class="en">' + r.title.en + '</b><div class="ru">' + r.body.ru + '</div><div class="en">' + r.body.en + '</div><p>' +
        foldedLinkHtml(r.links) + "</p></div>"
      ).join("");
    }
    function lessonWordItems(place) {
      const bank = place === "lesson-21" ? words : lessonBank(place);
      const rows = [];
      bank.forEach((w, index) => {
        if (!cardVisible(w)) return;
        rows.push({ kind: "bank", index: index, en: w.en, ru: w.ru || w.gloss || "", pos: w.pos || "", uk: w.uk || "", us: w.us || "" });
      });
      loadAdded().forEach((item, index) => {
        if ((item.place || "mine") !== place) return;
        const cam = item.data && item.data.cambridge ? item.data.cambridge : {};
        const wh = item.data && item.data.wooordhunt ? item.data.wooordhunt : {};
        rows.push({
          kind: "added", index: index, en: item.word, ru: item.ru || "", pos: "added",
          uk: cam.uk || wh.uk || (item.data && item.data.uk) || "",
          us: cam.us || wh.us || (item.data && item.data.us) || ""
        });
      });
      return rows;
    }
    function openLessonWords(place, keep) {
      openLessonPlace = place;
      const home = lessonHome(place);
      const rows = lessonWordItems(place);
      document.getElementById("dayWordsTitle").textContent = "Words · " + home.label;
      document.getElementById("dayWordsBack").dataset.fallback = home.id;
      document.getElementById("dayWordsList").innerHTML = rows.map((row) => {
        const attr = row.kind === "added"
          ? 'data-added="' + row.index + '"'
          : 'data-bank-place="' + place + '" data-bank-index="' + row.index + '"';
        return '<button class="wcard saas-card" type="button" ' + attr + '><div class="en">' + esc(row.en) + '</div><div class="pos">' + esc(row.pos) + '</div>' + ipaHtml(row) + '<div class="label">' + esc(row.ru) + "</div></button>";
      }).join("");
      if (keep) show("daywords");
      else visit("daywords");
    }
    function openLessonRules(place, keep) {
      openLessonPlace = place;
      const home = lessonHome(place);
      const list = lessonRules[place] || [];
      document.getElementById("rulesTitle").textContent = "Rules · " + home.label;
      document.getElementById("rulesBack").dataset.fallback = home.id;
      document.getElementById("ruleList").innerHTML = ruleHtml(list);
      if (keep) show("rules");
      else visit("rules");
    }
    function paintLessonChips() {
      document.querySelectorAll("[data-lesson-words]").forEach((btn) => {
        btn.textContent = "Words · " + lessonWordItems(btn.dataset.lessonWords).length;
      });
      document.querySelectorAll("[data-lesson-rules]").forEach((btn) => {
        btn.textContent = "Rules · " + (lessonRules[btn.dataset.lessonRules] || []).length;
      });
      paintDayLinks();
    }
    const LINK_KEY = "enquiz-day-links";
    const DAY_LINKS = {
      "lesson-07": {
        pdf: "pdf/07.09.2026.pdf",
        classwork: [],
        homework: [{ title: "Real Easy English", href: "https://www.bbc.co.uk/learningenglish/english/features/real-easy-english/251017" }]
      },
      "lesson-09": {
        pdf: "pdf/09.09.2026.pdf",
        classwork: [{ title: "make a sentence · is it true for you?", href: "https://wordwall.net/ru/resource/118706505/02-make-a-sentence-is-it-true-for-you" }],
        homework: [
          { title: "Flashcards", href: "https://wordwall.net/ru/resource/118847987/02" },
          { title: "Make collocations", href: "https://wordwall.net/ru/resource/118696199/make-collocations" },
          { title: "02", href: "https://wordwall.net/ru/resource/118848497/02" },
          { title: "LearningApps", href: "https://learningapps.org/view53599574" },
          { title: "do / does · am / is / are", href: "https://wordwall.net/ru/resource/99233427/do-does-am-is-are" },
          { title: "do / does or is / am / are", href: "https://wordwall.net/ru/resource/5578473/do-does-or-is-am-are" }
        ]
      },
      "lesson-14": {
        pdf: "pdf/14.09.2026.pdf",
        classwork: [{ title: "03", href: "https://wordwall.net/ru/resource/119086527/03" }],
        homework: []
      },
      "lesson-16": {
        pdf: "pdf/16.09.2026.pdf",
        classwork: [
          { title: "how often · student 1", href: "https://wordwall.net/ru/resource/119031666/03-how-often-are-you-do-you-student-1" },
          { title: "how often · student 2", href: "https://wordwall.net/ru/resource/119031707/03-how-often-are-you-do-you-student-2" },
          { title: "sorting out", href: "https://wordwall.net/ru/resource/119186978/04-sorting-out" }
        ],
        homework: [
          { title: "Flashcards", href: "https://wordwall.net/ru/resource/119364241?wwmethod=link&wwshareintent=student" },
          { title: "making a conversation", href: "https://wordwall.net/ru/resource/95566681/english/so-intermediate-3rd-edition-unit-1c-making-a" },
          { title: "Flashcards 2", href: "https://wordwall.net/ru/resource/119365101?wwmethod=link&wwshareintent=student" }
        ]
      },
      "lesson-21": {
        pdf: "pdf/21.09.2026.pdf",
        classwork: [{ title: "Classwork", href: "https://wordwall.net/ru/resource/119542975/05-best-weather-for" }],
        homework: [
          { title: "Weather flashcards", href: "https://wordwall.net/ru/resource/119605817" },
          { title: "Navigate 1.4", href: "https://wordwall.net/ru/resource/107569088/navigate-pre-int-14-2" },
          { title: "Likes flashcards", href: "https://wordwall.net/ru/resource/119607073" },
          { title: "true / false", href: "https://wordwall.net/ru/resource/119607967" },
          { title: "type the verb", href: "https://wordwall.net/ru/resource/119608490" }
        ]
      },
      "lesson-23": {
        pdf: "pdf/23.09.2026.pdf",
        classwork: [],
        homework: [
          { title: "Flashcards", href: "https://wordwall.net/ru/resource/119364241?wwmethod=link&wwshareintent=student" },
          { title: "making a conversation", href: "https://wordwall.net/ru/resource/95566681/english/so-intermediate-3rd-edition-unit-1c-making-a" },
          { title: "Flashcards 2", href: "https://wordwall.net/ru/resource/119365101?wwmethod=link&wwshareintent=student" }
        ]
      }
    };
    function loadDayLinks() {
      try {
        const saved = JSON.parse(localStorage.getItem(LINK_KEY) || "{}");
        return saved && typeof saved === "object" ? saved : {};
      } catch (e) { return {}; }
    }
    function saveDayLinks(map) {
      localStorage.setItem(LINK_KEY, JSON.stringify(map));
      if (typeof syncChange === "function" && !viewAccount) syncChange({ op: "put-setting", key: "dayLinks", value: map });
    }
    function dayLinkList(day, kind) {
      const base = (DAY_LINKS[day] && DAY_LINKS[day][kind]) || [];
      const extra = (loadDayLinks()[day] && loadDayLinks()[day][kind]) || [];
      return base.map((item) => Object.assign({ added: false }, item)).concat(extra.map((item, index) => Object.assign({ added: true, index: index }, item)));
    }
    function safeHttpHref(url) {
      let href = String(url || "").trim();
      if (!href) return "";
      try {
        if (!/^https?:\/\//i.test(href)) href = "https://" + href;
        const parsed = new URL(href);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        return parsed.toString();
      } catch (e) {
        return "";
      }
    }
    function linkChip(item) {
      const href = safeHttpHref(item && item.href);
      const remove = item.added ? '<button class="chip-x" type="button" data-link-remove="' + item.index + '" aria-label="Remove">×</button>' : "";
      if (!href) return '<span class="link-chip"><span class="btn chip saas-btn">' + esc(item.title) + "</span>" + remove + "</span>";
      return '<span class="link-chip"><a class="btn chip saas-btn" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(item.title) + "</a>" + remove + "</span>";
    }
    function linkAdd(kind) {
      return '<button class="add-link" type="button" data-link-add="' + kind + '" aria-label="Add a ' + kind + ' link">+</button>';
    }
    const DAY_FACE = {
      "lesson-07": { screen: "lesson07", when: "7 September" },
      "lesson-09": { screen: "lesson09", when: "9 September" },
      "lesson-14": { screen: "lesson14", when: "14 September" },
      "lesson-16": { screen: "lesson16", when: "16 September" },
      "lesson-21": { screen: "lesson", when: "21 September" },
      "lesson-23": { screen: "lesson23", when: "23 September" }
    };
    let openWork = { day: "", kind: "classwork" };
    function workHref(day, kind) {
      return "preview.html?work=" + kind + "&day=" + encodeURIComponent(day);
    }
    function paintDayLinks() {
      document.querySelectorAll("[data-day-links]").forEach((box) => {
        const day = box.dataset.dayLinks;
        const pack = DAY_LINKS[day] || { pdf: "" };
        const pdf = pack.pdf ? '<a class="btn primary" href="' + esc(pack.pdf) + '" target="_blank" rel="noopener noreferrer">Lesson PDF</a>' : "";
        const classwork = '<a class="btn chip" href="' + esc(workHref(day, "classwork")) + '" data-work-open="classwork" data-work-day="' + esc(day) + '">Classwork</a>';
        const homework = '<a class="btn primary" href="' + esc(workHref(day, "homework")) + '" data-work-open="homework" data-work-day="' + esc(day) + '">Homework</a>';
        box.innerHTML = pdf + classwork + homework;
      });
    }
    function paintDayWork() {
      const box = document.getElementById("dayworkList");
      const face = DAY_FACE[openWork.day] || { screen: "days", when: "" };
      const kind = openWork.kind === "homework" ? "homework" : "classwork";
      const title = document.getElementById("dayworkTitle");
      const sub = document.getElementById("dayworkSub");
      const back = document.getElementById("dayworkBack");
      if (title) title.textContent = kind === "homework" ? "Homework" : "Classwork";
      if (sub) sub.textContent = face.when;
      if (back) back.dataset.fallback = face.screen;
      if (!box) return;
      box.dataset.workDay = openWork.day;
      box.dataset.workKind = kind;
      box.innerHTML = dayLinkList(openWork.day, kind).map(linkChip).join("") + linkAdd(kind);
    }
    function openDayWork(day, kind, keep) {
      if (!DAY_LINKS[day]) return;
      openWork = { day: day, kind: kind === "homework" ? "homework" : "classwork" };
      paintDayWork();
      if (keep) show("daywork");
      else visit("daywork");
    }
    function workFromLocation() {
      const params = new URLSearchParams(location.search);
      const kind = params.get("work");
      const day = params.get("day");
      if ((kind !== "classwork" && kind !== "homework") || !DAY_LINKS[day]) return false;
      openDayWork(day, kind, true);
      history.replaceState(null, "", location.pathname + location.hash);
      return true;
    }
    document.addEventListener("click", (event) => {
      const work = event.target.closest("[data-work-open]");
      if (work && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        openDayWork(work.dataset.workDay, work.dataset.workOpen);
        return;
      }
      const add = event.target.closest("[data-link-add]");
      if (add) {
        const box = add.closest("[data-work-list]");
        if (!box) return;
        const open = box.querySelector(".day-link-form");
        if (open && open.dataset.kind === add.dataset.linkAdd) { open.remove(); return; }
        if (open) open.remove();
        add.insertAdjacentHTML("afterend", '<div class="day-link-form" data-kind="' + add.dataset.linkAdd + '"><input type="text" data-link-title placeholder="Weather flashcards" autocomplete="off" /><input type="url" data-link-url placeholder="https://wordwall.net/..." autocomplete="off" /><button class="btn primary" type="button" data-link-save>Add</button></div>');
        const title = box.querySelector("[data-link-title]");
        if (title) title.focus();
        return;
      }
      const save = event.target.closest("[data-link-save]");
      if (save) {
        const form = save.closest(".day-link-form");
        const box = save.closest("[data-work-list]");
        if (!form || !box) return;
        const titleEl = form.querySelector("[data-link-title]");
        const urlEl = form.querySelector("[data-link-url]");
        if (!titleEl || !urlEl) return;
        const title = String(titleEl.value || "").trim();
        let href = safeHttpHref(urlEl.value);
        if (!title || !href) return;
        const map = loadDayLinks();
        const day = box.dataset.workDay;
        if (!map[day]) map[day] = { classwork: [], homework: [] };
        const kind = box.dataset.workKind === "homework" ? "homework" : "classwork";
        if (!Array.isArray(map[day][kind])) map[day][kind] = [];
        map[day][kind].push({ title: title, href: href });
        saveDayLinks(map);
        paintDayWork();
        return;
      }
      const remove = event.target.closest("[data-link-remove]");
      if (!remove) return;
      const bag = remove.closest("[data-work-list]");
      if (!bag) return;
      const which = bag.dataset.workKind === "homework" ? "homework" : "classwork";
      const map = loadDayLinks();
      const day = bag.dataset.workDay;
      const list = map[day] && map[day][which];
      const index = Number(remove.dataset.linkRemove);
      if (!list || !list[index]) return;
      list.splice(index, 1);
      saveDayLinks(map);
      paintDayWork();
    });
    function formToken(card) {
      return (card && card.gap) || (card && card.en) || "";
    }
    function lineOf(card) {
      if (!card || !card.ex) return "";
      const token = String(formToken(card) || "").trim();
      if (!token) return "";
      const re = new RegExp("\\b" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      return re.test(card.ex) ? card.ex : "";
    }
    function spellable(card) {
      const en = String(card.en || "");
      if (/[–—/]/.test(en)) return false;
      const letters = en.replace(/[^a-zA-Z]/g, "");
      return letters.length >= 2 && letters.length <= 14 && en.length <= 18;
    }
    function meaningOf(card) {
      const text = String(card && card.gloss || "").trim();
      if (!text) return "";
      if (/^additional word from /i.test(text)) return "";
      if (/\.pdf\b/i.test(text)) return "";
      if (/^heard on /i.test(text)) return "";
      if (/^on the .+ slide/i.test(text)) return "";
      if (/^underlined in /i.test(text)) return "";
      if (/^the slide title is /i.test(text)) return "";
      return text;
    }
    function cardQuizKey(card) {
      return String((card && (card.quizKey || card.en || card.qid || card.word)) || "").toLowerCase();
    }
    function customQuizzesFor(card, type) {
      return cardQuizzesOf(cardQuizKey(card)).filter((quiz) => (quiz.type || "Flip") === type);
    }
    function customQuizPackedOptions(item) {
      const raw = Array.isArray(item && item.options) ? item.options : [];
      const options = [];
      const oldIndexes = [];
      raw.forEach((text, i) => {
        const value = String(text == null ? "" : text).trim();
        if (!value) return;
        oldIndexes.push(i);
        options.push(value);
      });
      const oldAnswer = Number(item && item.answer);
      let answer = 0;
      let answerOk = false;
      if (Number.isFinite(oldAnswer)) {
        const mapped = oldIndexes.indexOf(oldAnswer);
        if (mapped >= 0) {
          answer = mapped;
          answerOk = true;
        }
      }
      const answerSet = new Set((item && item.answers || []).map(Number).filter((n) => Number.isFinite(n)));
      const answers = oldIndexes.map((old, neu) => answerSet.has(old) ? neu : -1).filter((n) => n >= 0);
      return {
        options: options,
        answer: answer,
        answers: answers,
        answerOk: answerOk,
        right: answerOk ? (options[answer] || "") : ""
      };
    }
    function customQuizReady(quiz) {
      const item = (quiz && quiz.items && quiz.items[0]) || {};
      const type = (quiz && quiz.type) || "Flip";
      const packed = customQuizPackedOptions(item);
      const opts = packed.options;
      if (type === "Flip") return !!(item.front && item.back);
      if (type === "Reverse") return !!(item.front && opts.length >= 2 && packed.answerOk && packed.right);
      if (type === "Choice" || type === "Listen") return !!(item.prompt && opts.length >= 2 && packed.answerOk && packed.right);
      if (type === "Definition") return !!(item.prompt && opts.length >= 2 && packed.answerOk && packed.right);
      if (type === "Odd one out") return opts.length >= 2 && packed.answerOk && !!packed.right;
      if (type === "Select all") return opts.length >= 2 && packed.answers.length >= 1;
      if (type === "Type") return !!(item.prompt && item.answer);
      if (type === "Gap") return !!(item.shown && item.answer);
      if (type === "Build") return !!(String(item.parts || "").trim() && String(item.answer || "").trim());
      if (type === "Match" || type === "Memory") {
        return cardQuizPairs(quiz).some((row) => row.left && row.right);
      }
      if (type === "True / false") return !!item.prompt;
      if (type === "Tap") return !!(item.text && item.answer);
      if (type === "Spell" || type === "Letters" || type === "Hangman") {
        return !!(item.word && /[a-zA-Z]/.test(String(item.word)));
      }
      return !!(item.word);
    }
    function autoTypeOk(card, type) {
      if (type === "Match" || type === "Select all" || type === "Odd one out" || type === "Memory") return false;
      if (type === "FSRS Flashcard") return !!(card && (card.en || card.ru));
      if ((type === "Choice" || type === "Type" || type === "True / false" || type === "Reverse" || type === "Listen") && !card.ru) return false;
      if ((type === "Gap" || type === "Build" || type === "Tap") && !lineOf(card)) return false;
      if (type === "Definition" && !meaningOf(card)) return false;
      if ((type === "Spell" || type === "Letters" || type === "Hangman") && !spellable(card)) return false;
      return true;
    }
    function typesFor(card, types) {
      return types.filter((type) => customQuizzesFor(card, type).some(customQuizReady) || autoTypeOk(card, type));
    }
    function pushCustomDayItem(queue, card, quiz) {
      const type = quiz.type || "Flip";
      const custom = Object.assign({}, (quiz.items && quiz.items[0]) || {});
      if (type === "True / false") {
        const ok = String(custom.answer) !== "false";
        queue.push({ type: type, card: card, custom: custom, ru: custom.prompt || "", ok: ok, line: custom.prompt || card.en });
        return;
      }
      if (type === "Match") {
        const pairs = cardQuizPairs(quiz)
          .filter((row) => row.left && row.right)
          .map((row, i) => ({ id: String(i), en: row.left, ru: row.right }));
        if (pairs.length) {
          queue.push({ type: type, card: card, custom: custom, pairs: pairs });
        }
        return;
      }
      if (type === "Select all") {
        const packed = customQuizPackedOptions(custom);
        const answerSet = new Set(packed.answers);
        const options = packed.options.map((text, i) => ({ en: text, pos: answerSet.has(i) ? "yes" : "no" }));
        if (options.length >= 2) {
          queue.push({ type: type, card: card, custom: custom, pos: "yes", sample: options, prompt: custom.prompt || "" });
        }
        return;
      }
      if (type === "Odd one out") {
        const packed = customQuizPackedOptions(custom);
        const options = packed.options.map((text) => ({ en: text }));
        if (options.length >= 2) {
          queue.push({ type: type, card: card, custom: custom, options: options, right: packed.right || options[0].en, pos: "match" });
        }
        return;
      }
      if (type === "Memory") {
        const pairs = cardQuizPairs(quiz).filter((row) => row.left && row.right);
        if (!pairs.length) return;
        const faces = shuffle(pairs.reduce((all, row, i) => all.concat([
          { id: String(i), text: row.left },
          { id: String(i), text: row.right }
        ]), []));
        queue.push({ type: type, card: card, custom: custom, faces: faces, open: [], done: {} });
        return;
      }
      queue.push({ type: type, card: card, custom: custom, line: custom.shown || custom.text || custom.answer || lineOf(card) || card.en });
    }
    function buildDayQueue(cards, types, mix) {
      const queue = [];
      if (mix) cards = shuffle(cards);
      cards.forEach((card) => {
        let use = typesFor(card, types);
        if (mix && use.length) use = [use[Math.floor(Math.random() * use.length)]];
        use.forEach((type) => {
          customQuizzesFor(card, type).filter(customQuizReady).forEach((quiz) => pushCustomDayItem(queue, card, quiz));
          // Study quizzes / strict pools stay on custom items only.
          if (dayPoolStrict) return;
          if (!autoTypeOk(card, type)) return;
          if (type === "True / false") {
            const others = cards.filter((c) => c.ru && !choiceSame(c.ru, card.ru));
            const lie = others.length > 0 && Math.random() < 0.5;
            queue.push({ type: type, card: card, ru: lie ? others[Math.floor(Math.random() * others.length)].ru : card.ru, ok: !lie, line: lineOf(card) || card.en });
          } else queue.push({ type: type, card: card, line: lineOf(card) });
        });
      });
      if (dayPoolStrict) return queue;
      if (!mix) {
        queue.sort((a, b) => {
          const aR = a.card?.retrievability != null ? Number(a.card.retrievability) : (a.card?.fsrs?.retrievability != null ? Number(a.card.fsrs.retrievability) : null);
          const bR = b.card?.retrievability != null ? Number(b.card.retrievability) : (b.card?.fsrs?.retrievability != null ? Number(b.card.fsrs.retrievability) : null);
          if (aR != null && bR != null && aR !== bR) return aR - bR;
          if (aR != null) return -1;
          if (bR != null) return 1;
          return 0;
        });
      }
      const deckKinds = ["Match", "Select all", "Odd one out", "Memory"].filter((type) => types.indexOf(type) >= 0);
      const deckAllow = !mix ? deckKinds : (deckKinds.length ? [deckKinds[Math.floor(Math.random() * deckKinds.length)]] : []);
      if (deckAllow.indexOf("Match") >= 0) {
        const matchable = cards.filter((c) => c.en && c.ru);
        const size = 4;
        for (let i = 0; i < matchable.length; ) {
          let n = Math.min(size, matchable.length - i);
          if (matchable.length - (i + n) === 1) n += 1;
          const chunk = matchable.slice(i, i + n);
          if (chunk.length >= 2) {
            queue.push({
              type: "Match",
              pairs: chunk.map((c, j) => ({ id: String(i + j), en: c.en, ru: c.ru }))
            });
          }
          i += n;
        }
      }
      if (deckAllow.indexOf("Select all") >= 0) {
        const posed = cards.filter((c) => c.pos);
        if (posed.length >= 2) {
          const nouns = cards.filter((c) => c.pos === "noun").slice(0, 2);
          const adjs = cards.filter((c) => c.pos === "adjective").slice(0, 4);
          const sample = (adjs.length && nouns.length ? adjs.concat(nouns) : posed.slice(0, 6));
          const pos = nouns.length && adjs.length ? "noun" : sample[0].pos;
          queue.push({ type: "Select all", pos: pos, sample: sample });
        }
      }
      if (deckAllow.indexOf("Odd one out") >= 0) {
        const byPos = {};
        cards.forEach((c) => {
          if (!c.pos || !c.en) return;
          if (!byPos[c.pos]) byPos[c.pos] = [];
          byPos[c.pos].push(c);
        });
        const groups = Object.keys(byPos).filter((pos) => byPos[pos].length >= 3);
        const others = Object.keys(byPos);
        if (groups.length && others.length > 1) {
          const main = groups[0];
          const other = others.find((pos) => pos !== main);
          if (other) {
            const same = shuffle(byPos[main]).slice(0, 3);
            const odd = byPos[other][0];
            queue.push({ type: "Odd one out", options: shuffle(same.concat([odd])), right: odd.en, pos: main });
          }
        }
      }
      if (deckAllow.indexOf("Memory") >= 0) {
        const matchable = cards.filter((c) => c.en && c.ru);
        const size = memoryBlockSize(matchable.length);
        for (let i = 0; i < matchable.length; ) {
          const n = Math.min(size, matchable.length - i);
          const chunk = matchable.slice(i, i + n);
          if (chunk.length >= 2) {
            const faces = shuffle(chunk.reduce((all, c, j) => all.concat([
              { id: String(i + j), text: c.en },
              { id: String(i + j), text: c.ru }
            ]), []));
            queue.push({ type: "Memory", faces: faces, open: [], done: {} });
          }
          i += n;
        }
      }
      return queue;
    }
    function dayBack() {
      const quizIds = { daysetup: 1, dayq: 1, daychoice: 1, dayflip: 1, dayjudge: 1 };
      if (dayReturn === "errors" && mistakeQuizOn) {
        dayPoolOverride = mistakePoolSaved;
        mistakeQuizOn = false;
        dayReturn = document.getElementById("errorsBack").dataset.fallback || "setup";
        while (navStack.length && quizIds[navStack[navStack.length - 1].id]) navStack.pop();
        paintMistakes(mistakePool);
        show("errors");
        return;
      }
      if (dayReturn === "cardstat" || dayReturn === "allwords" || dayReturn === "add" || dayReturn === "verbs") {
        while (navStack.length && quizIds[navStack[navStack.length - 1].id]) navStack.pop();
        const top = navStack[navStack.length - 1];
        if (top && top.id === dayReturn) {
          navStack.pop();
          if (dayReturn === "cardstat") {
            statKind = top.statKind || statKind;
            statGroup = top.statGroup || "";
            statSong = top.statSong || "";
          } else if (dayReturn === "allwords") {
            allGroup = top.allGroup || "";
            allSong = top.allSong || "";
          } else if (dayReturn === "add") {
            addGroup = top.addGroup || "";
            addSong = top.addSong || "";
          } else {
            verbGroup = top.verbGroup || "";
            verbKey = top.verbKey || "";
          }
        }
        if (dayReturn === "cardstat") paintStat();
        else if (dayReturn === "allwords") paintAllWords();
        else if (dayReturn === "verbs") paintVerbs();
        show(dayReturn);
        return;
      }
      if (dayReturn === "phrasal" || dayReturn === "idioms") {
        const skip = { word: 1, dayflip: 1 };
        while (navStack.length) {
          const top = navStack[navStack.length - 1];
          if (top.id === dayReturn || quizIds[top.id] || skip[top.id]) navStack.pop();
          else break;
        }
        show(dayReturn);
        return;
      }
      const target = dayReturn || lessonHome(dayQuizPlace).id;
      while (navStack.length) {
        const top = navStack[navStack.length - 1];
        if (top.id === target || quizIds[top.id]) navStack.pop();
        else break;
      }
      show(target);
    }
    function allStudyCards() {
      return collectCards().filter((row) => row.kind !== "deck" && row.kind !== "essential").map(rowToCard);
    }
    function classCards() {
      const places = ["lesson-07", "lesson-09", "lesson-14", "lesson-16", "lesson-21", "lesson-23"];
      const seen = new Set();
      const cards = [];
      places.forEach((place) => {
        lessonPool(place).forEach((card) => {
          const id = String(card.en || "").toLowerCase();
          if (!id || seen.has(id)) return;
          seen.add(id);
          cards.push(card);
        });
      });
      return cards;
    }
    function deckStudyCards(place) {
      const bank = place === "idioms" ? idiomWords : phrasalWords;
      const base = bank.filter(cardVisible).map((w) => withStage({ en: w.en, ru: w.ru, pos: w.pos, uk: w.uk || "", us: w.us || "", ex: w.ex || "", gloss: w.gloss || "" }, w));
      const extra = loadAdded().filter((item) => (item.place === place || item.place==='chat-'+place) && !item.fromText).map((item) => rowToCard({ en: item.word, ru: item.ru, key: item.word }));
      return base.concat(extra);
    }
    function paintDeckCounts() {
      const phrasalN = deckStudyCards("phrasal").length;
      const idiomN = deckStudyCards("idioms").length;
      const phrasalCount = document.getElementById("phrasalCount");
      const idiomCount = document.getElementById("idiomCount");
      const phrasalSub = document.getElementById("phrasalSub");
      const idiomSub = document.getElementById("idiomSub");
      const mineN = loadAdded().filter((item) => (item.place || "mine") === "mine" && !item.fromText).length;
      const mineCount = document.getElementById("myWordCount");
      if (phrasalCount) phrasalCount.textContent = String(phrasalN);
      if (idiomCount) idiomCount.textContent = String(idiomN);
      if (mineCount) mineCount.textContent = String(mineN);
      const phrasalTitle = document.querySelector("#phrasal h1");
      const idiomTitle = document.querySelector("#idioms h1");
      if (phrasalTitle) phrasalTitle.textContent = "Phrasal verbs · " + phrasalN;
      if (idiomTitle) idiomTitle.textContent = "Idioms · " + idiomN;
      if (phrasalSub) phrasalSub.textContent = phrasalN + (phrasalN === 1 ? " card" : " cards") + ". Study uses them.";
      if (idiomSub) idiomSub.textContent = idiomN + (idiomN === 1 ? " card" : " cards") + ". Study uses them.";
      paintPlace("phrasal", "phrasalAdded");
      paintPlace("idioms", "idiomAdded");
      applyCardSearches();
    }
    function lessonIdFromSection(id) {
      if (id === "lesson") return "lesson-21";
      if (id === "lesson07") return "lesson-07";
      if (id === "lesson09") return "lesson-09";
      if (id === "lesson14") return "lesson-14";
      if (id === "lesson16") return "lesson-16";
      if (id === "lesson23") return "lesson-23";
      return "";
    }
    function verbCardsForStudy() {
      let list = (window.IRREGULAR || []).filter(cardVisible);
      if (verbGroup) list = list.filter((v) => v.level === verbGroup);
      if (verbKey) list = list.filter((v) => v.base === verbKey);
      const cards = [];
      list.forEach((v) => verbStudyCards(v).forEach((card) => cards.push(card)));
      return cards;
    }
    function cardsOnThisPage() {
      const here = (document.querySelector("section.on") || {}).id;
      const lesson = lessonIdFromSection(here);
      if (lesson) return lessonPool(lesson);
      if (here === "daysetup" || here === "dayq" || here === "exam") return quizPool();
      if (here === "phrasal") return deckStudyCards("phrasal");
      if (here === "idioms") return deckStudyCards("idioms");
      if (here === "days") return classCards();
      if (here === "allwords") return allSearchRows().map(rowToCard);
      if (here === "add") return addSearchRows().map((row) => rowToCard({ en: row.item.word, ru: row.item.ru, key: row.item.word }));
      if (here === "music") {
        const keys = new Set();
        songCatalog().forEach((song) => song.keys.forEach((key) => keys.add(key)));
        return cardsMatching(keys);
      }
      if (here === "song") {
        const sample = document.getElementById("songSample");
        const id = sample && !sample.hidden ? "sample" : (document.getElementById("songUser").dataset.songId || "");
        const song = findSong(id);
        return song ? cardsMatching(song.keys) : [];
      }
      if (here === "verbs") return verbCardsForStudy();
      if (here === "tense" || here === "marker" || here === "articles") return [];
      return allStudyCards();
    }
    function openGlobalStudy() {
      dayPoolOverride = allStudyCards();
      dayReturn = "home";
      studyScreen = "setup";
      studyTitle = "Study";
      const note = document.getElementById("studyNote");
      const n = dayPoolOverride.length;
      if (note) {
        note.classList.toggle("bad", !n);
        note.textContent = n + (n === 1 ? " card." : " cards.");
      }
      resetPoolInputs("setup", n);
      syncMemorySizeInputs(n);
      visit("setup");
    }
    function chosenTypes(exam) {
      const here = (document.querySelector("section.on") || {}).id;
      const sel = here === "daysetup" ? "#dayModes .chip.on, #dayModesMore .chip.on" : "#modes .chip.on, #modesMore .chip.on";
      let types = [...document.querySelectorAll(sel)].map((b) => {
        if (b.dataset.quizType) return b.dataset.quizType;
        return b.textContent.trim();
      }).filter((t) => t && t !== "...");
      if (exam) types = types.filter((t) => t !== "Flip");
      if (exam && !types.length) types = ["Choice", "Type", "Gap", "Build", "Match", "True / false", "Tap", "Select all", "Reverse", "Spell", "Letters", "Listen", "Definition", "Odd one out", "Memory", "Hangman"];
      return types;
    }
    function memoryBlockSize(total) {
      const inp = document.querySelector("section.on [data-memory-size]");
      let n = Math.floor(Number(inp && inp.value) || 4);
      if (!Number.isFinite(n) || n < 2) n = 2;
      if (total && n > total) n = total;
      return Math.max(1, n);
    }
    function syncMemorySizeInputs(total) {
      const max = Math.max(2, total || 2);
      document.querySelectorAll("[data-memory-size]").forEach((inp) => {
        inp.max = String(max);
        let v = Math.floor(Number(inp.value) || 4);
        if (!Number.isFinite(v) || v < 2) v = 2;
        if (v > max) v = max;
        inp.value = String(v);
      });
    }
    function examTimeUp() {
      return examMode && Date.now() - examStarted >= sessionMs;
    }
    function poolFloor(total) {
      if (total >= 20) return 20;
      return Math.max(1, total || 1);
    }
    function clampPoolNumber(raw, total) {
      const floor = poolFloor(total);
      const cap = Math.max(floor, total || floor);
      let n = Math.floor(Number(String(raw == null ? "" : raw).replace(/[^\d]/g, "")));
      if (!Number.isFinite(n) || n < floor) n = floor;
      if (n > cap) n = cap;
      return n;
    }
    function clampRoundNumber(raw, total) {
      const cap = Math.max(1, total || 1);
      let n = Math.floor(Number(String(raw == null ? "" : raw).replace(/[^\d]/g, "")));
      if (!Number.isFinite(n) || n < 1) n = 1;
      if (n > cap) n = cap;
      return n;
    }
    function mixRoot(sectionId) {
      return sectionId === "daysetup" ? "#dayMix" : "#setup";
    }
    function limitStudyCards(cards, sectionId, preview) {
      const list = Array.isArray(cards) ? cards.slice() : [];
      const total = list.length;
      if (!total) return list;
      const root = document.querySelector(mixRoot(sectionId));
      const on = root && root.querySelector("[data-day-mix].on, [data-mix].on");
      const mode = on && (on.dataset.dayMix || on.dataset.mix);
      if (mode === "mix") {
        const n = clampPoolNumber(on.querySelector("[data-mix-count]") && on.querySelector("[data-mix-count]").value, total);
        return (preview ? list : shuffle(list)).slice(0, n);
      }
      const from = clampRoundNumber(on && on.querySelector("[data-round-from]") && on.querySelector("[data-round-from]").value, total);
      const to = clampRoundNumber(on && on.querySelector("[data-round-to]") && on.querySelector("[data-round-to]").value, total);
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      return list.slice(lo - 1, hi);
    }
    function resetPoolInputs(sectionId, total) {
      const root = document.querySelector(mixRoot(sectionId));
      if (!root || !total) return;
      const floor = poolFloor(total);
      const mix = root.querySelector("[data-mix-count]");
      const from = root.querySelector("[data-round-from]");
      const to = root.querySelector("[data-round-to]");
      if (mix) mix.value = String(floor);
      if (from) from.value = "1";
      if (to) to.value = String(total);
    }
    function studyExerciseCount(cards, types) {
      return buildDayQueue(cards || [], types || [], false).length;
    }
    function studyBudgetMs(cards, types) {
      return studyExerciseCount(cards, types) * 30 * 1000;
    }
    function paintExerciseCount(n, ms) {
      const slot = document.getElementById("dayExerciseCount");
      if (!slot) return;
      if (n == null) { slot.textContent = ""; return; }
      const mins = Math.max(0, Math.round((ms || 0) / 60000));
      slot.textContent = n + (n === 1 ? " exercise" : " exercises") + " · " + mins + " min";
    }
    function formatBudget(ms) {
      const total = Math.max(0, Math.round(ms / 1000));
      const mins = Math.floor(total / 60);
      const secs = total % 60;
      if (!secs) return mins + (mins === 1 ? " minute" : " minutes");
      return mins + ":" + String(secs).padStart(2, "0");
    }
    function refreshDaySetupTime() {
      const note = document.getElementById("daySetupNote");
      if (!note || !dayCardTotal) return;
      const word = dayCardTotal === 1 ? " card" : " cards";
      note.textContent = daySetupLabel + " · " + dayCardTotal + word + ". Pick the types, then start.";
      const cards = limitStudyCards(quizPool(), "daysetup", true);
      const exercises = studyExerciseCount(cards, chosenTypes(false));
      paintExerciseCount(exercises, exercises * 30 * 1000);
    }
    function paintDaySetupNote(label, cards, emptyLine) {
      const note = document.getElementById("daySetupNote");
      dayCardTotal = cards.length;
      daySetupLabel = label;
      const empty = !cards.length;
      if (note) note.classList.toggle("bad", empty);
      if (empty) {
        if (note) note.textContent = emptyLine || (label + " · no cards yet.");
        paintExerciseCount(null);
        return;
      }
      resetPoolInputs("daysetup", cards.length);
      refreshDaySetupTime();
    }
    function setQuizNote(note, text, bad) {
      if (!note) return;
      note.classList.toggle("bad", !!bad);
      note.textContent = text;
    }
    let examPassMark = 80;
    function examPassPlace(sectionId) {
      return sectionId === "daysetup" ? "daysetup" : "setup";
    }
    function examPassKey(place) {
      return "enquiz-exam-pass-" + place;
    }
    function examPassPercent(sectionId) {
      const id = sectionId || ((document.querySelector("section.on") || {}).id);
      const box = examPassPlace(id);
      const inp = document.querySelector("#" + box + " [data-exam-pass]");
      let n = Math.floor(Number(String(inp && inp.value).replace(/[^\d]/g, "")));
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        try { n = Math.floor(Number(localStorage.getItem(examPassKey(box)))); } catch (e) { n = 80; }
      }
      if (!Number.isFinite(n) || n < 1) n = 80;
      if (n > 100) n = 100;
      return n;
    }
    function syncExamPassInputs() {
      const locked = !!(authUser && !canEditLessons());
      document.querySelectorAll("[data-exam-pass]").forEach((inp) => {
        const place = examPassPlace((inp.closest("section") || {}).id);
        let n = 80;
        try {
          const saved = localStorage.getItem(examPassKey(place));
          if (saved != null && saved !== "") n = Math.floor(Number(saved));
        } catch (e) {}
        if (!Number.isFinite(n) || n < 1) n = 80;
        if (n > 100) n = 100;
        if (document.activeElement !== inp) inp.value = String(n);
        inp.readOnly = locked;
      });
    }
    function examPassed() {
      const total = dayQueue.length;
      if (!total) return false;
      return Math.round(examCorrect / total * 100) >= examPassMark;
    }
    function examMistakesAllowed() {
      const total = dayQueue.length;
      const need = Math.ceil(total * examPassMark / 100);
      return Math.max(0, total - need);
    }
    function paintExamMistakesLeft() {
      const slot = document.getElementById("dayqMistakes");
      if (!slot) return;
      if (!examMode) { slot.hidden = true; return; }
      const left = Math.max(0, examMistakesAllowed() - examMistakes);
      slot.hidden = false;
      slot.innerHTML = '<b>' + left + '</b> ' + (left === 1 ? "mistake left" : "mistakes left");
    }
    function loadMistakeMap() {
      try {
        const data = JSON.parse(localStorage.getItem(MISTAKE_KEY) || "{}");
        return data && typeof data === "object" && !Array.isArray(data) ? data : {};
      } catch (e) { return {}; }
    }
    function saveMistakeMap(map, change) {
      localStorage.setItem(MISTAKE_KEY, JSON.stringify(map));
      if (change) syncChange(change);
    }
    function noteAnswer(item, ok) {
      if (!item) return;
      trackEvent("answer", item.type, ok ? "ok" : "miss");
      if (typeof broadcastQuizFsrs === "function") {
        broadcastQuizFsrs(item, ok);
      }
      if (!item.card || !item.card.en) return;
      const key = String(item.card.en).toLowerCase() + "|" + item.type;
      const map = loadMistakeMap();
      const row = map[key] || { en: item.card.en, type: item.type, misses: 0, streak: 0 };
      let change = null;
      if (ok) {
        row.streak += 1;
        if (row.streak >= 4) {
          delete map[key];
          change = { op: "delete-mistake", en: row.en, type: row.type };
        } else {
          map[key] = row;
          change = { op: "put-mistake", mistake: row };
        }
      } else {
        row.misses += 1;
        row.streak = 0;
        map[key] = row;
        change = { op: "put-mistake", mistake: row };
      }
      saveMistakeMap(map, change);
      if (ok && row.streak >= 4) trackEvent("learned", item.type, "ok");
    }
    let mistakeGroups = [];
    let mistakePool = [];
    let mistakeQuizOn = false;
    let mistakePoolSaved = null;
    function paintMistakes(cards) {
      mistakePool = cards || [];
      const byEn = {};
      mistakePool.forEach((card) => {
        const key = String(card.en || "").trim().toLowerCase();
        if (key && !byEn[key]) byEn[key] = card;
      });
      const map = loadMistakeMap();
      const groups = {};
      Object.keys(map).forEach((key) => {
        const row = map[key];
        const id = String(row && row.en || "").trim().toLowerCase();
        if (!row || !id || !byEn[id] || !(row.misses > 0)) return;
        if (!groups[id]) groups[id] = { card: byEn[id], rows: [] };
        groups[id].rows.push(row);
      });
      mistakeGroups = Object.keys(groups).map((key) => groups[key]);
      mistakeGroups.forEach((group) => group.rows.sort((a, b) => b.misses - a.misses || String(a.type).localeCompare(String(b.type))));
      mistakeGroups.sort((a, b) => {
        const am = a.rows.reduce((sum, row) => sum + row.misses, 0);
        const bm = b.rows.reduce((sum, row) => sum + row.misses, 0);
        return bm - am || String(a.card.en).localeCompare(String(b.card.en));
      });
      const body = document.getElementById("errorsBody");
      if (!mistakeGroups.length) {
        body.innerHTML = '<p class="hint">No mistakes for these cards yet.</p>';
        return;
      }
      body.innerHTML = '<div class="row" style="margin-bottom:8px"><button class="btn primary" type="button" data-miss-all>Repeat these</button></div>' +
        mistakeGroups.map((group, index) => {
          const card = group.card;
          const chips = group.rows.map((row) => '<span class="btn chip quiz-miss">' + esc(row.type) + " · " + row.misses + "</span>").join("");
          const fsrsHtml = typeof fsrsCardMetricsHtml === 'function' ? fsrsCardMetricsHtml(card) : (typeof window !== 'undefined' && window.fsrsCardMetricsHtml ? window.fsrsCardMetricsHtml(card) : '');
          return '<article class="miss-card"><p class="entry">' + esc(card.en) + "</p>" +
            '<p class="label">Missed on</p><div class="row">' + chips + "</div>" + ipaHtml(card) +
            (card.ru ? "<p><b>" + esc(card.ru) + "</b></p>" : "") +
            (meaningOf(card) ? '<p class="src">' + esc(meaningOf(card)) + "</p>" : "") +
            (card.ex ? '<p class="src">' + esc(card.ex) + "</p>" : "") +
            fsrsHtml +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-miss-open="' + index + '">Open card</button>' +
            '<button class="btn primary" type="button" data-miss-retry="' + index + '">Repeat</button></div></article>';
        }).join("") +
        '<p class="hint">One word is one card. Marked quizzes are the ones that were missed. Four correct answers in a row remove that quiz.</p>';
    }
    function mistakeItems(groups) {
      const queue = [];
      const sortedGroups = groups.slice().sort((a, b) => {
        const aR = a.card?.retrievability != null ? Number(a.card.retrievability) : (a.card?.fsrs?.retrievability != null ? Number(a.card.fsrs.retrievability) : null);
        const bR = b.card?.retrievability != null ? Number(b.card.retrievability) : (b.card?.fsrs?.retrievability != null ? Number(b.card.fsrs.retrievability) : null);
        if (aR != null && bR != null && aR !== bR) return aR - bR;
        if (aR != null) return -1;
        if (bR != null) return 1;
        const am = a.rows.reduce((sum, row) => sum + row.misses, 0);
        const bm = b.rows.reduce((sum, row) => sum + row.misses, 0);
        return bm - am || String(a.card.en).localeCompare(String(b.card.en));
      });
      sortedGroups.forEach((group) => {
        const types = group.rows.map((row) => row.type);
        typesFor(group.card, types).forEach((type) => {
          customQuizzesFor(group.card, type).filter(customQuizReady).forEach((quiz) => pushCustomDayItem(queue, group.card, quiz));
          if (!autoTypeOk(group.card, type)) return;
          if (type === "True / false") {
            const others = mistakePool.filter((card) => card.ru && !choiceSame(card.ru, group.card.ru));
            const lie = others.length > 0 && Math.random() < 0.5;
            queue.push({ type: type, card: group.card, ru: lie ? others[Math.floor(Math.random() * others.length)].ru : group.card.ru, ok: !lie, line: lineOf(group.card) || group.card.en });
          } else queue.push({ type: type, card: group.card, line: lineOf(group.card) });
        });
      });
      return queue;
    }
    function startMistakeQuiz(groups) {
      const queue = mistakeItems(groups);
      if (!queue.length) return;
      if (!mistakeQuizOn) {
        mistakePoolSaved = dayPoolOverride;
        mistakeQuizOn = true;
      }
      dayPoolOverride = mistakePool;
      dayReturn = "errors";
      clearDayTimer();
      clearInterval(examClock);
      examMode = false;
      examMistakes = 0;
      examLog = [];
      dayQueue = queue;
      dayAt = 0;
      document.getElementById("dayqBack").dataset.fallback = "errors";
      pushHistory();
      show("dayq");
      renderDay();
    }
    function openMistakeCard(card, backTo) {
      if (!card) return;
      const backId = backTo || "errors";
      const key = String(card.en || "").trim().toLowerCase();
      if (!key) return;
      const lesson = cardByEn(key);
      if (lesson) {
        current = lesson;
        renderWord(lesson);
        const back = document.querySelector("#word [data-nav-back]");
        if (back) back.dataset.fallback = backId;
        visit("word");
        return;
      }
      const songKey = Object.keys(songCards).find((name) => {
        const song = songCards[name];
        return String(song.en || "").toLowerCase() === key || song.origin === key;
      });
      if (songKey) {
        renderSong(songKey);
        const back = document.querySelector("#musicword [data-nav-back]");
        if (back) back.dataset.fallback = backId;
        visit("musicword");
        return;
      }
      const item = loadAdded().find((row) => String(row.word || "").toLowerCase() === key);
      if (item && item.data && item.data.usages && item.data.usages.length) {
        renderMade(item);
        const back = document.querySelector("#made [data-nav-back]");
        if (back) back.dataset.fallback = backId;
        visit("made");
        return;
      }
      current = { en: card.en, ru: card.ru || "", pos: card.pos || "", uk: card.uk || "", us: card.us || "", ex: card.ex || "", gloss: card.gloss || "", url: "https://dictionary.cambridge.org/dictionary/english/" + encodeURIComponent(card.en || "") };
      renderWord(current);
      const back = document.querySelector("#word [data-nav-back]");
      if (back) back.dataset.fallback = backId;
      visit("word");
    }
    function openMistakes(cards) {
      document.getElementById("errorsTitle").textContent = "Mistakes · " + studyTitle;
      document.getElementById("errorsBack").dataset.fallback = studyScreen;
      paintMistakes(cards);
      visit("errors");
    }
    document.getElementById("errorsBody").addEventListener("click", (e) => {
      const all = e.target.closest("[data-miss-all]");
      if (all) { startMistakeQuiz(mistakeGroups); return; }
      const open = e.target.closest("[data-miss-open]");
      if (open) {
        const group = mistakeGroups[Number(open.dataset.missOpen)];
        if (group) openMistakeCard(group.card);
        return;
      }
      const retry = e.target.closest("[data-miss-retry]");
      if (!retry) return;
      const group = mistakeGroups[Number(retry.dataset.missRetry)];
      if (group) startMistakeQuiz([group]);
    });
    function showExamResult(passed, reason) {
      if (examClosed) return;
      examClosed = true;
      clearInterval(examClock);
      clearDayTimer();
      examMode = false;
      const timer = document.getElementById("dayqTimer");
      if (timer) { timer.hidden = true; timer.classList.remove("timer-low"); }
      paintExamMistakesLeft();
      document.getElementById("examTitle").textContent = "Exam · " + studyTitle;
      document.getElementById("examBack").dataset.fallback = studyScreen;
      const used = Math.max(0, Math.round((Date.now() - examStarted) / 1000));
      const clock = Math.floor(used / 60) + ":" + String(used % 60).padStart(2, "0");
      let html = '<p class="q">' + (passed ? "Passed" : "Not passed") + "</p>";
      html += '<p class="score">' + examMistakes + (examMistakes === 1 ? " mistake" : " mistakes") + "</p>";
      html += '<p class="prompt">' + esc(studyTitle) + " · " + dayQueue.length + " questions · " + clock + ". Pass mark: " + examPassMark + "% correct. " + formatBudget(sessionMs) + " still means fail.</p>";
      if (!passed && reason === "time") html += '<p class="hint bad">Time is up.</p>';
      html += examLog.map((row) => '<div class="miss"><div><b>' + esc(row.en) + '</b><span class="label">' + esc(row.type) + '</span></div><span>mistake</span></div>').join("");
      html += '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="examMistakes">Mistakes</button><button class="btn" type="button" id="examBackBtn">Back</button></div>';
      document.getElementById("examBody").innerHTML = html;
      document.getElementById("examMistakes").onclick = () => openMistakes(quizPool());
      document.getElementById("examBackBtn").onclick = () => show(studyScreen);
      trackEvent("exam", reason || "score", passed ? "pass" : "fail");
      show("exam");
    }
    function paintQuizContrast() {
      const root = document.documentElement;
      const body = getComputedStyle(document.body);
      const solid = String(body.backgroundColor || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const fallback = solid ? [Number(solid[1]), Number(solid[2]), Number(solid[3])] : [244, 246, 251];
      const apply = (rgb) => {
        const light = relLum(rgb[0], rgb[1], rgb[2]) > 0.45;
        root.style.setProperty("--quiz-clock", light ? "#0B7A43" : "#8BEA78");
        root.style.setProperty("--quiz-miss", light ? "#D21F2A" : "#FF9A94");
        root.style.setProperty("--quiz-mute", light ? "#6E7680" : "#C5C9D1");
        root.style.setProperty("--quiz-halo", light ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.72)");
      };
      const image = String(body.backgroundImage || "").match(/url\((.+)\)/);
      if (!image) { apply(fallback); return; }
      const src = image[1].replace(/^["']|["']$/g, "");
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 24;
          canvas.height = 16;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          const sx = img.width * 0.35;
          const sy = img.height * 0.08;
          ctx.drawImage(img, sx, sy, img.width * 0.3, img.height * 0.14, 0, 0, 24, 16);
          const wash = getComputedStyle(root).getPropertyValue("--photo-wash").trim();
          if (wash) { ctx.fillStyle = wash; ctx.fillRect(0, 0, 24, 16); }
          const data = ctx.getImageData(0, 0, 24, 16).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 16) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
          apply(n ? [r / n, g / n, b / n] : fallback);
        } catch (e) { apply(fallback); }
      };
      img.onerror = () => apply(fallback);
      img.src = src;
    }
    function paintSessionClock() {
      const timer = document.getElementById("dayqTimer");
      if (!timer) return 0;
      const left = Math.max(0, sessionMs - (Date.now() - examStarted));
      timer.hidden = false;
      timer.classList.toggle("timer-low", left <= 5 * 60 * 1000);
      timer.textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
      return left;
    }
    function armExamClock() {
      clearInterval(examClock);
      paintSessionClock();
      examClock = setInterval(() => {
        const left = paintSessionClock();
        if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
        if (!left) clearInterval(examClock);
      }, 1000);
    }
    function beginQuiz(exam) {
      let here = (document.querySelector("section.on") || {}).id;
      if (here !== "setup" && here !== "daysetup") {
        openGlobalStudy();
        here = "setup";
      }
      if (here === "setup") {
        dayPoolOverride = allStudyCards();
        dayPoolStrict = false;
        studyScreen = "setup";
        studyTitle = "Study";
        dayReturn = "home";
      } else studyScreen = "daysetup";
      if (exam) examPassMark = examPassPercent(here);
      let cards = quizPool();
      if (here === "daysetup" || here === "setup") cards = limitStudyCards(cards, here);
      const note = document.getElementById(here === "daysetup" ? "daySetupNote" : "studyNote");
      const types = chosenTypes(exam);
      if (!cards.length) {
        setQuizNote(note, "No cards on this page yet.", true);
        return;
      }
      if (!types.length) {
        setQuizNote(note, "Pick at least one answer type.", true);
        return;
      }
      const queue = buildDayQueue(cards, types, false);
      if (!queue.length) {
        setQuizNote(note, "None of these types fit the cards on this page.", true);
        return;
      }
      if (note) note.classList.remove("bad");
      if (here === "daysetup") refreshDaySetupTime();
      clearDayTimer();
      clearInterval(examClock);
      examMode = !!exam;
      examClosed = false;
      examMistakes = 0;
      examCorrect = 0;
      examLog = [];
      sessionMs = here === "daysetup" ? studyBudgetMs(cards, chosenTypes(false)) : EXAM_MS;
      examStarted = Date.now();
      dayQueue = queue;
      dayAt = 0;
      pushHistory();
      show("dayq");
      paintQuizContrast();
      renderDay();
      if (here === "daysetup" || examMode) armExamClock();
    }
    function openListedStudy(cards, title, backTo, opts) {
      studyTitle = title;
      studyScreen = "daysetup";
      dayPoolOverride = cards;
      dayPoolStrict = !!(opts && opts.strict);
      dayReturn = backTo;
      document.getElementById("daySetupTitle").textContent = title;
      document.getElementById("daySetupBack").dataset.fallback = backTo;
      document.getElementById("dayqBack").dataset.fallback = backTo;
      paintDaySetupNote(title, cards, "No cards on this page yet.");
      syncMemorySizeInputs(cards.length);
      visit("daysetup");
    }
    function openPageStudy() {
      const base = statGroup || ({ learned: "Learned", weak: "Weak cards", learning: "Still learning" }[statKind] || "Cards");
      const title = statGroup === "Song lyrics" ? songStudyTitle(base, statSong) : base;
      openListedStudy(statRows().map(rowToCard), title, "cardstat");
    }
    function openAllStudy() {
      const rows = allRows();
      let shown = allGroup ? rows.filter((row) => allGroup==='Essential English'?row.where.includes(allGroup):sourceName(row) === allGroup) : rows;
      if (allGroup === "Song lyrics") shown = rowsForSong(shown, allSong, rowInKeys);
      const title = allGroup === "Song lyrics" ? songStudyTitle("Song lyrics", allSong) : (allGroup || "All words");
      openListedStudy(shown.map(rowToCard), title, "allwords");
    }
    function openAddStudy() {
      const rows = loadAdded().map((item, index) => ({ item: item, index: index })).filter((row) => ownMine(row.item));
      openListedStudy(rows.map((row) => rowToCard({ en: row.item.word, ru: row.item.ru, key: row.item.word })), "My cards", "add");
    }
    function openClassesStudy() {
      const places = ["lesson-07", "lesson-09", "lesson-14", "lesson-16", "lesson-21", "lesson-23"];
      const seen = new Set();
      const cards = [];
      places.forEach((place) => {
        lessonPool(place).forEach((card) => {
          const id = String(card.en || "").toLowerCase();
          if (!id || seen.has(id)) return;
          seen.add(id);
          cards.push(card);
        });
      });
      openListedStudy(cards, "Classes", "days");
    }
    function openMusicStudy() {
      const keys = new Set();
      songCatalog().forEach((song) => song.keys.forEach((key) => keys.add(key)));
      openListedStudy(cardsMatching(keys), "Song lyrics", "music");
    }
    function openSongStudy() {
      const sample = document.getElementById("songSample");
      const id = sample && !sample.hidden ? "sample" : (document.getElementById("songUser").dataset.songId || "");
      const song = findSong(id);
      openListedStudy(song ? cardsMatching(song.keys) : [], song ? song.number + " " + song.title : "Song", "song");
    }
    function verbTypedOk(card, value) {
      const slots = [card.base, card.past, card.pp].map((slot) => String(slot || "").toLowerCase().split("/").map((part) => part.trim()));
      const text = String(value || "").toLowerCase().replace(/[–—−]/g, "-");
      let parts = text.split("-").map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 3) parts = text.replace(/[–—−/]/g, " ").split(/\s+/).filter(Boolean);
      if (parts.length !== 3) return false;
      return parts.every((part, index) => {
        const options = slots[index] || [];
        const got = part.replace(/\s*\/\s*/g, "/").replace(/\s+/g, "");
        return options.indexOf(part.trim()) >= 0 || options.join("/") === got;
      });
    }
    function formTypedOk(card, value) {
      const text = String(value || "").trim().toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
      return (card.accept || [card.en]).some((opt) => {
        const norm = String(opt).toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");
        return text === norm;
      });
    }
    function openVerbStudy() {
      let list = (window.IRREGULAR || []).filter(cardVisible);
      let title = "Irregular verbs";
      if (verbGroup) {
        list = list.filter((v) => v.level === verbGroup);
        const level = VERB_LEVELS.find((pair) => pair[0] === verbGroup);
        title = level ? level[1] : title;
      }
      if (verbKey) {
        list = list.filter((v) => v.base === verbKey);
        if (list[0]) title = list[0].base;
      }
      const cards = [];
      list.forEach((v) => verbStudyCards(v).forEach((card) => cards.push(card)));
      openListedStudy(cards, title, "verbs");
    }
    function openDayQuiz(place) {
      dayQuizPlace = place;
      dayPoolOverride = null;
      dayPoolStrict = false;
      studyTitle = "This day's quiz";
      studyScreen = "daysetup";
      const home = lessonHome(place);
      dayReturn = home.id;
      document.getElementById("daySetupTitle").textContent = "This day's quiz";
      document.getElementById("daySetupBack").dataset.fallback = home.id;
      document.getElementById("dayqBack").dataset.fallback = home.id;
      paintDaySetupNote(home.label, lessonPool(place));
      visit("daysetup");
    }
    function dayNextButton(label) {
      return '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-day-next>' + label + "</button></div>";
    }
    function paintBuild(item) {
      const slot = Array.isArray(item.slot) ? item.slot : [];
      const bank = Array.isArray(item.bank) ? item.bank : [];
      document.getElementById("dayqView").innerHTML =
        '<p class="prompt">Build the sentence</p><div class="slot">' + (slot.map((word, i) => '<button class="token" type="button" data-slot="' + i + '">' + esc(word) + "</button>").join(" ") || "…") + "</div>" +
        '<div class="row">' + bank.map((word, i) => '<button class="token" type="button" data-bank="' + i + '">' + esc(word) + "</button>").join("") + "</div>" +
        '<div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-build-check>Check</button></div>';
    }
    let dayTimer = 0;
    function clearDayTimer() {
      clearTimeout(dayTimer);
      dayTimer = 0;
    }
    function cardQuizId(card) {
      return card ? (card.qid || card.en || "") : "";
    }
    function markDay(ok, right) {
      const fb = document.getElementById("dayFb");
      if (!fb || fb.dataset.marked === "1") return;
      fb.dataset.marked = "1";
      clearDayTimer();
      const item = dayQueue[dayAt];
      if (item) {
        const telemetry = window.QuizTelemetryTracker?.stop?.(ok);
        if (telemetry) {
          item.latencyMs = telemetry.effectiveLatencyMs;
          item.telemetry = telemetry;
        } else if (item.shownAt) {
          item.latencyMs = Math.max(1, Date.now() - item.shownAt);
        }
        item.given = right;
        noteAnswer(item, ok);
      }
      if (examMode && item && item.type !== "Flip" && ok) examCorrect += 1;
      if (examMode && item && item.type !== "Flip" && !ok) {
        examMistakes += 1;
        examLog.push({ en: (item.card && item.card.en) || item.pos || item.type, type: item.type });
        paintExamMistakesLeft();
      }
      if (ok) {
        fb.innerHTML = '<div class="feedback ok">Correct</div>';
        dayTimer = setTimeout(() => {
          if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
          if (dayAt + 1 >= dayQueue.length) {
            if (examMode) showExamResult(examPassed(), "");
            else dayBack();
            return;
          }
          dayAt += 1;
          renderDay();
        }, 650);
        return;
      }
      if (item && item.type === "Listen") revealListenCard(item);
      if (examMode && examTimeUp()) {
        fb.innerHTML = '<div class="feedback bad">Incorrect. Right answer: ' + esc(right) + "</div>";
        dayTimer = setTimeout(() => showExamResult(false, "time"), 700);
        return;
      }
      fb.innerHTML = '<div class="feedback bad">Incorrect. Right answer: ' + esc(right) + "</div>" + dayNextButton("Next");
    }
    function revealListenCard(item) {
      const slot = document.getElementById("listenCard");
      const card = item && item.card;
      const label = card && (card.en || card.speak);
      if (!slot || !label) return;
      slot.innerHTML = '<button class="listen-word" type="button" data-listen-card>' + esc(label) + "</button>";
    }
    function speakEnglish(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      window.speechSynthesis.speak(utter);
    }
    function choiceSame(a, b) {
      return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    }
    function choiceHtml(prompt, question, options, right) {
      let used = false;
      return '<p class="prompt">' + esc(prompt) + '</p>' + (question ? '<p class="q">' + esc(question) + '</p>' : '') + '<div class="opts">' +
        options.map((text) => {
          const ok = !used && choiceSame(text, right);
          if (ok) used = true;
          return '<button class="opt" type="button" data-opt="' + (ok ? "ok" : "bad") + '"><span>' + esc(text) + "</span></button>";
        }).join("") +
        '</div><div id="dayFb"></div>';
    }
    function tapSentenceHtml(text, target) {
      const parts = String(text || "").split(/(\s+)/);
      const tokens = parts.map((part) => part.trim() ? { word: part } : { space: part });
      const words = String(target || "").trim().split(/\s+/).filter(Boolean);
      const wordAt = [];
      tokens.forEach((token, i) => { if (token.word) wordAt.push(i); });
      const hit = new Set();
      const strip = (value) => String(value || "").replace(/^[^\wА-Яа-яЁё]+|[^\wА-Яа-яЁё]+$/g, "");
      if (words.length) {
        for (let start = 0; start <= wordAt.length - words.length; start++) {
          let ok = true;
          for (let k = 0; k < words.length; k++) {
            const token = tokens[wordAt[start + k]];
            if (!token || !choiceSame(strip(token.word) || token.word, words[k])) { ok = false; break; }
          }
          if (!ok) continue;
          for (let k = 0; k < words.length; k++) hit.add(wordAt[start + k]);
          break;
        }
      }
      return tokens.map((token, i) => {
        if (token.space != null) return esc(token.space);
        return '<button type="button" data-tap="' + (hit.has(i) ? "ok" : "bad") + '">' + esc(token.word) + "</button>";
      }).join("");
    }
    function scrambleLetters(word) {
      const letters = String(word).replace(/[^a-zA-Z]/g, "").split("");
      let mixed = letters.slice();
      for (let n = 0; n < 6 && mixed.join("") === letters.join(""); n++) mixed = shuffle(mixed);
      return mixed.join(" ");
    }
    function maskLetters(word) {
      let seen = 0;
      return String(word).split("").map((ch) => {
        if (!/[a-zA-Z]/.test(ch)) return ch;
        seen += 1;
        return seen % 2 === 0 ? "_" : ch;
      }).join("");
    }
    function paintMemory(item) {
      document.getElementById("dayqView").innerHTML = '<p class="prompt">Find the pairs</p><div class="pairs">' +
        item.faces.map((face, i) => {
          const up = item.done[face.id] || item.open.indexOf(i) >= 0;
          return '<button class="pair' + (item.done[face.id] ? " ok" : "") + '" type="button" data-mem="' + i + '">' + (up ? esc(face.text) : "·") + "</button>";
        }).join("") + '</div><div id="dayFb"></div>';
    }
    function paintHangman(item) {
      const shown = String(item.answer || "").split("").map((ch) => {
        if (!/[a-zA-Z]/.test(ch)) return ch;
        return item.got[ch.toLowerCase()] ? ch : "_";
      }).join(" ");
      const keys = "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => {
        const used = item.got[letter] || item.missed[letter];
        return '<button class="token" type="button" data-hang="' + letter + '"' + (used ? " disabled" : "") + ">" + letter + "</button>";
      }).join("");
      const hint = (item.custom && item.custom.hint) || (item.card && item.card.ru) || "";
      document.getElementById("dayqView").innerHTML = '<p class="prompt">Hangman' + (hint ? " · " + esc(hint) : "") + '</p><p class="q">' + esc(shown) + '</p><p class="hint">Misses ' + item.misses + " / 6</p><div class=\"row\">" + keys + '</div><div id="dayFb"></div>';
    }
    function renderDay() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
      const item = dayQueue[dayAt];
      if (!item) { if (examMode) showExamResult(examPassed(), ""); else dayBack(); return; }
      item.shownAt = Date.now();
      window.QuizTelemetryTracker?.start?.(item);
      document.getElementById("dayqTitle").textContent = (dayAt + 1) + " / " + dayQueue.length;
      paintExamMistakesLeft();
      const dayqType = document.getElementById("dayqType");
      if (dayqType) dayqType.textContent = item.type;
      document.getElementById("dayqBar").style.width = Math.round(((dayAt + 1) / dayQueue.length) * 100) + "%";
      const view = document.getElementById("dayqView");
      const card = item.card || {};
      const custom = item.custom;
      if (item.type === "Choice") {
        if (custom && Array.isArray(custom.options) && custom.options.some(Boolean)) {
          const packed = customQuizPackedOptions(custom);
          const opts = packed.options;
          const right = packed.right || opts[0] || "";
          item.right = right;
          view.innerHTML = choiceHtml(custom.prompt || "Choose", "", shuffle(opts.slice()), right);
        } else {
          const wrong = shuffle(quizPool().filter((c) => c.ru && !choiceSame(c.ru, card.ru))).slice(0, 3).map((c) => c.ru);
          const opts = shuffle(wrong.concat([card.ru].filter(Boolean)));
          let used = false;
          view.innerHTML = '<p class="prompt">' + (card.verb ? "Three forms → Russian" : "English → Russian") + '</p><div class="word-head">' + wordPic(card.base || card.en) + '<p class="q">' + esc(card.en) + '</p></div><div class="opts">' +
            opts.map((ru) => {
              const ok = !used && choiceSame(ru, card.ru);
              if (ok) used = true;
              return '<button class="opt" type="button" data-opt="' + (ok ? "ok" : "bad") + '"><span>' + esc(ru) + "</span></button>";
            }).join("") +
            '</div><div id="dayFb"></div>';
        }
      } else if (item.type === "Flip") {
        if (custom && (custom.front || custom.back)) {
          view.innerHTML = '<p class="prompt">Flip</p><div class="flip-scene" tabindex="0" role="button" aria-label="Flip card"><div class="flip-inner"><div class="flip-face flip-front"><p class="q">' + esc(custom.front || "") + '</p></div><div class="flip-face flip-back" id="dayFlipBox" data-custom-back="' + esc(custom.back || "") + '"></div></div></div><div class="bar"><button class="btn" type="button" data-flip-go>Flip</button><button class="btn primary" type="button" data-day-next>' + (dayAt + 1 < dayQueue.length ? "Next" : "Done") + "</button></div>";
        } else {
          view.innerHTML = '<p class="prompt">English → Russian</p><div class="flip-scene" tabindex="0" role="button" aria-label="Flip card"><div class="flip-inner"><div class="flip-face flip-front"><div class="word-head">' + wordPic(card.en, true) + '<div><p class="entry">' + esc(card.en) + '</p><p class="pos">' + esc(card.pos) + '</p></div></div></div><div class="flip-face flip-back" id="dayFlipBox"></div></div></div><div class="bar"><button class="btn" type="button" data-flip-go>Flip</button><button class="btn primary" type="button" data-day-next>' + (dayAt + 1 < dayQueue.length ? "Next" : "Done") + "</button></div>";
        }
      } else if (item.type === "FSRS Flashcard") {
        const frontText = custom?.front || (card.ru ? esc(card.ru) : esc(card.en || "Recall word"));
        const backExpected = custom?.back || esc(card.en || card.ru || "");
        const preview = item.previewIntervals || {
          1: typeof window.formatFsrsInterval === 'function' ? window.formatFsrsInterval(0.007) : '<10m',
          2: typeof window.formatFsrsInterval === 'function' ? window.formatFsrsInterval(1) : '1d',
          3: typeof window.formatFsrsInterval === 'function' ? window.formatFsrsInterval(3) : '3d',
          4: typeof window.formatFsrsInterval === 'function' ? window.formatFsrsInterval(7) : '7d'
        };
        const hintText = custom?.hint || meaningOf(card) || (card.pos ? esc(card.pos) : "");
        view.innerHTML = '<p class="prompt">FSRS Flashcard · Spaced repetition</p>' +
          '<div class="flip-scene fsrs-scene" id="dayFsrsScene" tabindex="0" role="button" aria-label="Flip card">' +
            '<div class="flip-inner fsrs-inner" id="dayFsrsInner">' +
              '<div class="flip-face flip-front fsrs-face fsrs-front">' +
                '<div class="word-head">' + wordPic(card.en || card.base, true) + '<div><p class="q">' + frontText + '</p>' + (hintText ? '<p class="hint">' + esc(hintText) + '</p>' : '') + '</div></div>' +
              '</div>' +
              '<div class="flip-face flip-back fsrs-face fsrs-back">' +
                '<p class="entry fsrs-expected">' + backExpected + '</p>' +
                (card.ru && card.en ? '<p><b>' + esc(card.ru) + '</b></p>' : '') +
                (meaningOf(card) ? '<p class="src">' + esc(meaningOf(card)) + '</p>' : '') +
                (card.ex ? '<p class="src"><i>' + esc(card.ex) + '</i></p>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="bar" id="dayFsrsFlipBar">' +
            '<button class="btn primary" type="button" id="dayFsrsShowBtn">Show answer</button>' +
          '</div>' +
          '<div class="bar fsrs-rating-bar" id="dayFsrsRatingBar" hidden>' +
            '<button class="btn saas-btn fsrs-btn fsrs-btn-again" type="button" data-day-fsrs-grade="1"><span class="fsrs-btn-label">Again</span><span class="fsrs-btn-badge">' + esc(String(preview[1] || '<10m')) + '</span></button>' +
            '<button class="btn saas-btn fsrs-btn fsrs-btn-hard" type="button" data-day-fsrs-grade="2"><span class="fsrs-btn-label">Hard</span><span class="fsrs-btn-badge">' + esc(String(preview[2] || '1d')) + '</span></button>' +
            '<button class="btn saas-btn fsrs-btn fsrs-btn-good" type="button" data-day-fsrs-grade="3"><span class="fsrs-btn-label">Good</span><span class="fsrs-btn-badge">' + esc(String(preview[3] || '3d')) + '</span></button>' +
            '<button class="btn saas-btn fsrs-btn fsrs-btn-easy" type="button" data-day-fsrs-grade="4"><span class="fsrs-btn-label">Easy</span><span class="fsrs-btn-badge">' + esc(String(preview[4] || '7d')) + '</span></button>' +
          '</div>' +
          '<div id="dayFb"></div>';

        const scene = document.getElementById("dayFsrsScene");
        const inner = document.getElementById("dayFsrsInner");
        const flipBar = document.getElementById("dayFsrsFlipBar");
        const ratingBar = document.getElementById("dayFsrsRatingBar");
        let flipped = false;

        const doFlip = () => {
          if (flipped) return;
          flipped = true;
          inner?.classList.add("is-flipped");
          scene?.classList.add("is-flipped");
          if (flipBar) flipBar.hidden = true;
          if (ratingBar) ratingBar.hidden = false;
        };

        document.getElementById("dayFsrsShowBtn")?.addEventListener("click", doFlip);
        scene?.addEventListener("click", doFlip);

        ratingBar?.querySelectorAll("[data-day-fsrs-grade]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const grade = Number(btn.dataset.dayFsrsGrade) || 3;
            const ok = grade >= 2;
            const telemetry = window.QuizTelemetryTracker?.stop?.(ok);
            item.grade = grade;
            if (telemetry) {
              item.latencyMs = telemetry.effectiveLatencyMs;
              item.telemetry = telemetry;
            } else if (item.shownAt) {
              item.latencyMs = Math.max(1, Date.now() - item.shownAt);
            }
            item.given = backExpected;
            noteAnswer(item, ok);
            if (examMode && ok) examCorrect += 1;
            if (examMode && !ok) {
              examMistakes += 1;
              examLog.push({ en: (card && card.en) || item.type, type: item.type });
              paintExamMistakesLeft();
            }
            if (dayAt + 1 >= dayQueue.length) {
              if (examMode) showExamResult(examPassed(), "");
              else dayBack();
            } else {
              dayAt += 1;
              renderDay();
            }
          });
        });
      } else if (item.type === "Type") {
        if (custom && (custom.prompt || custom.answer)) {
          item.right = custom.answer || "";
          view.innerHTML = '<p class="prompt">' + esc(custom.prompt || "Type the answer") + '</p><input id="dayType" type="text" placeholder="Answer" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-type-go>Check</button></div>';
        } else {
          view.innerHTML = '<p class="prompt">' + (card.verb ? "Type the three forms" : "Type it in English") + '</p><p class="q">' + esc(card.ru) + '</p><input id="dayType" type="text" placeholder="' + (card.verb ? "base – past – participle" : "Answer") + '" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-type-go>Check</button></div>';
        }
      } else if (item.type === "Gap") {
        if (custom && (custom.shown || custom.answer)) {
          item.answer = custom.answer || "";
          view.innerHTML = '<p class="prompt">Fill in the word</p><p class="q">' + esc(custom.shown || "___") + '</p>' + (custom.hint ? '<p class="hint">' + esc(custom.hint) + "</p>" : "") + '<input id="dayGap" type="text" placeholder="Missing word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-gap-go>Check</button></div>';
        } else {
          const token = formToken(card) || card.en || "";
          const blank = blankSentence(item.line, token);
          if (!blank) {
            item.answer = token;
            const shown = token
              ? String(item.line || "").replace(new RegExp(String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "____")
              : String(item.line || "___");
            view.innerHTML = '<p class="prompt">Fill in the word</p><p class="q">' + esc(shown || "___") + '</p><input id="dayGap" type="text" placeholder="Missing word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-gap-go>Check</button></div>';
          } else {
            item.answer = blank.answer;
            view.innerHTML = '<p class="prompt">Fill in the word</p><p class="q">' + esc(blank.shown) + '</p><input id="dayGap" type="text" placeholder="Missing word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-gap-go>Check</button></div>';
          }
        }
      } else if (item.type === "Build") {
        // Keep in-progress bank/slot if renderDay runs again for the same item.
        if (!Array.isArray(item.bank) || !Array.isArray(item.slot)) {
          if (custom && (custom.parts || custom.answer)) {
            const answerParts = String(custom.answer || "").trim().split(/\s+/).filter(Boolean);
            const partTokens = String(custom.parts || "").trim().split(/\s+/).filter(Boolean);
            item.order = answerParts.length ? answerParts : partTokens;
            const bankSource = (partTokens.length === item.order.length && partTokens.length) ? partTokens : item.order;
            item.bank = shuffle(bankSource.slice());
            item.slot = [];
            item.buildAnswer = String(custom.answer || item.order.join(" ")).trim();
          } else {
            item.order = String(item.line || "").split(/\s+/).filter(Boolean);
            item.bank = shuffle(item.order.slice());
            item.slot = [];
            item.buildAnswer = item.order.join(" ");
          }
        }
        paintBuild(item);
      } else if (item.type === "True / false") {
        if (custom && custom.prompt) {
          view.innerHTML = '<p class="prompt">True or false?</p><p class="q">' + esc(custom.prompt) + '</p><div class="row"><button class="btn" type="button" data-tf="true">True</button><button class="btn" type="button" data-tf="false">False</button></div><div id="dayFb"></div>';
        } else {
          view.innerHTML = '<p class="prompt">Does this translation match?</p><p class="q">' + esc(item.line) + '</p><p><b>' + esc(item.ru) + '</b></p><div class="row"><button class="btn" type="button" data-tf="true">True</button><button class="btn" type="button" data-tf="false">False</button></div><div id="dayFb"></div>';
        }
      } else if (item.type === "Tap") {
        if (custom && (custom.text || custom.answer)) {
          const target = String(custom.answer || "").trim();
          view.innerHTML = '<p class="prompt">Tap ' + esc(target || "the word") + '</p><p class="sentence">' + tapSentenceHtml(custom.text || "", target) + '</p><div id="dayFb"></div>';
        } else {
          const target = formToken(card);
          view.innerHTML = '<p class="prompt">Tap ' + esc(target) + '</p><p class="sentence">' + tapSentenceHtml(item.line, target) + '</p><div id="dayFb"></div>';
        }
      } else if (item.type === "Match") {
        const pairs = Array.isArray(item.pairs) ? item.pairs : [];
        const right = shuffle(pairs.slice());
        view.innerHTML = '<p class="prompt">Match the English with the Russian translation</p><div class="pairs">' +
          pairs.map((p) => '<button class="pair" type="button" data-side="l" data-id="' + p.id + '">' + esc(p.en) + "</button>").join("") +
          right.map((p) => '<button class="pair" type="button" data-side="r" data-id="' + p.id + '">' + esc(p.ru) + "</button>").join("") +
          '</div><div id="dayFb"></div>';
        item.left = "";
      } else if (item.type === "Select all") {
        const sample = Array.isArray(item.sample) ? item.sample : [];
        const prompt = (custom && custom.prompt) || item.prompt || ("Select every " + (item.pos || "match"));
        view.innerHTML = '<p class="prompt">' + esc(prompt) + '</p><div class="opts">' +
          sample.map((c, i) => '<button class="opt" type="button" data-sel="' + i + '"><span>' + esc(c.en) + "</span></button>").join("") +
          '</div><div class="bar"><button class="btn primary" type="button" data-sel-check>Check</button></div><div id="dayFb"></div>';
      } else if (item.type === "Reverse") {
        if (custom && (custom.front || custom.back || (custom.options || []).some(Boolean))) {
          const packed = customQuizPackedOptions(custom);
          const opts = packed.options;
          const right = packed.right || custom.back || opts[0] || "";
          item.right = right;
          const pool = opts.length >= 2 ? opts : shuffle(quizPool().filter((c) => c.en && !choiceSame(c.en, right)).slice(0, 3).map((c) => c.en).concat([right].filter(Boolean)));
          view.innerHTML = choiceHtml("Russian → English", custom.front || "", shuffle(pool.slice()), right);
        } else {
          item.right = card.en;
          const wrong = shuffle(quizPool().filter((c) => c.en && !choiceSame(c.en, card.en))).slice(0, 3).map((c) => c.en);
          view.innerHTML = choiceHtml("Russian → English", card.ru, shuffle(wrong.concat([card.en].filter(Boolean))), card.en);
        }
      } else if (item.type === "Definition") {
        if (custom && (custom.prompt || (custom.options || []).some(Boolean) || custom.answer === 0 || custom.answer)) {
          const packed = customQuizPackedOptions(custom);
          const opts = packed.options;
          const right = packed.right || custom.word || opts[0] || "";
          item.right = right;
          const pool = opts.length >= 2 ? opts : shuffle(quizPool().filter((c) => c.en && !choiceSame(c.en, right)).slice(0, 3).map((c) => c.en).concat([right].filter(Boolean)));
          view.innerHTML = choiceHtml("Which word is this?", custom.prompt || "", shuffle(pool.slice()), right);
        } else {
          item.right = card.en;
          const wrong = shuffle(quizPool().filter((c) => c.en && !choiceSame(c.en, card.en))).slice(0, 3).map((c) => c.en);
          view.innerHTML = choiceHtml("Which word is this?", meaningOf(card), shuffle(wrong.concat([card.en].filter(Boolean))), card.en);
        }
      } else if (item.type === "Listen") {
        if (custom && (custom.prompt || custom.answer === 0 || custom.answer || (custom.options || []).some(Boolean))) {
          const speak = custom.prompt || (card && (card.speak || card.en)) || "";
          const packed = customQuizPackedOptions(custom);
          let opts = packed.options.slice();
          if (!opts.length && custom.answer && typeof custom.answer === "string") {
            const wrong = shuffle(quizPool().filter((c) => c.ru && !choiceSame(c.ru, custom.answer))).slice(0, 3).map((c) => c.ru);
            opts = shuffle(wrong.concat([custom.answer]));
          }
          const right = packed.right || (typeof custom.answer === "string" ? custom.answer : "") || opts[0] || "";
          item.right = right;
          view.innerHTML = '<p class="prompt">Listen, then pick the translation</p><div class="row" style="margin-bottom:10px"><button class="btn" type="button" data-speak>Play</button><span id="listenCard"></span></div>' +
            choiceHtml("", "", shuffle(opts.slice()), right).replace('<p class="prompt"></p>', "");
          if (speak) speakEnglish(speak);
        } else {
          item.right = card.ru;
          const wrong = shuffle(quizPool().filter((c) => c.ru && !choiceSame(c.ru, card.ru))).slice(0, 3).map((c) => c.ru);
          view.innerHTML = '<p class="prompt">Listen, then pick the translation</p><div class="row" style="margin-bottom:10px"><button class="btn" type="button" data-speak>Play</button><span id="listenCard"></span></div>' +
            choiceHtml("", "", shuffle(wrong.concat([card.ru].filter(Boolean))), card.ru).replace('<p class="prompt"></p>', "");
          speakEnglish(card.speak || card.en);
        }
      } else if (item.type === "Odd one out") {
        const options = Array.isArray(item.options) ? item.options : [];
        const art = /^[aeiou]/i.test(item.pos || "") ? "an" : "a";
        view.innerHTML = choiceHtml(custom ? "Odd one out" : ("Which word is not " + art + " " + item.pos + "?"), "", options.map((c) => c && c.en != null ? c.en : c), item.right);
      } else if (item.type === "Spell") {
        const word = (custom && custom.word) || card.en;
        item.right = word;
        view.innerHTML = '<p class="prompt">Spell the word</p><p class="q">' + esc(scrambleLetters(word)) + '</p><p>' + esc((custom && custom.hint) || card.ru || "") + '</p><input id="dayType" type="text" placeholder="Word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-spell-go>Check</button></div>';
      } else if (item.type === "Letters") {
        const word = (custom && custom.word) || card.en;
        item.right = word;
        if (!item.mask) item.mask = maskLetters(word);
        view.innerHTML = '<p class="prompt">Fill the missing letters</p><p class="q">' + esc(item.mask) + '</p><p>' + esc((custom && custom.hint) || card.ru || "") + '</p><input id="dayType" type="text" placeholder="Word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-spell-go>Check</button></div>';
      } else if (item.type === "Hangman") {
        if (!item.answer) { item.answer = (custom && custom.word) || card.en; item.got = {}; item.missed = {}; item.misses = 0; }
        paintHangman(item);
      } else if (item.type === "Memory") {
        paintMemory(item);
      }
    }
    document.getElementById("dayModes").addEventListener("click", toggleTypeChip);
    document.getElementById("dayModesMore").addEventListener("click", toggleTypeChip);
    document.getElementById("dayMix").addEventListener("click", (e) => {
      if (e.target.closest("input")) return;
      const btn = e.target.closest("[data-day-mix]");
      if (!btn) return;
      document.querySelectorAll("#dayMix .chip").forEach((b) => b.classList.toggle("on", b === btn));
      refreshDaySetupTime();
    });
    document.getElementById("dayStart").onclick = () => beginQuiz(false);
    document.querySelectorAll("[data-exam-pass]").forEach((inp) => {
      inp.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (!inp.readOnly) inp.focus();
      });
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("input", () => {
        if (inp.readOnly) { syncExamPassInputs(); return; }
        const n = Math.floor(Number(String(inp.value).replace(/[^\d]/g, "")));
        if (!Number.isFinite(n) || n < 1 || n > 100) return;
        try { localStorage.setItem(examPassKey(examPassPlace((inp.closest("section") || {}).id)), String(n)); } catch (e) {}
      });
    });
    function keepPoolInput(e) {
      const inp = e.target.closest("input");
      if (!inp) return;
      e.stopPropagation();
      const chip = inp.closest("[data-mix], [data-day-mix]");
      if (!chip) return;
      const box = chip.parentElement;
      if (box) box.querySelectorAll(":scope > .chip").forEach((b) => b.classList.toggle("on", b === chip));
      if ((document.querySelector("section.on") || {}).id === "daysetup") refreshDaySetupTime();
    }
    document.querySelectorAll("[data-mix-count], [data-round-from], [data-round-to]").forEach((inp) => {
      inp.addEventListener("pointerdown", keepPoolInput);
      inp.addEventListener("mousedown", keepPoolInput);
      inp.addEventListener("click", keepPoolInput);
      inp.addEventListener("input", () => {
        if ((document.querySelector("section.on") || {}).id === "daysetup") refreshDaySetupTime();
      });
      inp.addEventListener("change", () => {
        const here = (document.querySelector("section.on") || {}).id;
        const total = here === "daysetup" ? dayCardTotal : quizPool().length;
        const round = inp.hasAttribute("data-round-from") || inp.hasAttribute("data-round-to");
        inp.value = String(round ? clampRoundNumber(inp.value, total) : clampPoolNumber(inp.value, total));
        if (here === "daysetup") refreshDaySetupTime();
      });
    });
    syncExamPassInputs();
    document.querySelectorAll('.chip-n').forEach((input) => {
      // Text inputs support selection consistently, including numeric mobile keyboards.
      if (input.type === 'number') { input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 4; }
      input.addEventListener('focus', () => { if (!input.readOnly) input.select(); });
      input.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        if (input.readOnly || input.disabled) return;
        event.preventDefault(); input.focus(); input.select();
      });
      input.addEventListener('click', (event) => {
        event.stopPropagation();
        if (input.readOnly || input.disabled) return;
        input.select();
        if (input.hasAttribute('data-memory-size')) {
          input.closest('.chip')?.classList.add('on');
          if (document.querySelector('section.on')?.id === 'daysetup') refreshDaySetupTime();
        }
      });
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); input.blur(); }
      });
      if (input.hasAttribute('data-memory-size')) input.addEventListener('change', () => {
        const maximum = Math.max(2, Number(input.max) || 2);
        input.value = String(Math.min(maximum, Math.max(2, Math.floor(Number(input.value) || 4))));
        if (document.querySelector('section.on')?.id === 'daysetup') refreshDaySetupTime();
      });
    });
    document.getElementById("dayMistakes").onclick = () => openMistakes(quizPool());
    document.getElementById("studyStart").onclick = () => beginQuiz(false);
    document.getElementById("studyMistakes").onclick = () => openMistakes(allStudyCards());
    document.getElementById("dayq").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const typeGo = e.target.closest("#dayType") && document.querySelector("#dayqView [data-type-go], #dayqView [data-spell-go]");
        const gapGo = e.target.closest("#dayGap") && document.querySelector("#dayqView [data-gap-go]");
        const btn = typeGo || gapGo;
        if (btn) {
          e.preventDefault();
          btn.click();
          return;
        }
      }
      const scene = e.target.closest(".flip-scene");
      if (!scene || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      scene.click();
    });
    document.getElementById("dayqView").addEventListener("click", (e) => {
      const item = dayQueue[dayAt];
      if (!item) return;
      if (e.target.closest("[data-day-next]")) {
        clearDayTimer();
        if (item.type === "Flip") {
          const telemetry = window.QuizTelemetryTracker?.stop?.(true);
          if (telemetry) {
            item.latencyMs = telemetry.effectiveLatencyMs;
            item.telemetry = telemetry;
          } else if (item.shownAt) {
            item.latencyMs = Math.max(1, Date.now() - item.shownAt);
          }
          if (typeof broadcastQuizFsrs === "function") {
            broadcastQuizFsrs(item, true);
          }
        }
        if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
        if (dayAt + 1 >= dayQueue.length) {
          if (examMode) showExamResult(examPassed(), "");
          else dayBack();
          return;
        }
        dayAt += 1;
        renderDay();
        return;
      }
      if (item.type === "Choice" || item.type === "Reverse" || item.type === "Definition" || item.type === "Listen" || item.type === "Odd one out") {
        if (item.type === "Listen" && e.target.closest("[data-listen-card]")) { openMistakeCard(item.card, "dayq"); return; }
        if (item.type === "Listen" && e.target.closest("[data-speak]")) {
          const speak = (item.custom && item.custom.prompt) || (item.card && (item.card.speak || item.card.en)) || "";
          if (speak) speakEnglish(speak);
          return;
        }
        const opt = e.target.closest("[data-opt]");
        const fb = document.getElementById("dayFb");
        if (!opt || !fb || fb.innerHTML) return;
        document.querySelectorAll("#dayqView .opt").forEach((o) => o.classList.remove("ok", "bad"));
        opt.classList.add(opt.dataset.opt === "ok" ? "ok" : "bad");
        if (opt.dataset.opt !== "ok") {
          window.QuizTelemetryTracker?.noteDistractor?.(opt.textContent?.trim());
          const good = document.querySelector('#dayqView [data-opt="ok"]');
          if (good) good.classList.add("ok");
        }
        markDay(opt.dataset.opt === "ok", item.right || (item.card && item.card.ru) || "");
      } else if (item.type === "Flip" && (e.target.closest("[data-flip-go]") || (e.target.closest(".flip-scene") && !e.target.closest("a, button")))) {
        const card = item.card || {};
        const custom = item.custom;
        const gloss = meaningOf(card);
        const back = (custom && custom.back) || card.ru || gloss || "";
        const scene = e.target.closest("#dayqView") && e.target.closest("#dayqView").querySelector(".flip-scene");
        const box = document.getElementById("dayFlipBox");
        if (box && !box.dataset.filled) {
          box.innerHTML = custom
            ? '<p class="q">' + esc(back) + "</p>"
            : '<p class="q">' + esc(back) + "</p>" + ipaHtml(card) + (card.ru && gloss ? "<p>" + esc(gloss) + "</p>" : "");
          box.dataset.filled = "1";
        }
        if (scene) scene.classList.toggle("is-flipped");
      } else if (item.type === "Type" && e.target.closest("[data-type-go]")) {
        const fb = document.getElementById("dayFb");
        const input = document.getElementById("dayType");
        if (!fb || fb.innerHTML || !input) return;
        if (item.custom && item.right != null) {
          markDay(input.value.trim().toLowerCase() === String(item.right).trim().toLowerCase(), item.right);
        } else if (item.card) {
          const typed = input.value;
          const ok = item.card.accept
            ? formTypedOk(item.card, typed)
            : item.card.verb
              ? verbTypedOk(item.card, typed)
              : typed.trim().toLowerCase() === String(item.card.en || "").toLowerCase();
          markDay(ok, item.card.en);
        }
      } else if ((item.type === "Spell" || item.type === "Letters") && e.target.closest("[data-spell-go]")) {
        const fb = document.getElementById("dayFb");
        const input = document.getElementById("dayType");
        if (!fb || fb.innerHTML || !input) return;
        const right = item.right || (item.card && item.card.en) || "";
        markDay(input.value.trim().toLowerCase() === String(right).toLowerCase(), right);
      } else if (item.type === "Gap" && e.target.closest("[data-gap-go]")) {
        const fb = document.getElementById("dayFb");
        const input = document.getElementById("dayGap");
        if (!fb || fb.innerHTML || !input) return;
        markDay(input.value.trim().toLowerCase() === String(item.answer || "").toLowerCase(), item.answer || "");
      } else if (item.type === "Build") {
        const bank = e.target.closest("[data-bank]");
        const slot = e.target.closest("[data-slot]");
        const fb = document.getElementById("dayFb");
        if (!fb || fb.innerHTML) return;
        if (bank) {
          const took = item.bank.splice(Number(bank.dataset.bank), 1)[0];
          if (took != null) item.slot.push(took);
          paintBuild(item);
        } else if (slot) {
          const took = item.slot.splice(Number(slot.dataset.slot), 1)[0];
          if (took != null) item.bank.push(took);
          paintBuild(item);
        }
        else if (e.target.closest("[data-build-check]")) {
          const right = item.buildAnswer || (item.order || []).join(" ");
          markDay((item.slot || []).join(" ").toLowerCase() === String(right).toLowerCase(), right);
        }
      } else if (item.type === "True / false") {
        const tf = e.target.closest("[data-tf]");
        const fb = document.getElementById("dayFb");
        if (!tf || !fb || fb.innerHTML) return;
        markDay((tf.dataset.tf === "true") === item.ok, item.ok ? "True" : "False");
      } else if (item.type === "Tap") {
        const tap = e.target.closest("[data-tap]");
        const fb = document.getElementById("dayFb");
        if (!tap || !fb || fb.innerHTML) return;
        markDay(tap.dataset.tap === "ok", (item.custom && item.custom.answer) || (item.card && item.card.en) || "");
      } else if (item.type === "Match") {
        const pair = e.target.closest(".pair");
        const fb = document.getElementById("dayFb");
        if (!pair || pair.classList.contains("ok") || !fb || fb.innerHTML) return;
        if (pair.dataset.side === "l") {
          document.querySelectorAll('#dayqView [data-side="l"]').forEach((b) => b.classList.remove("pick"));
          pair.classList.add("pick");
          item.left = pair.dataset.id;
        } else if (item.left) {
          if (pair.dataset.id === item.left) {
            const idSel = (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(item.left) : String(item.left).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            document.querySelectorAll('#dayqView [data-id="' + idSel + '"]').forEach((b) => { b.classList.add("ok"); b.classList.remove("pick"); });
            item.left = "";
            if (!document.querySelector("#dayqView .pair:not(.ok)")) markDay(true, "");
          } else {
            pair.classList.add("bad");
            item.misses = (item.misses || 0) + 1;
            setTimeout(() => pair.classList.remove("bad"), 400);
            if (examMode || item.misses >= 3) {
              item.left = "";
              document.querySelectorAll("#dayqView .pair.pick").forEach((b) => b.classList.remove("pick"));
              markDay(false, "Match the pairs");
            }
          }
        }
      } else if (item.type === "Select all") {
        const sel = e.target.closest("[data-sel]");
        const fb = document.getElementById("dayFb");
        if (sel && fb && !fb.innerHTML) sel.classList.toggle("pick");
        if (e.target.closest("[data-sel-check]") && fb && !fb.innerHTML) {
          const sample = Array.isArray(item.sample) ? item.sample : [];
          const picked = [...document.querySelectorAll("#dayqView [data-sel].pick")].map((b) => Number(b.dataset.sel));
          const right = sample.map((c, i) => c.pos === item.pos ? i : -1).filter((i) => i >= 0);
          const ok = right.length > 0 && picked.length === right.length && right.every((i) => picked.indexOf(i) >= 0);
          markDay(ok, sample.filter((c) => c.pos === item.pos).map((c) => c.en).join(", "));
        }
      } else if (item.type === "Hangman") {
        const key = e.target.closest("[data-hang]");
        const fb = document.getElementById("dayFb");
        if (!key || !fb || fb.innerHTML) return;
        const letter = key.dataset.hang;
        if (!item.got) item.got = {};
        if (!item.missed) item.missed = {};
        if (item.misses == null) item.misses = 0;
        if (item.got[letter] || item.missed[letter]) return;
        const answer = String(item.answer || "");
        if (!/[a-zA-Z]/.test(answer)) {
          paintHangman(item);
          markDay(false, answer || "—");
          return;
        }
        if (answer.toLowerCase().indexOf(letter) >= 0) item.got[letter] = true;
        else { item.missed[letter] = true; item.misses += 1; }
        paintHangman(item);
        const done = answer.split("").every((ch) => !/[a-zA-Z]/.test(ch) || item.got[ch.toLowerCase()]);
        if (done) markDay(true, item.answer);
        else if (item.misses >= 6) markDay(false, item.answer);
      } else if (item.type === "Memory") {
        const mem = e.target.closest("[data-mem]");
        const fb = document.getElementById("dayFb");
        if (!mem || item.busy || !fb || fb.innerHTML) return;
        const index = Number(mem.dataset.mem);
        const face = item.faces[index];
        if (!face || item.done[face.id] || item.open.indexOf(index) >= 0) return;
        item.open.push(index);
        paintMemory(item);
        if (item.open.length < 2) return;
        const first = item.faces[item.open[0]];
        const second = item.faces[item.open[1]];
        if (first.id === second.id) {
          item.done[first.id] = true;
          item.open = [];
          paintMemory(item);
          const ids = {};
          item.faces.forEach((row) => { ids[row.id] = true; });
          if (Object.keys(ids).every((id) => item.done[id])) markDay(true, "");
        } else {
          item.misses = (item.misses || 0) + 1;
          item.busy = true;
          setTimeout(() => {
            item.open = [];
            item.busy = false;
            if (!document.getElementById("dayFb") || document.getElementById("dayFb").innerHTML) return;
            if (examMode || item.misses >= 3) {
              markDay(false, "Find the pairs");
              return;
            }
            paintMemory(item);
          }, 700);
        }
      }
    });
    paintAdded();

    const quizScreens = { choice: 1, flip: 1, type: 1, gap: 1, build: 1, judge: 1, tap: 1, multi: 1, pairs: 1, exam: 1, errors: 1, dayq: 1, daychoice: 1, dayflip: 1, dayjudge: 1 };
    let selToken = 0;
    let selTimer = 0;
    let dismissedSelection = null;
    function selectionSnapshot() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
      const range = selection.getRangeAt(0);
      return [range.startContainer, range.startOffset, range.endContainer, range.endOffset, selection.toString()];
    }
    function sameSelection(a, b) { return !!(a && b && a.every((value, index) => value === b[index])); }
    function dismissSelectionTranslation() {
      dismissedSelection = selectionSnapshot();
      hideSelpop();
    }
    document.addEventListener('selectionchange', () => {
      if (dismissedSelection && !sameSelection(dismissedSelection, selectionSnapshot())) dismissedSelection = null;
    });
    document.addEventListener('contextmenu', event => {
      if (event.target.closest('#messages')) dismissSelectionTranslation();
    }, true);
    function hideSelpop() {
      clearTimeout(selTimer);
      const pop = document.getElementById("selpop");
      if (pop) pop.hidden = true;
      selToken += 1;
    }
    function selectionBlocked(node) {
      const section = document.querySelector("section.on");
      if (examStudentRestricted()) return true;
      if (!section || quizScreens[section.id]) return true;
      if (!node || !node.closest) return false;
      if (section.id === 'messages' && !node.closest('.chat-message-text')) return true;
      if (node.closest("#selpop, input, textarea, select")) return true;
      if (node.closest(".opts, .token, .pair")) return true;
      return false;
    }
    function placeSelpop(rect) {
      const pop = document.getElementById("selpop");
      const width = pop.offsetWidth || 320;
      const height = pop.offsetHeight || 120;
      let left = rect.left;
      let top = rect.bottom + 8;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 8);
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
    function paintSelpop(data) {
      const body = document.getElementById("selpopBody");
      const lines = (data && data.lines) || [];
      const links = (data && data.links) || {};
      const order = [["wiktionary", "Wiktionary"], ["wikdict", "WikDict"], ["openRussian", "OpenRussian"], ["freeDict", "FreeDict"]];
      let html = "";
      if (!lines.length) html += '<p class="hint">No dictionary entry for this selection.</p>';
      lines.forEach((line) => {
        html += '<span class="label">' + esc(line.source || "") + "</span>";
        html += "<p><b>" + esc(line.text || "") + "</b></p>";
        if (line.note) html += '<p class="hint">' + esc(line.note) + "</p>";
      });
      const bits = foldedLinkHtml(order.filter((pair) => links[pair[0]]).map((pair) => [pair[1], links[pair[0]]]));
      if (bits) html += '<p class="src">' + bits + "</p>";
      body.innerHTML = html;
    }
    const selpopCache = new Map();
    async function loadSelpop(word) {
      if (examStudentRestricted()) { hideSelpop(); return; }
      const token = ++selToken;
      const key = String(word || "").toLowerCase();
      const cached = selpopCache.get(key);
      document.getElementById("selpopBody").innerHTML = '<p class="hint">Looking up…</p>';
      try {
        let data = cached && Date.now() - cached.at < 300000 ? cached.data : null;
        if (!data) {
          const res = await fetch(lookupBase() + "/translate?word=" + encodeURIComponent(word));
          data = await res.json();
          if (res.ok) {
            if (selpopCache.size >= 200) selpopCache.delete(selpopCache.keys().next().value);
            selpopCache.set(key, { data, at: Date.now() });
          }
        }
        if (token !== selToken) return;
        const lines = (data && data.lines) || [];
        if (!lines.length && typeof detectSingular === "function") {
          const singular = detectSingular(word);
          if (singular && singular !== key) {
            const singKey = singular.toLowerCase();
            const singCached = selpopCache.get(singKey);
            let singData = singCached && Date.now() - singCached.at < 300000 ? singCached.data : null;
            if (!singData) {
              const singRes = await fetch(lookupBase() + "/translate?word=" + encodeURIComponent(singular));
              singData = await singRes.json();
              if (singRes.ok) selpopCache.set(singKey, { data: singData, at: Date.now() });
            }
            if (token !== selToken) return;
            if (singData && singData.lines && singData.lines.length) {
              data = Object.assign({}, singData, {
                lines: [{ source: "Grammar note", text: "Plural form of " + singular + "." }, ...singData.lines]
              });
            }
          }
        }
        paintSelpop(data);
      } catch (err) {
        if (token !== selToken) return;
        document.getElementById("selpopBody").innerHTML = '<p class="hint bad">The dictionaries did not answer.</p>';
      }
      const pop = document.getElementById("selpop");
      if (!pop.hidden && window.getSelection) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) placeSelpop(sel.getRangeAt(0).getBoundingClientRect());
      }
    }
    async function saveChatWord(word){
      if(!authUser||viewAccount)throw new Error('Sign in to add words from chat.');
      if(dictionaryOwned(word))return;
      const actor=authUser.id,res=await fetch(lookupBase()+'/lookup?word='+encodeURIComponent(word));if(!res.ok)throw new Error('The dictionary did not answer.');const data=await res.json();
      if(authUser?.id!==actor||viewAccount)throw new Error('Account changed.');
      if(/\s/.test(word)&&!/(phrasal|idiom)/i.test([data.expressionType,data.type,data.cambridge?.pos,data.pos].join(' '))){try{const analysis=await accountFetch('/api/analyze',{method:'POST',body:JSON.stringify({text:word,contentType:'TEXT'})}),key=word.toLowerCase().trim(),match=(analysis.expressions||[]).find(e=>[e.exactText,e.canonicalForm].some(v=>String(v||'').toLowerCase().trim()===key));if(match)data.expressionType=match.type;}catch{}}
      if(authUser?.id!==actor||viewAccount)throw new Error('Account changed.');
      const type=[data.expressionType,data.type,data.cambridge?.pos,data.pos].filter(Boolean).join(' ').toLowerCase(),place=type.includes('phrasal')?'chat-phrasal':type.includes('idiom')?'chat-idioms':'chat';
      await window.LearningMain.flushPersonal();if(authUser?.id!==actor||viewAccount)throw new Error('Account changed.');
      let found;try{found=await window.LearningMain.findCard(word);}catch{}
      if(authUser?.id!==actor||viewAccount)throw new Error('Account changed.');
      const result=found?await window.LearningMain.linkCard(found,place):await window.LearningMain.newCard(word,String(data.ru||data.wiktionary?.ru||data.wikdict?.ru||'').trim(),place);
      if(authUser?.id!==actor||viewAccount)return;
      const list=loadAdded();list.unshift(result.card);stageStampLinks(list,result.revision);trackEvent('card',cardArea(place),'add');
    }
    function showSelectionTranslation() {
      if (sameSelection(dismissedSelection, selectionSnapshot()) || document.querySelector('#messages.on #msgContext:not([hidden])')) { hideSelpop(); return; }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelpop(); return; }
      const text = String(sel.toString() || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 80 || !/[A-Za-zА-Яа-яЁё]/.test(text)) { hideSelpop(); return; }
      if (text.split(/\s+/).length > 8) { hideSelpop(); return; }
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (selectionBlocked(node)) { hideSelpop(); return; }
      const pop = document.getElementById("selpop");
      document.getElementById("selpopWord").textContent = text;
      const singular = typeof detectSingular === "function" ? detectSingular(text) : null;
      const variant = document.getElementById("selpopVariant");
      if (variant) {
        if (singular && singular !== text.toLowerCase()) {
          variant.textContent = "Singular: " + singular;
          variant.hidden = false;
        } else {
          variant.textContent = "";
          variant.hidden = true;
        }
      }
      const dictName = typeof findWordDictionary === "function" ? (findWordDictionary(text) || (singular ? findWordDictionary(singular) : null)) : null;
      const dictBadge = document.getElementById("selpopDictBadge");
      if (dictBadge) {
        if (dictName) {
          dictBadge.textContent = dictName;
          dictBadge.hidden = false;
        } else {
          dictBadge.hidden = true;
        }
      }
      const add = document.getElementById("selpopAdd");
      if (add) {
        add.hidden = !!dictName;
        add.disabled = false;
        add.dataset.targetWord = singular || text;
      }
      pop.hidden = false;
      placeSelpop(sel.getRangeAt(0).getBoundingClientRect());
      loadSelpop(text);
    }
    const clipFrameClose = document.getElementById("clipFrameClose");
    if (clipFrameClose) clipFrameClose.addEventListener("click", closeClipFrame);
    const clipFrame = document.getElementById("clipFrame");
    if (clipFrame) clipFrame.addEventListener("click", (e) => { if (e.target === clipFrame) closeClipFrame(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeClipFrame(); });
    document.getElementById("selpopClose").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissSelectionTranslation();
    });
    document.getElementById("selpopAdd").addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (examStudentRestricted()) return;
      const button = e.currentTarget;
      if(button.disabled)return;
      const rawWord = document.getElementById("selpopWord").textContent.trim();
      const word = (button.dataset?.targetWord || rawWord).trim();
      const inChat=document.querySelector('section.on')?.id==='messages';if(inChat){button.disabled=true;try{await saveChatWord(word);button.hidden=true;}catch(error){document.getElementById('selpopBody').textContent=error.message;}finally{button.disabled=false;}return;}
      if (!word || dictionaryOwned(word)) { button.hidden = true; return; }
      button.disabled = true;
      try {
        const actor=authUser?.id,generation=viewGen,target=viewAccount?.id||'';
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        if(!res.ok)throw new Error('The dictionary did not answer.');
        const data = await res.json();
        if(actor!==authUser?.id||generation!==viewGen||target!==(viewAccount?.id||''))throw new Error('Account changed.');
        if (!dictionaryOwned(word)) await dictionarySaveWord(word, data);
        if(document.getElementById('selpopWord').textContent.trim()===rawWord) {
          button.hidden = true;
          const dictBadge = document.getElementById("selpopDictBadge");
          if (dictBadge) {
            dictBadge.textContent = "My words";
            dictBadge.hidden = false;
          }
        }
      } catch (error) {
        document.getElementById("selpopBody").textContent=error.message;
      } finally { button.disabled = false; }
    });
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#selpop")) hideSelpop();
    });
    document.addEventListener("mouseup", (event) => {
      clearTimeout(selTimer);
      if (event.button !== 0 || event.target.closest('#selpop, #msgContext')) return;
      selTimer = setTimeout(showSelectionTranslation, 220);
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Escape") { hideSelpop(); return; }
      if (e.shiftKey || e.key === "Shift") {
        clearTimeout(selTimer);
        selTimer = setTimeout(showSelectionTranslation, 220);
      }
    });

