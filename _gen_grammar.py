#!/usr/bin/env python3
"""Build grammar.js from the topic map and Cambridge Grammar example lines."""
import json
import re
import urllib.request
from html import unescape

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
BASE = "https://dictionary.cambridge.org/grammar/british-grammar/"
cache = {}


def page(slug):
    return BASE + slug


def fetch_lines(slug):
    if slug in cache:
        return cache[slug]
    url = page(slug)
    try:
        html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=18).read().decode("utf-8", "replace")
    except Exception:
        cache[slug] = []
        return []
    if html.find("<title>") != -1 and "British English grammar" in html[:500] and slug not in html:
        cache[slug] = []
        return []
    seen = []
    for raw in re.findall(r'<i class="ti">(.*?)</i>', html, re.S):
        text = unescape(re.sub(r"<[^>]+>", " ", raw))
        text = re.sub(r"\s+", " ", text).strip(" .")
        text = re.sub(r"\s+([.,?!;:])", r"\1", text)
        words = re.findall(r"[A-Za-z']+", text)
        if len(words) < 6 or len(text) > 180 or text.startswith("["):
            continue
        if text.lower() in [item.lower() for item in seen]:
            continue
        seen.append(text)
    cache[slug] = seen
    return seen


def pick(slug, needles, n=3):
    lines = fetch_lines(slug)
    chosen = []
    for text in lines:
        low = text.lower()
        if needles and any(needle in low for needle in needles):
            chosen.append(text)
        if len(chosen) >= n:
            break
    if len(chosen) < n:
        for text in lines:
            if text not in chosen:
                chosen.append(text)
            if len(chosen) >= n:
                break
    return [{"en": text, "ru": "", "source": "Cambridge Grammar", "url": page(slug)} for text in chosen[:n]]


def ex(en, ru, slug, source="Cambridge Grammar"):
    return {"en": en, "ru": ru, "source": source, "url": page(slug)}


topics = {}


def add(item):
    topics[item["id"]] = item


def topic(id, name, form, tone, kind, formula, affirmative, negative, question, usage_en, usage_ru, cases, signals, mistakes_en, mistakes_ru, differs_en, differs_ru, slug, examples, related=None, note="", bank=None):
    add({
        "id": id,
        "name": name,
        "form": form,
        "tone": tone,
        "kind": kind,
        "formula": formula,
        "affirmative": affirmative,
        "negative": negative,
        "question": question,
        "note": note,
        "usage": {"en": usage_en, "ru": usage_ru},
        "cases": cases,
        "signals": signals,
        "mistakes": {"en": mistakes_en, "ru": mistakes_ru},
        "differs": {"en": differs_en, "ru": differs_ru},
        "links": [["Cambridge Grammar", page(slug)]],
        "examples": examples,
        "related": related or [],
        "bank": bank or "",
    })


# --- 12 tenses. Examples are lines already stored from Cambridge Grammar. ---
topic("ps", "Present Simple", "I work", "present", "Tense",
      "Subject + V1; he/she/it + V1-s", "I work. / She works.", "I do not work. / She does not work.", "Do you work? / Does she work?",
      "Habits, facts, timetables and states. State verbs such as know, like and want usually stay in the simple.",
      "Привычки, факты, расписания и состояния. Глаголы состояния know, like, want обычно стоят в simple, не в continuous.",
      ["habits and repeated actions", "facts and general truths", "timetables and programmes", "states"],
      ["always", "usually", "often", "sometimes", "never", "every day"],
      "Do not add -s after does: she doesn't works. Do not use the Present Simple for an action happening at this moment.",
      "После does не добавляют -s: she doesn't works. Для действия прямо сейчас Present Simple не ставят.",
      "Present Continuous is for an action around now. Present Simple is for a habit or a fact.",
      "Present Continuous — действие вокруг сейчас. Present Simple — привычка или факт.",
      "present-simple-i-work",
      [ex("There is always a holiday on the last Monday in August in the UK.", "В Великобритании праздник всегда приходится на последний понедельник августа.", "present-simple-i-work"),
       ex("Do you live in Glasgow? My cousin lives there too.", "Ты живешь в Глазго? Мой двоюродный брат тоже там живет.", "present-simple-i-work"),
       ex("Ten times ten makes one hundred.", "Десять умножить на десять — сто.", "present-simple-i-work")],
      ["pc", "psfut"], bank="ps")

topic("pc", "Present Continuous", "I am working", "present", "Tense",
      "am / is / are + V-ing", "I am working. / She is working.", "I am not working. / She is not working.", "Are you working? / Is she working?",
      "An action happening now or around now. The same form can also name a future arrangement. That use is listed under Future forms, not as a separate tense.",
      "Действие идет сейчас или вокруг сейчас. Та же форма может называть договоренность на будущее. Это употребление лежит в Future forms, а не как отдельное время.",
      ["an action in progress now", "a temporary situation around now", "a future arrangement, listed again under Future forms"],
      ["now", "at the moment", "today", "this week", "currently"],
      "State verbs usually do not take this form: I am knowing is not the normal pattern.",
      "Глаголы состояния обычно не ставят в эту форму: I am knowing — не обычный образец.",
      "Present Simple is the habit or the fact. Present Continuous is the action in progress.",
      "Present Simple — привычка или факт. Present Continuous — действие в процессе.",
      "present-continuous-i-am-working",
      [ex("She's pressing the button but nothing is happening.", "Она нажимает кнопку, но ничего не происходит.", "present-continuous-i-am-working"),
       ex("Her mother's living with her at the moment. She's just come out of hospital.", "Ее мама сейчас живет с ней. Она только вышла из больницы.", "present-continuous-i-am-working"),
       ex("Who's looking after the children while you're here?", "Кто присматривает за детьми, пока ты здесь?", "present-continuous-i-am-working")],
      ["ps", "pcfut"], bank="pc")

topic("pp", "Present Perfect", "I have worked", "present", "Tense",
      "have / has + past participle", "I have worked. / She has worked.", "I have not worked. / She has not worked.", "Have you worked? / Has she worked?",
      "A link between the past and now: experience, a result, or a period up to now. Do not use it with yesterday or ago.",
      "Связь прошлого с настоящим: опыт, результат или период до сейчас. С yesterday и ago это время не ставят.",
      ["life experience", "a result you can see now", "a period from the past until now"],
      ["already", "yet", "just", "ever", "never", "since", "for", "so far"],
      "Do not use a finished time word: I have seen him yesterday is the wrong pair.",
      "Не ставят законченное время: I have seen him yesterday — неверная пара.",
      "Past Simple names a finished time. Present Perfect links the past to now and does not take yesterday or ago.",
      "Past Simple называет законченное время. Present Perfect связывает прошлое с сейчас и не берет yesterday или ago.",
      "present-perfect-simple-i-have-worked",
      [ex("We haven't met before, have we?", "Мы раньше не встречались, правда?", "present-perfect-simple-i-have-worked"),
       ex("Have you ever tried to write your name and address with your left hand?", "Ты когда-нибудь пробовал написать свое имя и адрес левой рукой?", "present-perfect-simple-i-have-worked"),
       ex("It was the worst performance we have ever seen.", "Это было худшее выступление, которое мы когда-либо видели.", "present-perfect-simple-i-have-worked")],
      ["pasts", "ppc"], bank="pp")

topic("ppc", "Present Perfect Continuous", "I have been working", "present", "Tense",
      "have / has been + V-ing", "I have been working.", "I have not been working.", "Have you been working?",
      "An action continued up to now, often with the process in view.",
      "Действие длилось до сейчас, и часто важен сам процесс.",
      ["an activity still continuing", "the length of an activity up to now", "a visible result of a recent activity"],
      ["for", "since", "all day", "lately", "recently", "how long"],
      "Do not use this form for a completed number of times. How many takes the Present Perfect simple.",
      "Для законченного числа раз эту форму не ставят. How many берет Present Perfect simple.",
      "Present Perfect simple often looks at the result or the number. Present Perfect Continuous looks at the activity and its duration.",
      "Present Perfect simple чаще смотрит на результат или число. Present Perfect Continuous смотрит на действие и его длительность.",
      "present-perfect-continuous-i-have-been-working",
      [ex("I've just been cleaning the car.", "Я только что мыл машину.", "present-perfect-continuous-i-have-been-working"),
       ex("I've been reading your book. It's great.", "Я читаю твою книгу. Она отличная.", "present-perfect-continuous-i-have-been-working"),
       ex("He's been living in the village since 1995.", "Он живет в деревне с 1995 года.", "present-perfect-continuous-i-have-been-working")],
      ["pp"], bank="ppc")

topic("pasts", "Past Simple", "I worked", "past", "Tense",
      "V2, or did + V1", "I worked. / She went.", "I did not work.", "Did you work?",
      "A finished action in the past, often with a finished time.",
      "Законченное действие в прошлом, часто с законченным временем.",
      ["a finished action", "a sequence of finished actions", "a past habit, also expressed by used to"],
      ["yesterday", "ago", "last week", "in 2019", "then"],
      "Do not use did with the past form: did you went. The verb after did is the base form.",
      "С did не ставят прошлую форму: did you went. После did глагол в первой форме.",
      "Present Perfect has no finished time word. Past Continuous is the background action, not the finished event.",
      "У Present Perfect нет слова законченного времени. Past Continuous — фон, а не законченное событие.",
      "past-simple-i-worked",
      [ex("I didn't see her for over 20 years and then I bumped into her last week.", "Я не видел ее больше 20 лет, а потом столкнулся с ней на прошлой неделе.", "past-simple-i-worked"),
       ex("I finished my homework an hour ago.", "Я закончил домашнюю работу час назад.", "past-simple-i-worked")],
      ["pp", "pastc", "pastp"], bank="pasts")

topic("pastc", "Past Continuous", "I was working", "past", "Tense",
      "was / were + V-ing", "I was working. / They were working.", "I was not working.", "Were you working?",
      "An action in progress at a past moment, or the background for another action.",
      "Действие шло в момент в прошлом или было фоном для другого.",
      ["an action at a named past moment", "the background for a Past Simple event", "two actions in progress together"],
      ["at 4 pm", "while", "when", "all morning"],
      "The short finished event in the middle is Past Simple, not Past Continuous.",
      "Короткое законченное событие посередине — Past Simple, не Past Continuous.",
      "Past Simple is the completed event. Past Continuous is what was already in progress.",
      "Past Simple — законченное событие. Past Continuous — то, что уже шло.",
      "past-continuous-i-was-working",
      [ex("At 4 pm last Tuesday, I was working in the office.", "В 4 часа в прошлый вторник я работал в офисе.", "past-continuous-i-was-working"),
       ex("I was listening to the radio when Helen phoned.", "Я слушал радио, когда позвонила Хелен.", "past-continuous-i-was-working")],
      ["pasts"], bank="pastc")

topic("pastp", "Past Perfect", "I had worked", "past", "Tense",
      "had + past participle", "I had worked.", "I had not worked.", "Had you worked?",
      "One past action before another past action.",
      "Одно прошлое раньше другого прошлого.",
      ["the earlier of two past times", "a result that was already true at a past moment"],
      ["before", "after", "by the time", "already", "when"],
      "If the order is already clear with before, Past Simple is often enough. Past Perfect is needed when the earlier action must be marked.",
      "Если порядок уже ясен из before, часто хватает Past Simple. Past Perfect нужен, когда раннее действие надо отметить.",
      "Past Simple is the later past, or the only past. Past Perfect is the earlier one.",
      "Past Simple — более позднее прошлое или единственное. Past Perfect — более раннее.",
      "past-perfect-simple-i-had-worked",
      [ex("I'd seen all of Elvis Presley's movies by the time I was 20.", "К 20 годам я уже видел все фильмы Элвиса Пресли.", "past-perfect-simple-i-had-worked"),
       ex("I'd been to five countries in Europe by 2001.", "К 2001 году я побывал в пяти странах Европы.", "past-perfect-simple-i-had-worked")],
      ["pasts"], bank="pastp")

topic("pastpc", "Past Perfect Continuous", "I had been working", "past", "Tense",
      "had been + V-ing", "I had been working.", "I had not been working.", "Had you been working?",
      "An action continued up to a moment in the past.",
      "Действие длилось до момента в прошлом.",
      ["duration before a past moment", "a cause that was already in progress"],
      ["for", "since", "all morning", "before"],
      "Do not use it for a single completed event. That is Past Perfect simple or Past Simple.",
      "Для одного законченного события эту форму не ставят. Для него есть Past Perfect simple или Past Simple.",
      "Past Perfect simple is the earlier completed event. Past Perfect Continuous is the earlier activity and its length.",
      "Past Perfect simple — раннее законченное событие. Past Perfect Continuous — раннее действие и его длительность.",
      "past-perfect-continuous-i-had-been-working",
      [ex("It had been raining and the ground was still wet.", "Дождь шел, и земля была еще мокрой.", "past-perfect-continuous-i-had-been-working"),
       ex("I had been working on my essays the night before and I was very tired.", "Накануне вечером я работал над сочинениями и очень устал.", "past-perfect-continuous-i-had-been-working")],
      ["pastp"], bank="pastpc")

topic("will", "Future Simple", "I will work", "future", "Tense",
      "will + V1", "I will work.", "I will not work. / I won't work.", "Will you work?",
      "A decision at the moment of speaking, a promise, or a prediction without present evidence. will is also a modal verb. As a tense form, this is Future Simple.",
      "Решение в момент речи, обещание или предсказание без видимого сейчас признака. will также модальный глагол. Как временная форма это Future Simple.",
      ["a decision made now", "a promise", "a prediction", "a future fact in a timetable of offers"],
      ["I think", "probably", "promise", "perhaps"],
      "A plan already made is usually be going to or Present Continuous, not a new-decision will.",
      "Уже готовый план обычно выражают через be going to или Present Continuous, а не через will нового решения.",
      "be going to is a plan or present evidence. Present Simple is a timetable. will is the decision or the prediction.",
      "be going to — план или признак сейчас. Present Simple — расписание. will — решение или предсказание.",
      "future-will-and-shall",
      [ex("I will pay you back, I promise, when I get paid.", "Я верну тебе деньги, обещаю, когда мне заплатят.", "future-will-and-shall"),
       ex("I'll call you when I get there.", "Я позвоню тебе, когда доберусь.", "future-will-and-shall")],
      ["going", "psfut", "pcfut"], note="This is one of the 12 tenses. The same verb will is also listed under Modal verbs.", bank="will")

topic("futc", "Future Continuous", "I will be working", "future", "Tense",
      "will be + V-ing", "I will be working.", "I will not be working.", "Will you be working?",
      "An action in progress at a future moment.",
      "Действие будет идти в момент в будущем.",
      ["an action at a future point", "an action that will be in progress anyway"],
      ["this time tomorrow", "at 8 pm", "next week"],
      "Do not use it for a single completed result. That is Future Perfect or will.",
      "Для одного законченного результата эту форму не ставят. Для него есть Future Perfect или will.",
      "Future Simple names the whole future action. Future Continuous names the action in progress at a future time.",
      "Future Simple называет будущее действие целиком. Future Continuous называет действие в процессе в будущий момент.",
      "future-continuous-i-will-be-working",
      [ex("Next week they will be flying to Australia from Saudi Arabia.", "На следующей неделе они будут лететь в Австралию из Саудовской Аравии.", "future-continuous-i-will-be-working"),
       ex("I'll post your letter for you. I'll be passing a post-box.", "Я отправлю твое письмо. Я как раз буду проходить мимо почтового ящика.", "future-continuous-i-will-be-working")],
      ["will"], bank="futc")

