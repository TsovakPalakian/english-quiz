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
        return withStage({
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
        }, v);
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
        box.className='decks';
        if (title) title.textContent = "Irregular verbs · " + list.length;
        if (sub) {
          sub.hidden = false;
          sub.textContent = "Five levels by how often the verb is used. Levels 1–3 follow a corpus ranking, and be, have and do are in level 1. Each row is the base form, the past and the past participle. Open a row for three cards, one form each. Modals are not listed: they have no past participle. A prefix that only repeats its root, such as overbuild, is not a separate card.";
        }
        box.innerHTML = VERB_LEVELS.map((pair, index) => {
          const n = list.filter((v) => v.level === pair[0] && cardVisible(v)).length;
          return '<button class="file-card" type="button" data-verb-level="' + pair[0] + '"><span class="num">' + (index + 1) + '</span><b>' + esc(pair[1]) + '</b><span class="label">' + n + (n === 1 ? " verb" : " verbs") + "</span></button>";
        }).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const level = VERB_LEVELS.find((pair) => pair[0] === verbGroup);
      const shown = list.filter((v) => v.level === verbGroup && cardVisible(v));
      if (!verbKey) {
        box.className='words';
        if (title) title.textContent = (level ? level[1] : "Irregular verbs") + " · " + shown.length;
        if (sub) sub.hidden = true;
        box.innerHTML = shown.slice().sort((a,b)=>a.base.localeCompare(b.base,'en')).map((v) =>
          '<button class="wcard" type="button" data-verb="' + esc(v.base) + '">'+wordPic(v.base)+'<div class="en">' + esc(v.base) + '</div><div class="pos">verb</div>'+ipaHtml(verbSay(v,'v1',v.base))+'<div class="label">' + esc(v.past) + " · " + esc(v.pp) + '</div><div class="label">' + esc(verbMeaning(v)) + "</div></button>"
        ).join("");
        applyCardSearch(box.closest("section"));
        return;
      }
      const v = shown.find((item) => item.base === verbKey) || (window.IRREGULAR || []).find((item) => item.base === verbKey);
      box.className='words verb-form-cards';
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
      const text = String(sentence || "");
      const token = String(word || "").trim();
      if (!text || !token) return null;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + escaped + "\\b", "i");
      const found = text.match(re);
      if (!found) return null;
      return { shown: text.replace(re, "____"), answer: found[0] };
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
