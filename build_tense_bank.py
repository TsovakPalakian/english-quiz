#!/usr/bin/env python3
"""Collect real tense examples and time-marker glosses for the quiz preview.

Sources: Cambridge Grammar, Cambridge Dictionary, Oxford Learner's Dictionaries, Wooordhunt.
Writes tense-bank.json next to this file. Does not invent sentences.
"""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape

import lookup_server as look

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tense-bank.json")
GRAMMAR = "https://dictionary.cambridge.org/grammar/british-grammar/"

DIRECT = {
    "ps": ["present-simple-i-work", "present-simple-or-present-continuous"],
    "pc": ["present-continuous-i-am-working", "present-simple-or-present-continuous"],
    "pp": ["present-perfect-simple-i-have-worked", "present-perfect-simple-or-present-perfect-continuous", "past-simple-or-present-perfect"],
    "ppc": ["present-perfect-continuous-i-have-been-working", "present-perfect-simple-or-present-perfect-continuous"],
    "pasts": ["past-simple-i-worked", "past-simple-or-present-perfect", "past-continuous-or-past-simple"],
    "pastc": ["past-continuous-i-was-working", "past-continuous-or-past-simple"],
    "pastp": ["past-perfect-simple-i-had-worked"],
    "pastpc": ["past-perfect-continuous-i-had-been-working"],
    "will": ["future-will-and-shall", "will", "shall"],
    "going": ["future-be-going-to-i-am-going-to-work", "going-to"],
    "futc": ["future-continuous-i-will-be-working"],
    "futp": ["future-perfect-simple-i-will-have-worked-eight-hours"],
    "futpc": ["future-perfect-continuous-i-will-have-been-working-here-ten-years"],
    "pcfut": ["future-present-continuous-to-talk-about-the-future-i-m-working-tomorrow"],
    "psfut": ["future-present-simple-to-talk-about-the-future-i-work-tomorrow"],
    "futother": ["future-other-expressions-to-talk-about-the-future"],
    "futpast": ["future-in-the-past"],
    "used": ["used-to"],
    "would": ["used-to", "would"],
    "beused": ["word-choice-used-to-and-be-used-to"],
    "gerund": ["verbs-followed-by-ing", "like-love-hate-prefer", "enjoy"],
    "inf": ["to-infinitive", "infinitive", "would-like", "like-love-hate-prefer"],
    "gerinf": ["verbs-followed-by-ing", "like-love-hate-prefer"],
    "markers": ["already", "yet", "just", "since", "for", "ago"],
}

CLASSIFY_PAGES = [
    "already", "yet", "just", "since", "for", "ago", "always", "now",
    "future-typical-errors", "present-perfect-typical-errors", "past-typical-errors", "present-typical-errors",
]

MARKERS = {
    "ps": ["always", "usually", "often", "sometimes", "never", "every day"],
    "pc": ["now", "at the moment", "today", "these days", "currently"],
    "pp": ["already", "yet", "just", "ever", "never", "since", "for", "recently", "still"],
    "ppc": ["for", "since", "all day", "lately", "recently"],
    "pasts": ["yesterday", "ago", "last week", "last year", "then"],
    "pastc": ["while", "when", "all morning"],
    "pastp": ["before", "after", "already", "just", "by the time"],
    "pastpc": ["for", "since", "before", "all day"],
    "will": ["tomorrow", "soon", "later", "probably"],
    "going": ["tomorrow", "tonight", "soon"],
    "futc": ["tomorrow", "at this time"],
    "futp": ["by", "by then", "by the time"],
    "futpc": ["by", "for"],
    "pcfut": ["tomorrow", "tonight", "next week"],
    "psfut": ["tomorrow", "at", "on"],
    "futother": ["about to", "due to"],
    "futpast": ["would", "was going to", "the next day"],
    "used": ["used to"],
    "would": ["would", "every day"],
    "beused": ["be used to", "get used to"],
    "gerund": [],
    "inf": [],
    "gerinf": [],
    "markers": ["since", "for", "ago", "already", "yet", "just"],
}