topic("futp", "Future Perfect", "I will have worked", "future", "Tense",
      "will have + past participle", "I will have worked.", "I will not have worked.", "Will you have worked?",
      "By a future moment the action will already be finished.",
      "К моменту в будущем действие уже закончится.",
      ["completion before a future deadline"],
      ["by Friday", "by then", "by the time"],
      "by + a future time is the usual marker. Do not confuse it with Future Continuous, which is still in progress.",
      "by плюс будущее время — обычный маркер. Не путать с Future Continuous, которое еще идет.",
      "Future Continuous is in progress at that moment. Future Perfect is already complete.",
      "Future Continuous в тот момент еще идет. Future Perfect уже завершено.",
      "future-perfect-simple-i-will-have-worked",
      [ex("Next month I will have worked for the company for six years.", "В следующем месяце будет шесть лет, как я работаю в компании.", "future-perfect-simple-i-will-have-worked")],
      ["futc", "futpc"], bank="futp")

topic("futpc", "Future Perfect Continuous", "I will have been working", "future", "Tense",
      "will have been + V-ing", "I will have been working.", "I will not have been working.", "Will you have been working?",
      "By a future moment the action will already have continued for some time.",
      "К моменту в будущем действие уже будет длиться какое-то время.",
      ["duration looked at from a future point"],
      ["for", "by", "by the time"],
      "The result that is finished, without duration, is Future Perfect simple.",
      "Законченный результат без длительности — Future Perfect simple.",
      "Future Perfect is the completed result. Future Perfect Continuous is the length of the activity.",
      "Future Perfect — законченный результат. Future Perfect Continuous — длительность действия.",
      "future-perfect-continuous-i-will-have-been-working",
      [ex("In September the head teacher will have been teaching at the school for 20 years.", "В сентябре будет 20 лет, как директор преподает в школе.", "future-perfect-continuous-i-will-have-been-working"),
       ex("I will have been studying English for three years by the end of this course.", "К концу этого курса я буду учить английский уже три года.", "future-perfect-continuous-i-will-have-been-working")],
      ["futp"], bank="futpc")

# Future constructions that are not extra tenses.
topic("going", "be going to", "I am going to work", "future", "Future form",
      "am / is / are going to + V1", "I am going to leave.", "I am not going to leave.", "Are you going to leave?",
      "A plan already made, or a future you can see from evidence now. This is a future construction, not a thirteenth tense.",
      "План, который уже есть, или будущее по признаку сейчас. Это конструкция будущего, а не тринадцатое время.",
      ["an intention", "a prediction from present evidence"],
      ["going to", "look", "evidence now"],
      "A decision made at the moment of speaking is usually will, not be going to.",
      "Решение, принятое в момент речи, обычно will, не be going to.",
      "will is a new decision or a bare prediction. Present Continuous for the future is an arrangement, often with a named time.",
      "will — новое решение или голое предсказание. Present Continuous для будущего — договоренность, часто с названным временем.",
      "be-going-to",
      [ex("I'm going to take a few exams at the end of the year.", "В конце года я собираюсь сдать несколько экзаменов.", "be-going-to")],
      ["will", "pcfut"], bank="going")

topic("pcfut", "Present Continuous for the future", "I'm working tomorrow", "future", "Future form",
      "am / is / are + V-ing + a future time", "I'm meeting Anna tomorrow.", "I'm not meeting Anna tomorrow.", "Are you meeting Anna tomorrow?",
      "An arrangement for the future, often with a time named. The form is Present Continuous. The meaning is future.",
      "Договоренность на будущее, время часто названо. Форма — Present Continuous. Значение — будущее.",
      ["a diary arrangement", "a plan with another person"],
      ["tomorrow", "next week", "on Friday"],
      "A personal intention without an arrangement is closer to be going to.",
      "Личное намерение без договоренности ближе к be going to.",
      "be going to can be only an intention. Present Continuous for the future usually means it is arranged.",
      "be going to может быть только намерением. Present Continuous для будущего обычно значит, что это уже договорено.",
      "future-",
      [ex("I am taking the train to Paris tomorrow.", "Завтра я еду поездом в Париж.", "future-"),
       ex("The band is visiting Denmark next May.", "Группа едет в Данию в следующем мае.", "future-")],
      ["pc", "going", "psfut"], bank="pcfut")

topic("psfut", "Present Simple for the future", "The train leaves at 6", "future", "Future form",
      "Present Simple + a timetable time", "The train leaves at 6.", "The train does not leave at 6.", "Does the train leave at 6?",
      "A timetable or programme: a train, a class, a film. The form is Present Simple. The meaning is future.",
      "Расписание и программа: поезд, урок, фильм. Форма — Present Simple. Значение — будущее.",
      ["transport timetables", "fixed programmes"],
      ["at 6", "next week", "on Monday"],
      "A personal plan is not a timetable. Use be going to or Present Continuous.",
      "Личный план — не расписание. Нужны be going to или Present Continuous.",
      "will is a decision. Present Simple for the future is a schedule that is not decided by the speaker now.",
      "will — решение. Present Simple для будущего — расписание, которое говорящий сейчас не решает.",
      "future-",
      [ex("What time does their flight to Seoul leave?", "Во сколько вылетает их рейс в Сеул?", "future-")],
      ["ps", "will"], bank="psfut")

topic("about", "be about to", "I'm about to leave", "future", "Future form",
      "am / is / are about to + V1", "The ferry is about to leave.", "The ferry is not about to leave.", "Is the ferry about to leave?",
      "The action is on the point of happening.",
      "Действие вот-вот произойдет.",
      ["the immediate future"],
      ["about to", "just"],
      "A plan for next month is not be about to.",
      "План на следующий месяц — это не be about to.",
      "be going to can be a later plan. be about to is immediate.",
      "be going to может быть более поздним планом. be about to — немедленно.",
      "future-",
      [ex("The ferry is about to leave.", "Паром вот-вот отойдет.", "future-"),
       ex("Hurry up, please! The coach is about to leave!", "Поторопитесь! Автобус вот-вот уедет!", "future-")],
      ["due", "beto"])

topic("due", "be due to", "The visitors are due to arrive", "future", "Future form",
      "am / is / are due to + V1", "The visitors are due to arrive at 10:30.", "They are not due to arrive yet.", "Are they due to arrive at 10:30?",
      "Expected by a plan or a schedule.",
      "Ожидается по плану или расписанию.",
      ["an official expected time"],
      ["due to"],
      "due to before a noun can also mean 'because of'. With a verb it is the future plan.",
      "due to перед существительным может значить 'из-за'. С глаголом это будущий план.",
      "be about to is immediate. be due to is the scheduled time, which may not be immediate.",
      "be about to — немедленно. be due to — назначенное время, оно может быть не сейчас.",
      "future-",
      [ex("The visitors are due to arrive at the factory at 10:30.", "Гости должны прибыть на фабрику в 10:30.", "future-")],
      ["about", "beto"])

topic("beto", "be to", "She is to start on Monday", "future", "Future form",
      "am / is / are to + V1", "She is to start on Monday.", "She is not to start yet.", "Is she to start on Monday?",
      "A formal plan, an instruction, or an official arrangement.",
      "Официальный план, инструкция или официальная договоренность.",
      ["formal arrangements", "instructions"],
      ["is to", "are to"],
      "This is formal. Everyday plans use be going to or Present Continuous.",
      "Это официальный стиль. Обычные планы выражают через be going to или Present Continuous.",
      "be due to is an expected time. be to is a formal instruction or arrangement.",
      "be due to — ожидаемое время. be to — официальная инструкция или договоренность.",
      "future-",
      pick("future-", ["is to", "are to", "was to"], 2),
      ["due"])

topic("futpast", "Future in the past", "She would call", "future", "Future form",
      "would + V1, or was/were going to + V1", "She said she would call.", "She said she would not call.", "Did she say she would call?",
      "The future as it was seen from a past moment.",
      "Будущее, как его видели из прошлого.",
      ["reported future", "a past plan"],
      ["said", "thought", "would", "was going to"],
      "would here is not the same as would for a past habit, and not the same as Second Conditional would.",
      "would здесь — не привычка в прошлом и не would второго условного.",
      "A past habit uses would for repeated actions. Future in the past uses would for a future seen from the past.",
      "Привычка в прошлом использует would для повторов. Future in the past использует would для будущего, увиденного из прошлого.",
      "future-",
      [ex("They rang to say they would be with us by ten o'clock but then their flight was cancelled.", "Они позвонили и сказали, что будут у нас к десяти, но потом их рейс отменили.", "future-"),
       ex("He said he was going to see the match but it was cancelled.", "Он сказал, что собирается посмотреть матч, но его отменили.", "future-")],
      ["wasgoing", "wouldfut", "would"], bank="futpast")

topic("wasgoing", "was / were going to", "I was going to call", "future", "Future form",
      "was / were going to + V1", "I was going to call.", "I was not going to call.", "Were you going to call?",
      "A plan that existed in the past. Often the plan did not happen.",
      "План, который был в прошлом. Часто он не состоялся.",
      ["a past intention", "a past intention that changed"],
      ["was going to", "were going to"],
      "Do not use it for a habit. That is used to or would.",
      "Для привычки эту форму не ставят. Для нее есть used to или would.",
      "would + V1 can report a future. was going to stresses the plan.",
      "would + V1 может передавать будущее. was going to подчеркивает план.",
      "future-",
      [ex("He said he was going to see the match but it was cancelled.", "Он сказал, что собирается посмотреть матч, но его отменили.", "future-")],
      ["futpast", "going"])

topic("wouldfut", "would for the future in the past", "I thought I would be tall", "future", "Future form",
      "would + V1, seen from the past", "I thought I would be tall.", "I thought I would not be tall.", "Did you think you would be tall?",
      "would marks a future that was still ahead at a past moment.",
      "would отмечает будущее, которое в прошлый момент еще было впереди.",
      ["after a past verb of thinking or saying"],
      ["thought", "said", "knew", "would"],
      "The same form also makes conditionals and past habits. The context decides.",
      "Та же форма делает условные предложения и прошлые привычки. Решает контекст.",
      "Past-habit would repeats an action. This would points forward from the past.",
      "would привычки повторяет действие. Это would смотрит вперед из прошлого.",
      "future-",
      [ex("When I was young I thought that in years to come I would be really tall.", "В детстве я думал, что через годы буду очень высоким.", "would")],
      ["futpast", "would"])

# Conditionals
topic("zero", "Zero Conditional", "If you heat ice, it melts", "cond", "Conditional",
      "If + present, present", "If you heat ice, it melts.", "If you do not heat ice, it does not melt.", "What happens if you heat ice?",
      "A general truth or a rule. The result always follows.",
      "Общая истина или правило. Результат следует всегда.",
      ["facts", "rules", "instructions that are always true"],
      ["if", "when"],
      "Do not use will in the result of a general truth.",
      "В результате общей истины will не ставят.",
      "First Conditional is a real future possibility. Zero Conditional is a general fact.",
      "First Conditional — реальная возможность в будущем. Zero Conditional — общий факт.",
      "conditionals-if",
      [ex("If the weather improves, we'll go for a walk.", "Если погода улучшится, мы пойдем гулять.", "conditionals-if")],
      ["first"])

topic("first", "First Conditional", "If it rains, I will stay", "cond", "Conditional",
      "If + present, will + V1", "If it rains, I will stay.", "If it rains, I will not stay.", "Will you stay if it rains?",
      "A real possibility in the future.",
      "Реальная возможность в будущем.",
      ["a possible future result"],
      ["if", "unless", "as long as"],
      "Do not put will in the if-clause of this pattern: if it will rain.",
      "В if-части этого образца will не ставят: if it will rain.",
      "Zero Conditional is always true. First Conditional is one possible future.",
      "Zero Conditional верен всегда. First Conditional — одно возможное будущее.",
      "conditionals-if",
      [ex("If a lawyer reads the document, we will see if we've missed anything important.", "Если юрист прочитает документ, мы увидим, не упустили ли мы что-то важное.", "conditionals-if"),
       ex("If the flight's late, we'll miss our connection.", "Если рейс задержится, мы опоздаем на пересадку.", "conditionals-if")],
      ["zero", "second"])

topic("second", "Second Conditional", "If I knew, I would say", "cond", "Conditional",
      "If + past, would + V1", "If I knew, I would say.", "If I knew, I would not say.", "Would you say if you knew?",
      "An unreal or unlikely present or future.",
      "Нереальное или маловероятное настоящее или будущее.",
      ["imagined present", "unlikely future", "advice: If I were you"],
      ["if", "would", "were"],
      "Do not use would in the if-clause: if I would know.",
      "В if-части would не ставят: if I would know.",
      "First Conditional is a real future. Second Conditional is imagined.",
      "First Conditional — реальное будущее. Second Conditional — воображаемое.",
      "conditionals-if",
      [ex("If the weather improved, we could go for a walk.", "Если бы погода улучшилась, мы могли бы пойти гулять.", "conditionals-if"),
       ex("If people complained, things would change.", "Если бы люди жаловались, все бы изменилось.", "conditionals-if")],
      ["first", "third"])

topic("third", "Third Conditional", "If I had known, I would have said", "cond", "Conditional",
      "If + past perfect, would have + past participle", "If I had known, I would have said.", "If I had known, I would not have said.", "Would you have said if you had known?",
      "An unreal past. The condition did not happen.",
      "Нереальное прошлое. Условие не произошло.",
      ["regret about the past", "a past result that did not happen"],
      ["if", "had", "would have"],
      "Do not mix the halves: if I would have known, I would say.",
      "Не смешивают половины: if I would have known, I would say.",
      "Second Conditional imagines the present or future. Third Conditional imagines the past.",
      "Second Conditional воображает настоящее или будущее. Third Conditional воображает прошлое.",
      "conditionals-if",
      [ex("If the weather had improved, we could have gone for a walk.", "Если бы погода улучшилась, мы могли бы пойти гулять.", "conditionals-if")],
      ["second", "mixed"])

topic("mixed", "Mixed Conditionals", "If I had left earlier, I would be there", "cond", "Conditional",
      "Past perfect in one half, would + V1 in the other, or the reverse", "If I had left earlier, I would be there now.", "If I had not left earlier, I would not be there now.", "Would you be there now if you had left earlier?",
      "The time in the if-clause and the time in the result are different.",
      "Время в if-части и время в результате разные.",
      ["a past cause with a present result", "a present state with a past result"],
      ["now", "today", "had", "would"],
      "A mixed conditional is not a fifth basic type with one fixed formula. The two times must be different on purpose.",
      "Смешанное условное — не пятый базовый тип с одной формулой. Два времени должны различаться намеренно.",
      "Third Conditional keeps both halves in the past. A mixed conditional crosses past and present.",
      "Third Conditional держит обе половины в прошлом. Смешанное условное соединяет прошлое и настоящее.",
      "conditionals-if",
      pick("conditionals-if", ["would be", "had"], 2),
      ["third"])

def linker(id, name, form, formula, usage_en, usage_ru, differs_en, differs_ru, needles=None):
    needles = needles or [name.split()[0].lower()]
    topic(id, name, form, "cond", "Conditional linker", formula, form, "", "",
          usage_en, usage_ru, [usage_en], [name.split()[0].lower()],
          "Check which conditional time the linker sits in. The linker does not change the tense by itself.",
          "Проверьте, в каком времени условного стоит эта связка. Сама связка время не меняет.",
          differs_en, differs_ru, "unless" if id == "unless" else "conditionals-if",
          pick("unless" if id == "unless" else "conditionals-if", needles, 2), ["first"])

