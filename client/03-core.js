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
      const clipLink = e.target.closest("[data-clip]");
      if (clipLink) {
        e.preventDefault();
        openClipFrame(clipLink.getAttribute("href") || "", clipLink.getAttribute("data-clip") || "Clip");
        return;
      }
      const pdfLink = e.target.closest("a[href]");
      if (pdfLink) {
        const href = pdfLink.getAttribute("href") || "";
        if (/\.pdf(\?|$)/i.test(href) && href.indexOf("://") < 0) {
          e.preventDefault();
          openPdf(href, pdfLink.getAttribute("data-title") || pdfLink.textContent);
          return;
        }
      }
      const back = e.target.closest("[data-nav-back]");
      if (back) {
        if (lmState && (document.querySelector("section.on") || {}).id === "material" && lmState.mode !== "preview") {
          lmShow("preview");
          lmPersist();
          return;
        }
        goBack(back.dataset.fallback || "home");
        return;
      }
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
      if (speakLessonBtn) {
        if (typeof stageOpenSpeakMaterial === 'function' && authUser && !viewAccount) { void stageOpenSpeakMaterial(e, Number(speakLessonBtn.dataset.speakLesson)); return; }
        openSpeak("lesson", speakLevel, speakUnit, Number(speakLessonBtn.dataset.speakLesson)); return;
      }
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
      const lmDeleteBtn = e.target.closest("[data-lm-delete]");
      if (lmDeleteBtn && window.lmDeleteLesson) { window.lmDeleteLesson(lmDeleteBtn.dataset.lmDelete); return; }
      const lmHideBtn = e.target.closest("[data-lm-hide]");
      if (lmHideBtn && window.lmHideLesson) { window.lmHideLesson(lmHideBtn.dataset.lmHide); return; }
      const lmOpenBtn = e.target.closest("[data-lm-open]");
      if (lmOpenBtn && window.lmOpenLesson) { window.lmOpenLesson(lmOpenBtn.dataset.lmOpen); return; }
      const groupOpenBtn = e.target.closest("[data-group-open]");
      if (groupOpenBtn) { groupOpen(groupOpenBtn.dataset.groupOpen); return; }
      const groupEditBtn = e.target.closest("[data-group-edit]");
      if (groupEditBtn) { groupEdit(groupEditBtn.dataset.groupEdit, groupEditBtn); return; }
      const groupHideBtn = e.target.closest("[data-group-hide]");
      if (groupHideBtn) { groupHide(groupHideBtn.dataset.groupHide); return; }
      const groupDeleteBtn = e.target.closest("[data-group-delete]");
      if (groupDeleteBtn) { groupDelete(groupDeleteBtn.dataset.groupDelete); return; }
      const bugTabBtn = e.target.closest("button[data-bug-tab]");
      if (bugTabBtn) {
        bugTab = bugTabBtn.dataset.bugTab === "done" ? "done" : "open";
        document.querySelectorAll("[data-bug-tab]").forEach((btn) => btn.classList.toggle("on", btn === bugTabBtn));
        if (bugCache) paintBugs(bugCache);
        else paintBugs();
        return;
      }
      const bugCopy = e.target.closest("[data-bug-copy]");
      if (bugCopy) {
        copyBugBody(bugCopy);
        return;
      }
      const bugResolve = e.target.closest("[data-bug-resolve]");
      if (bugResolve) {
        if(bugResolve.disabled)return;
        bugResolve.disabled=true;
        accountFetch("/api/bugs/resolve", { method: "POST", body: JSON.stringify({ id: bugResolve.dataset.bugResolve }) }).then((data) => {
          if (bugCache) {
            const row = bugCache.find((item) => item.id === bugResolve.dataset.bugResolve);
            if (row) Object.assign(row,data?.bug||{resolved:true});
            paintBugs(bugCache);
          } else paintBugs();
        }).catch((err) => {
          const box = document.getElementById("bugList");
          if (box) box.insertAdjacentHTML("afterbegin", '<p class="sub">' + esc(err.message) + "</p>");
        }).finally(()=>{bugResolve.disabled=false;});
        return;
      }
      const bugBtn = e.target.closest("[data-bug]");
      if (bugBtn) {
        const item = bugBtn.closest(".bug-item");
        const detail = item && item.querySelector(".bug-body");
        if (detail) detail.hidden = !detail.hidden;
        bugBtn.classList.toggle("active", !!(detail && !detail.hidden));
        bugBtn.setAttribute('aria-expanded',String(!!(detail&&!detail.hidden)));
        return;
      }
      const jump = e.target.closest("[data-jump]");
      if (jump) {
        if(jump.id==='homeStudy'&&jump.dataset.jump!=='setup')jump.dataset.jump=authUser?.role==='USER'&&!viewAccount?'days':'groups';
        if(jump.closest('.side,#home,.mobile-tools')&&['groups','exams','days'].includes(jump.dataset.jump)){
          pushHistory();
          if(jump.dataset.jump==='groups')groupViewLevel='';
          else if(jump.dataset.jump==='days'){
            if(typeof classGroups!=='undefined'&&classGroups?.length&&(!classGroupId||!classGroups.some(row=>row.id===classGroupId)))classGroupId=classGroups[0].id;
          }
          else{examViewLevel='';examViewGroup=null;examSection=authUser?.role==='USER'&&!viewAccount?'assigned':'active';}
          show(jump.dataset.jump);return;
        }
        if(e.target.closest('[data-shell-settings-open]')){
          const panel=document.getElementById('shellSettings');
          if(panel)panel.hidden=!panel.hidden;
          return;
        }
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
      if (e.target.closest("[data-memory-size]")) {
        const chip = e.target.closest(".chip");
        if (chip) chip.classList.add("on");
        if ((document.querySelector("section.on") || {}).id === "daysetup") refreshDaySetupTime();
        return;
      }
      const btn = e.target.closest(".chip");
      if (btn) btn.classList.toggle("on");
      if ((document.querySelector("section.on") || {}).id === "daysetup") refreshDaySetupTime();
    }
    document.getElementById("modes").addEventListener("click", toggleTypeChip);
    document.getElementById("modesMore").addEventListener("click", toggleTypeChip);
    document.querySelectorAll("[data-mix]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest("input")) return;
        document.querySelectorAll("[data-mix]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        if ((document.querySelector("section.on") || {}).id === "setup") return;
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