VERBS = [
    "work", "live", "wait", "study", "rain", "finish", "leave", "start", "play", "watch",
    "read", "write", "talk", "walk", "learn", "teach", "call", "stay", "meet", "sleep",
    "drive", "eat", "buy", "open", "visit", "travel", "cook", "help", "look", "try",
    "ask", "know", "think", "feel", "become", "give", "take", "make", "go", "come",
    "see", "get", "say", "tell", "want", "need", "hope", "decide", "enjoy", "remember",
    "stop", "keep", "move", "change", "happen", "arrive", "return", "spend",     "lose", "win", "have", "do", "will", "would", "shall", "since", "already", "just",
    "yet", "before", "after", "while", "still", "always", "never", "today", "tomorrow",
    "yesterday", "soon", "later", "now", "then", "when", "until", "during",
]

PARTICIPLE = set("""
been gone done seen taken made given written spoken eaten drunk come become known left felt kept
met found told thought brought bought caught taught built sent spent lost won run begun broken
chosen driven fallen forgotten got gotten heard held hidden hit hurt led let lit meant paid put
read ridden risen said sold shot shown shut sat slept stood stolen stuck swung understood worn
woken sung swum flown grown thrown drawn blown cut cost set spread quit worked lived waited
started finished called studied played watched talked walked learned learnt opened visited stayed
cooked helped tried asked looked used rained moved changed happened arrived returned
""".split())


def clean(value):
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = unescape(text).replace("\xa0", " ").replace("’", "'").replace("‘", "'")
    text = text.replace("—", " ").replace("–", "-")
    return re.sub(r"\s+", " ", text).strip(" \"")


def key_of(text):
    return re.sub(r"[^a-z0-9']+", " ", clean(text).lower()).strip()


def words(text):
    return re.findall(r"[A-Za-z']+", clean(text))


PRONOUNS = {"i", "you", "we", "they", "she", "he", "it", "shall", "will", "not"}


def ok_sentence(text):
    text = clean(text)
    if len(text) < 24 or len(text) > 220:
        return False
    tokens = words(text)
    if len(tokens) < 4:
        return False
    if sum(1 for token in tokens if token.lower() in PRONOUNS) >= len(tokens) * 0.5:
        return False
    if text.lower().startswith(("we use", "not:", "compare", "warning")):
        return False
    if not re.search(r"\b(am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|shall|can|could|'ll|'m|'re|'ve|'d|going|used)\b|\w+ing\b|\w+ed\b", text, re.I):
        return False
    return True


def after_aux(text, pattern):
    match = re.search(pattern, clean(text), re.I)
    if not match:
        return ""
    return match.group(match.lastindex).lower()


def is_participle(word):
    word = (word or "").lower()
    if word in ("to", "a", "an", "the", "been"):
        return word == "been"
    if word in PARTICIPLE:
        return True
    return len(word) > 4 and word.endswith("ed")


