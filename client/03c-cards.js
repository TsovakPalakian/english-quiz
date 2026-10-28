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
      const text = String(sentence || "");
      const token = String(word || "").trim();
      if (!text || !token) return null;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("(^|[^А-Яа-яЁё])(" + escaped + ")(?![А-Яа-яЁё])", "i");
      const found = text.match(re);
      if (!found) return null;
      return { shown: text.replace(re, "$1____"), answer: found[2] };
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
    function dictionaryPlace(item) {
      const pos = String(((item.data || {}).cambridge || {}).pos || "");
      const type = String(item.expressionType || "");
      const blob = (pos + " " + type).toLowerCase();
      if (blob.includes("phrasal")) return "phrasal";
      if (blob.includes("idiom") || blob.includes("phrase") || blob.includes("expression")) return "idioms";
      const words = String((item && item.word) || "").trim().split(/\s+/).filter(Boolean);
      if (words.length > 1) return "idioms";
      return "mine";
    }
    function dictionaryOwned(word) {
      const key = String(word || "").trim().toLowerCase();
      if (!key) return true;
      if (loadAdded().some((row) => String(row.word || "").trim().toLowerCase() === key)) return true;
      return lessonBanks().some((bank) => (bank || []).some((card) => cardVisible(card) && String(card.en || "").trim().toLowerCase() === key));
    }
    function dictionaryAddHtml(item) {
      if(item?.stageEverydayReference || item?.isLessonWord || item?.data?.isLessonWord)return '';
      if(window.LearningMain && typeof lmState !== 'undefined' && lmState?.blocks?.some(b => b.type === 'wordcard' && String(b.word || '').trim().toLowerCase() === String(item?.word || '').trim().toLowerCase())) return '';
      if (!item || dictionaryOwned(item.word)) return "";
      return '<button class="btn primary dict-add" type="button" data-dict-add="' + dictionaryPlace(item) + '">Add word</button>';
    }
    async function dictionarySaveWord(word, data) {
      if(window.LearningMain){
        if(typeof stageSaveDictionaryWord!=='function')throw new Error('Wait for the account to finish loading.');
        return stageSaveDictionaryWord(word,data);
      }
      const source = data || {};
      const item = { word: midTitle(word), ru: source.ru || "", data: source, place: dictionaryPlace({ word: word, data: source, expressionType: source.expressionType || "" }) };
      if (source.expressionType) item.expressionType = source.expressionType;
      const list = loadAdded();
      list.unshift(item);
      saveAdded(list, { op: "put-card", card: item });
      trackEvent("card", cardArea(item.place), "add");
      paintAdded();
      return item;
    }
    function renderMade(item) {
      const back=document.querySelector('#made [data-nav-back]');if(back)back.dataset.fallback=item?.stageEverydayReference?'everydaytopic':'add';
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
      let html = '<div class="gen card-edit-shell"><h2>Word card</h2>';
      const ruLine = item.ru ? '<p class="word-ru">' + esc(item.ru) + "</p>" : (note ? '<p class="word-ru">' + esc(note) + "</p>" : "");
      html += madeEditHtml(item);
      html += '<div class="word-head">' + wordPic(item.word, true) + '<div><p class="entry">' + esc(item.word) + "</p>" + ruLine + dictionaryAddHtml(item) + "</div></div>";
      const pdfSense=item.pdfSense||item.pdfVocabulary;
      if(pdfSense?.meaning)html+='<p class="label">Lesson meaning · PDF draft</p><p data-pdf-meaning lang="en">'+esc(pdfSense.meaning)+'</p>'+(pdfSense.example?'<p lang="en">'+esc(pdfSense.example)+'</p>':'');
      if(item.stageEverydayReference)html+=stageEssentialSourceLinks(item);
      if (data.grammar && data.grammar.form) html += '<p class="pos">' + esc(data.grammar.form) + "</p>";
      else if (cam.pos) html += '<p class="pos">' + esc(cam.pos) + "</p>";
      html += ipa;
      if (cam.level) html += '<p><span class="level">' + esc(cam.level) + "</span></p>";
      if (!item.ru && !note) html += '<p class="hint bad">Wooordhunt has no Russian gloss for this phrase.</p>';
      const origin = cardOrigin(item);
      if (origin) html += '<p class="label">' + esc(origin) + "</p>";
      if (data.base) html += '<p><span class="label">Base form</span> ' + esc(data.base) + "</p>";
      if (item.ru && note) html += "<p>" + esc(note) + "</p>";
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
      html += "<p>" + sourceLinks(links) + "</p>";
      html += "</div>";
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
      html += cardQuizHtml(cardQuizKey(item), item.word, item.ru || note || "");
      document.getElementById("madeView").innerHTML = html;
      document.getElementById("madeView").dataset.ru = item.ru || note;
      document.getElementById("madeView").dataset.word = item.word;
      if ((document.querySelector("section.on") || {}).id !== "made") pushHistory();
      show("made");
    }
    document.getElementById("madeView").addEventListener("click", async (e) => {
      if (handleCardQuizClick(e)) return;
      const dictAdd = e.target.closest("[data-dict-add]");
      if (dictAdd && madeItem && !dictionaryOwned(madeItem.word)) {
        if(dictAdd.disabled)return;
        const current=madeItem;dictAdd.disabled=true;
        try{
          await dictionarySaveWord(current.word, Object.assign({}, current.data || {}, { ru: current.ru || "", expressionType: current.expressionType || "" }));
          if(madeItem===current)renderMade(current);
        }catch(error){window.LearningMain?.notice(error.message,true);}
        finally{dictAdd.disabled=false;}
        return;
      }
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
          face.innerHTML = '<p class="q">' + esc(back) + '</p><button class="btn" type="button" data-flip="' + dir + '" data-open="1">Card front</button>';
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
      if (typeBtn && typeBtn.dataset.type && !typeBtn.closest(".card-quiz-box")) {
        const dir = typeBtn.dataset.type;
        const typedEl = document.getElementById(dir === "ru" ? "madeTypeRu" : "madeTypeEn");
        if (!typedEl) return;
        const typed = typedEl.value;
        const gloss = view.dataset.ru || "";
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
    async function openUsages(word, lessonRu, quizKey) {
      const isLesson = !!lessonRu || (typeof lmState !== 'undefined' && lmState?.blocks?.some(b => b.type === 'wordcard' && String(b.word || '').trim().toLowerCase() === String(word || '').trim().toLowerCase()));
      const btn = document.activeElement;
      if (btn && btn.dataset && btn.dataset.usages) btn.textContent = "Looking up…";
      try {
        const res = await fetch(lookupBase() + "/lookup?word=" + encodeURIComponent(word));
        const data = await res.json();
        if (res.ok && data.found) {
          renderMade({ word: data.word || word, ru: lessonRu || data.ru, data: data, quizKey, isLessonWord: isLesson });
          return;
        }
      } catch (err) {
        if (btn && btn.dataset && btn.dataset.usages) btn.textContent = "Usages";
      }
      renderMade({ word: word, ru: lessonRu || "", data: {}, quizKey, isLessonWord: isLesson });
    }
    document.body.addEventListener("click", (e) => {
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
        if(stat.closest('#home')&&!authUser)return;
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
        } else if (kind === "phrasal" || kind === "idiom") {
          const bank = kind === "phrasal" ? phrasalWords : idiomWords;
          const word = bank.find((item) => String(item.en).toLowerCase() === key.toLowerCase());
          if (word) { renderWord(word); visit("word"); return; }
          const item = loadAdded().find((row) => String(row.word).toLowerCase() === key.toLowerCase());
          if (item) {
            if (item.data && item.data.usages && item.data.usages.length) renderMade(item);
            else openUsages(item.word, item.ru);
          }
        } else if (kind === "verb") {
          openVerbCard(key);
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
          if(cardDelete.closest('.card-row-tools')){cardDelete.innerHTML=actionIcon('<path d="m5 12 4 4L19 6"/>');cardDelete.title='Confirm deletion';}else cardDelete.textContent = "Delete?";
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
      const lmWord = e.target.closest("[data-lm-word]");
      if (lmWord) {
        const block = lmBlock(lmWord.dataset.lmWord);
        if (!block || block.type !== "wordcard") return;
        if(block.pdfVocabulary&&block.stageId&&typeof stageHydrateMade==='function'){stageHydrateMade({...block,word:block.word,en:block.word,isLessonWord:true});return;}
        const item = { word: block.word, ru: block.ru || "", data: block.data || {}, quizKey: block.quizKey, isLessonWord: true };
        if (item.data && item.data.usages && item.data.usages.length) renderMade(item);
        else openUsages(item.word, item.ru, item.quizKey, true);
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
      if (handleCardQuizClick(e)) return;
      const btn = e.target.closest("[data-usages]");
      if (!btn) return;
      openUsages(btn.dataset.usages, btn.dataset.usagesRu || "");
    });
    function refreshCardQuizBox(box, editIndex, viewIndex) {
      if (!box) return;
      const word = box.dataset.cardQuizWord || "";
      const en = box.dataset.cardQuizEn || word;
      const ru = box.dataset.cardQuizRu || "";
      const next = document.createElement("div");
      next.innerHTML = cardQuizHtml(word, en, ru, editIndex, viewIndex);
      const fresh = next.firstChild;
      if (fresh) box.replaceWith(fresh);
    }
    document.body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
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
    function cardEditFields(card) {
      return [
        { key: "en", label: "English", value: card.en || "" },
        { key: "ru", label: "Russian", value: card.ru || "" },
        { key: "pos", label: "Part of speech", value: card.pos || "" },
        { key: "uk", label: "UK IPA", value: card.uk || "" },
        { key: "us", label: "US IPA", value: card.us || "" },
        { key: "level", label: "Level", value: card.level || "" },
        { key: "gloss", label: "Meaning", value: card.gloss || "" },
        { key: "ex", label: "Example", value: card.ex || "" },
        { key: "url", label: "Dictionary link", value: card.url || "" }
      ];
    }
    function editFieldsFor(host) {
      const kind = host.dataset.editKind;
      const id = host.dataset.editId;
      if (kind === "added") {
        const item = loadAdded()[Number(id)];
        if (!item || !canEditAdded(item)) return null;
        const cam = (item.data && item.data.cambridge) || {};
        return [
          { key: "en", label: "English", value: item.word || "" },
          { key: "ru", label: "Russian", value: item.ru || "" },
          { key: "pos", label: "Part of speech", value: item.pos || cam.pos || "" },
          { key: "uk", label: "UK IPA", value: item.uk || "" },
          { key: "us", label: "US IPA", value: item.us || "" },
          { key: "level", label: "Level", value: item.level || cam.level || "" },
          { key: "gloss", label: "Meaning", value: item.gloss || cam.definition || "" },
          { key: "ex", label: "Example", value: item.ex || "" },
          { key: "url", label: "Dictionary link", value: item.url || "" }
        ];
      }
      if (kind === "made") {
        if (!canEditLessons() || !madeItem) return null;
        const data = madeItem.data || {};
        const cam = data.cambridge || {};
        const wh = data.wooordhunt || {};
        return [
          { key: "en", label: "English", value: madeItem.word || "" },
          { key: "ru", label: "Russian", value: madeItem.ru || "" },
          { key: "pos", label: "Part of speech", value: madeItem.pos || cam.pos || (data.grammar && data.grammar.form) || "" },
          { key: "uk", label: "UK IPA", value: madeItem.uk || cam.uk || wh.uk || "" },
          { key: "us", label: "US IPA", value: madeItem.us || cam.us || wh.us || "" },
          { key: "level", label: "Level", value: madeItem.level || cam.level || "" },
          { key: "gloss", label: "Meaning", value: madeItem.gloss || cam.definition || "" },
          { key: "ex", label: "Example", value: madeItem.ex || "" },
          { key: "url", label: "Dictionary link", value: madeItem.url || "" }
        ];
      }
      if (!canEditLessons()) return null;
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
      return cardEditFields(card);
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
        const open = madeItem === item || (madeItem && String(madeItem.word || "").toLowerCase() === String(word || "").toLowerCase());
        list.splice(index, 1);
        saveAdded(list, { op: "delete-card", place: place, word: word });
        paintAdded();
        paintAllWords();
        if (typeof paintHomeStats === "function") paintHomeStats();
        if (open) show("add");
        return;
      }
      if (kind === "made") {
        if (!canEditLessons() || !madeItem) return;
        const list = loadAdded();
        const index = addedIndexOf(madeItem);
        if (index >= 0) {
          const item = list[index];
          saveAdded(list.filter((_, i) => i !== index), { op: "delete-card", place: item.place || "mine", word: item.word });
          paintAdded();
          paintAllWords();
        }
        madeItem = null;
        show("add");
        return;
      }
      if (!canEditLessons()) return;
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
      if (kind === "added" || kind === "made") {
        const list = loadAdded();
        let item = kind === "added" ? list[Number(id)] : null;
        if (kind === "made") {
          if (!canEditLessons() || !madeItem) return;
          const at = addedIndexOf(madeItem);
          item = at >= 0 ? list[at] : madeItem;
        }
        if (kind === "added" && (!item || !canEditAdded(item))) return;
        const en = read("en");
        const ru = read("ru");
        if (!en || !ru) { write("Write the English word and the Russian translation.", true); return; }
        const next = midTitle(en);
        if (kind === "added") {
          const clash = list.some((row, index) => index !== Number(id) && (row.place || "mine") === (item.place || "mine") && String(row.word).toLowerCase() === next.toLowerCase());
          if (clash) { write("Already on this page.", true); return; }
          const prevPlace = item.place || "mine";
          const prevWord = item.word;
          const openMade = madeItem === item || (madeItem && String(madeItem.word || "").toLowerCase() === String(prevWord || "").toLowerCase());
          item.word = next;
          item.ru = ru;
          item.pos = read("pos");
          item.uk = read("uk");
          item.us = read("us");
          item.level = read("level");
          item.gloss = read("gloss");
          item.ex = read("ex");
          item.url = read("url");
          saveAdded(list, { op: "put-card", card: item, replacePlace: prevPlace, replaceWord: prevWord });
          paintAdded();
          if (openMade) renderMade(item);
          return;
        }
        madeItem.word = next;
        madeItem.ru = ru;
        madeItem.pos = read("pos");
        madeItem.uk = read("uk");
        madeItem.us = read("us");
        madeItem.level = read("level");
        madeItem.gloss = read("gloss");
        madeItem.ex = read("ex");
        madeItem.url = read("url");
        if (item && list.indexOf(item) >= 0) {
          const prevPlace = item.place || "mine";
          const prevWord = item.word;
          item.word = next;
          item.ru = ru;
          item.pos = madeItem.pos;
          item.uk = madeItem.uk;
          item.us = madeItem.us;
          item.level = madeItem.level;
          item.gloss = madeItem.gloss;
          item.ex = madeItem.ex;
          item.url = madeItem.url;
          saveAdded(list, { op: "put-card", card: item, replacePlace: prevPlace, replaceWord: prevWord });
          paintAdded();
        } else {
          const catalog = findCatalog(id) || findCatalog(next);
          if (catalog) {
            const map = loadEdits();
            const origin = catalog.origin || String(catalog.en || "").toLowerCase();
            map[origin] = {
              en: next,
              ru: ru,
              pos: madeItem.pos,
              uk: madeItem.uk,
              us: madeItem.us,
              level: madeItem.level,
              gloss: madeItem.gloss,
              ex: madeItem.ex,
              url: madeItem.url
            };
            saveEdits(map, origin);
            applyLessonEdits();
            applySongEdits();
          }
        }
        renderMade(madeItem);
        return;
      }
      if (!canEditLessons()) return;
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
        map[origin] = {
          en: en,
          ru: ru,
          pos: read("pos"),
          uk: read("uk"),
          us: read("us"),
          level: read("level"),
          gloss: read("gloss"),
          ex: read("ex"),
          url: read("url")
        };
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