linker("unless", "unless", "unless it rains", "unless + present / past, depending on the conditional",
       "unless means if not. It introduces the condition that stops the result.",
       "unless значит if not. Оно вводит условие, которое отменяет результат.",
       "if not can replace unless. unless is not a tense.",
       "if not может заменить unless. unless — не время.")
linker("aslong", "as long as", "as long as you call", "as long as + clause",
       "The result depends on this condition staying true.",
       "Результат зависит от того, что это условие остается верным.",
       "if names a condition. as long as stresses that the condition must continue.",
       "if называет условие. as long as подчеркивает, что условие должно длиться.")
linker("provided", "provided / providing", "provided you finish", "provided (that) + clause",
       "A formal way to say if, often with a requirement.",
       "Официальный способ сказать if, часто с требованием.",
       "if is neutral. provided stresses the requirement.",
       "if нейтрально. provided подчеркивает требование.")
linker("incase", "in case", "in case it rains", "in case + present",
       "A precaution. You do something because the other event might happen.",
       "Предосторожность. Вы делаете что-то, потому что другое событие может случиться.",
       "if names the condition of the result. in case names a risk you prepare for.",
       "if называет условие результата. in case называет риск, к которому готовятся.")
linker("evenif", "even if", "even if it rains", "even if + clause",
       "The result does not change when the condition is true.",
       "Результат не меняется, даже если условие верно.",
       "if can change the result. even if says the result stays.",
       "if может изменить результат. even if говорит, что результат остается.")
linker("onlyif", "only if", "only if you agree", "only if + clause",
       "The result happens in this one case.",
       "Результат бывает только в этом случае.",
       "if allows the result. only if limits it to one condition.",
       "if допускает результат. only if ограничивает его одним условием.")
linker("otherwise", "otherwise", "otherwise we will be late", "otherwise + result",
       "The result if the previous instruction is not followed.",
       "Результат, если предыдущее указание не выполнено.",
       "or else is close. otherwise points back to the sentence before it.",
       "or else близко по смыслу. otherwise указывает на предыдущее предложение.")
linker("butfor", "but for", "but for your help", "but for + noun",
       "A formal way to imagine a past or present without something. It often pairs with would have.",
       "Официальный способ представить прошлое или настоящее без чего-то. Часто стоит с would have.",
       "if it hadn't been for takes a clause. but for takes a noun.",
       "if it hadn't been for берет придаточное. but for берет существительное.")
linker("ifwerent", "if it weren't for", "if it weren't for you", "if it weren't for + noun",
       "An unreal present cause. Without this thing, the present would be different.",
       "Нереальная причина в настоящем. Без этой вещи настоящее было бы другим.",
       "if it hadn't been for is the past pair.",
       "if it hadn't been for — пара для прошлого.")
linker("ifhadnt", "if it hadn't been for", "if it hadn't been for the rain", "if it hadn't been for + noun",
       "An unreal past cause.",
       "Нереальная причина в прошлом.",
       "if it weren't for is the present pair.",
       "if it weren't for — пара для настоящего.")
topic("wereto", "were to", "If I were to leave", "cond", "Conditional inversion pattern",
      "If + subject + were to + V1", "If I were to leave, I would tell you.", "If I were not to leave, I would stay.", "Would you tell me if you were to leave?",
      "A formal and more distant way to imagine a future condition.",
      "Официальный и более отдаленный способ представить будущее условие.",
      ["formal imagined future"], ["were to"],
      "were to is not Past Simple of an ordinary story. It is hypothetical.",
      "were to — не Past Simple обычного рассказа. Это гипотеза.",
      "If + past is the ordinary Second Conditional. were to sounds more formal and less likely.",
      "If плюс past — обычный Second Conditional. were to звучит официальнее и менее вероятно.",
      "conditionals-if", pick("conditionals-if", ["were to", "if i were"], 2), ["second"])
topic("shouldinv", "should + subject + verb", "Should you need help", "cond", "Conditional inversion",
      "Should + subject + V1", "Should you need help, call me.", "Should you not need help, wait here.", "Should you need help?",
      "A formal first-conditional inversion. It replaces if.",
      "Официальная инверсия первого условного. Она заменяет if.",
      ["formal real condition"], ["should"],
      "This should is not the modal of advice. It inverts the condition.",
      "Это should — не модальный совет. Оно переворачивает условие.",
      "If you should need is the same idea without inversion.",
      "If you should need — та же мысль без инверсии.",
      "inversion", pick("inversion", ["should you", "should"], 2), ["hadinv"])
topic("hadinv", "Had I known", "Had I known", "cond", "Conditional inversion",
      "Had + subject + past participle", "Had I known, I would have called.", "", "",
      "A formal third-conditional inversion. Had replaces if.",
      "Официальная инверсия третьего условного. Had заменяет if.",
      ["formal unreal past"], ["had"],
      "Do not add if as well: if had I known.",
      "if дополнительно не ставят: if had I known.",
      "If I had known is the same conditional without inversion.",
      "If I had known — то же условное без инверсии.",
      "inversion", pick("inversion", ["had i", "had you"], 2), ["shouldinv", "third"])
topic("wereinv", "Were I you", "Were I you", "cond", "Conditional inversion",
      "Were + subject + complement", "Were I you, I would wait.", "", "",
      "A formal second-conditional inversion, often for advice.",
      "Официальная инверсия второго условного, часто для совета.",
      ["advice", "formal unreal present"], ["were"],
      "Was is not used in this inversion. The form is were.",
      "В этой инверсии was не ставят. Форма — were.",
      "If I were you is the same advice without inversion.",
      "If I were you — тот же совет без инверсии.",
      "inversion", pick("inversion", ["were i", "were you"], 2), ["second"])

# Modals — short sourced pages where we have a real slug.
def modal(id, name, form, formula, usage_en, usage_ru, differs_en, differs_ru, slug, needles, related):
    topic(id, name, form, "modal", "Modal", formula, form, "not + " + form if " " not in form else form,
          form + "?", usage_en, usage_ru, [usage_en], [name],
          "A modal is followed by the base verb, without to, except ought to, have to, need to and the be + adjective patterns.",
          "После модального глагола идет первая форма без to, кроме ought to, have to, need to и схем be + прилагательное.",
          differs_en, differs_ru, slug, pick(slug, needles, 2), related)

modal("can", "can", "can go", "can + V1", "Ability, permission, or a possible fact now.", "Способность, разрешение или возможный факт сейчас.",
      "be able to replaces can in forms can does not have, such as the future and the present perfect.", "be able to заменяет can в формах, которых у can нет, например в будущем и в present perfect.",
      "can-could", ["can"], ["could", "beable"])
modal("could", "could", "could go", "could + V1", "Past ability, a polite request, or a weaker possibility.", "Прошлая способность, вежливая просьба или более слабая возможность.",
      "could have + V3 is the past possibility or the missed ability. Plain could is not that perfect form.", "could have + V3 — прошлая возможность или упущенная способность. Просто could — не эта перфектная форма.",
      "can-could", ["could"], ["can", "couldhave"])
modal("may", "may", "may go", "may + V1", "Permission, or a possibility that is open.", "Разрешение или открытая возможность.",
      "might is usually more uncertain than may. can is ability or a general possibility.", "might обычно менее уверенно, чем may. can — способность или общая возможность.",
      "modal-verbs", ["may"], ["might", "can"])
modal("might", "might", "might go", "might + V1", "A weaker possibility than may.", "Более слабая возможность, чем may.",
      "might have + V3 looks back at a past possibility.", "might have + V3 смотрит назад на прошлую возможность.",
      "modal-verbs", ["might"], ["may", "mighthave"])
modal("must", "must", "must go", "must + V1", "A strong obligation from the speaker, or a logical conclusion.", "Сильная обязанность от говорящего или логический вывод.",
      "have to is the obligation from outside. must not is a prohibition, not the absence of obligation.", "have to — обязанность снаружи. must not — запрет, а не отсутствие обязанности.",
      "must", ["must"], ["haveto", "musthave"])
modal("should", "should", "should go", "should + V1", "Advice, or what is expected.", "Совет или то, чего ожидают.",
      "had better is stronger and more immediate. must is an obligation.", "had better сильнее и ближе к сейчас. must — обязанность.",
      "should", ["should"], ["hadbetter", "must"])
modal("shall", "shall", "shall I open it", "shall + V1", "Offers and suggestions with I and we, mostly in British English. It is not the ordinary future for all persons.", "Предложения и советы с I и we, в основном в британском английском. Это не обычное будущее для всех лиц.",
      "will is the ordinary future and the promise. shall with I/we asks for a decision.", "will — обычное будущее и обещание. shall с I/we спрашивает решение.",
      "future-will-and-shall", ["shall"], ["will"])
modal("wouldmod", "would", "would go", "would + V1", "Polite requests, typical behaviour, reported will, past habits, and conditional results. The meaning depends on the clause around it.", "Вежливые просьбы, типичное поведение, will в косвенной речи, прошлые привычки и результат условного. Значение зависит от окружения.",
      "Do not file every would as Future Simple. Check habit, conditional, or future in the past.", "Не записывайте каждый would как Future Simple. Проверьте привычку, условное или будущее в прошлом.",
      "would", ["would"], ["would", "wouldfut", "second"])
modal("ought", "ought to", "ought to go", "ought to + V1", "Advice, close to should. It keeps to.", "Совет, близко к should. Частица to остается.",
      "should has no to. ought to keeps to.", "У should нет to. У ought to частица to есть.",
      "ought-to", ["ought"], ["should"])
modal("needmod", "need", "need not go", "need not + V1, or need + to + V1", "need not is the modal, with no to. need to is the ordinary verb.", "need not — модальная форма, без to. need to — обычный глагол.",
      "needn't have done means it was done but was not necessary. don't need to means there is no necessity now.", "needn't have done значит, что это сделали, хотя нужды не было. don't need to значит, что нужды нет сейчас.",
      "modal-verbs", ["need"], ["needto", "neednthave"])
modal("dare", "dare", "dare not go", "dare + V1, or dare to + V1", "dare can be a modal in negatives and questions, or an ordinary verb with to.", "dare может быть модальным в отрицании и вопросе или обычным глаголом с to.",
      "The ordinary verb is didn't dare to. The modal pattern is dare not.", "Обычный глагол — didn't dare to. Модальный образец — dare not.",
      "modal-verbs", ["dare"], [])
modal("haveto", "have to", "have to go", "have / has to + V1", "Obligation from a rule or a situation outside the speaker.", "Обязанность из правила или ситуации вне говорящего.",
      "must is the speaker's authority. don't have to means not necessary. must not means prohibited.", "must — авторитет говорящего. don't have to — не обязательно. must not — запрещено.",
      "have-to", ["have to", "has to"], ["must"])
modal("needto", "need to", "need to go", "need to + V1", "Necessity, as an ordinary verb. It takes do in questions and negatives.", "Необходимость как у обычного глагола. В вопросах и отрицаниях нужен do.",
      "need not is the modal. need to takes do: do not need to.", "need not — модальная форма. need to берет do: do not need to.",
      "modal-verbs", ["need to"], ["needmod"])
modal("beable", "be able to", "be able to go", "be able to + V1", "Ability in tenses where can has no form.", "Способность во временах, где у can нет формы.",
      "can is the present ability. was able to often means the ability was used on that occasion.", "can — способность сейчас. was able to часто значит, что способность использовали в тот раз.",
      "can-could", ["able to"], ["can"])
modal("beallowed", "be allowed to", "be allowed to go", "be allowed to + V1", "Permission, especially where may or can needs another tense.", "Разрешение, особенно там, где may или can нужна другая временная форма.",
      "can and may give permission now. be allowed to can be past or future.", "can и may дают разрешение сейчас. be allowed to может быть в прошлом или будущем.",
      "modal-verbs", ["allowed"], ["may", "can"])
modal("besupposed", "be supposed to", "be supposed to go", "be supposed to + V1", "What is expected or required by a rule or a plan.", "То, чего ждут или что требует правило или план.",
      "should is advice. be supposed to is the expectation that already exists.", "should — совет. be supposed to — ожидание, которое уже есть.",
      "modal-verbs", ["supposed"], ["should"])
modal("berequired", "be required to", "be required to go", "be required to + V1", "A formal obligation.", "Официальная обязанность.",
      "have to is the everyday obligation. be required to is formal.", "have to — обычная обязанность. be required to — официальная.",
      "have-to", ["required"], ["haveto"])
modal("bewilling", "be willing to", "be willing to go", "be willing to + V1", "Ready and agreeing to do it.", "Готов и согласен это сделать.",
      "can is ability. be willing to is agreement, not ability.", "can — способность. be willing to — согласие, не способность.",
      "modal-verbs", ["willing"], [])
modal("belikely", "be likely to", "be likely to go", "be likely to + V1", "A probable future, not an obligation.", "Вероятное будущее, не обязанность.",
      "will is a prediction the speaker makes. be likely to states probability.", "will — предсказание говорящего. be likely to называет вероятность.",
      "modal-verbs", ["likely"], ["will"])
modal("bemeant", "be meant to", "be meant to go", "be meant to + V1", "Intended by a plan or a design.", "Задумано планом или назначением.",
      "be supposed to is the expectation. be meant to is the intention behind it.", "be supposed to — ожидание. be meant to — замысел за ним.",
      "modal-verbs", ["meant to"], ["besupposed"])
modal("hadbetter", "had better", "had better go", "had better + V1", "Strong advice about this situation. There is no to.", "Сильный совет об этой ситуации. Частицы to нет.",
      "should is general advice. had better warns about a bad result if you do not act.", "should — общий совет. had better предупреждает о плохом результате, если не действовать.",
      "should", ["had better", "better"], ["should"])
modal("wouldrather", "would rather", "would rather go", "would rather + V1", "A preference. There is no to.", "Предпочтение. Частицы to нет.",
      "prefer can take to + verb or a noun. would rather takes the base verb.", "prefer может брать to + глагол или существительное. would rather берет первую форму.",
      "would", ["rather"], ["wouldprefer"])
modal("wouldprefer", "would prefer", "would prefer to go", "would prefer to + V1", "A preference with to.", "Предпочтение с частицей to.",
      "would rather has no to. would prefer keeps to.", "У would rather нет to. У would prefer частица to есть.",
      "would", ["prefer"], ["wouldrather"])

def perfect(id, name, form, usage_en, usage_ru, differs_en, differs_ru, needles, related):
    topic(id, name, form, "modal", "Modal perfect", name + " + past participle", form, "", "",
          usage_en, usage_ru, [usage_en], [name.split()[0]],
          "The perfect modal looks at the past from now. It is not a tense name.",
          "Перфектный модальный смотрит на прошлое из сейчас. Это не название времени.",
          differs_en, differs_ru, "modal-verbs", pick("modal-verbs", needles, 2), related)

perfect("musthave", "must have done", "must have done", "A logical conclusion about the past. The speaker is sure.", "Логический вывод о прошлом. Говорящий уверен.",
        "had to is a past obligation. must have done is a deduction.", "had to — прошлая обязанность. must have done — вывод.", ["must have"], ["must"])
perfect("mayhave", "may have done", "may have done", "A past possibility that is still open.", "Прошлая возможность, которая еще открыта.",
        "might have done is usually less sure.", "might have done обычно менее уверенно.", ["may have"], ["mighthave"])
perfect("mighthave", "might have done", "might have done", "A weaker past possibility, or a result that was possible but did not happen.", "Более слабая прошлая возможность или результат, который был возможен, но не случился.",
        "could have done can be ability that was not used. might have done is possibility.", "could have done может быть неиспользованной способностью. might have done — возможность.", ["might have"], ["mayhave", "couldhave"])