def classify(text):
    raw = clean(text)
    if not ok_sentence(raw):
        return None
    if re.search(r"\b(will|'ll|shall) have been \w+ing\b", raw, re.I):
        return "futpc"
    if re.search(r"\bhad been \w+ing\b", raw, re.I):
        return "pastpc"
    if re.search(r"\b(have|has|'ve|'s) been \w+ing\b", raw, re.I):
        return "ppc"
    if re.search(r"\b(will|'ll|shall) be \w+ing\b", raw, re.I):
        return "futc"
    if re.search(r"\b(was|were) going to\b", raw, re.I):
        return "futpast"
    if re.search(r"\b(am|is|are|'m|'re) going to\b", raw, re.I) or re.search(r"\bgoing to \w+", raw, re.I):
        return "going"
    if re.search(r"\b(am|is|are|was|were|'m|'re) (about to|due to)\b", raw, re.I) or re.search(r"\b(am|is|are|was|were|'m|'re) to (leave|start|arrive|meet|be|go|come|open|close|begin|report|announce)\b", raw, re.I):
        return "futother"
    part = after_aux(raw, r"\b(?:will|'ll|shall) have (?:already |just |never )?(not )?([a-z]+)")
    if part and part != "been" and is_participle(part):
        return "futp"
    part = after_aux(raw, r"\bhad (?:already |just |never |not )?(?:been )?([a-z]+)")
    if part and not re.search(r"\bhad been \w+ing\b", raw, re.I) and part not in ("to", "a", "an", "the") and is_participle(part):
        return "pastp"
    part = after_aux(raw, r"\b(?:have|has|'ve) (?:already |just |never |ever |not )?(?:been )?([a-z]+)")
    if part and not re.search(r"\b(?:have|has|'ve|'s) been \w+ing\b", raw, re.I) and part not in ("to", "a", "an", "the") and is_participle(part):
        return "pp"
    if re.search(r"\b(was|were) \w+ing\b", raw, re.I):
        return "pastc"
    if re.search(r"\b(am|is|are|'m|'re|'s) \w+ing\b", raw, re.I):
        if re.search(r"\b(tomorrow|tonight|next week|next month|next year|next may|next monday|next friday)\b", raw, re.I):
            return "pcfut"
        return "pc"
    if re.search(r"\b(didn't|did not) use to\b|\bused to [a-z]", raw, re.I) and not re.search(r"\b(be|been|am|is|are|was|were|get|gets|got|getting|'m|'re) used to\b", raw, re.I):
        return "used"
    if re.search(r"\b(am|is|are|was|were|get|gets|got|getting|'m|'re) used to\b", raw, re.I):
        return "beused"
    if not re.search(r"\bif\b", raw, re.I) and re.search(r"\bwould [a-z]+", raw, re.I) and re.search(r"\b(every|always|often|when I was|as a child|on Sundays|each morning|each evening)\b", raw, re.I):
        return "would"
    if re.search(r"\b(said|told|thought|knew|promised|hoped)\b", raw, re.I) and re.search(r"\bwould [a-z]+", raw, re.I):
        return "futpast"
    if re.search(r"\b(will|'ll|shall|won't) [a-z]+", raw, re.I):
        return "will"
    if re.search(r"\b(leaves|departs|starts|arrives|opens|closes|begins|ends|lands) at\b", raw, re.I) and re.search(r"\b(at \d|o'clock|tomorrow|tonight|next|every)\b", raw, re.I):
        return "psfut"
    if re.search(r"\b(always|usually|often|sometimes|never|rarely|seldom|every day|every week|every morning|every night)\b", raw, re.I) and not re.search(r"\b(will|going to|was|were|had|did|would|yesterday|ago)\b|\b(has|have|'ve) (always |never |often |usually |just |already )?(been|\w+ed)\b|\w+ed\b", raw, re.I):
        return "ps"
    if re.search(r"\b(yesterday|ago|last night|last week|last year|last month|the other day)\b", raw, re.I) and not re.search(r"\b(was|were) \w+ing\b|\bhad \w+", raw, re.I):
        return "pasts"
    if re.search(r"\b(remember|forget|stop|try) (to \w+|\w+ing)\b", raw, re.I):
        return "gerinf"
    if re.search(r"\b(enjoy|mind|avoid|finish|suggest|practise|practice|keep) \w+ing\b", raw, re.I) or re.search(r"\bkeen on \w+ing\b", raw, re.I):
        return "gerund"
    if re.search(r"\b(want|decide|hope|need|plan|agree|promise|refuse|learn|would like) to \w+", raw, re.I):
        return "inf"
    return None


STRICT_PAGES = {
    "present-simple-or-present-continuous",
    "present-perfect-simple-or-present-perfect-continuous",
    "past-simple-or-present-perfect",
    "past-continuous-or-past-simple",
    "used-to", "would", "will", "shall", "going-to",
    "verbs-followed-by-ing", "like-love-hate-prefer", "enjoy",
    "to-infinitive", "infinitive", "would-like",
}


