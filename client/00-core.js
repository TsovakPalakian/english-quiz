    const sections = document.querySelectorAll("section");
    const chromeButtons = document.querySelectorAll(".side nav button, .tabbar button");
    const navStack = [];
    let authUser = null;
    let accountChecked = false;
    let viewAccount = null;
    let viewGen = 0;
    let viewSwitching = false;
    let stashOwned = false;
    let authSyncLock = false;
    let accountReady = false;
    let hiddenCardIds = new Set();
    let syncTimer = 0;
    let accountPullTimer = 0;
    let accountPulling = false;
    let syncSending = false;
    let syncFails = 0;
    let syncInFlight = null;
    const syncQueue = [];
    let textsInFlight = Promise.resolve();
    let authTimer = 0;
    const viewCache = new Map();
    let addedCache = null;
    let grammarView = "hub";
    let tenseKind = "topic";
    let compareId = "";
    let openMarkerName = "";
    let openTenseId = "ps";
    function domEntityId(value) {
      const raw = String(value == null ? "" : value);
      if (!/^[1-9]\d{0,15}$/.test(raw)) return value;
      const id = Number(raw);
      return Number.isSafeInteger(id) ? id : value;
    }
    const dayScreens = {
      lesson: "groups", lesson07: "groups", lesson09: "groups", lesson14: "groups", lesson16: "groups", lesson23: "groups", material: "groups", word: "groups", rules: "groups", daywords: "groups", daywork: "groups", daysetup: "groups", dayq: "groups", daychoice: "groups", dayflip: "groups", dayjudge: "groups", days: "groups", pdfview: "groups",
      song: "library", music: "library", lyricadd: "library", musicword: "library", texts: "library", textedit: "library", textread: "library", tenses: "library", tense: "library", marker: "library", library: "library", verbs: "library", phrasal: "library", idioms: "library", articles: "library", speakout: "library",
      choice: "setup", flip: "setup", type: "setup", gap: "setup", build: "setup", judge: "setup", tap: "setup", multi: "setup", pairs: "setup", exam: "setup", errors: "setup", setup: "setup",
      made: "add", allwords: "home", cardstat: "home", everyday: "library", everydaygroup: "library", everydaytopic: "library", grammarcategories: "library", grammarcategory: "library", grammarrule: "library",
      account: "account", profile: "account", admin: "admin", adminuser: "admin", admingrouplevel: "admin", admingroup: "admin", themes: "account"
    };
    function guestRestrictedPage(id) {
      return ['groups','exams','library','stats','profile','speakouteditor'].includes(id)||['groups','exams','library'].includes(dayScreens[id]);
    }
    function paintGuestAccess() {
      document.querySelectorAll('[data-jump]').forEach(button=>{
        if(['groups','exams','library','stats','profile'].includes(button.dataset.jump)||button.id==='homeStudy')button.hidden=!authUser;
      });
    }
    paintGuestAccess();
    (function holdPlace() {
      let place = null;
      try { place = JSON.parse(sessionStorage.getItem("enquiz-place") || "null"); }
      catch (e) { place = null; }
      const id = place && place.id;
      if (!id || id === "home" || guestRestrictedPage(id) || !document.getElementById(id)) return;
      sections.forEach((s) => s.classList.toggle("on", s.id === id));
      const mark = dayScreens[id] || id;
      chromeButtons.forEach((b) => {
        const on = b.dataset.jump === mark;
        b.classList.toggle("on", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
    })();
    function show(id) {
      if(!authUser&&guestRestrictedPage(id))id='account';
      const previous = document.querySelector('section.on');
      if (previous && previous.id !== id) stopPageMedia(previous);
      if (hideStudentSongs() && ["music", "song", "lyricadd", "musicword", "texts", "textread", "textedit", "themes", "setup", "daysetup", "dayq", "daychoice", "dayflip", "dayjudge"].includes(id)) id = "library";
      // Accounts is teacher-only chrome; never open it while viewing another account.
      if (["admin","adminuser","admingroup","admingrouplevel"].includes(id) && (viewAccount || !isTeacher())) id = "home";
      if (id === "bugs" && !isDeveloper()) id = "home";
      if (id === "archive" && (!authUser || viewAccount)) id = "home";
      if (id === "stats" && !authUser) id = "account";
      if (id === "account" && authUser) id = "profile";
      if (id === "allwords") paintAllWords();
      if (id === "phrasal" || id === "idioms") paintDeckGrids(id);
      if (id === "add") renderAddedList();
      if (id === "verbs") paintVerbs();
      if (id === "lesson" || id === "lesson07" || id === "lesson09" || id === "lesson14" || id === "lesson16" || id === "lesson23") markClassStarted(id);
      if (id === "material" && window.paintMaterial) window.paintMaterial();
      if (id === "groups" && window.paintGroups) window.paintGroups();
      if (id === "days" && window.paintLmDays) window.paintLmDays();
      if (id === "home") paintHomeAccount();
      if (id === "account") paintAccount();
      if (id === "profile") paintProfile();
      if (id === "admin" && !['adminuser','admingroup'].includes(previous?.id)) paintAdmin();
      if (id === "admin" && ['adminuser','admingroup'].includes(previous?.id)) {
        const target = document.querySelector('#admin [data-account="user"][data-id="' + adminSelectedUser + '"]');
        const fold = target?.closest('details'); if (fold) fold.open = true;
      }
      if (id === "adminuser") { adminSelectedUser = null; if (!adminGroups.length) paintAdmin('adminuser'); else paintAdminUser(adminAccountId); }
      if (id === "admingroup") { if (!adminGroups.length) paintAdmin('admingroup'); else paintAdminGroup(); }
      if (id === "admingrouplevel") { if (!adminGroups.length) paintAdmin('admingrouplevel'); else paintAdminGroupLevel(); }
      if (id === "bugs") paintBugs();
      if (id === "archive") paintArchive();
      if (id === "stats") paintStats();
      if (id === "guide") paintGuide();
      if (id === "demonstratives" && window.paintDemonstratives) window.paintDemonstratives();
      if (id === "texts") paintTexts();
      if (id === "library") paintTextCount();
      sections.forEach((s) => s.classList.toggle("on", s.id === id));
      const mark = (id === "exams" || id === "examblocks" || (lmState && lmState.examOwned && id === "material")) ? "exams" : (dayScreens[id] || id);
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
      const shown = document.getElementById(id);
      restorePageMedia(shown);
      if (shown) applyCardSearch(shown);
      paintPagePath(id);
      paintSongGate();
    }
    function examPagePath(exam) {
      const groupId=exam?(exam.groupId??classGroups.find(row=>row.title===exam.groupTitle)?.id??'unassigned'):examViewGroup;
      const group=classGroups.find(row=>String(row.id)===String(groupId));
      const title=group?.title||exam?.groupTitle||'Unassigned';
      const level=group?accountGroupLevel(group):exam?accountGroupLevel({title}):examViewLevel;
      return [{id:'exams',label:'Exams',examLevel:''},
        ...(level&&authUser?.role!=='USER'?[{id:'exams',label:level==='unassigned'?'Unassigned':level,examLevel:level}]:[]),
        ...(groupId!==null&&groupId!==undefined?[{id:'exams',label:title,examLevel:level,examGroup:groupId}]:[]),
        ...((exam||examViewGroup!==null)&&examSection!=='active'?[{id:'exams',label:({assigned:'Assigned works',ready:'Ready for review',completed:'Completed'})[examSection],examLevel:level,examGroup:groupId,examSection}]:[]),
        ...(exam?.studentId&&authUser?.role!=='USER'?[{id:'exams',label:exam.studentName||'Student',examLevel:level,examGroup:groupId,examSection}]:[]),
        ...(exam?[{id:'examblocks',label:exam.title||'Exam'}]:[])];
    }
    function pagePathItems(id, seen = new Set()) {
      if (!id || id === "home" || seen.has(id)) return [];
      seen.add(id);
      const root = document.getElementById(id);
      if (!root) return [];
      const group = classGroups.find((row) => row.id === classGroupId);
      const groupPath = owner => [{id:'groups',label:'Groups',level:''},...(owner?[{id:'groups',label:accountGroupLevel(owner)==='unassigned'?'Unassigned':accountGroupLevel(owner),level:accountGroupLevel(owner)},{id:'days',label:owner.title,groupId:owner.id}]:[])];
      if(id==='groups')return [{id:'groups',label:'Groups',level:''},...(groupViewLevel?[{id:'groups',label:groupViewLevel==='unassigned'?'Unassigned':groupViewLevel,level:groupViewLevel}]:[])];
      if (id === "days") return groupPath(group);
      if (id.startsWith('grammar')) {
        const category=(window.GrammarCategories||[]).find(row=>row.id===stageGrammarGroup);
        return [{id:'library',label:'Library'},{id:'grammarcategories',label:'Grammatical Categories'},...(id!=='grammarcategories'&&category?[{id:'grammarcategory',label:category.title}]:[]),...(id==='grammarrule'?[{id:'grammarrule',label:stageGrammarRule}]:[])];
      }
      if (id === 'exams') return examPagePath();
      if (id === "examblocks") return examPagePath(examFind(examCurrentId));
      if (['admin','adminuser','admingrouplevel','admingroup'].includes(id)) {
        const path=[{id:'account',label:'Settings',settings:true},{id:'admin',label:'Accounts',adminBucket:''}];
        const selected=adminGroups.find(row=>row.id===adminGroupId);
        if(id==='admingrouplevel'||id==='admingroup')path.push({id:'admingrouplevel',label:adminGroupLevel==='unassigned'?'Unassigned':adminGroupLevel});
        else if(adminBucket)path.push({id:'admin',label:adminBucket==='staff'?'Teachers & Staff':'Unassigned',adminBucket});
        if(id==='admingroup'&&selected)path.push({id,label:selected.title});
        if(id==='adminuser')path.push({id,label:adminAccounts.find(row=>row.id===adminAccountId)?.login||'Account'});
        return path;
      }
      if (id === "material" && lmState) {
        const owner = lmState.examOwned ? examFind(lmState.examId) : classGroups.find((row) => row.lessonIds.includes(lmState.id));
        const path = lmState.examOwned
          ? examPagePath(owner)
          : groupPath(owner||group);
        path.push({ id: "material", tab: "overview", label: lmState.title || (lmState.examOwned ? "Examination block" : "Lesson") });
        if (!lmState.examOwned && lmTab() !== "overview") {
          const names = { words: "Words", phrases: "Phrases", rules: "Rules", classwork: "Classwork", homework: "Homework", pdf: "Lesson PDF" };
          path.push({ id: "material", tab: lmTab(), label: names[lmTab()] || lmTab() });
        }
        if (lmState.mode !== "preview" && canEditLessons()) path.push({ id: "material", label: "Edit" });
        return path;
      }
      const parents = { music: "library", add: "library", allwords: "library", tenses: "library", archive: "home", themes: authUser ? "profile" : "account" };
      const fallback = root.querySelector("[data-nav-back]")?.dataset.fallback;
      const parent = Object.hasOwn(parents, id) ? parents[id] : fallback;
      const label = root.querySelector(".meta h1, .song-banner b")?.textContent.trim() || root.querySelector("h1")?.textContent.trim() || "Cards";
      return [...pagePathItems(parent, seen), { id, label }];
    }
    function paintPagePath(id) {
      if (id === 'speakouteditor') return;
      const root = document.getElementById(id);
      const meta = root?.querySelector(".meta");
      if (!meta || id === "home") return;
      let path = root.querySelector(".page-path");
      if (!path) {
        path = document.createElement("nav");
        path.className = "page-path";
        path.setAttribute("aria-label", "Breadcrumb");
        meta.insertAdjacentElement("afterend", path);
      }
      const items = pagePathItems(id);
      path.hidden=id==='groups'&&!groupViewLevel;
      path.innerHTML = "<ol>" + items.map((item, index) => "<li>" + (index === items.length - 1
        && !['groups','days','material'].includes(id) ? '<span aria-current="page">' + esc(item.label) + "</span>"
        : '<button type="button" data-page-path="' + esc(item.id) + '"' + (item.settings?' data-user-settings':'')+(item.adminBucket!==undefined?' data-path-admin-bucket="'+esc(item.adminBucket)+'"':'')+(item.examLevel!==undefined?' data-path-exam-level="'+esc(item.examLevel)+'"':'')+(item.examGroup!==undefined?' data-path-exam-group="'+esc(item.examGroup)+'"':'')+(item.level!==undefined?' data-path-level="'+esc(item.level)+'"':'')+(item.groupId?' data-path-group="'+item.groupId+'"':'')+(item.tab ? ' data-page-tab="' + esc(item.tab) + '"' : "") + '>' + esc(item.label) + "</button>") + "</li>").join("") + "</ol>";
    }
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-page-path]");
      if (!target) return;
      if(target.dataset.pathAdminBucket!==undefined){pushHistory();adminBucket=target.dataset.pathAdminBucket;adminTab='accounts';show('admin');paintAdminAccounts();return;}
      if(target.dataset.pathExamLevel!==undefined){const index=[...target.closest('ol').children].indexOf(target.parentElement),section=pagePathItems(document.querySelector('section.on')?.id)[index]?.examSection;pushHistory();examViewLevel=target.dataset.pathExamLevel;examViewGroup=target.dataset.pathExamGroup??null;examSection=section||'active';show('exams');return;}
      if(target.dataset.pathLevel!==undefined){pushHistory();groupViewLevel=target.dataset.pathLevel;show('groups');return;}
      if(target.dataset.pathGroup){pushHistory();classGroupId=domEntityId(target.dataset.pathGroup);show('days');return;}
      if (target.dataset.pagePath === "material") {
        pushHistory();
        lmState.tab = target.dataset.pageTab || "overview";
        lmShow("preview");
        rememberPlace();
      } else visit(target.dataset.pagePath);
    });
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
    const backArrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H6"/><path d="M12 6 6 12l6 6"/></svg>';
    function mountCrumbs(scope = document) {
      const house = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M7 10.5V20h10v-9.5"/><path d="M10 20v-5h4v5"/></svg>';
      scope.querySelectorAll("[data-nav-back]").forEach((btn) => {
        btn.classList.add("icon");
        btn.setAttribute("aria-label", "Back");
        btn.innerHTML = backArrow;
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
    window.enquizMountCrumbs = mountCrumbs;
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
      if (place.id === "material" && !placeBoot && !lmState?.examOwned) {
        try { if (JSON.parse(sessionStorage.getItem("enquiz-place") || "null")?.examId) return; } catch (e) {}
      }
      if (place.id === "song") {
        const sample = document.getElementById("songSample");
        place.songId = sample && !sample.hidden ? "sample" : ((document.getElementById("songUser") || {}).dataset.songId || "");
      }
      if (place.id === "musicword") place.songKey = songKey;
      if (place.id === "word" && current) place.wordEn = current.en;
      if (place.id === "made" && madeItem) place.madeWord = madeItem.word;
      if (place.id === "daywords" || place.id === "rules") place.lessonPlace = openLessonPlace;
      if (place.id === "daywork") { place.workDay = openWork.day; place.workKind = openWork.kind; }
      if (place.id === "material" && lmState) {
        if (lmState.examOwned) {
          place.examId = lmState.examId;
          place.examBlockId = lmState.blockId;
        } else place.materialId = lmState.id || "";
        place.materialTab = lmState.tab || "";
      }
      if (place.id === "examblocks") place.examId = examCurrentId;
      place.dayQuizPlace = dayQuizPlace;
      place.dayReturn = dayReturn;
      place.studyScreen = studyScreen;
      try { sessionStorage.setItem("enquiz-place", JSON.stringify(place)); } catch (e) {}
    }
    function placeKey(place) {
      if (place.id === 'groups' || place.id === 'exams') return [place.id,place.groupViewLevel,place.examViewLevel,place.examViewGroup].join('|');
      if (place.id === 'admingrouplevel') return place.id + '|' + place.adminGroupLevel;
      if(place.id?.startsWith('grammar'))return place.id+'|'+(place.grammarCategory||'')+'|'+(place.grammarRule||'');
      if(place.id?.startsWith('everyday'))return [place.id,place.everyday?.group,place.everyday?.topic,place.everyday?.groupSearch,place.everyday?.wordSearch].join('|');
      return [place.id, place.view || "", place.area || "", place.kind || "", place.topic || "", place.compare || "", place.marker || "", place.statKind || "", place.statGroup || "", place.statSong || "", place.allGroup || "", place.allSong || "", place.addGroup || "", place.addSong || "", place.verbGroup || "", place.verbKey || "", place.speakView || "", place.speakLevel, place.speakUnit, place.speakLesson, place.workDay || "", place.workKind || ""].join("|");
    }
    function capture() {
      const on = document.querySelector("section.on");
      const focused = on?.contains(document.activeElement) ? document.activeElement : null;
      return {
        id: on ? on.id : "home",
        scrollY: window.scrollY,
        focusKey: focused?.getAttribute("data-return-focus") || "",
        adminAccountId: typeof adminAccountId === 'undefined' ? null : adminAccountId,
        adminGroupId: typeof adminGroupId === 'undefined' ? null : adminGroupId,
        adminGroupLevel: typeof adminGroupLevel === 'undefined' ? null : adminGroupLevel,
        adminBucket: typeof adminBucket === 'undefined' ? '' : adminBucket,
        groupViewLevel: typeof groupViewLevel === 'undefined' ? '' : groupViewLevel,
        examViewLevel: typeof examViewLevel === 'undefined' ? '' : examViewLevel,
        examViewGroup: typeof examViewGroup === 'undefined' ? null : examViewGroup,
        examSection: typeof examSection === 'undefined' ? 'active' : examSection,
        examId: on?.id==='examblocks' ? examCurrentId : on?.id==='material'&&lmState?.examOwned ? lmState.examId : null,
        examBlockId: on?.id==='material'&&lmState?.examOwned ? lmState.blockId : null,
        adminTab: typeof adminTab === 'undefined' ? null : adminTab,
        focusAttrs: focused ? [...focused.attributes].filter(attr => attr.name === 'id' || attr.name === 'href' || attr.name.startsWith('data-') && attr.name !== 'data-return-focus').map(attr => [attr.name, attr.value]) : [],
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
        everyday: typeof stageEverydayState==='undefined'?null:{...stageEverydayState},
        grammarCategory: typeof stageGrammarGroup==='undefined'?'':stageGrammarGroup,
        grammarRule: typeof stageGrammarRule==='undefined'?'':stageGrammarRule,
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
    window.enquizVisit = visit;
    function restore(place) {
      if(place.grammarCategory&&typeof stageGrammarGroup!=='undefined')stageGrammarGroup=place.grammarCategory;
      if(typeof stageGrammarRule!=='undefined')stageGrammarRule=place.grammarRule||'';
      if(place.everyday&&typeof stageEverydayState!=='undefined')stageEverydayState={...place.everyday};
      if (place.id === 'speakouteditor' && typeof stageResumeSpeakEditor === 'function') { stageResumeSpeakEditor(place); return; }
      if (['admin','adminuser','admingroup','admingrouplevel'].includes(place.id)) {
        adminGroupLevel = place.adminGroupLevel || adminGroupLevel;
        adminBucket = place.adminBucket || '';
        adminAccountId = place.adminAccountId || adminAccountId; adminGroupId = place.adminGroupId || adminGroupId; adminTab = place.adminTab || adminTab;
      }
      if (place.id === 'groups') groupViewLevel = place.groupViewLevel || '';
      if (place.id === 'exams'||place.examId) { examViewLevel = place.examViewLevel || ''; examViewGroup = place.examViewGroup ?? null; examSection=place.examSection||'active'; }
      if(place.examId){
        examCurrentId=place.examId;
        const exam=examFind(place.examId);
        if(exam?.studentId&&authUser?.role!=='USER'&&!viewAccount&&typeof materialReviewStudent!=='undefined')materialReviewStudent={id:exam.studentId,name:exam.studentName,email:exam.studentEmail};
        if(place.id==='material'&&place.examBlockId){examOpenBlock(place.examBlockId);return;}
      }
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
      requestAnimationFrame(() => restorePosition(prev));
    }
    let returnFocusSerial = 0;
    let externalReturn = null;
    function restorePosition(place) {
      if (document.querySelector("section.on")?.id !== place.id) return;
      const root = document.getElementById(place.id);
      const node = place.focusKey && root?.querySelector('[data-return-focus="' + CSS.escape(place.focusKey) + '"]') || (place.focusAttrs?.length ? [...root.querySelectorAll('button, a, input')].find(el => place.focusAttrs.every(([key,value]) => el.getAttribute(key) === value)) : null);
      node?.focus({ preventScroll: true });
      window.scrollTo(0, place.scrollY || 0);
    }
    document.addEventListener("click", (event) => {
      const node = event.target.closest("a, button");
      if (!node || !node.closest("section.on")) return;
      if (!node.dataset.returnFocus) node.dataset.returnFocus = "return-" + (++returnFocusSerial);
      node.focus({ preventScroll: true });
      if (node.matches("a[href]") && !node.getAttribute("href").startsWith("#")) externalReturn = capture();
    }, true);
    window.addEventListener("focus", () => { if (externalReturn) { const place = externalReturn; externalReturn = null; requestAnimationFrame(() => restorePosition(place)); } });
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
    function topicPair(value, tag) {
      const name = tag || "p";
      if (!value) return "";
      if (typeof value === "string") return "<" + name + ">" + esc(value) + "</" + name + ">";
      return "<" + name + ' class="ru">' + esc(value.ru || "") + "</" + name + "><" + name + ' class="en">' + esc(value.en || "") + "</" + name + ">";
    }
    function topicTable(table) {
      if (!table || !table.rows || !table.rows.length) return "";
      const headers = table.headers || {};
      const headEn = Array.isArray(headers) ? headers : (headers.en || []);
      const headRu = Array.isArray(headers) ? headers : (headers.ru || headEn);
      const cells = (row, lang) => (Array.isArray(row) ? row : (row[lang] || row.en || [])).map((cell) => "<td>" + esc(cell) + "</td>").join("");
      let html = '<table class="g-form g-table">';
      if (headEn.length) html += '<thead class="en"><tr>' + headEn.map((cell) => "<th>" + esc(cell) + "</th>").join("") + "</tr></thead>";
      if (headRu.length) html += '<thead class="ru"><tr>' + headRu.map((cell) => "<th>" + esc(cell) + "</th>").join("") + "</tr></thead>";
      html += "<tbody>" + table.rows.map((row) => '<tr class="en">' + cells(row, "en") + '</tr><tr class="ru">' + cells(row, "ru") + "</tr>").join("") + "</tbody></table>";
      return html;
    }
    function topicSections(sections) {
      return (sections || []).map((section) => {
        let html = '<section class="g-section">';
        html += topicPair(section.title, "h3");
        html += topicPair(section.body, "p");
        html += topicTable(section.table);
        if (section.examples && section.examples.length) html += exampleBlock(section.examples);
        return html + "</section>";
      }).join("");
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
      return rows.map((item) => {
        const links = [];
        if (item.url) links.push([item.source || "Source", item.url]);
        (item.more || []).forEach((pair) => links.push(pair));
        return '<div class="ex-line"><b>' + esc(tidy(item.en)) + "</b>" +
          (item.ru ? '<br><span class="hint">Translation: ' + esc(item.ru) + "</span>" : '<br><span class="hint">This source line has no Russian gloss.</span>') +
          (links.length ? sourceList(links) : '<p class="src">' + esc(item.source || "") + "</p>") + "</div>";
      }).join("");
    }
    function topicArticleHtml(id, topic, legacy) {
      const form = (topic && topic.form) || (legacy && legacy.form) || "";
      let html = '<p class="g-badge">' + esc((topic && topic.kind) || "Grammar") + "</p>";
      html += '<p class="q">' + esc(form) + "</p>";
      if (topic && topic.formula) html += '<p class="formula">' + esc(topic.formula) + "</p>";
      if (topic && topic.affirmative) {
        html += '<table class="g-form"><tr><th>Affirmative</th><th>Negative</th><th>Question</th></tr><tr><td>' +
          esc(topic.affirmative) + "</td><td>" + esc(topic.negative || "") + "</td><td>" + esc(topic.question || "") + "</td></tr></table>";
      }
      if (topic && topic.note) {
        if (typeof topic.note === "object") html += '<p class="sub ru">' + esc(topic.note.ru || "") + '</p><p class="sub en">' + esc(topic.note.en || "") + "</p>";
        else html += '<p class="sub">' + esc(topic.note) + "</p>";
      }
      const usage = (topic && topic.usage) || null;
      if (usage) html += '<p class="ru">' + esc(usage.ru) + '</p><p class="en">' + esc(usage.en) + "</p>";
      else if (legacy) html += '<p class="ru">' + legacy.ru + '</p><p class="en">' + legacy.en + "</p>";
      if (topic && topic.sections && topic.sections.length) html += topicSections(topic.sections);
      if (topic && topic.cases && topic.cases.length) {
        html += '<p class="label">Main uses</p><ul>' + topic.cases.map((line) => {
          if (line && typeof line === "object") {
            return "<li>" + topicPair(line.title, "b") + '<span class="ru">' + esc(line.ru || "") + '</span><span class="en">' + esc(line.en || "") + "</span></li>";
          }
          return "<li>" + esc(line) + "</li>";
        }).join("") + "</ul>";
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
      html += '<p class="label">Sources</p>' + sourceList(topicLinks(id, topic));
      return html;
    }
    function compareArticleHtml(item) {
      let html = '<p class="g-badge">Comparison</p><p class="q">' + esc(item.title) + "</p>";
      if (item.note) html += '<p class="ru">' + esc(item.note.ru || "") + '</p><p class="en">' + esc(item.note.en || "") + "</p>";
      html += '<table class="g-table"><tr>' + (item.heads || []).map((head) => "<th>" + esc(head) + "</th>").join("") + "</tr>";
      (item.rows || []).forEach((row) => {
        html += "<tr>" + row.map((cell) => "<td>" + esc(cell) + "</td>").join("") + "</tr>";
      });
      html += "</table>";
      html += '<p class="label">Sources</p>' + sourceList(item.links || []);
      return html;
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
      const tone = (topic && topic.tone) || "present";
      document.getElementById("tenseTitle").textContent = name;
      document.getElementById("tense").dataset.lang = "en";
      document.getElementById("tense").className = "on tone-" + tone;
      document.querySelectorAll("#tenseLang .chip").forEach((b) => b.classList.toggle("on", b.dataset.tenseLang === "en"));
      let html = topicArticleHtml(id, topic, legacy);
      if (topic && topic.related && topic.related.length) {
        html += '<p class="label">Related</p>' + topic.related.map((rel) => {
          const other = topicById(rel) || tenses[rel];
          return other ? '<button class="g-topic tone-' + ((topicById(rel) || {}).tone || tone) + '" type="button" data-topic="' + rel + '"><b>' + esc(other.name) + '</b><span class="form">open</span></button>' : "";
        }).join("");
      }
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
      document.getElementById("tenseView").innerHTML = compareArticleHtml(item);
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
    async function openPdf(href, title) {
      const fromTitle = String(title || "").trim();
      const fromPath = decodeURIComponent(String(href || "").split("/").pop() || "");
      const name = fromTitle || fromPath || "PDF";
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