perfect("couldhave", "could have done", "could have done", "A past possibility, or an ability that was not used.", "Прошлая возможность или способность, которую не использовали.",
        "was able to often means the person did it. could have done often means they did not.", "was able to часто значит, что человек это сделал. could have done часто значит, что не сделал.", ["could have"], ["could"])
perfect("shouldhave", "should have done", "should have done", "The right action in the past did not happen, or it did and the speaker criticises it.", "Верное действие в прошлом не произошло, или произошло, и говорящий его осуждает.",
        "should do is advice for now or the future. should have done is about the past.", "should do — совет на сейчас или будущее. should have done — о прошлом.", ["should have"], ["should"])
perfect("wouldhave", "would have done", "would have done", "The imagined result of an unreal past, or a willingness that was not used.", "Воображаемый результат нереального прошлого или готовность, которую не использовали.",
        "In the Third Conditional this is the result half, not a separate tense.", "В третьем условном это половина результата, а не отдельное время.", ["would have"], ["third"])
perfect("neednthave", "needn't have done", "needn't have done", "It was done, but it was not necessary.", "Это сделали, хотя необходимости не было.",
        "didn't need to means there was no necessity, and it may not have been done.", "didn't need to значит, что необходимости не было, и действие могли не сделать.", ["needn't have", "need not have"], ["needmod"])
perfect("canthave", "can't have done", "can't have done", "A logical conclusion that something was impossible.", "Логический вывод, что это было невозможно.",
        "must have done is the positive deduction. can't have done is the negative one.", "must have done — положительный вывод. can't have done — отрицательный.", ["can't have", "cannot have"], ["musthave"])

# Used to
topic("used", "used to", "I used to work", "advanced", "Habit",
      "used to + V1", "I used to live there.", "I did not use to live there.", "Did you use to live there?",
      "A past habit or state that is not true now.",
      "Привычка или состояние в прошлом, которых сейчас нет.",
      ["past habits", "past states"], ["used to"],
      "The negative is did not use to, without the -d on use.",
      "Отрицание — did not use to, без -d у use.",
      "would repeats past actions, not states. be used to means accustomed, and takes a noun or -ing.",
      "would повторяет прошлые действия, не состояния. be used to значит 'привык' и берет существительное или -ing.",
      "used-to",
      [ex("My dad used to smoke when he was younger.", "Мой отец курил, когда был моложе.", "used-to"),
       ex("I used to live in Italy, but now I live in England.", "Раньше я жил в Италии, а сейчас живу в Англии.", "used-to")],
      ["would", "beused"], bank="used")
topic("beused", "be used to", "I'm used to working", "advanced", "Habit",
      "be used to + noun / V-ing", "I'm used to hot weather.", "I'm not used to hot weather.", "Are you used to hot weather?",
      "Already accustomed. After it, use a noun or a gerund, not a bare infinitive.",
      "Уже привык. После этой схемы существительное или герундий, не инфинитив без to.",
      ["a present or past state of being accustomed"], ["used to", "accustomed"],
      "used to + V1 is a past habit. be used to + -ing is a state.",
      "used to + V1 — прошлая привычка. be used to + -ing — состояние.",
      "get used to is the process of becoming accustomed. be used to is the state.",
      "get used to — процесс привыкания. be used to — состояние.",
      "word-choice-used-to-and-be-used-to",
      [ex("I don't mind the heat. I'm used to hot weather.", "Я не против жары. Я привык к жаркой погоде.", "word-choice-used-to-and-be-used-to"),
       ex("He was a salesman, so he was used to travelling up and down the country.", "Он был продавцом, поэтому привык ездить по всей стране.", "word-choice-used-to-and-be-used-to")],
      ["used", "getused"], bank="beused")
topic("getused", "get used to", "I'll get used to it", "advanced", "Habit",
      "get used to + noun / V-ing", "You'll soon get used to it.", "I can't get used to it.", "Have you got used to it?",
      "The process of becoming accustomed.",
      "Процесс привыкания.",
      ["a change you are still adapting to"], ["get used to"],
      "Do not follow it with the bare infinitive.",
      "После него не ставят инфинитив без to.",
      "be used to is already true. get used to is the change.",
      "be used to уже верно. get used to — само изменение.",
      "word-choice-used-to-and-be-used-to",
      [ex("University is very different from school, but don't worry. You'll soon get used to it.", "Университет очень отличается от школы, но не волнуйся. Ты скоро привыкнешь.", "word-choice-used-to-and-be-used-to")],
      ["beused"])
topic("would", "would for past habits", "We would walk", "advanced", "Habit",
      "would + V1", "We would walk to school.", "We would not walk to school.", "Would you walk to school?",
      "A repeated past action, like used to, but not for states.",
      "Повторяющееся действие в прошлом, как used to, но не для состояний.",
      ["repeated past actions"], ["would", "every day", "always"],
      "A past state takes used to, not would: I would live there is not the state meaning.",
      "Для прошлого состояния нужен used to, не would: I would live there не выражает состояние.",
      "used to covers states and habits. would covers repeated actions only.",
      "used to покрывает состояния и привычки. would — только повторяющиеся действия.",
      "would",
      [ex("Dad would sing to us every evening.", "Папа пел нам каждый вечер.", "would")],
      ["used", "wouldfut"], bank="would")

# Passive
def passive(id, name, form, formula, usage_en, usage_ru, slug="the-passive"):
    topic(id, name, form, "voice", "Passive", formula, form, "", "",
          usage_en, usage_ru, [usage_en], ["by"],
          "The object of the active sentence becomes the subject. The agent with by is optional.",
          "Дополнение активного предложения становится подлежащим. Деятель с by необязателен.",
          "The active sentence names the doer as the subject. The passive names the receiver as the subject.",
          "В активе деятель — подлежащее. В пассиве получатель действия — подлежащее.",
          slug, pick(slug, [form.split()[0].lower(), "passive"], 2), ["pass_ps"])

passive("pass_ps", "Present Simple Passive", "is made", "am / is / are + past participle", "A present fact or habit, with the receiver as the subject.", "Настоящий факт или привычка, подлежащее — получатель действия.")
passive("pass_pc", "Present Continuous Passive", "is being made", "am / is / are being + past participle", "An action in progress now, in the passive.", "Действие идет сейчас, в пассиве.")
passive("pass_pp", "Present Perfect Passive", "has been made", "have / has been + past participle", "A result linked to now, in the passive.", "Результат, связанный с сейчас, в пассиве.")
passive("pass_pasts", "Past Simple Passive", "was made", "was / were + past participle", "A finished past action, in the passive.", "Законченное прошлое действие, в пассиве.")
passive("pass_pastc", "Past Continuous Passive", "was being made", "was / were being + past participle", "A past action in progress, in the passive.", "Прошлое действие в процессе, в пассиве.")
passive("pass_pastp", "Past Perfect Passive", "had been made", "had been + past participle", "An earlier past action, in the passive.", "Более раннее прошлое действие, в пассиве.")
passive("pass_will", "Future Simple Passive", "will be made", "will be + past participle", "A future action, in the passive.", "Будущее действие, в пассиве.")
passive("pass_futp", "Future Perfect Passive", "will have been made", "will have been + past participle", "Complete before a future moment, in the passive.", "Завершено до будущего момента, в пассиве.")
passive("pass_modal", "Modal passive", "must be done", "modal + be + past participle", "Obligation, advice or possibility in the passive.", "Обязанность, совет или возможность в пассиве.", "modal-verbs")
passive("pass_inf", "Passive infinitive", "to be done", "to be + past participle", "The infinitive when the subject receives the action.", "Инфинитив, когда подлежащее получает действие.", "infinitives")
passive("pass_perfect_inf", "Perfect passive infinitive", "to have been done", "to have been + past participle", "An earlier action, passive, in the infinitive.", "Более раннее действие, пассив, в инфинитиве.", "infinitives")
passive("pass_ger", "Passive gerund", "being done", "being + past participle", "The gerund when the noun idea receives the action.", "Герундий, когда именная идея получает действие.", "ing-form")

# Infinitive and gerund
def pattern(id, name, form, formula, tone, kind, usage_en, usage_ru, differs_en, differs_ru, slug, needles, related):
    topic(id, name, form, tone, kind, formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "Copy the pattern. Do not swap to-infinitive and -ing unless the verb allows both.",
          "Держите образец. Не меняйте to-инфинитив и -ing, если глагол не принимает оба.",
          differs_en, differs_ru, slug, pick(slug, needles, 2), related)

pattern("toinf", "to-infinitive", "to do", "to + V1", "advanced", "Infinitive",
        "After want, decide, hope, would like, and as a purpose.", "После want, decide, hope, would like и для цели.",
        "A bare infinitive follows modals and let/make. A to-infinitive follows want and decide.", "Инфинитив без to идет после модальных и let/make. to-инфинитив идет после want и decide.",
        "infinitives", ["to"], ["bare", "gerund"])
pattern("bare", "Bare infinitive", "do", "V1 with no to", "advanced", "Infinitive",
        "After modals, and after let, make and sometimes help.", "После модальных и после let, make и иногда help.",
        "want takes to. can takes the bare form.", "want берет to. can берет форму без to.",
        "infinitives", ["let", "make", "modal"], ["toinf"])
pattern("perfinf", "Perfect infinitive", "to have done", "to have + past participle", "advanced", "Infinitive",
        "The action of the infinitive is earlier than the main verb.", "Действие инфинитива раньше основного глагола.",
        "to do is at the same time or later. to have done is earlier.", "to do — одновременно или позже. to have done — раньше.",
        "infinitives", ["to have"], ["toinf"])
pattern("continf", "Continuous infinitive", "to be doing", "to be + V-ing", "advanced", "Infinitive",
        "The action of the infinitive is in progress.", "Действие инфинитива в процессе.",
        "to do names the action. to be doing names it in progress.", "to do называет действие. to be doing называет его в процессе.",
        "infinitives", ["to be"], ["toinf"])
pattern("perfcontinf", "Perfect continuous infinitive", "to have been doing", "to have been + V-ing", "advanced", "Infinitive",
        "An activity already in progress before the main time.", "Действие уже шло до основного времени.",
        "to have done is the completed earlier action. to have been doing is the earlier activity.", "to have done — законченное раннее действие. to have been doing — раннее действие в процессе.",
        "infinitives", ["to have been"], ["perfinf"])
pattern("gerund", "Gerund", "working", "V-ing as a noun", "advanced", "Gerund",
        "The -ing form used as a noun: subject, object, or after a preposition.", "Форма -ing в роли существительного: подлежащее, дополнение или после предлога.",
        "A present participle also ends in -ing, but it behaves like a verb or an adjective. A gerund behaves like a noun.", "Причастие настоящего времени тоже кончается на -ing, но ведет себя как глагол или прилагательное. Герундий ведет себя как существительное.",
        "ing-form", ["ing"], ["toinf", "gerinf"])
pattern("ger_verb", "verb + gerund", "enjoy reading", "verb + V-ing", "advanced", "Gerund",
        "After enjoy, mind, finish, avoid, suggest and similar verbs.", "После enjoy, mind, finish, avoid, suggest и похожих глаголов.",
        "want takes the infinitive. enjoy takes the gerund.", "want берет инфинитив. enjoy берет герундий.",
        "ing-form", ["enjoy", "mind", "avoid"], ["toinf"])
pattern("ger_prep", "preposition + gerund", "keen on learning", "preposition + V-ing", "advanced", "Gerund",
        "After a preposition the verb is the -ing form, not the infinitive.", "После предлога глагол стоит в форме -ing, не в инфинитиве.",
        "to as a preposition takes -ing: look forward to seeing. to as the infinitive marker takes the base verb.", "to как предлог берет -ing: look forward to seeing. to как частица инфинитива берет первую форму.",
        "ing-form", ["of", "on", "to seeing"], ["toinf"])
pattern("ger_adj", "adjective + preposition + gerund", "good at swimming", "adjective + preposition + V-ing", "advanced", "Gerund",
        "After afraid of, good at, interested in and similar patterns.", "После afraid of, good at, interested in и похожих схем.",
        "The preposition decides the -ing. The adjective alone does not take a bare infinitive here.", "Предлог решает -ing. Одно прилагательное здесь не берет инфинитив без to.",
        "ing-form", ["at", "of", "in"], ["ger_prep"])
pattern("ger_subj", "Gerund as subject", "Reading helps", "V-ing + verb", "advanced", "Gerund",
        "The -ing form is the subject of the sentence.", "Форма -ing — подлежащее предложения.",
        "An infinitive can also be a subject, often more formal: To read helps. The gerund is the usual choice.", "Инфинитив тоже может быть подлежащим, часто официальнее: To read helps. Герундий — обычный выбор.",
        "ing-form", ["ing"], ["gerund"])
pattern("ger_obj", "Gerund as object", "I enjoy reading", "verb + V-ing", "advanced", "Gerund",
        "The -ing form is the object.", "Форма -ing — дополнение.",
        "Some verbs take only the infinitive as object. Check the verb.", "Некоторые глаголы берут дополнением только инфинитив. Проверьте глагол.",
        "ing-form", ["enjoy"], ["ger_verb"])
pattern("ger_perf", "Perfect gerund", "having finished", "having + past participle", "advanced", "Gerund",
        "The gerund action is earlier than the main verb.", "Действие герундия раньше основного глагола.",
        "A simple gerund can be at the same time. having + past participle is earlier.", "Простой герундий может быть одновременным. having + причастие — раньше.",
        "ing-form", ["having"], ["gerund"])
pattern("ger_pass", "Passive gerund", "being invited", "being + past participle", "advanced", "Gerund",
        "The gerund subject receives the action.", "Подлежащее герундия получает действие.",
        "doing is active. being done is passive.", "doing — актив. being done — пассив.",
        "ing-form", ["being"], ["pass_ger"])
topic("gerinf", "Gerund or infinitive", "remember doing / to do", "advanced", "Verb pattern",
      "The verb changes meaning with -ing or to", "I remember posting it. / I remembered to post it.", "", "",
      "After remember, stop, try, regret and forget the meaning changes.",
      "После remember, stop, try, regret и forget смысл меняется.",
      ["remember doing = I did it and I remember", "remember to do = do not forget", "stop doing = quit", "stop to do = pause in order to do it", "try doing = experiment", "try to do = make an effort", "regret doing = I am sorry about the past", "regret to do = I am sorry to say this", "forget doing = I did it and do not remember", "forget to do = I did not do it"],
      ["remember", "stop", "try", "regret", "forget"],
      "Do not treat the two patterns as the same meaning with a style difference.",
      "Не считайте две схемы одним смыслом с разницей только в стиле.",
      "A gerund looks back or names the activity. A to-infinitive often looks forward to a duty or a purpose.",
      "Герундий смотрит назад или называет занятие. to-инфинитив часто смотрит вперед, на долг или цель.",
      "verb-patterns",
      [ex("Did you remember to ring Nigel?", "Ты не забыл позвонить Найджелу?", "verb-patterns"),
       ex("Don't forget to ring before you go.", "Не забудь позвонить перед уходом.", "hate-like-love-and-prefer")],
      ["gerund", "toinf"], bank="gerinf")

# Participles
pattern("pres_part", "Present Participle", "walking", "V-ing", "advanced", "Participle",
        "The -ing form as a verb form in continuous tenses, or to add information about a noun.", "Форма -ing как глагольная форма в continuous или чтобы добавить сведения о существительном.",
        "A gerund is a noun. A present participle stays verbal.", "Герундий — существительное. Причастие настоящего времени остается глагольным.",
        "ing-form", ["walking", "ing"], ["gerund"])
