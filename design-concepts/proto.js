(function () {
  var data = window.LESSON_DATA || { words: [], lines21: [], rules: [], phrasalWords: [], idiomWords: [], songCards: {} };
  var app = document.getElementById("app");
  var stage = document.getElementById("stage");
  var view = "home";
  var from = "home";
  var mix = "round";
  var mode = "study";
  var exercise = "Choice";
  var studyOrder = ["Choice", "Type", "Gap", "Match", "Flip"];
  var studyStep = 0;
  var wordId = "humid";
  var lang = "ru";
  var quizAt = 0;
  var quizPicked = "";
  var quizLocked = false;
  var quizLog = [];
  var matchLeft = "";
  var deckId = "phrasal";

  var classes = [
    { date: "07.09", title: "Get to know each other", about: "article · problems and solutions · podcast homework", state: "Done", go: "classes" },
    { date: "09.09", title: "Collocations and Present Simple", about: "14 collocations · Present Simple · homework", state: "Done", go: "classes" },
    { date: "14.09", title: "Adverbs of frequency", about: "15 cards · word order · Wordwall", state: "Done", go: "classes" },
    { date: "16.09", title: "Small talk", about: "happy to chat benches · phrases · homework", state: "Done", go: "classes" },
    { date: "21.09", title: "Weather, small talk, likes and dislikes", about: "weather vocabulary · small talk · likes and dislikes · 4 rules", state: "Quiz 7/20", go: "lesson", on: true },
    { date: "23.09", title: "Holidays", about: "preferences · Past Simple · a holiday in Scotland · homework", state: "Next", go: "classes" }
  ];

  var types = ["Flip", "Choice", "Type", "Gap", "Build", "Match", "True / false", "Tap", "Select all", "Reverse", "Spell", "Letters", "Listen", "Definition", "Odd one out", "Memory", "Hangman"];
  var pickedTypes = { Choice: true, Type: true, Gap: true, Match: true, Flip: true };

  var cards = {};
  function addCard(row, source) {
    cards[row.en.toLowerCase()] = {
      en: row.en, pos: row.pos || "", uk: row.uk || "", us: row.us || "",
      ru: row.ru || "", gloss: row.gloss || "", ex: row.ex || "", source: source
    };
  }
  (data.words || []).forEach(function (row) { addCard(row, "21 Sep"); });
  (data.lines21 || []).forEach(function (row) { addCard(row, "21 Sep"); });
  (data.phrasalWords || []).forEach(function (row) { addCard(row, "Phrasal verbs"); });
  (data.idiomWords || []).forEach(function (row) { addCard(row, "Idioms"); });
  Object.keys(data.songCards || {}).forEach(function (key) { addCard(data.songCards[key], "Song lyrics"); });

  var quizzes = [
    {
      n: 7, prompt: "From the 21 Sep cards",
      q: "The air has a lot of water in it, so it feels wet.",
      options: [
        { id: "chilly", t: "It's chilly" },
        { id: "humid", t: "It's humid", ok: true, word: "humid" },
        { id: "drizzle", t: "There's drizzle" },
        { id: "mild", t: "It's mild" }
      ],
      ok: "Correct. Humid means the air feels wet. It's humid.",
      bad: "Not quite. The card says: It's humid."
    },
    {
      n: 8, prompt: "Phrasal verbs · also on this path",
      q: "What does give up mean?",
      options: [
        { id: "go", t: "Continue doing something" },
        { id: "stop", t: "Stop trying", ok: true, word: "give up" },
        { id: "start", t: "Start something again" },
        { id: "big", t: "Make something larger" }
      ],
      ok: "Correct. give up means to stop trying. I won't give up.",
      bad: "Not quite. give up means to stop trying."
    }
  ];

  function esc(s) {
    return String(s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function parentOf(name) {
    if (name === "lesson" || name === "quiz" || name === "result" || name === "grammar") return "classes";
    if (name === "deck" || name === "song") return "library";
    if (name === "setup" || name === "study") return "setup";
    if (name === "word") return from === "library" || from === "song" || from === "deck" ? "library" : "classes";
    return name;
  }

  function go(name, extra) {
    if (extra && extra.from) from = extra.from;
    if (name === "quiz" && extra && extra.reset) {
      quizAt = 0; quizLog = []; quizLocked = false; quizPicked = "";
    }
    view = name;
    paint();
    var canvas = document.querySelector(".canvas");
    if (canvas) canvas.scrollTop = 0;
    stage.scrollIntoView({ block: "start" });
  }

  function row(date, title, status, attrs) {
    return '<button class="lesson' + (attrs.on ? " on" : "") + '" type="button" ' + attrs.extra + '>' +
      '<span>' + esc(date) + '</span><span><b>' + esc(title) + '</b><br><span>' + esc(status) + '</span></span><span class="status">' + esc(attrs.state || "") + '</span></button>';
  }

  function paintClasses() {
    document.getElementById("classList").innerHTML = classes.map(function (item) {
      return row(item.date, item.title, item.about, { on: item.on, state: item.state, extra: 'data-go="' + item.go + '"' });
    }).join("");
  }

  function paintWords() {
    var words = data.words || [];
    document.getElementById("wordList").innerHTML = words.map(function (w) {
      return '<button class="rowbtn" type="button" data-word="' + esc(w.en) + '"><span>' + esc(w.pos) + '</span><b>' + esc(w.en) + '</b><span class="status">' + esc(w.ru) + '</span></button>';
    }).join("");
    document.getElementById("lineList").innerHTML = (data.lines21 || []).map(function (w) {
      return '<button class="rowbtn" type="button" data-word="' + esc(w.en) + '"><span>phrase</span><b>' + esc(w.en) + '</b><span class="status">' + esc(w.ru) + '</span></button>';
    }).join("");
  }

  function paintLibrary() {
    var groups = [
      ["Classes", [["Classes", "6 dates, from 7 Sep", "classes"]]],
      ["Grammar and reference", [
        ["Grammar", "12 tenses, then other structures", "grammar"],
        ["Irregular verbs", "three forms", "deck:verbs"],
        ["Articles", "a / an / the", "grammar"],
        ["Demonstratives", "this, that, these, those", "grammar"]
      ]],
      ["Words", [
        ["All words", "every card, no duplicates", "deck:all"],
        ["My words", "one field, both directions", "deck:mine"],
        ["Phrasal verbs", "3 cards", "deck:phrasal"],
        ["Idioms", "3 cards", "deck:idioms"]
      ]],
      ["Listening and reading", [
        ["Song lyrics", "sample line, then your songs", "song"],
        ["Text", "articles and notes", "deck:text"]
      ]],
      ["Course", [["Speakout", "8 levels · 32 lessons each", "deck:speakout"]]]
    ];
    document.getElementById("libGroups").innerHTML = groups.map(function (group) {
      return '<h2>' + esc(group[0]) + '</h2><div class="lib">' + group[1].map(function (item) {
        return '<button type="button" data-lib="' + esc(item[2]) + '" data-find="' + esc(item[0].toLowerCase()) + '"><b>' + esc(item[0]) + '</b><span>' + esc(item[1]) + '</span></button>';
      }).join("") + '</div>';
    }).join("");
  }

  function openDeck(id) {
    deckId = id;
    var titles = { phrasal: "Phrasal verbs", idioms: "Idioms", all: "All words", mine: "My words", verbs: "Irregular verbs", text: "Text", speakout: "Speakout" };
    document.getElementById("deckTitle").textContent = titles[id] || id;
    document.getElementById("deckCrumb").textContent = titles[id] || id;
    var list = [];
    if (id === "phrasal") list = data.phrasalWords || [];
    if (id === "idioms") list = data.idiomWords || [];
    if (id === "all") list = data.words || [];
    if (id === "verbs") list = [
      { en: "be / was, were / been", ru: "быть", pos: "verb" },
      { en: "go / went / gone", ru: "идти", pos: "verb" },
      { en: "see / saw / seen", ru: "видеть", pos: "verb" }
    ];
    if (id === "mine") list = [];
    if (id === "text") list = [{ en: "Save a text, then look for expressions worth studying.", ru: "", pos: "note" }];
    if (id === "speakout") list = [
      { en: "A1", ru: "8 units · lessons A–D", pos: "level" },
      { en: "A2", ru: "8 units · lessons A–D", pos: "level" },
      { en: "B1", ru: "8 units · lessons A–D", pos: "level" },
      { en: "C1–C2", ru: "8 units · lessons A–D", pos: "level" }
    ];
    document.getElementById("deckLede").textContent = id === "mine"
      ? "No cards in this preview. Add a word stays on this page in the live app."
      : "Cards on this page. Study uses them.";
    document.getElementById("deckList").innerHTML = list.map(function (w) {
      var label = w.en;
      return '<button class="rowbtn" type="button" data-word="' + esc(label) + '"><span>' + esc(w.pos || "") + '</span><b>' + esc(label) + '</b><span class="status">' + esc(w.ru || "") + '</span></button>';
    }).join("") || "<p>Nothing here yet.</p>";
    go("deck", { from: "library" });
  }

  function paintTypes() {
    document.getElementById("typePicks").innerHTML = types.map(function (name) {
      return '<button class="chip' + (pickedTypes[name] ? " on" : "") + '" type="button" data-type="' + esc(name) + '">' + esc(name) + '</button>';
    }).join("");
  }

  function paintStudy() {
    document.querySelectorAll("[data-ex]").forEach(function (node) {
      node.classList.toggle("on", node.getAttribute("data-ex") === exercise);
    });
    var n = 3 + studyStep;
    document.getElementById("studyKicker").textContent = (mode === "exam" ? "Exam · " : mode === "mistakes" ? "Mistakes · " : "") + exercise + " · " + n + " / 8";
    document.getElementById("studyBar").style.width = Math.round((n / 8) * 100) + "%";
    document.getElementById("studyCheck").classList.toggle("hide", exercise === "Flip" || exercise === "Match");
    document.getElementById("studyFeedback").hidden = true;
    var back = mode === "exam" ? "21 Sep · Exam" : "21 Sep · Study";
    document.getElementById("studyCrumb").innerHTML = '<button type="button" data-go="setup">' + esc(back) + '</button>';
  }

  function paintChoice() {
    var options = [
      ["поднимать", false],
      ["сдаваться, бросать", true],
      ["отдавать", false],
      ["присматривать", false]
    ];
    document.getElementById("studyChoice").innerHTML = options.map(function (pair, i) {
      return '<button class="opt" type="button" data-study-opt="' + (pair[1] ? "1" : "0") + '"><i>' + "ABCD"[i] + '</i><span>' + esc(pair[0]) + '</span></button>';
    }).join("");
  }

  function paintMatch() {
    var left = [["humid", "влажный"], ["drizzle", "морось"], ["chilly", "прохладный"]];
    document.getElementById("matchGrid").innerHTML =
      left.map(function (pair) { return '<button type="button" data-match="l" data-id="' + esc(pair[0]) + '">' + esc(pair[0]) + '</button>'; }).join("") +
      left.slice().reverse().map(function (pair) { return '<button type="button" data-match="r" data-id="' + esc(pair[0]) + '">' + esc(pair[1]) + '</button>'; }).join("");
  }

  function paintQuiz() {
    var q = quizzes[quizAt];
    quizPicked = "";
    quizLocked = false;
    document.getElementById("quizKicker").textContent = "Quiz · " + q.n + " / 20";
    document.getElementById("quizBar").style.width = Math.round((q.n / 20) * 100) + "%";
    document.getElementById("quizPrompt").textContent = q.prompt;
    document.getElementById("quizQuestion").textContent = q.q;
    document.getElementById("quizOptions").innerHTML = q.options.map(function (opt, i) {
      return '<button class="opt" type="button" data-quiz="' + esc(opt.id) + '"><i>' + "ABCD"[i] + '</i><span>' + esc(opt.t) + '</span></button>';
    }).join("");
    document.getElementById("quizFeedback").hidden = true;
    document.getElementById("quizCheck").classList.remove("hide");
    document.getElementById("quizNext").classList.add("hide");
  }

  function paintWord() {
    var card = cards[wordId.toLowerCase()] || {
      en: wordId, pos: "", uk: "", us: "", ru: "", gloss: "", ex: "", source: "21 Sep"
    };
    document.getElementById("wordEn").textContent = card.en;
    document.getElementById("wordMeta").textContent = [card.pos, card.source].filter(Boolean).join(" · ");
    document.getElementById("wordIpa").textContent = [card.uk && ("UK " + card.uk), card.us && ("US " + card.us)].filter(Boolean).join("  ");
    document.getElementById("wordRu").textContent = card.ru;
    document.getElementById("wordGloss").textContent = card.gloss;
    document.getElementById("wordEx").textContent = card.ex;
    var crumb = card.source === "Song lyrics" || card.source === "Phrasal verbs" || card.source === "Idioms"
      ? '<button type="button" data-go="library">Library</button>'
      : '<button type="button" data-go="lesson">21 Sep</button>';
    document.getElementById("wordCrumb").innerHTML = crumb + "<span>Word</span>";
  }

  function paintRules() {
    var rules = (data.lessonRules && data.lessonRules["lesson-21"]) || data.rules || [];
    document.getElementById("ruleList").innerHTML = rules.map(function (rule) {
      var title = rule.title ? rule.title[lang] : "";
      var body = rule.body ? rule.body[lang] : "";
      return '<article class="rule"><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p></article>';
    }).join("");
  }

  function paintSetup() {
    var where = from === "lesson" || from === "home" ? "21 Sep · This day's quiz" : "Study";
    document.getElementById("setupKicker").textContent = where;
    document.getElementById("setupCrumb").innerHTML = from === "library" || from === "deck" || from === "song"
      ? '<button type="button" data-go="library">Library</button><span>Study</span>'
      : from === "nav"
        ? "<span>Study</span>"
        : '<button type="button" data-go="lesson">21 Sep</button><span>Study</span>';
    document.getElementById("setupLede").textContent = mix === "round"
      ? "Round: every picked type on each card."
      : "Mix: one random type per card.";
  }

  function paintNav() {
    var current = parentOf(view);
    app.dataset.view = view;
    app.querySelectorAll("[data-go]").forEach(function (button) {
      var target = button.getAttribute("data-go");
      var on = target === current || (current === "setup" && target === "setup");
      if (button.classList.contains("navbtn") || button.closest(".side") || button.closest(".dock")) {
        button.classList.toggle("on", target === current || (current === "setup" && target === "setup"));
        if (on) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    });
    document.querySelectorAll("[data-screen-pick]").forEach(function (button) {
      button.classList.toggle("on", button.getAttribute("data-screen-pick") === view);
    });
  }

  function paint() {
    paintNav();
    if (view === "setup") paintSetup();
    if (view === "study") paintStudy();
    if (view === "quiz") paintQuiz();
    if (view === "word") paintWord();
    if (view === "grammar") paintRules();
    if (view === "result") paintResult();
    if (view === "add") paintAdd();
  }

  function paintAdd() {
    var onLesson = from === "lesson";
    document.getElementById("addLede").textContent = onLesson
      ? "Russian or English. The word stays on 21 Sep. The lookup runs once, when you press the button."
      : "Russian or English. The card goes to My words. The lookup runs once, when you press the button.";
    document.getElementById("addCrumb").innerHTML = onLesson
      ? '<button type="button" data-go="lesson">21 Sep</button><span>Add a word</span>'
      : '<button type="button" data-go="account">Account</button><span>My words</span>';
  }

  function paintResult() {
    var right = quizLog.filter(function (item) { return item.ok; }).length;
    document.getElementById("resultTitle").textContent = right + " of " + quizLog.length + " in this sitting";
    document.getElementById("resultLede").textContent = right === quizLog.length
      ? "The 21 Sep quiz is still open at question 9 of 20."
      : "Open the missed card, then come back to the quiz.";
    document.getElementById("resultList").innerHTML = quizLog.map(function (item) {
      return '<button class="rowbtn" type="button" data-word="' + esc(item.word || "") + '"><span>' + (item.ok ? "Correct" : "Not quite") + '</span><b>' + esc(item.q) + '</b><span class="status">' + esc(item.word || "") + '</span></button>';
    }).join("");
  }

  function feedback(node, ok, text) {
    node.hidden = false;
    node.className = "feedback " + (ok ? "ok" : "bad");
    node.textContent = text;
  }

  paintClasses();
  paintWords();
  paintLibrary();
  paintTypes();
  paintChoice();
  paintMatch();
  paint();

  document.querySelector(".lab").addEventListener("click", function (event) {
    var concept = event.target.closest("[data-concept-pick]");
    if (concept) {
      app.dataset.concept = concept.getAttribute("data-concept-pick");
      document.querySelectorAll("[data-concept-pick]").forEach(function (button) {
        button.classList.toggle("on", button === concept);
      });
    }
    var screen = event.target.closest("[data-screen-pick]");
    if (screen) go(screen.getAttribute("data-screen-pick"));
    var width = event.target.closest("[data-width]");
    if (width) {
      stage.classList.toggle("phone", width.getAttribute("data-width") === "phone");
      document.querySelectorAll("[data-width]").forEach(function (button) {
        button.classList.toggle("on", button === width);
      });
    }
  });

  app.addEventListener("click", function (event) {
    var local = event.target.closest("[data-jump-id]");
    if (local) {
      var spot = document.getElementById(local.getAttribute("data-jump-id"));
      if (spot) spot.scrollIntoView({ block: "start" });
      return;
    }
    var word = event.target.closest("[data-word]");
    if (word) {
      wordId = word.getAttribute("data-word");
      go("word", { from: view });
      return;
    }
    var lib = event.target.closest("[data-lib]");
    if (lib) {
      var id = lib.getAttribute("data-lib");
      if (id.indexOf("deck:") === 0) openDeck(id.slice(5));
      else go(id, { from: "library" });
      return;
    }
    var jump = event.target.closest("[data-go]");
    if (jump && !jump.closest(".navbtn") && !jump.closest(".side") && !jump.closest(".dock") && !jump.closest(".brand")) {
      go(jump.getAttribute("data-go"), { from: jump.getAttribute("data-from") || view });
      return;
    }
    var nav = event.target.closest(".navbtn, .side button, .dock button, .brand");
    if (nav && nav.getAttribute("data-go")) {
      go(nav.getAttribute("data-go"), { from: "nav" });
    }
  });

  document.getElementById("libSearch").addEventListener("input", function (event) {
    var q = event.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-find]").forEach(function (button) {
      button.hidden = q && button.getAttribute("data-find").indexOf(q) === -1;
    });
  });

  document.getElementById("typePicks").addEventListener("click", function (event) {
    var chip = event.target.closest("[data-type]");
    if (!chip) return;
    var name = chip.getAttribute("data-type");
    pickedTypes[name] = !pickedTypes[name];
    if (!Object.keys(pickedTypes).some(function (key) { return pickedTypes[key]; })) pickedTypes[name] = true;
    chip.classList.toggle("on", pickedTypes[name]);
  });

  app.addEventListener("click", function (event) {
    var chip = event.target.closest("[data-mix]");
    if (!chip) return;
    mix = chip.getAttribute("data-mix");
    document.querySelectorAll("[data-mix]").forEach(function (button) {
      button.classList.toggle("on", button === chip);
    });
    paintSetup();
  });

  document.getElementById("studyStart").addEventListener("click", function () {
    mode = "study"; studyStep = 0; exercise = "Choice"; go("study", { from: from });
  });
  document.getElementById("studyExam").addEventListener("click", function () {
    mode = "exam"; studyStep = 0; exercise = "Choice"; go("study", { from: from });
  });
  document.getElementById("studyMistakes").addEventListener("click", function () {
    mode = "mistakes"; studyStep = 0; exercise = "Choice"; go("study", { from: from });
  });

  document.getElementById("studyChoice").addEventListener("click", function (event) {
    var opt = event.target.closest("[data-study-opt]");
    if (!opt) return;
    document.querySelectorAll("[data-study-opt]").forEach(function (button) { button.classList.remove("is-on"); });
    opt.classList.add("is-on");
  });

  document.getElementById("studyCheck").addEventListener("click", function () {
    var note = document.getElementById("studyFeedback");
    if (exercise === "Choice") {
      var chosen = document.querySelector("[data-study-opt].is-on");
      if (!chosen) { feedback(note, false, "Choose an answer first."); return; }
      var ok = chosen.getAttribute("data-study-opt") === "1";
      chosen.classList.add(ok ? "is-ok" : "is-bad");
      if (!ok) document.querySelector('[data-study-opt="1"]').classList.add("is-ok");
      feedback(note, ok, ok ? "Correct. сдаваться, бросать." : "Not quite. The answer is сдаваться, бросать.");
    } else if (exercise === "Type") {
      var typed = document.getElementById("typeAnswer").value.trim().toLowerCase();
      feedback(note, typed === "give up", typed === "give up" ? "Correct. give up." : "Not quite. Type give up.");
    } else if (exercise === "Gap") {
      var gap = document.getElementById("gapAnswer").value.trim().toLowerCase();
      feedback(note, gap === "drizzle", gap === "drizzle" ? "Correct. There's drizzle." : "Not quite. The word is drizzle.");
    }
  });

  document.getElementById("studyNext").addEventListener("click", function () {
    if (exercise === "Flip" && document.getElementById("flipBack").hidden) {
      document.getElementById("flipBack").hidden = false;
      document.getElementById("studyKicker").textContent = "Flip · see the meaning, then Next";
      return;
    }
    studyStep += 1;
    if (studyStep >= studyOrder.length) {
      go("quiz", { from: "lesson", reset: true });
      return;
    }
    exercise = studyOrder[studyStep];
    document.getElementById("flipBack").hidden = true;
    paintStudy();
  });

  document.getElementById("matchGrid").addEventListener("click", function (event) {
    var button = event.target.closest("[data-match]");
    if (!button || button.classList.contains("ok")) return;
    if (button.getAttribute("data-match") === "l") {
      matchLeft = button.getAttribute("data-id");
      document.querySelectorAll('[data-match="l"]').forEach(function (node) { node.classList.toggle("on", node === button); });
      return;
    }
    if (!matchLeft) return;
    var ok = button.getAttribute("data-id") === matchLeft;
    if (ok) {
      button.classList.add("ok");
      document.querySelector('[data-match="l"][data-id="' + matchLeft + '"]').classList.add("ok");
    }
    feedback(document.getElementById("studyFeedback"), ok, ok ? "Correct. Paired." : "Not quite. Those two do not match.");
    matchLeft = "";
  });

  document.getElementById("quizOptions").addEventListener("click", function (event) {
    var opt = event.target.closest("[data-quiz]");
    if (!opt || quizLocked) return;
    quizPicked = opt.getAttribute("data-quiz");
    document.querySelectorAll("[data-quiz]").forEach(function (button) { button.classList.remove("is-on"); });
    opt.classList.add("is-on");
  });

  document.getElementById("quizCheck").addEventListener("click", function () {
    var note = document.getElementById("quizFeedback");
    if (!quizPicked) { feedback(note, false, "Choose an answer first."); return; }
    var q = quizzes[quizAt];
    var chosen = document.querySelector('[data-quiz="' + quizPicked + '"]');
    var answer = q.options.filter(function (opt) { return opt.id === quizPicked; })[0];
    var right = q.options.filter(function (opt) { return opt.ok; })[0];
    quizLocked = true;
    chosen.classList.add(answer.ok ? "is-ok" : "is-bad");
    if (!answer.ok) document.querySelector('[data-quiz="' + right.id + '"]').classList.add("is-ok");
    document.querySelectorAll("[data-quiz]").forEach(function (button) { button.disabled = true; });
    note.hidden = false;
    note.className = "feedback " + (answer.ok ? "ok" : "bad");
    note.textContent = answer.ok ? q.ok : q.bad;
    if (!answer.ok && right.word) {
      var link = document.createElement("button");
      link.type = "button";
      link.className = "ghost";
      link.textContent = "Open " + right.word;
      link.setAttribute("data-word", right.word);
      note.appendChild(document.createTextNode(" "));
      note.appendChild(link);
    }
    quizLog.push({ ok: !!answer.ok, q: q.q, word: right.word || "" });
    document.getElementById("quizCheck").classList.add("hide");
    document.getElementById("quizNext").classList.remove("hide");
  });

  document.getElementById("quizNext").addEventListener("click", function () {
    if (quizAt + 1 >= quizzes.length) go("result");
    else { quizAt += 1; paintQuiz(); }
  });

  document.getElementById("ruleLang").addEventListener("click", function (event) {
    var button = event.target.closest("[data-lang]");
    if (!button) return;
    lang = button.getAttribute("data-lang");
    document.querySelectorAll("[data-lang]").forEach(function (node) { node.classList.toggle("on", node === button); });
    paintRules();
  });

  document.getElementById("rangePicks").addEventListener("click", function (event) {
    var button = event.target.closest("[data-range]");
    if (!button) return;
    document.querySelectorAll("[data-range]").forEach(function (node) { node.classList.toggle("on", node === button); });
  });

  document.getElementById("addOpen").addEventListener("click", function () {
    document.getElementById("addForm").classList.toggle("hide");
  });
  document.getElementById("addForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var value = document.getElementById("addInput").value.trim();
    document.getElementById("addStatus").textContent = value
      ? "Preview only. Nothing was saved, and no lookup was sent."
      : "Write a word first.";
  });

  document.getElementById("addPage").addEventListener("submit", function (event) {
    event.preventDefault();
    var value = document.getElementById("addPageInput").value.trim();
    document.getElementById("addPageStatus").textContent = value
      ? "Preview only. Nothing was saved, and no lookup was sent."
      : "Write a word first.";
  });

  document.getElementById("guideLang").addEventListener("click", function (event) {
    var button = event.target.closest("[data-guide-lang]");
    if (!button) return;
    document.querySelector("[data-screen='guide']").setAttribute("data-guide", button.getAttribute("data-guide-lang"));
    document.querySelectorAll("[data-guide-lang]").forEach(function (node) {
      node.classList.toggle("on", node === button);
    });
  });

  document.getElementById("wordSay").addEventListener("click", function () {
    if (!window.speechSynthesis) return;
    var utter = new SpeechSynthesisUtterance(document.getElementById("wordEn").textContent);
    utter.lang = "en-GB";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });

  document.getElementById("words").addEventListener("click", function () {});
})();
