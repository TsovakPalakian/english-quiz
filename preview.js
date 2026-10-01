    const sections = document.querySelectorAll("section");
    const chromeButtons = document.querySelectorAll(".side nav button, .tabbar button");
    const navStack = [];
    let authUser = null;
    let viewAccount = null;
    let authSyncLock = false;
    let accountReady = false;
    let syncTimer = 0;
    let accountPullTimer = 0;
    let accountPulling = false;
    let syncSending = false;
    let syncFails = 0;
    const syncQueue = [];
    let authTimer = 0;
    let addedCache = null;
    let grammarView = "hub";
    let tenseKind = "topic";
    let compareId = "";
    let openMarkerName = "";
    let openTenseId = "ps";
    const dayScreens = {
      lesson: "days", lesson07: "days", lesson09: "days", lesson14: "days", lesson16: "days", lesson23: "days", word: "days", rules: "days", daywords: "days", daywork: "days", daysetup: "days", dayq: "days", daychoice: "days", dayflip: "days", dayjudge: "days", days: "days", pdfview: "days",
      song: "library", music: "library", lyricadd: "library", musicword: "library", texts: "library", textedit: "library", textread: "library", tenses: "library", tense: "library", marker: "library", library: "library", verbs: "library", phrasal: "library", idioms: "library", articles: "library", speakout: "library",
      choice: "setup", flip: "setup", type: "setup", gap: "setup", build: "setup", judge: "setup", tap: "setup", multi: "setup", pairs: "setup", exam: "setup", errors: "setup", setup: "setup",
      made: "add", allwords: "home", cardstat: "home",
      account: "account", profile: "account", admin: "account", themes: "account"
    };
    function show(id) {
      if (hideStudentSongs() && (id === "music" || id === "song" || id === "lyricadd" || id === "musicword")) id = "library";
      if (id === "account" && authUser) id = "profile";
      if (id === "allwords") paintAllWords();
      if (id === "add") renderAddedList();
      if (id === "verbs") paintVerbs();
      if (id === "lesson" || id === "lesson07" || id === "lesson09" || id === "lesson14" || id === "lesson16" || id === "lesson23") markClassStarted(id);
      if (id === "home") paintHomeAccount();
      if (id === "account") paintAccount();
      if (id === "profile") paintProfile();
      if (id === "admin") paintAdmin();
      if (id === "stats") paintStats();
      if (id === "demonstratives" && window.paintDemonstratives) window.paintDemonstratives();
      if (id === "texts") paintTexts();
      if (id === "library") paintTextCount();
      sections.forEach((s) => s.classList.toggle("on", s.id === id));
      const mark = dayScreens[id] || id;
      chromeButtons.forEach((b) => {
        const on = b.dataset.jump === mark;
        b.classList.toggle("on", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      window.scrollTo(0, 0);
      if (id === "song") revealLyricReturn();
      syncHomeBack();
      hideSelpop();
      rememberPlace();
    }
    function revealLyricReturn() {
      const spot = document.querySelector("#songUser [data-lyric-return]");
      if (!spot) return;
      requestAnimationFrame(() => spot.scrollIntoView({ block: "center", inline: "nearest" }));
    }
    function syncHomeBack() {
      const hidden = navStack.length === 0;
      const btn = document.getElementById("homeBack");
      const house = document.getElementById("homeHouse");
      if (btn) btn.hidden = hidden;
      if (house) house.hidden = hidden;
    }
    function mountCrumbs() {
      const house = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/><path d="M10 20v-5h4v5"/></svg>';
      const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H6"/><path d="M12 6 6 12l6 6"/></svg>';
      document.querySelectorAll("[data-nav-back]").forEach((btn) => {
        const toDays = btn.dataset.fallback === "days";
        if (toDays) {
          btn.classList.add("back-text");
          btn.setAttribute("aria-label", "Classes");
          btn.textContent = "← Classes";
        } else {
          btn.classList.add("icon");
          btn.setAttribute("aria-label", "Back");
          btn.innerHTML = arrow;
        }
        const home = document.createElement("button");
        home.className = "btn ghost icon";
        home.type = "button";
        home.dataset.jump = "home";
        home.setAttribute("aria-label", "Home");
        home.innerHTML = house;
        if (btn.id === "homeBack") {
          home.id = "homeHouse";
          home.hidden = true;
        }
        const wrap = document.createElement("span");
        wrap.className = "crumb";
        btn.before(wrap);
        wrap.append(home, btn);
      });
    }
    mountCrumbs();
    let statKind = "learned";
    let statGroup = "";
    let allGroup = "";
    let allSong = "";
    let statSong = "";
    let addGroup = "";
    let addSong = "";
    let verbGroup = "";
    let verbKey = "";
    let openLessonPlace = "";
    let speakView = "levels";
    let speakLevel = -1;
    let speakUnit = -1;
    let speakLesson = -1;
    function speakBook() {
      return window.SPEAKOUT || [];
    }
    function lessonLabel(unitIndex, lesson) {
      return (unitIndex + 1) + lesson.letter + " " + lesson.title;
    }
    function openSpeak(view, level, unit, lesson, quiet) {
      const nextLevel = Number.isFinite(level) ? level : -1;
      const nextUnit = Number.isFinite(unit) ? unit : -1;
      const nextLesson = Number.isFinite(lesson) ? lesson : -1;
      if (!quiet) {
        const here = capture();
        if (here.id === "speakout" && here.speakView === view && here.speakLevel === nextLevel && here.speakUnit === nextUnit && here.speakLesson === nextLesson) return;
        pushHistory();
      }
      speakView = view;
      speakLevel = nextLevel;
      speakUnit = nextUnit;
      speakLesson = nextLesson;
      paintSpeak();
      show("speakout");
    }
    function paintSpeak() {
      const book = speakBook();
      const title = document.getElementById("speakoutTitle");
      const sub = document.getElementById("speakoutSub");
      const list = document.getElementById("speakoutList");
      if (!title || !sub || !list) return;
      if (speakView === "levels") {
        title.textContent = "Speakout";
        sub.textContent = "Eight levels. Each level has 8 units and 32 lessons.";
        list.className = "decks";
        list.innerHTML = book.map((row, i) =>
          '<button class="file-card" type="button" data-speak-level="' + i + '"><b>' + esc(row.level) + '</b><span class="num">32</span><span class="label">8 units</span><i class="mini"><i style="width:100%"></i></i></button>'
        ).join("");
        return;
      }
      const row = book[speakLevel];
      if (!row) { openSpeak("levels", -1, -1, -1, true); return; }
      if (speakView === "level") {
        title.textContent = row.level;
        sub.textContent = "8 units. Each unit has lessons A–D.";
        list.className = "card grow";
        list.innerHTML = row.units.map((item, i) =>
          '<button class="tense" type="button" data-speak-unit="' + i + '"><b>' + (i + 1) + " " + esc(item.title) + '</b><span class="form">A–D</span></button>'
        ).join("");
        return;
      }
      const item = row.units[speakUnit];
      if (!item) { openSpeak("level", speakLevel, -1, -1, true); return; }
      if (speakView === "unit") {
        title.textContent = (speakUnit + 1) + " " + item.title;
        sub.textContent = row.level + " · 4 lessons";
        list.className = "card grow";
        list.innerHTML = item.lessons.map((lesson, i) =>
          '<button class="tense" type="button" data-speak-lesson="' + i + '"><b>' + esc(lessonLabel(speakUnit, lesson)) + '</b><span class="form">' + esc(lesson.letter) + '</span></button>'
        ).join("");
        return;
      }
      const lesson = item.lessons[speakLesson];
      if (!lesson) { openSpeak("unit", speakLevel, speakUnit, -1, true); return; }
      title.textContent = lessonLabel(speakUnit, lesson);
      sub.textContent = row.level + " · " + (speakUnit + 1) + " " + item.title;
      list.className = "card grow";
      list.innerHTML = item.lessons.map((entry, i) =>
        '<button class="tense' + (i === speakLesson ? " on" : "") + '" type="button" data-speak-lesson="' + i + '"><b>' + esc(lessonLabel(speakUnit, entry)) + '</b><span class="form">' + esc(entry.letter) + '</span></button>'
      ).join("");
    }
    function rememberPlace() {
      const place = capture();
      if (place.id === "song") {
        const sample = document.getElementById("songSample");
        place.songId = sample && !sample.hidden ? "sample" : ((document.getElementById("songUser") || {}).dataset.songId || "");
      }
      if (place.id === "musicword") place.songKey = songKey;
      if (place.id === "word" && current) place.wordEn = current.en;
      if (place.id === "made" && madeItem) place.madeWord = madeItem.word;
      if (place.id === "daywords" || place.id === "rules") place.lessonPlace = openLessonPlace;
      if (place.id === "daywork") { place.workDay = openWork.day; place.workKind = openWork.kind; }
      place.dayQuizPlace = dayQuizPlace;
      place.dayReturn = dayReturn;
      place.studyScreen = studyScreen;
      try { sessionStorage.setItem("enquiz-place", JSON.stringify(place)); } catch (e) {}
    }
    function placeKey(place) {
      return [place.id, place.view || "", place.area || "", place.kind || "", place.topic || "", place.compare || "", place.marker || "", place.statKind || "", place.statGroup || "", place.statSong || "", place.allGroup || "", place.allSong || "", place.addGroup || "", place.addSong || "", place.verbGroup || "", place.verbKey || "", place.speakView || "", place.speakLevel, place.speakUnit, place.speakLesson, place.workDay || "", place.workKind || ""].join("|");
    }
    function capture() {
      const on = document.querySelector("section.on");
      return {
        id: on ? on.id : "home",
        view: grammarView,
        area: grammarArea,
        kind: tenseKind,
        topic: openTenseId,
        compare: compareId,
        marker: openMarkerName,
        statKind: statKind,
        statGroup: statGroup,
        statSong: statSong,
        allGroup: allGroup,
        allSong: allSong,
        addGroup: addGroup,
        addSong: addSong,
        verbGroup: verbGroup,
        verbKey: verbKey,
        speakView: speakView,
        speakLevel: speakLevel,
        speakUnit: speakUnit,
        speakLesson: speakLesson
      };
    }
    function pushHistory() {
      const place = capture();
      const last = navStack[navStack.length - 1];
      if (last && placeKey(last) === placeKey(place)) return;
      navStack.push(place);
      if (navStack.length > 40) navStack.shift();
      syncHomeBack();
    }
    function visit(id) {
      if (id === (document.querySelector("section.on") || {}).id && id !== "tenses" && id !== "tense" && id !== "marker") return;
      pushHistory();
      show(id);
    }
    function restore(place) {
      if (place.id === "tenses" && place.view === "area") { openArea(place.area, true); return; }
      if (place.id === "tenses") { openHub(true); return; }
      if (place.id === "tense" && place.kind === "compare") { openCompare(place.compare, true); return; }
      if (place.id === "tense") { openTopic(place.topic, true); return; }
      if (place.id === "marker") { openMarker(place.marker, true); return; }
      if (place.id === "cardstat") {
        statKind = place.statKind || "learned";
        statGroup = place.statGroup || "";
        statSong = place.statSong || "";
        paintStat();
        show("cardstat");
        return;
      }
      if (place.id === "allwords") {
        allGroup = place.allGroup || "";
        allSong = place.allSong || "";
        paintAllWords();
        show("allwords");
        return;
      }
      if (place.id === "add") {
        addGroup = place.addGroup || "";
        addSong = place.addSong || "";
        show("add");
        return;
      }
      if (place.id === "verbs") {
        verbGroup = place.verbGroup || "";
        verbKey = place.verbKey || "";
        show("verbs");
        return;
      }
      if (place.id === "speakout") {
        openSpeak(place.speakView || "levels", place.speakLevel, place.speakUnit, place.speakLesson, true);
        return;
      }
      show(place.id);
    }
    function goBack(fallback) {
      const prev = navStack.pop();
      if (!prev) {
        const here = (document.querySelector("section.on") || {}).id;
        if (fallback && fallback !== here) show(fallback);
        else syncHomeBack();
        return;
      }
      restore(prev);
    }
    const tenseGroups = [
      { group: "Present", items: ["ps", "pc", "pp", "ppc"] },
      { group: "Past", items: ["pasts", "pastc", "pastp", "pastpc"] },
      { group: "Future", items: ["will", "going", "futc", "futp", "futpc", "pcfut", "psfut", "futother", "futpast"] },
      { group: "Habit", items: ["used", "would", "beused"] },
      { group: "Gerund and infinitive", items: ["gerund", "inf", "gerinf"] },
      { group: "Time words", items: ["markers"] }
    ];
    const tenses = {
      ps: { name: "Present Simple", form: "I work", link: ["Cambridge Grammar · Present simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-simple-i-work"], ru: "Привычки, факты, расписания и состояния. Форма: I/you/we/they work, he/she/it works. Маркеры: always, usually, every day. Глаголы состояния (know, like, want) обычно стоят в simple, не в continuous.", en: "Habits, facts, timetables and states. Form: I/you/we/they work, he/she/it works. Markers: always, usually, every day. State verbs (know, like, want) usually stay in the simple, not the continuous." },
      pc: { name: "Present Continuous", form: "I am working", link: ["Cambridge Grammar · Present continuous", "https://dictionary.cambridge.org/grammar/british-grammar/present-continuous-i-am-working"], ru: "Действие идет сейчас или вокруг сейчас. Форма: am/is/are плюс глагол с -ing. На занятии: We are having a thunderstorm.", en: "An action happening now or around now. Form: am/is/are plus verb-ing. From the lesson: We are having a thunderstorm." },
      pp: { name: "Present Perfect", form: "I have worked", link: ["Cambridge Grammar · Present perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-perfect-simple-i-have-worked"], ru: "Связь прошлого с настоящим: опыт, результат или период до сейчас. Форма: have/has плюс третья форма. How long have you worked here? С yesterday и ago это время не ставят.", en: "A link between the past and now: experience, a result, or a period up to now. Form: have/has plus the past participle. How long have you worked here? Do not use it with yesterday or ago." },
      ppc: { name: "Present Perfect Continuous", form: "I have been working", link: ["Cambridge Grammar · Present perfect continuous", "https://dictionary.cambridge.org/grammar/british-grammar/present-perfect-continuous-i-have-been-working"], ru: "Действие длилось до сейчас, часто виден сам процесс. Форма: have/has been плюс глагол с -ing. She has been waiting for an hour.", en: "An action continued up to now, often with the process in view. Form: have/has been plus verb-ing. She has been waiting for an hour." },
      pasts: { name: "Past Simple", form: "I worked", link: ["Cambridge Grammar · Past simple", "https://dictionary.cambridge.org/grammar/british-grammar/past-simple-i-worked"], ru: "Законченное действие в прошлом. Форма: worked / went. Маркеры: yesterday, ago, last week, in 2019. She finished the report yesterday.", en: "A finished action in the past. Form: worked / went. Markers: yesterday, ago, last week, in 2019. She finished the report yesterday." },
      pastc: { name: "Past Continuous", form: "I was working", link: ["Cambridge Grammar · Past continuous", "https://dictionary.cambridge.org/grammar/british-grammar/past-continuous-i-was-working"], ru: "Действие шло в момент в прошлом или было фоном для другого. Форма: was/were плюс -ing. I was reading when she called.", en: "An action in progress at a past moment, or the background for another action. Form: was/were plus -ing. I was reading when she called." },
      pastp: { name: "Past Perfect", form: "I had worked", link: ["Cambridge Grammar · Past perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/past-perfect-simple-i-had-worked"], ru: "Одно прошлое раньше другого прошлого. Форма: had плюс третья форма. She had left before I arrived.", en: "One past action before another past action. Form: had plus the past participle. She had left before I arrived." },
      pastpc: { name: "Past Perfect Continuous", form: "I had been working", link: ["Cambridge Grammar · Past perfect continuous", "https://dictionary.cambridge.org/grammar/british-grammar/past-perfect-continuous-i-had-been-working"], ru: "Действие длилось до момента в прошлом. Форма: had been плюс -ing. He had been working there for five years before he left.", en: "An action continued up to a moment in the past. Form: had been plus -ing. He had been working there for five years before he left." },
      will: { name: "will", form: "I will work", link: ["Cambridge Grammar · will and shall", "https://dictionary.cambridge.org/grammar/british-grammar/future-will-and-shall"], ru: "Решение в момент речи, обещание или предсказание без видимого сейчас признака. Форма: will плюс глагол. I think it will rain.", en: "A decision at the moment of speaking, a promise, or a prediction without present evidence. Form: will plus the verb. I think it will rain." },
      going: { name: "be going to", form: "I am going to work", link: ["Cambridge Grammar · be going to", "https://dictionary.cambridge.org/grammar/british-grammar/be-going-to"], ru: "План, который уже есть, или будущее по признаку сейчас. Форма: am/is/are going to плюс глагол. It's going to rain. В разговоре часто gonna.", en: "A plan already made, or a future you can see from evidence now. Form: am/is/are going to plus the verb. It's going to rain. In speech this is often gonna." },
      futc: { name: "Future Continuous", form: "I will be working", link: ["Cambridge Grammar · Future continuous", "https://dictionary.cambridge.org/grammar/british-grammar/future-continuous-i-will-be-working"], ru: "Действие будет идти в момент в будущем. Форма: will be плюс -ing. This time tomorrow I will be working.", en: "An action in progress at a future moment. Form: will be plus -ing. This time tomorrow I will be working." },
      futp: { name: "Future Perfect", form: "I will have worked", link: ["Cambridge Grammar · Future perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/future-perfect-simple-i-will-have-worked"], ru: "К моменту в будущем действие уже закончится. Форма: will have плюс третья форма. By Friday I will have finished the report.", en: "By a future moment the action will already be finished. Form: will have plus the past participle. By Friday I will have finished the report." },
      futpc: { name: "Future Perfect Continuous", form: "I will have been working", link: ["Cambridge Grammar · Future perfect continuous", "https://dictionary.cambridge.org/grammar/british-grammar/future-perfect-continuous-i-will-have-been-working"], ru: "К моменту в будущем действие уже будет длиться какое-то время. Форма: will have been плюс -ing. By June I will have been working here for a year.", en: "By a future moment the action will already have continued for some time. Form: will have been plus -ing. By June I will have been working here for a year." },
      pcfut: { name: "Present Continuous for the future", form: "I'm working tomorrow", link: ["Cambridge Grammar · Future", "https://dictionary.cambridge.org/grammar/british-grammar/future-"], ru: "Договоренность на будущее, время часто названо. Форма та же, что у Present Continuous: am/is/are плюс -ing. I'm meeting Anna tomorrow.", en: "An arrangement for the future, often with a time named. Same form as the Present Continuous: am/is/are plus -ing. I'm meeting Anna tomorrow." },
      psfut: { name: "Present Simple for the future", form: "The train leaves at 6", link: ["Cambridge Grammar · Future", "https://dictionary.cambridge.org/grammar/british-grammar/future-"], ru: "Расписание и программа: поезд, урок, фильм. Форма Present Simple. The train leaves at 6.", en: "A timetable or programme: a train, a class, a film. Present Simple form. The train leaves at 6." },
      futother: { name: "be about to, be due to, be to", form: "I'm about to leave", link: ["Cambridge Grammar · Future", "https://dictionary.cambridge.org/grammar/british-grammar/future-"], ru: "be about to — вот-вот. be due to — по плану должно случиться. be to — официальный план. I'm about to leave.", en: "be about to means on the point of happening. be due to means expected by a plan. be to is a formal plan. I'm about to leave." },
      futpast: { name: "Future in the past", form: "She would call", link: ["Cambridge Grammar · Future", "https://dictionary.cambridge.org/grammar/british-grammar/future-"], ru: "Будущее, как его видели из прошлого. would плюс глагол или was/were going to. She said she would call.", en: "The future as seen from the past. would plus the verb, or was/were going to. She said she would call." },
      used: { name: "used to", form: "I used to work", link: ["Cambridge Grammar · used to", "https://dictionary.cambridge.org/grammar/british-grammar/used-to"], ru: "Привычка или состояние в прошлом, сейчас этого нет. Форма: used to плюс глагол. Отрицание: didn't use to. I used to live there.", en: "A past habit or state that is not true now. Form: used to plus the verb. Negative: didn't use to. I used to live there." },
      would: { name: "would for past habits", form: "We would walk", link: ["Cambridge Grammar · used to", "https://dictionary.cambridge.org/grammar/british-grammar/used-to"], ru: "Повторяющееся действие в прошлом, как used to, но не для состояний. We would walk to school. Для прошлого состояния нужен used to, не would.", en: "A repeated past action, like used to, but not for states. We would walk to school. For a past state, use used to, not would." },
      beused: { name: "be used to / get used to", form: "I'm used to working", link: ["Cambridge Grammar · used to and be used to", "https://dictionary.cambridge.org/grammar/british-grammar/word-choice-used-to-and-be-used-to"], ru: "be used to — уже привык. get used to — привыкаю. После них существительное или герундий, не инфинитив. I'm used to getting up early.", en: "be used to means already accustomed. get used to means becoming accustomed. After them, use a noun or a gerund, not an infinitive. I'm used to getting up early." },
      gerund: { name: "Gerund", form: "working", link: ["Cambridge Grammar · -ing or to-infinitive", "https://dictionary.cambridge.org/grammar/british-grammar/hate-like-love-and-prefer"], ru: "Глагол с -ing в роли существительного. После enjoy, mind, can't stand, keen on, into. I enjoy reading. You're keen on learning English, не learn.", en: "The -ing form used as a noun. After enjoy, mind, can't stand, keen on, into. I enjoy reading. You're keen on learning English, not learn." },
      inf: { name: "Infinitive", form: "to work", link: ["Cambridge Grammar · like, love, prefer", "https://dictionary.cambridge.org/grammar/british-grammar/hate-like-love-and-prefer"], ru: "to плюс глагол. После want, decide, hope, would like. I want to leave. После will и can инфинитив без to: I will work.", en: "to plus the verb. After want, decide, hope, would like. I want to leave. After will and can, use the bare infinitive: I will work." },
      gerinf: { name: "Gerund or infinitive", form: "remember doing / to do", link: ["Cambridge Grammar · like, love, prefer", "https://dictionary.cambridge.org/grammar/british-grammar/hate-like-love-and-prefer"], ru: "После remember, stop и try смысл меняется. remember doing — помню, что делал. remember to do — не забыть сделать. stop doing — перестать. stop to do — остановиться, чтобы сделать.", en: "After remember, stop and try the meaning changes. remember doing means I remember that I did it. remember to do means don't forget to do it. stop doing means quit. stop to do means pause in order to do it." },
      markers: { name: "since, for, ago, already, yet, just", form: "since 2019", link: ["Cambridge Grammar · Present perfect simple", "https://dictionary.cambridge.org/grammar/british-grammar/present-perfect-simple-i-have-worked"], ru: "since — точка начала (since 2019), с Perfect. for — длительность (for two years), с Perfect. ago — отсчет назад от сейчас, с Past Simple. already, yet, just, still обычно с Present Perfect. yesterday и ago с Present Perfect не ставят.", en: "since is a starting point (since 2019), with a perfect tense. for is a duration (for two years), with a perfect tense. ago counts back from now, with the Past Simple. already, yet, just and still usually go with the Present Perfect. Do not use yesterday or ago with the Present Perfect." }
    };
    let grammarArea = "tenses";
    let srcSeq = 0;
    function tidy(text) {
      return String(text || "").replace(/\s+/g, " ").replace(/\s+([.,?!;:])/g, "$1").replace(/\[[^\]]+\]\s*/g, "").trim();
    }
    function foldedLinkHtml(pairs) {
      const rows = (pairs || []).filter((pair) => pair && pair[1]);
      if (!rows.length) return "";
      const link = (pair) => '<a href="' + esc(pair[1]) + '" target="_blank" rel="noreferrer">' + esc(pair[0]) + "</a>";
      if (rows.length <= 2) return rows.map(link).join(" · ");
      const id = "srcRest" + (++srcSeq);
      return rows.slice(0, 2).map(link).join(" · ") +
        ' · <button type="button" class="src-more" data-src-more="' + id + '">...</button><span id="' + id + '" hidden> · ' +
        rows.slice(2).map(link).join(" · ") + "</span>";
    }
    function sourceList(links) {
      const html = foldedLinkHtml(links);
      return html ? '<p class="src">' + html + "</p>" : "";
    }
    function topicById(id) {
      return (window.GRAMMAR && window.GRAMMAR.topics && window.GRAMMAR.topics[id]) || null;
    }
    function areaById(id) {
      return ((window.GRAMMAR && window.GRAMMAR.areas) || []).filter((area) => area.id === id)[0] || null;
    }
    function paintHub() {
      const data = window.GRAMMAR;
      const root = document.getElementById("tenseList");
      if (!data || !data.areas) {
        root.innerHTML = tenseGroups.map((g) =>
          '<p class="tense-group">' + g.group + '</p>' +
          g.items.map((id) => '<button class="tense" type="button" data-tense="' + id + '"><b>' + tenses[id].name + '</b><span class="form">' + tenses[id].form + '</span></button>').join("")
        ).join("");
        applyCardSearches();
        return;
      }
      let html = '<p class="g-map">A tense is a form. be going to, conditionals, modals, the passive and clauses are other parts of the system.</p>';
      html += '<div class="g-areas">' + data.areas.map((area) =>
        '<button class="g-area tone-' + area.tone + '" type="button" data-area="' + area.id + '"><span class="g-badge">' + esc(area.badge) + '</span><b>' + esc(area.title) + '</b><span class="label">' + esc(area.blurb) + '</span></button>'
      ).join("") + "</div>";
      const comparisons = data.comparisons || [];
      if (comparisons.length) {
        html += '<p class="g-head tone-advanced">Often confused</p>';
        html += comparisons.map((item) =>
          '<button class="g-topic tone-' + (item.tone || "advanced") + '" type="button" data-compare="' + item.id + '"><b>' + esc(item.title) + '</b><span class="form">compare</span></button>'
        ).join("");
      }
      root.innerHTML = html;
      applyCardSearches();
    }
    function openArea(id, quiet) {
      if (!quiet) {
        const here = capture();
        if (here.id === "tenses" && here.view === "area" && here.area === id) return;
        pushHistory();
      }
      const area = areaById(id);
      if (!area) { grammarView = "hub"; paintHub(); show("tenses"); return; }
      grammarView = "area";
      grammarArea = id;
      let html = '<p class="sub">' + esc(area.blurb) + "</p>";
      (area.groups || []).forEach((group) => {
        html += '<p class="g-head tone-' + (group.tone || area.tone) + '">' + esc(group.title) + "</p>";
        html += (group.items || []).map((itemId) => {
          const topic = topicById(itemId) || tenses[itemId];
          if (!topic) return "";
          const tone = topic.tone || group.tone || area.tone;
          return '<button class="g-topic tone-' + tone + '" type="button" data-topic="' + itemId + '"><b>' + esc(topic.name) + '</b><span class="form">' + esc(topic.form || "") + "</span></button>";
        }).join("");
      });
      document.getElementById("tenseList").innerHTML = html;
      applyCardSearches();
      show("tenses");
    }
    function openHub(quiet) {
      if (!quiet) {
        const here = capture();
        if (here.id === "tenses" && here.view === "hub") return;
        pushHistory();
      }
      grammarView = "hub";
      paintHub();
      show("tenses");
    }
    paintHub();
    let tenseBank = {};
    let tenseBankReady = false;
    fetch("tense-bank.json").then((res) => res.json()).then((data) => {
      tenseBank = data || {};
      tenseBankReady = true;
    });
    function markerLinks(card) {
      const bits = [];
      if (card.cambridge) bits.push('<a href="' + esc(card.cambridge) + '" target="_blank" rel="noreferrer">Cambridge</a>');
      if (card.oxford) bits.push('<a href="' + esc(card.oxford) + '" target="_blank" rel="noreferrer">Oxford</a>');
      if (card.wooordhunt) bits.push('<a href="' + esc(card.wooordhunt) + '" target="_blank" rel="noreferrer">Wooordhunt</a>');
      return bits.join(" · ");
    }
    function openMarker(en, quiet) {
      if (!quiet) {
        const here = capture();
        if (here.id === "marker" && here.marker === en) return;
        pushHistory();
      }
      openMarkerName = en;
      let card = null;
      Object.keys(tenseBank).forEach((id) => {
        (tenseBank[id].markers || []).forEach((item) => {
          if (!card && item.en === en) card = item;
        });
      });
      if (!card) card = { en: en, ru: "", uk: "", us: "" };
      document.getElementById("markerTitle").textContent = card.en;
      const ipa = ipaHtml(card);
      document.getElementById("markerView").innerHTML =
        '<div class="word-head">' + wordPic(card.en, true) + '<p class="entry">' + esc(card.en) + "</p></div>" + ipa +
        (card.ru ? "<p><b>" + esc(card.ru) + "</b></p><p class=\"hint\">Translation from Wooordhunt.</p>" : '<p class="hint bad">No dictionary entry for this phrase.</p>') +
        "<p>" + markerLinks(card) + "</p>";
      show("marker");
    }
    const tenseSites = {
      ps: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-simple-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/present-simple"]],
      pc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/present-continuous"]],
      pp: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-perfect-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/present-perfect"]],
      ppc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-perfect-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/present-perfect-continuous"]],
      pasts: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/past-simple-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/past-simple"]],
      pastc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/past-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/past-continuous"]],
      pastp: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/past-perfect-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/past-perfect"]],
      pastpc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/past-perfect-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      will: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/simple-future-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/will-and-shall"]],
      going: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/will-or-be-going-to.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/going-to"]],
      futc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/future-progressive-tense-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/future-continuous"]],
      futp: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/future-perfect-tense-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/future-perfect"]],
      futpc: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/future-perfect-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      pcfut: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-continuous-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/present-continuous"]],
      psfut: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/present-simple-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/a1-a2-grammar/present-simple"]],
      futother: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/simple-future-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      futpast: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/simple-future-use.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      used: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/used-to.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/used-to"]],
      would: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/would.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/used-to"]],
      beused: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/used-to.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar/b1-b2-grammar/used-to"]],
      gerund: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/gerunds-and-infinitives.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      inf: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/gerunds-and-infinitives-verbs-1.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      gerinf: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/gerunds-and-infinitives-verbs-2.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]],
      markers: [["Perfect English Grammar", "https://www.perfect-english-grammar.com/prepositions-of-time.html"], ["British Council", "https://learnenglish.britishcouncil.org/grammar"]]
    };
    function topicLinks(id, topic) {
      const rows = [];
      const push = (pair) => {
        if (pair && pair[1] && !rows.some((have) => have[1] === pair[1])) rows.push(pair);
      };
      ((topic && topic.links) || []).forEach(push);
      const legacy = tenses[id];
      if (legacy && legacy.link) push(legacy.link);
      push(["Longman", "https://www.ldoceonline.com/"]);
      (tenseSites[id] || []).forEach(push);
      return rows;
    }
    function tenseSiteLinks(id) {
      return sourceList(topicLinks(id, topicById(id)));
    }
    function tenseExtras(id) {
      const bank = tenseBank[id];
      if (!bank) return '<p class="hint">Examples are still loading.</p>';
      const markers = bank.markers || [];
      let html = '<p class="label" style="margin-top:16px">Time markers</p>';
      if (!markers.length) html += '<p class="hint">This form has no time markers.</p>';
      else {
        html += '<div class="words">' + markers.map((card) =>
          '<button class="wcard" type="button" data-marker="' + esc(card.en) + '"><div class="en">' + esc(card.en) + '</div>' + ipaHtml(card) + '<div class="label">' + esc(card.ru || "No dictionary entry") + "</div></button>"
        ).join("") + "</div>";
      }
      const examples = bank.examples || [];
      html += '<p class="label" style="margin-top:16px">Examples · ' + examples.length + "</p>";
      html += '<p class="sub">From Cambridge, Oxford, Longman, Perfect English Grammar and Wooordhunt.</p>';
      html += tenseSiteLinks(id);
      if (examples.length < 30) html += '<p class="hint bad">Real examples found: ' + examples.length + ". These sources do not have 30 sentences for this form.</p>";
      html += examples.map((item) => '<p class="ex-line">' + esc(item.en) + ' <span class="label">' + esc(item.source) + "</span></p>").join("");
      return html;
    }
    function exampleBlock(items) {
      const rows = (items || []).filter((item) => item && item.en);
      if (!rows.length) return '<p class="hint bad">No sourced example is stored for this topic.</p>';
      return rows.slice(0, 5).map((item) => {
        const links = [];
        if (item.url) links.push([item.source || "Source", item.url]);
        (item.more || []).forEach((pair) => links.push(pair));
        return '<div class="ex-line"><b>' + esc(tidy(item.en)) + "</b>" +
          (item.ru ? '<br><span class="hint">Translation: ' + esc(item.ru) + "</span>" : '<br><span class="hint">This source line has no Russian gloss.</span>') +
          (links.length ? sourceList(links) : '<p class="src">' + esc(item.source || "") + "</p>") + "</div>";
      }).join("");
    }
    function openTopic(id, quiet) {
      const topic = topicById(id);
      const legacy = tenses[id];
      if (!topic && !legacy) return;
      if (!quiet) {
        const here = capture();
        if (here.id === "tense" && here.kind === "topic" && here.topic === id) return;
        pushHistory();
      }
      tenseKind = "topic";
      openTenseId = id;
      const name = (topic && topic.name) || legacy.name;
      const form = (topic && topic.form) || legacy.form;
      const tone = (topic && topic.tone) || "present";
      document.getElementById("tenseTitle").textContent = name;
      document.getElementById("tense").dataset.lang = "en";
      document.getElementById("tense").className = "on tone-" + tone;
      document.querySelectorAll("#tenseLang .chip").forEach((b) => b.classList.toggle("on", b.dataset.tenseLang === "en"));
      let html = '<p class="g-badge">' + esc((topic && topic.kind) || "Grammar") + "</p>";
      html += '<p class="q">' + esc(form) + "</p>";
      if (topic && topic.formula) html += '<p class="formula">' + esc(topic.formula) + "</p>";
      if (topic && topic.affirmative) {
        html += '<table class="g-form"><tr><th>Affirmative</th><th>Negative</th><th>Question</th></tr><tr><td>' +
          esc(topic.affirmative) + "</td><td>" + esc(topic.negative || "") + "</td><td>" + esc(topic.question || "") + "</td></tr></table>";
      }
      if (topic && topic.note) html += '<p class="sub">' + esc(topic.note) + "</p>";
      const usage = (topic && topic.usage) || null;
      if (usage) html += '<p class="ru">' + esc(usage.ru) + '</p><p class="en">' + esc(usage.en) + "</p>";
      else if (legacy) html += '<p class="ru">' + legacy.ru + '</p><p class="en">' + legacy.en + "</p>";
      if (topic && topic.cases && topic.cases.length) {
        html += '<p class="label">Main uses</p><ul>' + topic.cases.map((line) => "<li>" + esc(line) + "</li>").join("") + "</ul>";
      }
      if (topic && topic.signals && topic.signals.length) {
        html += '<p class="label">Signal words</p><div class="chips">' + topic.signals.map((word) => "<span>" + esc(word) + "</span>").join("") + "</div>";
      }
      html += '<p class="label">Examples</p>' + exampleBlock(topic && topic.examples);
      if (topic && topic.mistakes) {
        html += '<details class="g-fold"><summary>Common mistakes</summary><p class="ru">' + esc(topic.mistakes.ru || "") + '</p><p class="en">' + esc(topic.mistakes.en || "") + "</p></details>";
      }
      if (topic && topic.differs) {
        html += '<details class="g-fold" open><summary>How it differs</summary><p class="ru">' + esc(topic.differs.ru || "") + '</p><p class="en">' + esc(topic.differs.en || "") + "</p></details>";
      }
      if (topic && topic.related && topic.related.length) {
        html += '<p class="label">Related</p>' + topic.related.map((rel) => {
          const other = topicById(rel) || tenses[rel];
          return other ? '<button class="g-topic tone-' + ((topicById(rel) || {}).tone || tone) + '" type="button" data-topic="' + rel + '"><b>' + esc(other.name) + '</b><span class="form">open</span></button>' : "";
        }).join("");
      }
      html += '<p class="label">Sources</p>' + sourceList(topicLinks(id, topic));
      html += '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-jump="gap">This form\'s quiz</button><button class="btn" type="button" data-jump="errors">Mistakes</button></div>';
      if (legacy || tenseBank[id]) html += tenseExtras(id);
      document.getElementById("tenseView").innerHTML = html;
      dressWords(document.getElementById("tenseView"));
      show("tense");
      if (!quiet && !tenseBankReady && (legacy || tenseBank[id])) {
        fetch("tense-bank.json").then((res) => res.json()).then((data) => {
          tenseBank = data || {};
          tenseBankReady = true;
          if (openTenseId === id && (document.querySelector("section.on") || {}).id === "tense") openTopic(id, true);
        });
      }
    }
    function openTense(id) { openTopic(id); }
    function openCompare(id, quiet) {
      const item = ((window.GRAMMAR && window.GRAMMAR.comparisons) || []).filter((row) => row.id === id)[0];
      if (!item) return;
      if (!quiet) {
        const here = capture();
        if (here.id === "tense" && here.kind === "compare" && here.compare === id) return;
        pushHistory();
      }
      tenseKind = "compare";
      compareId = id;
      document.getElementById("tenseTitle").textContent = item.title;
      document.getElementById("tense").className = "on tone-" + (item.tone || "advanced");
      let html = '<p class="g-badge">Comparison</p><p class="q">' + esc(item.title) + "</p>";
      if (item.note) html += '<p class="ru">' + esc(item.note.ru || "") + '</p><p class="en">' + esc(item.note.en || "") + "</p>";
      html += '<table class="g-table"><tr>' + (item.heads || []).map((head) => "<th>" + esc(head) + "</th>").join("") + "</tr>";
      (item.rows || []).forEach((row) => {
        html += "<tr>" + row.map((cell) => "<td>" + esc(cell) + "</td>").join("") + "</tr>";
      });
      html += "</table>";
      html += '<p class="label">Sources</p>' + sourceList(item.links || []);
      document.getElementById("tenseView").innerHTML = html;
      show("tense");
    }
    document.getElementById("tenseLang").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tense-lang]");
      if (!btn) return;
      document.getElementById("tense").dataset.lang = btn.dataset.tenseLang;
      document.querySelectorAll("#tenseLang .chip").forEach((b) => b.classList.toggle("on", b === btn));
    });
    let pdfJsLoad = null;
    function loadPdfJs() {
      if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
      if (pdfJsLoad) return pdfJsLoad;
      pdfJsLoad = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.onload = () => {
          if (!window.pdfjsLib) { reject(new Error("pdf.js")); return; }
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error("pdf.js"));
        document.head.appendChild(script);
      });
      return pdfJsLoad;
    }
    async function openPdf(href) {
      const name = decodeURIComponent(String(href || "").split("/").pop() || "PDF");
      document.getElementById("pdfTitle").textContent = name;
      const status = document.getElementById("pdfStatus");
      const box = document.getElementById("pdfPages");
      status.textContent = "Opening…";
      box.innerHTML = "";
      visit("pdfview");
      try {
        const lib = await loadPdfJs();
        const doc = await lib.getDocument(href).promise;
        status.textContent = doc.numPages === 1 ? "1 page" : doc.numPages + " pages";
        const width = Math.max(280, box.clientWidth || 640);
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: width / base.width });
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-page";
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          box.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
        }
      } catch (err) {
        status.textContent = "";
        box.innerHTML = '<p class="hint bad">This PDF did not open.</p>';
      }
    }
    const THEMES = [
      ["almond", "Almond blossom - Van Gogh", "#D4EEEA", "#F6FBFA", "#1C7874"],
      ["light", "Light", "#F4F6FB", "#FFFFFF", "#3D3BF3"],
      ["grey", "Grey", "#CFD0D3", "#E3E4E6", "#3D3BF3"],
      ["mint", "Mint", "#E1F2EA", "#F5FBF8", "#0B7A5B"],
      ["lavender", "Lavender", "#E9E4F8", "#F7F5FD", "#6B3FD8"],
      ["sand", "Sand", "#EDE3D3", "#FAF5EC", "#B5531B"],
      ["dusk", "Dusk", "#C5D2EE", "#DFE8F8", "#2F3DDB"],
      ["graphite", "Graphite", "#161618", "#222226", "#4F7DF0"],
      ["ocean", "Ocean", "#08202B", "#0F3040", "#0E8FA3"],
      ["plum", "Plum", "#1B1026", "#281A38", "#A24FE8"],
      ["forest", "Forest", "#0E1F17", "#162E22", "#1F9E5C"],
      ["dark", "Dark", "#0D1020", "#171B33", "#7C7BFF"],
      ["rose", "Rose", "#F8E4EA", "#FFF6F8", "#B4235A"],
      ["sky", "Sky", "#E3F1FB", "#F5FBFF", "#0B649C"],
      ["peach", "Peach", "#F8E6D4", "#FFF6EE", "#A3410E"],
      ["lemon", "Lemon", "#F7F0C8", "#FFFBEA", "#7A5A00"],
      ["lilac", "Lilac", "#F3E6F6", "#FBF6FD", "#7A2490"],
      ["sage", "Sage", "#E4EDE4", "#F4F8F4", "#246B38"],
      ["cream", "Cream", "#F6F1E6", "#FFFCF6", "#7A4E22"],
      ["blush", "Blush", "#FDE8E4", "#FFF7F5", "#C13A28"],
      ["ice", "Ice", "#E7F4F4", "#F6FCFC", "#0C6E6C"],
      ["clay", "Clay", "#F3E4D8", "#FBF4EE", "#8C4520"],
      ["wine", "Wine", "#2A1018", "#3A1824", "#E25A86"],
      ["cocoa", "Cocoa", "#241810", "#342418", "#E08A45"],
      ["moss", "Moss", "#1A2214", "#26301C", "#8FBF4A"],
      ["slate", "Slate", "#1A222C", "#24303C", "#5BA4E0"],
      ["ember", "Ember", "#2A140C", "#3A1E12", "#FF8A3D"],
      ["lagoon", "Lagoon", "#0C2428", "#143438", "#3DCFC4"],
      ["cherry", "Cherry", "#2A0E14", "#3C1620", "#FF5A7A"],
      ["indigo", "Indigo", "#12142E", "#1C2044", "#8B8CFF"],
      ["berry", "Berry", "#241028", "#341838", "#E07BFF"],
      ["fog", "Fog", "#1C1E22", "#2A2E34", "#7AA2FF"],
      ["apricot", "Apricot", "#FDE3D0", "#FFF6EE", "#C44E18"],
      ["honey", "Honey", "#F8EEC0", "#FFF9E6", "#A07800"],
      ["powder", "Powder", "#E4EEF8", "#F7FBFF", "#2A6CB0"],
      ["pearl", "Pearl", "#F2F0EC", "#FBFBF9", "#4E6274"],
      ["pistachio", "Pistachio", "#E6F2D8", "#F6FBF0", "#4A8A28"],
      ["flamingo", "Flamingo", "#FDE0EA", "#FFF5F8", "#C42868"],
      ["butter", "Butter", "#FFF6C8", "#FFFCEE", "#8A7800"],
      ["cloud", "Cloud", "#E8EEF2", "#F7FAFC", "#3A6A88"],
      ["linen", "Linen", "#F4EFE6", "#FBF8F3", "#8A6840"],
      ["aqua", "Aqua", "#DFF4F2", "#F4FCFB", "#0E7A74"],
      ["mauve", "Mauve", "#F0E4EE", "#FBF6FA", "#8A3A78"],
      ["dune", "Dune", "#EFE4D2", "#F8F3E8", "#A06A30"],
      ["matcha", "Matcha", "#E2EEDC", "#F4F8F0", "#3A7A32"],
      ["blossom", "Blossom", "#F8E0E8", "#FFF4F7", "#C43A6A"],
      ["frost", "Frost", "#E6F2F8", "#F5FBFE", "#1A6A90"],
      ["midnight", "Midnight", "#0C1024", "#161B36", "#6C8CFF"],
      ["ruby", "Ruby", "#2A1014", "#3C181E", "#FF4D6A"],
      ["pine", "Pine", "#0E1C16", "#163026", "#3DDC7A"],
      ["storm", "Storm", "#1A1E28", "#262C3A", "#7AA0FF"],
      ["copper", "Copper", "#2A1810", "#3C2418", "#FF9A4A"],
      ["orchid", "Orchid", "#221428", "#321C3C", "#D070F0"],
      ["abyss", "Abyss", "#07141C", "#0E2430", "#2EC8E0"],
      ["espresso", "Espresso", "#1C1410", "#2C2018", "#E0A060"],
      ["glow", "Glow", "#101820", "#182830", "#5EE0C0"],
      ["fjord", "Fjord", "#101820", "#182838", "#4AA8E0"],
      ["violet", "Violet", "#181228", "#261C3C", "#A078FF"],
      ["ash", "Ash", "#222426", "#303436", "#7EB0FF"],
      ["sunset", "Sunset", "#2A1218", "#3C1C24", "#FF7A4A"],
      ["jade", "Jade", "#0C1C18", "#143028", "#2ED6A0"],
      ["ink", "Ink", "#101014", "#1C1C24", "#9AA0FF"],
      ["tokyo", "Tokyo", "#140818", "#26102C", "#FF2E97"],
      ["oasis", "Oasis", "#06241C", "#0E3A2C", "#F0C14A"],
      ["peacock", "Peacock", "#041820", "#0C3040", "#14F1C8"],
      ["volcano", "Volcano", "#1A0A08", "#2E1210", "#FF3D00"],
      ["coral", "Coral", "#FDE6DC", "#FFF7F3", "#D24528"],
      ["tangerine", "Tangerine", "#FFE6C4", "#FFF8EE", "#D85A00"],
      ["mango", "Mango", "#FFE9B4", "#FFF9E6", "#C26E00"],
      ["kiwi", "Kiwi", "#E6F6C8", "#F7FCEC", "#4E8C12"],
      ["olive", "Olive", "#E6E4C4", "#F6F5EA", "#5E6010"],
      ["seafoam", "Seafoam", "#D6F6EC", "#F2FCF8", "#0C8870"],
      ["tide", "Tide", "#D2F0F2", "#F0FBFC", "#087888"],
      ["denim", "Denim", "#DCE4F6", "#F4F7FD", "#1A4E9C"],
      ["periwinkle", "Periwinkle", "#E2E4FA", "#F5F6FD", "#4548C4"],
      ["wisteria", "Wisteria", "#EBE2F8", "#F7F4FD", "#7440C0"],
      ["heather", "Heather", "#EDE2EA", "#F8F3F6", "#864878"],
      ["mulberry", "Mulberry", "#F6DEEA", "#FCF3F7", "#A02470"],
      ["strawberry", "Strawberry", "#FDE0E6", "#FFF4F6", "#D01848"],
      ["terracotta", "Terracotta", "#F6DCC6", "#FBF3EA", "#B45420"],
      ["saffron", "Saffron", "#FFE6A4", "#FFF6D8", "#C07000"],
      ["basil", "Basil", "#D8EED0", "#F2F9EE", "#247830"],
      ["fern", "Fern", "#D4E6D0", "#F0F6EC", "#2A6824"],
      ["eucalyptus", "Eucalyptus", "#D4EEE2", "#F1FAF5", "#147856"],
      ["glacier", "Glacier", "#D8EEF8", "#F2FAFD", "#086890"],
      ["parchment", "Parchment", "#F4EAD6", "#FBF6EC", "#8A6028"],
      ["wheat", "Wheat", "#F6E8C4", "#FBF6E6", "#A07420"],
      ["cinnamon", "Cinnamon", "#F6D8C0", "#FBF3E8", "#A04818"],
      ["bubblegum", "Bubblegum", "#F8D6EC", "#FFF3FA", "#D02088"],
      ["iris", "Iris", "#E4DEF8", "#F5F3FD", "#5438B4"],
      ["navy", "Navy", "#081428", "#102040", "#4A90FF"],
      ["sapphire", "Sapphire", "#0A1830", "#122848", "#3A78FF"],
      ["nebula", "Nebula", "#120820", "#221030", "#C058FF"],
      ["aurora", "Aurora", "#081820", "#102C28", "#3EE8A8"],
      ["matrix", "Matrix", "#081208", "#102010", "#3CFF62"],
      ["emerald", "Emerald", "#071610", "#0E281C", "#22E090"],
      ["onyx", "Onyx", "#0C0C10", "#18181E", "#C8CCD8"],
      ["garnet", "Garnet", "#260810", "#3A1018", "#FF4468"],
      ["crimson", "Crimson", "#22080C", "#360E14", "#FF3858"],
      ["amethyst", "Amethyst", "#160818", "#261028", "#C868F0"],
      ["citrine", "Citrine", "#1C1608", "#2C240C", "#F0C040"],
      ["canyon", "Canyon", "#221008", "#36180C", "#FF7840"],
      ["arctic", "Arctic", "#0A141C", "#12202C", "#8AD0F0"],
      ["caribbean", "Caribbean", "#062018", "#0C3028", "#22E0A8"],
      ["sakura", "Sakura", "#1E0814", "#321020", "#FF78A8"],
      ["eclipse", "Eclipse", "#0C0C12", "#181820", "#E8C848"],
      ["papaya", "Papaya", "#FFE0C4", "#FFF4EA", "#E06018"],
      ["lime", "Lime", "#E8F6C0", "#F7FCE8", "#568C08"],
      ["wasabi", "Wasabi", "#E6F0BC", "#F6FAE6", "#6A8A08"],
      ["clover", "Clover", "#D4EED8", "#F2FAF4", "#1E8840"],
      ["snow", "Snow", "#F2F6F8", "#FFFFFF", "#2A5878"],
      ["oat", "Oat", "#F2EBE0", "#FBF7F2", "#8A6840"],
      ["tomato", "Tomato", "#FCD6CE", "#FFF3F0", "#D02414"],
      ["cranberry", "Cranberry", "#F6D0D8", "#FBF0F2", "#A01240"],
      ["raspberry", "Raspberry", "#F8D4E2", "#FFF1F6", "#C01458"],
      ["hyacinth", "Hyacinth", "#DCE2F8", "#F3F5FD", "#2844C0"],
      ["porcelain", "Porcelain", "#F0F3F6", "#FAFBFC", "#3A5874"],
      ["sunflower", "Sunflower", "#FFE8A0", "#FFF7DC", "#D09000"],
      ["turquoise", "Turquoise", "#D0F2EE", "#F0FBFA", "#0A8078"],
      ["opal", "Opal", "#E4F2F0", "#F6FBFA", "#3A7880"],
      ["vanilla", "Vanilla", "#F8F2E0", "#FFFCF4", "#A08040"],
      ["caramel", "Caramel", "#F4DCC0", "#FBF4E8", "#A06020"],
      ["rust", "Rust", "#F6D4C4", "#FBF1E8", "#B03814"],
      ["khaki", "Khaki", "#E8E4C4", "#F6F4E6", "#6E6818"],
      ["obsidian", "Obsidian", "#0A0A10", "#16161E", "#8088FF"],
      ["galaxy", "Galaxy", "#0C0818", "#181028", "#A070FF"],
      ["borealis", "Borealis", "#081418", "#102028", "#40F0C0"],
      ["cyber", "Cyber", "#081018", "#102028", "#00E0C0"],
      ["magma", "Magma", "#200808", "#341010", "#FF5020"],
      ["burgundy", "Burgundy", "#240810", "#381018", "#E05070"],
      ["amber", "Amber", "#201408", "#321C08", "#FFB020"],
      ["sahara", "Sahara", "#1C1408", "#2C200C", "#E8B050"],
      ["amazon", "Amazon", "#0C180C", "#142414", "#50D060"],
      ["maldives", "Maldives", "#062018", "#0C302C", "#20E0C8"],
      ["kyoto", "Kyoto", "#1C1014", "#2C1820", "#E07080"],
      ["iceberg", "Iceberg", "#0C181C", "#142428", "#70D0E8"],
      ["melon", "Melon", "#F0F6D0", "#F8FCE8", "#6A8C10"],
      ["guava", "Guava", "#F8D4C8", "#FFF4EE", "#D04848"],
      ["fig", "Fig", "#E0D0DC", "#F7F0F5", "#7A3068"],
      ["grape", "Grape", "#E0D0F4", "#F6F0FA", "#6A28A8"],
      ["apple", "Apple", "#C8EEC0", "#F2FAEA", "#2A8A28"],
      ["bamboo", "Bamboo", "#E4ECC0", "#F6FAE4", "#708010"],
      ["meadow", "Meadow", "#C8E8D0", "#F0FAF2", "#188848"],
      ["chalk", "Chalk", "#F6F8F4", "#FFFFFF", "#4A6860"],
      ["marble", "Marble", "#E8ECF0", "#F8F9FA", "#4A6070"],
      ["mist", "Mist", "#E0E6E2", "#F4F8F6", "#4A6868"],
      ["champagne", "Champagne", "#F8E8C0", "#FFF9EA", "#A88830"],
      ["maple", "Maple", "#F0C898", "#FBF2E4", "#B06018"],
      ["toffee", "Toffee", "#E8C8A4", "#FBF3E6", "#8C5018"],
      ["latte", "Latte", "#F0E0D0", "#FBF6EE", "#8A6038"],
      ["brick", "Brick", "#F0C8BC", "#FBF0EA", "#A03020"],
      ["thistle", "Thistle", "#DCD4E4", "#F6F2F7", "#6A4878"],
      ["fuchsia", "Fuchsia", "#F4C0E4", "#FFF2FA", "#C01888"],
      ["persimmon", "Persimmon", "#FFD0A8", "#FFF4E8", "#D05010"],
      ["charcoal", "Charcoal", "#141618", "#202428", "#90A0B0"],
      ["raven", "Raven", "#0C1018", "#161C28", "#6A90C8"],
      ["cosmos", "Cosmos", "#100818", "#1C1028", "#8860E0"],
      ["neon", "Neon", "#101408", "#1C2410", "#C8FF40"],
      ["vapor", "Vapor", "#181028", "#281840", "#E060C0"],
      ["inferno", "Inferno", "#280C04", "#401408", "#FF6020"],
      ["scarlet", "Scarlet", "#280810", "#401014", "#FF4060"],
      ["merlot", "Merlot", "#1C0810", "#2C1018", "#C04060"],
      ["bronze", "Bronze", "#1C140C", "#2C2014", "#D09050"],
      ["jungle", "Jungle", "#081408", "#102010", "#30C040"],
      ["aegean", "Aegean", "#081420", "#102430", "#3080D0"],
      ["havana", "Havana", "#201410", "#322018", "#E09060"],
      ["nectarine", "Nectarine", "#FCD8C4", "#FFF4EC", "#E07030"],
      ["pumpkin", "Pumpkin", "#F8D090", "#FFF4DC", "#D07800"],
      ["watermelon", "Watermelon", "#F4D4D8", "#FFF2F4", "#C81840"],
      ["lychee", "Lychee", "#F8E0E4", "#FFF6F8", "#C05070"],
      ["coconut", "Coconut", "#F6F2E4", "#FFFCFA", "#8A7A58"],
      ["sherbet", "Sherbet", "#F8D8F0", "#FFF4FC", "#D040A0"],
      ["mustard", "Mustard", "#F0E090", "#FBF6D4", "#A88800"],
      ["chartreuse", "Chartreuse", "#E0F090", "#F4FCD4", "#78A000"],
      ["cactus", "Cactus", "#C8E0C0", "#F0F8EC", "#2A7040"],
      ["nutmeg", "Nutmeg", "#E8D0B0", "#F8F0E4", "#8A5820"],
      ["salmon", "Salmon", "#F8D0C4", "#FFF4F0", "#E06050"],
      ["quartz", "Quartz", "#E8E4F0", "#F6F4FA", "#6860A0"],
      ["azure", "Azure", "#C8E4F8", "#F0F8FF", "#0870C0"],
      ["teal", "Teal", "#C0E4E0", "#EEF8F6", "#0A7870"],
      ["ivory", "Ivory", "#FAF6EC", "#FFFCFA", "#7A6848"],
      ["sienna", "Sienna", "#E8C0A0", "#F8EDE4", "#A04820"],
      ["santorini", "Santorini", "#D4E8F4", "#F4FAFD", "#1A6A9C"],
      ["pewter", "Pewter", "#D4D8DC", "#F2F4F6", "#4A5868"],
      ["rio", "Rio", "#081820", "#102C38", "#20C8E0"],
      ["bali", "Bali", "#0C2018", "#143028", "#40C080"],
      ["seoul", "Seoul", "#180818", "#281028", "#FF4088"],
      ["marrakech", "Marrakech", "#201008", "#341808", "#E86830"],
      ["lisbon", "Lisbon", "#141810", "#222818", "#C8B060"],
      ["fuji", "Fuji", "#101820", "#1C2834", "#A0C8E0"],
      ["polar", "Polar", "#0C1418", "#142028", "#B0D8F0"],
      ["nordic", "Nordic", "#101418", "#1C242C", "#7090A8"],
      ["baltic", "Baltic", "#0A1820", "#142830", "#48A0C0"],
      ["tropic", "Tropic", "#041810", "#0C281C", "#18D090"],
      ["topaz", "Topaz", "#1C1408", "#2C200C", "#F0A030"],
      ["brass", "Brass", "#1C1808", "#2C260C", "#E0C060"]
    ];
    const THEME_NAMES = { auto: "Auto" };
    THEMES.forEach((row) => { THEME_NAMES[row[0]] = row[1]; });
    const THEME_KEY = "enquiz-theme";
    const CUSTOM_THEME_KEY = "enquiz-custom-themes";
    const CUSTOM_COLOR_KEYS = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc", "--photo-wash"];
    function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function hexByte(n) { return clampNum(Math.round(n), 0, 255).toString(16).padStart(2, "0"); }
    function rgbHex(r, g, b) { return "#" + hexByte(r) + hexByte(g) + hexByte(b); }
    function hslRgb(h, s, l) {
      h = ((h % 360) + 360) % 360;
      s = clampNum(s, 0, 1);
      l = clampNum(l, 0, 1);
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const hp = h / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r = 0, g = 0, b = 0;
      if (hp < 1) { r = c; g = x; }
      else if (hp < 2) { r = x; g = c; }
      else if (hp < 3) { g = c; b = x; }
      else if (hp < 4) { g = x; b = c; }
      else if (hp < 5) { r = x; b = c; }
      else { r = c; b = x; }
      const m = l - c / 2;
      return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    function hexHsl(h, s, l) {
      const rgb = hslRgb(h, s, l);
      return rgbHex(rgb[0], rgb[1], rgb[2]);
    }
    function rgbHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;
      const d = max - min;
      if (d) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return { h: h, s: s, l: l };
    }
    function channelLum(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function relLum(r, g, b) {
      return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
    }
    function paletteFromPixels(pixels) {
      const buckets = new Map();
      pixels.forEach((p) => {
        const hsl = rgbHsl(p.r, p.g, p.b);
        const key = Math.round(hsl.h / 12) + "|" + (hsl.s < 0.12 ? 0 : Math.round(hsl.s * 5)) + "|" + Math.round(hsl.l * 8);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { h: 0, s: 0, l: 0, n: 0 };
          buckets.set(key, bucket);
        }
        bucket.h += hsl.h;
        bucket.s += hsl.s;
        bucket.l += hsl.l;
        bucket.n += 1;
      });
      const clusters = Array.from(buckets.values()).map((bucket) => ({
        h: bucket.h / bucket.n,
        s: bucket.s / bucket.n,
        l: bucket.l / bucket.n,
        n: bucket.n
      })).sort((a, b) => b.n - a.n);
      if (!clusters.length) return null;
      const ground = clusters[0];
      let accent = null;
      let best = -1;
      clusters.forEach((cluster) => {
        if (cluster.n < pixels.length * 0.015) return;
        const distance = Math.min(Math.abs(cluster.h - ground.h), 360 - Math.abs(cluster.h - ground.h));
        const score = cluster.s * (0.35 + Math.min(distance, 80) / 80) * Math.sqrt(cluster.n);
        if (cluster.s > 0.16 && score > best) {
          best = score;
          accent = cluster;
        }
      });
      if (!accent) accent = clusters.find((cluster) => cluster.s > ground.s + 0.05) || ground;
      const dark = ground.l < 0.45;
      const groundSat = clampNum(ground.s, dark ? 0.12 : 0.08, dark ? 0.5 : 0.4);
      const accentSat = clampNum(Math.max(accent.s, 0.45), 0.45, 0.88);
      const accentLight = dark ? clampNum(Math.max(accent.l, 0.56), 0.56, 0.72) : clampNum(Math.min(accent.l, 0.38), 0.28, 0.42);
      const accentRgb = hslRgb(accent.h, accentSat, accentLight);
      const onAcc = relLum(accentRgb[0], accentRgb[1], accentRgb[2]) > 0.62 ? hexHsl(accent.h, 0.25, 0.12) : "#FFFFFF";
      const bg = hexHsl(ground.h, groundSat, dark ? 0.11 : 0.9);
      const vars = dark ? {
        "--bg": bg,
        "--card": hexHsl(ground.h, groundSat * 0.85, 0.17),
        "--ink": hexHsl(ground.h, 0.12, 0.94),
        "--mute": hexHsl(ground.h, 0.1, 0.72),
        "--line": hexHsl(ground.h, 0.16, 0.28),
        "--acc": rgbHex(accentRgb[0], accentRgb[1], accentRgb[2]),
        "--acc-s": hexHsl(accent.h, 0.32, 0.22),
        "--ok": "#7DDE6A",
        "--ok-s": "#14361C",
        "--bad": "#FF8A80",
        "--bad-s": "#402420",
        "--on-acc": onAcc,
        "--photo-wash": bg + "99",
        "color-scheme": "dark"
      } : {
        "--bg": bg,
        "--card": hexHsl(ground.h, groundSat * 0.45, 0.97),
        "--ink": hexHsl(ground.h, 0.25, 0.16),
        "--mute": hexHsl(ground.h, 0.14, 0.4),
        "--line": hexHsl(ground.h, 0.16, 0.78),
        "--acc": rgbHex(accentRgb[0], accentRgb[1], accentRgb[2]),
        "--acc-s": hexHsl(accent.h, 0.28, 0.88),
        "--ok": "#1F8A56",
        "--ok-s": "#D7F3E6",
        "--bad": "#C4373C",
        "--bad-s": "#F8D6D8",
        "--on-acc": "#FFFFFF",
        "--photo-wash": bg + "99",
        "color-scheme": "light"
      };
      return { bg: vars["--bg"], card: vars["--card"], acc: vars["--acc"], vars: vars };
    }
    function customThemeOk(row) {
      return !!(row && typeof row.id === "string" && row.id.indexOf("user-") === 0 && row.vars && typeof row.vars["--bg"] === "string" && typeof row.vars["--card"] === "string" && typeof row.vars["--acc"] === "string");
    }
    function loadCustomThemes() {
      try {
        const list = JSON.parse(localStorage.getItem(CUSTOM_THEME_KEY) || "[]");
        return Array.isArray(list) ? list.filter(customThemeOk) : [];
      } catch (e) { return []; }
    }
    function saveCustomThemes(list) {
      const next = list.slice(0, 8);
      try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next)); }
      catch (e) {
        try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next.map((row) => Object.assign({}, row, { photo: "" })))); }
        catch (err) {}
      }
      if (typeof syncChange === "function") syncChange({ op: "put-setting", key: "customThemes", value: loadCustomThemes() });
    }
    const DEFAULT_THEME = "almond";
    function themeCut() {
      const cut = THEMES.findIndex((row) => row[0] === "coral");
      return cut < 0 ? THEMES.length : cut;
    }
    function visibleThemes() {
      const pub = THEMES.slice(0, themeCut());
      return samePersonStudy() ? THEMES : pub;
    }
    function privateThemeId(name) {
      return THEMES.slice(themeCut()).some((row) => row[0] === name);
    }
    function visibleCustomThemes() {
      const login = viewAccount && viewAccount.login ? viewAccount.login : (authUser && authUser.login ? authUser.login : "");
      return loadCustomThemes().filter((row) => {
        const owner = row.owner ? String(row.owner) : "";
        if (!login) return !owner;
        return !owner || owner === login;
      });
    }
    function currentTheme() {
      try { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; }
      catch (e) { return DEFAULT_THEME; }
    }
    function installCustomThemes(list) {
      const next = (Array.isArray(list) ? list : []).filter(customThemeOk).slice(0, 8);
      try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next)); }
      catch (e) {
        try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next.map((row) => Object.assign({}, row, { photo: "" })))); }
        catch (err) {}
      }
    }
    function settleThemeAudience() {
      const name = currentTheme();
      const customOk = visibleCustomThemes().some((row) => row.id === name);
      if ((privateThemeId(name) && !samePersonStudy()) || (String(name).indexOf("user-") === 0 && !customOk)) applyTheme(DEFAULT_THEME);
      paintThemeSegs();
    }
    function themeLabel(name) {
      const custom = loadCustomThemes().find((row) => row.id === name);
      if (custom) return custom.name || "Picture";
      return THEME_NAMES[name || "auto"] || "Auto";
    }
    function clearCustomPaint(root) {
      CUSTOM_COLOR_KEYS.forEach((key) => root.style.removeProperty(key));
      root.style.removeProperty("--theme-photo");
      root.style.removeProperty("color-scheme");
    }
    function paintCustomVars(root, theme) {
      clearCustomPaint(root);
      const vars = theme && theme.vars ? theme.vars : {};
      CUSTOM_COLOR_KEYS.forEach((key) => {
        if (typeof vars[key] === "string") root.style.setProperty(key, vars[key]);
      });
      if (vars["color-scheme"] === "dark" || vars["color-scheme"] === "light") root.style.setProperty("color-scheme", vars["color-scheme"]);
      if (theme && typeof theme.photo === "string" && theme.photo.indexOf("data:image/") === 0) root.style.setProperty("--theme-photo", 'url("' + theme.photo + '")');
    }
    function themeNameParts(name) {
      const text = String(name || "").trim();
      const match = text.match(/^(.*?)\s*(?:—|–|\s-\s)\s*(.*)$/);
      if (!match) return [text];
      const left = match[1].trim();
      const right = match[2].trim();
      if (!left || !right) return [text];
      return [left, right];
    }
    function themeNameHtml(name) {
      const parts = themeNameParts(name);
      if (parts.length < 2) return esc(parts[0]);
      return esc(parts[0]) + '<span class="theme-sub">' + esc(parts[1]) + "</span>";
    }
    function applyTheme(name) {
      const root = document.documentElement;
      const custom = name && name.indexOf("user-") === 0 ? loadCustomThemes().find((row) => row.id === name) : null;
      if (name === "auto") {
        clearCustomPaint(root);
        root.removeAttribute("data-theme");
      } else if (custom) {
        root.setAttribute("data-theme", "user");
        paintCustomVars(root, custom);
      } else if (name && THEME_NAMES[name]) {
        clearCustomPaint(root);
        root.setAttribute("data-theme", name);
      } else {
        name = DEFAULT_THEME;
        clearCustomPaint(root);
        root.setAttribute("data-theme", name);
      }
      try { localStorage.setItem(THEME_KEY, name); } catch (e) {}
      document.querySelectorAll("[data-theme-seg] button").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.th === (name || "auto") ? "true" : "false");
      });
      const sideTheme = document.getElementById("themeCycle");
      if (sideTheme) sideTheme.innerHTML = '<span class="theme-side">Theme · ' + themeNameHtml(themeLabel(name || "auto")) + "</span>";
    }
    function paintThemeSegs() {
      const auto = '<button type="button" data-th="auto"><span class="sw" style="background:linear-gradient(90deg,#F4F6FB 50%,#0D1020 50%)"><i style="background:#fff"></i></span>Auto</button>';
      const mine = visibleCustomThemes().map((row) => '<div class="theme-pick"><button type="button" data-th="' + esc(row.id) + '"><span class="sw" style="background:' + row.bg + '"><i style="background:' + row.card + '"></i><b style="background:' + row.acc + '"></b></span><span class="theme-name">' + themeNameHtml(row.name || "Picture") + '</span></button><button type="button" class="theme-edit" data-theme-edit="' + esc(row.id) + '" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button type="button" class="theme-x" data-theme-remove="' + esc(row.id) + '" aria-label="Remove">×</button></div>').join("");
      const rest = visibleThemes().map((row) => '<button type="button" data-th="' + row[0] + '"><span class="sw" style="background:' + row[2] + '"><i style="background:' + row[3] + '"></i><b style="background:' + row[4] + '"></b></span><span class="theme-name">' + themeNameHtml(row[1]) + "</span></button>").join("");
      document.querySelectorAll("[data-theme-seg]").forEach((box) => { box.innerHTML = auto + mine + rest; });
      applyTheme(currentTheme());
    }
    let editingThemeId = "";
    let themeBeforeEdit = "";
    let beginThemeEdit = function () {};
    let endThemeEdit = function () {};
    function removeCustomTheme(id) {
      const editing = editingThemeId === id;
      saveCustomThemes(loadCustomThemes().filter((row) => row.id !== id));
      if (editing) endThemeEdit();
      paintThemeSegs();
    }
    function jpegDataUrl(canvas, quality) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(""); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      });
    }
    function themeFromFile(file) {
      return createImageBitmap(file).then((bitmap) => {
        const max = 1100;
        const scale = Math.min(max / bitmap.width, max / bitmap.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const sample = document.createElement("canvas");
        sample.width = 72;
        sample.height = Math.max(1, Math.round(72 * canvas.height / canvas.width));
        const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
        sampleCtx.drawImage(canvas, 0, 0, sample.width, sample.height);
        const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }
        const palette = paletteFromPixels(pixels);
        if (!palette) return null;
        return jpegDataUrl(canvas, 0.62).then((photo) => {
          if (photo.length > 420000) return jpegDataUrl(canvas, 0.42).then((smaller) => ({ palette: palette, photo: smaller.length > 450000 ? "" : smaller }));
          return { palette: palette, photo: photo };
        });
      });
    }
    paintThemeSegs();
    document.querySelectorAll("[data-theme-seg]").forEach((box) => {
      box.addEventListener("click", (e) => {
        const edit = e.target.closest("[data-theme-edit]");
        if (edit) {
          e.preventDefault();
          beginThemeEdit(edit.getAttribute("data-theme-edit"));
          return;
        }
        const remove = e.target.closest("[data-theme-remove]");
        if (remove) {
          e.preventDefault();
          removeCustomTheme(remove.getAttribute("data-theme-remove"));
          return;
        }
        const btn = e.target.closest("[data-th]");
        if (btn) applyTheme(btn.dataset.th);
      });
    });
    const customThemeForm = document.getElementById("customThemeForm");
    if (customThemeForm) {
      const customThemeFile = document.getElementById("customThemeFile");
      const customThemePreview = document.getElementById("customThemePreview");
      const customThemeShot = document.getElementById("customThemeShot");
      const customThemeWash = document.getElementById("customThemeWash");
      const customThemeVeil = document.getElementById("customThemeVeil");
      const customThemeVeilOut = document.getElementById("customThemeVeilOut");
      const customThemeStatus = document.getElementById("customThemeStatus");
      let customThemePreviewUrl = "";
      function veilByte(percent) {
        return clampNum(Math.round(Number(percent) / 100 * 255), 0, 255).toString(16).padStart(2, "0");
      }
      const customThemeName = document.getElementById("customThemeName");
      const customThemeHint = document.getElementById("customThemeHint");
      const customThemeSubmit = document.getElementById("customThemeSubmit");
      const customThemeCancel = document.getElementById("customThemeCancel");
      function veilPercent(wash) {
        const alpha = parseInt(String(wash || "").slice(7, 9), 16);
        if (!Number.isFinite(alpha)) return 60;
        return clampNum(Math.round(alpha / 255 * 100), 0, 100);
      }
      function typedThemeName(list) {
        const typed = (customThemeName.value || "").trim().replace(/\s+/g, " ").slice(0, 64);
        return typed || ("Picture " + (list.length + 1));
      }
      function setThemeFormMode(editing) {
        if (customThemeSubmit) customThemeSubmit.textContent = editing ? "Save" : "Make a theme";
        if (customThemeCancel) customThemeCancel.hidden = !editing;
        if (customThemeHint) customThemeHint.textContent = editing
          ? "Change the name, the picture, or how much the picture is dimmed."
          : "Add a painting. The theme takes its colors, and the picture stays on the background, dimmed.";
      }
      function clearThemeDraft() {
        editingThemeId = "";
        themeBeforeEdit = "";
        customThemeForm.reset();
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        if (customThemeShot) customThemeShot.hidden = true;
        customThemePreview.removeAttribute("src");
        if (customThemeWash) customThemeWash.style.background = "#fff";
        setThemeFormMode(false);
        paintVeil();
      }
      function paintVeil() {
        const percent = customThemeVeil ? clampNum(Number(customThemeVeil.value) || 0, 0, 100) : 60;
        if (customThemeVeilOut) customThemeVeilOut.textContent = percent + "%";
        if (customThemeWash) customThemeWash.style.opacity = String(percent / 100);
        if (!editingThemeId || currentTheme() !== editingThemeId) return;
        const theme = loadCustomThemes().find((row) => row.id === editingThemeId);
        if (!theme || !theme.vars) return;
        paintCustomVars(document.documentElement, {
          vars: Object.assign({}, theme.vars, { "--photo-wash": String(theme.vars["--bg"] || "#FFFFFF").slice(0, 7) + veilByte(percent) }),
          photo: theme.photo
        });
      }
      function storeTheme(theme, message) {
        const list = loadCustomThemes();
        const index = list.findIndex((row) => row.id === theme.id);
        if (index >= 0) list[index] = theme;
        else list.unshift(theme);
        saveCustomThemes(list);
        clearThemeDraft();
        paintThemeSegs();
        applyTheme(theme.id);
        customThemeStatus.textContent = message;
        customThemeStatus.className = "hint";
      }
      beginThemeEdit = function (id) {
        const theme = loadCustomThemes().find((row) => row.id === id);
        if (!theme) return;
        if (!editingThemeId) themeBeforeEdit = currentTheme();
        editingThemeId = id;
        customThemeName.value = theme.name || "";
        if (customThemeVeil) customThemeVeil.value = String(veilPercent(theme.vars && theme.vars["--photo-wash"]));
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        customThemeFile.value = "";
        if (theme.photo) {
          customThemePreview.src = theme.photo;
          if (customThemeShot) customThemeShot.hidden = false;
        } else if (customThemeShot) {
          customThemeShot.hidden = true;
          customThemePreview.removeAttribute("src");
        }
        if (customThemeWash && theme.vars && theme.vars["--bg"]) customThemeWash.style.background = theme.vars["--bg"];
        setThemeFormMode(true);
        customThemeStatus.textContent = "";
        customThemeStatus.className = "hint";
        applyTheme(id);
        paintVeil();
        customThemeForm.scrollIntoView({ block: "nearest" });
      };
      endThemeEdit = function () {
        const back = themeBeforeEdit;
        clearThemeDraft();
        if (back) applyTheme(back);
      };
      paintVeil();
      if (customThemeVeil) customThemeVeil.addEventListener("input", paintVeil);
      if (customThemeCancel) customThemeCancel.addEventListener("click", endThemeEdit);
      customThemeFile.addEventListener("change", () => {
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        const file = customThemeFile.files && customThemeFile.files[0];
        if (!file) return;
        customThemePreviewUrl = URL.createObjectURL(file);
        customThemePreview.src = customThemePreviewUrl;
        if (customThemeShot) customThemeShot.hidden = false;
        if (customThemeWash && !editingThemeId) customThemeWash.style.background = "#fff";
        paintVeil();
        customThemeStatus.textContent = "";
        customThemeStatus.className = "hint";
      });
      customThemeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const file = customThemeFile.files && customThemeFile.files[0];
        const existing = editingThemeId ? loadCustomThemes().find((row) => row.id === editingThemeId) : null;
        if (file && file.size > 15 * 1024 * 1024) {
          customThemeStatus.textContent = "This picture is too large.";
          customThemeStatus.className = "hint bad";
          return;
        }
        if (!file && !existing) {
          customThemeStatus.textContent = "Choose a picture first.";
          customThemeStatus.className = "hint bad";
          return;
        }
        const submit = customThemeSubmit;
        if (submit) submit.disabled = true;
        const percent = customThemeVeil ? customThemeVeil.value : 60;
        const done = (theme, message) => {
          storeTheme(theme, message);
          if (submit) submit.disabled = false;
        };
        const fail = () => {
          customThemeStatus.textContent = "This picture could not be read.";
          customThemeStatus.className = "hint bad";
          if (submit) submit.disabled = false;
        };
        if (!file && existing) {
          const vars = Object.assign({}, existing.vars, { "--photo-wash": String(existing.vars["--bg"] || existing.bg || "#FFFFFF").slice(0, 7) + veilByte(percent) });
          done(Object.assign({}, existing, { name: typedThemeName(loadCustomThemes()), vars: vars }), "Theme saved.");
          return;
        }
        customThemeStatus.textContent = "Reading the picture…";
        customThemeStatus.className = "hint";
        themeFromFile(file).then((made) => {
          if (!made || !made.palette) throw new Error("empty");
          const list = loadCustomThemes();
          made.palette.vars["--photo-wash"] = made.palette.vars["--bg"] + veilByte(percent);
          const ownerLogin = existing && existing.owner ? existing.owner : (viewAccount && viewAccount.login ? viewAccount.login : (authUser && authUser.login ? authUser.login : ""));
          done({
            id: existing ? existing.id : "user-" + Date.now().toString(36),
            name: typedThemeName(list),
            bg: made.palette.bg,
            card: made.palette.card,
            acc: made.palette.acc,
            vars: made.palette.vars,
            photo: made.photo || (existing && existing.photo) || "",
            owner: ownerLogin
          }, existing ? "Theme saved." : (made.photo ? "Theme added." : "Theme added. The picture was too heavy to keep as a background."));
        }).catch(fail);
      });
    }
    function cycleTheme() {
      const now = currentTheme();
      const choices = visibleThemes().map((row) => row[0]).concat(visibleCustomThemes().map((row) => row.id)).filter((name) => name !== now);
      if (!choices.length) return;
      applyTheme(choices[Math.floor(Math.random() * choices.length)]);
    }
    document.querySelectorAll("[data-theme-cycle]").forEach((btn) => btn.addEventListener("click", cycleTheme));
    document.body.addEventListener("click", (e) => {
      const dayTab = e.target.closest("[data-day-tab]");
      if (dayTab) {
        const root = dayTab.closest("[data-day-page]");
        if (!root) return;
        const name = dayTab.dataset.dayTab;
        root.querySelectorAll("[data-day-tab]").forEach((b) => {
          const on = b === dayTab;
          b.classList.toggle("on", on);
          b.setAttribute("aria-selected", on ? "true" : "false");
        });
        root.querySelectorAll("[data-day-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.dayPanel !== name;
        });
        return;
      }
      const sayBtn = e.target.closest("[data-say]");
      if (sayBtn) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        let said = sayBtn.getAttribute("data-say-text") || "";
        if (!said) {
          const card = sayBtn.closest(".gen, #wordView, #musicView, #markerView, .wcard");
          const head = card && card.querySelector(".entry, .en, h1");
          said = head ? head.textContent : "";
        }
        speakRegion(said, sayBtn.getAttribute("data-say"));
        return;
      }
      const pdfLink = e.target.closest("a[href]");
      if (pdfLink) {
        const href = pdfLink.getAttribute("href") || "";
        if (/\.pdf(\?|$)/i.test(href) && href.indexOf("://") < 0) {
          e.preventDefault();
          openPdf(href);
          return;
        }
      }
      const back = e.target.closest("[data-nav-back]");
      if (back) { goBack(back.dataset.fallback || "home"); return; }
      const more = e.target.closest("[data-src-more]");
      if (more) {
        const rest = document.getElementById(more.dataset.srcMore);
        if (rest) rest.hidden = !rest.hidden;
        return;
      }
      const listMore = e.target.closest("[data-list-more]");
      if (listMore) {
        const rest = document.getElementById(listMore.dataset.listMore);
        if (rest) rest.hidden = !rest.hidden;
        listMore.textContent = rest && !rest.hidden ? "Hide the rest" : "Show the rest";
        return;
      }
      const markerBtn = e.target.closest("[data-marker]");
      if (markerBtn) { openMarker(markerBtn.dataset.marker); return; }
      const topicBtn = e.target.closest("[data-topic]");
      if (topicBtn) { openTopic(topicBtn.dataset.topic); return; }
      const compareBtn = e.target.closest("[data-compare]");
      if (compareBtn) { openCompare(compareBtn.dataset.compare); return; }
      const areaBtn = e.target.closest("[data-area]");
      if (areaBtn) { openArea(areaBtn.dataset.area); return; }
      const tenseBtn = e.target.closest("[data-tense]");
      if (tenseBtn) { openTopic(tenseBtn.dataset.tense); return; }
      const speakLevelBtn = e.target.closest("[data-speak-level]");
      if (speakLevelBtn) { openSpeak("level", Number(speakLevelBtn.dataset.speakLevel), -1, -1); return; }
      const speakUnitBtn = e.target.closest("[data-speak-unit]");
      if (speakUnitBtn) { openSpeak("unit", speakLevel, Number(speakUnitBtn.dataset.speakUnit), -1); return; }
      const speakLessonBtn = e.target.closest("[data-speak-lesson]");
      if (speakLessonBtn) { openSpeak("lesson", speakLevel, speakUnit, Number(speakLessonBtn.dataset.speakLesson)); return; }
      const lessonWords = e.target.closest("[data-lesson-words]");
      if (lessonWords) { openLessonWords(lessonWords.dataset.lessonWords); return; }
      const lessonRulesBtn = e.target.closest("[data-lesson-rules]");
      if (lessonRulesBtn) { openLessonRules(lessonRulesBtn.dataset.lessonRules); return; }
      const deckStudy = e.target.closest("[data-deck-study]");
      if (deckStudy) {
        const id = deckStudy.dataset.deckStudy;
        const title = id === "idioms" ? "Idioms" : "Phrasal verbs";
        openListedStudy(deckStudyCards(id), title, id);
        return;
      }
      const phrasalBtn = e.target.closest("[data-phrasal]");
      if (phrasalBtn) {
        const w = phrasalWords[Number(phrasalBtn.dataset.phrasal)];
        if (w) { current = w; renderWord(w); visit("word"); }
        return;
      }
      const idiomBtn = e.target.closest("[data-idiom]");
      if (idiomBtn) {
        const w = idiomWords[Number(idiomBtn.dataset.idiom)];
        if (w) { current = w; renderWord(w); visit("word"); }
        return;
      }
      const bankBtn = e.target.closest("[data-bank-place]");
      if (bankBtn) {
        const bank = bankBtn.dataset.bankPlace === "lesson-21" ? words : lessonBank(bankBtn.dataset.bankPlace);
        const card = bank[Number(bankBtn.dataset.bankIndex)];
        if (card) { current = card; renderWord(card); visit("word"); }
        return;
      }
      const jump = e.target.closest("[data-jump]");
      if (jump) {
        if (jump.dataset.jump === "tenses") openHub();
        else if (jump.dataset.jump === "speakout") { openSpeak("levels", -1, -1, -1); return; }
        else if (jump.dataset.jump === "setup") { openGlobalStudy(); return; }
        else if (jump.dataset.jump === "exam") { beginQuiz(true); return; }
        else if (jump.dataset.jump === "textedit") { openTextEditor(null); return; }
        else if (jump.dataset.jump === "errors") {
          const here = (document.querySelector("section.on") || {}).id;
          if (here !== "daysetup" && here !== "dayq" && here !== "exam") {
            studyTitle = here === "setup" || here === "library" || here === "home" ? "Study" : "This page";
            studyScreen = here === "library" || here === "home" || here === "setup" ? "setup" : (here || "home");
          }
          openMistakes(here === "setup" ? allStudyCards() : cardsOnThisPage());
          return;
        }
        else {
          if (jump.dataset.jump === "song") showSampleSong();
          if (jump.dataset.jump === "allwords") {
            allGroup = "";
            allSong = "";
            if ((document.querySelector("section.on") || {}).id === "allwords") {
              paintAllWords();
              return;
            }
          }
          if (jump.dataset.jump === "add") {
            addGroup = "";
            addSong = "";
            if ((document.querySelector("section.on") || {}).id === "add") {
              renderAddedList();
              return;
            }
          }
          if (jump.dataset.jump === "verbs") {
            verbGroup = "";
            verbKey = "";
            if ((document.querySelector("section.on") || {}).id === "verbs") {
              paintVerbs();
              return;
            }
          }
          visit(jump.dataset.jump);
        }
      }
    });

    function toggleTypeChip(e) {
      const more = e.target.closest("[data-types-more]");
      if (more) {
        const box = document.getElementById(more.dataset.typesMore);
        if (box) box.hidden = !box.hidden;
        return;
      }
      const btn = e.target.closest(".chip");
      if (btn) btn.classList.toggle("on");
    }
    document.getElementById("modes").addEventListener("click", toggleTypeChip);
    document.getElementById("modesMore").addEventListener("click", toggleTypeChip);
    document.querySelectorAll("[data-mix]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-mix]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
      });
    });

    document.querySelectorAll("#choice [data-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#choice .opt").forEach((o) => o.classList.remove("ok", "bad"));
        btn.classList.add(btn.dataset.choice === "ok" ? "ok" : "bad");
        if (btn.dataset.choice !== "ok") document.querySelector('#choice [data-choice="ok"]').classList.add("ok");
        document.getElementById("choiceFb").innerHTML =
          '<div class="feedback ' + (btn.dataset.choice === "ok" ? "ok" : "bad") + '">' +
          (btn.dataset.choice === "ok" ? "Correct" : "Incorrect. Right answer: 2") +
          '</div><div class="explain">сдаваться, бросать. Phrasal verb, B2.<br>' + cardLinks("give up", "https://dictionary.cambridge.org/dictionary/english/give-up") + "</div>";
      });
    });

    const flipBtn = document.getElementById("flipBtn");
    const flipScene = document.getElementById("flipScene");
    const flipBack = document.getElementById("flipBack");
    let flipReady = false;
    function toggleFlip() {
      if (!flipScene) return;
      if (!flipReady && flipBack) {
        flipBack.innerHTML = '<p class="entry">сдаваться, бросать</p>' + ipaHtml({ en: "give up", uk: "/ɡɪv ˈʌp/", us: "/ɡɪv ˈʌp/" }) + '<p><span class="level">phrasal verb</span><span class="level">B2</span></p><p>Cambridge: to stop doing or having something.</p><p>' + cardLinks("give up", "https://dictionary.cambridge.org/dictionary/english/give-up") + '</p><div class="row" style="margin-top:12px"><button class="btn primary" type="button">Knew</button><button class="btn" type="button">Didn\'t know</button></div>';
        flipReady = true;
      }
      const on = flipScene.classList.toggle("is-flipped");
      flipBtn.textContent = on ? "Card front" : "Flip";
      flipBtn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    flipBtn.addEventListener("click", toggleFlip);
    flipScene.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      toggleFlip();
    });
    flipScene.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleFlip();
    });

    document.getElementById("typeCheck").addEventListener("click", () => {
      const value = document.getElementById("typeInput").value.trim().toLowerCase().replace(/\s+/g, " ");
      const ok = value === "give up";
      document.getElementById("typeFb").innerHTML = '<div class="feedback ' + (ok ? "ok" : "bad") + '">' + (ok ? "Correct" : "Incorrect. Needed: give up") + "</div>";
    });

    const bank = document.getElementById("bank");
    const slot = document.getElementById("slot");
    bank.addEventListener("click", (e) => {
      const token = e.target.closest(".token");
      if (!token) return;
      (token.parentElement === bank ? slot : bank).appendChild(token);
    });

    document.querySelectorAll("#tapLine button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#tapLine button").forEach((b) => b.classList.remove("ok", "bad"));
        btn.classList.add(btn.dataset.tap === "ok" ? "ok" : "bad");
        document.getElementById("tapFb").innerHTML = '<div class="feedback ' + (btn.dataset.tap === "ok" ? "ok" : "bad") + '">' +
          (btn.dataset.tap === "ok"
            ? "Correct. since 2019 marks a start that is still connected to now.<br>Верно. since 2019 показывает начало, которое связано с настоящим."
            : "That is the verb form. The time marker here is since.<br>Это форма глагола. Показатель времени здесь — since.") + "</div>";
      });
    });

    let leftPick = null;
    document.querySelectorAll("#pairs .pair").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("ok")) return;
        if (btn.dataset.side === "l") {
          document.querySelectorAll('#pairs [data-side="l"]').forEach((b) => b.classList.remove("pick"));
          btn.classList.add("pick");
          leftPick = btn;
          return;
        }
        if (!leftPick) return;
        const good = leftPick.dataset.id === btn.dataset.id;
        if (good) {
          leftPick.classList.remove("pick");
          leftPick.classList.add("ok");
          btn.classList.add("ok");
        } else {
          leftPick.classList.remove("pick");
          const a = leftPick;
          a.classList.add("bad");
          btn.classList.add("bad");
          setTimeout(() => { a.classList.remove("bad"); btn.classList.remove("bad"); }, 500);
        }
        leftPick = null;
      });
    });

    const words = window.LESSON_DATA.words;
    const lines21 = window.LESSON_DATA.lines21;
    const ask07 = window.LESSON_DATA.ask07;
    const phrases09 = window.LESSON_DATA.phrases09;
    const adverbs14 = window.LESSON_DATA.adverbs14;
    const talk16 = window.LESSON_DATA.talk16;
    const likes23 = window.LESSON_DATA.likes23;
    const extraWords = window.LESSON_DATA.extraWords;
    const rules = window.LESSON_DATA.rules;
    const lessonRules = window.LESSON_DATA.lessonRules;

    let current = words[0];
    let dayFlipped = false;
    const VARIANT_KEY = "enquiz-variants";
    function variantKey(word) {
      return String(word || "").trim().toLowerCase();
    }
    function loadVariantMap() {
      try { return JSON.parse(localStorage.getItem(VARIANT_KEY) || "{}"); }
      catch (e) { return {}; }
    }
    function variantsOf(word) {
      const list = loadVariantMap()[variantKey(word)];
      return Array.isArray(list) ? list : [];
    }
    function variantLines(word) {
      return variantsOf(word).map((text) =>
        '<p><b>' + esc(text) + '</b></p><p class="hint">You added this variant to the card.</p>'
      ).join("");
    }
    function variantForm(word, where, ru) {
      return '<div class="variant-box" data-variant-word="' + esc(word) + '" data-variant-where="' + where + '" data-variant-ru="' + esc(ru || "") + '">' +
        '<button class="account-link" type="button" data-variant-open>your variant of the word</button>' +
        '<div data-variant-form hidden>' +
        '<input type="text" data-variant-input placeholder="in Russian" autocomplete="off" />' +
        '<div class="row"><button class="btn" type="button" data-variant-add>Add to this card</button></div>' +
        '<p class="hint" data-variant-status></p></div></div>';
    }
    function addVariant(word, text, status) {
      const value = text.trim();
      const write = (message, bad) => {
        status.textContent = message;
        status.classList.toggle("bad", !!bad);
      };
      if (!value) { write("Type a variant.", true); return false; }
      const have = variantsOf(word);
      if (have.some((line) => line.toLowerCase() === value.toLowerCase())) {
        write("This variant is already on the card.", true);
        return false;
      }
      const map = loadVariantMap();
      const key = variantKey(word);
      map[key] = have.concat([value]);
      localStorage.setItem(VARIANT_KEY, JSON.stringify(map));
      syncChange({ op: "put-variant", word: key, lines: map[key] });
      return true;
    }
    function wordPic(word, large) {
      const key = String(word || "").trim().toLowerCase();
      const bg = '<rect width="40" height="40" rx="12" fill="#e7f1fa"/>';
      const scenes = {
        humid: bg + '<circle cx="13" cy="15" r="3" fill="#0b5cab"/><circle cx="24" cy="13" r="2" fill="#7eb0dc"/><circle cx="23" cy="25" r="3.2" fill="#0b5cab"/><circle cx="13" cy="27" r="1.7" fill="#7eb0dc"/>',
        damp: bg + '<ellipse cx="20" cy="27" rx="12" ry="4" fill="#b7d4ee"/><circle cx="14" cy="14" r="2.2" fill="#0b5cab"/><circle cx="22" cy="12" r="1.6" fill="#0b5cab"/><circle cx="27" cy="18" r="1.5" fill="#7eb0dc"/>',
        wet: bg + '<ellipse cx="20" cy="28" rx="13" ry="5" fill="#7eb0dc"/><path d="M12 16c0-4 8-4 8 0" fill="none" stroke="#0b5cab" stroke-width="1.6"/><circle cx="14" cy="10" r="1.4" fill="#0b5cab"/><circle cx="22" cy="8" r="1.4" fill="#0b5cab"/><circle cx="28" cy="14" r="1.4" fill="#0b5cab"/>',
        dry: bg + '<circle cx="20" cy="20" r="6" fill="#e8b423"/><g stroke="#d39a12" stroke-width="1.8" stroke-linecap="round"><path d="M20 7v3M20 30v3M7 20h3M30 20h3M10 10l2 2M28 28l2 2M30 10l-2 2M12 28l-2 2"/></g>',
        windy: bg + '<g fill="none" stroke="#0b5cab" stroke-width="2" stroke-linecap="round"><path d="M8 14h14a4 4 0 1 0-1.2-7.8"/><path d="M6 21h18a3.2 3.2 0 1 1-1 6.2"/><path d="M10 30h10"/></g>',
        chilly: bg + '<circle cx="16" cy="18" r="6" fill="#d7e8f6" stroke="#7eb0dc"/><path d="M26 10v8M22 14h8M23.2 11.2l5.6 5.6M28.8 11.2l-5.6 5.6" stroke="#0b5cab" stroke-width="1.4" stroke-linecap="round"/>',
        boiling: bg + '<circle cx="20" cy="20" r="6" fill="#c23030"/><g stroke="#c23030" stroke-width="1.8" stroke-linecap="round"><path d="M20 6v3M20 31v3M6 20h3M31 20h3M9 9l2 2M29 29l2 2M31 9l-2 2M11 29l-2 2"/></g>',
        freezing: bg + '<path d="M20 7v26M9 13l22 14M31 13L9 27" stroke="#0b5cab" stroke-width="1.8" stroke-linecap="round"/><circle cx="20" cy="20" r="2.2" fill="#0b5cab"/>',
        mild: bg + '<circle cx="15" cy="16" r="5" fill="#e8b423"/><path d="M14 24h16a5 5 0 0 0-1-9 6 6 0 0 0-11 2" fill="#fff" stroke="#b7d4ee"/>',
        drizzle: bg + '<path d="M10 20h16a5 5 0 0 0-1-9 6 6 0 0 0-11 2" fill="#fff" stroke="#7eb0dc"/><circle cx="14" cy="28" r="1.2" fill="#0b5cab"/><circle cx="20" cy="31" r="1.2" fill="#0b5cab"/><circle cx="26" cy="28" r="1.2" fill="#0b5cab"/>',
        shower: bg + '<path d="M8 18h18a6 6 0 0 0-1-11 7 7 0 0 0-13 3" fill="#d7e8f6" stroke="#0b5cab"/><path d="M14 26l-2 6M20 25l-2 7M26 26l-2 6" stroke="#0b5cab" stroke-width="1.6" stroke-linecap="round"/>',
        thunderstorm: bg + '<path d="M8 18h18a6 6 0 0 0-1-11 7 7 0 0 0-13 3" fill="#5c6b7a"/><path d="M22 20l-6 9h5l-2 7 9-11h-5z" fill="#e8b423"/>',
        fog: bg + '<g stroke="#7eb0dc" stroke-width="3" stroke-linecap="round"><path d="M8 14h24"/><path d="M6 21h28"/><path d="M10 28h20"/></g>',
        moonlight: bg + '<path d="M24 10a10 10 0 1 0 6 16 8 8 0 0 1-6-16z" fill="#e8b423"/><circle cx="12" cy="12" r="1" fill="#0b5cab"/><circle cx="14" cy="28" r="1" fill="#0b5cab"/>',
        "give up": bg + '<path d="M14 32V12" stroke="#5c6b7a" stroke-width="2" stroke-linecap="round"/><path d="M14 12h14l-3 5 3 5H14" fill="#c23030"/>',
        look: bg + '<ellipse cx="20" cy="20" rx="12" ry="7" fill="#fff" stroke="#0b5cab" stroke-width="1.6"/><circle cx="20" cy="20" r="3" fill="#0b5cab"/>',
        touch: bg + '<path d="M16 22V12a2 2 0 0 1 4 0v6M20 16a2 2 0 0 1 4 1v5M24 18a2 2 0 0 1 4 1v8a8 8 0 0 1-8 8h-2a6 6 0 0 1-6-6v-7a2 2 0 0 1 4 0" fill="none" stroke="#0b5cab" stroke-width="1.6" stroke-linecap="round"/>'
      };
      let inner = scenes[key];
      if (!inner) {
        const letter = (key.replace(/[^a-z]/g, "").charAt(0) || "?").toUpperCase();
        inner = bg + '<text x="20" y="26" text-anchor="middle" font-size="16" font-weight="700" fill="#0b5cab" font-family="ui-sans-serif,system-ui">' + letter + "</text>";
      }
      return '<span class="pic' + (large ? " lg" : "") + '" aria-hidden="true"><svg viewBox="0 0 40 40">' + inner + "</svg></span>";
    }
    const SAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.6 10.1h1.7l2.3-1.9v7.6l-2.3-1.9H8.6z" fill="currentColor"/><path d="M14.4 10.1a2.6 2.6 0 0 1 0 3.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
    const IPA_WORD = {
      "a": ["/ə/", "/ə/"], "about": ["/əˈbaʊt/", "/əˈbaʊt/"], "all": ["/ɔːl/", "/ɑːl/"], "always": ["/ˈɔːl.weɪz/", "/ˈɑːl.weɪz/"],
      "an": ["/ən/", "/ən/"], "and": ["/ənd/", "/ənd/"], "appointments": ["/əˈpɔɪnt.mənts/", "/əˈpɔɪnt.mənts/"], "at": ["/ət/", "/ət/"],
      "atm": ["/ˌeɪ.tiːˈem/", "/ˌeɪ.tiːˈem/"], "be": ["/biː/", "/biː/"], "blue": ["/bluː/", "/bluː/"], "break": ["/breɪk/", "/breɪk/"],
      "by": ["/baɪ/", "/baɪ/"], "cake": ["/keɪk/", "/keɪk/"], "can": ["/kən/", "/kən/"], "can't": ["/kɑːnt/", "/kænt/"],
      "come": ["/kʌm/", "/kʌm/"], "day": ["/deɪ/", "/deɪ/"], "do": ["/duː/", "/duː/"], "enjoy": ["/ɪnˈdʒɔɪ/", "/ɪnˈdʒɔɪ/"],
      "ever": ["/ˈev.ər/", "/ˈev.ɚ/"], "flops": ["/flɒps/", "/flɑːps/"], "for": ["/fə/", "/fɚ/"], "gardening": ["/ˈɡɑː.dən.ɪŋ/", "/ˈɡɑːr.dən.ɪŋ/"],
      "george": ["/dʒɔːdʒ/", "/dʒɔːrdʒ/"], "have": ["/həv/", "/həv/"], "here": ["/hɪər/", "/hɪr/"], "how": ["/haʊ/", "/haʊ/"],
      "i": ["/aɪ/", "/aɪ/"], "i'm": ["/aɪm/", "/aɪm/"], "i've": ["/aɪv/", "/aɪv/"], "ice": ["/aɪs/", "/aɪs/"],
      "if": ["/ɪf/", "/ɪf/"], "in": ["/ɪn/", "/ɪn/"], "is": ["/ɪz/", "/ɪz/"], "isn't": ["/ˈɪz.ənt/", "/ˈɪz.ənt/"],
      "it": ["/ɪt/", "/ɪt/"], "know": ["/nəʊ/", "/noʊ/"], "like": ["/laɪk/", "/laɪk/"], "long": ["/lɒŋ/", "/lɑːŋ/"],
      "love": ["/lʌv/", "/lʌv/"], "me": ["/miː/", "/miː/"], "moon": ["/muːn/", "/muːn/"], "most": ["/məʊst/", "/moʊst/"],
      "my": ["/maɪ/", "/maɪ/"], "near": ["/nɪər/", "/nɪr/"], "never": ["/ˈnev.ər/", "/ˈnev.ɚ/"], "night": ["/naɪt/", "/naɪt/"],
      "not": ["/nɒt/", "/nɑːt/"], "occasionally": ["/əˈkeɪ.ʒən.əl.i/", "/əˈkeɪ.ʒən.əl.i/"], "of": ["/əv/", "/əv/"], "often": ["/ˈɒf.ən/", "/ˈɑː.fən/"],
      "on": ["/ɒn/", "/ɑːn/"], "or": ["/ɔː/", "/ɔːr/"], "out": ["/aʊt/", "/aʊt/"], "piece": ["/piːs/", "/piːs/"],
      "pinsk": ["/pɪnsk/", "/pɪnsk/"], "plans": ["/plænz/", "/plænz/"], "quite": ["/kwaɪt/", "/kwaɪt/"], "rarely": ["/ˈreə.li/", "/ˈrer.li/"],
      "see": ["/siː/", "/siː/"], "so": ["/səʊ/", "/soʊ/"], "some": ["/sʌm/", "/sʌm/"], "stranger": ["/ˈstreɪn.dʒər/", "/ˈstreɪn.dʒɚ/"],
      "that's": ["/ðæts/", "/ðæts/"], "the": ["/ðə/", "/ðə/"], "there": ["/ðeər/", "/ðer/"], "there's": ["/ðeəz/", "/ðerz/"], "it's": ["/ɪts/", "/ɪts/"], "they": ["/ðeɪ/", "/ðeɪ/"],
      "things": ["/θɪŋz/", "/θɪŋz/"], "this": ["/ðɪs/", "/ðɪs/"], "times": ["/taɪmz/", "/taɪmz/"], "to": ["/tə/", "/tə/"],
      "to-do": ["/təˈduː/", "/təˈduː/"], "usually": ["/ˈjuː.ʒu.ə.li/", "/ˈjuː.ʒu.ə.li/"], "way": ["/weɪ/", "/weɪ/"], "what": ["/wɒt/", "/wɑːt/"],
      "when": ["/wen/", "/wen/"], "you": ["/juː/", "/juː/"], "your": ["/jɔː/", "/jʊr/"], "3": ["/θriː/", "/θriː/"], "5": ["/faɪv/", "/faɪv/"]
    };
    function ipaText(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      return text.charAt(0) === "/" ? text : "/" + text + "/";
    }
    function ipaNorm(value) {
      return String(value || "").toLowerCase().replace(/[’‘]/g, "'").replace(/…/g, " ").replace(/[()]/g, " ").replace(/[?.!,]/g, " ").replace(/\s+/g, " ").trim();
    }
    function ipaBare(value) {
      return ipaText(value).replace(/^\/|\/$/g, "");
    }
    function ipaBank() {
      if (ipaBank.cache) return ipaBank.cache;
      const map = {};
      function put(en, uk, us) {
        const key = ipaNorm(en);
        const left = ipaText(uk);
        const right = ipaText(us);
        if (!key || (!left && !right)) return;
        map[key] = { uk: left || right, us: right || left };
      }
      [words, extraWords, lines21, ask07, phrases09, adverbs14, talk16, likes23, phrasalWords, idiomWords].forEach((list) => {
        (list || []).forEach((item) => put(item.en, item.uk, item.us));
      });
      Object.keys(IPA_WORD).forEach((key) => put(key, IPA_WORD[key][0], IPA_WORD[key][1]));
      Object.keys(window.VERB_IPA || {}).forEach((key) => put(key, window.VERB_IPA[key][0], window.VERB_IPA[key][1]));
      ipaBank.cache = map;
      return map;
    }
    function buildPhraseIpa(text) {
      const bank = ipaBank();
      const whole = ipaNorm(String(text || "").replace(/\//g, " or "));
      if (bank[whole]) return bank[whole];
      const tokens = whole.split(" ").filter(Boolean);
      if (!tokens.length) return null;
      const uk = [];
      const us = [];
      for (let i = 0; i < tokens.length; i++) {
        const hit = bank[tokens[i]];
        if (!hit) return null;
        uk.push(ipaBare(hit.uk));
        us.push(ipaBare(hit.us));
      }
      return { uk: "/" + uk.join(" ") + "/", us: "/" + us.join(" ") + "/" };
    }
    function spokenOf(source) {
      if (!source) return "";
      return String(source.en || source.word || "").trim();
    }
    function ipaPair(source) {
      const data = (source && source.data) || {};
      const cam = data.cambridge || {};
      const wh = data.wooordhunt || {};
      let uk = ipaText((source && source.uk) || cam.uk || wh.uk || data.uk || "");
      let us = ipaText((source && source.us) || cam.us || wh.us || data.us || "");
      if (!uk || !us) {
        const built = buildPhraseIpa(spokenOf(source));
        if (built) {
          if (!uk) uk = built.uk;
          if (!us) us = built.us;
        }
      }
      return { uk: uk, us: us };
    }
    function saySide(label, region, ipa, say) {
      if (!ipa && !say) return "";
      return '<span class="say-side"><b>' + label + '</b><span class="say" role="button" data-say="' + region + '" data-say-text="' + esc(say) + '" title="Play ' + label + '">' + SAY_ICON + '</span>' +
        (ipa ? '<span class="say-ipa">' + esc(ipa) + "</span>" : "") + "</span>";
    }
    function ipaHtml(source) {
      const pair = ipaPair(source);
      const say = spokenOf(source);
      if (!pair.uk && !pair.us && !say) return "";
      return '<div class="ipa">' + saySide("UK", "uk", pair.uk, say) + saySide("US", "us", pair.us, say) + "</div>";
    }
    function speakable(text) {
      return String(text || "").replace(/…/g, "").replace(/\//g, " or ").replace(/\\/g, " ").replace(/\s+/g, " ").trim();
    }
    function speakRegion(text, region) {
      const raw = speakable(text);
      if (!raw || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(raw);
      const want = region === "uk" ? "en-GB" : "en-US";
      utter.lang = want;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((item) => String(item.lang || "").toLowerCase().replace("_", "-").indexOf(want.toLowerCase()) === 0)
        || voices.find((item) => /^en/i.test(item.lang || ""));
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
    }
    function dressWords(root) {
      let learned = new Set();
      try { learned = new Set(JSON.parse(localStorage.getItem("enquiz-learned") || "[]")); }
      catch (e) { learned = new Set(); }
      (root || document).querySelectorAll(".wcard").forEach((card) => {
        const en = card.querySelector(".en");
        if (en && learned.has(String(en.textContent || "").trim().toLowerCase())) card.classList.add("is-learned");
        if (card.querySelector(".pic")) return;
        if (!en) return;
        card.insertAdjacentHTML("afterbegin", wordPic(en.textContent));
      });
    }
    function oxfordUrl(word) {
      const slug = String(word || "").trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return "https://www.oxfordlearnersdictionaries.com/definition/english/" + (slug || "word");
    }
    function wooUrl(word) {
      let text = String(word || "").trim().toLowerCase().replace(/’/g, "'");
      if (text === "won't") text = "will";
      return "https://wooordhunt.ru/word/" + text.replace(/\s+/g, "_");
    }
    function cardLinks(word, cambridge) {
      return foldedLinkHtml([["Cambridge", cambridge], ["Oxford", oxfordUrl(word)], ["Wooordhunt", wooUrl(word)]]);
    }
    function clipLinks(query) {
      const q = String(query || "").trim();
      if (!q) return "";
      const you = "https://youglish.com/pronounce/" + encodeURIComponent(q) + "/english";
      const play = "https://www.playphrase.me/#/search?q=" + encodeURIComponent(q);
      return '<a href="' + play + '" target="_blank" rel="noreferrer">PlayPhrase</a> · <a href="' + you + '" target="_blank" rel="noreferrer">YouGlish</a>';
    }
    const CLIP_QUERY = {
      "what/how about you?": "What about you",
      "i'm george, by the way": "by the way",
      "do you know if there's a cafe near here?": "a cafe near here",
      "do you mind if i charge my phone here?": "charge my phone",
      "it's a lovely day, isn't it?": "It's a lovely day",
      "ok, nice to meet you.": "nice to meet you",
      "do you mind if i take this chair?": "take this chair",
      "do you know if there is an atm near here?": "an ATM near here",
      "go on a trip to pinsk": "go on a trip",
      "i prefer … to …": "I prefer"
    };
    function clipKey(text) {
      return String(text || "").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
    }
    function tidyClip(text) {
      return String(text || "")
        .replace(/[’‘]/g, "'")
        .replace(/\([^)]*\)/g, " ")
        .replace(/[…]/g, " ")
        .replace(/[?!.,:;"\\/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function clipOf(w) {
      if (!w) return "";
      if (w.clip) return w.clip;
      const key = clipKey(w.en);
      if (CLIP_QUERY[key]) return CLIP_QUERY[key];
      let raw = String(w.en || "").replace(/[’‘]/g, "'").trim();
      if (raw.indexOf("/") >= 0) raw = raw.split("/")[0].trim();
      const en = tidyClip(raw);
      const enWords = en ? en.split(" ") : [];
      if (enWords.length >= 2 && enWords.length <= 6) return en;
      const ex = tidyClip(w.ex);
      const exWords = ex ? ex.split(" ") : [];
      const head = (enWords[0] || "").toLowerCase();
      if (enWords.length <= 1 && exWords.length >= 2 && exWords.length <= 6 && ex.toLowerCase().indexOf(head) >= 0) return ex;
      if (enWords.length > 6) return enWords.slice(0, 4).join(" ");
      return en;
    }
    function clipLine(query) {
      const q = String(query || "").trim();
      if (!q) return "";
      return '<div class="clips"><span class="pre">Pronunciation</span>' + clipLinks(q) + '<span class="hint">' + esc(q) + "</span></div>";
    }
    function cardDeck(w) {
      if (w && ask07.some((item) => item.en === w.en)) return ask07;
      if (w && extraWords.some((item) => item.en === w.en)) {
        const lesson = extraWords.find((item) => item.en === w.en).lesson;
        return extraWords.filter((item) => item.lesson === lesson);
      }
      if (w && lines21.some((item) => item.en === w.en)) return lines21;
      if (w && likes23.some((item) => item.en === w.en)) return likes23;
      if (w && talk16.some((item) => item.en === w.en)) return talk16;
      if (w && adverbs14.some((item) => item.en === w.en)) return adverbs14;
      if (w && phrases09.some((item) => item.en === w.en)) return phrases09;
      if (w && w.deck === "phrasal") return phrasalWords;
      if (w && w.deck === "idioms") return idiomWords;
      return words;
    }
    function syncDayFlipNext() {
      const btn = document.getElementById("dayFlipNext");
      if (!btn || !current) return;
      const deck = cardDeck(current);
      const index = deck.findIndex((item) => item.en === current.en);
      const more = index >= 0 && index + 1 < deck.length;
      btn.disabled = !more;
      btn.textContent = more ? "Next" : "Last word";
    }
    function renderWord(w) {
      document.getElementById("wordView").innerHTML =
        '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + w.en + '</p><p class="pos">' + w.pos + '</p></div></div>' +
        ipaHtml(w) +
        (w.level ? '<p><span class="level">' + w.level + '</span></p>' : '') +
        (w.ru ? '<p><b>' + w.ru + '</b></p>' : '') + variantLines(w.en) + variantForm(w.en, "word", w.ru) +
        clipLine(clipOf(w)) +
        (meaningOf(w) ? '<p>' + meaningOf(w) + '</p>' : '') +
        (w.ru ? '' : '<p class="hint">No Russian translation on this slide.</p>') +
        (w.ex ? '<p>' + (w.deck ? '' : 'From the lesson: ') + w.ex + '</p>' : '') +
        "<p>" + cardLinks(w.en, w.url) + "</p>" +
        catalogEditHtml(w) +
        '<div class="row" style="margin-top:12px"><button class="btn" type="button" id="toDayFlip">Flip this card</button><button class="btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button>' +
        (w.deck
          ? '<button class="btn primary" type="button" data-deck-study="' + w.deck + '">Study</button>'
          : '<button class="btn primary" type="button" data-day-quiz="' + (w.quiz || { "7 Sep": "lesson-07", "9 Sep": "lesson-09", "14 Sep": "lesson-14", "16 Sep": "lesson-16", "21 Sep": "lesson-21", "23 Sep": "lesson-23" }[w.lesson] || "lesson-21") + '">This day\'s quiz</button>') +
        '</div>';
      document.getElementById("toDayFlip").onclick = () => { setDayFlip(w, false); visit("dayflip"); };
      const wordBack = document.querySelector("#word [data-nav-back]");
      if (wordBack) wordBack.dataset.fallback = w.deck || "lesson";
    }
    function setDayFlip(w, open) {
      current = w;
      dayFlipped = open;
      const face = document.getElementById("dayFlipFace");
      const back = document.getElementById("dayFlipBack");
      const scene = document.getElementById("dayFlipScene");
      const btn = document.getElementById("dayFlipBtn");
      const frontHtml = '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + w.en + '</p><p class="pos">' + w.pos + '</p></div></div>';
      const backHtml = '<p class="entry">' + (w.ru || w.gloss || "No Russian translation on this slide.") + '</p>' + variantLines(w.en) + '<p class="pos">' + w.en + ' · ' + w.pos + '</p>' + ipaHtml(w) + (w.ex ? '<p>' + w.ex + '</p>' : '') + '<p>' + cardLinks(w.en, w.url) + '</p>' + clipLine(clipOf(w)) + '<div class="row"><button class="btn primary" type="button">Knew</button><button class="btn" type="button">Didn\'t know</button><button class="btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button></div>';
      if (face && back && scene) {
        face.innerHTML = frontHtml;
        back.innerHTML = backHtml;
        scene.classList.toggle("is-flipped", !!open);
      } else if (face) {
        face.innerHTML = open ? backHtml : frontHtml;
      }
      if (btn) btn.textContent = open ? "Card front" : "Flip";
      syncDayFlipNext();
    }
    const phrasalWords = window.LESSON_DATA.phrasalWords;
    const idiomWords = window.LESSON_DATA.idiomWords;

    function paintExampleGrid(id, list, attr) {
      const box = document.getElementById(id);
      if (!box) return;
      box.innerHTML = list.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-' + attr + '="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' +
        ipaHtml(w) +
        '<div class="label">' + esc(w.ru) + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintWordGrid() {
      document.getElementById("wordGrid").innerHTML = words.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-i="' + i + '"><div class="en">' + w.en + '</div><div class="pos">' + w.pos + '</div>' + ipaHtml(w) + '<div class="label">' + w.ru + '</div>' +
        (variantsOf(w.en).length ? '<div class="hint">You added a variant</div>' : "") + '</button>'
      ).join("");
      dressWords(document.getElementById("wordGrid"));
    }
    function paintPhraseGrid() {
      const box = document.getElementById("phraseGrid");
      if (!box) return;
      box.innerHTML = phrases09.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-phrase="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || w.gloss || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintAdverbGrid() {
      const box = document.getElementById("adverbGrid");
      if (!box) return;
      box.innerHTML = adverbs14.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-adv="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || w.gloss || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintTalkGrid() {
      const box = document.getElementById("talkGrid");
      if (!box) return;
      box.innerHTML = talk16.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-talk="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || w.gloss || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintLikeGrid() {
      const box = document.getElementById("likeGrid");
      if (!box) return;
      box.innerHTML = likes23.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-like="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || w.gloss || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintAskGrid() {
      const box = document.getElementById("askGrid");
      if (!box) return;
      box.innerHTML = ask07.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-ask="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
      const clips = document.getElementById("askClips");
      if (clips) clips.innerHTML = ask07.filter(cardVisible).map((w) =>
        '<div class="clips"><b>' + esc(w.en) + "</b>" + clipLinks(clipOf(w)) + "</div>"
      ).join("");
    }
    function paintLineGrid() {
      const box = document.getElementById("lineGrid");
      if (!box) return;
      box.innerHTML = lines21.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-line="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru || "From the lesson") + "</div></button>"
      ).join("");
      dressWords(box);
    }
    const EDIT_KEY = "enquiz-card-edits";
    function sessionIsDeveloper() { return !!(authUser && authUser.role === "DEVELOPER"); }
    function hideStudentSongs() {
      return !!(viewAccount && authUser && authUser.role === "ADMIN");
    }
    function isTeacher() {
      if (hideStudentSongs()) return true;
      if (viewAccount) return viewAccount.role === "ADMIN";
      return !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
    }
    function isDeveloper() {
      if (viewAccount) return false;
      return sessionIsDeveloper();
    }
    function faceUser() {
      if (!viewAccount) return authUser;
      return {
        login: viewAccount.login || "",
        email: viewAccount.email || "",
        name: viewAccount.name || "",
        role: viewAccount.role === "ADMIN" ? "ADMIN" : "USER"
      };
    }
    function roleLabel(role) {
      if (role === "DEVELOPER") return isDeveloper() ? "Developer" : "";
      if (role === "ADMIN") return "Teacher";
      return "Student";
    }
    function loadEdits() {
      try { return JSON.parse(localStorage.getItem(EDIT_KEY) || "{}") || {}; }
      catch (e) { return {}; }
    }
    function saveEdits(map, id) {
      localStorage.setItem(EDIT_KEY, JSON.stringify(map));
      if (id) syncChange({ op: "put-edit", id: id, edit: map[id] });
    }
    function lessonBanks() {
      return [words, lines21, phrases09, adverbs14, talk16, likes23, ask07, extraWords, phrasalWords, idiomWords];
    }
    function cardVisible(card) {
      return !!(card && !card.deleted);
    }
    function applyEditToCard(card, edit) {
      if (!card) return;
      card.deleted = !!(edit && edit.deleted);
      if (card.base != null && card.past != null) {
        if (!card.original) card.original = { base: card.base, past: card.past, pp: card.pp, ru: card.ru };
        card.base = card.original.base;
        card.past = card.original.past;
        card.pp = card.original.pp;
        card.ru = card.original.ru;
        if (!edit) return;
        if (edit.base) card.base = edit.base;
        if (edit.past) card.past = edit.past;
        if (edit.pp) card.pp = edit.pp;
        if (edit.ru != null) card.ru = edit.ru;
        return;
      }
      if (!card.original) card.original = { en: card.en, ru: card.ru };
      card.en = card.original.en;
      card.ru = card.original.ru;
      if (card.deleted || !edit) return;
      if (edit.en) card.en = edit.en;
      if (edit.ru != null) card.ru = edit.ru;
    }
    function applyLessonEdits() {
      const map = loadEdits();
      lessonBanks().forEach((list) => {
        list.forEach((card) => {
          if (!card.origin) card.origin = String(card.en || "").toLowerCase();
          applyEditToCard(card, map[card.origin]);
        });
      });
      (window.IRREGULAR || []).forEach((card) => {
        if (!card.origin) card.origin = String(card.base || "").toLowerCase();
        applyEditToCard(card, map[card.origin]);
      });
    }
    function actionIcon(paths) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>";
    }
    function editActions() {
      const pencil = actionIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
      const trash = actionIcon('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>');
      return '<span class="edit-actions"><button class="icon-btn" type="button" data-edit-toggle aria-label="Edit">' + pencil + '</button><button class="icon-btn" type="button" data-card-delete aria-label="Delete">' + trash + "</button></span>";
    }
    function editHost(kind, id) {
      return '<div data-edit-host data-edit-kind="' + esc(kind) + '" data-edit-id="' + esc(id) + '">' + editActions() + '</div>';
    }
    function catalogEditHtml(card) {
      if (!isTeacher() || !card) return "";
      if (!card.origin) card.origin = String(card.en || card.base || "").toLowerCase();
      return editHost("card", card.origin);
    }
    function canEditAdded(item) {
      return !!item && ((item.place || "mine") === "mine" || isTeacher());
    }
    function addedEditHtml(item) {
      const index = loadAdded().indexOf(item);
      if (index < 0 || !canEditAdded(item)) return "";
      return editHost("added", String(index));
    }
    function addedRow(item, index) {
      const main = '<button class="path" type="button" data-added="' + index + '"><b>' + esc(item.word) + '</b><span class="to">' + esc(item.ru) + "</span></button>";
      if (!canEditAdded(item)) return main;
      return '<div data-edit-host data-edit-kind="added" data-edit-id="' + index + '"><div class="edit-line">' + main + editActions() + '</div></div>';
    }
    applyLessonEdits();
    paintWordGrid();
    paintExampleGrid("phrasalGrid", phrasalWords, "phrasal");
    paintExampleGrid("idiomGrid", idiomWords, "idiom");
    paintPhraseGrid();
    paintAdverbGrid();
    paintTalkGrid();
    function paintExtraGrids() {
      const ids = { "7 Sep": "extra07", "9 Sep": "extra09", "14 Sep": "extra14", "16 Sep": "extra16", "21 Sep": "extra21", "23 Sep": "extra23" };
      Object.keys(ids).forEach((lesson) => {
        const box = document.getElementById(ids[lesson]);
        if (!box) return;
        box.innerHTML = extraWords.filter((w) => w.lesson === lesson && cardVisible(w)).map((w) =>
          '<button class="wcard" type="button" data-extra="' + esc(w.en) + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru) + "</div></button>"
        ).join("");
        dressWords(box);
      });
    }
    paintLikeGrid();
    paintExtraGrids();
    paintAskGrid();
    paintLineGrid();
    dressWords(document);
    document.getElementById("wordGrid").onclick = (e) => {
      const btn = e.target.closest("[data-i]");
      if (!btn) return;
      current = words[Number(btn.dataset.i)];
      renderWord(current);
      visit("word");
    };
    document.getElementById("rules").dataset.lang = "en";
    document.getElementById("ruleList").innerHTML = rules.map((r) =>
      '<div class="rule"><b class="ru">' + r.title.ru + '</b><b class="en">' + r.title.en + '</b><div class="ru">' + r.body.ru + '</div><div class="en">' + r.body.en + '</div><p>' +
      foldedLinkHtml(r.links) + '</p></div>'
    ).join("");
    document.getElementById("ruleLang").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-rule-lang]");
      if (!btn) return;
      document.getElementById("rules").dataset.lang = btn.dataset.ruleLang;
      document.querySelectorAll("#ruleLang .chip").forEach((b) => b.classList.toggle("on", b === btn));
    });
    document.getElementById("guideLang").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-guide-lang]");
      if (!btn) return;
      document.getElementById("guide").dataset.lang = btn.dataset.guideLang;
      document.querySelectorAll("#guideLang .chip").forEach((b) => b.classList.toggle("on", b === btn));
    });
    document.getElementById("dayFlipBtn").onclick = () => setDayFlip(current, !dayFlipped);
    const dayFlipScene = document.getElementById("dayFlipScene");
    if (dayFlipScene) {
      dayFlipScene.addEventListener("click", (e) => {
        if (e.target.closest("a, button")) return;
        document.getElementById("dayFlipBtn").click();
      });
      dayFlipScene.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        document.getElementById("dayFlipBtn").click();
      });
    }
    document.getElementById("dayFlipNext").onclick = () => {
      const deck = cardDeck(current);
      const index = deck.findIndex((item) => item.en === current.en);
      if (index < 0 || index + 1 >= deck.length) return;
      setDayFlip(deck[index + 1], false);
    };
    renderWord(words[0]);
    document.querySelectorAll("#daychoice .opt").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll("#daychoice .opt").forEach((o) => o.classList.remove("ok", "bad"));
        const good = btn.dataset.ok === "1";
        btn.classList.add(good ? "ok" : "bad");
        if (!good) document.querySelector('#daychoice [data-ok="1"]').classList.add("ok");
        document.getElementById("dayChoiceFb").innerHTML = '<div class="feedback ' + (good ? "ok" : "bad") + '">' + (good ? "Correct" : "Incorrect. It's humid.") + '</div>';
      };
    });
    document.getElementById("judgeYes").onclick = () => {
      document.getElementById("judgeFb").innerHTML = '<div class="feedback bad">Incorrect. It should be: You\'re keen on learning English.<br>Неверно. Нужно: You\'re keen on learning English.</div>';
    };
    document.getElementById("judgeNo").onclick = () => {
      document.getElementById("judgeFb").innerHTML = '<div class="feedback ok">Correct, the line has an error. It needs learning.<br>Верно, во фразе ошибка. Нужно learning.</div>';
    };

    const songCards = window.LESSON_DATA.songCards;

    let songKey = "moonlight";
    function renderSong(key) {
      songKey = key;
      const w = songCards[key];
      document.getElementById("musicTitle").textContent = w.en;
      document.getElementById("musicView").innerHTML =
        '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + w.en + '</p><p class="pos">' + w.pos + '</p></div></div>' +
        ipaHtml(w) +
        (w.level ? '<p><span class="level">' + w.level + '</span></p>' : '') +
        '<p><b>' + w.ru + '</b></p>' + variantLines(w.en) + variantForm(w.en, "song", w.ru) + clipLine(clipOf({ en: w.en, ex: w.ex })) + '<p>In the line: ' + w.ex + '</p>' +
        "<p>" + cardLinks(w.en, w.url) + "</p>" +
        '<p class="hint">This card is not in the decks or the lesson days, so it lives only in Song lyrics.</p>' +
        catalogEditHtml(w) +
        '<div class="row" style="margin-top:12px"><button class="btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button></div>';
    }
    function applySongEdits() {
      const map = loadEdits();
      Object.keys(songCards).forEach((key) => {
        const card = songCards[key];
        if (!card.origin) card.origin = String(card.en || "").toLowerCase();
        applyEditToCard(card, map[card.origin]);
      });
      document.querySelectorAll("[data-song]").forEach((btn) => {
        const card = songCards[btn.dataset.song];
        if (!card) return;
        const en = btn.querySelector(".en");
        const label = btn.querySelector(".label");
        if (en) en.textContent = card.en;
        if (label) label.textContent = card.ru;
      });
    }
    function findCatalog(origin) {
      const key = String(origin || "").toLowerCase();
      const banks = lessonBanks();
      for (let i = 0; i < banks.length; i++) {
        const found = banks[i].find((card) => card.origin === key || String(card.en || "").toLowerCase() === key);
        if (found) return found;
      }
      const song = Object.keys(songCards).map((name) => songCards[name]).find((card) => card.origin === key || String(card.en || "").toLowerCase() === key);
      if (song) return song;
      return (window.IRREGULAR || []).find((card) => card.origin === key || String(card.base || "").toLowerCase() === key) || null;
    }
    applySongEdits();
    document.querySelectorAll("[data-song]").forEach((btn) => {
      btn.addEventListener("click", () => renderSong(btn.dataset.song));
    });

    const ADDED_KEY = "enquiz-added";
    function midTitle(text) {
      const raw = String(text || "").trim();
      if (!raw) return raw;
      const plain = raw.replace(/[’‘]/g, "'");
      if (/[.!?…]$/.test(plain) || /\.\.\.$/.test(plain)) return raw;
      if (/\b(?:about|when|on|to|into|of|for)$/i.test(plain)) return raw;
      const words = plain.split(/\s+/);
      if (words.length >= 2) {
        const first = words[0].toLowerCase().replace(/[^a-z']/g, "");
        const starters = { "i": 1, "i'm": 1, "i've": 1, "i'd": 1, "it's": 1, "that's": 1, "they": 1, "they're": 1, "we": 1, "you": 1, "he": 1, "she": 1, "do": 1, "does": 1, "did": 1, "is": 1, "are": 1, "am": 1, "can": 1, "could": 1, "would": 1, "what": 1, "how": 1, "and": 1, "see": 1, "help": 1, "go": 1, "be": 1, "not": 1, "ok": 1, "have": 1, "nice": 1, "excuse": 1, "let": 1 };
        if (starters[first]) return raw;
      }
      if (plain === "I") return raw;
      if (/^[A-Z]{2,}(?:\s+[A-Z]{2,})*$/.test(plain)) return raw;
      return raw.charAt(0).toLowerCase() + raw.slice(1);
    }
    function rememberAdded(list) {
      addedCache = list;
      const raw = JSON.stringify(list);
      try {
        localStorage.setItem(ADDED_KEY, raw);
      } catch (e) {
        idbPutAdded(list);
        try { localStorage.removeItem(ADDED_KEY); } catch (err) {}
      }
    }
    function loadAdded() {
      try {
        const list = addedCache || JSON.parse(localStorage.getItem(ADDED_KEY) || "[]");
        let moved = false;
        list.forEach((item) => {
          if (!item) return;
          if (item.place === "lesson-11") {
            item.place = "lesson-09";
            moved = true;
          }
          if (item.word) {
            const next = midTitle(item.word);
            if (next !== item.word) {
              item.word = next;
              moved = true;
            }
          }
        });
        addedCache = list;
        if (moved) rememberAdded(list);
        return list;
      } catch (e) { return addedCache || []; }
    }
    function saveAdded(list, change) {
      rememberAdded(list);
      if (change) syncChange(change);
      if (typeof paintHomeStats === "function") paintHomeStats();
    }
    function esc(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[ch]));
    }
    const PLACE_LABEL = { "lesson-23": "23 Sep", "lesson-21": "21 Sep", "lesson-16": "16 Sep", "lesson-14": "14 Sep", "lesson-09": "9 Sep", "lesson-07": "7 Sep", music: "Song lyrics", tenses: "Grammar", mine: "My words", phrasal: "Phrasal verbs", idioms: "Idioms" };
    function cardOrigin(item) {
      try {
        if (!item || (item.place !== "phrasal" && item.place !== "idioms")) return "";
        const title = String(item.fromSong || songTitleFor(item.word) || "").trim();
        return title ? "Song lyrics · " + title : "";
      } catch (e) {
        return "";
      }
    }
    function expressionNote(item) {
      return item && item.data && item.data.grammar && item.data.grammar.note ? String(item.data.grammar.note) : "";
    }
    function addedCard(item, index) {
      let pos = item.data && item.data.cambridge && item.data.cambridge.pos ? item.data.cambridge.pos : "added";
      if (item.fromText) pos = item.expressionType === "PHRASAL_VERB" ? "phrasal verb" : item.expressionType === "IDIOM" ? "idiom" : "expression";
      const origin = cardOrigin(item);
      const label = item.ru || expressionNote(item);
      return '<button class="wcard" type="button" data-added="' + index + '">' + wordPic(item.word) + '<div class="en">' + esc(item.word) + '</div><div class="pos">' + esc(pos) + '</div>' + ipaHtml(item) + '<div class="label">' + esc(label) + "</div>" + (origin ? '<div class="label">' + esc(origin) + "</div>" : "") + "</button>";
    }
    function paintPlace(place, boxId, labelId) {
      const box = document.getElementById(boxId);
      if (!box) return;
      const list = loadAdded();
      const html = list.map((item, index) => (item.place || "mine") === place ? addedCard(item, index) : "").join("");
      box.innerHTML = html;
      if (labelId) {
        const label = document.getElementById(labelId);
        if (label) label.hidden = !html;
      }
      if (boxId === "lesson07Added") {
        const empty = document.getElementById("lesson07Empty");
        if (empty) empty.hidden = !!html;
      }
    }
    function paintAdded() {
      paintPlace("lesson-21", "lessonAdded", "lessonAddedLabel");
      paintPlace("lesson-23", "lesson23Added", "lesson23AddedLabel");
      paintPlace("lesson-16", "lesson16Added", "lesson16AddedLabel");
      paintPlace("lesson-14", "lesson14Added", "lesson14AddedLabel");
      paintPlace("lesson-09", "lesson09Added", "lesson09AddedLabel");
      paintPlace("lesson-07", "lesson07Added");
      paintPlace("music", "musicAdded");
      paintPlace("tenses", "tenseAdded");
      paintPlace("phrasal", "phrasalAdded");
      paintPlace("idioms", "idiomAdded");
      paintDeckCounts();
      paintLessonChips();
      renderAddedList();
      paintAllWords();
      applyCardSearches();
    }
    function searchHit(text, q) {
      return String(text || "").toLowerCase().indexOf(q) >= 0;
    }
    function fillCardSearch(section, q) {
      if (section.id === "allwords") {
        const rows = allSearchRows().filter((row) => searchHit(row.en, q) || searchHit(row.ru, q) || searchHit((row.where || []).join(" "), q));
        document.getElementById("allWordGrid").innerHTML = rows.length ? rows.map(statRow).join("") : '<p class="hint">No cards</p>';
        return true;
      }
      if (section.id === "cardstat") {
        const rows = statRows().filter((row) => searchHit(row.en, q) || searchHit(row.ru, q) || searchHit((row.where || []).join(" "), q));
        document.getElementById("cardStatList").innerHTML = rows.length ? rows.map(statRow).join("") : '<p class="hint">No cards</p>';
        return true;
      }
      if (section.id === "add") {
        const rows = addSearchRows().filter((row) => searchHit(row.item.word, q) || searchHit(row.item.ru, q));
        document.getElementById("addedList").innerHTML = rows.length ? rows.map(({ item, index }) => addedRow(item, index)).join("") : '<p class="hint">No cards</p>';
        return true;
      }
      if (section.id === "verbs" && !verbKey) {
        const pool = (window.IRREGULAR || []).filter((v) => cardVisible(v) && (!verbGroup || v.level === verbGroup));
        const rows = pool.filter((v) => searchHit(v.base, q) || searchHit(v.past, q) || searchHit(v.pp, q) || searchHit(verbMeaning(v), q));
        document.getElementById("verbList").innerHTML = rows.length ? rows.map((v) =>
          '<button class="path" type="button" data-verb="' + esc(v.base) + '"><span><b>' + esc(v.base) + '</b><br><span class="label">' + esc(v.past) + " · " + esc(v.pp) + '</span></span><span class="to">' + esc(verbMeaning(v)) + "</span></button>"
        ).join("") : '<p class="hint">No cards</p>';
        return true;
      }
      if (section.id === "music") {
        const named = [];
        const inText = [];
        songCatalog().forEach((song) => {
          if (searchHit(song.title, q) || searchHit(song.artist, q)) named.push(song);
          else if (searchHit(song.lyrics, q) || [...song.keys].some((key) => searchHit(key, q))) inText.push(song);
        });
        const rows = named.concat(inText);
        document.getElementById("lyricList").innerHTML = rows.length ? rows.map((song) => {
          const attrs = song.id === "sample" ? 'data-jump="song"' : 'data-lyric="' + esc(song.id) + '"';
          return songRow(song.number, song.title, song.artist, [...song.keys].length + " words", attrs);
        }).join("") : '<p class="hint">No songs</p>';
        return true;
      }
      return false;
    }
    function applyCardSearch(section) {
      if (!section) return;
      const input = section.querySelector("[data-card-search]");
      if (!input) return;
      const q = input.value.trim().toLowerCase();
      if (q && fillCardSearch(section, q)) return;
      section.querySelectorAll(".wcard, .path, .day, .g-topic, .g-area, .tense, #verbList > .card").forEach((el) => {
        if (el.contains(input)) return;
        el.hidden = !!q && el.textContent.toLowerCase().indexOf(q) < 0;
      });
    }
    function applyCardSearches() {
      document.querySelectorAll("[data-card-search]").forEach((input) => applyCardSearch(input.closest("section")));
    }
    function collectCards() {
      const rows = [];
      const seen = {};
      function add(en, ru, where, kind, key) {
        const id = String(en || "").trim().toLowerCase();
        if (!id) return;
        if (seen[id]) {
          if (seen[id].where.indexOf(where) < 0) seen[id].where.push(where);
          return;
        }
        const row = { en: en, ru: ru, where: [where], kind: kind, key: key };
        seen[id] = row;
        rows.push(row);
      }
      ask07.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "7 Sep", "ask", w.en); });
      words.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "21 Sep", "word", w.en); });
      lines21.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "21 Sep", "line", w.en); });
      phrases09.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "9 Sep", "phrase", w.en); });
      adverbs14.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "14 Sep", "adverb", w.en); });
      talk16.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "16 Sep", "talk", w.en); });
      likes23.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "23 Sep", "like", w.en); });
      extraWords.forEach((w) => {
        if (!cardVisible(w)) return;
        add(w.en, w.ru, "Additional word", "extra", w.en);
        add(w.en, w.ru, w.lesson, "extra", w.en);
      });
      if (!hideStudentSongs()) Object.keys(songCards).forEach((key) => { if (cardVisible(songCards[key])) add(songCards[key].en, songCards[key].ru, "Song lyrics", "song", key); });
      add("give up", "сдаваться, бросать", "deck", "deck", "give up");
      loadAdded().forEach((item) => {
        if (hideStudentSongs() && (item.place || "mine") === "music") return;
        add(item.word, item.ru, PLACE_LABEL[item.place] || "My words", "added", item.word);
      });
      rows.sort((a, b) => a.en.localeCompare(b.en));
      return rows;
    }
    function sourceName(row) {
      if (row.kind === "extra") return "Additional words";
      const where = row.where || [];
      if (where.indexOf("7 Sep") >= 0) return "7 Sep";
      if (where.indexOf("9 Sep") >= 0) return "9 Sep";
      if (where.indexOf("14 Sep") >= 0) return "14 Sep";
      if (where.indexOf("16 Sep") >= 0) return "16 Sep";
      if (where.indexOf("21 Sep") >= 0) return "21 Sep";
      if (where.indexOf("23 Sep") >= 0) return "23 Sep";
      return where[0] || "Cards";
    }
    function isLessonSource(name) {
      return name === "7 Sep" || name === "9 Sep" || name === "14 Sep" || name === "16 Sep" || name === "21 Sep" || name === "23 Sep";
    }
    function sourceRank(name) {
      if (name === "7 Sep") return 0;
      if (name === "9 Sep") return 1;
      if (name === "14 Sep") return 2;
      if (name === "16 Sep") return 3;
      if (name === "21 Sep") return 4;
      if (name === "23 Sep") return 5;
      if (name === "Additional words") return 5.5;
      if (name === "Grammar") return 6;
      if (name === "Song lyrics") return 7;
      if (name === "My words") return 8;
      if (name === "Phrasal verbs") return 8.2;
      if (name === "Idioms") return 8.4;
      return 9;
    }
    function lessonOrder(row) {
      if (row.kind === "word") {
        const index = words.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "phrase") {
        const index = phrases09.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "adverb") {
        const index = adverbs14.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "talk") {
        const index = talk16.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "like") {
        const index = likes23.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "ask") {
        const index = ask07.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "line") {
        const index = lines21.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return index;
      }
      if (row.kind === "extra") {
        const index = extraWords.findIndex((item) => String(item.en).toLowerCase() === String(row.en).toLowerCase());
        if (index >= 0) return 2000 + index;
      }
      const added = loadAdded();
      const saved = added.findIndex((item) => String(item.word).toLowerCase() === String(row.en).toLowerCase() && (item.place === "lesson-21" || item.place === "lesson-07" || item.place === "lesson-16" || item.place === "lesson-23"));
      if (saved >= 0) return 1000 + saved;
      return 5000;
    }
    function byLesson(a, b) {
      const rank = sourceRank(sourceName(a)) - sourceRank(sourceName(b));
      if (rank) return rank;
      if (isLessonSource(sourceName(a))) {
        const order = lessonOrder(a) - lessonOrder(b);
        if (order) return order;
      }
      return a.en.localeCompare(b.en);
    }
    function homeBuckets(rows) {
      const learnedIds = loadLearned();
      const learned = rows.filter((row) => learnedIds.has(String(row.en).toLowerCase()));
      const learning = rows.filter((row) => !learnedIds.has(String(row.en).toLowerCase()));
      return { learned: learned.sort(byLesson), weak: [], learning: learning.sort(byLesson) };
    }
    function statRow(row) {
      return '<button class="path" type="button" data-all-kind="' + row.kind + '" data-all-key="' + esc(row.key) + '"><span><b>' + esc(row.en) + '</b>' + ipaHtml(rowToCard(row)) + '<br><span class="label">' + esc(row.ru) + '</span></span><span class="to">' + esc(row.where.join(" · ")) + "</span></button>";
    }
    function keysOfMarks(marks) {
      const set = new Set();
      Object.keys(marks || {}).forEach((key) => {
        set.add(String(key).toLowerCase());
        const word = marks[key] && marks[key].word;
        if (word) set.add(String(word).toLowerCase());
      });
      return set;
    }
    function songCatalog() {
      const songs = [];
      visibleSongs().forEach((song, index) => {
        songs.push({ id: song.id, number: index + 1, title: song.title || "Song", artist: song.artist || "", lyrics: song.lyrics || "", keys: keysOfMarks(song.marks) });
      });
      return songs;
    }
    function rowInKeys(row, keys) {
      return keys.has(String(row.en || "").toLowerCase()) || keys.has(String(row.key || "").toLowerCase());
    }
    function addedInKeys(item, keys) {
      return keys.has(String(item.word || "").toLowerCase());
    }
    function songSlices(pool, inSong) {
      const slices = songCatalog().map((song) => ({ song: song, rows: pool.filter((row) => inSong(row, song.keys)) })).filter((item) => item.rows.length);
      const used = new Set();
      slices.forEach((item) => item.rows.forEach((row) => used.add(row)));
      const left = pool.filter((row) => !used.has(row));
      return { slices: slices, left: left };
    }
    function songGroupHtml(slices, left, attr) {
      let html = slices.map((item) => {
        const n = item.rows.length;
        return songRow(item.song.number, item.song.title, item.song.artist, n + (n === 1 ? " word" : " words"), attr + '="' + esc(item.song.id) + '"');
      }).join("");
      if (left.length) html += songRow("–", "Other words", "", left.length + (left.length === 1 ? " word" : " words"), attr + '="other"');
      return html;
    }
    function findSong(id) {
      return songCatalog().find((song) => song.id === id) || null;
    }
    function paintStat() {
      const titles = { learned: "Learned", weak: "Weak cards", learning: "Still learning" };
      const rows = (homeBuckets(studyCards())[statKind] || []).slice().sort(byLesson);
      const title = document.getElementById("cardStatTitle");
      const box = document.getElementById("cardStatList");
      if (!statGroup) {
        const map = {};
        const names = [];
        rows.forEach((row) => {
          const name = sourceName(row);
          if (!map[name]) { map[name] = []; names.push(name); }
          map[name].push(row);
        });
        names.sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
        title.textContent = (titles[statKind] || "Cards") + " · " + rows.length;
        box.innerHTML = names.map((name, index) => {
          const count = map[name].length;
          return '<button class="day active" type="button" data-stat-group="' + esc(name) + '"><span class="date">' + (index + 1) + '</span><span class="song-line"><b>' + esc(name) + '</b></span><span class="label about">' + count + (count === 1 ? " word" : " words") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const shown = rows.filter((row) => sourceName(row) === statGroup);
      if (statGroup === "Song lyrics" && !statSong) {
        const grouped = songSlices(shown, rowInKeys);
        title.textContent = "Song lyrics · " + shown.length;
        box.innerHTML = songGroupHtml(grouped.slices, grouped.left, "data-stat-song");
        applyCardSearch(box.closest("section"));
        return;
      }
      let words = shown;
      let label = statGroup;
      if (statGroup === "Song lyrics" && statSong) {
        const song = findSong(statSong);
        if (statSong === "other") {
          words = songSlices(shown, rowInKeys).left;
          label = "Other words";
        } else if (song) {
          words = shown.filter((row) => rowInKeys(row, song.keys));
          label = song.number + " " + song.title;
        }
      }
      title.textContent = label + " · " + words.length;
      box.innerHTML = words.map(statRow).join("");
      applyCardSearch(box.closest("section"));
    }
    function openStat(kind) {
      statKind = kind;
      statGroup = "";
      statSong = "";
      paintStat();
      visit("cardstat");
    }
    function openStatGroup(name) {
      pushHistory();
      statGroup = name;
      statSong = "";
      paintStat();
      show("cardstat");
    }
    function openStatSong(id) {
      pushHistory();
      statSong = id;
      paintStat();
      show("cardstat");
    }
    function allRows() {
      return collectCards().filter((row) => row.kind !== "deck").sort(byLesson);
    }
    function studyCards() {
      const base = collectCards().filter((row) => row.kind !== "added" && row.kind !== "deck");
      const added = loadAdded().filter((item) => String(item.word || "").trim()).map((item) => ({
        en: item.word,
        ru: item.ru || "",
        where: [PLACE_LABEL[item.place] || "My words"],
        kind: "added",
        key: item.word
      }));
      return base.concat(added);
    }
    function paintAllWords() {
      const rows = allRows();
      const count = document.getElementById("allWordCount");
      if (count) count.textContent = String(rows.length);
      const box = document.getElementById("allWordGrid");
      const title = document.getElementById("allWordTitle");
      const sub = document.getElementById("allWordSub");
      if (!box) return;
      if (!allGroup) {
        const map = {};
        const names = [];
        rows.forEach((row) => {
          const name = sourceName(row);
          if (!map[name]) { map[name] = []; names.push(name); }
          map[name].push(row);
        });
        names.sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
        if (title) title.textContent = "All words · " + rows.length;
        if (sub) { sub.hidden = false; sub.textContent = "Every word card, once. The line under a word shows where it lives."; }
        box.innerHTML = names.map((name, index) => {
          const n = map[name].length;
          return '<button class="day active" type="button" data-all-group="' + esc(name) + '"><span class="date">' + (index + 1) + '</span><span class="song-line"><b>' + esc(name) + '</b></span><span class="label about">' + n + (n === 1 ? " word" : " words") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const shown = rows.filter((row) => sourceName(row) === allGroup);
      if (allGroup === "Song lyrics" && !allSong) {
        const grouped = songSlices(shown, rowInKeys);
        if (title) title.textContent = "Song lyrics · " + shown.length;
        if (sub) { sub.hidden = false; sub.textContent = "By song."; }
        box.innerHTML = songGroupHtml(grouped.slices, grouped.left, "data-all-song");
        applyCardSearch(box.closest("section"));
        return;
      }
      let words = shown;
      let label = allGroup;
      if (allGroup === "Song lyrics" && allSong) {
        const song = findSong(allSong);
        if (allSong === "other") {
          words = songSlices(shown, rowInKeys).left;
          label = "Other words";
        } else if (song) {
          words = shown.filter((row) => rowInKeys(row, song.keys));
          label = song.number + " " + song.title;
        }
      }
      if (title) title.textContent = label + " · " + words.length;
      if (sub) sub.hidden = true;
      box.innerHTML = words.map(statRow).join("");
      applyCardSearch(box.closest("section"));
    }
    function openAllGroup(name) {
      pushHistory();
      allGroup = name;
      allSong = "";
      paintAllWords();
      show("allwords");
    }
    function openAllSong(id) {
      pushHistory();
      allSong = id;
      paintAllWords();
      show("allwords");
    }
    function addedPlaceName(item) {
      return PLACE_LABEL[item.place] || "My words";
    }
    function renderAddedList() {
      const list = loadAdded();
      const box = document.getElementById("addedList");
      const title = document.querySelector("#add h1");
      const groupAdd = document.getElementById("groupAdd");
      const addPlaces = { "My words": "mine", "Phrasal verbs": "phrasal", "Idioms": "idioms" };
      const addPlace = addPlaces[addGroup] || "";
      if (groupAdd) {
        groupAdd.hidden = !addPlace;
        if (addPlace) {
          groupAdd.dataset.place = addPlace;
          const addInput = groupAdd.querySelector("[data-add-input]");
          const addHint = { mine: "a word or a phrase", phrasal: "give up or сдаваться", idioms: "break the ice or начать разговор" };
          if (addInput) addInput.placeholder = addHint[addPlace];
        }
      }
      if (!box) return;
      if (!list.length) {
        box.innerHTML = "";
        if (title) title.textContent = "Add a word";
        applyCardSearch(box.closest("section"));
        return;
      }
      if (!addGroup) {
        const map = {};
        const names = [];
        list.forEach((item) => {
          const name = addedPlaceName(item);
          if (!map[name]) { map[name] = 0; names.push(name); }
          map[name] += 1;
        });
        names.sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b));
        if (title) title.textContent = "Add a word";
        box.innerHTML = names.map((name, index) => {
          const n = map[name];
          return '<button class="day active" type="button" data-add-group="' + esc(name) + '"><span class="date">' + (index + 1) + '</span><span class="song-line"><b>' + esc(name) + '</b></span><span class="label about">' + n + (n === 1 ? " word" : " words") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const shown = [];
      list.forEach((item, index) => {
        if (addedPlaceName(item) === addGroup) shown.push({ item: item, index: index });
      });
      if (addGroup === "Song lyrics" && !addSong) {
        const grouped = songSlices(shown, (row, keys) => addedInKeys(row.item, keys));
        if (title) title.textContent = "Song lyrics · " + shown.length;
        box.innerHTML = songGroupHtml(grouped.slices, grouped.left, "data-add-song");
        applyCardSearch(box.closest("section"));
        return;
      }
      let words = shown;
      let label = addGroup;
      if (addGroup === "Song lyrics" && addSong) {
        const song = findSong(addSong);
        if (addSong === "other") {
          words = songSlices(shown, (row, keys) => addedInKeys(row.item, keys)).left;
          label = "Other words";
        } else if (song) {
          words = shown.filter((row) => addedInKeys(row.item, song.keys));
          label = song.number + " " + song.title;
        }
      }
      if (title) title.textContent = label + " · " + words.length;
      box.innerHTML = words.map(({ item, index }) => addedRow(item, index)).join("");
      applyCardSearch(box.closest("section"));
    }
    function openAddGroup(name) {
      pushHistory();
      addGroup = name;
      addSong = "";
      renderAddedList();
      show("add");
    }
    function openAddSong(id) {
      pushHistory();
      addSong = id;
      renderAddedList();
      show("add");
    }
    function verbAlts(form) {
      return String(form || "").split("/").map((part) => part.trim()).filter(Boolean);
    }
    function verbPrimary(form) {
      return verbAlts(form)[0] || String(form || "");
    }
    function verbSay(verb, slot, word) {
      const key = (verb && verb.base ? verb.base : "") + "|" + slot + "|" + String(word || "").trim().toLowerCase();
      const special = (window.VERB_IPA_CASE || {})[key];
      if (special) return { en: word, uk: special[0], us: special[1] };
      return { en: word };
    }
    function verbSense(v) {
      return String(v.ru || "").split(",")[0].trim();
    }
    function verbTeach(base) {
      const rows = {
        be: {
          v1: {
            formula: "Base form / infinitive",
            uses: ["Infinitive", "Present Simple after modal verbs", "Imperative", "Other constructions where the base form is required"],
            structure: "to be · modal + be · Be + complement",
            examples: [
              { en: "I want to be a programmer.", ru: "Я хочу быть программистом." },
              { en: "You should be careful.", ru: "Тебе следует быть осторожным." },
              { en: "Be quiet, please.", ru: "Пожалуйста, будь тихим." }
            ],
            grammar: ["toinf", "bare"],
            mistakes: [{ no: "She should is careful.", yes: "She should be careful." }]
          },
          v2: {
            formula: "Past Simple of be",
            uses: ["Past Simple"],
            structure: "I / he / she / it + was. you / we / they + were.",
            differ: "I / he / she / it → was. you / we / they → were.",
            examples: [
              { en: "I was tired yesterday.", ru: "Я вчера был уставшим." },
              { en: "She was at home.", ru: "Она была дома." },
              { en: "We were in London.", ru: "Мы были в Лондоне." },
              { en: "They were happy.", ru: "Они были счастливы." }
            ],
            grammar: ["pasts"],
            mistakes: [
              { no: "You was late.", yes: "You were late." },
              { no: "She were at home.", yes: "She was at home." }
            ]
          },
          v3: {
            formula: "Past participle / Perfect",
            uses: ["Present Perfect", "Past Perfect", "Future Perfect", "Passive: been + past participle"],
            structure: "have / has / had / will have + been",
            examples: [
              { en: "I have been to London.", ru: "Я был в Лондоне." },
              { en: "She has been very busy.", ru: "Она была очень занята." },
              { en: "We had been there before.", ru: "Мы уже были там раньше." }
            ],
            grammar: ["pp", "pastp", "futp", "pass_pp"],
            mistakes: [{ no: "I have was there.", yes: "I have been there." }]
          }
        },
        go: {
          v1: {
            examples: [
              { en: "I go to work by bus.", ru: "Я езжу на работу на автобусе." },
              { en: "We can go with you.", ru: "Мы можем пойти с тобой." }
            ]
          },
          v2: {
            examples: [
              { en: "We went to the cinema yesterday.", ru: "Мы вчера ходили в кино." },
              { en: "She went home early.", ru: "Она ушла домой рано." }
            ]
          },
          v3: {
            examples: [
              { en: "She's gone home.", ru: "Она ушла домой." },
              { en: "He had gone before I arrived.", ru: "Он ушел до того, как я пришел." }
            ],
            mistakes: [{ no: "I have went there.", yes: "I have gone there." }]
          }
        },
        write: {
          v1: { examples: [{ en: "I write to my sister every month.", ru: "Я пишу сестре каждый месяц." }, { en: "I want to write a short note.", ru: "Я хочу написать короткую записку." }] },
          v2: { examples: [{ en: "She wrote the report last night.", ru: "Она написала отчет вчера вечером." }] },
          v3: { examples: [{ en: "He has written three books.", ru: "Он написал три книги." }], mistakes: [{ no: "I have wrote it.", yes: "I have written it." }] }
        },
        see: {
          v1: { examples: [{ en: "I see him at the station every day.", ru: "Я вижу его на станции каждый день." }, { en: "I can see the station from here.", ru: "Отсюда я вижу станцию." }] },
          v2: { examples: [{ en: "I saw that film yesterday.", ru: "Я видел этот фильм вчера." }] },
          v3: { examples: [{ en: "I've seen this before.", ru: "Я это уже видел." }], mistakes: [{ no: "I have saw it.", yes: "I have seen it." }] }
        },
        have: {
          v1: { examples: [{ en: "I have a question.", ru: "У меня есть вопрос." }, { en: "You should have a rest.", ru: "Тебе следует отдохнуть." }] },
          v2: { examples: [{ en: "I had a cold last week.", ru: "На прошлой неделе я простудился." }, { en: "She had time yesterday.", ru: "Вчера у нее было время." }] },
          v3: { examples: [{ en: "I have had this bike for two years.", ru: "Этот велосипед у меня уже два года." }, { en: "She had had lunch before we arrived.", ru: "Она уже пообедала, когда мы пришли." }] }
        },
        do: {
          v1: { examples: [{ en: "I do the washing-up every evening.", ru: "Я мою посуду каждый вечер." }, { en: "You should do it today.", ru: "Тебе следует сделать это сегодня." }] },
          v2: { examples: [{ en: "She did the shopping yesterday.", ru: "Она вчера сходила за покупками." }] },
          v3: { examples: [{ en: "I have done my homework.", ru: "Я сделал домашнюю работу." }], mistakes: [{ no: "I have did it.", yes: "I have done it." }] }
        },
        say: {
          v1: { examples: [{ en: "They say it is true.", ru: "Говорят, что это правда." }, { en: "I want to say something.", ru: "Я хочу кое-что сказать." }] },
          v2: { examples: [{ en: "She said goodbye and left.", ru: "Она попрощалась и ушла." }] },
          v3: { examples: [{ en: "He has said that twice.", ru: "Он сказал это дважды." }] }
        },
        make: {
          v1: { examples: [{ en: "I make coffee every morning.", ru: "Я варю кофе каждое утро." }, { en: "You can make a list.", ru: "Ты можешь составить список." }] },
          v2: { examples: [{ en: "We made dinner yesterday.", ru: "Мы вчера приготовили ужин." }] },
          v3: { examples: [{ en: "She has made a cake.", ru: "Она испекла торт." }] }
        },
        take: {
          v1: { examples: [{ en: "I take the bus to work.", ru: "Я езжу на работу на автобусе." }, { en: "You should take a coat.", ru: "Тебе следует взять пальто." }] },
          v2: { examples: [{ en: "She took my keys by mistake.", ru: "Она по ошибке взяла мои ключи." }] },
          v3: { examples: [{ en: "He has taken the last piece.", ru: "Он взял последний кусок." }], mistakes: [{ no: "I have took it.", yes: "I have taken it." }] }
        },
        come: {
          v1: { examples: [{ en: "They come here on Fridays.", ru: "Они приходят сюда по пятницам." }, { en: "Can you come at six?", ru: "Ты можешь прийти в шесть?" }] },
          v2: { examples: [{ en: "She came home late.", ru: "Она пришла домой поздно." }] },
          v3: { examples: [{ en: "Winter has come.", ru: "Зима наступила." }] }
        },
        know: {
          v1: { examples: [{ en: "I know the answer.", ru: "Я знаю ответ." }, { en: "You should know this.", ru: "Тебе следует это знать." }] },
          v2: { examples: [{ en: "I knew him at school.", ru: "Я знал его в школе." }] },
          v3: { examples: [{ en: "I have known her for years.", ru: "Я знаю ее много лет." }] }
        },
        get: {
          v1: { examples: [{ en: "I get home at seven.", ru: "Я прихожу домой в семь." }, { en: "You can get a ticket online.", ru: "Билет можно купить онлайн." }] },
          v2: { examples: [{ en: "We got lost in the old town.", ru: "Мы заблудились в старом городе." }] },
          v3: { examples: [{ en: "She has got the job.", ru: "Она получила работу." }, { en: "He has gotten used to it.", ru: "Он к этому привык." }] }
        },
        give: {
          v1: { examples: [{ en: "I give the class a short test on Mondays.", ru: "По понедельникам я даю группе короткий тест." }, { en: "You should give her a call.", ru: "Тебе следует ей позвонить." }] },
          v2: { examples: [{ en: "She gave me her seat.", ru: "Она уступила мне место." }] },
          v3: { examples: [{ en: "I have given up sugar.", ru: "Я отказался от сахара." }], mistakes: [{ no: "I have gave it back.", yes: "I have given it back." }] }
        },
        find: {
          v1: { examples: [{ en: "I find my keys in the same place every time.", ru: "Я каждый раз нахожу ключи на одном и том же месте." }] },
          v2: { examples: [{ en: "She found a wallet on the bus.", ru: "Она нашла кошелек в автобусе." }], mistakes: [{ no: "I founded my keys.", yes: "I found my keys.", note: "founded belongs to a different verb, to found." }] },
          v3: { examples: [{ en: "I have found a cheaper ticket.", ru: "Я нашел билет дешевле." }] }
        },
        think: {
          v1: { examples: [{ en: "I think this is right.", ru: "Я думаю, что это верно." }, { en: "You should think about it.", ru: "Тебе следует об этом подумать." }] },
          v2: { examples: [{ en: "I thought you were at work.", ru: "Я думал, что ты на работе." }] },
          v3: { examples: [{ en: "I have thought about your offer.", ru: "Я подумал о твоем предложении." }] }
        },
        tell: {
          v1: { examples: [{ en: "I tell them the news in the morning.", ru: "Я сообщаю им новости утром." }, { en: "You should tell the truth.", ru: "Тебе следует сказать правду." }] },
          v2: { examples: [{ en: "She told me the way.", ru: "Она объяснила мне дорогу." }] },
          v3: { examples: [{ en: "I have told him twice.", ru: "Я сказал ему дважды." }] }
        },
        become: {
          v1: { examples: [{ en: "It can become cold at night.", ru: "Ночью может похолодать." }, { en: "I want to become a nurse.", ru: "Я хочу стать медсестрой." }] },
          v2: { examples: [{ en: "The sky became dark.", ru: "Небо потемнело." }] },
          v3: { examples: [{ en: "She has become much quieter.", ru: "Она стала гораздо тише." }] }
        },
        show: {
          v1: { examples: [{ en: "This map shows the station.", ru: "На этой карте видна станция." }, { en: "Can you show me?", ru: "Можешь показать?" }] },
          v2: { examples: [{ en: "He showed us the photos.", ru: "Он показал нам фотографии." }] },
          v3: { examples: [{ en: "The film has shown that before.", ru: "В фильме это уже показывали." }] }
        },
        leave: {
          v1: { examples: [{ en: "I leave the office at six.", ru: "Я ухожу из офиса в шесть." }, { en: "You should leave a note.", ru: "Тебе следует оставить записку." }] },
          v2: { examples: [{ en: "The train left two minutes ago.", ru: "Поезд ушел две минуты назад." }] },
          v3: { examples: [{ en: "She has left her bag here.", ru: "Она оставила здесь сумку." }] }
        },
        feel: {
          v1: { examples: [{ en: "I feel tired in the afternoon.", ru: "После обеда я чувствую усталость." }, { en: "You should feel this fabric.", ru: "Потрогай эту ткань." }] },
          v2: { examples: [{ en: "I felt cold on the platform.", ru: "На платформе мне было холодно." }] },
          v3: { examples: [{ en: "I have felt better since Monday.", ru: "С понедельника я чувствую себя лучше." }] }
        },
        put: {
          v1: { examples: [{ en: "I put the keys in the bowl.", ru: "Я кладу ключи в миску." }, { en: "You should put a coat on.", ru: "Тебе следует надеть пальто." }] },
          v2: { examples: [{ en: "I put the letter on your desk yesterday.", ru: "Я вчера положил письмо тебе на стол." }], mistakes: [{ no: "I putted it there.", yes: "I put it there." }] },
          v3: { examples: [{ en: "I have put the milk in the fridge.", ru: "Я поставил молоко в холодильник." }] }
        },
        bring: {
          v1: { examples: [{ en: "I bring lunch from home.", ru: "Я приношу обед из дома." }, { en: "Can you bring a bottle of water?", ru: "Можешь принести бутылку воды?" }] },
          v2: { examples: [{ en: "She brought flowers.", ru: "Она принесла цветы." }] },
          v3: { examples: [{ en: "He has brought the tickets.", ru: "Он принес билеты." }] }
        },
        begin: {
          v1: { examples: [{ en: "Lessons begin at nine.", ru: "Уроки начинаются в девять." }, { en: "We can begin now.", ru: "Мы можем начать сейчас." }] },
          v2: { examples: [{ en: "The film began late.", ru: "Фильм начался с опозданием." }] },
          v3: { examples: [{ en: "It has begun to rain.", ru: "Начался дождь." }], mistakes: [{ no: "It has began.", yes: "It has begun." }] }
        },
        keep: {
          v1: { examples: [{ en: "I keep the receipts.", ru: "Я храню чеки." }, { en: "You should keep a copy.", ru: "Тебе следует оставить копию." }] },
          v2: { examples: [{ en: "She kept the receipt.", ru: "Она сохранила чек." }] },
          v3: { examples: [{ en: "I have kept every letter.", ru: "Я сохранил каждое письмо." }] }
        }
      };
      return rows[base] || null;
    }
    function verbSlotDefaults(v, slot) {
      const form = slot === "v1" ? v.base : slot === "v2" ? v.past : v.pp;
      const head = verbPrimary(form);
      const sense = verbSense(v);
      const taught = (verbTeach(v.base) || {})[slot] || {};
      if (slot === "v1") {
        return {
          badge: "V1 · base form",
          tags: ["#irregular-verb", "#v1", "#base-form"],
          formula: taught.formula || "Base form / infinitive",
          uses: taught.uses || ["Present Simple with I, you, we and they", "to-infinitive", "after modal verbs", "imperative"],
          structure: taught.structure || "I / you / we / they + " + v.base + ". Modal + " + v.base + ". to " + v.base + ".",
          examples: taught.examples || [
            { en: "I want to " + v.base + ".", ru: sense ? "Я хочу " + sense + "." : "" },
            { en: "You can " + v.base + " now.", ru: sense ? "Ты можешь " + sense + " сейчас." : "" }
          ],
          grammar: taught.grammar || ["ps", "toinf", "bare"],
          mistakes: taught.mistakes || [],
          gap: head,
          ruQuiz: v.ru || ""
        };
      }
      if (slot === "v2") {
        return {
          badge: "V2 · Past Simple",
          tags: ["#irregular-verb", "#v2", "#past-simple"],
          formula: taught.formula || "Past Simple",
          uses: taught.uses || ["A finished action or state in the past"],
          structure: taught.structure || "Subject + " + form + ".",
          examples: taught.examples || [
            { en: "She " + head + " yesterday.", ru: sense ? sense + " — прошедшее время." : "" },
            { en: "We " + head + " last week.", ru: sense ? sense + " — прошедшее время." : "" }
          ],
          grammar: taught.grammar || ["pasts"],
          mistakes: taught.mistakes || [],
          gap: head,
          ruQuiz: v.ru ? v.ru + " · Past Simple" : ""
        };
      }
      const same = verbAlts(v.past).some((part) => verbAlts(v.pp).indexOf(part) >= 0);
      return {
        badge: "V3 · past participle",
        tags: ["#irregular-verb", "#v3", "#past-participle"],
        formula: taught.formula || "Past participle",
        uses: taught.uses || ["Present Perfect", "Past Perfect", "Future Perfect"],
        structure: taught.structure || "have / has / had / will have + " + form + ".",
        examples: taught.examples || [
          { en: "She has " + head + " already.", ru: sense ? sense + " — причастие." : "" },
          { en: "We had " + head + " before they arrived.", ru: sense ? sense + " — причастие." : "" }
        ],
        grammar: taught.grammar || ["pp", "pastp", "futp"],
        mistakes: taught.mistakes || (same || v.base === "be" ? [] : [{ no: "I have " + verbPrimary(v.past) + " there.", yes: "I have " + head + " there." }]),
        gap: head,
        ruQuiz: v.ru ? v.ru + " · past participle" : ""
      };
    }
    function verbFormModels(v) {
      return ["v1", "v2", "v3"].map((slot) => {
        const form = slot === "v1" ? v.base : slot === "v2" ? v.past : v.pp;
        const row = verbSlotDefaults(v, slot);
        const accept = [];
        verbAlts(form).concat([form, form.replace(/\s*\/\s*/g, "/")]).forEach((item) => {
          if (item && accept.indexOf(item) < 0) accept.push(item);
        });
        return {
          slot: slot,
          form: form,
          badge: row.badge,
          tags: row.tags,
          formula: row.formula,
          uses: row.uses,
          structure: row.structure,
          differ: row.differ || ((verbTeach(v.base) || {})[slot] || {}).differ || "",
          examples: row.examples,
          grammar: row.grammar,
          mistakes: row.mistakes,
          gap: row.gap,
          accept: accept,
          ru: v.ru || "",
          def: v.def || "",
          ruQuiz: row.ruQuiz,
          note: v.note || "",
          speak: verbAlts(form).join(" or ")
        };
      });
    }
    function verbTopicChips(ids) {
      return (ids || []).map((id) => {
        const topic = topicById(id);
        return topic ? '<button class="btn chip" type="button" data-topic="' + id + '">' + esc(topic.name) + "</button>" : "";
      }).join(" ");
    }
    function verbFormCard(v, model) {
      const others = [
        ["v1", "V1", v.base],
        ["v2", "V2", v.past],
        ["v3", "V3", v.pp]
      ].filter((row) => row[0] !== model.slot);
      let html = '<div class="card grow study" id="verbform-' + model.slot + '">';
      html += '<p class="g-badge">' + esc(model.badge) + "</p>";
      html += '<p class="entry">' + esc(model.form) + "</p>";
      html += verbAlts(model.form).map((word) => ipaHtml(verbSay(v, model.slot, word))).join("");
      html += '<div class="tags">' + model.tags.map((tag) => "<span>" + esc(tag) + "</span>").join("") + "</div>";
      if (model.ru) html += "<p><b>" + esc(model.ru) + "</b></p>";
      else if (model.def) html += "<p>" + esc(model.def) + "</p>";
      else html += '<p class="hint">No Russian translation on this card.</p>';
      html += '<p class="formula">' + esc(model.formula) + "</p>";
      html += '<p class="label">Used in</p><ul>' + model.uses.map((line) => "<li>" + esc(line) + "</li>").join("") + "</ul>";
      html += '<p class="label">Structure</p><p class="src">' + esc(model.structure) + "</p>";
      if (model.differ) html += '<p class="src">' + esc(model.differ) + "</p>";
      html += '<p class="label">Examples</p>' + model.examples.map((item) =>
        '<div class="ex-line"><b>' + esc(item.en) + "</b>" +
        (item.ru ? '<br><span class="hint">Translation: ' + esc(item.ru) + "</span>" : '<br><span class="hint">No Russian translation for this line.</span>') +
        "</div>"
      ).join("");
      if (model.mistakes.length) {
        html += '<p class="label">Common mistakes</p>' + model.mistakes.map((item) =>
          '<p class="miss"><span class="no">' + esc(item.no) + '</span> <span class="yes">' + esc(item.yes) + "</span>" +
          (item.note ? " " + esc(item.note) : "") + "</p>"
        ).join("");
      }
      if (model.note && model.slot !== "v1") html += '<p class="sub">' + esc(model.note) + "</p>";
      html += '<p class="label">Grammar</p><p class="src">' + verbTopicChips(model.grammar) + "</p>";
      html += '<p class="label">Irregular verb family</p><p class="src">' + esc(v.base) + " → " + esc(v.past) + " → " + esc(v.pp) + "</p>";
      html += '<p class="src">' + others.map((row) =>
        '<button class="btn chip" type="button" data-verb-focus="' + esc(v.base) + '" data-verb-slot="' + row[0] + '">' + row[1] + " · " + esc(row[2]) + "</button>"
      ).join(" ") + "</p>";
      html += "<p>" + cardLinks(v.base, "https://dictionary.cambridge.org/dictionary/english/" + encodeURIComponent(v.base)) + "</p>";
      html += clipLine(clipOf({ en: model.form }));
      html += "</div>";
      return html;
    }
    function verbStudyCards(v) {
      return verbFormModels(v).map((model) => {
        const pair = ipaPair(verbSay(v, model.slot, verbPrimary(model.form)));
        return {
          qid: v.base + "|" + model.slot,
          en: model.form,
          ru: model.ruQuiz,
          pos: "verb",
          uk: pair.uk,
          us: pair.us,
          ex: model.examples[0] ? model.examples[0].en : "",
          gap: model.gap,
          gloss: model.formula,
          accept: model.accept,
          speak: model.speak,
          base: v.base
        };
      });
    }
    const VERB_LEVELS = [
      ["1", "Most used"],
      ["2", "Very common"],
      ["3", "Common"],
      ["4", "Less common"],
      ["5", "Rare"]
    ];
    function verbMeaning(v) {
      return v.ru || v.def || "";
    }
    function paintVerbs() {
      const list = window.IRREGULAR || [];
      const count = document.getElementById("verbCount");
      if (count) count.textContent = String(list.length);
      const title = document.getElementById("verbTitle");
      const sub = document.getElementById("verbSub");
      const box = document.getElementById("verbList");
      if (!box) return;
      if (!verbGroup) {
        if (title) title.textContent = "Irregular verbs · " + list.length;
        if (sub) {
          sub.hidden = false;
          sub.textContent = "Five levels by how often the verb is used. Levels 1–3 follow a corpus ranking, and be, have and do are in level 1. Each row is the base form, the past and the past participle. Open a row for three cards, one form each. Modals are not listed: they have no past participle. A prefix that only repeats its root, such as overbuild, is not a separate card.";
        }
        box.innerHTML = VERB_LEVELS.map((pair, index) => {
          const n = list.filter((v) => v.level === pair[0] && cardVisible(v)).length;
          return '<button class="day active" type="button" data-verb-level="' + pair[0] + '"><span class="date">' + (index + 1) + '</span><span class="song-line"><b>' + esc(pair[1]) + '</b></span><span class="label about">' + n + (n === 1 ? " verb" : " verbs") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const level = VERB_LEVELS.find((pair) => pair[0] === verbGroup);
      const shown = list.filter((v) => v.level === verbGroup && cardVisible(v));
      if (!verbKey) {
        if (title) title.textContent = (level ? level[1] : "Irregular verbs") + " · " + shown.length;
        if (sub) sub.hidden = true;
        box.innerHTML = shown.map((v) =>
          '<button class="path" type="button" data-verb="' + esc(v.base) + '"><span><b>' + esc(v.base) + '</b><br><span class="label">' + esc(v.past) + " · " + esc(v.pp) + '</span></span><span class="to">' + esc(verbMeaning(v)) + "</span></button>"
        ).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const v = shown.find((item) => item.base === verbKey) || (window.IRREGULAR || []).find((item) => item.base === verbKey);
      if (!v || !cardVisible(v)) { verbKey = ""; paintVerbs(); return; }
      if (title) title.textContent = v ? v.base : "Verb";
      if (sub) {
        sub.hidden = false;
        sub.textContent = "Three cards, one for each form. Study uses these three cards.";
      }
      if (!v) { box.innerHTML = ""; applyCardSearch(box.closest("section")); return; }
      box.innerHTML = catalogEditHtml(v) + verbFormModels(v).map((model) => verbFormCard(v, model)).join("");
      applyCardSearch(box.closest("section"));
    }
    function openVerbLevel(level) {
      pushHistory();
      verbGroup = level;
      verbKey = "";
      paintVerbs();
      show("verbs");
    }
    function openVerbCard(base) {
      const found = (window.IRREGULAR || []).find((item) => item.base === base);
      pushHistory();
      if (found) verbGroup = found.level;
      verbKey = base;
      paintVerbs();
      show("verbs");
    }
    function blankSentence(sentence, word) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      const found = sentence.match(re);
      if (!found) return null;
      return { shown: sentence.replace(re, "____"), answer: found[0] };
    }
    function shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const swap = copy[i];
        copy[i] = copy[j];
        copy[j] = swap;
      }
      return copy;
    }
    function sensesOf(gloss) {
      return String(gloss || "").split(/[,;]/).map((part) => part.trim()).filter((part) => part.length > 1);
    }
    function ruMatch(typed, gloss) {
      const text = typed.trim().toLowerCase();
      if (!text) return false;
      if (text === String(gloss || "").trim().toLowerCase()) return true;
      return sensesOf(gloss).some((part) => part.toLowerCase() === text);
    }
    function blankRu(sentence, word) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^А-Яа-яЁё])(" + escaped + ")(?![А-Яа-яЁё])", "i");
      const found = sentence.match(re);
      if (!found) return null;
      return { shown: sentence.replace(re, "$1____"), answer: found[2] };
    }
    function choiceBlock(title, prompt, options, correct, dir) {
      if (options.length < 2) {
        return '<div class="gen"><h2>' + title + '</h2><p class="hint">The dictionary has only one equivalent here, so a choice card was not made.</p></div>';
      }
      let html = '<div class="gen"><h2>' + title + '</h2><p class="prompt">' + esc(prompt) + '</p><div class="opts">';
      options.forEach((option, index) => {
        html += '<button class="opt" type="button" data-made-choice="' + (option === correct ? "ok" : "bad") + '" data-choice-dir="' + dir + '"><span class="bullet">' + (index + 1) + "</span><span>" + esc(option) + "</span></button>";
      });
      html += '</div><div id="madeChoiceFb' + dir + '"></div></div>';
      return html;
    }
    function sourceLinks(links) {
      const order = [
        ["cambridge", "Cambridge"],
        ["oxford", "Oxford"],
        ["longman", "Longman"],
        ["collins", "Collins"],
        ["merriamWebster", "Merriam-Webster"],
        ["englishClub", "English Club"],
        ["idiomConnection", "Idiom Connection"],
        ["learnEnglishToday", "Learn English Today"],
        ["eslCafe", "ESL Cafe"],
        ["learnEnglishDe", "Learn English Free"],
        ["englishAtHome", "English at Home"],
        ["wiktionary", "Wiktionary"],
        ["wikdict", "WikDict"],
        ["wikdictRu", "WikDict"],
        ["openRussian", "OpenRussian"],
        ["freeDict", "FreeDict"],
        ["wooordhunt", "Wooordhunt"],
        ["britishCouncil", "British Council"],
        ["perfectEnglish", "Perfect English Grammar"]
      ];
      return foldedLinkHtml(order.filter((pair) => links && links[pair[0]]).map((pair) => [pair[1], links[pair[0]]]));
    }
    function usageList(usages) {
      if (!usages.length) return '<div class="gen"><h2>Usages</h2><p style="color:var(--bad)">No example sentences turned up for this phrase.</p></div>';
      const simple = usages.filter((usage) => usage.kind === "simple").length;
      const complex = usages.filter((usage) => usage.kind === "complex").length;
      const names = [];
      usages.forEach((usage) => {
        const name = usage.source || "Dictionary";
        if (names.indexOf(name) === -1) names.push(name);
      });
      let html = '<div class="gen"><h2>Usages · ' + usages.length + "</h2>";
      if (usages.length < 10) html += '<p style="color:var(--bad)">Only ' + usages.length + (usages.length === 1 ? " example sentence" : " example sentences") + " for this phrase.</p>";
      else html += '<p class="hint">' + simple + " simple · " + complex + " complex.</p>";
      html += '<p class="hint">Sources: ' + esc(names.join(", ")) + ".</p>";
      usages.forEach((usage) => {
        html += '<p><span class="kind">' + esc(usage.kind) + '</span><span class="label">' + esc(usage.source || "") + "</span> " + esc(usage.en) + "</p>";
        if (usage.ru) html += '<p class="hint">' + esc(usage.ru) + "</p>";
      });
      return html + "</div>";
    }
    function usageQuizzes(usages) {
      const withRu = usages.filter((usage) => usage.ru);
      if (withRu.length < 2) return "";
      const target = withRu.find((usage) => usage.kind === "complex") || withRu[0];
      const pool = [target.en];
      withRu.forEach((usage) => {
        if (pool.length < 4 && pool.indexOf(usage.en) === -1) pool.push(usage.en);
      });
      const options = shuffle(pool);
      let html = '<div class="gen"><h2>Usage quiz · Choice</h2><p class="prompt">Which sentence matches this translation?</p><p class="q">' + esc(target.ru) + '</p><div class="opts">';
      options.forEach((option, index) => {
        html += '<button class="opt" type="button" data-usage-choice="' + (option === target.en ? "ok" : "bad") + '"><span class="bullet">' + (index + 1) + "</span><span>" + esc(option) + "</span></button>";
      });
      html += '</div><div id="usageChoiceFb"></div></div>';
      const other = withRu[1];
      const truthful = Math.random() < 0.5;
      const shownRu = truthful ? target.ru : other.ru;
      html += '<div class="gen"><h2>Usage quiz · True / false</h2><p class="prompt">Does this translation match the sentence?</p><p class="q">' + esc(target.en) + "</p><p>" + esc(shownRu) + "</p>";
      html += '<div class="row"><button class="btn" type="button" data-tf="' + (truthful ? "ok" : "bad") + '" data-tf-answer="' + esc(target.ru) + '">True</button>';
      html += '<button class="btn" type="button" data-tf="' + (truthful ? "bad" : "ok") + '" data-tf-answer="' + esc(target.ru) + '">False</button></div><div id="usageTfFb"></div></div>';
      return html;
    }
    let madeItem = null;
    function renderMade(item) {
      madeItem = item;
      const data = item.data || {};
      const cam = data.cambridge || {};
      const wh = data.wooordhunt || {};
      const uk = cam.uk || wh.uk || "";
      const us = cam.us || wh.us || "";
      const phrases = [];
      (wh.phrases || []).forEach((phrase) => {
        const english = (phrase.en || "").trim();
        if (!english || english.toLowerCase() === item.word.trim().toLowerCase()) return;
        if (!phrases.some((have) => have.en === english)) phrases.push(phrase);
      });
      const examples = [];
      (wh.examples || []).forEach((example) => { if (example.en) examples.push(example); });
      (cam.examples || []).forEach((english) => {
        if (english && !examples.some((have) => have.en.toLowerCase() === english.toLowerCase())) examples.push({ en: english, ru: "" });
      });
      const usages = data.usages || [];
      const gapPool = usages.length ? usages : examples;
      const gaps = [];
      const simplePool = gapPool.filter((example) => example.kind !== "complex");
      const complexPool = gapPool.filter((example) => example.kind === "complex");
      let simpleAt = 0;
      let complexAt = 0;
      let wantComplex = false;
      while (gaps.length < 4 && (simpleAt < simplePool.length || complexAt < complexPool.length)) {
        const example = !wantComplex && simpleAt < simplePool.length
          ? simplePool[simpleAt++]
          : (complexAt < complexPool.length ? complexPool[complexAt++] : simplePool[simpleAt++]);
        wantComplex = !wantComplex;
        const gap = blankSentence(example.en, item.word);
        if (gap) gaps.push({ shown: gap.shown, answer: gap.answer, hint: example.ru || "", kind: example.kind || "" });
      }
      const ruPieces = sensesOf(item.ru);
      if (data.direction === "ru" && data.query) ruPieces.push(data.query);
      ruPieces.sort((a, b) => b.length - a.length);
      const ruGaps = [];
      gapPool.forEach((example) => {
        if (!example.ru || ruGaps.length >= 3) return;
        for (let i = 0; i < ruPieces.length; i++) {
          const gap = blankRu(example.ru, ruPieces[i]);
          if (!gap) continue;
          ruGaps.push({ shown: gap.shown, answer: gap.answer, hint: example.en });
          break;
        }
      });
      const ruWrong = [];
      phrases.forEach((phrase) => {
        const text = (phrase.ru || "").trim();
        if (!text || text.toLowerCase() === item.ru.trim().toLowerCase()) return;
        if (sensesOf(item.ru).some((sense) => sense.toLowerCase() === text.toLowerCase())) return;
        if (ruWrong.indexOf(text) === -1) ruWrong.push(text);
      });
      const ruOptions = shuffle(ruWrong.slice(0, 3).concat([item.ru]));
      const enWrong = (data.englishAlts || []).filter((alt) => alt.toLowerCase() !== item.word.trim().toLowerCase());
      const enOptions = shuffle(enWrong.slice(0, 3).concat([item.word]));
      document.getElementById("madeTitle").textContent = item.word;
      const ipa = ipaHtml({ en: item.word, uk: uk, us: us });
      const note = expressionNote(item);
      let html = '<div class="gen"><h2>Word card</h2>';
      const ruLine = item.ru ? '<p class="word-ru">' + esc(item.ru) + "</p>" : (note ? '<p class="word-ru">' + esc(note) + "</p>" : "");
      html += '<div class="word-head">' + wordPic(item.word, true) + '<div class="word-copy"><p class="entry">' + esc(item.word) + "</p>" + ruLine + "</div></div>";
      html += addedEditHtml(item) || catalogEditHtml(findCatalog(item.word));
      if (data.grammar && data.grammar.form) html += '<p class="pos">' + esc(data.grammar.form) + "</p>";
      else if (cam.pos) html += '<p class="pos">' + esc(cam.pos) + "</p>";
      html += ipa;
      if (cam.level) html += '<p><span class="level">' + esc(cam.level) + "</span></p>";
      if (!item.ru && !note) html += '<p class="hint bad">Wooordhunt has no Russian gloss for this phrase.</p>';
      const origin = cardOrigin(item);
      if (origin) html += '<p class="label">' + esc(origin) + "</p>";
      if (data.base) html += '<p><span class="label">Base form</span> ' + esc(data.base) + "</p>";
      if (item.ru && note) html += "<p>" + esc(note) + "</p>";
      html += variantLines(item.word) + variantForm(item.word, "made", item.ru);
      html += clipLine(clipOf({ en: item.word }));
      if (item.ru) html += '<p class="hint">Translation: ' + esc(data.ruSource || "Wooordhunt") + "." + (data.direction === "ru" && data.query ? " You looked up: " + esc(data.query) + "." : "") + "</p>";
      if (cam.definition) html += '<p><span class="label">Cambridge</span> ' + esc(cam.definition) + "</p>";
      if ((data.longman || {}).definition) html += '<p><span class="label">Longman</span> ' + esc(data.longman.definition) + "</p>";
      if ((data.collins || {}).definition) html += '<p><span class="label">Collins</span> ' + esc(data.collins.definition) + "</p>";
      if ((data.merriam || {}).definition) html += '<p><span class="label">Merriam-Webster</span> ' + esc(data.merriam.definition) + "</p>";
      if ((data.englishClub || {}).meaning) html += '<p><span class="label">English Club</span> ' + esc(data.englishClub.meaning) + "</p>";
      if ((data.englishAtHome || {}).meaning) html += '<p><span class="label">English at Home</span> ' + esc(data.englishAtHome.meaning) + "</p>";
      if ((data.wiktionary || {}).ru) html += '<p><span class="label">Wiktionary</span> ' + esc(data.wiktionary.ru) + "</p>";
      if ((data.wiktionary || {}).en) html += '<p><span class="label">Wiktionary</span> ' + esc(data.wiktionary.en) + "</p>";
      if ((data.wiktionary || {}).definition) html += '<p><span class="label">Wiktionary</span> ' + esc(data.wiktionary.definition) + "</p>";
      if ((data.wikdict || {}).ru) html += '<p><span class="label">WikDict</span> ' + esc(data.wikdict.ru) + "</p>";
      if ((data.wikdict || {}).en) html += '<p><span class="label">WikDict</span> ' + esc(data.wikdict.en) + "</p>";
      if ((data.openRussian || {}).ru) html += '<p><span class="label">OpenRussian</span> ' + esc(data.openRussian.ru) + "</p>";
      if ((data.openRussian || {}).en) html += '<p><span class="label">OpenRussian</span> ' + esc(data.openRussian.en) + "</p>";
      const links = Object.assign({}, data.links || {});
      if (!links.oxford) links.oxford = oxfordUrl(item.word);
      html += "<p>" + sourceLinks(links) + "</p></div>";
      html += usageList(usages);

      if (item.ru || note) html += '<div class="gen"><h2>' + (item.ru ? "English → Russian · Flip" : "Expression → meaning") + '</h2><div id="madeFlipEn"><p class="q">' + esc(item.word) + '</p><button class="btn" type="button" data-flip="en">Flip</button></div></div>';
      if (item.ru) html += choiceBlock("English → Russian · Choice", item.word, ruOptions, item.ru, "ru");
      if (item.ru) html += '<div class="gen"><h2>English → Russian · Type</h2><p class="prompt">' + esc(item.word) + '</p><input id="madeTypeRu" type="text" placeholder="Type the Russian translation" autocomplete="off" /><div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-type="ru">Check</button></div><div id="madeTypeFbRu"></div></div>';
      if (gaps.length) {
        gaps.forEach((gap, index) => {
          html += '<div class="gen"><h2>English → Russian · Gap' + (gap.kind ? " · " + esc(gap.kind) : "") + '</h2><p class="q">' + esc(gap.shown) + "</p>";
          if (gap.hint) html += '<p class="hint">' + esc(gap.hint) + "</p>";
          html += '<input id="madeGap' + index + '" type="text" data-gap-answer="' + esc(gap.answer) + '" placeholder="Missing word" autocomplete="off" />';
          html += '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-gap-check="' + index + '">Check</button></div><div id="madeGapFb' + index + '"></div></div>';
        });
      }

      if (item.ru) html += '<div class="gen"><h2>Russian → English · Flip</h2><div id="madeFlipRu"><p class="q">' + esc(item.ru) + '</p><button class="btn" type="button" data-flip="ru">Flip</button></div></div>';
      if (item.ru) html += choiceBlock("Russian → English · Choice", item.ru, enOptions, item.word, "en");
      if (item.ru) html += '<div class="gen"><h2>Russian → English · Type</h2><p class="prompt">' + esc(item.ru) + '</p><input id="madeTypeEn" type="text" placeholder="Type the English word" autocomplete="off" /><div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-type="en">Check</button></div><div id="madeTypeFbEn"></div></div>';
      if (ruGaps.length) {
        ruGaps.forEach((gap, index) => {
          html += '<div class="gen"><h2>Russian → English · Gap</h2><p class="q">' + esc(gap.shown) + "</p>";
          if (gap.hint) html += '<p class="hint">' + esc(gap.hint) + "</p>";
          html += '<input id="madeGapRu' + index + '" type="text" data-gap-answer="' + esc(gap.answer) + '" placeholder="Missing word" autocomplete="off" />';
          html += '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-gap-check="Ru' + index + '">Check</button></div><div id="madeGapFbRu' + index + '"></div></div>';
        });
      }

      if (phrases.length) {
        html += '<div class="gen"><h2>Phrases</h2>';
        phrases.forEach((phrase, index) => {
          html += '<div style="margin-bottom:8px"><p class="q" style="font-size:16px">' + esc(phrase.en) + '</p><button class="btn" type="button" data-phrase="' + index + '">Flip</button><p class="hint" id="madePhrase' + index + '" hidden>' + esc(phrase.ru) + "</p></div>";
        });
        html += '<p class="label" style="margin-top:10px">Russian → English</p>';
        phrases.forEach((phrase, index) => {
          html += '<div style="margin-bottom:8px"><p class="q" style="font-size:16px">' + esc(phrase.ru) + '</p><button class="btn" type="button" data-phrase-en="' + index + '">Flip</button><p class="hint" id="madePhraseEn' + index + '" hidden>' + esc(phrase.en) + "</p></div>";
        });
        html += "</div>";
      } else if (!item.fromText) {
        html += '<div class="gen"><h2>Phrases</h2><p class="hint">Wooordhunt has no phrases for this word.</p></div>';
      }
      html += usageQuizzes(usages);
      document.getElementById("madeView").innerHTML = html;
      document.getElementById("madeView").dataset.ru = item.ru || note;
      document.getElementById("madeView").dataset.word = item.word;
      if ((document.querySelector("section.on") || {}).id !== "made") pushHistory();
      show("made");
    }
    document.getElementById("madeView").addEventListener("click", (e) => {
      const view = document.getElementById("madeView");
      const flip = e.target.closest("[data-flip]");
      if (flip) {
        const dir = flip.dataset.flip;
        const face = document.getElementById(dir === "ru" ? "madeFlipRu" : "madeFlipEn");
        const front = dir === "ru" ? view.dataset.ru : view.dataset.word;
        const back = dir === "ru" ? view.dataset.word : view.dataset.ru;
        if (flip.dataset.open === "1") {
          face.innerHTML = '<p class="q">' + esc(front) + '</p><button class="btn" type="button" data-flip="' + dir + '">Flip</button>';
        } else {
          face.innerHTML = '<p class="q">' + esc(back) + '</p>' + (dir === "en" ? variantLines(view.dataset.word) : "") + '<button class="btn" type="button" data-flip="' + dir + '" data-open="1">Card front</button>';
        }
        return;
      }
      const choice = e.target.closest("[data-made-choice]");
      if (choice) {
        const dir = choice.dataset.choiceDir;
        view.querySelectorAll('[data-choice-dir="' + dir + '"]').forEach((btn) => btn.classList.remove("ok", "bad"));
        choice.classList.add(choice.dataset.madeChoice === "ok" ? "ok" : "bad");
        if (choice.dataset.madeChoice !== "ok") {
          const right = view.querySelector('[data-choice-dir="' + dir + '"][data-made-choice="ok"]');
          if (right) right.classList.add("ok");
        }
        const answer = dir === "en" ? view.dataset.word : view.dataset.ru;
        document.getElementById("madeChoiceFb" + dir).innerHTML = '<div class="feedback ' + (choice.dataset.madeChoice === "ok" ? "ok" : "bad") + '">' +
          (choice.dataset.madeChoice === "ok" ? "Correct" : "Incorrect. Right answer: " + esc(answer)) + "</div>";
        return;
      }
      const typeBtn = e.target.closest("[data-type]");
      if (typeBtn) {
        const dir = typeBtn.dataset.type;
        const typed = document.getElementById(dir === "ru" ? "madeTypeRu" : "madeTypeEn").value;
        const gloss = view.dataset.ru + variantsOf(view.dataset.word).map((text) => ", " + text).join("");
        const ok = dir === "ru" ? ruMatch(typed, gloss) : typed.trim().toLowerCase() === view.dataset.word.trim().toLowerCase();
        const needed = dir === "ru" ? view.dataset.ru : view.dataset.word;
        document.getElementById(dir === "ru" ? "madeTypeFbRu" : "madeTypeFbEn").innerHTML = '<div class="feedback ' + (ok ? "ok" : "bad") + '">' +
          (ok ? "Correct" : "Incorrect. Needed: " + esc(needed)) + "</div>";
        return;
      }
      const gapBtn = e.target.closest("[data-gap-check]");
      if (gapBtn) {
        const index = gapBtn.dataset.gapCheck;
        const input = document.getElementById("madeGap" + index);
        const ok = input.value.trim().toLowerCase() === input.dataset.gapAnswer.trim().toLowerCase();
        document.getElementById("madeGapFb" + index).innerHTML = '<div class="feedback ' + (ok ? "ok" : "bad") + '">' +
          (ok ? "Correct" : "Incorrect. Needed: " + esc(input.dataset.gapAnswer)) + "</div>";
        return;
      }
      const usageChoice = e.target.closest("[data-usage-choice]");
      if (usageChoice) {
        view.querySelectorAll("[data-usage-choice]").forEach((btn) => btn.classList.remove("ok", "bad"));
        usageChoice.classList.add(usageChoice.dataset.usageChoice === "ok" ? "ok" : "bad");
        if (usageChoice.dataset.usageChoice !== "ok") {
          const right = view.querySelector('[data-usage-choice="ok"]');
          if (right) right.classList.add("ok");
        }
        document.getElementById("usageChoiceFb").innerHTML = '<div class="feedback ' + (usageChoice.dataset.usageChoice === "ok" ? "ok" : "bad") + '">' +
          (usageChoice.dataset.usageChoice === "ok" ? "Correct" : "Incorrect") + "</div>";
        return;
      }
      const tf = e.target.closest("[data-tf]");
      if (tf) {
        const ok = tf.dataset.tf === "ok";
        document.getElementById("usageTfFb").innerHTML = '<div class="feedback ' + (ok ? "ok" : "bad") + '">' +
          (ok ? "Correct" : "Incorrect. The translation is: " + esc(tf.dataset.tfAnswer)) + "</div>";
        return;
      }
      const phraseBtn = e.target.closest("[data-phrase]");
      if (phraseBtn) {
        const line = document.getElementById("madePhrase" + phraseBtn.dataset.phrase);
        line.hidden = !line.hidden;
        return;
      }
      const phraseEn = e.target.closest("[data-phrase-en]");
      if (phraseEn) {
        const line = document.getElementById("madePhraseEn" + phraseEn.dataset.phraseEn);
        line.hidden = !line.hidden;
      }
    });
    async function openUsages(word, lessonRu) {
      const btn = document.activeElement;
      if (btn && btn.dataset && btn.dataset.usages) btn.textContent = "Looking up…";
      try {
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (res.ok && data.found) {
          renderMade({ word: data.word || word, ru: lessonRu || data.ru, data: data });
          return;
        }
      } catch (err) {
        if (btn && btn.dataset && btn.dataset.usages) btn.textContent = "Usages";
      }
      renderMade({ word: word, ru: lessonRu || "", data: {} });
    }
    document.body.addEventListener("click", (e) => {
      const variantOpen = e.target.closest("[data-variant-open]");
      if (variantOpen) {
        const form = variantOpen.closest(".variant-box").querySelector("[data-variant-form]");
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("[data-variant-input]").focus();
        return;
      }
      const variantAdd = e.target.closest("[data-variant-add]");
      if (variantAdd) {
        const box = variantAdd.closest(".variant-box");
        const word = box.dataset.variantWord;
        const status = box.querySelector("[data-variant-status]");
        const official = box.dataset.variantRu || "";
        const typed = box.querySelector("[data-variant-input]").value.trim();
        if (official && (typed.toLowerCase() === official.toLowerCase() || sensesOf(official).some((part) => part.toLowerCase() === typed.toLowerCase()))) {
          status.textContent = "This is already on the card.";
          status.classList.add("bad");
          return;
        }
        if (!addVariant(word, typed, status)) return;
        paintWordGrid();
        if (box.dataset.variantWhere === "song") renderSong(songKey);
        else if (box.dataset.variantWhere === "made" && madeItem) renderMade(madeItem);
        else renderWord(words.find((w) => variantKey(w.en) === variantKey(word)) || current);
        return;
      }
      const statSongBtn = e.target.closest("[data-stat-song]");
      if (statSongBtn) {
        openStatSong(statSongBtn.dataset.statSong);
        return;
      }
      const statGroupBtn = e.target.closest("[data-stat-group]");
      if (statGroupBtn) {
        openStatGroup(statGroupBtn.dataset.statGroup);
        return;
      }
      const allSongBtn = e.target.closest("[data-all-song]");
      if (allSongBtn) {
        openAllSong(allSongBtn.dataset.allSong);
        return;
      }
      const allGroupBtn = e.target.closest("[data-all-group]");
      if (allGroupBtn) {
        openAllGroup(allGroupBtn.dataset.allGroup);
        return;
      }
      const allStudy = e.target.closest("[data-all-study]");
      if (allStudy) {
        openAllStudy();
        return;
      }
      const pageStudy = e.target.closest("[data-page-study]");
      if (pageStudy) {
        openPageStudy();
        return;
      }
      const classesStudy = e.target.closest("[data-classes-study]");
      if (classesStudy) {
        openClassesStudy();
        return;
      }
      const musicStudy = e.target.closest("[data-music-study]");
      if (musicStudy) {
        openMusicStudy();
        return;
      }
      const songStudy = e.target.closest("[data-song-study]");
      if (songStudy) {
        openSongStudy();
        return;
      }
      const addStudy = e.target.closest("[data-add-study]");
      if (addStudy) {
        openAddStudy();
        return;
      }
      const verbStudy = e.target.closest("[data-verb-study]");
      if (verbStudy) {
        openVerbStudy();
        return;
      }
      const verbFocus = e.target.closest("[data-verb-slot]");
      if (verbFocus) {
        const card = document.getElementById("verbform-" + verbFocus.dataset.verbSlot);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const verbBtn = e.target.closest("[data-verb]");
      if (verbBtn) {
        openVerbCard(verbBtn.dataset.verb);
        return;
      }
      const verbLevelBtn = e.target.closest("[data-verb-level]");
      if (verbLevelBtn) {
        openVerbLevel(verbLevelBtn.dataset.verbLevel);
        return;
      }
      const stat = e.target.closest("[data-stat]");
      if (stat) {
        openStat(stat.dataset.stat);
        return;
      }
      const allCard = e.target.closest("[data-all-kind]");
      if (allCard) {
        const kind = allCard.dataset.allKind;
        const key = allCard.dataset.allKey;
        if (kind === "deck") {
          visit("flip");
        } else if (kind === "extra") {
          const w = extraWords.find((item) => item.en.toLowerCase() === key.toLowerCase());
          if (w) { renderWord(w); visit("word"); }
        } else if (kind === "word" || kind === "phrase" || kind === "adverb" || kind === "talk" || kind === "like" || kind === "ask" || kind === "line") {
          const bank = kind === "phrase" ? phrases09 : kind === "adverb" ? adverbs14 : kind === "talk" ? talk16 : kind === "like" ? likes23 : kind === "ask" ? ask07 : kind === "line" ? lines21 : words;
          const w = bank.find((item) => item.en.toLowerCase() === key.toLowerCase());
          if (w) { renderWord(w); visit("word"); }
        } else if (kind === "song") {
          renderSong(key);
          visit("musicword");
        } else if (kind === "added") {
          const item = loadAdded().find((row) => String(row.word).toLowerCase() === key.toLowerCase());
          if (item) {
            if (item.data && item.data.usages && item.data.usages.length) renderMade(item);
            else openUsages(item.word, item.ru);
          }
        }
        return;
      }
      const advBtn = e.target.closest("[data-adv]");
      if (advBtn) {
        const w = adverbs14[Number(advBtn.dataset.adv)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const askBtn = e.target.closest("[data-ask]");
      if (askBtn) {
        const w = ask07[Number(askBtn.dataset.ask)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const lineBtn = e.target.closest("[data-line]");
      if (lineBtn) {
        const w = lines21[Number(lineBtn.dataset.line)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const likeBtn = e.target.closest("[data-like]");
      if (likeBtn) {
        const w = likes23[Number(likeBtn.dataset.like)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const talkBtn = e.target.closest("[data-talk]");
      if (talkBtn) {
        const w = talk16[Number(talkBtn.dataset.talk)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const phraseBtn = e.target.closest("[data-phrase]");
      if (phraseBtn) {
        const w = phrases09[Number(phraseBtn.dataset.phrase)];
        if (!w) return;
        current = w;
        renderWord(w);
        visit("word");
        return;
      }
      const dayQuiz = e.target.closest("[data-day-quiz]");
      if (dayQuiz) {
        openDayQuiz(dayQuiz.dataset.dayQuiz);
        return;
      }
      const extraBtn = e.target.closest("[data-extra]");
      if (extraBtn) {
        const w = extraWords.find((item) => item.en.toLowerCase() === extraBtn.dataset.extra.toLowerCase());
        if (w) { current = w; renderWord(w); visit("word"); }
        return;
      }
      const addSongBtn = e.target.closest("[data-add-song]");
      if (addSongBtn) {
        openAddSong(addSongBtn.dataset.addSong);
        return;
      }
      const addGroupBtn = e.target.closest("[data-add-group]");
      if (addGroupBtn) {
        openAddGroup(addGroupBtn.dataset.addGroup);
        return;
      }
      const cardDelete = e.target.closest("[data-card-delete]");
      if (cardDelete) {
        e.preventDefault();
        e.stopPropagation();
        const host = cardDelete.closest("[data-edit-host]");
        if (!host) return;
        if (cardDelete.dataset.cardDelete !== "yes") {
          cardDelete.dataset.cardDelete = "yes";
          cardDelete.classList.add("is-confirm");
          cardDelete.textContent = "Delete?";
          cardDelete.setAttribute("aria-label", "Delete?");
          return;
        }
        deleteCard(host);
        return;
      }
      const editToggle = e.target.closest("[data-edit-toggle]");
      if (editToggle) {
        e.preventDefault();
        e.stopPropagation();
        const host = editToggle.closest("[data-edit-host]");
        if (!host) return;
        const open = host.querySelector("[data-edit-form]");
        if (open) { open.remove(); return; }
        const fields = editFieldsFor(host);
        if (!fields) return;
        host.insertAdjacentHTML("beforeend", editFormHtml(fields));
        const first = host.querySelector("[data-edit-field]");
        if (first) first.focus();
        return;
      }
      const editSave = e.target.closest("[data-edit-save]");
      if (editSave) {
        e.preventDefault();
        e.stopPropagation();
        const host = editSave.closest("[data-edit-host]");
        if (host) saveCardEdit(host);
        return;
      }
      const added = e.target.closest("[data-added]");
      if (added) {
        const item = loadAdded()[Number(added.dataset.added)];
        if (!item) return;
        if (item.data && item.data.usages && item.data.usages.length) renderMade(item);
        else openUsages(item.word, item.ru);
        return;
      }
      const openAdd = e.target.closest("[data-add-open]");
      if (openAdd) {
        const form = openAdd.parentElement.querySelector("[data-add-form]");
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector("[data-add-input]").focus();
        return;
      }
      const go = e.target.closest("[data-add-go]");
      if (go) {
        const root = go.closest("[data-place]");
        saveWord(root.dataset.place, root.querySelector("[data-add-input]"), root.querySelector("[data-add-status]"), go, false);
        return;
      }
      const btn = e.target.closest("[data-usages]");
      if (!btn) return;
      openUsages(btn.dataset.usages, btn.dataset.usagesRu || "");
    });
    document.body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const variantInput = e.target.closest("[data-variant-input]");
      if (variantInput) {
        e.preventDefault();
        variantInput.closest(".variant-box").querySelector("[data-variant-add]").click();
        return;
      }
      const editInput = e.target.closest("[data-edit-field]");
      if (editInput) {
        e.preventDefault();
        const host = editInput.closest("[data-edit-host]");
        if (host) saveCardEdit(host);
        return;
      }
      const input = e.target.closest("[data-add-input]");
      if (!input) return;
      e.preventDefault();
      input.closest("[data-place]").querySelector("[data-add-go]").click();
    });
    function editFormHtml(fields) {
      return '<div data-edit-form>' + fields.map((field) =>
        '<p class="label">' + field.label + '</p><input type="text" data-edit-field="' + field.key + '" value="' + esc(field.value) + '" autocomplete="off" />'
      ).join("") + '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-edit-save>Save</button></div><p class="hint" data-edit-status></p></div>';
    }
    function editFieldsFor(host) {
      const kind = host.dataset.editKind;
      const id = host.dataset.editId;
      if (kind === "added") {
        const item = loadAdded()[Number(id)];
        if (!item || !canEditAdded(item)) return null;
        return [
          { key: "en", label: "English", value: item.word || "" },
          { key: "ru", label: "Russian", value: item.ru || "" }
        ];
      }
      if (!isTeacher()) return null;
      const card = findCatalog(id);
      if (!card) return null;
      if (card.base != null && card.past != null) {
        return [
          { key: "base", label: "Base", value: card.base || "" },
          { key: "past", label: "Past", value: card.past || "" },
          { key: "pp", label: "Past participle", value: card.pp || "" },
          { key: "ru", label: "Russian", value: card.ru || card.def || "" }
        ];
      }
      return [
        { key: "en", label: "English", value: card.en || "" },
        { key: "ru", label: "Russian", value: card.ru || "" }
      ];
    }
    function refreshCatalog() {
      applyLessonEdits();
      applySongEdits();
      paintWordGrid();
      paintExampleGrid("phrasalGrid", phrasalWords, "phrasal");
      paintExampleGrid("idiomGrid", idiomWords, "idiom");
      paintPhraseGrid();
      paintAdverbGrid();
      paintTalkGrid();
      paintLikeGrid();
      paintExtraGrids();
      paintAskGrid();
      paintLineGrid();
      paintVerbs();
      paintAdded();
      paintAllWords();
      const on = document.querySelector("section.on");
      if (on && on.id === "word" && current) {
        if (!cardVisible(current)) show(current.deck || "lesson");
        else renderWord(current);
      }
      if (on && on.id === "musicword") {
        if (!songCards[songKey] || !cardVisible(songCards[songKey])) show("music");
        else renderSong(songKey);
      }
      if (on && on.id === "made" && madeItem) renderMade(madeItem);
    }
    function deleteCard(host) {
      const kind = host.dataset.editKind;
      const id = host.dataset.editId;
      if (kind === "added") {
        const list = loadAdded();
        const index = Number(id);
        const item = list[index];
        if (!item || !canEditAdded(item)) return;
        const place = item.place || "mine";
        const word = item.word;
        const open = madeItem === item;
        list.splice(index, 1);
        saveAdded(list, { op: "delete-card", place: place, word: word });
        paintAdded();
        paintAllWords();
        if (typeof paintHomeStats === "function") paintHomeStats();
        if (open) show("add");
        return;
      }
      if (!isTeacher()) return;
      const card = findCatalog(id);
      if (!card) return;
      const map = loadEdits();
      const origin = card.origin || id;
      map[origin] = Object.assign({}, map[origin] || {}, { deleted: true });
      saveEdits(map, origin);
      refreshCatalog();
    }
    function saveCardEdit(host) {
      const kind = host.dataset.editKind;
      const id = host.dataset.editId;
      const status = host.querySelector("[data-edit-status]");
      const read = (key) => {
        const input = host.querySelector('[data-edit-field="' + key + '"]');
        return input ? input.value.trim() : "";
      };
      const write = (text, bad) => {
        if (!status) return;
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (kind === "added") {
        const list = loadAdded();
        const item = list[Number(id)];
        if (!item || !canEditAdded(item)) return;
        const en = read("en");
        const ru = read("ru");
        if (!en || !ru) { write("Write the English word and the Russian translation.", true); return; }
        const next = midTitle(en);
        const clash = list.some((row, index) => index !== Number(id) && (row.place || "mine") === (item.place || "mine") && String(row.word).toLowerCase() === next.toLowerCase());
        if (clash) { write("Already on this page.", true); return; }
        const prevPlace = item.place || "mine";
        const prevWord = item.word;
        const openMade = madeItem === item;
        item.word = next;
        item.ru = ru;
        saveAdded(list, { op: "put-card", card: item, replacePlace: prevPlace, replaceWord: prevWord });
        paintAdded();
        if (openMade) renderMade(item);
        return;
      }
      if (!isTeacher()) return;
      const card = findCatalog(id);
      if (!card) return;
      const map = loadEdits();
      const origin = card.origin || id;
      if (card.base != null && card.past != null) {
        const base = read("base");
        const past = read("past");
        const pp = read("pp");
        const ru = read("ru");
        if (!base || !past || !pp || !ru) { write("Fill in every field.", true); return; }
        map[origin] = { base: base, past: past, pp: pp, ru: ru };
        if (verbKey === id || verbKey === origin || verbKey === card.base) verbKey = base;
      } else {
        const en = read("en");
        const ru = read("ru");
        if (!en || !ru) { write("Write the English word and the Russian translation.", true); return; }
        map[origin] = { en: en, ru: ru };
        if (host.closest("#madeView") && madeItem) {
          madeItem.word = en;
          madeItem.ru = ru;
        }
      }
      saveEdits(map, origin);
      refreshCatalog();
    }
    async function saveWord(place, input, status, button, openCard) {
      const word = input.value.trim();
      const write = (text, bad) => {
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (!word) {
        write("Type a word or a phrase.", true);
        return;
      }
      if (hideStudentSongs() && place === "music") {
        write("Song cards stay hidden.", true);
        return;
      }
        write("Looking up the dictionaries…", false);
      button.disabled = true;
      try {
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (!res.ok || !data.found) {
          write(data.error || "No such word or phrase.", true);
          return;
        }
        const key = data.word.toLowerCase();
        if (place === "lesson-21" && words.some((have) => have.en.toLowerCase() === key)) {
          write("Already on 21 Sep. Open that card instead of adding a second one.", true);
          return;
        }
        if (place === "music" && words.some((have) => have.en.toLowerCase() === key)) {
          write("Already in Days · 21 Sep. No second card.", true);
          return;
        }
        if (place === "music" && (key === "give up" || key === "moonlight" || key === "won't")) {
          write("Already in Song lyrics or a deck. No second card.", true);
          return;
        }
        const catalog = place === "phrasal" ? phrasalWords : place === "idioms" ? idiomWords : null;
        if (catalog && catalog.some((have) => String(have.en || "").toLowerCase() === key && cardVisible(have))) {
          write("Already on this page.", true);
          return;
        }
        if (loadAdded().some((have) => (have.place || "mine") === place && have.word.toLowerCase() === key)) {
          write("Already on this page.", true);
          return;
        }
        const item = { word: midTitle(data.word), ru: data.ru, data: data, place: place };
        const list = loadAdded();
        list.unshift(item);
        saveAdded(list, { op: "put-card", card: item });
        trackEvent("card", cardArea(place), "add");
        paintAdded();
        input.value = "";
        write("", false);
        if (openCard) renderMade(item);
      } catch (err) {
        write("The dictionary lookup is not running. Start it, then try again.", true);
      } finally {
        button.disabled = false;
      }
    }
    const SONG_KEY = "enquiz-songs";
    let songCache = null;
    function loadSongs() {
      if (songCache) return songCache;
      try { songCache = JSON.parse(localStorage.getItem(SONG_KEY) || "[]"); }
      catch (e) { songCache = []; }
      return songCache;
    }
    function freeStorageRoom() {
      try { localStorage.removeItem("enquiz-anon-backup"); } catch (e) {}
      const raw = localStorage.getItem(ADDED_KEY);
      if (!raw) return;
      try { idbPutAdded(JSON.parse(raw)); } catch (e) {}
      try { localStorage.removeItem(ADDED_KEY); } catch (e) {}
    }
    function writeSongs(list) {
      songCache = list;
      const raw = JSON.stringify(list);
      try {
        localStorage.setItem(SONG_KEY, raw);
        return;
      } catch (e) {}
      freeStorageRoom();
      try {
        localStorage.setItem(SONG_KEY, raw);
      } catch (e) {}
      idbPutSongs(list);
    }
    function saveSongs(list, song, cards) {
      writeSongs(list);
      if (song && song.id) {
        const copy = Object.assign({}, song);
        delete copy.blob;
        const change = { op: "put-song", song: copy };
        if (cards && cards.length) change.cards = cards.map((card) => {
          const next = Object.assign({}, card);
          delete next.blob;
          return next;
        });
        syncChange(change);
      }
    }
    function storeLyricSong(song, cards) {
      const list = loadSongs();
      const index = list.findIndex((item) => item && item.id === song.id);
      if (index >= 0) list[index] = song;
      else list.push(song);
      saveSongs(list, song, cards);
      return index < 0;
    }
    function visibleSongs() {
      return loadSongs().filter((song) => !song.archived);
    }
    function cardIndex() {
      const map = new Map();
      words.forEach((item) => { if (cardVisible(item)) map.set(item.en.toLowerCase(), { kind: "lesson", en: item.en }); });
      extraWords.forEach((item) => { if (cardVisible(item)) map.set(item.en.toLowerCase(), { kind: "extra", en: item.en }); });
      Object.keys(songCards).forEach((key) => {
        if (hideStudentSongs() || !cardVisible(songCards[key])) return;
        map.set(songCards[key].en.toLowerCase(), { kind: "song", en: songCards[key].en, key: key });
      });
      phrasalWords.forEach((item) => {
        if (!item || !cardVisible(item)) return;
        const key = String(item.en || "").trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { kind: "phrasal", en: item.en });
      });
      idiomWords.forEach((item) => {
        if (!item || !cardVisible(item)) return;
        const key = String(item.en || "").trim().toLowerCase();
        if (key && !map.has(key)) map.set(key, { kind: "idioms", en: item.en });
      });
      loadAdded().forEach((item) => {
        const key = String(item.word || "").trim().toLowerCase();
        if (!key || map.has(key)) return;
        const place = item.place || "mine";
        const kind = place === "phrasal" || place === "idioms" ? place : "added";
        map.set(key, { kind: kind, en: item.word });
      });
      (window.IRREGULAR || []).forEach((verb) => {
        if (!cardVisible(verb)) return;
        [verb.base, verb.past, verb.pp].forEach((form) => {
          verbAlts(form).forEach((alt) => {
            const key = String(alt || "").trim().toLowerCase();
            if (key && !map.has(key)) map.set(key, { kind: "verb", en: verb.base });
          });
        });
      });
      return map;
    }
    function cardForLyric(key) {
      const map = cardIndex();
      const raw = String(key || "").trim().toLowerCase();
      if (!raw) return null;
      if (map.has(raw)) return map.get(raw);
      const stems = [raw];
      if (raw.endsWith("ies") && raw.length > 4) stems.push(raw.slice(0, -3) + "y");
      if (raw.endsWith("es") && raw.length > 3) stems.push(raw.slice(0, -2));
      if (raw.endsWith("s") && raw.length > 3) stems.push(raw.slice(0, -1));
      if (raw.endsWith("ing") && raw.length > 5) {
        stems.push(raw.slice(0, -3));
        stems.push(raw.slice(0, -3) + "e");
      }
      if (raw.endsWith("ed") && raw.length > 4) {
        stems.push(raw.slice(0, -2));
        stems.push(raw.slice(0, -1));
      }
      for (let i = 0; i < stems.length; i++) {
        if (map.has(stems[i])) return map.get(stems[i]);
      }
      return null;
    }
    function mediaDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("enquiz-media", 4);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
          if (!db.objectStoreNames.contains("added")) db.createObjectStore("added");
          if (!db.objectStoreNames.contains("stash")) db.createObjectStore("stash");
          if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    function idbPutFile(id, file) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put({ blob: file, name: file.name, type: file.type || "" }, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
    function idbGetFile(id) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readonly");
        const req = tx.objectStore("files").get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }));
    }
    function idbPutSongs(list) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("songs")) { resolve(); return; }
        const tx = db.transaction("songs", "readwrite");
        tx.objectStore("songs").put(list, "list");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })).catch(() => {});
    }
    function idbGetSongs() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("songs")) { resolve(null); return; }
        const req = db.transaction("songs", "readonly").objectStore("songs").get("list");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })).catch(() => null);
    }
    function idbPutAdded(list) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("added", "readwrite");
        tx.objectStore("added").put(list, "list");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })).catch(() => {});
    }
    function idbGetAdded() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("added")) { resolve(null); return; }
        const req = db.transaction("added", "readonly").objectStore("added").get("list");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })).catch(() => null);
    }
    function idbDeleteFile(id) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
    function idbPutStash(snap) {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction("stash", "readwrite");
        tx.objectStore("stash").put(snap, "developer");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("stash"));
      }));
    }
    function idbGetStash() {
      return mediaDb().then((db) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains("stash")) { resolve(null); return; }
        const req = db.transaction("stash", "readonly").objectStore("stash").get("developer");
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })).catch(() => null);
    }
    function idbDeleteStash() {
      return mediaDb().then((db) => new Promise((resolve) => {
        if (!db.objectStoreNames.contains("stash")) { resolve(); return; }
        const tx = db.transaction("stash", "readwrite");
        tx.objectStore("stash").delete("developer");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })).catch(() => {});
    }
    const songBlobUrls = {};
    function forgetBlobUrl(id) {
      if (!songBlobUrls[id]) return;
      URL.revokeObjectURL(songBlobUrls[id]);
      delete songBlobUrls[id];
    }
    function blobUrlFor(id) {
      if (songBlobUrls[id]) return Promise.resolve(songBlobUrls[id]);
      return idbGetFile(id).then((rec) => {
        if (!rec || !rec.blob) return "";
        songBlobUrls[id] = URL.createObjectURL(rec.blob);
        return songBlobUrls[id];
      }).catch(() => "");
    }
    function linkParts(url) {
      try { return new URL(String(url || "").trim()); }
      catch (err) { return null; }
    }
    function youtubeId(url) {
      const parsed = linkParts(url);
      if (!parsed) return "";
      const host = parsed.hostname.replace(/^www\./, "");
      let id = "";
      if (host === "youtu.be") id = parsed.pathname.split("/").filter(Boolean)[0] || "";
      else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
        id = parsed.searchParams.get("v") || "";
        if (!id && parsed.pathname.indexOf("/embed/") === 0) id = parsed.pathname.split("/")[2] || "";
        if (!id && parsed.pathname.indexOf("/shorts/") === 0) id = parsed.pathname.split("/")[2] || "";
      }
      return /^[\w-]{6,}$/.test(id) ? id : "";
    }
    function vimeoId(url) {
      const parsed = linkParts(url);
      if (!parsed) return "";
      const host = parsed.hostname.replace(/^www\./, "");
      if (host !== "vimeo.com" && host !== "player.vimeo.com") return "";
      const id = (parsed.pathname.split("/").filter(Boolean).pop() || "");
      return /^\d+$/.test(id) ? id : "";
    }
    function spotifyEmbed(url) {
      const parsed = linkParts(url);
      if (!parsed || !/(^|\.)spotify\.com$/.test(parsed.hostname.replace(/^www\./, ""))) return "";
      const parts = parsed.pathname.split("/").filter(Boolean);
      const kindAt = parts.findIndex((part) => part === "track" || part === "album" || part === "playlist" || part === "episode");
      if (kindAt < 0 || !parts[kindAt + 1]) return "";
      const kind = parts[kindAt];
      const id = parts[kindAt + 1].split("?")[0];
      const height = kind === "track" || kind === "episode" ? 152 : 232;
      return '<iframe class="player" style="height:' + height + 'px" src="https://open.spotify.com/embed/' + kind + "/" + encodeURIComponent(id) + '" title="Music" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>';
    }
    function isDirectAudio(url) {
      return /\.(mp3|ogg|wav|m4a|aac|flac)(\?|#|$)/i.test(String(url || ""));
    }
    function isDirectVideo(url) {
      return /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i.test(String(url || ""));
    }
    function openLink(label, url) {
      return '<p><a href="' + esc(url) + '" target="_blank" rel="noreferrer">' + label + "</a></p>";
    }
    function videoHtml(url) {
      const link = String(url || "").trim();
      if (!link) return "";
      let player = "";
      const youtube = youtubeId(link);
      const vimeo = vimeoId(link);
      if (youtube) player = '<iframe class="player tall" id="yt' + embedSerial() + '" src="https://www.youtube.com/embed/' + esc(youtube) + '?enablejsapi=1" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      else if (vimeo) player = '<iframe class="player tall" src="https://player.vimeo.com/video/' + esc(vimeo) + '" title="Video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      else if (isDirectVideo(link)) player = '<video class="player" controls src="' + esc(link) + '"></video>';
      else player = openLink("Open the video", link);
      return songPlayerHtml("video", '<p class="label">Video</p>' + player);
    }
    function musicHtml(url) {
      const link = String(url || "").trim();
      if (!link) return "";
      let player = "";
      const spotify = spotifyEmbed(link);
      if (spotify) player = spotify;
      else if (isDirectAudio(link)) player = '<audio class="player" controls src="' + esc(link) + '"></audio>';
      else if (/soundcloud\.com/i.test(link)) player = '<iframe class="player tall" src="https://w.soundcloud.com/player/?url=' + encodeURIComponent(link) + '" title="Music" allow="autoplay"></iframe>';
      else player = openLink("Open the music", link);
      return songPlayerHtml("music", '<p class="label">Music</p>' + player);
    }
    function filePlayerHtml(src, type, name) {
      const kind = String(type || "");
      const player = kind.indexOf("video/") === 0
        ? '<video class="player" controls src="' + esc(src) + '"></video>'
        : (kind.indexOf("audio/") === 0 || isDirectAudio(name) ? '<audio class="player" controls src="' + esc(src) + '"></audio>' : openLink(name || "Open the file", src));
      return songPlayerHtml("file", '<p class="label">File</p>' + player + (name ? '<p class="hint">' + esc(name) + "</p>" : ""));
    }
    let embedCount = 0;
    function embedSerial() { embedCount += 1; return embedCount; }
    function songPlayerHtml(kind, html) {
      if (!html) return "";
      return '<div class="song-player" data-song-player="' + kind + '">' + html + '</div>';
    }
    function settleSongEmbeds(root) {
      (root || document).querySelectorAll(".song-player iframe, .song-player audio, .song-player video").forEach((node) => {
        node.style.setProperty("position", "relative", "important");
        node.style.setProperty("top", "auto", "important");
        node.style.setProperty("left", "auto", "important");
        node.style.setProperty("right", "auto", "important");
        node.style.setProperty("bottom", "auto", "important");
        node.style.setProperty("transform", "none", "important");
      });
    }
    function releaseSongPlayer(box) {
      if (!box) return;
      box.classList.remove("is-playing");
      box.style.position = "";
      box.style.top = "";
      box.style.left = "";
      box.style.width = "";
      box.style.zIndex = "";
      const spacer = box.previousElementSibling;
      if (spacer && spacer.classList.contains("song-player-spacer")) spacer.remove();
    }
    function setSongPlayer(box, playing) {
      if (!box) return;
      if (playing) {
        document.querySelectorAll(".song-player.is-playing").forEach((el) => { if (el !== box) releaseSongPlayer(el); });
        box.classList.add("is-playing");
        placePlayingPlayer();
        return;
      }
      releaseSongPlayer(box);
    }
    function playerStickTop() {
      const bar = document.querySelector(".top");
      const meta = document.querySelector("#song.on .meta") || document.querySelector("section.on .meta");
      const stuck = (bar ? bar.offsetHeight : 0) + (meta ? meta.offsetHeight : 0);
      const metaBottom = meta ? meta.getBoundingClientRect().bottom : stuck;
      return Math.round(Math.max(stuck, metaBottom));
    }
    function hoistSpotify(root) {
      const user = document.getElementById("songUser");
      if (!user) return;
      (root || user).querySelectorAll(".song-player[data-song-player='music']").forEach((box) => {
        if (box.closest("[hidden], [data-lyric-meta-editor], [data-lyric-music-preview]")) return;
        if (box.parentElement === user) return;
        const media = user.querySelector("[data-song-media]");
        if (media && media.parentElement === user) media.after(box);
        else user.prepend(box);
      });
    }
    function stickSpotify() {
      hoistSpotify();
      document.querySelectorAll("#songUser > .song-player[data-song-player='music']").forEach((box) => {
        if (!box.classList.contains("is-playing")) {
          box.style.position = "";
          box.style.top = "";
          box.style.zIndex = "";
          return;
        }
        box.style.position = "sticky";
        box.style.top = playerStickTop() + "px";
        box.style.zIndex = "5";
        settleSongEmbeds(box);
      });
    }
    function placePlayingPlayer() {
      stickSpotify();
      const box = document.querySelector(".song-player.is-playing");
      if (!box || box.getAttribute("data-song-player") === "music") return;
      if (!box.previousElementSibling || !box.previousElementSibling.classList.contains("song-player-spacer")) {
        const spacer = document.createElement("div");
        spacer.className = "song-player-spacer";
        box.before(spacer);
      }
      const spacer = box.previousElementSibling;
      const rect = spacer.getBoundingClientRect();
      settleSongEmbeds(document);
      box.style.position = "fixed";
      box.style.top = playerStickTop() + "px";
      box.style.left = Math.round(rect.left) + "px";
      box.style.width = Math.round(rect.width) + "px";
      spacer.style.height = box.offsetHeight + "px";
    }
    function greetEmbed(iframe) {
      const win = iframe.contentWindow;
      if (!win) return;
      const kind = iframe.dataset.embed;
      if (kind === "youtube") win.postMessage(JSON.stringify({ event: "listening", id: iframe.id, channel: "widget" }), "*");
      else if (kind === "vimeo") ["play", "pause", "ended"].forEach((name) => win.postMessage(JSON.stringify({ method: "addEventListener", value: name }), "*"));
      else if (kind === "soundcloud") ["play", "pause", "finish"].forEach((name) => win.postMessage(JSON.stringify({ method: "addEventListener", value: name }), "*"));
    }
    function ensureSpotifyApi() {
      if (window.__spotifyEmbedApi) return;
      if (!window.__spotifyEmbedWait) window.__spotifyEmbedWait = [];
      if (window.__spotifyEmbedHook) return;
      window.__spotifyEmbedHook = true;
      const previous = window.onSpotifyIframeApiReady;
      window.onSpotifyIframeApiReady = (api) => {
        window.__spotifyEmbedApi = api;
        if (typeof previous === "function") previous(api);
        const wait = window.__spotifyEmbedWait || [];
        window.__spotifyEmbedWait = [];
        wait.forEach((iframe) => attachSpotify(iframe));
      };
      if (!document.getElementById("spotifyIframeApi")) {
        const script = document.createElement("script");
        script.id = "spotifyIframeApi";
        script.async = true;
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        document.head.appendChild(script);
      }
    }
    function spotifyUriFrom(iframe) {
      const src = (iframe && (iframe.getAttribute("src") || iframe.dataset.spotifyUri)) || "";
      const match = String(src).match(/embed\/(track|album|playlist|episode)\/([A-Za-z0-9]+)/);
      if (!match) return "";
      return "spotify:" + match[1] + ":" + match[2];
    }
    function attachSpotify(iframe) {
      if (!iframe || iframe.dataset.spotifyOn === "1") return;
      const uri = spotifyUriFrom(iframe);
      if (uri) iframe.dataset.spotifyUri = uri;
      const api = window.__spotifyEmbedApi;
      if (!api) {
        ensureSpotifyApi();
        if (window.__spotifyEmbedWait.indexOf(iframe) < 0) window.__spotifyEmbedWait.push(iframe);
        return;
      }
      if (!uri) return;
      iframe.dataset.spotifyOn = "1";
      const height = uri.indexOf(":track:") >= 0 || uri.indexOf(":episode:") >= 0 ? 152 : 232;
      try {
        api.createController(iframe, { uri: uri, width: "100%", height: height }, (controller) => {
          const live = (controller && controller.iframeElement) || iframe;
          if (live.classList) live.classList.add("player");
          live.dataset.embed = "spotify";
          const box = live.closest(".song-player");
          settleSongEmbeds(box || document);
          const apply = (data) => {
            if (!box || !data || (data.isPaused == null && data.isBuffering == null)) return;
            setSongPlayer(box, data.isPaused === false || data.isBuffering === true);
          };
          controller.addListener("playback_update", (event) => apply(event && event.data));
          controller.addListener("playback_started", () => { if (box) setSongPlayer(box, true); });
        });
      } catch (err) { iframe.dataset.spotifyOn = ""; }
    }
    function watchSongPlayers(root) {
      (root || document).querySelectorAll("iframe.player").forEach((iframe) => {
        const src = iframe.getAttribute("src") || "";
        if (/youtube\.com/.test(src)) iframe.dataset.embed = "youtube";
        else if (/vimeo\.com/.test(src)) iframe.dataset.embed = "vimeo";
        else if (/spotify\.com/.test(src)) iframe.dataset.embed = "spotify";
        else if (/soundcloud\.com/.test(src)) iframe.dataset.embed = "soundcloud";
        else return;
        if (iframe.dataset.embed === "spotify") { attachSpotify(iframe); stickSpotify(); return; }
        if (iframe.dataset.armed === "1") return;
        iframe.dataset.armed = "1";
        iframe.addEventListener("load", () => greetEmbed(iframe));
        greetEmbed(iframe);
      });
    }
    function songPlayerFromMedia(event) {
      const node = event.target;
      if (!node || !node.closest) return null;
      if (node.tagName !== "AUDIO" && node.tagName !== "VIDEO") return null;
      return node.closest(".song-player");
    }
    function onEmbedMessage(event) {
      const frames = document.querySelectorAll("iframe.player");
      let iframe = null;
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === event.source) { iframe = frames[i]; break; }
      }
      if (!iframe) return;
      const box = iframe.closest(".song-player");
      if (!box) return;
      let data = event.data;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch (err) { return; } }
      if (!data || typeof data !== "object") return;
      if (!iframe.dataset.embed && /spotify\.com/.test(iframe.getAttribute("src") || "")) iframe.dataset.embed = "spotify";
      const kind = iframe.dataset.embed;
      if (kind === "youtube") {
        if (data.event === "onReady" || data.event === "initialDelivery") greetEmbed(iframe);
        if (data.event === "onStateChange") setSongPlayer(box, Number(data.info) === 1 || Number(data.info) === 3);
        if (data.event === "infoDelivery" && data.info && data.info.playerState != null) setSongPlayer(box, Number(data.info.playerState) === 1 || Number(data.info.playerState) === 3);
      } else if (kind === "vimeo") {
        if (data.event === "play") setSongPlayer(box, true);
        if (data.event === "pause" || data.event === "ended") setSongPlayer(box, false);
      } else if (kind === "soundcloud") {
        if (data.method === "play") setSongPlayer(box, true);
        if (data.method === "pause" || data.method === "finish") setSongPlayer(box, false);
      } else if (kind === "spotify") {
        const payload = data.payload && typeof data.payload === "object" ? data.payload : {};
        if (data.type === "playback_started") setSongPlayer(box, true);
        else if (data.type === "playback_update") {
          if (payload.isPaused == null && payload.isBuffering == null) return;
          setSongPlayer(box, payload.isPaused === false || payload.isBuffering === true);
        }
      }
    }
    document.addEventListener("play", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, true); }, true);
    document.addEventListener("pause", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, false); }, true);
    document.addEventListener("ended", (event) => { const box = songPlayerFromMedia(event); if (box) setSongPlayer(box, false); }, true);
    window.addEventListener("message", onEmbedMessage);
    window.addEventListener("scroll", () => { settleSongEmbeds(); placePlayingPlayer(); }, true);
    window.addEventListener("resize", () => stickSpotify());
    function mediaOf(song) {
      let video = (song && song.videoUrl) || "";
      let music = (song && song.musicUrl) || "";
      const legacy = !video && !music ? ((song && song.url) || "") : "";
      if (legacy) {
        if (youtubeId(legacy) || vimeoId(legacy) || isDirectVideo(legacy)) video = legacy;
        else music = legacy;
      }
      return { video: video, music: music };
    }
    function songFilePath(id) {
      const base = "/api/song-file?id=" + encodeURIComponent(id);
      return viewAccount ? base + "&for=" + encodeURIComponent(viewAccount.id) : base;
    }
    const editUpload = { xhr: null };
    const lyricUpload = { xhr: null };
    let editFileSent = false;
    let lyricFileSent = false;
    let pendingLyricId = "";
    function uploadSongFile(id, blob, type, onProgress, holder) {
      if (!authUser || accountApi() || !id || !blob) return Promise.resolve(false);
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        if (holder) holder.xhr = xhr;
        xhr.open("PUT", songFilePath(id));
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", type || blob.type || "audio/mpeg");
        xhr.upload.onprogress = (event) => {
          if (onProgress && event.lengthComputable && event.total) onProgress(event.loaded / event.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(true);
          else reject(new Error("fail"));
        };
        xhr.onerror = () => reject(new Error("fail"));
        xhr.onabort = () => resolve(false);
        xhr.send(blob);
      });
    }
    function pushSongFile(id, blob, type) {
      return uploadSongFile(id, blob, type).catch(() => {});
    }
    function paintRing(box, ring, label, button, ratio, text) {
      if (!box || !ring) return;
      if (ratio == null) {
        box.hidden = true;
        if (button) button.disabled = false;
        return;
      }
      const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
      box.hidden = false;
      ring.style.setProperty("--p", String(pct));
      const num = ring.querySelector("b");
      if (num) num.textContent = String(pct);
      if (label) label.textContent = text || "";
      if (button) button.disabled = pct < 100;
    }
    function dropSongFile(id) {
      if (!authUser || accountApi() || !id) return Promise.resolve();
      return fetch(songFilePath(id), { method: "DELETE", credentials: "include" }).catch(() => {});
    }
    let mediaPaint = 0;
    function paintSongMedia(song, box) {
      const token = ++mediaPaint;
      const slots = mediaOf(song);
      const draw = (fileHtml) => {
        if (token !== mediaPaint || !box) return;
        box.innerHTML = videoHtml(slots.video) + (fileHtml || "") + musicHtml(slots.music);
        hoistSpotify(box);
        watchSongPlayers(document.getElementById("songUser") || box);
      };
      if (!song || !song.fileName) { draw(""); return; }
      const remote = !accountApi() && authUser ? songFilePath(song.id) : "";
      blobUrlFor(song.id).then((src) => {
        if (token !== mediaPaint) return;
        if (src) {
          draw(filePlayerHtml(src, song.fileType, song.fileName));
          idbGetFile(song.id).then((rec) => { if (rec && rec.blob) pushSongFile(song.id, rec.blob, rec.type || song.fileType); });
          return;
        }
        if (!remote) {
          draw('<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
          return;
        }
        fetch(remote, { method: "HEAD", credentials: "include" }).then((res) => {
          if (token !== mediaPaint) return;
          draw(res.ok ? filePlayerHtml(remote, song.fileType || "audio/mpeg", song.fileName) : '<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
        }).catch(() => {
          if (token !== mediaPaint) return;
          draw('<p class="label">File</p><p class="hint">' + esc(song.fileName) + "</p>");
        });
      });
    }
    function lyricPieces(text) {
      const phrases = [];
      cardIndex().forEach((value, key) => { if (key.indexOf(" ") > 0) phrases.push(key); });
      phrases.sort((a, b) => b.length - a.length);
      const raw = [];
      const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
      let last = 0;
      let match;
      while ((match = re.exec(text))) {
        if (match.index > last) raw.push({ gap: text.slice(last, match.index) });
        raw.push({ word: match[0], key: match[0].toLowerCase().replace(/’/g, "'") });
        last = match.index + match[0].length;
      }
      if (last < text.length) raw.push({ gap: text.slice(last) });
      const wordAt = [];
      raw.forEach((part, index) => { if (part.word) wordAt.push(index); });
      const grouped = {};
      wordAt.forEach((index, start) => {
        if (grouped[index]) return;
        phrases.forEach((phrase) => {
          if (grouped[index]) return;
          const bits = phrase.split(/\s+/);
          if (start + bits.length > wordAt.length) return;
          for (let n = 0; n < bits.length; n++) {
            if (raw[wordAt[start + n]].key !== bits[n]) return;
          }
          let crossed = false;
          for (let n = 0; n < bits.length - 1; n++) {
            let gap = "";
            const from = wordAt[start + n];
            const to = wordAt[start + n + 1];
            for (let k = from + 1; k < to; k++) if (raw[k] && raw[k].gap != null) gap += raw[k].gap;
            if (gap.indexOf("\n") >= 0) { crossed = true; break; }
          }
          if (crossed) return;
          for (let n = 0; n < bits.length; n++) grouped[wordAt[start + n]] = phrase;
          raw[index].phrase = phrase;
          raw[index].phraseEnd = wordAt[start + bits.length - 1];
        });
      });
      return { raw: raw, grouped: grouped };
    }
    function lyricKeys(text) {
      const pieces = lyricPieces(text);
      const keys = [];
      const seen = {};
      pieces.raw.forEach((part) => {
        if (!part.word || pieces.grouped[pieces.raw.indexOf(part)]) return;
        if (seen[part.key]) return;
        seen[part.key] = true;
        keys.push(part.key);
      });
      pieces.raw.forEach((part, index) => {
        if (!part.phrase || pieces.grouped[index] !== part.phrase) return;
        if (seen[part.phrase]) return;
        seen[part.phrase] = true;
        keys.push(part.phrase);
      });
      return keys;
    }
    function lyricHtml(text, marks) {
      const pieces = lyricPieces(text);
      const known = cardIndex();
      let html = "";
      for (let i = 0; i < pieces.raw.length; i++) {
        const part = pieces.raw[i];
        if (part.gap != null) { html += esc(part.gap); continue; }
        if (part.phrase) {
          let label = "";
          for (let n = i; n <= part.phraseEnd; n++) label += pieces.raw[n].gap != null ? pieces.raw[n].gap : pieces.raw[n].word;
          const mark = marks[part.phrase] || (known.has(part.phrase) ? { state: "have" } : null);
          html += lyricMark(label, part.phrase, mark);
          i = part.phraseEnd;
          continue;
        }
        html += lyricMark(part.word, part.key, marks[part.key]);
      }
      return html;
    }
    function lyricCountLine(added, missed) {
      const cards = added === 1 ? "1 new card" : added + " new cards";
      const red = missed === 1 ? "1 word is red" : missed + " words are red";
      return cards + ". " + red + ".";
    }
    const LEARNED_KEY = "enquiz-learned";
    function loadLearned() {
      try { return new Set(JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]")); }
      catch (e) { return new Set(); }
    }
    let lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
    function songStat(keys, marks) {
      const learnedSet = loadLearned();
      const index = cardIndex();
      let words = 0;
      let fresh = 0;
      let learned = 0;
      let phrasal = 0;
      let idioms = 0;
      keys.forEach((key) => {
        words += 1;
        const rawMark = marks[key];
        const mark = rawMark && typeof rawMark === "object" ? rawMark : {};
        if (mark.state === "new") fresh += 1;
        const openKey = mark.word ? String(mark.word).toLowerCase() : key;
        if ((mark.state === "have" || mark.state === "new") && learnedSet.has(openKey)) learned += 1;
        if (mark.state !== "new" || String(key).indexOf(" ") < 0) return;
        const known = index.get(String(openKey).toLowerCase()) || index.get(String(key).toLowerCase());
        const kind = mark.deck || (known && known.kind) || "";
        if (kind === "idioms") idioms += 1;
        else if (kind === "phrasal") phrasal += 1;
      });
      return { words: words, fresh: fresh, learned: learned, left: Math.max(0, words - learned), phrasal: phrasal, idioms: idioms };
    }
    function phraseBit(count, one, many) {
      const n = count || 0;
      return n + " " + (n === 1 ? one : many);
    }
    function statsLine(stats) {
      return stats.words + " words · " + stats.fresh + " new · " + stats.learned + " learned · " + stats.left + " still to learn · " + phraseBit(stats.phrasal, "phrasal verb", "phrasal verbs") + " · " + phraseBit(stats.idioms, "idiom", "idioms");
    }
    function songRow(number, title, artist, about, attrs) {
      const who = artist ? '<span class="plain">. ' + esc(artist) + "</span>" : "";
      return '<button class="day active" type="button" ' + attrs + '><span class="date">' + number + '</span><span class="song-line"><b>' + esc(title) + "</b>" + who + '</span><span class="label about">' + esc(about) + "</span></button>";
    }
    function lyricMark(label, key, mark) {
      if (!mark || mark.state === "error" || mark.state === "miss") return '<button class="word lyric-miss" type="button" data-lyric-open="' + esc(key) + '">' + esc(label) + "</button>";
      const openKey = mark.word ? String(mark.word).toLowerCase() : key;
      const learned = loadLearned().has(openKey) ? " learned" : "";
      return '<button class="word' + learned + '" type="button" data-lyric-open="' + esc(openKey) + '">' + esc(label) + "</button>";
    }
    function setSongHead(title, artist) {
      document.getElementById("songTitle").textContent = title;
      document.getElementById("songBanner").textContent = title;
      document.getElementById("songBannerArtist").textContent = artist || "";
    }
    function showSampleSong() {
      setSongHead("Sample line", "");
      document.getElementById("songSample").hidden = false;
      const user = document.getElementById("songUser");
      user.hidden = true;
      user.dataset.songId = "";
    }
    function applyLyricSize(root) {
      (root || document).querySelectorAll(".lyric-text").forEach((el) => { el.style.fontSize = lyricSize + "px"; });
    }
    function renderUserSong(song) {
      setSongHead(song.title, song.artist || "");
      document.getElementById("songSample").hidden = true;
      const user = document.getElementById("songUser");
      user.hidden = false;
      user.dataset.songId = song.id;
      let lyricBody = "";
      try { lyricBody = lyricHtml(song.lyrics || "", song.marks || {}); }
      catch (e) { lyricBody = esc(song.lyrics || ""); }
      let checkLine = "";
      try {
        const keys = Object.keys(song.marks || {});
        checkLine = statsLine(songStat(keys, song.marks || {}));
      } catch (e) { checkLine = ""; }
      user.innerHTML = '<div data-song-media></div>' +
        '<div class="row" style="margin-bottom:8px"><button class="btn" type="button" data-lyric-size="-1">A−</button><button class="btn" type="button" data-lyric-size="1">A+</button><button class="btn" type="button" data-lyric-meta>Edit song</button><button class="btn" type="button" data-lyric-edit>Edit lyric</button><button class="btn" type="button" data-lyric-archive>Archive</button></div>' +
        '<p class="hint" data-lyric-check>' + esc(checkLine) + "</p>" +
        '<div data-lyric-meta-editor hidden><p class="label">Song title</p><input type="text" data-lyric-title autocomplete="off" /><p class="label">Artist</p><input type="text" data-lyric-artist placeholder="Band or singer" autocomplete="off" /><p class="label">Video link</p><input type="text" data-lyric-video placeholder="YouTube or another video link" autocomplete="off" /><div data-lyric-video-preview></div><p class="label">Music link</p><input type="text" data-lyric-music placeholder="Spotify, a music site, or a direct audio link" autocomplete="off" /><div data-lyric-music-preview></div><p class="label">File</p><div class="drop" data-lyric-drop>Drop a file here, or <button class="btn" type="button" data-lyric-file-pick>choose a file</button><input type="file" data-lyric-file accept="audio/*,video/*" hidden /></div><p class="hint" data-lyric-file-name></p><p class="file-progress" data-lyric-file-progress hidden><span class="ring" data-lyric-file-ring style="--p:0"><b>0</b></span><span data-lyric-file-progress-text></span></p><div data-lyric-file-preview></div><div class="row" style="margin-top:8px"><button class="btn" type="button" data-lyric-file-clear>Remove file</button><button class="btn primary" type="button" data-lyric-meta-save>Save</button></div><p class="hint" data-lyric-meta-status></p></div>' +
        '<div data-lyric-editor hidden><textarea data-lyric-draft></textarea><div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-lyric-recheck>Check the words again</button></div><p class="hint" data-lyric-edit-status></p></div>' +
        '<div class="lyric-text">' + lyricBody + "</div>";
      const titleInput = user.querySelector("[data-lyric-title]");
      const artistInput = user.querySelector("[data-lyric-artist]");
      const slots = mediaOf(song);
      const videoInput = user.querySelector("[data-lyric-video]");
      const musicInput = user.querySelector("[data-lyric-music]");
      if (titleInput) titleInput.value = song.title || "";
      if (artistInput) artistInput.value = song.artist || "";
      if (videoInput) videoInput.value = slots.video || "";
      if (musicInput) musicInput.value = slots.music || "";
      pendingEditFile = null;
      editFileSent = false;
      editFileRemoved = false;
      const fileName = user.querySelector("[data-lyric-file-name]");
      if (fileName) fileName.textContent = song.fileName || "";
      paintSongMedia(song, user.querySelector("[data-song-media]"));
      refreshEditMedia();
      const draft = user.querySelector("[data-lyric-draft]");
      if (draft) draft.value = song.lyrics;
      applyLyricSize(user);
    }
    async function saveSongMeta() {
      const id = document.getElementById("songUser").dataset.songId;
      const list = loadSongs();
      const song = list.find((item) => item.id === id);
      const status = document.querySelector("#songUser [data-lyric-meta-status]");
      if (!song || !status) return;
      const title = document.querySelector("#songUser [data-lyric-title]").value.trim();
      const artist = document.querySelector("#songUser [data-lyric-artist]").value.trim();
      const video = document.querySelector("#songUser [data-lyric-video]").value.trim();
      const music = document.querySelector("#songUser [data-lyric-music]").value.trim();
      if (!title) {
        status.textContent = "Write the song title.";
        status.classList.add("bad");
        return;
      }
      song.title = title;
      song.artist = artist;
      song.videoUrl = video;
      song.musicUrl = music;
      song.url = "";
      try {
        if (editFileRemoved) {
          await idbDeleteFile(song.id);
          forgetBlobUrl(song.id);
          await dropSongFile(song.id);
          song.fileName = "";
          song.fileType = "";
        } else if (pendingEditFile) {
          await idbPutFile(song.id, pendingEditFile);
          forgetBlobUrl(song.id);
          if (!editFileSent) await uploadSongFile(song.id, pendingEditFile, pendingEditFile.type || "", (ratio) => paintEditRing(ratio, "Uploading…"), editUpload);
          song.fileName = pendingEditFile.name;
          song.fileType = pendingEditFile.type || "";
        }
      } catch (err) {
        status.textContent = "The file could not be saved.";
        status.classList.add("bad");
        return;
      }
      saveSongs(list, song);
      paintLyrics();
      renderUserSong(song);
    }
    function openLyricSong(id) {
      const song = loadSongs().find((item) => item.id === id);
      if (!song || song.archived) return;
      renderUserSong(song);
      visit("song");
    }
    function paintLyrics() {
      const list = visibleSongs();
      const count = document.getElementById("lyricCount");
      if (count) count.textContent = String(list.length);
      const box = document.getElementById("lyricList");
      if (!box) return;
      let html = "";
      list.forEach((song, index) => {
        let about = "";
        try {
          const keys = Object.keys(song.marks || {});
          about = statsLine(songStat(keys, song.marks || {}));
        } catch (e) {
          about = "";
        }
        html += songRow(index + 1, song.title, song.artist || "", about, 'data-lyric="' + esc(song.id) + '"');
      });
      box.innerHTML = html;
      applyCardSearch(box.closest("section"));
    }
    function rememberLyricCard(data, place, fromSong, bucket) {
      const deck = place || "music";
      if (hideStudentSongs() && deck === "music") return false;
      const key = String(data.word || "").trim().toLowerCase();
      if (!key || cardIndex().has(key)) return false;
      const list = loadAdded();
      const item = { word: midTitle(data.word), ru: data.ru || "", data: data, place: deck };
      if (data.expressionKey) item.expressionKey = data.expressionKey;
      if (data.expressionType) item.expressionType = data.expressionType;
      if (fromSong && (deck === "phrasal" || deck === "idioms")) item.fromSong = fromSong;
      list.unshift(item);
      saveAdded(list, bucket ? null : { op: "put-card", card: item });
      if (bucket) bucket.push(item);
      trackEvent("card", cardArea(deck), "add");
      return true;
    }
    function songTitleFor(word) {
      const key = String(word || "").trim().toLowerCase();
      if (!key || key.indexOf(" ") < 0) return "";
      const songs = loadSongs();
      for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (!song || song.archived) continue;
        if ((song.marks || {})[key] || spanOnOneLine(song.lyrics || "", key.split(/\s+/))) return song.title || "";
      }
      return "";
    }
    function spanOnOneLine(text, bits) {
      if (!bits || bits.length < 2) return false;
      const source = String(text || "");
      const words = [];
      const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
      let match;
      while ((match = re.exec(source))) words.push({ key: match[0].toLowerCase().replace(/’/g, "'"), start: match.index, end: match.index + match[0].length });
      for (let i = 0; i + bits.length <= words.length; i++) {
        let same = true;
        for (let n = 0; n < bits.length; n++) if (words[i + n].key !== bits[n]) { same = false; break; }
        if (!same) continue;
        if (source.slice(words[i].end, words[i + bits.length - 1].start).indexOf("\n") < 0) return true;
      }
      return false;
    }
    const STRONG_PARTICLE = { up: 1, out: 1, off: 1, down: 1, away: 1, back: 1, over: 1, through: 1, into: 1, around: 1, along: 1, apart: 1, aside: 1, ahead: 1, together: 1 };
    const WEAK_PARTICLE = { on: 1, in: 1, for: 1, with: 1, after: 1 };
    const PHRASE_STOP = { a: 1, an: 1, the: 1, of: 1, to: 1, and: 1, or: 1, at: 1, by: 1, from: 1, as: 1, is: 1, are: 1, was: 1, were: 1, be: 1, been: 1, am: 1, do: 1, does: 1, did: 1, it: 1, its: 1, this: 1, that: 1, i: 1, you: 1, he: 1, she: 1, we: 1, they: 1, my: 1, your: 1, his: 1, her: 1, our: 1, their: 1, me: 1, him: 1, them: 1, not: 1, no: 1, so: 1, if: 1, but: 1 };
    const REFLEXIVE = { myself: 1, yourself: 1, himself: 1, herself: 1, itself: 1, ourselves: 1, yourselves: 1, themselves: 1, oneself: 1 };
    const PERSON = { me: 1, you: 1, him: 1, her: 1, us: 1, them: 1, someone: 1, somebody: 1, it: 1 };
    const OWN_DET = { my: 1, your: 1, his: 1, her: 1, its: 1, our: 1, their: 1, "one's": 1 };
    function lyricTokens(text) {
      return (String(text || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) || []).map((word) => word.toLowerCase().replace(/’/g, "'"));
    }
    function lemmaVerb(word) {
      const map = {
        thinking: "think", thought: "think", thinks: "think",
        saying: "say", says: "say", said: "say",
        showed: "show", shown: "show", shows: "show", showing: "show",
        woke: "wake", woken: "wake", wakes: "wake", waking: "wake",
        stopped: "stop", stops: "stop", stopping: "stop",
        got: "get", getting: "get", gets: "get",
        went: "go", going: "go", goes: "go", gone: "go",
        came: "come", coming: "come", comes: "come",
        took: "take", taken: "take", takes: "take", taking: "take",
        made: "make", makes: "make", making: "make",
        gave: "give", given: "give", gives: "give", giving: "give",
        told: "tell", tells: "tell", telling: "tell",
        felt: "feel", feels: "feel", feeling: "feel",
        kept: "keep", keeps: "keep", keeping: "keep",
        left: "leave", leaves: "leave", leaving: "leave",
        found: "find", finds: "find", finding: "find",
        brought: "bring", brings: "bring", bringing: "bring",
        sat: "sit", sits: "sit", sitting: "sit",
        ran: "run", runs: "run", running: "run",
        sang: "sing", sung: "sing", sings: "sing", singing: "sing",
        spoke: "speak", spoken: "speak", speaks: "speak", speaking: "speak",
        wrote: "write", written: "write", writes: "write", writing: "write",
        knew: "know", knows: "know", knowing: "know", known: "know",
        saw: "see", seen: "see", sees: "see", seeing: "see",
        had: "have", has: "have", having: "have",
        did: "do", does: "do", doing: "do", done: "do"
      };
      if (map[word]) return map[word];
      let stem = word;
      if (word.length > 5 && word.endsWith("ing")) stem = word.slice(0, -3);
      else if (word.length > 4 && word.endsWith("ed")) stem = word.slice(0, -2);
      else if (word.length > 4 && word.endsWith("es")) stem = word.slice(0, -2);
      else if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) stem = word.slice(0, -1);
      if (stem.length >= 4 && stem.charAt(stem.length - 1) === stem.charAt(stem.length - 2)) stem = stem.slice(0, -1);
      return stem || word;
    }
    function lyricPhraseCandidates(text, extra) {
      const tokens = lyricTokens(text);
      const known = cardIndex();
      const seen = {};
      const buckets = { found: [], set: [], strong: [], idiom: [], weak: [] };
      function add(key, bucket) {
        const bits = String(key || "").toLowerCase().replace(/’/g, "'").replace(/[^a-z'\s-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
        const limit = bucket === "set" || bucket === "found" ? 10 : 6;
        if (bits.length < 2 || bits.length > limit) return;
        const id = bits.join(" ");
        if (seen[id] || known.has(id) || !spanOnOneLine(text, bits)) return;
        seen[id] = true;
        buckets[bucket].push(id);
      }
      (extra || []).forEach((key) => add(key, "found"));
      for (let i = 0; i < tokens.length; i++) {
        const here = tokens[i];
        if (tokens[i + 1] === "to" && REFLEXIVE[tokens[i + 2]] && here && !PHRASE_STOP[here]) add(tokens.slice(i, i + 3).join(" "), "set");
        if (/^show(s|ed|n|ing)?$/.test(here || "") && PERSON[tokens[i + 1]] && tokens[i + 2] === "the" && tokens[i + 3] === "way") add(tokens.slice(i, i + 4).join(" "), "set");
        if (here === "in" && tokens[i + 1] === "the" && tokens[i + 2] === "middle" && tokens[i + 3] === "of" && tokens[i + 4] === "the" && (tokens[i + 5] === "night" || tokens[i + 5] === "day")) add(tokens.slice(i, i + 6).join(" "), "set");
        if (here === "of" && OWN_DET[tokens[i + 1]] && tokens[i + 2] === "own" && tokens[i + 3] && !PHRASE_STOP[tokens[i + 3]]) add(tokens.slice(i, i + 4).join(" "), "set");
        if (tokens[i + 1] === "for" && tokens[i + 2] === "the" && (tokens[i + 3] === "night" || tokens[i + 3] === "day") && here && !PHRASE_STOP[here]) add(tokens.slice(i, i + 4).join(" "), "set");
        if (/^(wake|wakes|woke|woken|waking)$/.test(here || "") && PERSON[tokens[i + 1]] && tokens[i + 2] === "up") {
          let end = i + 3;
          if (tokens[i + 3] === "in" && tokens[i + 4] === "the" && tokens[i + 5] === "middle" && tokens[i + 6] === "of" && tokens[i + 7] === "the" && (tokens[i + 8] === "night" || tokens[i + 8] === "day")) end = i + 9;
          add(tokens.slice(i, end).join(" "), "set");
        }
        const next = tokens[i + 1];
        if (next && !PHRASE_STOP[here] && here.indexOf("'") < 0) {
          if (STRONG_PARTICLE[next]) add(here + " " + next, "strong");
          else if (WEAK_PARTICLE[next]) add(here + " " + next, "weak");
        }
        if (i + 2 < tokens.length && STRONG_PARTICLE[tokens[i + 2]] && (tokens[i + 1] === "it" || tokens[i + 1] === "them" || tokens[i + 1] === "him" || tokens[i + 1] === "her" || tokens[i + 1] === "me" || tokens[i + 1] === "you") && !PHRASE_STOP[here]) {
          add(here + " " + tokens[i + 1] + " " + tokens[i + 2], "strong");
        }
        for (let n = 3; n <= 5 && i + n <= tokens.length; n++) {
          const bits = tokens.slice(i, i + n);
          const glue = bits.some((word) => word === "the" || word === "a" || word === "an" || word === "of");
          const content = bits.filter((word) => !PHRASE_STOP[word] && !STRONG_PARTICLE[word] && !WEAK_PARTICLE[word]);
          if (glue && content.length >= 2) add(bits.join(" "), "idiom");
        }
      }
      buckets.set.sort((a, b) => b.split(" ").length - a.split(" ").length);
      return buckets.set.slice(0, 8).concat(buckets.found.slice(0, 4), buckets.strong.slice(0, 4), buckets.idiom.slice(0, 3), buckets.weak.slice(0, 1));
    }
    function phraseQueries(key) {
      const bits = String(key || "").split(" ");
      const queries = [];
      function push(query) {
        const text = String(query || "").replace(/\s+/g, " ").trim();
        if (text && queries.indexOf(text) < 0) queries.push(text);
      }
      if (bits.length === 3 && bits[1] === "to" && REFLEXIVE[bits[2]]) push(lemmaVerb(bits[0]) + " to oneself");
      if (bits.length === 4 && /^show/.test(bits[0]) && bits[2] === "the" && bits[3] === "way") {
        push("show someone the way");
        push("show the way");
      }
      if (bits[0] === "in" && bits[1] === "the" && bits[2] === "middle" && bits[3] === "of" && bits[4] === "the") push(bits.join(" "));
      if (bits.length === 4 && bits[0] === "of" && bits[2] === "own") {
        push("of one's own " + bits[3]);
        push("one's own " + bits[3]);
        if (bits[3] === "device" || bits[3] === "devices") push("leave someone to their own devices");
      }
      if (bits.length >= 4 && bits[bits.length - 3] === "for" && bits[bits.length - 2] === "the") push(lemmaVerb(bits[0]) + " for the " + bits[bits.length - 1]);
      if (/^wak/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "up") {
        if (key.indexOf("middle of the night") >= 0) push("in the middle of the night");
        if (key.indexOf("middle of the day") >= 0) push("in the middle of the day");
        push("wake someone up");
        push("wake up");
      }
      if (bits.length === 3 && PERSON[bits[1]] && STRONG_PARTICLE[bits[2]]) {
        push(lemmaVerb(bits[0]) + " someone " + bits[2]);
        push(lemmaVerb(bits[0]) + " " + bits[2]);
      }
      push(key);
      return queries;
    }
    function lyricSurface(key, query) {
      if (query === key) return key;
      const keyBits = key.split(" ");
      const queryBits = query.split(" ");
      if (queryBits.length === 3 && queryBits[1] === "to" && queryBits[2] === "oneself" && keyBits.length === 3 && keyBits[1] === "to" && REFLEXIVE[keyBits[2]]) return key;
      if ((query === "show the way" || query === "show someone the way") && keyBits[keyBits.length - 2] === "the" && keyBits[keyBits.length - 1] === "way") return key;
      if (queryBits[0] === "of" && queryBits[1] === "one's" && queryBits[2] === "own" && keyBits[0] === "of" && keyBits[2] === "own" && keyBits[3] === queryBits[3]) return key;
      if ((query === "wake up" || query === "wake someone up") && /^wak/.test(keyBits[0] || "") && keyBits[2] === "up") return keyBits.slice(0, 3).join(" ");
      if ((query === "leave someone to their own devices" || query === "one's own devices" || query === "one's own device") && keyBits[0] === "of" && keyBits[2] === "own" && (keyBits[3] === "device" || keyBits[3] === "devices")) return key;
      if (queryBits.length === 2 && STRONG_PARTICLE[queryBits[1]] && keyBits.length === 3 && PERSON[keyBits[1]] && keyBits[2] === queryBits[1] && lemmaVerb(keyBits[0]) === queryBits[0]) return key;
      if (queryBits.length === 3 && queryBits[1] === "someone" && STRONG_PARTICLE[queryBits[2]] && keyBits.length === 3 && PERSON[keyBits[1]] && keyBits[2] === queryBits[2]) return key;
      if (queryBits.length >= 2 && (" " + key + " ").indexOf(" " + query + " ") >= 0) return query;
      if (bitsSameFrame(keyBits, queryBits)) return key;
      return "";
    }
    function bitsSameFrame(keyBits, queryBits) {
      if (keyBits.length !== queryBits.length || !keyBits.length) return false;
      if (keyBits[keyBits.length - 3] === "for" && queryBits[queryBits.length - 3] === "for" && keyBits[keyBits.length - 1] === queryBits[queryBits.length - 1]) return true;
      return false;
    }
    function isSetFrame(key) {
      const bits = String(key || "").split(" ");
      if (bits.length === 3 && bits[1] === "to" && REFLEXIVE[bits[2]]) return true;
      if (bits.length === 4 && /^show/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "the" && bits[3] === "way") return true;
      if (bits[0] === "in" && bits[1] === "the" && bits[2] === "middle") return true;
      if (bits[0] === "of" && OWN_DET[bits[1]] && bits[2] === "own") return true;
      if (bits.length >= 4 && bits[bits.length - 3] === "for" && bits[bits.length - 2] === "the" && (bits[bits.length - 1] === "night" || bits[bits.length - 1] === "day")) return true;
      if (/^(wake|wakes|woke|woken|waking)$/.test(bits[0] || "") && PERSON[bits[1]] && bits[2] === "up") return true;
      return false;
    }
    function phraseDeck(data, key, framed) {
      if (!data || !data.found) return "";
      const head = String(data.word || "").trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ");
      if (head !== key) return "";
      const cam = data.cambridge || {};
      const poses = (cam.poses && cam.poses.length ? cam.poses : (cam.pos ? [cam.pos] : [])).map((item) => String(item).toLowerCase());
      const posBlob = poses.join(" ");
      const bits = key.split(/\s+/).filter((bit) => bit.length > 2);
      const clubUrl = String((data.englishClub && data.englishClub.url) || "").toLowerCase();
      const clubHit = !!((data.englishClub && (data.englishClub.meaning || (data.englishClub.examples || []).length)) && bits.length && bits.every((bit) => clubUrl.indexOf(bit) >= 0));
      const homeUrl = String((data.englishAtHome && data.englishAtHome.url) || "").toLowerCase();
      const homeHit = !!((data.englishAtHome && (data.englishAtHome.meaning || (data.englishAtHome.examples || []).length)) && bits.length && bits.every((bit) => homeUrl.indexOf(bit) >= 0));
      if (posBlob.indexOf("phrasal") >= 0) return "phrasal";
      if (posBlob.indexOf("idiom") >= 0 || clubHit || homeHit) return "idioms";
      const words = key.split(/\s+/);
      if (words.length === 2 && STRONG_PARTICLE[words[1]] && (posBlob.indexOf("verb") >= 0 || (!posBlob && data.wooordhunt && (data.wooordhunt.gloss || data.wooordhunt.verbGloss)))) return "phrasal";
      if (!framed || words.length < 2) return "";
      const gloss = data.ru || (cam && cam.definition) || (data.wooordhunt && (data.wooordhunt.gloss || data.wooordhunt.verbGloss)) || (data.englishClub && data.englishClub.meaning) || (data.englishAtHome && data.englishAtHome.meaning);
      if (!gloss) return "";
      if (STRONG_PARTICLE[words[words.length - 1]] || words.indexOf("up") >= 0) return "phrasal";
      return "music";
    }
    function phraseInside(key, longer) {
      const bits = key.split(" ");
      return longer.some((have) => {
        const whole = have.split(" ");
        if (bits.length >= whole.length) return false;
        for (let i = 0; i + bits.length <= whole.length; i++) {
          let same = true;
          for (let n = 0; n < bits.length; n++) if (whole[i + n] !== bits[n]) { same = false; break; }
          if (same) return true;
        }
        return false;
      });
    }
    function lyricLine(text, key) {
      const lines = String(text || "").split(/\n/);
      const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^A-Za-z])" + escaped + "([^A-Za-z]|$)", "i");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) return lines[i].trim();
      }
      return "";
    }
    function lookupLyricWord(word, context, waitMs) {
      const wait = waitMs || 25000;
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      let timer = 0;
      const job = (async () => {
        try {
          let url = lookupBase() + "/lookup?word=" + encodeURIComponent(word);
          if (context) url += "&context=" + encodeURIComponent(context);
          const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
          const data = await res.json();
          if (!res.ok || !data.found) return null;
          return data;
        } catch (err) {
          return null;
        }
      })();
      const limit = new Promise((resolve) => {
        timer = setTimeout(() => {
          if (controller) controller.abort();
          resolve(null);
        }, wait);
      });
      return Promise.race([job, limit]).then((value) => {
        clearTimeout(timer);
        return value;
      });
    }
    async function readLyrics(existingId) {
      const editing = existingId ? loadSongs().find((item) => item.id === existingId) : null;
      const title = editing ? editing.title : document.getElementById("lyricTitle").value.trim();
      const artist = editing ? editing.artist : document.getElementById("lyricArtist").value.trim();
      const videoUrl = editing ? (editing.videoUrl || "") : document.getElementById("lyricVideo").value.trim();
      const musicUrl = editing ? (editing.musicUrl || "") : document.getElementById("lyricMusic").value.trim();
      const source = editing ? document.querySelector("#songUser [data-lyric-draft]") : document.getElementById("lyricText");
      const lyrics = source ? source.value.replace(/\r\n/g, "\n") : "";
      const status = editing ? document.querySelector("#songUser [data-lyric-edit-status]") : document.getElementById("lyricStatus");
      const button = editing ? document.querySelector("#songUser [data-lyric-recheck]") : document.getElementById("lyricGo");
      const write = (text, bad) => {
        status.textContent = text;
        status.classList.toggle("bad", !!bad);
      };
      if (!title) { write("Write the song title.", true); return; }
      if (!String(lyrics).trim()) { write("Paste the lyrics.", true); return; }
      const keys = lyricKeys(lyrics);
      if (!keys.length) { write("No words to read.", true); return; }
      const known = cardIndex();
      const marks = {};
      const todo = [];
      keys.forEach((key) => {
        if (known.has(key)) marks[key] = { state: "have" };
        else todo.push(key);
      });
      button.disabled = true;
      let failed = false;
      const harvested = [];
      const lyricCards = [];
      try {
        let cursor = 0;
        let done = 0;
        write(todo.length ? "Looking up " + todo.length + " new words…" : "Every word already has a card.", false);
        async function worker() {
          while (cursor < todo.length) {
            const key = todo[cursor++];
            try {
              const data = await lookupLyricWord(key, lyricLine(lyrics, key));
              if (!data) marks[key] = { state: "miss" };
              else {
                rememberLyricCard(data, "music", "", lyricCards);
                marks[key] = { state: "new", word: data.word };
                ((data.wooordhunt && data.wooordhunt.phrases) || []).forEach((phrase) => {
                  const en = String(phrase.en || "").trim();
                  if (en.indexOf(" ") > 0) harvested.push(en);
                });
              }
            } catch (err) {
              failed = true;
              marks[key] = { state: "error" };
            }
            done += 1;
            write("Checked " + done + " of " + todo.length + " new words…", false);
          }
        }
        if (todo.length) await Promise.all(Array.from({ length: Math.min(3, todo.length) }, worker));
        const song = {
          id: editing ? editing.id : (pendingLyricId || Date.now().toString(36)),
          title: title,
          artist: artist,
          url: editing ? (editing.url || "") : "",
          videoUrl: videoUrl,
          musicUrl: musicUrl,
          fileName: editing ? (editing.fileName || "") : (pendingLyricFile ? pendingLyricFile.name : ""),
          fileType: editing ? (editing.fileType || "") : (pendingLyricFile ? (pendingLyricFile.type || "") : ""),
          lyrics: lyrics,
          marks: marks,
          archived: editing ? !!editing.archived : false
        };
        let fileFailed = false;
        if (!editing && pendingLyricFile) {
          try {
            await idbPutFile(song.id, pendingLyricFile);
            if (!lyricFileSent) await uploadSongFile(song.id, pendingLyricFile, pendingLyricFile.type || "", (ratio) => paintLyricRing(ratio, "Uploading…"), lyricUpload);
          }
          catch (err) {
            fileFailed = true;
            song.fileName = "";
            song.fileType = "";
          }
        }
        write("Saving the song…", false);
        const created = storeLyricSong(song, lyricCards);
        if (created) trackEvent("song", "lyrics", "add");
        paintLyrics();
        if (!editing) {
          document.getElementById("lyricTitle").value = "";
          document.getElementById("lyricArtist").value = "";
          document.getElementById("lyricVideo").value = "";
          document.getElementById("lyricMusic").value = "";
          document.getElementById("lyricText").value = "";
          pendingLyricFile = null;
          pendingLyricId = "";
          lyricFileSent = false;
          paintLyricRing(null);
          revokePreviewUrl();
          refreshLyricPreview();
          openLyricSong(song.id);
        } else renderUserSong(song);
        let phrases = [];
        const kept = [];
        let serverPhrases = null;
        const showCheck = (text, bad) => {
          write(text, bad);
          const open = document.getElementById("songUser");
          if (!open || open.dataset.songId !== song.id) return;
          const note = open.querySelector("[data-lyric-check]");
          if (!note) return;
          note.textContent = text;
          note.classList.toggle("bad", !!bad);
        };
        try {
          const analyzed = await accountFetch("/api/analyze", {
            method: "POST",
            body: JSON.stringify({ text: lyrics, contentType: "LYRICS" })
          });
          if (analyzed && Array.isArray(analyzed.expressions)) serverPhrases = analyzed.expressions;
        } catch (err) {
          serverPhrases = null;
        }
        if (serverPhrases) {
          if (!serverPhrases.length) showCheck(statsLine(songStat(keys, marks)), false);
          for (let i = 0; i < serverPhrases.length; i++) {
            const expr = serverPhrases[i];
            const head = expressionHead(expr.canonicalForm) || expr.exactText || "";
            const key = head.trim().toLowerCase();
            if (!key) continue;
            if (phraseInside(key, kept) || cardIndex().has(key)) {
              if (cardIndex().has(key)) marks[key] = marks[key] || { state: "have" };
              continue;
            }
            showCheck("Looking up phrase " + (i + 1) + " of " + serverPhrases.length + "…", false);
            try {
              const built = await accountFetch("/api/phrase-card", {
                method: "POST",
                body: JSON.stringify({
                  exactText: expr.exactText,
                  canonicalForm: expr.canonicalForm,
                  type: expr.type,
                  meaning: expr.meaning,
                  context: expr.context,
                  source: "song"
                })
              });
              const card = built && built.card;
              if (!card || !card.word) continue;
              const surface = String(card.word).trim();
              const savedKey = surface.toLowerCase();
              if (phraseInside(savedKey, kept) || cardIndex().has(savedKey)) continue;
              const payload = Object.assign({}, card.data || {}, {
                word: surface,
                ru: card.ru || "",
                expressionKey: card.expressionKey,
                expressionType: card.expressionType
              });
              const added = rememberLyricCard(payload, card.place || "mine", title, lyricCards);
              if (added || cardIndex().has(savedKey)) {
                marks[savedKey] = { state: added ? "new" : "have", word: surface, deck: card.place || "mine" };
                kept.push(savedKey);
              }
            } catch (err) {
              failed = true;
            }
          }
        }
        if (!serverPhrases) {
          try { phrases = lyricPhraseCandidates(lyrics, harvested); }
          catch (err) { phrases = []; }
        }
        if (!serverPhrases && !phrases.length) showCheck(statsLine(songStat(keys, marks)), false);
        for (let i = 0; i < phrases.length; i++) {
          const key = phrases[i];
          if (phraseInside(key, kept) || cardIndex().has(key)) {
            if (cardIndex().has(key)) marks[key] = marks[key] || { state: "have" };
            continue;
          }
          showCheck("Looking up phrase " + (i + 1) + " of " + phrases.length + "…", false);
          try {
            const queries = phraseQueries(key);
            let data = null;
            let deck = "";
            let surface = "";
            for (let q = 0; q < queries.length; q++) {
              const query = queries[q];
              const found = await lookupLyricWord(query, lyricLine(lyrics, key), 12000);
              const kind = phraseDeck(found, query, query !== key || isSetFrame(key));
              if (!kind) continue;
              surface = lyricSurface(key, query);
              if (!surface) continue;
              data = Object.assign({}, found, { word: surface });
              deck = kind;
              break;
            }
            if (!deck || !surface) continue;
            if (phraseInside(surface, kept) || cardIndex().has(surface)) {
              if (cardIndex().has(surface)) marks[surface] = marks[surface] || { state: "have" };
              continue;
            }
            const added = rememberLyricCard(data, deck, title, lyricCards);
            if (added || cardIndex().has(surface)) {
              marks[surface] = { state: added ? "new" : "have", word: data.word, deck: deck };
              kept.push(surface);
            }
          } catch (err) {
            failed = true;
          }
        }
        storeLyricSong(song, lyricCards);
        paintAdded();
        paintLyrics();
        const open = document.getElementById("songUser");
        if (open && open.dataset.songId === song.id) renderUserSong(song);
        let note = failed ? "The dictionary lookup stopped before every word was checked." : statsLine(songStat(keys.concat(kept), marks));
        if (fileFailed) note = "The file could not be saved. " + note;
        showCheck(note, fileFailed || failed);
      } catch (err) {
        write(err && err.message ? err.message : "The song could not be saved.", true);
      } finally {
        button.disabled = false;
      }
    }
    let pendingLyricFile = null;
    let pendingLyricUrl = "";
    let pendingEditFile = null;
    let pendingEditUrl = "";
    let editFileRemoved = false;
    function revokePreviewUrl() {
      if (!pendingLyricUrl) return;
      URL.revokeObjectURL(pendingLyricUrl);
      pendingLyricUrl = "";
    }
    function revokeEditPreviewUrl() {
      if (!pendingEditUrl) return;
      URL.revokeObjectURL(pendingEditUrl);
      pendingEditUrl = "";
    }
    function localFileHtml(file, url) {
      if (!file || !url) return "";
      return filePlayerHtml(url, file.type || "", file.name || "");
    }
    function refreshLyricPreview() {
      document.getElementById("lyricVideoPreview").innerHTML = videoHtml(document.getElementById("lyricVideo").value);
      document.getElementById("lyricMusicPreview").innerHTML = musicHtml(document.getElementById("lyricMusic").value);
      const name = document.getElementById("lyricFileName");
      name.textContent = pendingLyricFile ? pendingLyricFile.name : "";
      document.getElementById("lyricFilePreview").innerHTML = localFileHtml(pendingLyricFile, pendingLyricUrl);
      watchSongPlayers(document.getElementById("lyricForm"));
    }
    function refreshEditMedia() {
      const root = document.getElementById("songUser");
      if (!root) return;
      const video = root.querySelector("[data-lyric-video-preview]");
      const music = root.querySelector("[data-lyric-music-preview]");
      const name = root.querySelector("[data-lyric-file-name]");
      const fileBox = root.querySelector("[data-lyric-file-preview]");
      const videoInput = root.querySelector("[data-lyric-video]");
      const musicInput = root.querySelector("[data-lyric-music]");
      if (video && videoInput) video.innerHTML = videoHtml(videoInput.value);
      if (music && musicInput) music.innerHTML = musicHtml(musicInput.value);
      if (pendingEditFile) {
        if (name) name.textContent = pendingEditFile.name;
        if (fileBox) fileBox.innerHTML = localFileHtml(pendingEditFile, pendingEditUrl);
      } else if (editFileRemoved) {
        if (name) name.textContent = "";
        if (fileBox) fileBox.innerHTML = "";
      }
      watchSongPlayers(root);
    }
    function paintEditRing(ratio, text) {
      const root = document.getElementById("songUser");
      if (!root) return;
      paintRing(root.querySelector("[data-lyric-file-progress]"), root.querySelector("[data-lyric-file-ring]"), root.querySelector("[data-lyric-file-progress-text]"), root.querySelector("[data-lyric-meta-save]"), ratio, text);
    }
    function paintLyricRing(ratio, text) {
      paintRing(document.getElementById("lyricFileProgress"), document.getElementById("lyricFileRing"), document.getElementById("lyricFileProgressText"), document.getElementById("lyricGo"), ratio, text);
    }
    function beginFileUpload(file, id, sentFlag, paint, holder, readyText) {
      holder.file = file;
      if (holder.xhr) holder.xhr.abort();
      if (!authUser || accountApi() || !id) {
        paint(null);
        return;
      }
      paint(0, "Uploading…");
      uploadSongFile(id, file, file.type || "", (ratio) => {
        if (holder.file === file) paint(ratio, "Uploading…");
      }, holder).then((ok) => {
        if (holder.file !== file) return;
        if (!ok) { paint(null); return; }
        sentFlag();
        paint(1, readyText);
      }).catch(() => {
        if (holder.file !== file) return;
        paint(null);
      });
    }
    function takeLyricFile(file) {
      if (!file) return;
      revokePreviewUrl();
      pendingLyricFile = file;
      pendingLyricUrl = URL.createObjectURL(file);
      lyricFileSent = false;
      if (!pendingLyricId) pendingLyricId = Date.now().toString(36);
      refreshLyricPreview();
      beginFileUpload(file, pendingLyricId, () => { lyricFileSent = true; }, paintLyricRing, lyricUpload, "Press Read the words.");
    }
    function bindFileDrop(form, onFile) {
      if (!form) return;
      form.addEventListener("dragover", (e) => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        form.classList.add("over");
      });
      form.addEventListener("dragleave", (e) => {
        if (form.contains(e.relatedTarget)) return;
        form.classList.remove("over");
      });
      form.addEventListener("drop", (e) => {
        e.preventDefault();
        form.classList.remove("over");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) onFile(file);
      });
    }
    document.getElementById("lyricVideo").addEventListener("input", refreshLyricPreview);
    document.getElementById("lyricMusic").addEventListener("input", refreshLyricPreview);
    document.getElementById("lyricFilePick").addEventListener("click", () => { document.getElementById("lyricFile").click(); });
    document.getElementById("lyricFile").addEventListener("change", () => {
      takeLyricFile(document.getElementById("lyricFile").files[0]);
      document.getElementById("lyricFile").value = "";
    });
    bindFileDrop(document.getElementById("lyricForm"), takeLyricFile);
    document.getElementById("lyricGo").addEventListener("click", () => { readLyrics(); });
    document.getElementById("lyricList").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lyric]");
      if (btn) openLyricSong(btn.dataset.lyric);
    });
    document.getElementById("songUser").addEventListener("click", (e) => {
      if (e.target.closest("[data-lyric-file-pick]")) {
        const input = document.querySelector("#songUser [data-lyric-file]");
        if (input) input.click();
        return;
      }
      if (e.target.closest("[data-lyric-file-clear]")) {
        pendingEditFile = null;
        editFileSent = false;
        editUpload.file = null;
        if (editUpload.xhr) editUpload.xhr.abort();
        paintEditRing(null);
        revokeEditPreviewUrl();
        editFileRemoved = true;
        refreshEditMedia();
        return;
      }
      const smaller = e.target.closest("[data-lyric-size]");
      if (smaller) {
        lyricSize = Math.min(40, Math.max(14, lyricSize + Number(smaller.dataset.lyricSize) * 2));
        localStorage.setItem("enquiz-lyric-size", String(lyricSize));
        syncChange({ op: "put-setting", key: "lyricSize", value: lyricSize });
        applyLyricSize(document.getElementById("songUser"));
        return;
      }
      if (e.target.closest("[data-lyric-meta]")) {
        const editor = document.querySelector("#songUser [data-lyric-meta-editor]");
        if (editor) editor.hidden = !editor.hidden;
        return;
      }
      if (e.target.closest("[data-lyric-meta-save]")) {
        saveSongMeta();
        return;
      }
      if (e.target.closest("[data-lyric-edit]")) {
        const editor = document.querySelector("#songUser [data-lyric-editor]");
        if (editor) editor.hidden = !editor.hidden;
        return;
      }
      if (e.target.closest("[data-lyric-archive]")) {
        const id = document.getElementById("songUser").dataset.songId;
        const list = loadSongs();
        const song = list.find((item) => item.id === id);
        if (!song) return;
        const wasArchived = !!song.archived;
        song.archived = true;
        saveSongs(list, song);
        if (!wasArchived) trackEvent("song", "lyrics", "archive");
        paintLyrics();
        goBack("music");
        return;
      }
      if (e.target.closest("[data-lyric-recheck]")) {
        const id = document.getElementById("songUser").dataset.songId;
        if (id) readLyrics(id);
      }
    });
    function takeEditFile(file) {
      if (!file) return;
      revokeEditPreviewUrl();
      pendingEditFile = file;
      pendingEditUrl = URL.createObjectURL(file);
      editFileRemoved = false;
      editFileSent = false;
      const editor = document.querySelector("#songUser [data-lyric-meta-editor]");
      if (editor) editor.hidden = false;
      refreshEditMedia();
      const id = (document.getElementById("songUser") || {}).dataset.songId || "";
      beginFileUpload(file, id, () => { editFileSent = true; }, paintEditRing, editUpload, "Press Save.");
    }
    const songBox = document.getElementById("songUser");
    songBox.addEventListener("input", (e) => {
      if (e.target.closest("[data-lyric-video], [data-lyric-music]")) refreshEditMedia();
    });
    songBox.addEventListener("change", (e) => {
      const input = e.target.closest("[data-lyric-file]");
      if (!input) return;
      takeEditFile(input.files && input.files[0]);
      input.value = "";
    });
    songBox.addEventListener("dragover", (e) => {
      e.preventDefault();
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone) zone.classList.add("over");
    });
    songBox.addEventListener("dragleave", (e) => {
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove("over");
    });
    songBox.addEventListener("drop", (e) => {
      e.preventDefault();
      const zone = songBox.querySelector("[data-lyric-drop]");
      if (zone) zone.classList.remove("over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) takeEditFile(file);
    });
    document.getElementById("songUser").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lyric-open]");
      if (!btn) return;
      document.querySelectorAll("#songUser [data-lyric-return]").forEach((el) => {
        el.classList.remove("lyric-return");
        el.removeAttribute("data-lyric-return");
      });
      btn.setAttribute("data-lyric-return", "1");
      btn.classList.add("lyric-return");
      const key = btn.dataset.lyricOpen;
      const known = cardForLyric(key);
      if (!known) { openUsages(key, ""); return; }
      if (known.kind === "verb") { openVerbCard(known.en); return; }
      if (known.kind === "lesson") {
        const word = words.find((item) => item.en.toLowerCase() === known.en.toLowerCase());
        if (word) { renderWord(word); visit("word"); }
      } else if (known.kind === "song") {
        renderSong(known.key);
        visit("musicword");
      } else if (known.kind === "phrasal" || known.kind === "idioms") {
        const bank = known.kind === "phrasal" ? phrasalWords : idiomWords;
        const word = bank.find((item) => String(item.en).toLowerCase() === known.en.toLowerCase());
        if (word) { renderWord(word); visit("word"); return; }
        const item = loadAdded().find((row) => String(row.word).toLowerCase() === known.en.toLowerCase() && row.place === known.kind);
        if (item) { renderMade(item); visit("made"); return; }
        openUsages(known.en, "");
      } else if (known.kind === "deck") visit("flip");
      else if (known.kind === "added") {
        const item = loadAdded().find((row) => String(row.word).toLowerCase() === known.en.toLowerCase());
        if (item) { renderMade(item); visit("made"); }
        else openUsages(known.en, "");
      }
    });
    paintLyrics();
    paintVerbs();
    function restoreOverflowStores() {
      idbGetSongs().then((saved) => {
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
        songCache = local;
        paintLyrics();
      });
      idbGetAdded().then((saved) => {
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
        else applyCardSearch(section);
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
    let examLog = [];
    let examStarted = 0;
    let examClock = 0;
    let studyTitle = "Study";
    let studyScreen = "setup";
    const MISTAKE_KEY = "enquiz-mistakes";
    const EXAM_MS = 20 * 60 * 1000;
    function quizPool() {
      return dayPoolOverride || lessonPool(dayQuizPlace);
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
      loadAdded().forEach((item, index) => list.push({ item: item, index: index }));
      if (!addGroup) return list;
      const shown = list.filter((row) => addedPlaceName(row.item) === addGroup);
      return addGroup === "Song lyrics" ? rowsForSong(shown, addSong, (row, keys) => addedInKeys(row.item, keys)) : shown;
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
    function rowToCard(row) {
      const key = String(row.en || "").toLowerCase();
      const lesson = extraWords.find((item) => String(item.en).toLowerCase() === key) || words.find((item) => String(item.en).toLowerCase() === key) || phrases09.find((item) => String(item.en).toLowerCase() === key) || adverbs14.find((item) => String(item.en).toLowerCase() === key) || talk16.find((item) => String(item.en).toLowerCase() === key) || likes23.find((item) => String(item.en).toLowerCase() === key) || ask07.find((item) => String(item.en).toLowerCase() === key) || lines21.find((item) => String(item.en).toLowerCase() === key);
      if (lesson) return { en: lesson.en, ru: lesson.ru, pos: lesson.pos || "", uk: lesson.uk || "", us: lesson.us || "", ex: lesson.ex || "", gloss: lesson.gloss || "" };
      const song = songCards[row.key] || songCards[key];
      if (song) return { en: song.en, ru: song.ru, pos: song.pos || "", uk: song.uk || "", us: song.us || "", ex: song.ex || "", gloss: song.gloss || "" };
      if (key === "give up") return { en: "give up", ru: "сдаваться, бросать", pos: "phrasal verb", uk: "/ɡɪv ˈʌp/", us: "", ex: "I won't give up.", gloss: "to stop doing or having something." };
      const item = loadAdded().find((saved) => String(saved.word).toLowerCase() === key);
      if (item) {
        const cam = item.data && item.data.cambridge ? item.data.cambridge : {};
        const word = String(item.word || "");
        const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        const usage = item.data && item.data.usages ? item.data.usages.find((line) => re.test(line.en || "")) : null;
        const wh = item.data && item.data.wooordhunt ? item.data.wooordhunt : {};
        return {
          en: word, ru: item.ru || "", pos: cam.pos || "",
          uk: cam.uk || wh.uk || (item.data && item.data.uk) || "",
          us: cam.us || wh.us || (item.data && item.data.us) || "",
          ex: usage ? usage.en : "", gloss: cam.definition || expressionNote(item) || ""
        };
      }
      return { en: row.en, ru: row.ru || "", pos: "", uk: "", us: "", ex: "", gloss: "" };
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
      const base = lessonBank(place).filter(cardVisible).map((w) => ({ en: w.en, ru: w.ru, pos: w.pos, uk: w.uk, us: w.us, ex: w.ex, gloss: w.gloss }));
      const extra = loadAdded().filter((item) => (item.place || "mine") === place).map((item) => {
        const cam = item.data && item.data.cambridge ? item.data.cambridge : {};
        const word = String(item.word || "");
        const re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        const usage = item.data && item.data.usages ? item.data.usages.find((row) => re.test(row.en || "")) : null;
        const wh = item.data && item.data.wooordhunt ? item.data.wooordhunt : {};
        return {
          en: word, ru: item.ru, pos: cam.pos || "",
          uk: cam.uk || wh.uk || (item.data && item.data.uk) || "",
          us: cam.us || wh.us || (item.data && item.data.us) || "",
          ex: usage ? usage.en : "", gloss: cam.definition || ""
        };
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
        return '<button class="wcard" type="button" ' + attr + '><div class="en">' + esc(row.en) + '</div><div class="pos">' + esc(row.pos) + '</div>' + ipaHtml(row) + '<div class="label">' + esc(row.ru) + "</div></button>";
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
      if (typeof syncChange === "function") syncChange({ op: "put-setting", key: "dayLinks", value: map });
    }
    function dayLinkList(day, kind) {
      const base = (DAY_LINKS[day] && DAY_LINKS[day][kind]) || [];
      const extra = (loadDayLinks()[day] && loadDayLinks()[day][kind]) || [];
      return base.map((item) => Object.assign({ added: false }, item)).concat(extra.map((item, index) => Object.assign({ added: true, index: index }, item)));
    }
    function linkChip(item) {
      const remove = item.added ? '<button class="chip-x" type="button" data-link-remove="' + item.index + '" aria-label="Remove">×</button>' : "";
      return '<span class="link-chip"><a class="btn chip" href="' + esc(item.href) + '" target="_blank" rel="noreferrer">' + esc(item.title) + "</a>" + remove + "</span>";
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
        const pdf = pack.pdf ? '<a class="btn primary" href="' + esc(pack.pdf) + '" target="_blank" rel="noreferrer">Lesson PDF</a>' : "";
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
        const title = form.querySelector("[data-link-title]").value.trim();
        let href = form.querySelector("[data-link-url]").value.trim();
        if (!title || !href) return;
        if (!/^https?:\/\//i.test(href)) href = "https://" + href;
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
      if (!card.ex) return "";
      const token = formToken(card);
      const re = new RegExp("\\b" + String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
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
    function typesFor(card, types) {
      return types.filter((type) => {
        if (type === "Match" || type === "Select all" || type === "Odd one out" || type === "Memory") return false;
        if ((type === "Choice" || type === "Type" || type === "True / false" || type === "Reverse" || type === "Listen") && !card.ru) return false;
        if ((type === "Gap" || type === "Build" || type === "Tap") && !lineOf(card)) return false;
        if (type === "Definition" && !meaningOf(card)) return false;
        if ((type === "Spell" || type === "Letters" || type === "Hangman") && !spellable(card)) return false;
        return true;
      });
    }
    function buildDayQueue(cards, types, mix) {
      const queue = [];
      cards.forEach((card) => {
        let use = typesFor(card, types);
        if (mix && use.length) use = [use[Math.floor(Math.random() * use.length)]];
        use.forEach((type) => {
          if (type === "True / false") {
            const others = cards.filter((c) => c.ru !== card.ru);
            const lie = others.length > 0 && Math.random() < 0.5;
            queue.push({ type: type, card: card, ru: lie ? others[Math.floor(Math.random() * others.length)].ru : card.ru, ok: !lie, line: lineOf(card) || card.en });
          } else queue.push({ type: type, card: card, line: lineOf(card) });
        });
      });
      if (types.indexOf("Match") >= 0 && cards.length >= 2) {
        queue.push({ type: "Match", pairs: cards.slice(0, Math.min(4, cards.length)).map((c, i) => ({ id: String(i), en: c.en, ru: c.ru })) });
      }
      if (types.indexOf("Select all") >= 0) {
        const posed = cards.filter((c) => c.pos);
        if (posed.length >= 2) {
          const nouns = cards.filter((c) => c.pos === "noun").slice(0, 2);
          const adjs = cards.filter((c) => c.pos === "adjective").slice(0, 4);
          const sample = (adjs.length && nouns.length ? adjs.concat(nouns) : posed.slice(0, 6));
          const pos = nouns.length && adjs.length ? "noun" : sample[0].pos;
          queue.push({ type: "Select all", pos: pos, sample: sample });
        }
      }
      if (types.indexOf("Odd one out") >= 0) {
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
      if (types.indexOf("Memory") >= 0) {
        const paired = cards.filter((c) => c.en && c.ru).slice(0, 4);
        if (paired.length >= 2) {
          const faces = shuffle(paired.reduce((all, c, i) => all.concat([{ id: String(i), text: c.en }, { id: String(i), text: c.ru }]), []));
          queue.push({ type: "Memory", faces: faces, open: [], done: {} });
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
      return collectCards().filter((row) => row.kind !== "deck").map(rowToCard);
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
      const base = bank.filter(cardVisible).map((w) => ({ en: w.en, ru: w.ru, pos: w.pos, uk: w.uk || "", us: w.us || "", ex: w.ex || "", gloss: w.gloss || "" }));
      const extra = loadAdded().filter((item) => item.place === place).map((item) => rowToCard({ en: item.word, ru: item.ru, key: item.word }));
      return base.concat(extra);
    }
    function paintDeckCounts() {
      const phrasalN = deckStudyCards("phrasal").length;
      const idiomN = deckStudyCards("idioms").length;
      const phrasalCount = document.getElementById("phrasalCount");
      const idiomCount = document.getElementById("idiomCount");
      const phrasalSub = document.getElementById("phrasalSub");
      const idiomSub = document.getElementById("idiomSub");
      if (phrasalCount) phrasalCount.textContent = String(phrasalN);
      if (idiomCount) idiomCount.textContent = String(idiomN);
      if (phrasalSub) phrasalSub.textContent = phrasalN + (phrasalN === 1 ? " card" : " cards") + ". Study uses them.";
      if (idiomSub) idiomSub.textContent = idiomN + (idiomN === 1 ? " card" : " cards") + ". Study uses them.";
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
      visit("setup");
    }
    function chosenTypes(exam) {
      const here = (document.querySelector("section.on") || {}).id;
      const sel = here === "daysetup" ? "#dayModes .chip.on, #dayModesMore .chip.on" : "#modes .chip.on, #modesMore .chip.on";
      let types = [...document.querySelectorAll(sel)].map((b) => b.textContent.trim()).filter((t) => t && t !== "...");
      if (exam) types = types.filter((t) => t !== "Flip");
      if (exam && !types.length) types = ["Choice", "Type", "Gap", "Build", "Match", "True / false", "Tap", "Select all", "Reverse", "Spell", "Letters", "Listen", "Definition", "Odd one out", "Memory", "Hangman"];
      return types;
    }
    function studyMix() {
      const here = (document.querySelector("section.on") || {}).id;
      if (here === "daysetup") {
        const btn = document.querySelector("#dayMix .chip.on");
        return !!(btn && btn.dataset.dayMix === "mix");
      }
      const btn = document.querySelector("[data-mix].on");
      return !!(btn && btn.dataset.mix === "mix");
    }
    function examTimeUp() {
      return examMode && Date.now() - examStarted >= EXAM_MS;
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
      if (!item || item.type === "Flip") return;
      trackEvent("answer", item.type, ok ? "ok" : "miss");
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
          return '<article class="miss-card"><p class="entry">' + esc(card.en) + "</p>" + ipaHtml(card) +
            (card.ru ? "<p><b>" + esc(card.ru) + "</b></p>" : "") +
            (meaningOf(card) ? '<p class="src">' + esc(meaningOf(card)) + "</p>" : "") +
            (card.ex ? '<p class="src">' + esc(card.ex) + "</p>" : "") +
            '<p class="label">Missed on</p><div class="row">' + chips + "</div>" +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-miss-open="' + index + '">Open card</button>' +
            '<button class="btn primary" type="button" data-miss-retry="' + index + '">Repeat</button></div></article>';
        }).join("") +
        '<p class="hint">One word is one card. Marked quizzes are the ones that were missed. Four correct answers in a row remove that quiz.</p>';
    }
    function mistakeItems(groups) {
      const queue = [];
      groups.forEach((group) => {
        const types = group.rows.map((row) => row.type);
        typesFor(group.card, types).forEach((type) => {
          if (type === "True / false") {
            const others = mistakePool.filter((card) => card.ru && card.ru !== group.card.ru);
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
      const backId = backTo || "errors";
      const key = String(card.en || "").trim().toLowerCase();
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
      if (timer) timer.hidden = true;
      document.getElementById("examTitle").textContent = "Exam · " + studyTitle;
      document.getElementById("examBack").dataset.fallback = studyScreen;
      const used = Math.max(0, Math.round((Date.now() - examStarted) / 1000));
      const clock = Math.floor(used / 60) + ":" + String(used % 60).padStart(2, "0");
      let html = '<p class="q">' + (passed ? "Passed" : "Not passed") + "</p>";
      html += '<p class="score">' + examMistakes + (examMistakes === 1 ? " mistake" : " mistakes") + "</p>";
      html += '<p class="prompt">' + esc(studyTitle) + " · " + dayQueue.length + " questions · " + clock + ". Limit: 2 mistakes or 20 minutes.</p>";
      if (!passed && reason === "time") html += '<p class="hint bad">Time is up.</p>';
      html += examLog.map((row) => '<div class="miss"><div><b>' + esc(row.en) + '</b><span class="label">' + esc(row.type) + '</span></div><span>mistake</span></div>').join("");
      html += '<div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="examMistakes">Mistakes</button><button class="btn" type="button" id="examBackBtn">Back</button></div>';
      document.getElementById("examBody").innerHTML = html;
      document.getElementById("examMistakes").onclick = () => openMistakes(quizPool());
      document.getElementById("examBackBtn").onclick = () => show(studyScreen);
      trackEvent("exam", reason || "score", passed ? "pass" : "fail");
      show("exam");
    }
    function armExamClock() {
      clearInterval(examClock);
      examClock = setInterval(() => {
        if (!examMode) { clearInterval(examClock); return; }
        const timer = document.getElementById("dayqTimer");
        if (timer) {
          const left = Math.max(0, EXAM_MS - (Date.now() - examStarted));
          timer.hidden = false;
          timer.textContent = String(Math.floor(left / 60000)).padStart(2, "0") + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
        }
        if (examTimeUp()) showExamResult(false, "time");
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
        studyScreen = "setup";
        studyTitle = "Study";
        dayReturn = "home";
      } else studyScreen = "daysetup";
      const cards = quizPool();
      const note = document.getElementById(here === "daysetup" ? "daySetupNote" : "studyNote");
      const types = chosenTypes(exam);
      if (!cards.length) {
        if (note) { note.textContent = "No cards on this page yet."; note.classList.add("bad"); }
        return;
      }
      if (!types.length) {
        if (note) { note.textContent = "Pick at least one answer type."; note.classList.add("bad"); }
        return;
      }
      const queue = buildDayQueue(cards, types, studyMix());
      if (!queue.length) {
        if (note) { note.textContent = "None of these types fit the cards on this page."; note.classList.add("bad"); }
        return;
      }
      if (note) note.classList.remove("bad");
      clearDayTimer();
      clearInterval(examClock);
      examMode = !!exam;
      examClosed = false;
      examMistakes = 0;
      examLog = [];
      examStarted = Date.now();
      dayQueue = queue;
      dayAt = 0;
      pushHistory();
      show("dayq");
      renderDay();
      if (examMode) armExamClock();
    }
    function openListedStudy(cards, title, backTo) {
      studyTitle = title;
      studyScreen = "daysetup";
      dayPoolOverride = cards;
      dayReturn = backTo;
      document.getElementById("daySetupTitle").textContent = title;
      document.getElementById("daySetupBack").dataset.fallback = backTo;
      document.getElementById("dayqBack").dataset.fallback = backTo;
      const note = document.getElementById("daySetupNote");
      const count = cards.length === 1 ? "1 card" : cards.length + " cards";
      note.textContent = cards.length ? title + " · " + count + ". Pick the types, then start." : "No cards on this page yet.";
      note.classList.toggle("bad", !cards.length);
      visit("daysetup");
    }
    function openPageStudy() {
      const base = statGroup || ({ learned: "Learned", weak: "Weak cards", learning: "Still learning" }[statKind] || "Cards");
      const title = statGroup === "Song lyrics" ? songStudyTitle(base, statSong) : base;
      openListedStudy(statRows().map(rowToCard), title, "cardstat");
    }
    function openAllStudy() {
      const rows = allRows();
      let shown = allGroup ? rows.filter((row) => sourceName(row) === allGroup) : rows;
      if (allGroup === "Song lyrics") shown = rowsForSong(shown, allSong, rowInKeys);
      const title = allGroup === "Song lyrics" ? songStudyTitle("Song lyrics", allSong) : (allGroup || "All words");
      openListedStudy(shown.map(rowToCard), title, "allwords");
    }
    function openAddStudy() {
      let rows = loadAdded().map((item, index) => ({ item: item, index: index }));
      let title = "Add a word";
      if (addGroup) {
        rows = rows.filter((row) => addedPlaceName(row.item) === addGroup);
        title = addGroup;
      }
      if (addGroup === "Song lyrics") {
        rows = rowsForSong(rows, addSong, (row, keys) => addedInKeys(row.item, keys));
        title = songStudyTitle(title, addSong);
      }
      openListedStudy(rows.map((row) => rowToCard({ en: row.item.word, ru: row.item.ru, key: row.item.word })), title, "add");
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
      studyTitle = "This day's quiz";
      studyScreen = "daysetup";
      const home = lessonHome(place);
      dayReturn = home.id;
      document.getElementById("daySetupTitle").textContent = "This day's quiz";
      document.getElementById("daySetupBack").dataset.fallback = home.id;
      document.getElementById("dayqBack").dataset.fallback = home.id;
      const n = lessonPool(place).length;
      const label = home.label;
      const note = document.getElementById("daySetupNote");
      note.textContent = n ? label + " · " + n + " cards. Pick the types, then start." : label + " · no cards yet.";
      note.classList.toggle("bad", !n);
      visit("daysetup");
    }
    function dayNextButton(label) {
      return '<div class="row" style="margin-top:12px"><button class="btn primary" type="button" data-day-next>' + label + "</button></div>";
    }
    function paintBuild(item) {
      document.getElementById("dayqView").innerHTML =
        '<p class="prompt">Build the sentence</p><div class="slot">' + (item.slot.map((word, i) => '<button class="token" type="button" data-slot="' + i + '">' + esc(word) + "</button>").join(" ") || "…") + "</div>" +
        '<div class="row">' + item.bank.map((word, i) => '<button class="token" type="button" data-bank="' + i + '">' + esc(word) + "</button>").join("") + "</div>" +
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
    function nextWordAt() {
      const current = dayQueue[dayAt];
      const word = current && current.card ? cardQuizId(current.card) : "";
      for (let i = dayAt + 1; i < dayQueue.length; i++) {
        const card = dayQueue[i].card;
        if (!card || cardQuizId(card) !== word) return i;
      }
      return -1;
    }
    function markDay(ok, right) {
      const fb = document.getElementById("dayFb");
      if (!fb) return;
      clearDayTimer();
      const item = dayQueue[dayAt];
      if (item) noteAnswer(item, ok);
      if (examMode && item && item.type !== "Flip" && !ok) {
        examMistakes += 1;
        examLog.push({ en: (item.card && item.card.en) || item.pos || item.type, type: item.type });
      }
      if (ok) {
        fb.innerHTML = '<div class="feedback ok">Correct</div>';
        dayTimer = setTimeout(() => {
          if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
          if (dayAt + 1 >= dayQueue.length) {
            if (examMode) showExamResult(examMistakes < 2, "");
            else dayBack();
            return;
          }
          dayAt += 1;
          renderDay();
        }, 650);
        return;
      }
      if (item && item.type === "Listen") revealListenCard(item);
      if (examMode && (examMistakes >= 2 || examTimeUp())) {
        fb.innerHTML = '<div class="feedback bad">Incorrect. Right answer: ' + esc(right) + "</div>";
        dayTimer = setTimeout(() => showExamResult(false, examMistakes >= 2 ? "mistakes" : "time"), 700);
        return;
      }
      fb.innerHTML = '<div class="feedback bad">Incorrect. Right answer: ' + esc(right) + "</div>" + dayNextButton("Next");
    }
    function revealListenCard(item) {
      const slot = document.getElementById("listenCard");
      const card = item && item.card;
      const label = card && (card.en || card.speak);
      if (!slot || !label) return;
      slot.innerHTML = '<button class="add-link" type="button" data-listen-card>' + esc(label) + "</button>";
    }
    function speakEnglish(text) {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      window.speechSynthesis.speak(utter);
    }
    function choiceHtml(prompt, question, options, right) {
      return '<p class="prompt">' + esc(prompt) + '</p>' + (question ? '<p class="q">' + esc(question) + '</p>' : '') + '<div class="opts">' +
        options.map((text) => '<button class="opt" type="button" data-opt="' + (text === right ? "ok" : "bad") + '"><span>' + esc(text) + "</span></button>").join("") +
        '</div><div id="dayFb"></div>';
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
      const shown = item.answer.split("").map((ch) => {
        if (!/[a-zA-Z]/.test(ch)) return ch;
        return item.got[ch.toLowerCase()] ? ch : "_";
      }).join(" ");
      const keys = "abcdefghijklmnopqrstuvwxyz".split("").map((letter) => {
        const used = item.got[letter] || item.missed[letter];
        return '<button class="token" type="button" data-hang="' + letter + '"' + (used ? " disabled" : "") + ">" + letter + "</button>";
      }).join("");
      document.getElementById("dayqView").innerHTML = '<p class="prompt">Hangman · ' + esc(item.card.ru || "") + '</p><p class="q">' + esc(shown) + '</p><p class="hint">Misses ' + item.misses + " / 6</p><div class=\"row\">" + keys + '</div><div id="dayFb"></div>';
    }
    function renderDay() {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
      const item = dayQueue[dayAt];
      if (!item) { if (examMode) showExamResult(examMistakes < 2, ""); else dayBack(); return; }
      document.getElementById("dayqTitle").textContent = (dayAt + 1) + " / " + dayQueue.length;
      const dayqType = document.getElementById("dayqType");
      if (dayqType) dayqType.textContent = item.type;
      document.getElementById("dayqBar").style.width = Math.round(((dayAt + 1) / dayQueue.length) * 100) + "%";
      const view = document.getElementById("dayqView");
      const card = item.card;
      if (item.type === "Choice") {
        const wrong = shuffle(quizPool().filter((c) => c.ru && c.ru !== card.ru)).slice(0, 3).map((c) => c.ru);
        const opts = shuffle(wrong.concat([card.ru]));
        view.innerHTML = '<p class="prompt">' + (card.verb ? "Three forms → Russian" : "English → Russian") + '</p><div class="word-head">' + wordPic(card.base || card.en) + '<p class="q">' + esc(card.en) + '</p></div><div class="opts">' +
          opts.map((ru) => '<button class="opt" type="button" data-opt="' + (ru === card.ru ? "ok" : "bad") + '"><span>' + esc(ru) + "</span></button>").join("") +
          '</div><div id="dayFb"></div>';
      } else if (item.type === "Flip") {
        view.innerHTML = '<p class="prompt">English → Russian</p><div class="flip-scene" tabindex="0" role="button" aria-label="Flip card"><div class="flip-inner"><div class="flip-face flip-front"><div class="word-head">' + wordPic(card.en, true) + '<div><p class="entry">' + esc(card.en) + '</p><p class="pos">' + esc(card.pos) + '</p></div></div></div><div class="flip-face flip-back" id="dayFlipBox"></div></div></div><div class="bar"><button class="btn" type="button" data-flip-go>Flip</button><button class="btn primary" type="button" data-day-next>' + (dayAt + 1 < dayQueue.length ? "Next" : "Done") + "</button></div>";
      } else if (item.type === "Type") {
        view.innerHTML = '<p class="prompt">' + (card.verb ? "Type the three forms" : "Type it in English") + '</p><p class="q">' + esc(card.ru) + '</p><input id="dayType" type="text" placeholder="' + (card.verb ? "base – past – participle" : "Answer") + '" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-type-go>Check</button></div>';
      } else if (item.type === "Gap") {
        const blank = blankSentence(item.line, formToken(card));
        item.answer = blank.answer;
        view.innerHTML = '<p class="prompt">Fill in the word</p><p class="q">' + esc(blank.shown) + '</p><input id="dayGap" type="text" placeholder="Missing word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-gap-go>Check</button></div>';
      } else if (item.type === "Build") {
        item.order = item.line.split(/\s+/);
        item.bank = shuffle(item.order.slice());
        item.slot = [];
        paintBuild(item);
      } else if (item.type === "True / false") {
        view.innerHTML = '<p class="prompt">Does this translation match?</p><p class="q">' + esc(item.line) + '</p><p><b>' + esc(item.ru) + '</b></p><div class="row"><button class="btn" type="button" data-tf="true">True</button><button class="btn" type="button" data-tf="false">False</button></div><div id="dayFb"></div>';
      } else if (item.type === "Tap") {
        const re = new RegExp("\\b" + formToken(card).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
        let html = "";
        item.line.split(/(\s+)/).forEach((part) => {
          if (!part.trim()) { html += esc(part); return; }
          const hit = re.test(part);
          html += '<button type="button" data-tap="' + (hit ? "ok" : "bad") + '">' + esc(part) + "</button>";
        });
        view.innerHTML = '<p class="prompt">Tap ' + esc(formToken(card)) + '</p><p class="sentence">' + html + '</p><div id="dayFb"></div>';
      } else if (item.type === "Match") {
        const right = shuffle(item.pairs.slice());
        view.innerHTML = '<p class="prompt">Match the English with the Russian translation</p><div class="pairs">' +
          item.pairs.map((p) => '<button class="pair" type="button" data-side="l" data-id="' + p.id + '">' + esc(p.en) + "</button>").join("") +
          right.map((p) => '<button class="pair" type="button" data-side="r" data-id="' + p.id + '">' + esc(p.ru) + "</button>").join("") +
          '</div><div id="dayFb"></div>';
        item.left = "";
      } else if (item.type === "Select all") {
        view.innerHTML = '<p class="prompt">Select every ' + esc(item.pos) + '</p><div class="opts">' +
          item.sample.map((c, i) => '<button class="opt" type="button" data-sel="' + i + '"><span>' + esc(c.en) + "</span></button>").join("") +
          '</div><div class="bar"><button class="btn primary" type="button" data-sel-check>Check</button></div><div id="dayFb"></div>';
      } else if (item.type === "Reverse") {
        item.right = card.en;
        const wrong = shuffle(quizPool().filter((c) => c.en && c.en !== card.en)).slice(0, 3).map((c) => c.en);
        view.innerHTML = choiceHtml("Russian → English", card.ru, shuffle(wrong.concat([card.en])), card.en);
      } else if (item.type === "Definition") {
        item.right = card.en;
        const wrong = shuffle(quizPool().filter((c) => c.en && c.en !== card.en)).slice(0, 3).map((c) => c.en);
        view.innerHTML = choiceHtml("Which word is this?", meaningOf(card), shuffle(wrong.concat([card.en])), card.en);
      } else if (item.type === "Listen") {
        item.right = card.ru;
        const wrong = shuffle(quizPool().filter((c) => c.ru && c.ru !== card.ru)).slice(0, 3).map((c) => c.ru);
        view.innerHTML = '<p class="prompt">Listen, then pick the translation</p><div class="row" style="margin-bottom:10px"><button class="btn" type="button" data-speak>Play</button><span id="listenCard"></span></div>' +
          choiceHtml("", "", shuffle(wrong.concat([card.ru])), card.ru).replace('<p class="prompt"></p>', "");
        speakEnglish(card.speak || card.en);
      } else if (item.type === "Odd one out") {
        item.right = item.right;
        const art = /^[aeiou]/i.test(item.pos) ? "an" : "a";
        view.innerHTML = choiceHtml("Which word is not " + art + " " + item.pos + "?", "", item.options.map((c) => c.en), item.right);
      } else if (item.type === "Spell") {
        view.innerHTML = '<p class="prompt">Spell the word</p><p class="q">' + esc(scrambleLetters(card.en)) + '</p><p>' + esc(card.ru || "") + '</p><input id="dayType" type="text" placeholder="Word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-spell-go>Check</button></div>';
      } else if (item.type === "Letters") {
        if (!item.mask) item.mask = maskLetters(card.en);
        view.innerHTML = '<p class="prompt">Fill the missing letters</p><p class="q">' + esc(item.mask) + '</p><p>' + esc(card.ru || "") + '</p><input id="dayType" type="text" placeholder="Word" autocomplete="off" /><div id="dayFb"></div><div class="bar"><button class="btn primary" type="button" data-spell-go>Check</button></div>';
      } else if (item.type === "Hangman") {
        if (!item.answer) { item.answer = card.en; item.got = {}; item.missed = {}; item.misses = 0; }
        paintHangman(item);
      } else if (item.type === "Memory") {
        paintMemory(item);
      }
    }
    document.getElementById("dayModes").addEventListener("click", toggleTypeChip);
    document.getElementById("dayModesMore").addEventListener("click", toggleTypeChip);
    document.getElementById("dayMix").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-day-mix]");
      if (!btn) return;
      document.querySelectorAll("#dayMix .chip").forEach((b) => b.classList.toggle("on", b === btn));
    });
    document.getElementById("dayStart").onclick = () => beginQuiz(false);
    document.getElementById("dayExam").onclick = () => beginQuiz(true);
    document.getElementById("dayMistakes").onclick = () => openMistakes(quizPool());
    document.getElementById("studyStart").onclick = () => beginQuiz(false);
    document.getElementById("studyExam").onclick = () => beginQuiz(true);
    document.getElementById("studyMistakes").onclick = () => openMistakes(allStudyCards());
    document.getElementById("dayq").addEventListener("keydown", (e) => {
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
        if (examMode && examTimeUp()) { showExamResult(false, "time"); return; }
        if (dayAt + 1 >= dayQueue.length) {
          if (examMode) showExamResult(examMistakes < 2, "");
          else dayBack();
          return;
        }
        dayAt += 1;
        renderDay();
        return;
      }
      if (item.type === "Choice" || item.type === "Reverse" || item.type === "Definition" || item.type === "Listen" || item.type === "Odd one out") {
        if (item.type === "Listen" && e.target.closest("[data-listen-card]")) { openMistakeCard(item.card, "dayq"); return; }
        if (item.type === "Listen" && e.target.closest("[data-speak]")) { speakEnglish(item.card.speak || item.card.en); return; }
        const opt = e.target.closest("[data-opt]");
        if (!opt || document.getElementById("dayFb").innerHTML) return;
        document.querySelectorAll("#dayqView .opt").forEach((o) => o.classList.remove("ok", "bad"));
        opt.classList.add(opt.dataset.opt === "ok" ? "ok" : "bad");
        if (opt.dataset.opt !== "ok") document.querySelector('#dayqView [data-opt="ok"]').classList.add("ok");
        markDay(opt.dataset.opt === "ok", item.right || (item.card && item.card.ru) || "");
      } else if (item.type === "Flip" && (e.target.closest("[data-flip-go]") || (e.target.closest(".flip-scene") && !e.target.closest("a, button")))) {
        const card = item.card;
        const gloss = meaningOf(card);
        const back = card.ru || gloss;
        const scene = e.target.closest("#dayqView") && e.target.closest("#dayqView").querySelector(".flip-scene");
        const box = document.getElementById("dayFlipBox");
        if (box && !box.dataset.filled) {
          box.innerHTML = '<p class="q">' + esc(back) + "</p>" + ipaHtml(card) + (card.ru && gloss ? "<p>" + esc(gloss) + "</p>" : "");
          box.dataset.filled = "1";
        }
        if (scene) scene.classList.toggle("is-flipped");
      } else if (item.type === "Type" && e.target.closest("[data-type-go]")) {
        if (document.getElementById("dayFb").innerHTML) return;
        markDay(item.card.accept ? formTypedOk(item.card, document.getElementById("dayType").value) : item.card.verb ? verbTypedOk(item.card, document.getElementById("dayType").value) : document.getElementById("dayType").value.trim().toLowerCase() === item.card.en.toLowerCase(), item.card.en);
      } else if ((item.type === "Spell" || item.type === "Letters") && e.target.closest("[data-spell-go]")) {
        if (document.getElementById("dayFb").innerHTML) return;
        markDay(document.getElementById("dayType").value.trim().toLowerCase() === item.card.en.toLowerCase(), item.card.en);
      } else if (item.type === "Gap" && e.target.closest("[data-gap-go]")) {
        if (document.getElementById("dayFb").innerHTML) return;
        markDay(document.getElementById("dayGap").value.trim().toLowerCase() === String(item.answer).toLowerCase(), item.answer);
      } else if (item.type === "Build") {
        const bank = e.target.closest("[data-bank]");
        const slot = e.target.closest("[data-slot]");
        const fb = document.getElementById("dayFb");
        if (fb.innerHTML) return;
        if (bank) { item.slot.push(item.bank.splice(Number(bank.dataset.bank), 1)[0]); paintBuild(item); }
        else if (slot) { item.bank.push(item.slot.splice(Number(slot.dataset.slot), 1)[0]); paintBuild(item); }
        else if (e.target.closest("[data-build-check]")) markDay(item.slot.join(" ") === item.order.join(" "), item.order.join(" "));
      } else if (item.type === "True / false") {
        const tf = e.target.closest("[data-tf]");
        if (!tf || document.getElementById("dayFb").innerHTML) return;
        markDay((tf.dataset.tf === "true") === item.ok, item.ok ? "True" : "False");
      } else if (item.type === "Tap") {
        const tap = e.target.closest("[data-tap]");
        if (!tap || document.getElementById("dayFb").innerHTML) return;
        markDay(tap.dataset.tap === "ok", item.card.en);
      } else if (item.type === "Match") {
        const pair = e.target.closest(".pair");
        if (!pair || pair.classList.contains("ok")) return;
        if (pair.dataset.side === "l") {
          document.querySelectorAll('#dayqView [data-side="l"]').forEach((b) => b.classList.remove("pick"));
          pair.classList.add("pick");
          item.left = pair.dataset.id;
        } else if (item.left) {
          if (pair.dataset.id === item.left) {
            document.querySelectorAll('#dayqView [data-id="' + item.left + '"]').forEach((b) => { b.classList.add("ok"); b.classList.remove("pick"); });
            item.left = "";
            if (!document.querySelector("#dayqView .pair:not(.ok)")) markDay(true, "");
          } else {
            pair.classList.add("bad");
            setTimeout(() => pair.classList.remove("bad"), 400);
          }
        }
      } else if (item.type === "Select all") {
        const sel = e.target.closest("[data-sel]");
        if (sel && !document.getElementById("dayFb").innerHTML) sel.classList.toggle("pick");
        if (e.target.closest("[data-sel-check]") && !document.getElementById("dayFb").innerHTML) {
          const picked = [...document.querySelectorAll("#dayqView [data-sel].pick")].map((b) => Number(b.dataset.sel));
          const right = item.sample.map((c, i) => c.pos === item.pos ? i : -1).filter((i) => i >= 0);
          const ok = picked.length === right.length && right.every((i) => picked.indexOf(i) >= 0);
          markDay(ok, item.sample.filter((c) => c.pos === item.pos).map((c) => c.en).join(", "));
        }
      } else if (item.type === "Hangman") {
        const key = e.target.closest("[data-hang]");
        if (!key || document.getElementById("dayFb").innerHTML) return;
        const letter = key.dataset.hang;
        if (item.got[letter] || item.missed[letter]) return;
        if (item.answer.toLowerCase().indexOf(letter) >= 0) item.got[letter] = true;
        else { item.missed[letter] = true; item.misses += 1; }
        paintHangman(item);
        const done = item.answer.split("").every((ch) => !/[a-zA-Z]/.test(ch) || item.got[ch.toLowerCase()]);
        if (done) markDay(true, item.answer);
        else if (item.misses >= 6) markDay(false, item.answer);
      } else if (item.type === "Memory") {
        const mem = e.target.closest("[data-mem]");
        if (!mem || item.busy || document.getElementById("dayFb").innerHTML) return;
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
          item.busy = true;
          setTimeout(() => {
            item.open = [];
            item.busy = false;
            if (!document.getElementById("dayFb") || document.getElementById("dayFb").innerHTML) return;
            paintMemory(item);
          }, 700);
        }
      }
    });
    paintAdded();

    const quizScreens = { choice: 1, flip: 1, type: 1, gap: 1, build: 1, judge: 1, tap: 1, multi: 1, pairs: 1, exam: 1, errors: 1, dayq: 1, daychoice: 1, dayflip: 1, dayjudge: 1 };
    let selToken = 0;
    let selTimer = 0;
    function hideSelpop() {
      const pop = document.getElementById("selpop");
      if (pop) pop.hidden = true;
      selToken += 1;
    }
    function selectionBlocked(node) {
      const section = document.querySelector("section.on");
      if (!section || quizScreens[section.id]) return true;
      if (!node || !node.closest) return false;
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
    async function loadSelpop(word) {
      const token = ++selToken;
      document.getElementById("selpopBody").innerHTML = '<p class="hint">Looking up…</p>';
      try {
        const res = await fetch(lookupBase() + "/translate?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (token !== selToken) return;
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
    function showSelectionTranslation() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelpop(); return; }
      const text = String(sel.toString() || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 80 || !/[A-Za-zА-Яа-яЁё]/.test(text)) { hideSelpop(); return; }
      if (text.split(/\s+/).length > 8) { hideSelpop(); return; }
      const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (selectionBlocked(node)) { hideSelpop(); return; }
      const pop = document.getElementById("selpop");
      document.getElementById("selpopWord").textContent = text;
      pop.hidden = false;
      placeSelpop(sel.getRangeAt(0).getBoundingClientRect());
      loadSelpop(text);
    }
    document.getElementById("selpopClose").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideSelpop();
    });
    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#selpop")) hideSelpop();
    });
    document.addEventListener("mouseup", () => {
      clearTimeout(selTimer);
      selTimer = setTimeout(showSelectionTranslation, 220);
    });
    document.addEventListener("keyup", (e) => {
      if (e.key === "Escape") { hideSelpop(); return; }
      if (e.shiftKey || e.key === "Shift") {
        clearTimeout(selTimer);
        selTimer = setTimeout(showSelectionTranslation, 220);
      }
    });

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
      return fetch(accountApi() + path, opts).then(async (res) => {
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
        if (!res.ok) {
          const plain = text && text.length <= 180 && text.indexOf("<") < 0 ? text.trim() : "";
          throw new Error(data.error || plain || "The server could not finish this request.");
        }
        return data;
      });
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
      try { stats.dayLinks = JSON.parse(localStorage.getItem(LINK_KEY) || "null"); } catch (e) { stats.dayLinks = null; }
      stats.customThemes = loadCustomThemes();
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
      syncQueue.push(change);
      scheduleStateSave();
    }
    function scheduleStateSave() {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(flushUserState, 150);
    }
    function flushUserState() {
      if (syncSending || authSyncLock || !authUser || !accountReady || !syncQueue.length) return;
      syncSending = true;
      const change = syncQueue[0];
      accountFetch(viewAccount ? "/api/admin/users/" + encodeURIComponent(viewAccount.id) + "/state" : "/api/me/state", { method: "PUT", body: JSON.stringify(change) }).then(() => {
        syncFails = 0;
        syncQueue.shift();
        syncSending = false;
        if (syncQueue.length) flushUserState();
      }).catch(() => {
        syncSending = false;
        syncFails += 1;
        if (syncFails >= 3) { syncFails = 0; syncQueue.shift(); return; }
        syncTimer = setTimeout(flushUserState, 2000);
      });
    }
    window.addEventListener("pagehide", () => { flushUserState(); });
    window.syncDemoProgress = function () {
      let value = null;
      try { value = JSON.parse(localStorage.getItem("enquiz-demonstratives") || "null"); } catch (e) { value = null; }
      syncChange({ op: "put-setting", key: "demonstratives", value: value });
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
      if (state.stats && state.stats.dayLinks) localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks));
      installCustomThemes(state.stats && Array.isArray(state.stats.customThemes) ? state.stats.customThemes : []);
      settleThemeAudience();
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
      paintAdded();
      paintLyrics();
      paintHomeAccount();
      authSyncLock = false;
    }
    function personalCounts() {
      return {
        learned: loadLearned().size,
        words: loadAdded().length,
        songs: loadSongs().filter((song) => !song.archived).length
      };
    }
    function paintHomeStats() {
      const rows = studyCards();
      const buckets = homeBuckets(rows);
      const learned = buckets.learned.length;
      const total = rows.length;
      const pct = total ? Math.round(learned * 100 / total) : 0;
      const count = document.getElementById("homeLearnedCount");
      const pctEl = document.getElementById("homeLearnedPct");
      const ring = document.querySelector("#homeDemo .ring-fg");
      const learning = document.getElementById("homeLearningCount");
      if (count) count.innerHTML = learned + " <span>of " + total + "</span>";
      if (pctEl) pctEl.textContent = pct + "%";
      if (learning) learning.textContent = String(buckets.learning.length);
      if (ring) {
        const whole = total || 1;
        ring.setAttribute("pathLength", String(whole));
        ring.setAttribute("stroke-dasharray", learned + " " + (whole - learned));
        ring.style.strokeLinecap = learned ? "round" : "butt";
      }
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
      if (!begun) {
        btn.textContent = "Start studying";
        btn.dataset.jump = "lesson23";
        return;
      }
      btn.textContent = "Continue studying";
      const recent = started.slice().reverse().find((id) => {
        const row = CLASS_PAGES.find((item) => item.id === id);
        return row && !classFinished(row.place);
      });
      const next = CLASS_PAGES.find((row) => !classFinished(row.place));
      btn.dataset.jump = recent || (next ? next.id : "lesson23");
    }
    function paintHomeAccount() {
      const who = document.getElementById("homeWho");
      const demo = document.getElementById("homeDemo");
      if (!who || !demo) return;
      who.hidden = true;
      who.innerHTML = "";
      demo.hidden = false;
      paintHomeStats();
      paintHomeStudy();
    }
    function paintAccount() {
      const box = document.getElementById("accountBody");
      if (!box) return;
      if (authUser) {
        const person = faceUser();
        box.innerHTML = '<div class="card"><p class="stat-kicker">' + roleLabel(person.role) + '</p>' +
          '<p class="entry">' + esc(person.login) + '</p><p class="hint">' + esc(person.email) + '</p>' +
          '<div class="row"><button class="btn primary" type="button" data-jump="profile">Profile</button>' +
          (viewAccount ? "" : '<button class="btn" type="button" data-account="logout">Log out</button>') +
          '</div></div>';
        return;
      }
      paintAccountForm(false);
    }
    function paintAccountForm(register) {
      const box = document.getElementById("accountBody");
      if (!box || authUser) return;
      if (register) {
        box.innerHTML = '<div class="account-gate"><div class="card"><p class="label">Register</p>' +
          '<p class="hint">Choose student or teacher. A teacher approves the account before you can sign in. No email is sent.</p>' +
          '<form id="registerForm"><input name="login" type="text" autocomplete="username" placeholder="Login" required />' +
          '<input name="email" type="email" autocomplete="email" placeholder="Email" required />' +
          '<input name="name" type="text" autocomplete="name" placeholder="Name" />' +
          '<p class="label">Role</p><select name="role" required><option value="USER">Student</option><option value="ADMIN">Teacher</option></select>' +
          '<input name="password" type="password" maxlength="32" minlength="8" autocomplete="new-password" placeholder="Password, 8 to 32 characters" required />' +
          '<p class="hint" data-form-status></p><button class="btn primary" type="submit">Create account</button></form>' +
          '<p class="hint" style="margin-top:10px"><button class="account-link" type="button" data-account="show-login">Log in</button></p></div></div>';
        return;
      }
      box.innerHTML = '<div class="account-gate"><div class="card"><p class="label">Log in</p>' +
        '<form id="loginForm"><input name="login" type="text" autocomplete="username" placeholder="Login or email" required />' +
        '<input name="password" type="password" maxlength="32" autocomplete="current-password" placeholder="Password" required />' +
        '<p class="hint" data-form-status></p><button class="btn primary" type="submit">Log in</button></form>' +
        '<p class="hint" style="margin-top:10px"><button class="account-link" type="button" data-account="show-register">Create account</button></p></div></div>';
    }
    function paintProfile() {
      const box = document.getElementById("profileBody");
      if (!box) return;
      if (!authUser) {
        box.innerHTML = '<div class="card"><p>Sign in to see your profile.</p><button class="btn primary" type="button" data-jump="account">Account</button></div>';
        return;
      }
      const person = faceUser();
      const counts = personalCounts();
      box.innerHTML = '<div class="card"><p class="stat-kicker">' + roleLabel(person.role) + '</p>' +
        '<p class="entry">' + esc(person.login) + '</p><p class="hint">' + esc(person.email) + '</p>' +
        '<div class="row">' +
        (isTeacher() ? '<button class="btn" type="button" data-jump="admin">Administration</button>' : "") +
        (viewAccount ? "" : '<button class="btn" type="button" data-account="logout">Log out</button>') +
        '</div></div>' +
        (viewAccount ? "" : '<div class="card" id="ownAccount"><p class="hint">Loading…</p></div>') +
        '<div class="overview"><div><b>' + counts.learned + '</b><span>Learned</span></div><div><b>' + counts.words + '</b><span>Words</span></div>' +
        (hideStudentSongs() ? "" : '<div><b>' + counts.songs + '</b><span>Songs</span></div>') + '</div>' +
        (viewAccount ? "" : '<p class="hint">Words, songs and progress stay with the account. Signing out removes them from this browser. They come back after you sign in.</p>' +
        '<div class="row"><button class="btn stop" type="button" data-account="revoke">Delete my data</button></div>');
      if (!viewAccount) loadOwnAccount();
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
      if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ""; return; }
      const user = data.user;
      if (data.locked) {
        slot.hidden = false;
        slot.innerHTML = '<p class="hint">You can change these details after a second active teacher joins.</p>';
        return;
      }
      const change = data.change && data.change.status === "pending" ? data.change : null;
      slot.hidden = false;
      slot.innerHTML = '<form id="ownAccountForm"><p class="hint">A teacher or developer approves the change. The request shows the current value and the new one.</p>' +
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
      if (!slot.hidden) { slot.hidden = true; slot.innerHTML = ""; return; }
      slot.hidden = false;
      slot.innerHTML = '<form id="ownPasswordForm"><p class="hint">The new password is saved immediately.</p>' +
        '<p class="label">Current password</p><input name="current" type="password" autocomplete="current-password" required />' +
        '<p class="label">New password</p><input name="password" type="password" minlength="8" maxlength="32" autocomplete="new-password" placeholder="8 to 32 characters" required />' +
        '<p class="label">Repeat new password</p><input name="repeat" type="password" minlength="8" maxlength="32" autocomplete="new-password" required />' +
        '<p class="hint" data-form-status></p><button class="btn primary" type="submit">Save password</button></form>';
    }
    function loadOwnAccount() {
      accountFetch("/api/me/account").then(renderOwnAccount).catch((err) => {
        const box = document.getElementById("ownAccount");
        if (box) box.innerHTML = '<p class="hint bad">' + esc(err.message) + '</p>';
      });
    }
    function statusLabel(status) {
      if (status === "pending") return "Waiting";
      if (status === "approved") return "Approved";
      if (status === "rejected") return "Rejected";
      return status;
    }
    function when(seconds) {
      if (!seconds) return "";
      const date = new Date(seconds * 1000);
      return date.toLocaleString();
    }
    function accountVisible(row) {
      if (!row) return false;
      if (isDeveloper()) return true;
      return row.role !== "DEVELOPER" && !row.hidden && !row.revoked;
    }
    function accountMark(row) {
      const state = row && row.revoked ? ' · <span class="mark-deleted">deleted</span>' : (row && row.active === false ? " · inactive" : ' · <span class="mark-active">active</span>');
      return state + (isDeveloper() && row && row.hidden ? ' · <span class="mark-hidden">hidden</span>' : "");
    }
    function recentRows(items, render) {
      const head = items.slice(0, 3).map((item, i) => render(item, i + 1)).join("");
      const tail = items.slice(3);
      if (!tail.length) return head;
      const id = "rest" + Math.random().toString(36).slice(2, 8);
      return head + '<div id="' + id + '" hidden>' + tail.map((item, i) => render(item, i + 4)).join("") + '</div>' +
        '<button class="btn" type="button" data-list-more="' + id + '">Show the rest</button>';
    }
    function paintAdmin() {
      const box = document.getElementById("adminBody");
      if (!box) return;
      if (!isTeacher()) {
        box.innerHTML = '<div class="card"><p>Teachers only.</p></div>';
        return;
      }
      box.innerHTML = '<p class="hint">Loading…</p>';
      Promise.all([
        accountFetch("/api/admin/registrations"),
        accountFetch("/api/admin/users"),
        accountFetch("/api/admin/changes")
      ]).then(([regs, users, changes]) => {
        const waiting = (regs.registrations || []).filter((row) => row.status === "pending" && accountVisible(row));
        const history = (regs.registrations || []).filter(accountVisible);
        const accounts = (users.users || []).filter(accountVisible);
        const changeRows = (changes.changes || []).filter(accountVisible);
        box.innerHTML = '<div class="card"><p class="label">Account changes</p>' +
          (changeRows.length ? recentRows(changeRows, (row, n) => {
            if (row.status !== "pending") {
              return '<div style="margin:8px 0"><b>' + n + ". " + esc(row.from_login) + '</b> · ' + statusLabel(row.status) +
                changeHtml(row) +
                '<p class="hint">' + esc(when(row.decided_at || row.created_at)) + '</p></div>';
            }
            const own = authUser && row.user_id === authUser.id;
            const blocked = row.locked || (own && !sessionIsDeveloper());
            const note = row.locked
              ? '<p class="hint">This teacher can change account details after a second active teacher joins.</p>'
              : (own && !sessionIsDeveloper() ? '<p class="hint">Someone else has to approve this.</p>' : "");
            const approve = blocked ? "" : '<button class="btn primary" type="button" data-account="approve-change" data-id="' + esc(row.id) + '">Approve</button>';
            return '<div style="margin:8px 0"><b>' + n + ". " + esc(row.from_login) + '</b>' +
              (isDeveloper() ? " · " + esc(roleLabel(row.role)) : "") +
              changeHtml(row) + note +
              '<div class="row">' + approve +
              '<button class="btn" type="button" data-account="reject-change" data-id="' + esc(row.id) + '">Reject</button></div></div>';
          }) : '<p class="hint">No account changes are waiting.</p>') +
          '</div><div class="card"><p class="label">Waiting for approval</p>' +
          (waiting.length ? waiting.map((row) =>
            '<div class="row" style="margin:8px 0"><div><b>' + esc(row.login) + '</b><br><span class="hint">' + esc(row.email) + (row.name ? " · " + esc(row.name) : "") + ' · ' + roleLabel(row.role) + '</span></div>' +
            '<button class="btn primary" type="button" data-account="approve" data-id="' + esc(row.id) + '">Approve</button>' +
            '<button class="btn" type="button" data-account="reject" data-id="' + esc(row.id) + '">Reject</button></div>'
          ).join("") : '<p class="hint">No one is waiting.</p>') +
          '</div><div class="card"><p class="label">Accounts</p>' +
          recentRows((accounts || []).slice().sort((a, b) => (a && !a.revoked && a.active !== false ? 0 : 1) - (b && !b.revoked && b.active !== false ? 0 : 1)), (row, n) =>
            '<button class="path" type="button" data-account="user" data-id="' + esc(row.id) + '"><span><b>' + n + ". " + esc(row.login) + '</b><br><span class="label">' + esc(row.email) + ' · ' + roleLabel(row.role) + accountMark(row) + '</span></span></button>'
          ) +
          '</div><div class="card"><p class="label">Registration history</p>' +
          (history.length ? recentRows(history, (row, n) =>
            '<p><b>' + n + ". " + esc(row.login) + '</b> · ' + esc(row.email) + '<br><span class="hint">' + statusLabel(row.status) + ' · ' + esc(when(row.created_at)) + '</span></p>'
          ) : '<p class="hint">No registrations yet.</p>') +
          '</div><div id="adminUser"></div>';
      }).catch((err) => {
        box.innerHTML = '<div class="card"><p class="hint bad">' + esc(err.message) + '</p></div>';
      });
    }
    function paintAdminUser(id) {
      const slot = document.getElementById("adminUser");
      if (!slot) return;
      slot.innerHTML = '<p class="hint">Loading…</p>';
      accountFetch("/api/admin/users/" + encodeURIComponent(id)).then((data) => {
        const user = data.user;
        slot.innerHTML = '<div class="card"><p class="stat-kicker">' + esc(user.login) + '</p>' +
          '<p class="hint">' + roleLabel(user.role) + accountMark(user) + '</p>' +
          (isDeveloper() && (user.role === "USER" || user.role === "ADMIN") ?
            '<p class="label">Login</p><input data-profile-login type="text" value="' + esc(user.login) + '" autocomplete="off" />' +
            '<p class="label">Email</p><input data-profile-email type="email" value="' + esc(user.email) + '" autocomplete="off" />' +
            '<p class="label">Name</p><input data-profile-name type="text" value="' + esc(user.name || "") + '" autocomplete="off" />' +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="save-profile" data-id="' + esc(user.id) + '">Save details</button>' +
            '<button class="btn primary" type="button" data-account="open-pages" data-id="' + esc(user.id) + '" data-login="' + esc(user.login) + '" data-role="' + esc(user.role) + '" data-email="' + esc(user.email) + '" data-name="' + esc(user.name || "") + '">Open pages</button></div>' +
            '<p class="label">Role</p><select data-role-pick>' +
            '<option value="USER"' + (user.role === "USER" ? " selected" : "") + '>Student</option>' +
            '<option value="ADMIN"' + (user.role === "ADMIN" ? " selected" : "") + '>Teacher</option>' +
            '<option value="DEVELOPER"' + (user.role === "DEVELOPER" ? " selected" : "") + '>Developer</option></select>' +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="set-role" data-id="' + esc(user.id) + '">Save role</button>' +
            '<button class="btn" type="button" data-account="hide-user" data-id="' + esc(user.id) + '" data-hidden="' + (user.hidden ? "1" : "") + '">' + (user.hidden ? "Show account" : "Hide account") + '</button>' +
            '<button class="btn" type="button" data-account="active-user" data-id="' + esc(user.id) + '" data-active="' + (user.active === false ? "" : "1") + '">' + (user.active === false ? "Activate" : "Deactivate") + '</button>' +
            '<button class="btn stop" type="button" data-account="delete-user" data-id="' + esc(user.id) + '">Delete account</button></div>'
            : '<p>' + esc(user.email) + (user.name ? " · " + esc(user.name) : "") + '</p>' +
              (authUser && authUser.role === "ADMIN" && user.role === "USER" ?
                '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-account="open-pages" data-id="' + esc(user.id) + '" data-login="' + esc(user.login) + '" data-role="USER" data-email="' + esc(user.email) + '" data-name="' + esc(user.name || "") + '">Open pages</button></div>' : '') +
              (isDeveloper() ? '<p class="label">Role</p><select data-role-pick>' +
                '<option value="USER"' + (user.role === "USER" ? " selected" : "") + '>Student</option>' +
                '<option value="ADMIN"' + (user.role === "ADMIN" ? " selected" : "") + '>Teacher</option>' +
                '<option value="DEVELOPER"' + (user.role === "DEVELOPER" ? " selected" : "") + '>Developer</option></select>' +
                '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-account="set-role" data-id="' + esc(user.id) + '">Save role</button>' +
                '<button class="btn" type="button" data-account="hide-user" data-id="' + esc(user.id) + '" data-hidden="' + (user.hidden ? "1" : "") + '">' + (user.hidden ? "Show account" : "Hide account") + '</button>' +
                '<button class="btn" type="button" data-account="active-user" data-id="' + esc(user.id) + '" data-active="' + (user.active === false ? "" : "1") + '">' + (user.active === false ? "Activate" : "Deactivate") + '</button></div>' : "")) +
          '<p class="hint">Passwords are not shown and cannot be changed here.</p></div>';
      }).catch((err) => {
        slot.innerHTML = '<p class="hint bad">' + esc(err.message) + '</p>';
      });
    }
    function viewKeys() {
      return [ADDED_KEY, SONG_KEY, LEARNED_KEY, VARIANT_KEY, MISTAKE_KEY, "enquiz-lyric-size", "enquiz-demonstratives", EDIT_KEY, CUSTOM_THEME_KEY];
    }
    function stashDeveloper() {
      return idbGetStash().then((existing) => {
        if (existing) return;
        const snap = {};
        viewKeys().forEach((key) => { snap[key] = localStorage.getItem(key); });
        return idbPutStash(snap).then(() => {
          viewKeys().forEach((key) => localStorage.removeItem(key));
          addedCache = null;
          localStorage.removeItem("enquiz-dev-stash");
        });
      });
    }
    function applyStash(snap) {
      if (!snap) return;
      viewKeys().forEach((key) => {
        if (snap[key] == null) localStorage.removeItem(key);
        else localStorage.setItem(key, snap[key]);
      });
      addedCache = null;
    }
    function restoreDeveloper() {
      const raw = localStorage.getItem("enquiz-dev-stash");
      let legacy = null;
      if (raw != null) {
        try { legacy = JSON.parse(raw) || {}; } catch (e) { legacy = {}; }
      }
      return idbGetStash().then((snap) => {
        applyStash(snap || legacy);
        localStorage.removeItem("enquiz-dev-stash");
        return idbDeleteStash();
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
    }
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
      if (state.stats && state.stats.dayLinks) localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks));
      installCustomThemes(state.stats && Array.isArray(state.stats.customThemes) ? state.stats.customThemes : []);
      settleThemeAudience();
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
      paintAdded();
      paintLyrics();
      paintHomeStats();
      if (window.paintDemonstratives) window.paintDemonstratives();
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
      accountReady = false;
      return stashDeveloper().then(() => {
        rememberView(user);
        syncQueue.length = 0;
        refreshCatalog();
        paintViewBar();
        show("home");
        return accountFetch("/api/admin/users/" + encodeURIComponent(user.id) + "/state").then((state) => {
          addedCache = null;
          applyViewState(state || {});
          accountReady = true;
          paintViewBar();
          show("home");
        }).catch((err) => exitStudentPages().then(() => alert(err.message)));
      }).catch(() => {
        viewAccount = null;
        forgetViewFlags();
        return restoreDeveloper().then(() => {
          alert("This browser could not switch pages. Your own pages are still here.");
        });
      });
    }
    function exitStudentPages() {
      viewAccount = null;
      forgetViewFlags();
      syncQueue.length = 0;
      return restoreDeveloper().then(() => {
        addedCache = null;
        lyricSize = Number(localStorage.getItem("enquiz-lyric-size")) || 20;
        applyLessonEdits();
        applySongEdits();
        refreshCatalog();
        paintLyrics();
        paintHomeStats();
        paintHomeAccount();
        paintAccount();
        settleThemeAudience();
        paintViewBar();
        accountReady = !!authUser;
        show("home");
      });
    }
    function cardArea(place) {
      const value = place || "mine";
      if (value.indexOf("lesson") === 0) return "class";
      if (value === "mine") return "my words";
      if (value === "music") return "lyrics";
      if (value === "tenses") return "grammar";
      return String(value).slice(0, 32);
    }
    function trackEvent(kind, area, result) {
      if (!authUser) return;
      const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const payload = { id: id, kind: kind, area: area || "", result: result || "" };
      if (viewAccount) payload.for = viewAccount.id;
      accountFetch("/api/stats/event", {
        method: "POST",
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
    function statsShift(days) {
      const end = new Date();
      const to = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      const from = new Date(to.getTime() - (days - 1) * 86400000);
      const fromEl = document.getElementById("statsFrom");
      const toEl = document.getElementById("statsTo");
      if (fromEl) fromEl.value = from.toISOString().slice(0, 10);
      if (toEl) toEl.value = to.toISOString().slice(0, 10);
    }
    function statsDelta(current, previous, compare) {
      if (!compare) return "";
      if (!previous) return '<p class="hint">Previous period: 0</p>';
      const pct = Math.round((current - previous) * 100 / previous);
      const cls = pct > 0 ? "up" : pct < 0 ? "down" : "";
      const sign = pct > 0 ? "+" : "";
      return '<p class="delta ' + cls + '">' + sign + pct + '% vs previous period</p>';
    }
    function statsBars(rows, label) {
      const max = rows.reduce((peak, row) => Math.max(peak, row.value), 1);
      const step = rows.length > 16 ? Math.ceil(rows.length / 8) : 1;
      return '<div class="bars" role="img" aria-label="' + esc(label) + '">' + rows.map((row, index) =>
        '<div class="bar-col" title="' + esc(row.title + ": " + row.value) + '"><i style="height:' + (row.value ? Math.max(2, Math.round(row.value / max * 100)) : 0) + '%"></i><span>' + (index % step === 0 ? esc(row.label) : "") + "</span></div>"
      ).join("") + "</div>";
    }
    function statsBuckets(series, key) {
      if (series.length <= 42) return series.map((row) => ({ label: row.day.slice(5), value: row[key] || 0, title: row.day }));
      const weeks = [];
      for (let i = 0; i < series.length; i += 7) {
        const slice = series.slice(i, i + 7);
        weeks.push({
          label: slice[0].day.slice(5),
          value: slice.reduce((sum, row) => sum + (row[key] || 0), 0),
          title: slice[0].day + " to " + slice[slice.length - 1].day
        });
      }
      return weeks;
    }
    let statsToken = 0;
    function statsRates(series) {
      const groups = [];
      if (series.length <= 42) {
        series.forEach((row) => groups.push({ label: row.day.slice(5), title: row.day, answers: row.answers || 0, correct: row.correct || 0 }));
      } else {
        for (let i = 0; i < series.length; i += 7) {
          const slice = series.slice(i, i + 7);
          groups.push({
            label: slice[0].day.slice(5),
            title: slice[0].day + " to " + slice[slice.length - 1].day,
            answers: slice.reduce((sum, row) => sum + (row.answers || 0), 0),
            correct: slice.reduce((sum, row) => sum + (row.correct || 0), 0)
          });
        }
      }
      return groups.filter((row) => row.answers).map((row) => ({
        label: row.label,
        title: row.title + ": " + row.correct + " of " + row.answers + " correct",
        value: Math.round(row.correct * 100 / row.answers)
      }));
    }
    function statsList(title, map) {
      const names = Object.keys(map || {}).sort((a, b) => map[b] - map[a]);
      if (!names.length) return "";
      let html = '<div class="card"><p class="label">' + esc(title) + "</p>";
      names.forEach((name) => {
        html += '<div class="funnel-step"><span>' + esc(name) + "</span><b>" + map[name] + "</b></div>";
      });
      return html + "</div>";
    }
    function fillStatsPeople(people) {
      const userEl = document.getElementById("statsUser");
      if (!userEl) return;
      const selected = userEl.value;
      const ids = (people || []).map((person) => person.id).join(",");
      if (userEl.dataset.ids === ids) return;
      userEl.dataset.ids = ids;
      userEl.innerHTML = '<option value="">All people</option>' + (people || []).map((person) =>
        '<option value="' + esc(person.id) + '">' + esc(person.login || "Account") + " · " + esc(roleLabel(person.role)) + "</option>"
      ).join("");
      if ([].some.call(userEl.options, (option) => option.value === selected)) userEl.value = selected;
    }
    function statsIntro() {
      const sub = document.getElementById("statsSub");
      const roleEl = document.getElementById("statsRole");
      const userEl = document.getElementById("statsUser");
      const developer = isDeveloper();
      if (developer && roleEl && !roleEl.querySelector('option[value="DEVELOPER"]')) {
        const option = document.createElement("option");
        option.value = "DEVELOPER";
        option.textContent = "Developer";
        roleEl.appendChild(option);
      }
      if (roleEl) roleEl.hidden = !developer;
      if (userEl) userEl.hidden = !developer;
      if (!developer) {
        if (roleEl) roleEl.value = "";
        if (userEl) userEl.value = "";
      }
      if (!sub) return;
      if (!authUser) sub.textContent = "Sign in to see your statistics. Dates are UTC.";
      else if (developer) sub.textContent = "Overall numbers for the app. Dates are UTC. The period filter applies to every figure on this page.";
      else if (hideStudentSongs()) sub.textContent = "This student's study: learned checks, answers and exams. Dates are UTC.";
      else if ((viewAccount ? viewAccount.role : authUser.role) === "ADMIN") sub.textContent = "Your study. Students are not assigned to a teacher here, so this page stays yours. Dates are UTC.";
      else sub.textContent = "Your study. Dates are UTC. The period filter applies to every figure on this page.";
    }
    function paintStats() {
      const box = document.getElementById("statsBody");
      if (!box) return;
      statsIntro();
      if (!document.getElementById("statsFrom").value) statsShift(30);
      if (!authUser) {
        box.innerHTML = '<div class="card"><p>Sign in to see your statistics.</p></div>';
        return;
      }
      const token = ++statsToken;
      box.innerHTML = '<p class="hint">Loading…</p>';
      const params = new URLSearchParams();
      params.set("from", document.getElementById("statsFrom").value);
      params.set("to", document.getElementById("statsTo").value);
      if (viewAccount) {
        params.set("user", viewAccount.id);
        params.set("as", "user");
      } else if (isDeveloper()) {
        const role = document.getElementById("statsRole").value;
        const person = document.getElementById("statsUser").value;
        if (role) params.set("role", role);
        if (person) params.set("user", person);
      }
      const compare = document.getElementById("statsCompare").checked;
      accountFetch("/api/stats?" + params.toString()).then((data) => {
        if (token !== statsToken) return;
        const fromEl = document.getElementById("statsFrom");
        const toEl = document.getElementById("statsTo");
        if (fromEl && data.from) fromEl.value = data.from;
        if (toEl && data.to) toEl.value = data.to;
        if (data.scope === "all") fillStatsPeople(data.people || []);
        box.innerHTML = renderStats(data, compare);
      }).catch((err) => {
        if (token !== statsToken) return;
        box.innerHTML = '<div class="card"><p class="hint bad">' + esc(err.message) + "</p></div>";
      });
    }
    function renderStats(data, compare) {
      const accounts = data.accounts || {};
      const regs = data.registrations || {};
      const activity = data.activity || {};
      const overall = data.scope === "all";
      const period = data.from + " to " + data.to + " UTC";
      let html = "";
      if (overall && data.directory === false) {
        html += '<div class="card"><p>Account and registration counts are not ready yet. They appear after a teacher signs in once, when the account list is saved. Nothing here is filled in with zero.</p></div>';
      } else if (overall) {
        html += '<div class="overview">';
        html += '<div><b>' + accounts.created + '</b><span>New accounts</span>' + statsDelta(accounts.created, accounts.previous, compare) + "</div>";
        html += '<div><b>' + regs.created + '</b><span>New registrations</span>' + statsDelta(regs.created, regs.previous && regs.previous.created, compare) + "</div>";
        html += '<div><b>' + (regs.approved + regs.rejected) + '</b><span>Decisions</span>' + statsDelta(regs.approved + regs.rejected, regs.previous ? regs.previous.approved + regs.previous.rejected : 0, compare) + "</div>";
        if (regs.approvalRate == null) html += '<div><b>—</b><span>Approval rate</span><p class="hint">No decisions in this period.</p></div>';
        else html += '<div><b>' + Math.round(regs.approvalRate * 100) + '%</b><span>Approval rate</span>' + (compare && regs.previous && regs.previous.approvalRate != null ? '<p class="hint">Previous period: ' + Math.round(regs.previous.approvalRate * 100) + "%</p>" : "") + "</div>";
        html += "</div>";
      }
      html += '<p class="hint">' + esc(period) + (compare ? ". Previous period " + esc(data.previousFrom) + " to " + esc(data.previousTo) + "." : "") + "</p>";
      if (overall && data.directory !== false) {
        const accountBars = statsBuckets(accounts.series || [], "count");
        html += '<div class="card"><p class="label">New accounts' + ((accounts.series || []).length > 42 ? " by week" : " by day") + "</p>";
        html += '<p class="hint">Count of accounts whose creation date falls in each ' + ((accounts.series || []).length > 42 ? "week" : "day") + ". A day with none is a real zero.</p>";
        html += statsBars(accountBars, "New accounts");
        html += '<table class="stat-table"><thead><tr><th>Day</th><th>Accounts</th></tr></thead><tbody>';
        (accounts.series || []).forEach((row) => {
          if (!row.count) return;
          html += "<tr><td>" + esc(row.day) + "</td><td>" + row.count + "</td></tr>";
        });
        if (!(accounts.series || []).some((row) => row.count)) html += '<tr><td colspan="2">No new accounts in this period.</td></tr>';
        html += "</tbody></table></div>";
        const roles = accounts.byRole || {};
        html += '<div class="card"><p class="label">New accounts by role</p><p class="hint">Role on the account now, among accounts created in this period.</p>';
        html += '<div class="funnel-step"><span>Students</span><b>' + (roles.USER || 0) + "</b></div>";
        html += '<div class="funnel-step"><span>Teachers</span><b>' + (roles.ADMIN || 0) + "</b></div>";
        html += '<div class="funnel-step"><span>Developers</span><b>' + (roles.DEVELOPER || 0) + "</b></div>";
        html += '<p class="hint">Registrations opened in this period that are still pending: ' + regs.pending + ". Approved decisions: " + regs.approved + ". Rejected decisions: " + regs.rejected + ".</p>";
        if (accounts.undated) html += '<p class="hint">' + accounts.undated + " accounts have no creation date and are left out.</p>";
        if (regs.undated) html += '<p class="hint">' + regs.undated + " registrations have no dates and are left out.</p>";
        html += "</div>";
      }
      if (!activity.tracked) {
        html += '<div class="card"><p class="label">Study activity</p><p>' + (overall
          ? "No study activity has been recorded yet. Checked answers, exams, new cards and new songs will appear here after they happen. Older study is not shown as zero."
          : "No study activity has been recorded for you yet. Checked answers, exams, new cards and new songs will appear here after they happen.") + "</p></div>";
      } else {
        const activityCompare = compare && activity.since <= data.previousFrom;
        html += '<div class="overview">';
        if (overall) html += '<div><b>' + activity.activeUsers + '</b><span>Active people</span>' + statsDelta(activity.activeUsers, activity.previousActiveUsers, activityCompare) + '<p class="hint">Signed-in people with a recorded action.</p></div>';
        html += '<div><b>' + activity.answers + '</b><span>Answers checked</span>' + statsDelta(activity.answers, activity.previousAnswers, activityCompare) + "</div>";
        if (!activity.answers) html += '<div><b>—</b><span>Correct</span><p class="hint">No checked answers in this period.</p></div>';
        else html += '<div><b>' + Math.round(activity.correct * 100 / activity.answers) + '%</b><span>Correct</span><p class="hint">' + activity.correct + " of " + activity.answers + "</p></div>";
        if (!activity.exams) html += '<div><b>—</b><span>Exams passed</span><p class="hint">No exams in this period.</p></div>';
        else html += '<div><b>' + activity.examPass + "/" + activity.exams + '</b><span>Exams passed</span>' + statsDelta(activity.examPass, activity.previousExamPass, activityCompare) + "</div>";
        html += "</div>";
        html += '<div class="overview">';
        html += '<div><b>' + activity.learned + '</b><span>Learned checks</span>' + statsDelta(activity.learned, activity.previousLearned, activityCompare) + '<p class="hint">A check reached four correct answers in a row.</p></div>';
        html += '<div><b>' + activity.cards + '</b><span>Cards added</span>' + statsDelta(activity.cards, activity.previousCards, activityCompare) + "</div>";
        if (!data.hideSongs) {
          html += '<div><b>' + activity.songs + '</b><span>Songs added</span>' + statsDelta(activity.songs, activity.previousSongs, activityCompare) + "</div>";
          html += '<div><b>' + activity.archives + '</b><span>Songs archived</span>' + statsDelta(activity.archives, activity.previousArchives, activityCompare) + "</div>";
        }
        html += "</div>";
        html += '<p class="hint">Study recording started ' + esc(activity.since) + " UTC. Days before that are left out, not shown as zero.</p>";
        if (compare && !activityCompare) html += '<p class="hint">The previous period started before recording, so study figures are not compared with it.</p>';
        const answerBars = statsBuckets(activity.series || [], "answers");
        if (answerBars.length) {
          html += '<div class="card"><p class="label">Answers checked' + ((activity.series || []).length > 42 ? " by week" : " by day") + "</p>";
          html += '<p class="hint">Number of checked answers. Unit: answers.</p>';
          html += statsBars(answerBars, "Answers checked");
          html += "</div>";
        }
        const rates = statsRates(activity.series || []);
        if (rates.length) {
          html += '<div class="card"><p class="label">Correct answers, percent' + ((activity.series || []).length > 42 ? " by week" : " by day") + "</p>";
          html += '<p class="hint">Only ' + ((activity.series || []).length > 42 ? "weeks" : "days") + " that have checked answers. Unit: percent.</p>";
          html += statsBars(rates, "Correct answers, percent");
          html += "</div>";
        }
        html += statsList("Answers by quiz", activity.byArea);
        html += statsList("Cards added by place", activity.cardAreas);
        const failLabels = { time: "Time ran out", mistakes: "Two mistakes", score: "Not passed" };
        const failMap = {};
        Object.keys(activity.examFail || {}).forEach((key) => { failMap[failLabels[key] || key] = activity.examFail[key]; });
        html += statsList("Exams not passed", failMap);
        if (activity.funnel) {
          html += '<div class="card"><p class="label">Study steps</p><p class="hint">' + (overall ? "People in this period. Each step counts a person once." : "Your steps in this period.") + "</p>";
          html += '<div class="funnel-step"><span>Checked an answer</span><b>' + activity.funnel.answered + "</b></div>";
          html += '<div class="funnel-step"><span>Had a correct answer</span><b>' + activity.funnel.correct + "</b></div>";
          html += '<div class="funnel-step"><span>Learned a check</span><b>' + activity.funnel.learned + "</b></div></div>";
        }
        if (activityCompare && activity.retention && !overall) {
          html += '<div class="card"><p class="label">Came back</p><p>' + (activity.retention.returned ? "You studied in the previous period and again in this one." : "You studied in the previous period, and not in this one.") + "</p></div>";
        } else if (activityCompare && activity.retention) {
          html += '<div class="card"><p class="label">Came back</p><p><b>' + activity.retention.returned + "</b> of <b>" + activity.retention.base + "</b> people who studied in the previous period also studied in this one.</p></div>";
        } else if (activityCompare) {
          html += '<div class="card"><p class="label">Came back</p><p class="hint">' + (overall ? "Nobody studied in the previous period, so this share cannot be calculated." : "You did not study in the previous period, so this cannot be calculated.") + "</p></div>";
        }
        if (overall && data.byUser && data.byUser.length) {
          html += '<div class="card"><p class="label">People</p><p class="hint">Study in this period. One row per person who has a recorded action.</p>';
          html += '<table class="stat-table"><thead><tr><th>Person</th><th>Role</th><th>Answers</th><th>Correct</th><th>Exams</th><th>Learned</th><th>Cards</th><th>Songs</th></tr></thead><tbody>';
          data.byUser.forEach((row) => {
            html += "<tr><td>" + esc(row.login || "Account") + "</td><td>" + esc(roleLabel(row.role)) + "</td><td>" + row.answers + "</td><td>" + row.correct + "</td><td>" + row.examPass + "/" + row.exams + "</td><td>" + row.learned + "</td><td>" + row.cards + "</td><td>" + row.songs + "</td></tr>";
          });
          html += "</tbody></table></div>";
        }
      }
      html += '<div class="row"><button class="btn" type="button" data-stats-export>Download CSV</button></div>';
      boxDataset(data);
      return html;
    }
    function boxDataset(data) {
      const box = document.getElementById("statsBody");
      if (box) box._stats = data;
    }
    function csvCell(value) {
      const text = String(value == null ? "" : value);
      if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }
    function exportStats() {
      const box = document.getElementById("statsBody");
      const data = box && box._stats;
      if (!data) return;
      const lines = ["day,new accounts,answers,correct answers"];
      const answers = {};
      ((data.activity && data.activity.series) || []).forEach((row) => { answers[row.day] = row; });
      const days = (data.scope === "all" && data.accounts && data.accounts.series) || (data.activity && data.activity.series) || [];
      days.forEach((row) => {
        const study = answers[row.day] || {};
        const accounts = data.scope === "all" && row.count != null ? row.count : "";
        lines.push([row.day, accounts, study.answers == null ? "" : study.answers, study.correct == null ? "" : study.correct].join(","));
      });
      if (data.scope === "all" && data.byUser && data.byUser.length) {
        lines.push("");
        lines.push("person,role,answers,correct,exams,passed,learned,cards,songs");
        data.byUser.forEach((row) => {
          lines.push([csvCell(row.login || "Account"), csvCell(roleLabel(row.role)), row.answers, row.correct, row.exams, row.examPass, row.learned, row.cards, row.songs].join(","));
        });
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "statistics-" + data.from + "-to-" + data.to + ".csv";
      link.click();
      URL.revokeObjectURL(link.href);
    }
    function enterAccount(user) {
      authUser = user;
      accountReady = false;
      localStorage.setItem("enquiz-auth-on", "1");
      paintAccount();
      const on = document.querySelector("section.on");
      if (on && on.id === "account") show("profile");
      else if (on && on.id === "home") paintHomeAccount();
      return accountFetch("/api/me/state").then((state) => {
        fillEmptyFromAccount(state);
        accountReady = true;
        startAccountPull();
        if (syncQueue.length) scheduleStateSave();
      }).catch(() => {
        accountReady = !!(loadAdded().length || loadSongs().length);
        if (syncQueue.length) scheduleStateSave();
      });
    }
    function clearMediaStore() {
      return mediaDb().then((db) => new Promise((resolve) => {
        const names = ["files", "added"].filter((name) => db.objectStoreNames.contains(name));
        if (!names.length) { resolve(); return; }
        const tx = db.transaction(names, "readwrite");
        names.forEach((name) => tx.objectStore(name).clear());
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      })).catch(() => {});
    }
    function clearOwnBrowserData() {
      viewKeys().forEach((key) => localStorage.removeItem(key));
      ["enquiz-anon-backup", "enquiz-auth-on", "enquiz-dev-stash", "enquiz-view-id", "enquiz-view-login", "enquiz-view-role", "enquiz-view-email", "enquiz-view-name"].forEach((key) => localStorage.removeItem(key));
      try { sessionStorage.removeItem("enquiz-place"); } catch (e) {}
      Object.keys(songBlobUrls).forEach(forgetBlobUrl);
      addedCache = null;
      lyricSize = 20;
      return Promise.all([clearMediaStore(), idbDeleteStash()]);
    }
    function leaveAccount() {
      viewAccount = null;
      authUser = null;
      accountReady = false;
      syncQueue.length = 0;
      clearTimeout(syncTimer);
      stopAccountPull();
      paintViewBar();
      return clearOwnBrowserData().then(() => {
        paintAdded();
        paintLyrics();
        refreshCatalog();
        if (window.paintDemonstratives) window.paintDemonstratives();
        settleThemeAudience();
        paintHomeAccount();
        paintAccount();
        show("home");
      });
    }
    document.body.addEventListener("change", (e) => {
      const id = e.target && e.target.id;
      if (id === "statsFrom" || id === "statsTo") {
        document.querySelectorAll("[data-stats-range]").forEach((btn) => btn.classList.remove("primary"));
      }
      if (id === "statsFrom" || id === "statsTo" || id === "statsRole" || id === "statsUser" || id === "statsCompare") paintStats();
    });
    document.body.addEventListener("submit", (e) => {
      const form = e.target;
      if (form.id === "ownPasswordForm") {
        e.preventDefault();
        const status = form.querySelector("[data-form-status]");
        const data = Object.fromEntries(new FormData(form).entries());
        if (status) { status.textContent = ""; status.classList.remove("bad"); }
        if (data.password !== data.repeat) {
          if (status) { status.textContent = "The new passwords do not match."; status.classList.add("bad"); }
          return;
        }
        accountFetch("/api/me/password", { method: "POST", body: JSON.stringify({ current: data.current, password: data.password }) }).then(() => {
          form.reset();
          if (status) status.textContent = "Password saved.";
        }).catch((err) => {
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        });
        return;
      }
      if (form.id === "ownAccountForm") {
        e.preventDefault();
        const status = form.querySelector("[data-form-status]");
        const data = Object.fromEntries(new FormData(form).entries());
        if (status) { status.textContent = ""; status.classList.remove("bad"); }
        accountFetch("/api/me/account", { method: "POST", body: JSON.stringify(data) }).then(() => loadOwnAccount()).catch((err) => {
          if (status) { status.textContent = err.message; status.classList.add("bad"); }
        });
        return;
      }
      if (form.id !== "loginForm" && form.id !== "registerForm") return;
      e.preventDefault();
      const status = form.querySelector("[data-form-status]");
      const data = Object.fromEntries(new FormData(form).entries());
      const path = form.id === "loginForm" ? "/api/login" : "/api/register";
      if (status) { status.textContent = ""; status.classList.remove("bad"); }
      accountFetch(path, { method: "POST", body: JSON.stringify(data) }).then((result) => {
        if (result.status === "pending") {
          paintAccountForm(false);
          const loginStatus = document.querySelector("#loginForm [data-form-status]");
          if (loginStatus) loginStatus.textContent = "Waiting for approval. You can sign in after the teacher accepts this account.";
          return;
        }
        return enterAccount(result.user);
      }).catch((err) => {
        if (status) { status.textContent = err.message; status.classList.add("bad"); }
      });
    });
    document.body.addEventListener("click", (e) => {
      const range = e.target.closest("[data-stats-range]");
      if (range) {
        document.querySelectorAll("[data-stats-range]").forEach((btn) => btn.classList.toggle("primary", btn === range));
        statsShift(Number(range.dataset.statsRange));
        paintStats();
        return;
      }
      if (e.target.closest("[data-stats-export]")) { exportStats(); return; }
      const button = e.target.closest("[data-account]");
      if (!button) return;
      const action = button.dataset.account;
      if (action === "show-register") { paintAccountForm(true); return; }
      if (action === "show-login") { paintAccountForm(false); return; }
      if (action === "logout") {
        accountFetch("/api/logout", { method: "POST", body: "{}" }).catch(() => {}).then(() => leaveAccount());
        return;
      }
      if (action === "revoke") {
        if (!confirm("This deletes your words, songs and progress. You will be signed out and cannot sign in to this account again. Registering with the same email starts a new empty account.")) return;
        accountFetch("/api/me/revoke", { method: "POST", body: "{}" }).then(() => leaveAccount()).catch((err) => alert(err.message));
        return;
      }
      if (action === "edit-details") { openOwnAccountForm(); return; }
      if (action === "edit-password") { openOwnPasswordForm(); return; }
      if (action === "cancel-change") {
        accountFetch("/api/me/account/cancel", { method: "POST", body: "{}" }).then(() => loadOwnAccount()).catch((err) => alert(err.message));
        return;
      }
      if (action === "approve-change" || action === "reject-change") {
        const verb = action === "approve-change" ? "approve" : "reject";
        accountFetch("/api/admin/changes/" + encodeURIComponent(button.dataset.id) + "/" + verb, { method: "POST", body: "{}" })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "approve" || action === "reject") {
        accountFetch("/api/admin/registrations/" + encodeURIComponent(button.dataset.id) + "/" + action, { method: "POST", body: "{}" })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "save-profile") {
        const card = button.closest(".card");
        const login = card && card.querySelector("[data-profile-login]");
        const email = card && card.querySelector("[data-profile-email]");
        const name = card && card.querySelector("[data-profile-name]");
        if (!login || !email || !name) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/profile", {
          method: "POST",
          body: JSON.stringify({ login: login.value.trim(), email: email.value.trim(), name: name.value.trim() })
        }).then((data) => {
          if (viewAccount && viewAccount.id === button.dataset.id && data.user) {
            viewAccount.login = data.user.login;
            localStorage.setItem("enquiz-view-login", data.user.login);
            paintViewBar();
          }
          paintAdmin();
        }).catch((err) => alert(err.message));
        return;
      }
      if (action === "open-pages") {
        openStudentPages({ id: button.dataset.id, login: button.dataset.login || "", role: button.dataset.role || "", email: button.dataset.email || "", name: button.dataset.name || "" });
        return;
      }
      if (action === "exit-view") {
        exitStudentPages();
        return;
      }
      if (action === "hide-user") {
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/hidden", {
          method: "POST",
          body: JSON.stringify({ hidden: button.dataset.hidden !== "1" })
        }).then(() => paintAdmin()).catch((err) => alert(err.message));
        return;
      }
      if (action === "active-user") {
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/active", {
          method: "POST",
          body: JSON.stringify({ active: button.dataset.active !== "1" })
        }).then(() => paintAdmin()).catch((err) => alert(err.message));
        return;
      }
      if (action === "set-role") {
        const pick = button.parentElement && button.parentElement.parentElement && button.parentElement.parentElement.querySelector("[data-role-pick]");
        if (!pick) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id) + "/role", { method: "POST", body: JSON.stringify({ role: pick.value }) })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "delete-user") {
        if (!confirm("Delete this account permanently? The login, cards and songs stored for it will be removed.")) return;
        accountFetch("/api/admin/users/" + encodeURIComponent(button.dataset.id), { method: "DELETE" })
          .then(() => paintAdmin())
          .catch((err) => alert(err.message));
        return;
      }
      if (action === "user") paintAdminUser(button.dataset.id);
    });
    function cardByEn(en) {
      const key = String(en || "").trim().toLowerCase();
      if (!key) return null;
      const banks = [words, extraWords, phrases09, adverbs14, talk16, likes23, ask07, lines21, phrasalWords, idiomWords];
      for (let i = 0; i < banks.length; i++) {
        const found = banks[i].find((item) => String(item.en || "").toLowerCase() === key || item.origin === key);
        if (found) return found;
      }
      return null;
    }
    function resumePlace() {
      if (workFromLocation()) return;
      let place = null;
      try { place = JSON.parse(sessionStorage.getItem("enquiz-place") || "null"); }
      catch (e) { place = null; }
      if (!place || !place.id || place.id === "home" || !document.getElementById(place.id)) return;
      if (place.dayQuizPlace) dayQuizPlace = place.dayQuizPlace;
      if (place.dayReturn) dayReturn = place.dayReturn;
      const quiz = { dayq: 1, daychoice: 1, dayflip: 1, dayjudge: 1, choice: 1, flip: 1, type: 1, gap: 1, build: 1, judge: 1, tap: 1, multi: 1, pairs: 1, exam: 1, errors: 1 };
      if (quiz[place.id]) place.id = place.studyScreen || "setup";
      if (place.id === "song") {
        if (place.songId === "sample") { showSampleSong(); show("song"); return; }
        const song = loadSongs().find((item) => item.id === place.songId);
        if (song && !song.archived) { renderUserSong(song); show("song"); return; }
        show("music");
        return;
      }
      if (place.id === "musicword" && place.songKey && songCards[place.songKey]) {
        renderSong(place.songKey);
        show("musicword");
        return;
      }
      if (place.id === "word" && place.wordEn) {
        const card = cardByEn(place.wordEn);
        if (card) { current = card; renderWord(card); show("word"); return; }
      }
      if (place.id === "made" && place.madeWord) {
        const item = loadAdded().find((row) => String(row.word || "").toLowerCase() === String(place.madeWord).toLowerCase());
        if (item) { renderMade(item); show("made"); return; }
        show("add");
        return;
      }
      if (place.id === "daywork" && place.workDay) { openDayWork(place.workDay, place.workKind, true); return; }
      if (place.id === "daywords" && place.lessonPlace) { openLessonWords(place.lessonPlace, true); return; }
      if (place.id === "rules" && place.lessonPlace) { openLessonRules(place.lessonPlace, true); return; }
      if (place.id === "daysetup") { openDayQuiz(place.dayQuizPlace || dayQuizPlace); return; }
      if (place.id === "setup") { openGlobalStudy(); return; }
      restore(place);
    }
    function cardIdentity(item) {
      const word = String(item && item.word || "").trim().toLowerCase();
      if (!word) return "";
      return (item.place || "mine") + "|" + word;
    }
    function samePersonStudy() {
      const login = authUser && authUser.login;
      return login === "TsovakDev" || login === "Tsovak";
    }
    function applySharedStudy(state) {
      if (!samePersonStudy() || !state) return false;
      const localAdded = loadAdded();
      const added = Array.isArray(state.added) ? state.added.slice() : [];
      const seenCard = {};
      added.forEach((item) => {
        const key = cardIdentity(item);
        if (key) seenCard[key] = 1;
      });
      localAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (!key || seenCard[key]) return;
        added.push(item);
        seenCard[key] = 1;
      });
      const localSongs = loadSongs();
      const songs = Array.isArray(state.songs) ? state.songs.slice() : [];
      const seenSong = {};
      songs.forEach((song) => { if (song && song.id) seenSong[song.id] = 1; });
      localSongs.forEach((song) => {
        if (!song || !song.id || seenSong[song.id]) return;
        songs.push(song);
        seenSong[song.id] = 1;
      });
      const variants = state.variants && typeof state.variants === "object" && !Array.isArray(state.variants) ? state.variants : {};
      const edits = state.stats && state.stats.cardEdits && typeof state.stats.cardEdits === "object" && !Array.isArray(state.stats.cardEdits) ? state.stats.cardEdits : {};
      const learned = Array.isArray(state.learned) ? state.learned : [];
      const mistakeMap = {};
      const savedMistakes = state.stats && Array.isArray(state.stats.mistakes) ? state.stats.mistakes : [];
      savedMistakes.forEach((row) => {
        if (row && row.en && row.type && row.misses > 0) mistakeMap[String(row.en).toLowerCase() + "|" + row.type] = row;
      });
      let before = "";
      try {
        before = JSON.stringify([
          loadAdded(),
          loadSongs(),
          JSON.parse(localStorage.getItem(VARIANT_KEY) || "{}"),
          JSON.parse(localStorage.getItem(EDIT_KEY) || "{}"),
          JSON.parse(localStorage.getItem(LEARNED_KEY) || "[]"),
          loadMistakeMap()
        ]);
      } catch (e) { before = ""; }
      rememberAdded(added);
      writeSongs(songs);
      try { localStorage.setItem(VARIANT_KEY, JSON.stringify(variants)); } catch (e) {}
      try { localStorage.setItem(LEARNED_KEY, JSON.stringify(learned)); } catch (e) {}
      try { localStorage.setItem(MISTAKE_KEY, JSON.stringify(mistakeMap)); } catch (e) {}
      if (Object.keys(edits).length) {
        try { localStorage.setItem(EDIT_KEY, JSON.stringify(edits)); } catch (e) {}
      } else localStorage.removeItem(EDIT_KEY);
      let after = "";
      try { after = JSON.stringify([added, songs, variants, edits, learned, mistakeMap]); } catch (e) { after = "changed"; }
      if (before === after) return false;
      applyLessonEdits();
      applySongEdits();
      refreshCatalog();
      return true;
    }
    function takeNewCards(state) {
      const serverAdded = state && Array.isArray(state.added) ? state.added : [];
      if (!serverAdded.length) return false;
      const localAdded = loadAdded();
      const seen = {};
      localAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (key) seen[key] = 1;
      });
      const next = localAdded.slice();
      let changed = false;
      serverAdded.forEach((item) => {
        const key = cardIdentity(item);
        if (!key || seen[key]) return;
        next.push(item);
        seen[key] = 1;
        changed = true;
      });
      if (changed) rememberAdded(next);
      return changed;
    }
    function pullAccountState() {
      if (!authUser || viewAccount || !accountReady || syncSending || syncQueue.length || accountPulling) return;
      accountPulling = true;
      accountFetch("/api/me/state").then((state) => {
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
      const localSongs = loadSongs();
      const savedSongs = Array.isArray(state.songs) ? state.songs : [];
      if (savedSongs.length) {
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
      let localLinks = {};
      try { localLinks = JSON.parse(localStorage.getItem(LINK_KEY) || "{}") || {}; } catch (e) { localLinks = {}; }
      if (!Object.keys(localLinks).length && state.stats && state.stats.dayLinks && Object.keys(state.stats.dayLinks).length) {
        try { localStorage.setItem(LINK_KEY, JSON.stringify(state.stats.dayLinks)); } catch (e) {}
      }
      installCustomThemes(state.stats && Array.isArray(state.stats.customThemes) ? state.stats.customThemes : []);
      settleThemeAudience();
      paintAdded();
      paintLyrics();
      refreshCatalog();
      paintHomeStats();
      paintHomeAccount();
    }
    function initAccount() {
      const pendingId = localStorage.getItem("enquiz-view-id");
      const pendingLogin = localStorage.getItem("enquiz-view-login") || "";
      const pendingRole = localStorage.getItem("enquiz-view-role") || "";
      const pendingEmail = localStorage.getItem("enquiz-view-email") || "";
      const pendingName = localStorage.getItem("enquiz-view-name") || "";
      const ready = pendingId ? restoreDeveloper().then(() => {
        forgetViewFlags();
        addedCache = null;
      }) : Promise.resolve();
      ready.then(() => accountFetch("/api/me").then((data) => {
        if (!data.user) {
          const personal = localStorage.getItem(SONG_KEY) || localStorage.getItem(ADDED_KEY) || localStorage.getItem(LEARNED_KEY) || localStorage.getItem(MISTAKE_KEY) || localStorage.getItem(VARIANT_KEY) || localStorage.getItem(EDIT_KEY) || localStorage.getItem("enquiz-auth-on") || localStorage.getItem("enquiz-dev-stash") || localStorage.getItem("enquiz-view-id");
          if (personal) { leaveAccount(); return; }
          try { localStorage.removeItem(CUSTOM_THEME_KEY); } catch (e) {}
          settleThemeAudience();
          paintHomeAccount();
          resumePlace();
          return;
        }
        authUser = data.user;
        localStorage.setItem("enquiz-auth-on", "1");
        paintAccount();
        accountFetch("/api/me/state").then((state) => {
          fillEmptyFromAccount(state);
          accountReady = true;
          startAccountPull();
          if (syncQueue.length) scheduleStateSave();
          if (pendingId && data.user && (data.user.role === "DEVELOPER" || (data.user.role === "ADMIN" && pendingRole === "USER"))) openStudentPages({ id: pendingId, login: pendingLogin, role: pendingRole, email: pendingEmail, name: pendingName });
          else resumePlace();
        }).catch(() => {
          accountReady = !!(loadAdded().length || loadSongs().length);
          if (syncQueue.length) scheduleStateSave();
          resumePlace();
        });
      }).catch(() => { paintHomeAccount(); resumePlace(); }));
    }
    const TEXT_KEY = "enquiz-texts";
    let openTextId = "";
    function loadTexts() {
      try { return JSON.parse(localStorage.getItem(TEXT_KEY) || "[]"); }
      catch (e) { return []; }
    }
    function writeTexts(list) {
      localStorage.setItem(TEXT_KEY, JSON.stringify(list));
      paintTextCount();
      if (authUser) {
        accountFetch("/api/texts", { method: "PUT", body: JSON.stringify({ texts: list }) }).catch(() => {});
      }
    }
    function paintTextCount() {
      const node = document.getElementById("textCount");
      if (node) node.textContent = String(loadTexts().length);
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
      if (!authUser) return;
      accountFetch("/api/texts").then((data) => {
        const merged = mergeTextLists(loadTexts(), data.texts || []);
        localStorage.setItem(TEXT_KEY, JSON.stringify(merged));
        renderTextList();
      }).catch(() => {});
    }
    function openTextEditor(item) {
      openTextId = item && item.id ? item.id : "";
      document.getElementById("textEditTitle").textContent = openTextId ? "Edit text" : "Add a text";
      document.getElementById("textTitle").value = item && item.title ? item.title : "";
      document.getElementById("textBody").value = item && item.text ? item.text : "";
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
      const count = item.analysis && item.analysis.expressions ? item.analysis.expressions.length : 0;
      document.getElementById("textReadStatus").textContent = item.analysis ? count + " expressions. The whole text was checked." : "";
      paintExpressions(item);
      show("textread");
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
      if (!expr) return "mine";
      if (expr.type === "PHRASAL_VERB") return "phrasal";
      if (expr.type === "IDIOM") return "idioms";
      return "mine";
    }
    function expressionDeckName(place) {
      return PLACE_LABEL[place] || "My words";
    }
    function findExpressionCard(expr) {
      const place = expressionPlace(expr);
      const word = expressionHead(expr.canonicalForm) || expr.exactText || "";
      const key = expressionIdentity(expr);
      if (!word) return null;
      return loadAdded().find((row) => addedExpressionIdentity(row) === key || (String(row.word || "").toLowerCase() === word.toLowerCase() && (row.place || "mine") === place)) || null;
    }
    function expressionSaved(expr) {
      return !!findExpressionCard(expr);
    }
    function expressionCardButton(expr, index) {
      const place = expressionPlace(expr);
      const deck = expressionDeckName(place);
      if (expressionSaved(expr)) return "<button class=\"btn ok\" type=\"button\" data-text-open-card=\"" + index + "\">In " + esc(deck) + "</button>";
      return "<button class=\"btn primary\" type=\"button\" data-text-card=\"" + index + "\">Add to Cards</button>";
    }
    function markExpressionButton(button, place) {
      if (!button) return;
      const index = button.getAttribute("data-text-card") || button.getAttribute("data-text-open-card");
      button.textContent = "In " + expressionDeckName(place);
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
      const deck = expressionDeckName(place);
      const list = loadAdded();
      const status = document.getElementById("textReadStatus");
      if (expressionSaved(expr)) {
        if (status) status.textContent = "Already in " + deck + ".";
        markExpressionButton(button, place);
        return;
      }
      list.unshift(item);
      saveAdded(list, null);
      syncChange({ op: "put-text-card", card: item });
      if (status) status.textContent = "Added to " + deck + ".";
      markExpressionButton(button, place);
      paintAdded();
    }
    function addExpressionCard(expr, button) {
      const place = expressionPlace(expr);
      const deck = expressionDeckName(place);
      const word = expressionHead(expr.canonicalForm) || expr.exactText || "";
      const status = document.getElementById("textReadStatus");
      if (!word) return;
      if (expressionSaved(expr)) {
        if (status) status.textContent = "Already in " + deck + ".";
        markExpressionButton(button, place);
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
    paintTextCount();
    paintHomeStats();
    resumePlace();
    initAccount();