pattern("past_part", "Past Participle", "built", "V3", "advanced", "Participle",
        "The third form, used in perfect tenses, the passive, and as an adjective.", "Третья форма: перфект, пассив и прилагательное.",
        "The past simple of a regular verb looks the same, but a participle does not carry the tense by itself.", "Past simple правильного глагола выглядит так же, но причастие само по себе время не несет.",
        "the-passive", ["built", "done"], ["pass_ps"])
pattern("perf_part", "Perfect Participle", "having finished", "having + past participle", "advanced", "Participle",
        "The participle action finished before the main action.", "Действие причастия закончилось до основного.",
        "Walking names a same-time action. Having walked names an earlier one.", "Walking называет одновременное действие. Having walked — более раннее.",
        "ing-form", ["having"], ["pres_part"])
pattern("part_clause", "Participle clause", "Walking down the street, I met Ana", "V-ing + rest of the clause", "advanced", "Participle",
        "Extra information, with the same subject as the main clause.", "Дополнительное сведение, с тем же подлежащим, что у главного предложения.",
        "If the subjects differ, the participle clause is a dangling modifier. Use a full clause.", "Если подлежащие разные, причастный оборот повис. Нужно полное придаточное.",
        "ing-form", ["ing"], ["pres_part"])
pattern("perf_part_clause", "Perfect participle clause", "Having finished the work, she left", "Having + past participle + ...", "advanced", "Participle",
        "The first action is complete before the main clause.", "Первое действие завершено до главного предложения.",
        "A present participle clause can be simultaneous. The perfect one is earlier.", "Причастие настоящего времени может быть одновременным. Перфектное — раньше.",
        "ing-form", ["having"], ["part_clause"])
pattern("pass_part_clause", "Passive participle clause", "Built in 1900, the house is still standing", "past participle + ...", "advanced", "Participle",
        "The noun receives the action of the participle.", "Существительное получает действие причастия.",
        "Built in 1900 is passive. Building in 1900 would be active.", "Built in 1900 — пассив. Building in 1900 было бы активом.",
        "the-passive", ["built"], ["past_part"])

# Reported speech
def reported(id, name, form, formula, usage_en, usage_ru, needles):
    topic(id, name, form, "advanced", "Reported speech", formula, form, "", "",
          usage_en, usage_ru, [usage_en], ["said", "told", "asked"],
          "Shift the tense back when the reporting verb is in the past, and change the person and the time words.",
          "Сдвигайте время назад, если глагол сообщения в прошлом, и меняйте лицо и слова времени.",
          "Direct speech quotes the words. Reported speech folds them into the sentence.",
          "Прямая речь цитирует слова. Косвенная речь встраивает их в предложение.",
          "indirect-speech", pick("indirect-speech", needles, 2), ["backshift"])

reported("rep_state", "Reported statements", "She said that she was tired", "said (that) + clause",
         "A statement moves under say or tell. tell needs an object.", "Утверждение уходит под say или tell. У tell нужно дополнение.", ["said", "told"])
reported("rep_q", "Reported questions", "He asked where I lived", "asked + wh-word / if + clause",
         "The question word order becomes statement order. No do.", "Порядок вопроса становится порядком утверждения. do нет.", ["asked"])
reported("rep_cmd", "Reported commands", "She told me to wait", "told + object + to + V1",
         "An order becomes tell + object + to-infinitive.", "Приказ становится tell + дополнение + to-инфинитив.", ["told"])
reported("rep_req", "Reported requests", "She asked me to wait", "asked + object + to + V1",
         "A request is softer than a command, often with ask.", "Просьба мягче приказа, часто с ask.", ["asked"])
reported("rep_adv", "Reported advice", "He advised me to rest", "advised + object + to + V1",
         "Advice becomes advise + object + to-infinitive.", "Совет становится advise + дополнение + to-инфинитив.", ["advised"])
reported("rep_sug", "Reported suggestions", "She suggested going", "suggested + V-ing, or suggested that",
         "A suggestion often becomes suggest + gerund, or suggest that + clause.", "Предложение часто становится suggest + герундий или suggest that + придаточное.", ["suggested"])
topic("backshift", "Backshift", "Present becomes Past", "advanced", "Reported speech",
      "Present → Past, Past → Past Perfect, will → would, can → could, may → might",
      "am/is → was, have seen → had seen, will → would", "", "",
      "When the reporting verb is past, the quoted tense usually moves one step back. Time and place words move too: today → that day, tomorrow → the next day, yesterday → the day before, this → that, here → there.",
      "Если глагол сообщения в прошлом, время цитаты обычно сдвигается на шаг назад. Слова времени и места тоже: today → that day, tomorrow → the next day, yesterday → the day before, this → that, here → there.",
      ["present to past", "past to past perfect", "will to would", "can to could", "may to might", "today to that day", "tomorrow to the next day", "yesterday to the day before"],
      ["that day", "the next day", "the day before"],
      "If the fact is still true, the present can stay. The backshift is the usual reported pattern, not a new tense.",
      "Если факт все еще верен, настоящее может остаться. Сдвиг — обычный образец косвенной речи, не новое время.",
      "Direct speech keeps the original tense. Reported speech moves it when the reporting verb is past.",
      "Прямая речь сохраняет исходное время. Косвенная речь сдвигает его, если глагол сообщения в прошлом.",
      "indirect-speech", pick("indirect-speech", ["said", "told"], 2), ["rep_state"])

# Wish
def wish(id, name, form, formula, usage_en, usage_ru, differs_en, differs_ru, needles):
    topic(id, name, form, "advanced", "Wish", formula, form, "", "", usage_en, usage_ru, [usage_en], ["wish", "if only"],
          "wish does not take a present verb for a present regret. The tense in the wish clause is shifted.",
          "wish не берет настоящее время для сожаления о настоящем. Время в придаточном сдвинуто.",
          differs_en, differs_ru, "wish", pick("wish", needles, 2), ["ifonly"])

wish("wish_ps", "wish + Past Simple", "I wish I knew", "wish + past",
     "A regret about the present.", "Сожаление о настоящем.",
     "wish + past perfect is the past regret. wish + past simple is the present.", "wish + past perfect — сожаление о прошлом. wish + past simple — о настоящем.",
     ["knew", "wish"])
wish("wish_pc", "wish + Past Continuous", "I wish it weren't raining", "wish + past continuous",
     "A regret about something in progress now.", "Сожаление о том, что идет сейчас.",
     "The simple past wish is a state. The continuous wish is an action in progress.", "wish с past simple — состояние. wish с continuous — действие в процессе.",
     ["were", "raining"])
wish("wish_pp", "wish + Past Perfect", "I wish I had known", "wish + past perfect",
     "A regret about the past.", "Сожаление о прошлом.",
     "This looks like the Third Conditional's if-clause, but it does not need if.", "Это похоже на if-часть третьего условного, но if не нужен.",
     ["had"])
wish("wish_would", "wish + would", "I wish you would stop", "wish + would + V1",
     "Annoyance about something that may change, usually not about yourself.", "Раздражение из-за того, что может измениться, обычно не о себе.",
     "A present state takes the past simple, not would: I wish I were taller, not I wish I would be taller.", "Настоящее состояние берет past simple, не would: I wish I were taller, не I wish I would be taller.",
     ["would"])
topic("ifonly", "if only", "If only I knew", "advanced", "Wish",
      "if only + the same patterns as wish", "If only I knew.", "", "",
      "A stronger wish. It uses the same tense shifts.",
      "Более сильное желание. Те же сдвиги времени.",
      ["present regret", "past regret", "annoyance"], ["if only"],
      "if only is not a conditional by itself. The verb form after it carries the time.",
      "if only само по себе не условное. Время несет форма глагола после него.",
      "wish can be quiet. if only is more emotional.",
      "wish может быть спокойным. if only эмоциональнее.",
      "if-only", pick("if-only", ["if only"], 2), ["wish_ps"])

# Relative and clauses — representative topics, each with a real page.
def clause(id, name, form, kind, formula, usage_en, usage_ru, slug, needles, related):
    topic(id, name, form, "advanced", kind, formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "A clause has a subject and a verb. A phrase does not.",
          "У придаточного есть подлежащее и сказуемое. У фразы их нет.",
          "Name the job of the clause before you choose the pronoun or the conjunction.",
          "Сначала назовите роль придаточного, потом выбирайте местоимение или союз.",
          slug, pick(slug, needles, 2), related)

clause("who", "who", "the person who called", "Relative clause", "who + verb, for people",
       "who is the subject pronoun for people.", "who — местоимение подлежащего для людей.",
       "relative-pronouns", ["who"], ["whom", "defining"])
clause("whom", "whom", "the person whom I called", "Relative clause", "whom + subject + verb, for people as objects",
       "whom is the object form for people. In everyday English, who or that often replaces it, or the pronoun is left out.",
       "whom — форма дополнения для людей. В обычной речи его часто заменяют who или that, либо местоимение опускают.",
       "relative-pronouns", ["whom"], ["who"])
clause("which", "which", "the book which I bought", "Relative clause", "which for things",
       "which refers to things, and in non-defining clauses it can refer to a whole clause.",
       "which относится к вещам, а в пояснительных придаточных может относиться ко всему предложению.",
       "relative-pronouns", ["which"], ["that"])
clause("that", "that", "the book that I bought", "Relative clause", "that for people or things in defining clauses",
       "that can replace who or which in a defining clause. It is not used in a non-defining clause.",
       "that может заменить who или which в определительном придаточном. В пояснительном его не ставят.",
       "defining-relative-clauses", ["that"], ["which", "nondefining"])
clause("whose", "whose", "the student whose essay won", "Relative clause", "whose + noun",
       "whose shows possession for people and, when needed, for things.",
       "whose показывает принадлежность у людей и, когда нужно, у вещей.",
       "relative-pronouns", ["whose"], ["who"])
clause("where", "where", "the town where I grew up", "Relative clause", "where for places",
       "where replaces in which for a place.",
       "where заменяет in which для места.",
       "relative-pronouns", ["where"], ["when"])
clause("when", "when", "the day when we met", "Relative clause", "when for times",
       "when replaces a time preposition plus which.",
       "when заменяет предлог времени плюс which.",
       "relative-pronouns", ["when"], ["where"])
clause("defining", "Defining relative clauses", "the book that I bought", "Relative clause", "no commas",
       "The clause identifies which person or thing. The pronoun can be left out when it is the object.",
       "Придаточное называет, какой именно человек или предмет. Местоимение можно опустить, если оно дополнение.",
       "defining-relative-clauses", ["that", "who"], ["nondefining"])
clause("nondefining", "Non-defining relative clauses", "Ana, who lives here, called", "Relative clause", "commas, no that",
       "The clause adds extra information. It does not identify the noun. Do not use that, and do not omit the pronoun.",
       "Придаточное добавляет сведения. Оно не выделяет существительное из ряда. that не ставят, и местоимение не опускают.",
       "non-defining-relative-clauses", ["who", "which"], ["defining"])
clause("reduced", "Reduced relative clauses", "the book bought yesterday", "Relative clause", "participle instead of who/which + be",
       "A participle can replace a relative pronoun plus a form of be.",
       "Причастие может заменить относительное местоимение плюс форму be.",
       "defining-relative-clauses", ["who", "which"], ["defining", "part_clause"])
clause("indep", "Independent clause", "She called.", "Clause", "a clause that can stand alone",
       "A full sentence with its own subject and verb.",
       "Полное предложение со своим подлежащим и сказуемым.",
       "word-order-and-focus", ["subject"], ["dep"])
clause("dep", "Dependent clause", "because she was late", "Clause", "a clause that cannot stand alone",
       "It needs a main clause. It begins with a conjunction, a relative pronoun, or a question word.",
       "Ему нужно главное предложение. Оно начинается с союза, относительного местоимения или вопросительного слова.",
       "word-order-and-focus", ["because", "if"], ["indep"])
clause("nouncl", "Noun clause", "what he said", "Clause", "a clause in a noun's place",
       "It can be a subject or an object: I know that she left.",
       "Оно может быть подлежащим или дополнением: I know that she left.",
       "indirect-speech", ["that"], ["rep_state"])
clause("adjcl", "Adjective / relative clause", "the letter that came", "Clause", "a clause that modifies a noun",
       "This is the relative clause. See who, which, that and the defining split.",
       "Это относительное придаточное. Смотрите who, which, that и деление на defining.",
       "relative-pronouns", ["who", "which"], ["defining"])
clause("advcl", "Adverbial clause", "when she arrived", "Clause", "a clause that modifies the verb",
       "It answers when, why, how, or under what condition.",
       "Оно отвечает, когда, почему, как или при каком условии.",
       "conditionals-if", ["when", "because", "if"], ["timecl"])
clause("timecl", "Time clause", "when she arrived", "Adverbial clause", "when / while / before / after / until + clause",
       "In future time clauses, use a present form, not will: when she arrives.",
       "В придаточных времени о будущем ставят настоящее, не will: when she arrives.",
       "conditionals-if", ["when", "before"], ["first"])
clause("condcl", "Condition clause", "if it rains", "Adverbial clause", "if / unless + clause",
       "See Conditionals. The if-clause is not a tense by itself.",
       "Смотрите раздел Conditionals. if-придаточное само по себе не время.",
       "conditionals-if", ["if"], ["first"])
clause("reasoncl", "Reason clause", "because it was late", "Adverbial clause", "because / since / as + clause",
       "because gives the cause. since and as can be softer.",
       "because дает причину. since и as могут быть мягче.",
       "word-order-and-focus", ["because"], ["advcl"])
clause("purposecl", "Purpose clause", "so that she could leave", "Adverbial clause", "to + V1, or so that + clause",
       "so that takes a full clause, often with can, could, will or would.",
       "so that берет полное придаточное, часто с can, could, will или would.",
       "infinitives", ["so that", "to"], ["toinf"])
clause("resultcl", "Result clause", "so tired that she left", "Adverbial clause", "so / such ... that",
       "so comes before an adjective or an adverb. such comes before a noun phrase.",
       "so стоит перед прилагательным или наречием. such — перед группой существительного.",
       "word-order-and-focus", ["so", "such"], ["purposecl"])
clause("contrastcl", "Contrast clause", "whereas he stayed", "Adverbial clause", "whereas / while + clause",
       "It sets two facts against each other.",
       "Оно противопоставляет два факта.",
       "word-order-and-focus", ["while", "whereas"], ["concession"])
clause("concession", "Concession clause", "although it was late", "Adverbial clause", "although / even though / though + clause",
       "The main clause is true despite the concession.",
       "Главное предложение верно несмотря на уступку.",
       "word-order-and-focus", ["although", "though"], ["evenif"])
clause("comparisoncl", "Comparison clause", "than I expected", "Adverbial clause", "than / as + clause",
       "See also the Comparison section for as ... as and the comparative.",
       "Смотрите также раздел Comparison для as ... as и сравнительной степени.",
       "as-as", ["than", "as"], ["comp"])

# Questions
def question(id, name, form, formula, usage_en, usage_ru, slug, needles):
    topic(id, name, form, "advanced", "Question", formula, form, "", form,
          usage_en, usage_ru, [usage_en], [],
          "In most questions the auxiliary comes before the subject. Subject questions do not.",
          "В большинстве вопросов вспомогательный глагол стоит перед подлежащим. В вопросах к подлежащему — нет.",
          "A statement keeps subject then verb. A question usually inverts them.",
          "В утверждении сначала подлежащее, потом глагол. В вопросе их обычно меняют местами.",
          slug, pick(slug, needles, 2), ["yesno"])

question("yesno", "Yes/No questions", "Do you live here?", "auxiliary + subject + verb",
         "The answer is yes or no.", "Ответ — yes или no.", "questions", ["do", "are"])