def accept_direct(tense, text, strict=False):
    raw = clean(text)
    if not ok_sentence(raw):
        return False
    if tense == "used":
        return bool(re.search(r"\bused to [a-z]", raw, re.I)) and not re.search(r"\b(be|been|am|is|are|was|were|get|gets|got|getting|'m|'re) used to\b", raw, re.I)
    if tense == "beused":
        return bool(re.search(r"\b(am|is|are|was|were|get|gets|got|getting|'m|'re) used to\b", raw, re.I))
    if tense == "would":
        return classify(raw) == "would"
    if tense == "will":
        return bool(re.search(r"\b(will|'ll|shall|won't|shan't)\b", raw, re.I)) and "have been" not in raw.lower()
    if tense == "going":
        return "going to" in raw.lower()
    if tense == "futpast":
        return bool(re.search(r"\b(would|was going to|were going to|was to|were to)\b", raw, re.I))
    if tense == "futother":
        return classify(raw) == "futother"
    if tense == "gerund":
        return bool(re.search(r"\w+ing\b", raw)) and not re.search(r"\b(am|is|are|was|were|been) \w+ing\b", raw, re.I)
    if tense == "inf":
        return bool(re.search(r"\bto [a-z]+", raw, re.I))
    if tense == "gerinf":
        return bool(re.search(r"\b(remember|forget|stop|try)\b", raw, re.I))
    if tense == "markers":
        return bool(re.search(r"\b(since|for|ago|already|yet|just)\b", raw, re.I))
    if tense in ("ps", "pc", "pp", "ppc", "pasts", "pastc", "pastp", "pastpc", "futc", "futp", "futpc", "pcfut", "psfut"):
        found = classify(raw)
        if found == tense:
            return True
        if strict or tense in ("futpc", "pastpc", "futc", "futp", "pcfut", "futpast"):
            return False
        # A dedicated grammar page is already about this form. Keep a sentence
        # when the classifier is unsure, and drop it when it clearly belongs elsewhere.
        return found is None
    return True


def fetch_text(url):
    status, html = look.fetch(url)
    if status != 200 or not html:
        return ""
    title = re.search(r"<title>([^<]+)", html)
    title_text = clean(title.group(1)) if title else ""
    if "Did you spell" in title_text or "Page not found" in title_text:
        return ""
    return html


def grammar_sentences(html):
    found = []
    for raw in re.findall(r'<i class="ti">(.*?)</i>', html, re.S):
        text = clean(raw)
        if ok_sentence(text):
            found.append(text)
    return found


def cambridge_sentences(html):
    found = []
    for raw in re.findall(r'<span class="eg deg">(.*?)</span>|<span class="deg">\s*(.*?)</span>', html, re.S):
        text = clean(raw[0] or raw[1])
        if ok_sentence(text):
            found.append(text)
    return found


def oxford_sentences(html):
    title = re.search(r"<title>([^<]+)", html or "")
    if not html or (title and "Did you spell" in title.group(1)):
        return []
    found = []
    for raw in re.findall(r'<span class="x">(.*?)</span>', html, re.S):
        text = clean(raw)
        if ok_sentence(text) and text not in found:
            found.append(text)
    return found


def wooordhunt_sentences(html):
    if not html:
        return []
    found = []
    for raw in re.findall(r'<p class="ex_o"[^>]*>\s*(.*?)</p>', html, re.S):
        text = clean(raw)
        if ok_sentence(text) and text not in found:
            found.append(text)
    return found


def add_item(bucket, tense, text, source):
    if tense not in bucket:
        return
    text = clean(text)
    if not text:
        return
    ident = key_of(text)
    if not ident or ident in bucket[tense]["seen"]:
        return
    bucket[tense]["seen"].add(ident)
    bucket[tense]["items"].append({"en": text, "source": source})


def gloss_for(word):
    label = word.strip()
    wh_url = "https://wooordhunt.ru/word/" + look.slug_wooordhunt(label).replace(" ", "_")
    # phrases: wooordhunt uses underscores
    wh_url = "https://wooordhunt.ru/word/" + re.sub(r"\s+", "_", label.lower())
    cam_url = "https://dictionary.cambridge.org/dictionary/english/" + look.slug_cambridge(label)
    ox_url = "https://www.oxfordlearnersdictionaries.com/definition/english/" + look.slug_oxford(label)
    wh_html = fetch_text(wh_url)
    cam_html = fetch_text(cam_url)
    ox_html = fetch_text(ox_url)
    wh = look.parse_wooordhunt(wh_html) if wh_html else None
    cam = look.parse_cambridge(cam_html) if cam_html else None
    ox = look.parse_oxford(ox_html) if ox_html else None
    ru = ((wh or {}).get("gloss") or "").strip()
    uk = ((cam or {}).get("uk") or (wh or {}).get("uk") or "").strip()
    us = ((cam or {}).get("us") or (wh or {}).get("us") or "").strip()
    if not uk and ox and ox.get("phon"):
        uk = ox["phon"]
    return {
        "en": label,
        "ru": ru,
        "uk": uk,
        "us": us,
        "cambridge": cam_url if cam else "",
        "oxford": ox_url if ox else "",
        "wooordhunt": wh_url if wh else "",
    }


