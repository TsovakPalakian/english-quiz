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
      return '<a href="' + play + '" data-clip="PlayPhrase">PlayPhrase</a> · <a href="' + you + '" data-clip="YouGlish">YouGlish</a>';
    }
    function openClipFrame(url, title) {
      const frame = document.getElementById("clipFrame");
      const view = document.getElementById("clipFrameView");
      const name = document.getElementById("clipFrameTitle");
      if (!url || !/^https?:\/\//i.test(url)) return;
      if (/playphrase\.me|youglish\.com/i.test(url)) {
        const width = 520;
        const height = 720;
        const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
        const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
        const popup = window.open(url, "enquiz-clip", "width=" + width + ",height=" + height + ",left=" + left + ",top=" + top);
        if (popup) {
          try { popup.opener = null; } catch (e) {}
          try { popup.moveTo(left, top); popup.focus(); } catch (e) {}
          return;
        }
      }
      if (!frame || !view) return;
      if (name) name.textContent = title || "";
      view.src = url;
      frame.hidden = false;
    }
    function closeClipFrame() {
      const frame = document.getElementById("clipFrame");
      const view = document.getElementById("clipFrameView");
      if (view) view.src = "about:blank";
      if (frame) frame.hidden = true;
      if (externalReturn) { const place = externalReturn; externalReturn = null; requestAnimationFrame(() => restorePosition(place)); }
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
      const fsrsHtml = typeof fsrsCardMetricsHtml === 'function' ? fsrsCardMetricsHtml(w) : (typeof window !== 'undefined' && window.fsrsCardMetricsHtml ? window.fsrsCardMetricsHtml(w) : '');
      document.getElementById("wordView").innerHTML =
        catalogEditHtml(w) +
        '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + esc(w.en) + '</p><p class="pos">' + esc(w.pos) + '</p></div></div>' +
        ipaHtml(w) +
        (w.level ? '<p><span class="level">' + esc(w.level) + '</span></p>' : '') +
        (w.ru ? '<p><b>' + esc(w.ru) + '</b></p>' : '') +
        clipLine(clipOf(w)) +
        (meaningOf(w) ? '<p>' + esc(meaningOf(w)) + '</p>' : '') +
        (w.ru ? '' : '<p class="hint">No Russian translation on this slide.</p>') +
        (w.ex ? '<p>' + (w.deck ? '' : 'From the lesson: ') + esc(w.ex) + '</p>' : '') +
        fsrsHtml +
        "<p>" + cardLinks(w.en, w.url) + "</p>" +
        '<div class="row" style="margin-top:12px"><button class="btn" type="button" id="toDayFlip">Flip this card</button><button class="btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button>' +
        (w.deck
          ? '<button class="btn primary" type="button" data-deck-study="' + esc(w.deck) + '">Study</button>'
          : '<button class="btn primary" type="button" data-day-quiz="' + esc((w.quiz || { "7 Sep": "lesson-07", "9 Sep": "lesson-09", "14 Sep": "lesson-14", "16 Sep": "lesson-16", "21 Sep": "lesson-21", "23 Sep": "lesson-23" }[w.lesson] || "lesson-21")) + '">This day\'s quiz</button>') +
        '</div>' + cardQuizHtml(cardQuizKey(w), w.en, w.ru);
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
      const frontHtml = '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + esc(w.en) + '</p><p class="pos">' + esc(w.pos) + '</p></div></div>';
      const backHtml = '<p class="entry">' + esc(w.ru || w.gloss || "No Russian translation on this slide.") + '</p><p class="pos">' + esc(w.en) + ' · ' + esc(w.pos) + '</p>' + ipaHtml(w) + (w.ex ? '<p>' + esc(w.ex) + '</p>' : '') + '<p>' + cardLinks(w.en, w.url) + '</p>' + clipLine(clipOf(w)) + '<div class="row"><button class="btn primary saas-btn saas-btn-primary" type="button" data-day-flip-rate="knew">Knew</button><button class="btn saas-btn" type="button" data-day-flip-rate="forgot">Didn\'t know</button><button class="btn saas-btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button></div>';
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

    function paintDeckGrids(place) {
      if (place === "phrasal") {
        paintExampleGrid("phrasalGrid", phrasalWords, "phrasal");
        paintPlace("phrasal", "phrasalAdded");
      }
      if (place === "idioms") {
        paintExampleGrid("idiomGrid", idiomWords, "idiom");
        paintPlace("idioms", "idiomAdded");
      }
    }
    function paintExampleGrid(id, list, attr) {
      const box = document.getElementById(id);
      if (!box) return;
      box.innerHTML = list.map((w,i)=>({w,i})).sort((a,b)=>a.w.en.localeCompare(b.w.en,'en',{sensitivity:'base'})).map(({w,i}) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-' + attr + '="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' +
        ipaHtml(w) +
        '<div class="label">' + esc(w.ru) + "</div></button>"
      ).join("");
      dressWords(box);
    }
    function paintWordGrid() {
      document.getElementById("wordGrid").innerHTML = words.map((w, i) => !cardVisible(w) ? "" :
        '<button class="wcard" type="button" data-i="' + i + '"><div class="en">' + esc(w.en) + '</div><div class="pos">' + esc(w.pos) + '</div>' + ipaHtml(w) + '<div class="label">' + esc(w.ru) + '</div></button>'
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
    function canManageOwnThemes() { return !!(authUser && accountReady && !viewAccount && !viewSwitching); }
    function isTeacher() {
      if (viewAccount) return viewAccount.role === "ADMIN";
      return !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
    }
    function canEditLessons() {
      if(typeof materialReviewStudent!=='undefined'&&materialReviewStudent)return false;
      if (viewAccount) return sessionIsDeveloper();
      return !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
    }
    function canTuneStudentLessons() {
      return !!((viewAccount || typeof materialReviewStudent!=='undefined'&&materialReviewStudent) && authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
    }
    function isDeveloper() {
      if (viewAccount) return false;
      return sessionIsDeveloper();
    }
    function guideShot(title, items) {
      return '<div class="guide-shot" aria-label="' + esc(title) + '"><div class="guide-shot-top"><span>English</span><b>' + esc(title) + '</b><i></i></div><div class="guide-shot-body">' + items.map((item) => '<button type="button" class="guide-hotspot" data-jump="' + esc(item[1]) + '">' + esc(item[0]) + '</button>').join('') + '</div></div>';
    }
    function guideBlock(title, text, jump, label, shot = '') {
      return '<article class="guide-block saas-card">' + shot + '<div class="guide-copy"><h2>' + title + '</h2><p>' + text + '</p><button class="btn primary saas-btn" type="button" data-jump="' + jump + '">' + label + '</button></div></article>';
    }
    function guideVisitorKey() {
      if (authUser?.id) return String(authUser.id).slice(0, 80);
      try {
        let key = localStorage.getItem('enquiz-guide-visitor');
        if (!key || !/^[A-Za-z0-9._:-]{8,80}$/.test(key)) {
          key = 'g' + Math.random().toString(36).slice(2) + Date.now().toString(36);
          localStorage.setItem('enquiz-guide-visitor', key.slice(0, 80));
        }
        return key.slice(0, 80);
      } catch (e) {
        return 'guest' + String(Date.now()).slice(-10);
      }
    }
    function paintGuideVisits(stats) {
      const el = document.getElementById('guideVisits');
      if (!el || !stats) return;
      const views = Number(stats.views) || 0;
      const uniques = Number(stats.uniques) || 0;
      el.hidden = false;
      el.textContent = views + ' visits · ' + uniques + ' people';
      el.title = 'Metric: page opens (visits) and distinct devices/accounts (people).';
    }
    async function recordGuideVisit() {
      try {
        const response = await fetch('/api/guide/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ visitor: guideVisitorKey() })
        });
        if (!response.ok) return;
        paintGuideVisits(await response.json());
      } catch (e) {}
    }
    function paintGuide() {
      const box = document.getElementById('guideContent');
      if (!box) return;
      const ru = document.getElementById('guide').dataset.lang === 'ru';
      const role = (viewAccount || authUser)?.role || 'GUEST';
      const t = (en, russian) => ru ? russian : en;
      recordGuideVisit();
      let html = '';
      if (role === 'GUEST') {
        html += guideBlock(t('Sign in or create an account', 'Вход и регистрация'), t('Open Account to sign in or register. Registration creates a student account; access may wait for teacher approval.', 'Откройте Account, чтобы войти или зарегистрироваться. Создаётся аккаунт ученика; доступ может ожидать подтверждения учителя.'), 'account', t('Open Account', 'Открыть Account'), guideShot(t('Account', 'Аккаунт'), [[t('Sign in', 'Войти'), 'account'], [t('Register', 'Регистрация'), 'account']]));
        html += guideBlock(t('Choose a theme', 'Выбор темы'), t('Open Account then Theme to select Van Gogh or another available theme. Guests can switch themes; creating, editing and removing personal themes requires signing in.', 'Откройте Account, затем Theme и выберите Van Gogh или другую доступную тему. Гость может менять темы; создание, редактирование и удаление своих тем доступны после входа.'), 'themes', t('Open themes', 'Открыть темы'), guideShot(t('Themes', 'Темы'), [['Van Gogh', 'themes'], [t('Choose theme', 'Выбрать тему'), 'themes']]));
      } else {
        html += guideBlock(t('Learn from your classes', 'Обучение по занятиям'), t('Open a group, choose a lesson, then study its cards, rules and tasks. Exams are listed separately and results remain in your account.', 'Откройте группу, выберите занятие и изучайте его карточки, правила и задания. Экзамены находятся отдельно, результаты сохраняются в аккаунте.'), 'groups', t('Open Groups', 'Открыть Groups'), guideShot(t('Study', 'Обучение'), [['Groups', 'groups'], ['Exams', 'exams'], ['Study', 'groups']]));
        html += guideBlock(t('Cards: read, listen and practise', 'Карточки: смотреть, слушать и тренировать'), t('A card contains translation, part of speech, UK/US pronunciation and audio, examples and dictionary links. Study offers choice, typing, gaps, matching, listening and more.', 'Карточка содержит перевод, часть речи, британское и американское произношение и аудио, примеры и ссылки на словари. Есть выбор, ввод, пропуски, пары, аудирование и другие проверки.'), 'allwords', t('Open cards', 'Открыть карточки'), guideShot(t('Word card', 'Карточка слова'), [[t('Pronunciation', 'Произношение'), 'allwords'], [t('Examples', 'Примеры'), 'allwords'], [t('Study', 'Учить'), 'setup']]));
        html += guideBlock(t('Your materials and themes', 'Свои материалы и темы'), t('In Entertainment you can add words, texts and songs. Your materials can be edited or moved to Archive. Theme settings are under Account.', 'В Entertainment можно добавлять слова, тексты и песни. Свои материалы можно редактировать или перемещать в Archive. Настройки темы находятся в Account.'), 'library', t('Open Entertainment', 'Открыть Entertainment'), guideShot(t('Entertainment', 'Развлечения'), [[t('My cards', 'Мои карточки'), 'add'], [t('Add text', 'Добавить текст'), 'texts'], [t('Themes', 'Темы'), 'themes']]));
        html += guideBlock(t('Archive and account', 'Архив и аккаунт'), role === 'USER' ? t('Removing your material first moves it to Archive after confirmation. Restore brings it back. Remove from archive hides your own archived item without a password; it does not erase it permanently. Account contains statistics, details, password changes and sign-out.', 'Удаление своего материала сначала перемещает его в Archive после подтверждения. Restore возвращает его обратно. Remove from archive скрывает свой архивный материал без пароля, но не стирает окончательно. В Account находятся статистика, данные аккаунта, смена пароля и выход.') : t('Archive groups removed materials by type and shows who archived them. Restore returns material to its original section. Remove from archive hides an entry; teachers confirm this with their password. Account contains details, password changes and sign-out.', 'Archive группирует убранные материалы по типам и показывает, кто их перенёс. Restore возвращает материал в исходный раздел. Remove from archive скрывает запись; учитель подтверждает это паролем. В Account находятся данные аккаунта, смена пароля и выход.'), 'archive', t('Open Archive', 'Открыть Archive'), guideShot(t('Account tools', 'Управление'), [['Archive', 'archive'], [t('Account', 'Аккаунт'), 'profile'], [t('Statistics', 'Статистика'), 'stats']]));
        html += guideBlock(t('Statistics and progress', 'Статистика и прогресс'), t('Choose a period to see answers, accuracy, learned checks, study time, exams and added materials. Keep comparison enabled to compare the selected period with the previous period.', 'Выберите период, чтобы увидеть ответы, точность, выученные проверки, время, экзамены и добавленные материалы. Оставьте сравнение включённым, чтобы сопоставить выбранный период с предыдущим.'), 'stats', t('Open Statistics', 'Открыть статистику'), guideShot(t('Progress', 'Прогресс'), [[t('Period', 'Период'), 'stats'], [t('Learning', 'Обучение'), 'stats'], [t('Materials', 'Материалы'), 'stats']]));
        if (!viewAccount) html += guideBlock(t('Personal themes', 'Личные темы'), t('Open Account then Theme. Select a theme or use Add theme to choose its name, colours and background image. Edit or remove your own themes there. Your themes and selected theme are saved to your account and restored after signing in, including on another device.', 'Откройте Account, затем Theme. Выберите тему или нажмите Add theme: задайте название, цвета и фоновую картинку. Там же можно редактировать и удалять свои темы. Темы и выбранное оформление сохраняются в аккаунте и восстанавливаются после входа, в том числе на другом устройстве.'), 'themes', t('Open themes', 'Открыть темы'), guideShot(t('Themes', 'Темы'), [[t('Choose theme', 'Выбрать тему'), 'themes'], [t('Add theme', 'Добавить тему'), 'themes'], [t('Edit themes', 'Изменить темы'), 'themes']]));
      }
      if (role === 'ADMIN' || role === 'DEVELOPER') {
        html += '<div class="guide-note"><b>' + t('Archive preview', 'Просмотр архива') + '</b><p>' + t('Click an archived row to inspect its contents without restoring it. Restore and archive removal are icons on the right; their labels appear on hover.', 'Нажмите на строку архива, чтобы посмотреть содержимое без восстановления. Значки восстановления и удаления находятся справа; названия видны при наведении.') + '</p></div>';
        html += guideBlock(t('Copy learning material', 'Копирование материалов'), t('Use the Copy icon beside Hide and Delete, or inside a saved lesson or examination block. Choose a destination and a name, then press Create copy. Selecting a group does not move the original. Lessons, exams, blocks and individual materials can be copied to compatible locations; copies have independent content and files, without student answers, grades or progress. Save draft or Publish your edits before copying.', 'Нажмите значок Copy рядом с Hide и Delete или внутри сохранённого занятия либо экзаменационного блока. Выберите назначение и название, затем Create copy. Выбор группы не переносит оригинал. Занятия, экзамены, блоки и отдельные материалы копируются в подходящие места; содержимое и файлы копии независимы, ответы учеников, оценки и прогресс не копируются. Перед копированием изменений нажмите Save draft или Publish.'), 'groups', t('Open Groups', 'Открыть Groups'));
        html += guideBlock(t('Create and manage learning', 'Создание и управление обучением'), t('Create groups, lessons, blocks and exams; edit names and dates; publish or hide material. Open a student in Accounts to inspect progress, answers and exam work, and configure lesson access.', 'Создавайте группы, занятия, блоки и экзамены; редактируйте названия и даты; публикуйте или скрывайте материалы. Откройте ученика в Accounts, чтобы посмотреть прогресс, ответы и экзамены и настроить доступ к занятиям.'), 'admin', t('Open Accounts', 'Открыть Accounts'), guideShot(t('Teacher tools', 'Инструменты учителя'), [[t('Students', 'Ученики'), 'admin'], ['Groups', 'groups'], ['Exams', 'exams']]));
        html += guideBlock(t('Accounts and groups','Аккаунты и группы'),t('Accounts is next to Exams. Choose a student group when approving registration, or open an existing student and press Save group. In Accounts → Groups, create and rename groups, view their students, lessons and exams, and explicitly assign an exam. Only empty groups can be archived. My account contains your own account settings.', 'Accounts находится после Exams. Выберите группу при одобрении регистрации либо откройте ученика и нажмите Save group. Во вкладке Accounts → Groups создавайте и переименовывайте группы, просматривайте учеников, занятия и экзамены и назначайте экзамены явной кнопкой. В архив можно убрать только пустую группу. Личные настройки находятся в My account.'),'admin',t('Open Accounts','Открыть Accounts'));
        html += '<div class="guide-note"><b>' + t('Student administration', 'Администрирование учеников') + '</b><p>' + t('A teacher administers students only: review progress, correct translations and control material visibility. Hide and Show change access without deleting student data. Student data cannot be removed here.', 'Учитель администрирует только учеников: смотрит прогресс, исправляет переводы и управляет видимостью материалов. Hide и Show меняют доступ, не удаляя данные ученика. Удаление данных ученика здесь недоступно.') + '</p></div>';
        html += '<div class="guide-note"><b>' + t('Student statistics', 'Статистика ученика') + '</b><p>' + t('Open a student in Accounts, then open Statistics to compare that student’s words, practice, materials, exams and study time for the selected period.', 'Откройте ученика в Accounts, затем Statistics, чтобы сравнить его слова, практику, материалы, экзамены и время обучения за выбранный период.') + '</p></div>';
      }
      if (role === 'USER') html += guideBlock(t('Taking an exam', 'Прохождение экзамена'), t('Exam materials are read-only. Translation, word lookup, adding words, selection, copying, pasting and immediate answer checks are unavailable. You can type your answers and use the assigned audio and video. Submitted answers cannot be changed. In Archive, click a row to preview it; the icons on the right restore or remove it.', 'Экзаменационные материалы доступны только для чтения. Перевод, словари, добавление слов, выделение, копирование, вставка и мгновенная проверка ответов недоступны. Можно вводить ответы и использовать аудио и видео задания. После сдачи ответы изменить нельзя. В архиве нажмите на строку для просмотра, а значки справа восстанавливают или убирают материал.'), 'exams', t('Open Exams', 'Открыть Exams'));
      if (role === 'DEVELOPER') {
        html += guideBlock(t('Developer control', 'Управление разработчика'), t('Manage students, teachers, roles and account states. Review every archive state and decide on permanent deletion. Bugs contains diagnostics and reports; sign-in errors are not added as bugs.', 'Управляйте учениками, учителями, ролями и состояниями аккаунтов. Просматривайте все состояния архива и принимайте решение об окончательном удалении. Bugs содержит диагностику и отчёты; ошибки входа туда не добавляются.'), 'admin', t('Open developer tools', 'Открыть управление'), guideShot(t('Developer', 'Разработчик'), [[t('Accounts', 'Аккаунты'), 'admin'], ['Archive', 'archive'], ['Bugs', 'bugs']]));
        html += '<div class="guide-note danger"><b>' + t('Permanent actions', 'Необратимые действия') + '</b><p>' + t('Permanent deletion is developer-only and cannot be undone. Check the material, owner and archive status before confirming.', 'Окончательное удаление доступно только разработчику и не отменяется. Перед подтверждением проверьте материал, владельца и состояние архива.') + '</p></div>';
      }
      if (hideStudentSongs()) html = guideBlock(t('Manage learning access', 'Управление доступом к обучению'), t('Hide or show groups, lessons and exams for this student. Buttons show how many materials are hidden out of the total. Hidden materials do not appear in the student account. You may add words to the student dictionaries; Study is unavailable here.', 'Скрывайте и открывайте группы, занятия и экзамены для ученика. На кнопках указано число скрытых материалов из общего количества. Скрытые материалы не показываются ученику. Можно добавлять слова в его словари; Study в этом режиме недоступен.'), 'groups', t('Open Groups', 'Открыть Groups'), guideShot(t('Student materials', 'Материалы ученика'), [['Groups','groups'], ['Exams','exams'], [t('Dictionaries', 'Словари'),'add']])) + guideBlock(t('Review exam answers', 'Проверка ответов на экзаменах'), t('Open Exams to correct student answers and award points without changing the exam questions. Edit exam material from your own account. Student texts, songs and themes are private; this view always uses Van Gogh. Student data cannot be deleted here.', 'Откройте Exams, чтобы исправить ответы ученика и выставить баллы, не меняя задания. Материал экзамена редактируется из своей учётной записи. Тексты, песни и темы ученика приватны; здесь всегда используется Van Gogh. Удаление данных ученика недоступно.'), 'exams', t('Open Exams', 'Открыть Exams'), guideShot(t('Review', 'Проверка'), [['Exams','exams'], [t('Statistics','Статистика'),'stats']]));
      if (role === 'USER' && !viewAccount) html += guideBlock(t('Answers and results', 'Ответы и результаты'),t('Answers are saved as a draft while you type. Check the saving status. Submit sends the entire examination block, or all assessed tasks in a lesson, and locks your answers after confirmation from the server. Submitted exams cannot be reopened; a new assignment creates a separate exam. Maximum points are shown beside questions. After your teacher publishes the review, you can see your answers, earned points, error marks and feedback, but not solution keys.', 'Во время ввода ответы сохраняются в черновик. Следите за статусом сохранения. Submit сдаёт весь экзаменационный блок или все оцениваемые задания занятия и блокирует ответы после подтверждения сервера. Сданный экзамен нельзя разблокировать; новое назначение создаёт отдельный экзамен. Рядом с вопросами указаны возможные баллы. После публикации проверки доступны ваши ответы, полученные баллы, отметки ошибок и комментарии, но не ключи правильных ответов.'),'exams',t('Open Exams','Открыть Exams'));
      if (['ADMIN','DEVELOPER'].includes(role) || canTuneStudentLessons()) html += guideBlock(t('Assess and publish results','Оценивание и публикация результатов'),t('Set maximum points for each question or task. Criteria use one line per criterion: Content | 3. In ordinary lessons, enable Assessed task only where grading is needed. Open a student to review submitted answers, assign points and feedback, and use Save review for a private draft. Publish results makes the review visible to the student. Published grades are locked until Amend review. Reopen submission lets the student edit again; a reason and change history are retained. Ungraded questions remain ungraded, not zero.', 'Задайте максимум баллов каждому вопросу или заданию. Критерии записываются по строкам: Content | 3. В обычных занятиях включайте Assessed task только там, где нужна оценка. Откройте ученика, проверьте сданные ответы, выставьте баллы и комментарии. Save review сохраняет закрытый черновик проверки; Publish results открывает результаты ученику. Опубликованные оценки блокируются до Amend review. Reopen submission разрешает ученику снова редактировать ответы; причина и история изменений сохраняются. Непроверенное задание не получает автоматически ноль.'),'admin',t('Open Accounts','Открыть Accounts'));
      html += '<article class="guide-block saas-card"><div class="guide-copy"><h2>'+t('Display and readability', 'Размер и читаемость')+'</h2><p>'+t('Open Aa Display to choose one of five interface sizes or enable High visibility. The setting applies across pages and is remembered on this device.', 'Откройте Aa Display, чтобы выбрать один из пяти размеров интерфейса или включить High visibility. Настройка действует на всех страницах и сохраняется на этом устройстве.')+'</p><button class="btn saas-btn" type="button" data-display-open>'+t('Open Display', 'Открыть Display')+'</button></div></article>';
      box.innerHTML = html;
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
      return !!(card && !card.deleted && !(!viewAccount && authUser?.role === "USER" && hiddenCardIds.has(String(card.stageId || card.cardId || ""))));
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
      if (!card.original) {
        card.original = {
          en: card.en,
          ru: card.ru,
          pos: card.pos,
          uk: card.uk,
          us: card.us,
          level: card.level,
          gloss: card.gloss,
          ex: card.ex,
          url: card.url
        };
      }
      const o = card.original;
      card.en = o.en;
      card.ru = o.ru;
      card.pos = o.pos;
      card.uk = o.uk;
      card.us = o.us;
      card.level = o.level;
      card.gloss = o.gloss;
      card.ex = o.ex;
      card.url = o.url;
      if (card.deleted || !edit) return;
      if (edit.en) card.en = edit.en;
      if (edit.ru != null) card.ru = edit.ru;
      if (edit.pos != null) card.pos = edit.pos;
      if (edit.uk != null) card.uk = edit.uk;
      if (edit.us != null) card.us = edit.us;
      if (edit.level != null) card.level = edit.level;
      if (edit.gloss != null) card.gloss = edit.gloss;
      if (edit.ex != null) card.ex = edit.ex;
      if (edit.url != null) card.url = edit.url;
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
    function editActions(sidebar = false) {
      const pencil = actionIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
      const trash = actionIcon('<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>');
      return '<span class="'+(sidebar?'day-tools card-row-tools':'edit-actions')+'"><button class="'+(sidebar?'day-edit':'icon-btn')+'" type="button" data-edit-toggle aria-label="Edit" title="Edit">' + pencil + '</button>' + (!viewAccount || sessionIsDeveloper() ? '<button class="'+(sidebar?'day-del':'icon-btn')+'" type="button" data-card-delete aria-label="Delete" title="Delete">' + trash + '</button>' : '') + '</span>';
    }
    function editHost(kind, id, corner) {
      return '<div data-edit-host' + (corner ? ' class="card-edit"' : "") + ' data-edit-kind="' + esc(kind) + '" data-edit-id="' + esc(id) + '">' + editActions() + '</div>';
    }
    function catalogEditHtml(card) {
      // Shared catalog edits only on own teacher session — not while viewing another account.
      if (!canEditLessons() || !card) return "";
      if (!card.origin) card.origin = String(card.en || card.base || "").toLowerCase();
      return editHost("card", card.origin, true);
    }
    function canEditAdded(item) {
      if (!item || !authUser) return false;
      if (viewAccount) return authUser.role === "ADMIN" || authUser.role === "DEVELOPER";
      return true;
    }
    function addedIndexOf(item) {
      const list = loadAdded();
      if (!item) return -1;
      let index = list.indexOf(item);
      if (index >= 0) return index;
      const key = String(item.word || "").toLowerCase();
      const place = item.place || "mine";
      return list.findIndex((row) => String(row.word || "").toLowerCase() === key && (row.place || "mine") === place);
    }
    function addedEditHtml(item) {
      const index = addedIndexOf(item);
      if (index < 0 || !canEditAdded(loadAdded()[index])) return "";
      return editHost("added", String(index), true);
    }
    function madeEditHtml(item) {
      if (!canEditLessons() || !item) return "";
      return addedEditHtml(item) || catalogEditHtml(findCatalog(item.word)) || editHost("made", String(item.word || "").toLowerCase(), true);
    }
    const CARD_QUIZ_TYPES = ["Flip", "Choice", "Type", "Gap", "Build", "Match", "True / false", "Tap", "Select all", "Reverse", "Spell", "Letters", "Listen", "Definition", "Odd one out", "Memory", "Hangman"];
    const CARD_QUIZ_KEY = "enquiz-card-quizzes";
    function loadCardQuizzes() {
      try { return JSON.parse(localStorage.getItem(CARD_QUIZ_KEY) || "{}") || {}; }
      catch (e) { return {}; }
    }
    function cardQuizStableId(word, quiz, index) {
      const copy = Object.assign({}, quiz || {});
      delete copy.id;
      const source = String(word || "") + "|" + index + "|" + JSON.stringify(copy);
      let hash = 2166136261;
      for (let i = 0; i < source.length; i++) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return "q_" + (hash >>> 0).toString(36);
    }
    function newCardQuizId() {
      return "q_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
    }
    function plainCardQuizMap(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      const out = {};
      Object.keys(value).forEach((key) => {
        const word = String(key || "").toLowerCase().trim();
        if (!word || !Array.isArray(value[key])) return;
        out[word] = value[key].map((quiz, index) => {
          if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) return quiz;
          const next = Object.assign({}, quiz);
          next.id = String(next.id || cardQuizStableId(word, next, index)).slice(0, 64);
          return next;
        });
      });
      return out;
    }
    function mergeCardQuizMaps(localMap, serverMap) {
      const local = plainCardQuizMap(localMap);
      const server = plainCardQuizMap(serverMap);
      const pending = {};
      syncQueue.forEach((change) => {
        if (!change || change.op !== "put-setting" || change.key !== "cardQuizzes") return;
        const patch = plainCardQuizMap(change.value);
        Object.keys(patch).forEach((key) => { pending[key] = 1; });
      });
      const out = Object.assign({}, server);
      Object.keys(local).forEach((key) => {
        // Remote delete tombstone wins over stale local content.
        if (Array.isArray(server[key]) && server[key].length === 0) {
          out[key] = [];
          return;
        }
        // Stale local tombstone must not wipe newer shared quizzes from another device.
        if (Array.isArray(local[key]) && local[key].length === 0) {
          if (!(key in server)) out[key] = [];
          return;
        }
        // Keep unsynced local edits and local-only orphans; otherwise server wins.
        if (pending[key] || !(key in server)) {
          out[key] = local[key];
          return;
        }
        out[key] = server[key];
      });
      return out;
    }
    function saveCardQuizzes(map) {
      const prev = loadCardQuizzes();
      const next = plainCardQuizMap(map);
      const patch = {};
      const keys = new Set(Object.keys(prev).concat(Object.keys(next)));
      keys.forEach((key) => {
        if (JSON.stringify(next[key] || null) !== JSON.stringify(prev[key] || null)) {
          patch[key] = Array.isArray(next[key]) ? next[key] : [];
        }
      });
      localStorage.setItem(CARD_QUIZ_KEY, JSON.stringify(next));
      // Patch only changed words so a stale local tombstone cannot wipe unrelated shared keys.
      if (Object.keys(patch).length) syncChange({ op: "put-setting", key: "cardQuizzes", value: patch });
    }
    function installCardQuizzes(serverMap) {
      const server = plainCardQuizMap(serverMap);
      // Shared quizzes: server wins for students and while viewing another account.
      // Editors keep non-empty local edits; stale local tombstones do not wipe server content.
      const merged = (!viewAccount && cardQuizCanEdit())
        ? mergeCardQuizMaps(loadCardQuizzes(), server)
        : server;
      try { localStorage.setItem(CARD_QUIZ_KEY, JSON.stringify(merged)); } catch (e) {}
      return merged;
    }
    function cardQuizzesOf(word) {
      const list = loadCardQuizzes()[String(word || "").toLowerCase()];
      return Array.isArray(list) ? list : [];
    }
    function cardQuizLookup(en) {
      const key = String(en || "").toLowerCase();
      if (!key) return null;
      let found = null;
      lessonBanks().some((bank) => {
        const hit = bank.find((card) => cardVisible(card) && String(card.en || "").toLowerCase() === key);
        if (hit) { found = hit; return true; }
        return false;
      });
      if (found) return found;
      const added = loadAdded().find((item) => String(item.word || "").toLowerCase() === key);
      if (!added) return null;
      const cam = added.data && added.data.cambridge ? added.data.cambridge : {};
      return { en: added.word, ru: added.ru || "", pos: cam.pos || "", ex: "", gloss: cam.definition || "" };
    }
    function cardQuizDistractorPool(en, ru) {
      const card = cardQuizLookup(en) || { en: en || "", ru: ru || "", pos: "", ex: "", gloss: "" };
      let pool = cardDeck(card).filter(cardVisible);
      if (pool.length < 4) {
        pool = [];
        lessonBanks().forEach((bank) => {
          bank.forEach((row) => {
            if (cardVisible(row) && row.en) pool.push(row);
          });
        });
      }
      return { card: card, pool: pool };
    }
    function cardQuizPickWrong(pool, field, correct, count) {
      const skip = String(correct || "").trim().toLowerCase();
      const seen = new Set(skip ? [skip] : []);
      const out = [];
      shuffle(pool).forEach((row) => {
        const value = String((row && row[field]) || "").trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        out.push(value);
      });
      return out.slice(0, count);
    }
    function cardQuizShuffledOptions(right, wrongs) {
      const correct = String(right || "").trim();
      const options = shuffle((correct ? [correct] : []).concat(wrongs || []).map((row) => String(row || "").trim()).filter(Boolean));
      if (correct && options.indexOf(correct) < 0) options.unshift(correct);
      while (options.length < 2) options.push("");
      // -1 = no correct option yet (keeps customQuizReady false until the teacher sets one).
      const answer = correct ? Math.max(0, options.indexOf(correct)) : -1;
      return { options: options, answer: answer };
    }
    function cardQuizPrefill(type, en, ru) {
      const bag = cardQuizDistractorPool(en, ru);
      const card = bag.card;
      const pool = bag.pool;
      const item = {};
      if (type === "Flip") {
        item.front = en || "";
        item.back = ru || "";
      } else if (type === "Reverse") {
        item.front = ru || "";
        item.back = en || "";
        const packed = cardQuizShuffledOptions(en || "", cardQuizPickWrong(pool, "en", en, 3));
        item.options = packed.options;
        item.answer = packed.answer;
      } else if (type === "Choice" || type === "Listen") {
        item.prompt = en || "";
        const packed = cardQuizShuffledOptions(ru || "", cardQuizPickWrong(pool, "ru", ru, 3));
        item.options = packed.options;
        item.answer = packed.answer;
        if (type === "Listen") item.word = packed.options[packed.answer] || ru || "";
      } else if (type === "Definition") {
        item.prompt = meaningOf(card) || card.gloss || "";
        const packed = cardQuizShuffledOptions(en || "", cardQuizPickWrong(pool, "en", en, 3));
        item.options = packed.options;
        item.answer = packed.answer;
        item.word = packed.options[packed.answer] || en || "";
      } else if (type === "Type") {
        item.prompt = ru || "";
        item.answer = en || "";
      } else if (type === "Gap") {
        const blank = card.ex ? blankSentence(card.ex, formToken(card) || en || "") : null;
        if (blank) {
          item.shown = blank.shown;
          item.answer = blank.answer;
        } else {
          item.shown = (en || "") + " ___";
          item.answer = en || "";
        }
        item.hint = ru || "";
      } else if (type === "Build") {
        const line = String(card.ex || en || "").trim();
        const parts = line.split(/\s+/).filter(Boolean);
        item.parts = parts.join(" ");
        item.answer = line;
      } else if (type === "Match" || type === "Memory") {
        item.left = en || "";
        item.right = ru || "";
      } else if (type === "True / false") {
        const others = pool.filter((row) => row.ru && !choiceSame(row.ru, ru));
        const lie = others.length > 0 && Math.random() < 0.5;
        const shownRu = lie ? others[Math.floor(Math.random() * others.length)].ru : (ru || "");
        item.prompt = (en || "") + " = " + shownRu;
        item.answer = lie ? "false" : "true";
      } else if (type === "Tap") {
        item.text = card.ex || en || "";
        item.answer = formToken(card) || en || "";
      } else if (type === "Select all") {
        const pos = card.pos || "";
        const same = pool.filter((row) => row.en && row.pos && pos && row.pos === pos);
        const other = pool.filter((row) => row.en && (!pos || row.pos !== pos) && String(row.en).toLowerCase() !== String(en || "").toLowerCase());
        let rights = shuffle([{ en: en || "", pos: pos || "yes" }].concat(same)).filter((row, i, all) =>
          all.findIndex((x) => String(x.en).toLowerCase() === String(row.en).toLowerCase()) === i
        ).slice(0, 2);
        let wrongs = shuffle(other).slice(0, Math.max(2, 4 - rights.length));
        if (rights.length < 1 && en) rights = [{ en: en, pos: "yes" }];
        if (wrongs.length < 1) wrongs = cardQuizPickWrong(pool, "en", en, 2).map((text) => ({ en: text }));
        const mixed = shuffle(rights.concat(wrongs).map((row) => ({ en: row.en || row, mark: rights.some((r) => String(r.en).toLowerCase() === String(row.en || row).toLowerCase()) })));
        item.prompt = pos ? ("Select every " + pos) : "Select all that match";
        item.options = mixed.map((row) => row.en);
        item.answers = mixed.map((row, i) => row.mark ? i : -1).filter((i) => i >= 0);
      } else if (type === "Spell" || type === "Letters" || type === "Hangman") {
        item.word = en || "";
        item.hint = ru || "";
      } else if (type === "Odd one out") {
        const pos = card.pos || "";
        const same = pool.filter((row) => row.en && row.pos && pos && row.pos === pos && String(row.en).toLowerCase() !== String(en || "").toLowerCase());
        const other = pool.filter((row) => row.en && (!pos || row.pos !== pos) && String(row.en).toLowerCase() !== String(en || "").toLowerCase());
        if (same.length >= 2 && other.length) {
          const odd = shuffle(other)[0].en;
          const group = shuffle(same).slice(0, 2).map((row) => row.en).concat([en || ""]);
          item.options = shuffle(group.concat([odd]));
          item.answer = Math.max(0, item.options.indexOf(odd));
        } else {
          // Fallback: keep the card word in the "same" group; a random other word is the odd one.
          const picks = cardQuizPickWrong(pool, "en", en, 4);
          if (en && picks.length >= 3) {
            const odd = picks[0];
            const group = [en].concat(picks.slice(1, 3));
            item.options = shuffle(group.concat([odd]));
            item.answer = Math.max(0, item.options.indexOf(odd));
          } else {
            item.options = [en || "", "", ""];
            item.answer = 0;
          }
        }
      } else {
        item.prompt = en || "";
        item.answer = ru || "";
      }
      return item;
    }
    function cardQuizPrefillItems(type, en, ru) {
      if (type === "Match" || type === "Memory") {
        const bag = cardQuizDistractorPool(en, ru);
        const pairs = [{ left: en || "", right: ru || "" }];
        shuffle(bag.pool.filter((row) => row.en && row.ru && String(row.en).toLowerCase() !== String(en || "").toLowerCase()))
          .slice(0, 3)
          .forEach((row) => pairs.push({ left: row.en, right: row.ru }));
        return pairs;
      }
      return [cardQuizPrefill(type, en, ru)];
    }
    function cardQuizUsesOptions(type) {
      return type === "Choice" || type === "Listen" || type === "Reverse" || type === "Definition" || type === "Select all" || type === "Odd one out";
    }
    function cardQuizOptionsOf(item) {
      const opts = Array.isArray(item && item.options) ? item.options.map((row) => String(row == null ? "" : row)) : [];
      while (opts.length < 2) opts.push("");
      return opts.slice(0, 12);
    }
    function cardQuizOptionLabel(type, index) {
      if (type === "Choice" || type === "Listen") return "Russian option " + (index + 1);
      if (type === "Reverse") return "English option " + (index + 1);
      if (type === "Definition" || type === "Odd one out") return "Word " + (index + 1);
      return "Option " + (index + 1);
    }
    function cardQuizOptionsEditorHtml(quiz, quizIndex) {
      const type = quiz.type || "Choice";
      const item = (quiz.items && quiz.items[0]) || {};
      const opts = cardQuizOptionsOf(item);
      const multi = type === "Select all";
      let html = "";
      if (type === "Choice") {
        html += '<p class="label">English word / prompt</p><input type="text" data-card-quiz-field="prompt" value="' + esc(item.prompt || "") + '" autocomplete="off" />';
      } else if (type === "Listen") {
        html += '<p class="label">English to speak</p><input type="text" data-card-quiz-field="prompt" value="' + esc(item.prompt || "") + '" autocomplete="off" />';
      } else if (type === "Reverse") {
        html += '<p class="label">Shown · Russian</p><input type="text" data-card-quiz-field="front" value="' + esc(item.front || "") + '" autocomplete="off" />';
      } else if (type === "Definition") {
        html += '<p class="label">Definition / meaning</p><input type="text" data-card-quiz-field="prompt" value="' + esc(item.prompt || "") + '" autocomplete="off" />';
      } else if (type === "Select all") {
        html += '<p class="label">Question</p><input type="text" data-card-quiz-field="prompt" value="' + esc(item.prompt || "") + '" autocomplete="off" />';
      }
      html += opts.map((opt, optIndex) =>
        '<div class="card-quiz-opt" data-card-quiz-opt="' + optIndex + '">' +
          '<div class="card-quiz-opt-fields">' +
            '<p class="label">' + esc(cardQuizOptionLabel(type, optIndex)) + "</p>" +
            '<input type="text" data-card-quiz-opt-field value="' + esc(opt) + '" autocomplete="off" />' +
          "</div>" +
          (opts.length > 2
            ? '<button class="icon-btn" type="button" data-card-quiz-opt-del="' + quizIndex + ":" + optIndex + '" aria-label="Remove option">×</button>'
            : "") +
        "</div>"
      ).join("");
      if (opts.length < 12) {
        html += '<button class="btn" type="button" data-card-quiz-opt-add="' + quizIndex + '">+ Add option</button>';
      }
      if (multi) {
        const answers = (item.answers || []).map(Number).filter((n) => Number.isFinite(n) && n >= 0).map((n) => n + 1).join(",");
        html += '<p class="label">Correct option numbers, e.g. 1,3</p><input type="text" data-card-quiz-field="answer" value="' + esc(answers) + '" autocomplete="off" />';
      } else {
        const rawAnswer = Number(item.answer);
        const hasAnswer = Number.isFinite(rawAnswer) && rawAnswer >= 0 && rawAnswer < opts.length;
        const selected = hasAnswer ? rawAnswer : -1;
        html += '<p class="label">' + (type === "Odd one out" ? "Odd one" : "Correct option") + "</p><select data-card-quiz-field=\"answer\">" +
          (hasAnswer ? "" : '<option value="" selected>Choose…</option>') +
          opts.map((_, i) => '<option value="' + (i + 1) + '"' + (i === selected ? " selected" : "") + ">" + (i + 1) + "</option>").join("") +
          "</select>";
      }
      return html;
    }
    function cardQuizFields(type, item) {
      if (type === "Flip") {
        return [
          { key: "front", label: "Front · English", value: item.front || "" },
          { key: "back", label: "Back · Russian", value: item.back || "" }
        ];
      }
      if (type === "Type") {
        return [
          { key: "prompt", label: "Shown · Russian", value: item.prompt || "" },
          { key: "answer", label: "Type · English answer", value: item.answer || "" }
        ];
      }
      if (type === "Gap") {
        return [
          { key: "shown", label: "Sentence with ___", value: item.shown || "" },
          { key: "answer", label: "Missing word", value: item.answer || "" },
          { key: "hint", label: "Hint (optional)", value: item.hint || "" }
        ];
      }
      if (type === "Build") {
        return [
          { key: "parts", label: "Parts to scramble (space-separated)", value: item.parts || "" },
          { key: "answer", label: "Correct sentence / order", value: item.answer || "" }
        ];
      }
      if (type === "Match" || type === "Memory") {
        return [
          { key: "left", label: "Left", value: item.left || "" },
          { key: "right", label: "Right", value: item.right || "" }
        ];
      }
      if (type === "True / false") {
        return [
          { key: "prompt", label: "Statement", value: item.prompt || "" },
          { key: "answer", label: "Answer", value: String(item.answer) === "false" ? "false" : "true", kind: "tf" }
        ];
      }
      if (type === "Tap") {
        return [
          { key: "text", label: "Full sentence", value: item.text || "" },
          { key: "answer", label: "Word to tap", value: item.answer || "" }
        ];
      }
      if (type === "Spell" || type === "Letters" || type === "Hangman") {
        return [
          { key: "word", label: "English word", value: item.word || "" },
          { key: "hint", label: "Hint · Russian (optional)", value: item.hint || "" }
        ];
      }
      return [{ key: "word", label: "Word", value: item.word || "" }];
    }
    function cardQuizPairs(quiz) {
      const items = Array.isArray(quiz && quiz.items) ? quiz.items : [];
      if (items.length) return items.map((row) => ({ left: row.left || "", right: row.right || "" }));
      return [{ left: "", right: "" }];
    }
    function cardQuizPairEditorHtml(quiz, quizIndex) {
      const pairs = cardQuizPairs(quiz);
      const rows = pairs.map((pair, pairIndex) =>
        '<div class="card-quiz-pair" data-card-quiz-pair="' + pairIndex + '">' +
          '<div class="card-quiz-pair-fields">' +
            '<p class="label">Left</p><input type="text" data-card-quiz-pair-field="left" value="' + esc(pair.left) + '" autocomplete="off" />' +
            '<p class="label">Right</p><input type="text" data-card-quiz-pair-field="right" value="' + esc(pair.right) + '" autocomplete="off" />' +
          "</div>" +
          (pairs.length > 1
            ? '<button class="icon-btn" type="button" data-card-quiz-pair-del="' + quizIndex + ':' + pairIndex + '" aria-label="Remove pair">×</button>'
            : "") +
        "</div>"
      ).join("");
      return rows + '<button class="btn" type="button" data-card-quiz-pair-add="' + quizIndex + '">+ Add pair</button>';
    }
    function cardQuizActions(index) {
      if (!cardQuizCanEdit()) return "";
      const pencil = actionIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
      return '<span class="edit-actions card-quiz-actions"><button class="icon-btn" type="button" data-card-quiz-edit="' + index + '" aria-label="Edit">' + pencil + '</button><button class="icon-btn" type="button" data-card-quiz-del="' + index + '" aria-label="Delete">×</button></span>';
    }
    function cardQuizFieldInput(field, index) {
      if (field.kind === "tf") {
        const yes = field.value !== "false";
        return '<p class="label">' + field.label + '</p><select data-card-quiz-field="' + esc(field.key) + '" data-card-quiz-index="' + index + '"><option value="true"' + (yes ? " selected" : "") + '>True</option><option value="false"' + (yes ? "" : " selected") + ">False</option></select>";
      }
      const type = field.kind === "number" ? "number" : "text";
      const extra = field.kind === "number"
        ? ' min="' + (field.min == null ? 1 : field.min) + '" max="' + (field.max == null ? 4 : field.max) + '"'
        : "";
      return '<p class="label">' + field.label + '</p><input type="' + type + '" data-card-quiz-field="' + esc(field.key) + '" data-card-quiz-index="' + index + '" value="' + esc(field.value) + '" autocomplete="off"' + extra + " />";
    }
    function cardQuizPreviewHtml(quiz) {
      const type = quiz.type || "Quiz";
      if (type === "Match" || type === "Memory") {
        return cardQuizPairs(quiz).map((pair) => '<p class="card-quiz-note">' + esc(pair.left) + ' — ' + esc(pair.right) + "</p>").join("");
      }
      const item = (quiz.items && quiz.items[0]) || {};
      if (cardQuizUsesOptions(type)) {
        const prompt = item.prompt || item.front || "";
        const options = cardQuizOptionsOf(item).filter(Boolean);
        return (prompt ? '<p class="card-quiz-note">' + esc(prompt) + "</p>" : "") +
          options.map((option) => '<p class="card-quiz-note">• ' + esc(option) + "</p>").join("");
      }
      return Object.keys(item).filter((key) => key !== "answer" && key !== "answers").map((key) =>
        '<p class="card-quiz-note">' + esc(String(item[key] == null ? "" : item[key])) + "</p>"
      ).join("");
    }
    function cardQuizListHtml(word, editIndex, viewIndex) {
      const list = cardQuizzesOf(word);
      if (!list.length) return "";
      const openAt = editIndex == null || editIndex === "" ? -1 : Number(editIndex);
      const viewAt = viewIndex == null || viewIndex === "" ? -1 : Number(viewIndex);
      return list.map((quiz, index) => {
        const type = quiz.type || "Quiz";
        const head = '<div class="card-quiz-head"><p class="card-quiz-type">' + esc(type) + "</p>" + cardQuizActions(index) + "</div>";
        if (index === viewAt) {
          return '<div class="card-quiz-item" data-card-quiz-index="' + index + '">' + head + cardQuizPreviewHtml(quiz) +
            '<div class="row" style="margin-top:8px"><button class="btn" type="button" data-card-quiz-close>Close</button></div></div>';
        }
        if (index !== openAt) {
          const item = (quiz.items && quiz.items[0]) || {};
          const pairCount = (type === "Match" || type === "Memory") ? cardQuizPairs(quiz).length : 0;
          const optCount = cardQuizUsesOptions(type) ? cardQuizOptionsOf(item).filter(Boolean).length : 0;
          const note = pairCount > 1
            ? '<p class="hint card-quiz-note">' + pairCount + " pairs</p>"
            : (optCount > 2 ? '<p class="hint card-quiz-note">' + optCount + " options</p>" : "");
          return '<div class="card-quiz-item is-collapsed" data-card-quiz-index="' + index + '">' + head + note + "</div>";
        }
        let body = "";
        if (type === "Match" || type === "Memory") body = cardQuizPairEditorHtml(quiz, index);
        else if (cardQuizUsesOptions(type)) body = cardQuizOptionsEditorHtml(quiz, index);
        else body = cardQuizFields(type, (quiz.items && quiz.items[0]) || {}).map((field) => cardQuizFieldInput(field, index)).join("");
        return '<div class="card-quiz-item is-editing" data-card-quiz-index="' + index + '">' + head + body +
          '<div class="row" style="margin-top:8px"><button class="btn primary" type="button" data-card-quiz-save="' + index + '">Done</button></div></div>';
      }).join("");
    }
    function cardQuizHtml(word, en, ru, editIndex, viewIndex) {
      const canEdit = cardQuizCanEdit();
      const list = cardQuizzesOf(word);
      if (!canEdit && !list.length) return "";
      return '<div class="card-quiz-box" data-card-quiz-word="' + esc(String(word || "").toLowerCase()) + '" data-card-quiz-en="' + esc(en || word || "") + '" data-card-quiz-ru="' + esc(ru || "") + '">' +
        cardQuizListHtml(word, editIndex, viewIndex) +
        (canEdit
          ? ('<button class="btn" type="button" data-card-quiz-open>+ Add Quiz</button>' +
            '<div class="card-quiz-picker" hidden><div class="card-quiz-grid">' +
            CARD_QUIZ_TYPES.map((type) => '<button type="button" data-card-quiz-add="' + esc(type) + '">' + esc(type) + "</button>").join("") +
            "</div></div>")
          : "") +
        (list.length ? '<button class="btn primary" type="button" data-card-quiz-study>Study quizzes</button>' : "") +
        "</div>";
    }
    function cardQuizCanEdit() {
      // Shared quizzes: edit only on your own session, never while viewing another account.
      return !viewAccount && !!(authUser && (authUser.role === "ADMIN" || authUser.role === "DEVELOPER"));
    }
    function readCardQuizPairs(itemBox) {
      return [...itemBox.querySelectorAll(".card-quiz-pair")].map((row) => {
        const left = row.querySelector('[data-card-quiz-pair-field="left"]');
        const right = row.querySelector('[data-card-quiz-pair-field="right"]');
        return { left: left ? left.value.trim() : "", right: right ? right.value.trim() : "" };
      });
    }
    function readCardQuizOptions(itemBox) {
      return [...itemBox.querySelectorAll("[data-card-quiz-opt-field]")].map((input) => String(input.value || "").trim());
    }
    function writeCardQuizFromEditor(itemBox, quiz) {
      const type = quiz.type || "Flip";
      if (type === "Match" || type === "Memory") {
        const pairs = readCardQuizPairs(itemBox).filter((row) => row.left || row.right);
        quiz.items = pairs.length ? pairs : [{ left: "", right: "" }];
        return quiz;
      }
      const read = (name) => {
        const input = itemBox.querySelector('[data-card-quiz-field="' + name + '"]');
        return input ? String(input.value || "").trim() : "";
      };
      const item = Object.assign({}, (quiz.items && quiz.items[0]) || {});
      if (cardQuizUsesOptions(type)) {
        const rawOptions = readCardQuizOptions(itemBox);
        const kept = [];
        const oldIndexes = [];
        rawOptions.forEach((text, i) => {
          if (!String(text || "").trim()) return;
          oldIndexes.push(i);
          kept.push(String(text).trim());
        });
        while (kept.length < 2) {
          oldIndexes.push(rawOptions.length + kept.length);
          kept.push("");
        }
        item.options = kept.slice(0, 12);
        // Drop duplicate labels so only one option can be correct by text.
        const seen = new Set();
        const unique = [];
        const remap = [];
        item.options.forEach((text, i) => {
          const key = String(text || "").trim().toLowerCase();
          if (!key || seen.has(key)) {
            remap[i] = -1;
            return;
          }
          seen.add(key);
          remap[i] = unique.length;
          unique.push(text);
        });
        while (unique.length < 2) unique.push("");
        item.options = unique.slice(0, 12);
        if (type === "Reverse") item.front = read("front");
        else if (type !== "Odd one out") item.prompt = read("prompt");
        if (type === "Select all") {
          const picked = String(read("answer") || "").split(",").map((n) => Number(n.trim()) - 1).filter((n) => Number.isFinite(n) && n >= 0);
          item.answers = picked
            .map((old) => {
              const keptAt = oldIndexes.indexOf(old);
              return keptAt >= 0 ? remap[keptAt] : -1;
            })
            .filter((n) => n >= 0 && n < item.options.length);
        } else {
          const rawAnswer = read("answer");
          if (!rawAnswer) {
            item.answer = -1;
            if (type === "Reverse") item.back = "";
            if (type === "Definition" || type === "Listen") item.word = "";
          } else {
            const old = Number(rawAnswer) - 1;
            let mapped = Number.isFinite(old) ? oldIndexes.indexOf(old) : -1;
            if (mapped >= 0) mapped = remap[mapped];
            item.answer = (mapped >= 0 && mapped < item.options.length) ? mapped : -1;
            if (type === "Reverse") item.back = item.answer >= 0 ? (item.options[item.answer] || "") : "";
            if (type === "Definition" || type === "Listen") item.word = item.answer >= 0 ? (item.options[item.answer] || "") : "";
          }
        }
        quiz.items = [item];
        return quiz;
      }
      if (type === "Flip") {
        item.front = read("front");
        item.back = read("back");
      } else if (type === "Type") {
        item.prompt = read("prompt");
        item.answer = read("answer");
      } else if (type === "Gap") {
        item.shown = read("shown");
        item.answer = read("answer");
        item.hint = read("hint");
      } else if (type === "Build") {
        item.parts = read("parts");
        item.answer = read("answer");
      } else if (type === "True / false") {
        item.prompt = read("prompt");
        item.answer = read("answer") === "false" ? "false" : "true";
      } else if (type === "Tap") {
        item.text = read("text");
        item.answer = read("answer");
      } else {
        item.word = read("word");
        item.hint = read("hint");
      }
      quiz.items = [item];
      return quiz;
    }
    function handleCardQuizClick(e) {
      const openBtn = e.target.closest("[data-card-quiz-open]");
      if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        const box = openBtn.closest(".card-quiz-box");
        if (!box) return true;
        const picker = box.querySelector(".card-quiz-picker");
        if (picker) picker.hidden = !picker.hidden;
        return true;
      }
      const studyBtn = e.target.closest("[data-card-quiz-study]");
      if (studyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const box = studyBtn.closest(".card-quiz-box");
        if (!box) return true;
        const en = box.dataset.cardQuizEn || box.dataset.cardQuizWord || "";
        const ru = box.dataset.cardQuizRu || "";
        const looked = cardQuizLookup(en) || {};
        const card = {
          en: looked.en || en,
          ru: looked.ru || ru,
          pos: looked.pos || "",
          uk: looked.uk || "",
          us: looked.us || "",
          ex: looked.ex || "",
          gloss: looked.gloss || ""
        };
        openListedStudy([card], (en || "Card") + " quizzes", (document.querySelector("section.on") || {}).id || "home");
        return true;
      }
      const addBtn = e.target.closest("[data-card-quiz-add]");
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = addBtn.closest(".card-quiz-box");
        if (!box) return true;
        const word = box.dataset.cardQuizWord || "";
        const type = addBtn.getAttribute("data-card-quiz-add") || "";
        const map = loadCardQuizzes();
        const key = String(word || "").toLowerCase();
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        list.push({ id: newCardQuizId(), type: type, items: cardQuizPrefillItems(type, box.dataset.cardQuizEn || word, box.dataset.cardQuizRu || "") });
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box, list.length - 1);
        return true;
      }
      const editBtn = e.target.closest("[data-card-quiz-edit]");
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = editBtn.closest(".card-quiz-box");
        if (!box) return true;
        refreshCardQuizBox(box, Number(editBtn.getAttribute("data-card-quiz-edit")));
        return true;
      }
      const closeBtn = e.target.closest("[data-card-quiz-close]");
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        refreshCardQuizBox(closeBtn.closest(".card-quiz-box"));
        return true;
      }
      const collapsedQuiz = e.target.closest(".card-quiz-item.is-collapsed");
      if (collapsedQuiz && !e.target.closest(".edit-actions")) {
        e.preventDefault();
        e.stopPropagation();
        const box = collapsedQuiz.closest(".card-quiz-box");
        if (box) refreshCardQuizBox(box, null, Number(collapsedQuiz.dataset.cardQuizIndex));
        return true;
      }
      const pairAdd = e.target.closest("[data-card-quiz-pair-add]");
      if (pairAdd) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = pairAdd.closest(".card-quiz-box");
        const itemBox = pairAdd.closest(".card-quiz-item");
        if (!box || !itemBox) return true;
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const index = Number(pairAdd.getAttribute("data-card-quiz-pair-add"));
        const map = plainCardQuizMap(loadCardQuizzes());
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const quiz = list[index];
        if (!quiz) return true;
        writeCardQuizFromEditor(itemBox, quiz);
        quiz.items = cardQuizPairs(quiz).concat([{ left: "", right: "" }]);
        list[index] = quiz;
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box, index);
        return true;
      }
      const pairDel = e.target.closest("[data-card-quiz-pair-del]");
      if (pairDel) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = pairDel.closest(".card-quiz-box");
        const itemBox = pairDel.closest(".card-quiz-item");
        if (!box || !itemBox) return true;
        const bits = String(pairDel.getAttribute("data-card-quiz-pair-del") || "").split(":");
        const index = Number(bits[0]);
        const pairIndex = Number(bits[1]);
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const map = loadCardQuizzes();
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const quiz = list[index];
        if (!quiz) return true;
        writeCardQuizFromEditor(itemBox, quiz);
        const pairs = cardQuizPairs(quiz);
        if (pairs.length <= 1) return true;
        pairs.splice(pairIndex, 1);
        quiz.items = pairs;
        list[index] = quiz;
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box, index);
        return true;
      }
      const optAdd = e.target.closest("[data-card-quiz-opt-add]");
      if (optAdd) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = optAdd.closest(".card-quiz-box");
        const itemBox = optAdd.closest(".card-quiz-item");
        if (!box || !itemBox) return true;
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const index = Number(optAdd.getAttribute("data-card-quiz-opt-add"));
        const map = loadCardQuizzes();
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const quiz = list[index];
        if (!quiz) return true;
        writeCardQuizFromEditor(itemBox, quiz);
        const item = (quiz.items && quiz.items[0]) || {};
        const options = cardQuizOptionsOf(item);
        if (options.length >= 12) return true;
        options.push("");
        item.options = options;
        quiz.items = [item];
        list[index] = quiz;
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box, index);
        return true;
      }
      const optDel = e.target.closest("[data-card-quiz-opt-del]");
      if (optDel) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = optDel.closest(".card-quiz-box");
        const itemBox = optDel.closest(".card-quiz-item");
        if (!box || !itemBox) return true;
        const bits = String(optDel.getAttribute("data-card-quiz-opt-del") || "").split(":");
        const index = Number(bits[0]);
        const optIndex = Number(bits[1]);
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const map = loadCardQuizzes();
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const quiz = list[index];
        if (!quiz) return true;
        writeCardQuizFromEditor(itemBox, quiz);
        const item = (quiz.items && quiz.items[0]) || {};
        const options = cardQuizOptionsOf(item);
        if (options.length <= 2 || !Number.isFinite(optIndex) || optIndex < 0 || optIndex >= options.length) return true;
        options.splice(optIndex, 1);
        item.options = options;
        if (quiz.type === "Select all") {
          item.answers = (item.answers || [])
            .map((n) => {
              const a = Number(n);
              if (!Number.isFinite(a) || a === optIndex) return -1;
              return a > optIndex ? a - 1 : a;
            })
            .filter((n) => n >= 0 && n < options.length);
        } else {
          let answer = Number(item.answer);
          if (!Number.isFinite(answer) || answer < 0) {
            item.answer = -1;
          } else if (answer === optIndex) {
            item.answer = -1;
          } else {
            if (answer > optIndex) answer -= 1;
            item.answer = (answer >= 0 && answer < options.length) ? answer : -1;
          }
          if (quiz.type === "Reverse") item.back = item.answer >= 0 ? (options[item.answer] || "") : "";
          if (quiz.type === "Definition" || quiz.type === "Listen") item.word = item.answer >= 0 ? (options[item.answer] || "") : "";
        }
        quiz.items = [item];
        list[index] = quiz;
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box, index);
        return true;
      }
      const delBtn = e.target.closest("[data-card-quiz-del]");
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = delBtn.closest(".card-quiz-box");
        if (!box) return true;
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const map = plainCardQuizMap(loadCardQuizzes());
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const index = Number(delBtn.getAttribute("data-card-quiz-del"));
        const quiz = list[index];
        if (!quiz) return true;
        const quizId = String(quiz.id || cardQuizStableId(key, quiz, index));
        list.splice(index, 1);
        map[key] = list;
        localStorage.setItem(CARD_QUIZ_KEY, JSON.stringify(plainCardQuizMap(map)));
        syncChange({ op: "delete-card-quiz", word: key, quizId: quizId });
        refreshCardQuizBox(box);
        return true;
      }
      const saveBtn = e.target.closest("[data-card-quiz-save]");
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!cardQuizCanEdit()) return true;
        const box = saveBtn.closest(".card-quiz-box");
        const itemBox = saveBtn.closest(".card-quiz-item");
        if (!box || !itemBox) return true;
        const key = String(box.dataset.cardQuizWord || "").toLowerCase();
        const index = Number(saveBtn.getAttribute("data-card-quiz-save"));
        const map = loadCardQuizzes();
        const list = Array.isArray(map[key]) ? map[key].slice() : [];
        const quiz = list[index];
        if (!quiz) return true;
        writeCardQuizFromEditor(itemBox, quiz);
        list[index] = quiz;
        map[key] = list;
        saveCardQuizzes(map);
        refreshCardQuizBox(box);
        return true;
      }
      return false;
    }
    function addedRow(item, index) {
      const main = '<button class="path" type="button" data-added="' + index + '"><b>' + esc(item.word) + '</b><span class="to">' + esc(item.ru) + "</span></button>";
      if (!canEditAdded(item)) return main;
      return '<div data-edit-host data-edit-kind="added" data-edit-id="' + index + '"><div class="edit-line">' + main + editActions(true) + '</div></div>';
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
      paintGuide();
    });
    document.getElementById("dayFlipBtn").onclick = () => setDayFlip(current, !dayFlipped);
    const dayFlipScene = document.getElementById("dayFlipScene");
    if (dayFlipScene) {
      dayFlipScene.addEventListener("click", (e) => {
        if (e.target.closest("[data-day-flip-rate]")) {
          const deck = cardDeck(current);
          const index = deck.findIndex((item) => item.en === current.en);
          if (index >= 0 && index + 1 < deck.length) {
            setDayFlip(deck[index + 1], false);
          } else {
            setDayFlip(current, false);
          }
          return;
        }
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
    if (words[0]) renderWord(words[0]);
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
      const titleEl = document.getElementById("musicTitle");
      if (titleEl && w) titleEl.textContent = w.en;
      const viewEl = document.getElementById("musicView");
      if (viewEl && w) {
        viewEl.innerHTML =
          catalogEditHtml(w) +
          '<div class="word-head">' + wordPic(w.en, true) + '<div><p class="entry">' + esc(w.en) + '</p><p class="pos">' + esc(w.pos) + '</p></div></div>' +
          ipaHtml(w) +
          (w.level ? '<p><span class="level">' + esc(w.level) + '</span></p>' : '') +
          '<p><b>' + esc(w.ru) + '</b></p>' + clipLine(clipOf({ en: w.en, ex: w.ex })) + '<p>In the line: ' + esc(w.ex) + '</p>' +
          "<p>" + cardLinks(w.en, w.url) + "</p>" +
          '<p class="hint">This card is not in the decks or the lesson days, so it lives only in Song lyrics.</p>' +
          '<div class="row" style="margin-top:12px"><button class="btn saas-btn" type="button" data-usages="' + esc(w.en) + '" data-usages-ru="' + esc(w.ru) + '">Usages</button></div>' +
          cardQuizHtml(cardQuizKey(w), w.en, w.ru);
      }
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
    window.findCatalog = findCatalog;
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
        if (!viewAccount) idbPutAdded(list);
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
        return list.filter(cardVisible);
      } catch (e) { return (addedCache || []).filter(cardVisible); }
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
    const PLACE_LABEL = { "lesson-23": "23 Sep", "lesson-21": "21 Sep", "lesson-16": "16 Sep", "lesson-14": "14 Sep", "lesson-09": "9 Sep", "lesson-07": "7 Sep", music: "Song lyrics", tenses: "Grammar", mine: "My cards", text: "Text", phrasal: "Phrasal verbs", idioms: "Idioms" };
    Object.assign(PLACE_LABEL,{chat:'Chat','chat-phrasal':'Phrasal verbs','chat-idioms':'Idioms'});
    function cardOrigin(item) {
      if(String(item?.place||'').startsWith('chat'))return 'From chat';
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
      let pos = item.data && item.data.cambridge && item.data.cambridge.pos ? item.data.cambridge.pos : item.pos || "added";
      if (item.fromText) pos = item.expressionType === "PHRASAL_VERB" ? "phrasal verb" : item.expressionType === "IDIOM" ? "idiom" : "expression";
      const origin = cardOrigin(item) || addedPlaceName(item);
      const label = item.ru || expressionNote(item);
      const card = '<button class="wcard" type="button" data-added="' + index + '">' + wordPic(item.word) + '<div class="en">' + esc(item.word) + '</div><div class="pos">' + esc(pos) + '</div>' + ipaHtml(item) + '<div class="label">' + esc(label) + "</div>" + (origin ? '<div class="label">' + esc(origin) + "</div>" : "") + "</button>";
      if (!canEditAdded(item)) return card;
      return '<div class="wcard-tools" data-edit-host data-edit-kind="added" data-edit-id="' + index + '">' + card + editActions() + "</div>";
    }
    function paintPlace(place, boxId, labelId) {
      const box = document.getElementById(boxId);
      if (!box) return;
      const list = loadAdded();
      const html = list.map((item,index)=>({item,index})).filter(({item})=>(item.place||'mine')===place||item.place==='chat-'+place).sort((a,b)=>['phrasal','idioms'].includes(place)?a.item.word.localeCompare(b.item.word,'en',{sensitivity:'base'}):0).map(({item,index})=>addedCard(item,index)).join('');
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
        document.getElementById("allWordGrid").innerHTML = rows.length ? rows.map(row=>statRow(row,true)).join("") : '<p class="hint">No cards</p>';
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
      if (section.id === "phrasal" || section.id === "idioms") {
        paintDeckGrids(section.id);
        let shown = 0;
        section.querySelectorAll(".wcard").forEach((el) => {
          const hide = el.textContent.toLowerCase().indexOf(q) < 0;
          el.hidden = hide;
          if (!hide) shown += 1;
        });
        let empty = section.querySelector("[data-deck-empty]");
        if (!shown) {
          if (!empty) {
            empty = document.createElement("p");
            empty.className = "hint";
            empty.dataset.deckEmpty = "";
            section.appendChild(empty);
          }
          empty.textContent = "No cards";
          empty.hidden = false;
        } else if (empty) empty.hidden = true;
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
      const empty = section.querySelector("[data-deck-empty]");
      if (empty && !q) empty.hidden = true;
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
      words.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "Lessons", "word", w.en); });
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
        const place = item.place || "mine";
        if (hideStudentSongs() && place === "music") return;
        const where = place==='chat'?'Chat':place==='chat-phrasal'?'Phrasal verbs':place==='chat-idioms'?'Idioms':item.fromText && place === "mine" ? "Text" : (PLACE_LABEL[place] || "My cards");
        add(item.word, item.ru, where, "added", item.word);
        if(place.startsWith('chat'))add(item.word,item.ru,'From chat','added',item.word);
      });
      if(typeof stageEssentialCollect==='function')stageEssentialCollect(rows);
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
      return name === "Lessons" || name === "7 Sep" || name === "9 Sep" || name === "14 Sep" || name === "16 Sep" || name === "21 Sep" || name === "23 Sep";
    }
    function sourceRank(name) {
      if (name === "7 Sep") return 0;
      if (name === "9 Sep") return 1;
      if (name === "14 Sep") return 2;
      if (name === "16 Sep") return 3;
      if (name === "Lessons") return 4;
      if (name === "23 Sep") return 5;
      if (name === "Additional words") return 5.5;
      if (name === "Grammar") return 6;
      if (name === "Song lyrics") return 7;
      if (name === "My words" || name === "My cards") return 8;
      if (name === "Phrasal verbs") return 8.2;
      if (name === "Idioms") return 8.4;
      if (name === "Irregular verbs") return 8.6;
      if(name==='Chat')return 10;
      if(name==='Essential English')return 11;
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
    function mistakeRowsFor(en) {
      const id = String(en || "").trim().toLowerCase();
      if (!id) return [];
      return Object.values(loadMistakeMap()).filter((row) => row && !row.cleared && Number(row.misses) > 0 && String(row.en || "").trim().toLowerCase() === id);
    }
    function mistakeBits(rows) {
      const counts = {};
      rows.forEach((row) => mistakeRowsFor(row.en).forEach((miss) => {
        const type = String(miss.type || "Quiz");
        counts[type] = (counts[type] || 0) + Number(miss.misses);
      }));
      return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).map((type) => type + " · " + counts[type]);
    }
    function statRow(row, linkSources=false) {
      const bits = statKind === "weak" ? mistakeBits([row]) : [];
      const side = bits.length ? bits.join(", ") : row.where.join(" · ");
      if(linkSources===true&&typeof stageWordSources==='function')return '<div class="path word-source-row saas-card"><div class="word-source-main"><div class="word-source-head"><button class="word-source-title" type="button" data-all-kind="'+row.kind+'" data-all-key="'+esc(row.key)+'">'+esc(row.en)+'</button><span class="to word-source-links">'+stageWordSources(row).map(source=>'<a href="#'+esc(source.page)+'" data-word-source="'+esc(JSON.stringify(source))+'">'+esc(source.label)+'</a>').join('')+'</span></div>'+ipaHtml(rowToCard(row))+'<div class="word-source-translation label">'+esc(row.ru)+'</div></div></div>';
      return '<button class="path" type="button" data-all-kind="' + row.kind + '" data-all-key="' + esc(row.key) + '"><span><b>' + esc(row.en) + '</b>' + ipaHtml(rowToCard(row)) + '<br><span class="label">' + esc(row.ru) + '</span></span><span class="to">' + esc(side) + "</span></button>";
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
          const bits = statKind === "weak" ? mistakeBits(map[name]) : [];
          const about = count + (count === 1 ? " word" : " words") + (bits.length ? " · " + bits.join(", ") : "");
          return '<button class="day active" type="button" data-stat-group="' + esc(name) + '"><span class="date">' + (index + 1) + '</span><span class="song-line"><b>' + esc(name) + '</b></span><span class="label about">' + esc(about) + "</span></button>";
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
      const rows = [];
      const seen = {};
      function add(en, ru, where, kind, key) {
        const id = String(en || "").trim().toLowerCase();
        if (!id || seen[id]) return;
        seen[id] = 1;
        rows.push({ en: en, ru: ru || "", where: [where], kind: kind, key: key || en });
      }
      ask07.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "7 Sep", "ask", w.en); });
      words.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "Lessons", "word", w.en); });
      lines21.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru, "21 Sep", "line", w.en); });
      phrases09.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "9 Sep", "phrase", w.en); });
      adverbs14.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "14 Sep", "adverb", w.en); });
      talk16.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "16 Sep", "talk", w.en); });
      likes23.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "23 Sep", "like", w.en); });
      phrasalWords.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "Phrasal verbs", "phrasal", w.en); });
      idiomWords.forEach((w) => { if (cardVisible(w)) add(w.en, w.ru || w.gloss, "Idioms", "idiom", w.en); });
      const homePlace = { mine: "My cards", phrasal: "Phrasal verbs", idioms: "Idioms", "chat-phrasal":"Phrasal verbs","chat-idioms":"Idioms", "lesson-07": "7 Sep", "lesson-09": "9 Sep", "lesson-14": "14 Sep", "lesson-16": "16 Sep", "lesson-21": "21 Sep", "lesson-23": "23 Sep" };
      loadAdded().forEach((item) => {
        const place = item.place || "mine";
        if (item.fromText || !homePlace[place]) return;
        add(item.word, item.ru, homePlace[place], "added", item.word);
      });
      return rows;
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
        if(!map.Chat){map.Chat=[];names.push('Chat');names.sort((a,b)=>sourceRank(a)-sourceRank(b)||a.localeCompare(b));}
        const essential=rows.filter(row=>row.where.includes('Essential English'));map['Essential English']=essential;
        if(!names.includes('Essential English'))names.push('Essential English');
        if (title) title.textContent = "All words · " + rows.length;
        if (sub) { sub.hidden = false; sub.textContent = "Every word card, once. The line under a word shows where it lives."; }
        box.innerHTML = names.map((name, index) => {
          const n = map[name].length;
          return '<button class="day active saas-card" type="button" data-all-group="' + esc(name) + '"><span class="date saas-badge saas-badge-muted">' + (name==='Essential English'?8:index+1) + '</span><span class="song-line"><b>' + esc(name) + '</b></span><span class="label about saas-badge saas-badge-info">' + n + (n === 1 ? " word" : " words") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const shown = rows.filter((row) => allGroup==='Essential English'?row.where.includes(allGroup):sourceName(row) === allGroup);
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
      box.innerHTML = words.map(row=>allGroup==='Essential English'?statRow({...row,kind:'essential',key:String(rowToCard(row)?.stageId)},true):statRow(row,true)).join("");
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
      return PLACE_LABEL[item.place] || "My cards";
    }
    function ownMine(item) {
      return !!item && (item.place || "mine") === "mine" && !item.fromText;
    }
    function renderAddedList() {
      const list = loadAdded();
      const box = document.getElementById("addedList");
      const title = document.querySelector("#add h1");
      const groupAdd = document.getElementById("groupAdd");
      if (groupAdd) {
        groupAdd.hidden = false;
        groupAdd.dataset.place = "mine";
        const addInput = groupAdd.querySelector("[data-add-input]");
        if (addInput) addInput.placeholder = "a word or a phrase";
      }
      if (!box) return;
      const shown = [];
      list.forEach((item, index) => {
        if (ownMine(item)) shown.push({ item: item, index: index });
      });
      if (title) title.textContent = shown.length ? "My cards · " + shown.length : "My cards";
      box.classList.add('words');box.classList.remove('paths');
      shown.sort((a,b)=>a.item.word.localeCompare(b.item.word,'en',{sensitivity:'base'}));
      box.innerHTML = shown.map(({ item, index }) => addedCard(item, index)).join("");
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