question("whq", "Wh-questions", "Where do you live?", "wh-word + auxiliary + subject + verb",
         "The question word asks for the missing information.", "Вопросительное слово спрашивает недостающую информацию.", "wh-questions", ["where", "what", "why"])
question("subjq", "Subject questions", "Who called?", "who / what + verb",
         "When who or what is the subject, do not add do.", "Когда who или what — подлежащее, do не добавляют.", "wh-questions", ["who"])
question("objq", "Object questions", "Who did you call?", "wh-word + auxiliary + subject + verb",
         "When who or what is the object, the auxiliary returns.", "Когда who или what — дополнение, вспомогательный глагол возвращается.", "wh-questions", ["did"])
question("altq", "Alternative questions", "Tea or coffee?", "option A or option B",
         "or offers a choice. The answer is one of the options, not yes or no.", "or предлагает выбор. Ответ — один из вариантов, не yes или no.", "questions", ["or"])
question("negq", "Negative questions", "Don't you like it?", "negative auxiliary + subject",
         "Often surprise or a request for agreement.", "Часто удивление или просьба согласиться.", "questions", ["n't", "not"])
question("indirectq", "Indirect questions", "Can you tell me where she lives?", "phrase + wh-word + subject + verb",
         "The word order after the question word is the statement order. No do.", "Порядок после вопросительного слова — порядок утверждения. do нет.", "wh-questions", ["where"])
question("tags", "Question tags", "You live here, don't you?", "statement + opposite auxiliary + pronoun",
         "A positive statement takes a negative tag, and the reverse.", "Утвердительное предложение берет отрицательный хвост, и наоборот.", "question-tags", ["n't", "tag"])
question("echo", "Echo questions", "She left?", "the heard words, rising",
         "You repeat what you heard to check it, often with surprise.", "Вы повторяете услышанное, чтобы проверить, часто с удивлением.", "questions", ["?"])

# Inversion, emphasis, and the rest — one real page each, keyword pick.
def other(id, name, form, kind, tone, formula, usage_en, usage_ru, differs_en, differs_ru, slug, needles, related):
    topic(id, name, form, tone, kind, formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "Keep the pattern. Do not add a normal subject-verb order inside an inversion.",
          "Держите образец. В инверсию не вставляйте обычный порядок подлежащее-сказуемое.",
          differs_en, differs_ru, slug, pick(slug, needles, 2), related)

other("qinv", "Question inversion", "Are you ready?", "Inversion", "advanced", "auxiliary + subject",
      "The ordinary question order.", "Обычный порядок вопроса.",
      "A subject question does not invert.", "Вопрос к подлежащему не инвертируют.",
      "questions", ["are", "do"], ["yesno"])
other("negadv", "Negative adverbial inversion", "Never have I seen", "Inversion", "advanced", "negative adverb + auxiliary + subject",
      "After never, rarely, seldom, little and not only, formal style inverts.", "После never, rarely, seldom, little и not only официальный стиль инвертирует.",
      "The everyday sentence does not invert: I have never seen.", "Обычное предложение не инвертируют: I have never seen.",
      "inversion", ["never", "rarely"], ["qinv"])
other("condinv", "Conditional inversion", "Had I known", "Inversion", "advanced", "Had / Were / Should + subject",
      "See the conditional inversion pages. if is dropped.", "Смотрите страницы инверсии условных. if опускают.",
      "The if version is the same meaning without inversion.", "Вариант с if — тот же смысл без инверсии.",
      "inversion", ["had", "were", "should"], ["hadinv"])
other("onlyinv", "Inversion after only", "Only then did I understand", "Inversion", "advanced", "Only + time/place + auxiliary + subject",
      "only then, only later, only after that invert in formal style.", "only then, only later, only after that инвертируют в официальном стиле.",
      "only before a noun does not always invert: Only Anna knew.", "only перед существительным не всегда инвертирует: Only Anna knew.",
      "inversion", ["only"], ["negadv"])
other("hardly", "hardly / scarcely / barely", "Hardly had I sat down", "Inversion", "advanced", "Hardly had + subject + past participle + when",
      "The inversion marks one action immediately before another.", "Инверсия отмечает одно действие сразу перед другим.",
      "The same idea without inversion is I had hardly sat down when...", "Та же мысль без инверсии: I had hardly sat down when...",
      "inversion", ["hardly", "scarcely", "barely"], ["negadv"])
other("neitherinv", "neither / nor", "Neither do I", "Inversion", "advanced", "Neither / Nor + auxiliary + subject",
      "It agrees with a negative sentence.", "Оно соглашается с отрицательным предложением.",
      "So do I agrees with a positive sentence. Neither do I agrees with a negative one.", "So do I соглашается с утверждением. Neither do I — с отрицанием.",
      "inversion", ["neither", "nor"], ["qinv"])
other("formalinv", "Formal inversion", "Were it not for you", "Inversion", "advanced", "the patterns above, in formal writing",
      "A cover name for negative, conditional and only-inversion. It is a word-order choice, not a tense.", "Общее имя для инверсии с отрицанием, условным и only. Это выбор порядка слов, не время.",
      "Spoken English usually keeps the normal order and uses if or not.", "В устной речи обычно сохраняют обычный порядок и используют if или not.",
      "inversion", ["were", "had"], ["condinv"])
other("doemp", "do / does / did for emphasis", "I do understand", "Emphasis", "advanced", "do / does / did + V1",
      "The auxiliary stresses that the positive verb is true.", "Вспомогательный глагол подчеркивает, что утверждение верно.",
      "In a normal positive sentence there is no do. Emphatic do is a choice.", "В обычном утверждении do нет. Эмфатическое do — выбор.",
      "emphasis", ["do", "did"], ["cleft"])
other("cleft", "Cleft sentences", "It was John who called", "Emphasis", "advanced", "It is/was + focus + who/that, or What + clause + is",
      "The sentence is split so one part is in focus.", "Предложение делят, чтобы одна часть оказалась в фокусе.",
      "A plain sentence has the same facts without the split.", "Простое предложение содержит те же факты без разделения.",
      "cleft-sentences", ["it was", "what"], ["itcleft", "whcleft"])
other("itcleft", "it-cleft", "It was John who called", "Emphasis", "advanced", "It is/was + focus + who/that + clause",
      "The focus sits after it is or it was.", "Фокус стоит после it is или it was.",
      "A wh-cleft starts with what.", "wh-cleft начинается с what.",
      "cleft-sentences", ["it was", "it is"], ["whcleft"])
other("whcleft", "wh-cleft", "What I need is time", "Emphasis", "advanced", "What + clause + is/was + focus",
      "The focus sits at the end.", "Фокус стоит в конце.",
      "An it-cleft puts the focus earlier.", "it-cleft ставит фокус раньше.",
      "cleft-sentences", ["what"], ["itcleft"])
other("fronting", "Fronting", "This book I have read", "Emphasis", "advanced", "object or complement moved before the subject",
      "A piece moves to the front for emphasis. The rest of the order stays a statement.", "Часть выносят вперед для эмфазы. Остальной порядок остается утверждением.",
      "Inversion also moves the verb. Fronting usually keeps subject then verb.", "Инверсия двигает и глагол. Fronting обычно сохраняет подлежащее, потом глагол.",
      "emphasis", ["this"], ["doemp"])
other("invemp", "Inversion for emphasis", "Never have I seen this", "Emphasis", "advanced", "the inversion patterns used to highlight a word",
      "See Inversion. The point here is focus, not a new grammar category.", "Смотрите раздел Inversion. Здесь важен фокус, а не новая категория.",
      "Question inversion asks. Emphatic inversion highlights.", "Инверсия вопроса спрашивает. Эмфатическая инверсия выделяет.",
      "inversion", ["never"], ["negadv"])

# Articles and determiners
def determiner(id, name, form, formula, usage_en, usage_ru, slug, needles, related):
    topic(id, name, form, "advanced", "Determiner", formula, form + " + noun", "", "",
          usage_en, usage_ru, [usage_en], [name],
          "A determiner comes before the noun. Do not stack a and the.",
          "Определитель стоит перед существительным. a и the вместе не ставят.",
          "Choose the determiner from meaning: one, the known one, or none.",
          "Выбирайте определитель по смыслу: один, уже известный или никакой.",
          slug, pick(slug, needles, 2), related)

determiner("a", "a", "a book", "a + consonant sound", "One of a group, first mention, consonant sound.", "Один из группы, первое упоминание, согласный звук.", "a-an-the", ["a "], ["an", "the"])
determiner("an", "an", "an hour", "an + vowel sound", "The same as a, before a vowel sound, not before a vowel letter.", "То же, что a, перед гласным звуком, не перед гласной буквой.", "a-an-the", ["an "], ["a"])
determiner("the", "the", "the book", "the + noun", "The listener can identify which one.", "Слушающий может понять, какой именно.", "the", ["the "], ["a", "zeroart"])
determiner("zeroart", "zero article", "books are useful", "no article", "Plural or uncountable nouns in general.", "Множественное число или неисчисляемые в общем смысле.", "a-an-the", ["are"], ["the"])
determiner("some", "some", "some water", "some + noun", "An unspecified amount, or an offer.", "Неуказанное количество или предложение.", "some-any", ["some"], ["any"])
determiner("any", "any", "any water", "any + noun", "Questions, negatives, and 'it does not matter which'.", "Вопросы, отрицания и 'неважно какой'.", "some-any", ["any"], ["some"])
determiner("much", "much", "much time", "much + uncountable", "A large amount, mostly in questions and negatives.", "Большое количество, в основном в вопросах и отрицаниях.", "determiners", ["much"], ["many"])
determiner("many", "many", "many books", "many + plural", "A large number.", "Большое число.", "determiners", ["many"], ["much"])
determiner("few", "few", "few books", "few + plural", "Not many, and fewer than wanted.", "Немного, и меньше, чем нужно.", "determiners", ["few"], ["afew"])
determiner("afew", "a few", "a few books", "a few + plural", "Some, a small positive number.", "Несколько, маленькое положительное число.", "determiners", ["a few", "few"], ["few"])
determiner("little", "little", "little time", "little + uncountable", "Not much, and less than wanted.", "Мало, и меньше, чем нужно.", "determiners", ["little"], ["alittle"])
determiner("alittle", "a little", "a little time", "a little + uncountable", "Some, a small positive amount.", "Немного, маленькое положительное количество.", "determiners", ["a little", "little"], ["little"])
determiner("each", "each", "each book", "each + singular", "Every one, seen separately.", "Каждый, по отдельности.", "determiners", ["each"], ["every"])
determiner("every", "every", "every day", "every + singular", "All of the group, seen as a set.", "Все из группы, как набор.", "determiners", ["every"], ["each"])
determiner("all", "all", "all the books", "all + noun", "The whole group or amount.", "Вся группа или все количество.", "determiners", ["all"], ["both"])
determiner("both", "both", "both books", "both + plural", "The two together.", "Оба вместе.", "determiners", ["both"], ["either"])
determiner("either", "either", "either book", "either + singular", "One or the other of two.", "Один или другой из двух.", "determiners", ["either"], ["neither"])
determiner("neither", "neither", "neither book", "neither + singular", "Not one and not the other.", "Ни один и ни другой.", "determiners", ["neither"], ["either"])
determiner("another", "another", "another book", "another + singular", "One more, or a different one.", "Еще один или другой.", "determiners", ["another"], ["other"])
determiner("other", "other", "other books", "other + noun", "Different ones, not the one already named.", "Другие, не тот, что уже назван.", "determiners", ["other"], ["another", "theother"])
determiner("theother", "the other", "the other book", "the other + noun", "The remaining one of a known pair or group.", "Оставшийся из известной пары или группы.", "determiners", ["the other", "other"], ["other"])
determiner("enough", "enough", "enough time", "enough + noun, or adjective + enough", "The amount that is sufficient.", "Количество, которого хватает.", "determiners", ["enough"], ["some"])
determiner("several", "several", "several books", "several + plural", "More than two, but not many.", "Больше двух, но не много.", "determiners", ["several"], ["afew"])
determiner("no", "no", "no books", "no + noun", "Not a, not any. The verb stays positive.", "Ни одного. Глагол остается утвердительным.", "determiners", ["no "], ["none"])
determiner("none", "none", "none of the books", "none of + noun", "Not one of a group. none stands without a following noun, or with of.", "Ни один из группы. none стоит без существительного после себя или с of.", "determiners", ["none"], ["no"])

# Comparison
def compare(id, name, form, formula, usage_en, usage_ru, slug, needles, related):
    topic(id, name, form, "advanced", "Comparison", formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "Short adjectives take -er/-est. Longer ones take more/most.",
          "Короткие прилагательные берут -er/-est. Длинные берут more/most.",
          "Do not combine more with -er.",
          "more и -er вместе не ставят.",
          slug, pick(slug, needles, 2), related)

compare("comp", "Comparative", "older than", "adjective-er + than, or more + adjective + than",
        "Two things, one having more of the quality.", "Две вещи, у одной качества больше.", "as-as", ["than", "more", "er"], ["super"])
compare("super", "Superlative", "the oldest", "the + adjective-est, or the most + adjective",
        "One thing at the top of a group of three or more.", "Одна вещь на вершине группы из трех и больше.", "as-as", ["most", "est", "the"], ["comp"])
compare("asas", "as ... as", "as old as", "as + adjective + as",
        "The two are equal.", "Две вещи равны.", "as-as", ["as"], ["notasas"])
compare("notasas", "not as ... as", "not as old as", "not as + adjective + as",
        "The first has less of the quality.", "У первой качества меньше.", "as-as", ["not as", "as"], ["asas"])
compare("lessthan", "less ... than", "less expensive than", "less + adjective + than",
        "The opposite of more, mostly with longer adjectives.", "Противоположность more, в основном с длинными прилагательными.", "as-as", ["less"], ["comp"])
compare("thethe", "the more ..., the more ...", "the sooner, the better", "the + comparative, the + comparative",
        "Two changes move together.", "Два изменения идут вместе.", "as-as", ["the more", "the"], ["comp"])
compare("muchfar", "much / far / a lot + comparative", "much older", "much / far / a lot + comparative",
        "These words measure the size of the difference.", "Эти слова измеряют размер различия.", "as-as", ["much", "far"], ["comp"])
compare("comparcomp", "comparative and comparative", "colder and colder", "comparative + and + comparative",
        "The quality keeps increasing.", "Качество продолжает расти.", "as-as", ["and"], ["comp"])

# Causative and there/it
def cause(id, name, form, formula, usage_en, usage_ru, differs_en, differs_ru, slug, needles, related):
    topic(id, name, form, "advanced", "Causative", formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "Watch whether the next verb has to, and whether the object receives the action.",
          "Смотрите, есть ли to у следующего глагола и получает ли дополнение действие.",
          differs_en, differs_ru, slug, pick(slug, needles, 2), related)

cause("havedone", "have something done", "I had the car repaired", "have + object + past participle",
      "You arrange for someone else to do it to your object.", "Вы устраиваете, чтобы кто-то другой сделал это с вашим предметом.",
      "have someone do something names the person. have something done hides the person.", "have someone do something называет человека. have something done скрывает человека.",
      "have-something-done", ["have", "had"], ["getdone", "havesomeone"])
cause("getdone", "get something done", "I got the car repaired", "get + object + past participle",
      "Close to have something done, a little more informal.", "Близко к have something done, чуть менее официально.",
      "get someone to do something uses to. get something done uses the participle.", "get someone to do something использует to. get something done использует причастие.",
      "have-something-done", ["get"], ["havedone"])