def main():
    bucket = {tense: {"seen": set(), "items": []} for tense in MARKERS}
    pages = []
    for slugs in DIRECT.values():
        pages.extend(slugs)
    pages.extend(CLASSIFY_PAGES)
    pages = list(dict.fromkeys(pages))

    def load_grammar(slug):
        html = fetch_text(GRAMMAR + slug)
        return slug, grammar_sentences(html) if html else []

    print("grammar pages", len(pages), flush=True)
    grammar = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(load_grammar, slug) for slug in pages]
        for future in as_completed(futures):
            slug, sentences = future.result()
            grammar[slug] = sentences
            print(" ", slug, len(sentences), flush=True)

    direct_of = {}
    for tense, slugs in DIRECT.items():
        for slug in slugs:
            direct_of.setdefault(slug, []).append(tense)

    for slug, sentences in grammar.items():
        tenses = direct_of.get(slug) or []
        for text in sentences:
            if tenses:
                strict = slug in STRICT_PAGES
                for tense in tenses:
                    if accept_direct(tense, text, strict):
                        add_item(bucket, tense, text, "Cambridge Grammar")
            found = classify(text)
            if found:
                add_item(bucket, found, text, "Cambridge Grammar")

    def load_word(word):
        cam = fetch_text("https://dictionary.cambridge.org/dictionary/english/" + look.slug_cambridge(word))
        ox = fetch_text("https://www.oxfordlearnersdictionaries.com/definition/english/" + look.slug_oxford(word))
        ox_us = fetch_text("https://www.oxfordlearnersdictionaries.com/definition/american_english/" + look.slug_oxford(word))
        wh = fetch_text("https://wooordhunt.ru/word/" + look.slug_wooordhunt(word))
        rows = []
        for text in cambridge_sentences(cam):
            rows.append((text, "Cambridge"))
        for text in oxford_sentences(ox):
            rows.append((text, "Oxford"))
        for text in oxford_sentences(ox_us):
            rows.append((text, "Oxford"))
        for text in wooordhunt_sentences(wh):
            rows.append((text, "Wooordhunt"))
        return word, rows

    print("dictionary entries", len(VERBS), flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(load_word, word) for word in VERBS]
        for future in as_completed(futures):
            word, rows = future.result()
            kept = 0
            for text, source in rows:
                tense = classify(text)
                if tense:
                    before = len(bucket[tense]["items"])
                    add_item(bucket, tense, text, source)
                    kept += len(bucket[tense]["items"]) - before
            print(" ", word, len(rows), "kept", kept, flush=True)

    marker_words = []
    for words_list in MARKERS.values():
        for word in words_list:
            if word not in marker_words:
                marker_words.append(word)
    print("marker glosses", len(marker_words), flush=True)
    glosses = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(gloss_for, word): word for word in marker_words}
        for future in as_completed(futures):
            card = future.result()
            glosses[card["en"]] = card
            print(" ", card["en"], "ru" if card["ru"] else "no-ru", flush=True)

    bank = {}
    for tense, spec in bucket.items():
        items = spec["items"]
        grammar_rows = [item for item in items if item["source"] == "Cambridge Grammar"]
        oxford_rows = [item for item in items if item["source"] == "Oxford"]
        cambridge_rows = [item for item in items if item["source"] == "Cambridge"]
        other_rows = [item for item in items if item["source"] == "Wooordhunt"]
        picked = []
        seen = set()

        def take(rows, limit):
            for item in rows:
                if len(picked) >= limit:
                    return
                ident = key_of(item["en"])
                if ident in seen:
                    continue
                seen.add(ident)
                picked.append(item)

        take(grammar_rows, 24)
        take(oxford_rows, 34)
        take(cambridge_rows, 40)
        take(other_rows, 40)
        if len(picked) < 30:
            take(grammar_rows, 40)
        bank[tense] = {
            "markers": [glosses[word] for word in MARKERS[tense] if word in glosses],
            "examples": picked[:40],
        }
        sources = {}
        for item in bank[tense]["examples"]:
            sources[item["source"]] = sources.get(item["source"], 0) + 1
        print(f"{tense:8} {len(bank[tense]['examples']):2} {sources}", flush=True)

    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(bank, handle, ensure_ascii=False, indent=1)
    print("wrote", OUT, flush=True)


if __name__ == "__main__":
    main()