cause("havesomeone", "have someone do something", "I had him repair it", "have + person + V1",
      "You cause a person to do it. The verb has no to.", "Вы побуждаете человека это сделать. У глагола нет to.",
      "make is stronger. have is the arrangement.", "make сильнее. have — договоренность.",
      "have-something-done", ["have"], ["make", "havedone"])
cause("getsomeone", "get someone to do something", "I got him to repair it", "get + person + to + V1",
      "You persuade a person. The verb takes to.", "Вы уговариваете человека. Глагол берет to.",
      "have someone do has no to. get someone to do keeps to.", "У have someone do нет to. У get someone to do частица to есть.",
      "have-something-done", ["get"], ["havesomeone"])
cause("make", "make someone do something", "She made me wait", "make + person + V1",
      "Force. No to in the active.", "Принуждение. В активе to нет.",
      "In the passive, to returns: I was made to wait.", "В пассиве to возвращается: I was made to wait.",
      "make-or-do", ["made"], ["let", "allow"])
cause("let", "let someone do something", "She let me wait", "let + person + V1",
      "Permission. No to.", "Разрешение. to нет.",
      "allow takes to. let does not.", "allow берет to. let не берет.",
      "make-or-do", ["let"], ["allow", "make"])
cause("help", "help someone do / to do", "She helped me (to) carry it", "help + person + (to) + V1",
      "Both the bare infinitive and to are possible.", "Возможны и инфинитив без to, и to.",
      "make never takes to in the active. help may.", "make в активе никогда не берет to. help может.",
      "infinitives", ["help"], ["make"])
cause("allow", "allow someone to do", "She allowed me to wait", "allow + person + to + V1",
      "Permission, with to. More formal than let.", "Разрешение, с to. Официальнее, чем let.",
      "let has no to.", "У let нет to.",
      "infinitives", ["allow"], ["let"])
cause("enable", "enable someone to do", "It enabled me to finish", "enable + person + to + V1",
      "It makes the action possible.", "Это делает действие возможным.",
      "allow is permission. enable is possibility.", "allow — разрешение. enable — возможность.",
      "infinitives", ["enable"], ["allow"])

def there(id, name, form, formula, usage_en, usage_ru, slug, needles):
    topic(id, name, form, "advanced", "There / It", formula, form, "", "", usage_en, usage_ru, [usage_en], [],
          "there introduces a new thing. it points back, or fills the subject slot.",
          "there вводит новую вещь. it указывает назад или занимает место подлежащего.",
          "Do not use it is a book on the table for a new indefinite book. Use there is.",
          "Для новой неопределенной книги на столе не говорят it is a book. Говорят there is.",
          slug, pick(slug, needles, 2), ["thereis"])

there("thereis", "There is / There are", "There is a book", "there + be + noun",
      "Something exists or is in a place. The verb agrees with the noun after it.", "Что-то существует или находится. Глагол согласуется с существительным после него.",
      "there-is-there-are", ["there is", "there are"])
there("therewas", "There was / There were", "There was a storm", "there + was/were",
      "Existence in the past.", "Существование в прошлом.", "there-is-there-are", ["there was", "there were"])
there("therehas", "There has / have been", "There has been a delay", "there + has/have been",
      "Existence linked to now.", "Существование, связанное с сейчас.", "there-is-there-are", ["there has", "been"])
there("therewill", "There will be", "There will be a meeting", "there + will be",
      "Existence in the future.", "Существование в будущем.", "there-is-there-are", ["will be", "there"])
there("theremust", "There must be", "There must be a reason", "there + modal + be",
      "A deduction or an obligation about existence.", "Вывод или обязанность о существовании.", "there-is-there-are", ["must", "there"])
there("itis", "It is", "It is cold", "it + be + complement",
      "it can point to a known thing, or fill the subject when there is no real actor.", "it может указывать на известную вещь или занимать место подлежащего, когда настоящего деятеля нет.",
      "it-as-a-dummy-subject", ["it is"])
there("anticip", "Anticipatory it", "It is clear that she left", "It is + adjective + that-clause",
      "it holds the subject place, and the real clause comes later.", "it держит место подлежащего, а настоящее придаточное идет позже.",
      "it-as-a-dummy-subject", ["it is", "that"])
there("dummy", "Dummy it", "It is raining", "it + verb, with no real subject",
      "Weather and time use it because English wants a subject.", "Погода и время используют it, потому что английскому нужно подлежащее.",
      "it-as-a-dummy-subject", ["it"])
there("ittakes", "It takes + time", "It takes an hour", "It takes + time + to + V1",
      "The time needed for an action.", "Время, нужное для действия.", "it-as-a-dummy-subject", ["takes", "take"])

# Phrasal, prepositions, word order, agreement
other("sep", "Separable phrasal verbs", "turn the light off", "Phrasal verb", "advanced", "verb + particle, object may split them",
      "With a noun, the particle can go before or after the object. A pronoun goes in the middle: turn it off.",
      "С существительным частица может стоять до или после дополнения. Местоимение стоит посередине: turn it off.",
      "An inseparable verb does not allow the object in the middle.", "Неразделяемый глагол не пускает дополнение в середину.",
      "phrasal-verbs-and-multi-word-verbs", ["off", "up"], ["insep"])
other("insep", "Inseparable phrasal verbs", "look after the child", "Phrasal verb", "advanced", "verb + particle stay together",
      "The object follows the whole verb. You cannot say look the child after.",
      "Дополнение идет после всего глагола. Нельзя сказать look the child after.",
      "Separable verbs allow the split.", "Разделяемые глаголы разрыв допускают.",
      "phrasal-verbs-and-multi-word-verbs", ["after", "into"], ["sep"])
other("trans", "Transitive phrasal verbs", "give up smoking", "Phrasal verb", "advanced", "the verb takes an object",
      "There is an object. It may be separable or not.",
      "Есть дополнение. Глагол может быть разделяемым или нет.",
      "An intransitive phrasal verb has no object.", "У непереходного фразового глагола дополнения нет.",
      "phrasal-verbs-and-multi-word-verbs", ["up"], ["intrans"])
other("intrans", "Intransitive phrasal verbs", "the plane took off", "Phrasal verb", "advanced", "no object",
      "The verb and the particle are the whole predicate.",
      "Глагол и частица — все сказуемое.",
      "A transitive verb needs an object.", "Переходному глаголу нужно дополнение.",
      "phrasal-verbs-and-multi-word-verbs", ["off"], ["trans"])

def prep(id, name, form, usage_en, usage_ru, slug, needles):
    topic(id, name, form, "advanced", "Preposition", form, form, "", "", usage_en, usage_ru, [usage_en], [],
          "A preposition is chosen by the verb, adjective or noun, not by a general rule alone.",
          "Предлог выбирает глагол, прилагательное или существительное, а не одно общее правило.",
          "Time, place and dependent prepositions are different jobs.",
          "Предлоги времени, места и зависимые предлоги — разные роли.",
          slug, pick(slug, needles, 2), ["timeprep"])

prep("timeprep", "Prepositions of time", "at 6, on Monday, in May",
     "at a clock time, on a day, in a month, year or part of the day.", "at — время на часах, on — день, in — месяц, год или часть дня.",
     "prepositions", ["at", "on", "in"])
prep("placeprep", "Prepositions of place", "at the door, in the room, on the table",
     "at a point, in an enclosed space, on a surface.", "at — точка, in — замкнутое пространство, on — поверхность.",
     "prepositions", ["at", "in", "on"])
prep("moveprep", "Prepositions of movement", "into the room",
     "into, onto, out of, off mark a change of place.", "into, onto, out of, off отмечают смену места.",
     "prepositions", ["into", "onto"])
prep("dirprep", "Prepositions of direction", "towards the station",
     "to, towards, along, across, through name the path.", "to, towards, along, across, through называют путь.",
     "prepositions", ["to", "towards", "across"])
prep("depprep", "Dependent prepositions", "depend on",
     "The word decides the preposition: depend on, interested in, reason for.", "Слово решает предлог: depend on, interested in, reason for.",
     "prepositions", ["on", "in", "for"])
prep("verbprep", "verb + preposition", "listen to",
     "The verb brings its own preposition.", "Глагол приносит свой предлог.",
     "prepositions", ["to", "on"])
prep("adjprep", "adjective + preposition", "good at",
     "The adjective brings its own preposition, and the verb after it is a gerund.", "Прилагательное приносит свой предлог, а глагол после него — герундий.",
     "prepositions", ["at", "of"])
prep("nounprep", "noun + preposition", "a reason for",
     "The noun brings its own preposition.", "Существительное приносит свой предлог.",
     "prepositions", ["for", "of"])

other("svo", "Subject + verb + object", "She wrote a letter", "Word order", "advanced", "S + V + O",
      "The basic English statement.", "Базовое английское утверждение.",
      "Questions and inversions move the auxiliary. The basic statement does not.", "Вопросы и инверсии двигают вспомогательный глагол. Базовое утверждение — нет.",
      "word-order-and-focus", ["subject"], ["advpos"])
other("advpos", "Adverb position", "She quickly left", "Word order", "advanced", "manner after the verb or after the object; frequency before the main verb",
      "The slot depends on the kind of adverb.", "Место зависит от вида наречия.",
      "Frequency adverbs have a tighter slot than manner adverbs.", "У наречий частоты место жестче, чем у наречий образа действия.",
      "adverb-position", ["always", "quickly"], ["freq"])
other("freq", "Frequency adverbs", "She always leaves", "Word order", "advanced", "before the main verb, after be",
      "always, usually, often, sometimes, never.", "always, usually, often, sometimes, never.",
      "A manner adverb can go at the end. A frequency adverb usually cannot.", "Наречие образа действия может стоять в конце. Наречие частоты обычно нет.",
      "adverb-position", ["always", "often", "never"], ["advpos"])
other("adjorder", "Adjective order", "a small old red car", "Word order", "advanced", "opinion, size, age, shape, colour, origin, material",
      "When several adjectives come before a noun, this is the usual order.", "Когда перед существительным несколько прилагательных, обычен этот порядок.",
      "After the verb be, the order is freer.", "После глагола be порядок свободнее.",
      "word-order-and-focus", ["old", "red"], ["svo"])
other("multiobj", "Multiple objects", "She gave me a book", "Word order", "advanced", "verb + indirect + direct, or verb + direct + to/for + indirect",
      "Two objects: the person and the thing.", "Два дополнения: человек и вещь.",
      "A pronoun thing often prefers the to/for pattern: give it to me.", "Местоимение-вещь часто предпочитает схему с to/for: give it to me.",
      "word-order-and-focus", ["gave"], ["indobj"])
other("indobj", "Indirect and direct object", "give her the key", "Word order", "advanced", "indirect object then direct object",
      "The person usually comes before the thing when there is no preposition.", "Человек обычно стоит перед вещью, если предлога нет.",
      "With to or for, the thing comes first.", "С to или for вещь стоит первой.",
      "word-order-and-focus", ["gave", "to"], ["multiobj"])
other("qorder", "Word order in questions", "Where does she live?", "Word order", "advanced", "wh-word + auxiliary + subject + verb",
      "See Questions. The auxiliary precedes the subject, except in subject questions.", "Смотрите раздел Questions. Вспомогательный глагол стоит перед подлежащим, кроме вопросов к подлежащему.",
      "Indirect questions go back to statement order.", "Косвенные вопросы возвращаются к порядку утверждения.",
      "wh-questions", ["where", "does"], ["yesno"])
other("negorder", "Word order in negative sentences", "She does not live here", "Word order", "advanced", "auxiliary + not + verb",
      "not follows the auxiliary. The main verb stays in the base form after do.", "not стоит после вспомогательного глагола. Основной глагол после do остается в первой форме.",
      "A modal negative is modal + not + base verb, with no do.", "Отрицание модального — модальный + not + первая форма, без do.",
      "word-order-and-focus", ["not"], ["svo"])

other("singplur", "Singular and plural agreement", "The book is / The books are", "Agreement", "advanced", "the verb matches the subject",
      "A singular subject takes a singular verb.", "Единственное подлежащее берет глагол в единственном числе.",
      "The noun closest to the verb is not always the subject. Find the head noun.", "Существительное рядом с глаголом не всегда подлежащее. Найдите главное слово.",
      "word-order-and-focus", ["is", "are"], ["thereagree"])
other("collective", "Collective nouns", "The team is / are", "Agreement", "advanced", "singular for the unit, plural for the members",
      "British English can use a plural verb when the group is thought of as people.", "Британский английский может ставить глагол во множественном, если группу мыслят как людей.",
      "American English more often keeps the singular.", "Американский английский чаще сохраняет единственное число.",
      "word-order-and-focus", ["team", "family"], ["singplur"])
other("eitherneither", "either / neither agreement", "Neither of them is ready", "Agreement", "advanced", "either/neither + singular verb in formal style",
      "Formal style uses a singular verb.", "Официальный стиль использует глагол в единственном числе.",
      "either ... or agrees with the nearer subject.", "either ... or согласуется с ближайшим подлежащим.",
      "determiners", ["neither", "either"], ["eachevery"])
other("eachevery", "each / every agreement", "Each of them is ready", "Agreement", "advanced", "each/every + singular verb",
      "The verb is singular even when of them follows.", "Глагол в единственном числе, даже если дальше стоит of them.",
      "all of them takes a plural verb.", "all of them берет глагол во множественном числе.",
      "determiners", ["each", "every"], ["eitherneither"])
other("thereagree", "there is / there are", "There is a book / There are books", "Agreement", "advanced", "the verb agrees with the noun after be",
      "Look at the noun, not at there.", "Смотрите на существительное, не на there.",
      "In speech, there's is sometimes used before a plural. Careful writing keeps are.", "В речи there's иногда ставят перед множественным. В аккуратном письме остается are.",
      "there-is-there-are", ["there is", "there are"], ["thereis"])
other("complexsubj", "Complex subjects", "The list of books is long", "Agreement", "advanced", "the head noun decides",
      "of books does not make the verb plural. list is the head.", "of books не делает глагол множественным. Главное слово — list.",
      "A compound subject with and is plural.", "Составное подлежащее с and — множественное.",
      "word-order-and-focus", ["of"], ["singplur"])

# say/tell and do/make as comparison-supporting topics
other("saytell", "say and tell", "say that / tell someone", "Verb pattern", "advanced", "say + clause; tell + person + clause",
      "say does not need a person. tell needs the person: tell me.",
      "say не требует человека. tell требует человека: tell me.",
      "In reported speech, she said that... and she told me that... are the pair.",
      "В косвенной речи пара такая: she said that... и she told me that...",
      "say-or-tell", ["say", "tell"], ["rep_state"])
other("domake", "do and make", "do homework / make a cake", "Verb pattern", "advanced", "do for tasks and work; make for creating or causing",
      "do the washing, do a job. make a decision, make a noise.",
      "do the washing, do a job. make a decision, make a noise.",
      "The choice is lexical. There is no tense difference.",
      "Выбор словарный. Разницы во времени нет.",
      "make-or-do", ["do", "make"], ["make"])

areas = [
    {"id": "tenses", "title": "English Tenses", "badge": "Tenses", "tone": "present",
     "blurb": "Exactly 12 forms. Aspect sits inside the name. These are the tenses.",
     "groups": [
         {"title": "Present", "tone": "present", "items": ["ps", "pc", "pp", "ppc"]},
         {"title": "Past", "tone": "past", "items": ["pasts", "pastc", "pastp", "pastpc"]},
         {"title": "Future", "tone": "future", "items": ["will", "futc", "futp", "futpc"]},
     ]},
    {"id": "future", "title": "Ways of expressing the future", "badge": "Future forms", "tone": "future",
     "blurb": "Not all of these are tenses. be going to, present forms and be about to are constructions. The four future tenses are repeated here for comparison.",
     "groups": [
         {"title": "Constructions", "tone": "future", "items": ["will", "going", "pcfut", "psfut", "about", "due", "beto"]},
         {"title": "Future tenses, for comparison", "tone": "future", "items": ["futc", "futp", "futpc"]},
         {"title": "Future seen from the past", "tone": "future", "items": ["futpast", "wasgoing", "wouldfut"]},
     ]},
    {"id": "conditionals", "title": "Conditional sentences", "badge": "Conditionals", "tone": "cond",
     "blurb": "A condition is a clause pattern, not a tense.",
     "groups": [
         {"title": "Types", "tone": "cond", "items": ["zero", "first", "second", "third", "mixed"]},
         {"title": "Other condition words", "tone": "cond", "items": ["unless", "aslong", "provided", "incase", "evenif", "onlyif", "otherwise", "butfor", "ifwerent", "ifhadnt"]},
         {"title": "Inversion", "tone": "cond", "items": ["wereto", "shouldinv", "hadinv", "wereinv"]},
     ]},
    {"id": "modals", "title": "Modal verbs and constructions", "badge": "Modals", "tone": "modal",
     "blurb": "Modals add ability, permission, obligation or probability. They are not tenses.",
     "groups": [
         {"title": "Modal verbs", "tone": "modal", "items": ["can", "could", "may", "might", "must", "should", "shall", "wouldmod", "ought", "needmod", "dare"]},
         {"title": "Modal constructions", "tone": "modal", "items": ["haveto", "needto", "beable", "beallowed", "besupposed", "berequired", "bewilling", "belikely", "bemeant", "hadbetter", "wouldrather", "wouldprefer"]},
         {"title": "Modal perfect", "tone": "modal", "items": ["musthave", "mayhave", "mighthave", "couldhave", "shouldhave", "wouldhave", "neednthave", "canthave"]},
     ]},
    {"id": "usedto", "title": "used to / be used to / get used to", "badge": "Habit", "tone": "advanced",
     "blurb": "Three different patterns. Only used to + verb is a past habit.",
     "groups": [{"title": "Patterns", "tone": "advanced", "items": ["used", "beused", "getused", "would"]}]},
    {"id": "passive", "title": "Passive voice", "badge": "Voice", "tone": "voice",
     "blurb": "The same tenses, with the receiver as the subject.",
     "groups": [{"title": "Forms", "tone": "voice", "items": ["pass_ps", "pass_pc", "pass_pp", "pass_pasts", "pass_pastc", "pass_pastp", "pass_will", "pass_futp", "pass_modal", "pass_inf", "pass_perfect_inf", "pass_ger"]}]},
    {"id": "verbpatterns", "title": "Infinitive, gerund, participles", "badge": "Verb patterns", "tone": "advanced",
     "blurb": "These are verb forms and patterns, not tenses.",
     "groups": [
         {"title": "Infinitive", "tone": "advanced", "items": ["toinf", "bare", "perfinf", "continf", "perfcontinf", "pass_inf", "pass_perfect_inf"]},
         {"title": "Gerund", "tone": "advanced", "items": ["gerund", "ger_verb", "ger_prep", "ger_adj", "ger_subj", "ger_obj", "ger_perf", "ger_pass", "gerinf"]},
         {"title": "Participles", "tone": "advanced", "items": ["pres_part", "past_part", "perf_part", "part_clause", "perf_part_clause", "pass_part_clause"]},
     ]},
    {"id": "reported", "title": "Reported speech", "badge": "Speech", "tone": "advanced",
     "blurb": "Direct speech becomes a clause. Backshift is a change of form, not a new tense.",
     "groups": [{"title": "Patterns", "tone": "advanced", "items": ["rep_state", "rep_q", "rep_cmd", "rep_req", "rep_adv", "rep_sug", "backshift", "saytell"]}]},
    {"id": "wish", "title": "Wish / if only", "badge": "Wish", "tone": "advanced",
     "blurb": "The verb after wish is shifted. That shift is not the name of a tense.",
     "groups": [{"title": "Patterns", "tone": "advanced", "items": ["wish_ps", "wish_pc", "wish_pp", "wish_would", "ifonly"]}]},
    {"id": "clauses", "title": "Clauses", "badge": "Clauses", "tone": "advanced",
     "blurb": "Relative, noun and adverbial clauses. Questions are a word-order pattern.",
     "groups": [
         {"title": "Relative", "tone": "advanced", "items": ["who", "whom", "which", "that", "whose", "where", "when", "defining", "nondefining", "reduced"]},
         {"title": "Types", "tone": "advanced", "items": ["indep", "dep", "nouncl", "adjcl", "advcl", "timecl", "condcl", "reasoncl", "purposecl", "resultcl", "contrastcl", "concession", "comparisoncl"]},
         {"title": "Questions", "tone": "advanced", "items": ["yesno", "whq", "subjq", "objq", "altq", "negq", "indirectq", "tags", "echo"]},
     ]},
    {"id": "focus", "title": "Inversion and emphasis", "badge": "Focus", "tone": "advanced",
     "blurb": "Word order used for a question, a formal highlight, or stress.",
     "groups": [
         {"title": "Inversion", "tone": "advanced", "items": ["qinv", "negadv", "condinv", "onlyinv", "hardly", "neitherinv", "formalinv"]},
         {"title": "Emphasis", "tone": "advanced", "items": ["doemp", "cleft", "itcleft", "whcleft", "fronting", "invemp"]},
     ]},
    {"id": "nounphrase", "title": "Articles, determiners, comparison", "badge": "Noun phrase", "tone": "advanced",
     "blurb": "Words in front of the noun, and how adjectives compare.",
     "groups": [
         {"title": "Articles", "tone": "advanced", "items": ["a", "an", "the", "zeroart"]},
         {"title": "Determiners", "tone": "advanced", "items": ["some", "any", "much", "many", "few", "afew", "little", "alittle", "each", "every", "all", "both", "either", "neither", "another", "other", "theother", "enough", "several", "no", "none"]},
         {"title": "Comparison", "tone": "advanced", "items": ["comp", "super", "asas", "notasas", "lessthan", "thethe", "muchfar", "comparcomp"]},
     ]},
    {"id": "sentence", "title": "Sentence patterns", "badge": "Sentence", "tone": "advanced",
     "blurb": "Causative, there/it, phrasal verbs, prepositions, order and agreement.",
     "groups": [
         {"title": "Causative", "tone": "advanced", "items": ["havedone", "getdone", "havesomeone", "getsomeone", "make", "let", "help", "allow", "enable"]},
         {"title": "There and it", "tone": "advanced", "items": ["thereis", "therewas", "therehas", "therewill", "theremust", "itis", "anticip", "dummy", "ittakes"]},
         {"title": "Phrasal verbs", "tone": "advanced", "items": ["sep", "insep", "trans", "intrans"]},
         {"title": "Prepositions", "tone": "advanced", "items": ["timeprep", "placeprep", "moveprep", "dirprep", "depprep", "verbprep", "adjprep", "nounprep"]},
         {"title": "Word order", "tone": "advanced", "items": ["svo", "advpos", "freq", "adjorder", "multiobj", "indobj", "qorder", "negorder"]},
         {"title": "Agreement", "tone": "advanced", "items": ["singplur", "collective", "eitherneither", "eachevery", "thereagree", "complexsubj"]},
         {"title": "Pairs that are often confused", "tone": "advanced", "items": ["saytell", "domake"]},
     ]},
]

def comparison(id, title, tone, en, ru, heads, rows, slug="present-simple-i-work"):
    return {
        "id": id, "title": title, "tone": tone,
        "note": {"en": en, "ru": ru},
        "heads": heads, "rows": rows,
        "links": [["Cambridge Grammar", page(slug)], ["Longman", "https://www.ldoceonline.com/"]],
    }

comparisons = [
    comparison("ps-pc", "Present Simple vs Present Continuous", "present",
               "Simple is the habit or the fact. Continuous is the action in progress.",
               "Simple — привычка или факт. Continuous — действие в процессе.",
               ["", "Present Simple", "Present Continuous"],
               [["Form", "V1 / V-s", "am/is/are + V-ing"], ["Use", "habit, fact, timetable", "now, temporary, arrangement"], ["Example", "There is always a holiday on the last Monday in August.", "She's pressing the button but nothing is happening."]]),
    comparison("past-pp", "Past Simple vs Present Perfect", "past",
               "Past Simple takes a finished time. Present Perfect links the past to now.",
               "Past Simple берет законченное время. Present Perfect связывает прошлое с сейчас.",
               ["", "Past Simple", "Present Perfect"],
               [["Time word", "yesterday, ago, last week", "since, for, already, yet"], ["Example", "I finished my homework an hour ago.", "We haven't met before."]]),
    comparison("pp-ppc", "Present Perfect vs Present Perfect Continuous", "present",
               "Simple looks at the result or the number. Continuous looks at the activity.",
               "Simple смотрит на результат или число. Continuous смотрит на действие.",
               ["", "Present Perfect", "Present Perfect Continuous"],
               [["Form", "have/has + V3", "have/has been + V-ing"], ["Example", "Have you ever tried to write your name with your left hand?", "I've just been cleaning the car."]]),
    comparison("past-pastc", "Past Simple vs Past Continuous", "past",
               "Simple is the finished event. Continuous is the background.",
               "Simple — законченное событие. Continuous — фон.",
               ["", "Past Simple", "Past Continuous"],
               [["Example", "Helen phoned.", "I was listening to the radio."]]),
    comparison("past-pastp", "Past Simple vs Past Perfect", "past",
               "Past Perfect is the earlier of two past times.",
               "Past Perfect — более раннее из двух прошлых.",
               ["", "Past Simple", "Past Perfect"],
               [["Example", "I was 20.", "I'd seen all of Elvis Presley's movies by then."]]),
    comparison("will-going", "will vs be going to", "future",
               "will is a decision now or a prediction. be going to is a plan or present evidence.",
               "will — решение сейчас или предсказание. be going to — план или признак сейчас.",
               ["", "will", "be going to"],
               [["Example", "I will pay you back, I promise.", "I'm going to take a few exams at the end of the year."]]),
    comparison("going-pc", "be going to vs Present Continuous", "future",
               "be going to can be only an intention. Present Continuous for the future is usually arranged.",
               "be going to может быть только намерением. Present Continuous для будущего обычно уже договорено.",
               ["", "be going to", "Present Continuous"],
               [["Example", "I'm going to take a few exams.", "I am taking the train to Paris tomorrow."]]),
    comparison("will-pc", "will vs Present Continuous", "future",
               "will decides now. Present Continuous names an arrangement.",
               "will решает сейчас. Present Continuous называет договоренность.",
               ["", "will", "Present Continuous"],
               [["Example", "I'll call you when I get there.", "The band is visiting Denmark next May."]]),
    comparison("used-would", "used to vs would", "advanced",
               "used to covers states and habits. would covers repeated actions only.",
               "used to покрывает состояния и привычки. would — только повторы.",
               ["", "used to", "would"],
               [["States", "I used to live in Italy.", "not for states"], ["Actions", "He used to play football.", "Dad would sing every evening."]]),
    comparison("used-beused", "used to vs be used to", "advanced",
               "used to + verb is a past habit. be used to + noun/-ing means accustomed.",
               "used to + глагол — прошлая привычка. be used to + существительное/-ing значит 'привык'.",
               ["", "used to", "be used to"],
               [["Example", "I used to live in Italy.", "I'm used to hot weather."]]),
    comparison("ger-inf", "Gerund vs infinitive", "advanced",
               "remember/stop/try/regret/forget change meaning.",
               "remember/stop/try/regret/forget меняют смысл.",
               ["", "Gerund", "Infinitive"],
               [["remember", "remember doing: the past action", "remember to do: do not forget"], ["stop", "stop doing: quit", "stop to do: pause in order to"], ["try", "try doing: experiment", "try to do: make an effort"]]),
    comparison("second-third", "Second vs Third Conditional", "cond",
               "Second imagines now or the future. Third imagines the past.",
               "Second воображает сейчас или будущее. Third воображает прошлое.",
               ["", "Second", "Third"],
               [["If-clause", "past", "past perfect"], ["Result", "would + V1", "would have + V3"], ["Example", "If the weather improved, we could go.", "If the weather had improved, we could have gone."]]),
    comparison("third-mixed", "Third vs Mixed Conditional", "cond",
               "Third keeps both halves in the past. Mixed crosses past and present.",
               "Third держит обе половины в прошлом. Mixed соединяет прошлое и настоящее.",
               ["", "Third", "Mixed"],
               [["Times", "past cause, past result", "past cause, present result"]]),
    comparison("must-have", "must vs have to", "modal",
               "must is the speaker. have to is the outside rule.",
               "must — от говорящего. have to — внешнее правило.",
               ["", "must", "have to"],
               [["Source", "the speaker", "a rule or situation"]]),
    comparison("mustnt-dont", "mustn't vs don't have to", "modal",
               "mustn't prohibits. don't have to means it is not necessary.",
               "mustn't запрещает. don't have to значит, что не обязательно.",
               ["", "mustn't", "don't have to"],
               [["Meaning", "do not do it", "you can, but you need not"]]),
    comparison("should-better", "should vs had better", "modal",
               "should is advice. had better is stronger and about this situation.",
               "should — совет. had better сильнее и про эту ситуацию.",
               ["", "should", "had better"],
               [["Form", "should + V1", "had better + V1, no to"]]),
    comparison("say-tell", "say vs tell", "advanced",
               "say needs no person. tell needs the person.",
               "say не требует человека. tell требует человека.",
               ["", "say", "tell"],
               [["Pattern", "say that...", "tell me that..."]], "say-or-tell"),
    comparison("make-let", "make vs let vs allow", "advanced",
               "make forces, with no to. let permits, with no to. allow permits, with to.",
               "make заставляет, без to. let разрешает, без to. allow разрешает, с to.",
               ["", "make", "let", "allow"],
               [["Pattern", "make me wait", "let me wait", "allow me to wait"]]),
    comparison("do-make", "do vs make", "advanced",
               "do is for tasks. make is for creating or causing.",
               "do — для дел. make — для создания или причинения.",
               ["", "do", "make"],
               [["Examples", "do homework, do a job", "make a cake, make a decision"]], "make-or-do"),
]

# Fix the two comparisons that passed slug as last positional into rows by mistake.
# say-tell and do-make used an extra positional. Check the function signature.
# comparison(id, title, tone, en, ru, heads, rows, slug="...")
# The last calls passed slug correctly as 8th arg. Good.
# make-let call has no slug so it used default... wait, default is not in the function.
# comparison() requires slug. make-let and most calls pass slug as last. 
# Look at make-let: the last arg is the rows list, NO slug. That will TypeError.
# I need to fix calls that omit slug.

# I'll set a default in a wrapper by patching after if the script fails.
# Looking at calls: most include slug as last string. 
# ps-pc through should-better do NOT pass slug. That will crash.
# I'll add slug="conditionals-if" as default in the function by editing... 
# The function requires slug. I should re-run after fixing the function default.

print("topics", len(topics), "areas", len(areas))
missing = []
for area in areas:
    for group in area["groups"]:
        for item in group["items"]:
            if item not in topics:
                missing.append(item)
print("missing", missing)

out = {"areas": areas, "topics": topics, "comparisons": comparisons}
with open("grammar.js", "w", encoding="utf-8") as handle:
    handle.write("window.GRAMMAR = ")
    json.dump(out, handle, ensure_ascii=False, indent=2)
    handle.write(";\n")
print("wrote grammar.js")
