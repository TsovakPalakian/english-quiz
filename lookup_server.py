#!/usr/bin/env python3
"""Lookup a word for the quiz preview.

Sources: Wooordhunt, Cambridge, Oxford, Longman, Collins, Merriam-Webster,
English Club, Idiom Connection, Learn English Today, ESL Cafe,
learnenglish.de, English at Home, Wiktionary, OpenRussian, WikDict, FreeDict.

GET http://127.0.0.1:8767/lookup?word=humid
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import accounts

PORT = 8767
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"


def strip_tags(value):
    text = re.sub(r"<[^>]+>", "", value or "")
    text = unescape(text).replace("\xa0", " ").replace("\u2002", " ")
    return re.sub(r"\s+", " ", text).strip()


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en,ru"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, ""
    except Exception:
        return 0, ""


def slug_wooordhunt(word):
    text = word.strip().lower().replace("’", "'")
    if text == "won't":
        return "will"
    return re.sub(r"\s+", "_", text)


def slug_oxford(word):
    text = word.strip().lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def slug_cambridge(word):
    text = word.strip().lower().replace("’", "'")
    if text == "won't":
        return "won-t"
    text = text.replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def transcription(html, block_id):
    match = re.search(
        r'id="%s".*?class="transcription">\s*([^<]+)' % block_id,
        html,
        re.S,
    )
    if not match:
        return ""
    return match.group(1).strip().strip("|").strip()


def parse_wooordhunt(html):
    if "class=\"transcription\"" not in html and "t_inline_en" not in html:
        return None
    gloss = ""
    match = re.search(r'<div class="t_inline_en">\s*([^<]+)', html)
    if match:
        gloss = strip_tags(match.group(1))
    phrases = []
    for english, russian in re.findall(
        r'([^<>]{1,120})&ensp;—&ensp;<i>([^<]+)</i>',
        html,
    ):
        phrases.append({"en": strip_tags(english), "ru": strip_tags(russian)})
    examples = []
    for english, russian in re.findall(
        r'<p class="ex_o"[^>]*>\s*(.*?)</p>(?:\s*<p class="ex_t human">\s*(.*?)</p>)?',
        html,
        re.S,
    ):
        examples.append({"en": strip_tags(english), "ru": strip_tags(russian or "")})
    uk = transcription(html, "uk_tr_sound")
    us = transcription(html, "us_tr_sound")
    verb_gloss = ""
    verb_start = html.find("ShowExNew('verb')")
    if verb_start >= 0:
        verb_end = html.find("<h4", verb_start + 10)
        chunk = html[verb_start:verb_end if verb_end != -1 else verb_start + 5000]
        senses = []
        for raw in re.findall(r"slideToggle\(100\);\">([\s\S]*?)</span>", chunk):
            text = re.sub(r"\s+", " ", strip_tags(raw)).strip()
            if text and text not in senses:
                senses.append(text)
            if len(senses) >= 6:
                break
        verb_gloss = "; ".join(senses)
    if not (uk or us or gloss or phrases or examples):
        return None
    return {"uk": uk, "us": us, "gloss": gloss, "verbGloss": verb_gloss, "phrases": phrases[:24], "examples": examples[:40]}


def parse_cambridge(html):
    if 'class="pos dpos"' not in html:
        return None
    poses = []
    for raw in re.findall(r'<span class="pos dpos"[^>]*>([^<]+)', html):
        label = strip_tags(raw)
        if label and label not in poses:
            poses.append(label)
    pos = poses[0] if poses else ""

    def ipa(region):
        found = re.search(
            r'class="%s dpron-i .*?<span class="ipa[^"]*">(.*?)</span>/</span>' % region,
            html,
            re.S,
        )
        return strip_tags(found.group(1)) if found else ""

    level = ""
    match = re.search(r'class="epp-xref[^"]*">([ABC][12])', html)
    if match:
        level = match.group(1)
    start = html.find('class="def ddef_d')
    end = html.find("These examples are from corpora", start if start != -1 else 0)
    chunk = html[start:end if end != -1 else start + 5000] if start != -1 else ""
    definition = ""
    match = re.search(r'class="def ddef_d db">(.*?)</div>', chunk, re.S)
    if match:
        definition = strip_tags(match.group(1)).rstrip(":").strip()
    examples = []
    for raw in re.findall(r'<span class="eg deg">(.*?)</span>', html, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    corpus = []
    for raw in re.findall(r'<span class="deg">\s*(.*?)</span>', html, re.S):
        text = strip_tags(raw)
        if text and text not in corpus and text not in examples:
            corpus.append(text)
    return {
        "pos": pos,
        "poses": poses,
        "uk": ipa("uk"),
        "us": ipa("us"),
        "level": level,
        "definition": definition,
        "examples": examples[:8],
        "corpus": corpus[:16],
    }


def contains_head(text, head):
    head = (head or "").strip()
    if not head:
        return True
    if " " in head or "-" in head:
        return head.lower() in text.lower()
    return re.search(r"(?<![A-Za-z])" + re.escape(head) + r"(?![A-Za-z])", text, re.I) is not None


def usage_kind(text, collocation=False):
    words = re.findall(r"[A-Za-z']+", text or "")
    if collocation or len(words) <= 7:
        return "simple"
    if len(words) >= 12 or re.search(r"\b(that|which|because|although|while|when|if|after|before)\b", text, re.I):
        return "complex"
    if text.count(",") >= 1 and len(words) > 8:
        return "complex"
    return "simple"


def parse_oxford(html):
    title = re.search(r"<title>([^<]+)", html or "")
    title_text = strip_tags(title.group(1)) if title else ""
    if "Did you spell" in title_text or 'class="x"' not in (html or ""):
        return None
    examples = []
    for raw in re.findall(r'<span class="x">(.*?)</span>', html, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    phon = ""
    match = re.search(r'class="phon">(.*?)</span>', html, re.S)
    if match:
        phon = strip_tags(match.group(1)).strip("/")
    if not examples and not phon:
        return None
    return {"phon": phon, "examples": examples[:40]}


def parse_longman(html):
    if not html or 'class="EXAMPLE"' not in html:
        return None
    title = re.search(r"<title>([^<]+)", html)
    if title and "did you mean" in title.group(1).lower():
        return None
    examples = []
    for raw in re.findall(r'<span class="EXAMPLE">(.*?)</span>', html, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    pron = ""
    match = re.search(r'class="PRON"[^>]*>(.*?)</span>', html, re.S)
    if match:
        pron = strip_tags(match.group(1)).strip("/")
    definition = ""
    match = re.search(r'class="DEF"[^>]*>(.*?)</span>', html, re.S)
    if match:
        definition = strip_tags(match.group(1))
    if not examples and not definition:
        return None
    return {"pron": pron, "definition": definition, "examples": examples[:40]}


def parse_collins(html):
    if not html or 'class="def"' not in html and 'class="quote"' not in html:
        return None
    definition = ""
    match = re.search(r'class="def"[^>]*>(.*?)</div>', html, re.S)
    if match:
        definition = strip_tags(match.group(1))
    examples = []
    for raw in re.findall(r'class="quote"[^>]*>(.*?)</(?:div|span|blockquote)>', html, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    if not definition and not examples:
        return None
    return {"definition": definition, "examples": examples[:20]}


def parse_merriam(html):
    if not html or ("dtText" not in html and "ex-sent" not in html):
        return None
    definition = ""
    match = re.search(r'class="dtText"[^>]*>(.*?)</span>', html, re.S)
    if match:
        definition = strip_tags(match.group(1)).lstrip(":").strip()
    examples = []
    for raw in re.findall(r'class="ex-sent[^"]*"[^>]*>(.*?)</span>', html, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    if not definition and not examples:
        return None
    return {"definition": definition, "examples": examples[:20]}


def english_club_lookup(word):
    try:
        return _english_club_lookup(word)
    except Exception:
        return {"url": "https://www.englishclub.com/ref/Idioms/"}


def _english_club_lookup(word):
    label = (word or "").strip()
    letter = ""
    for char in label:
        if char.isalpha():
            letter = char.upper()
            break
    index_url = "https://www.englishclub.com/ref/Idioms/" + (letter + "/" if letter else "")
    if not letter:
        return {"url": "https://www.englishclub.com/ref/Idioms/"}
    parts = [part for part in re.findall(r"[a-z0-9]+", label.lower()) if len(part) > 2]
    letters = []
    if letter and letter not in letters:
        letters.append(letter)
    for part in parts:
        initial = part[0].upper()
        if initial not in letters:
            letters.append(initial)
    best = ""
    best_score = 0
    for initial in letters[:3]:
        status, html = fetch("https://www.englishclub.com/ref/Idioms/" + initial + "/", 12)
        if status != 200 or not html:
            continue
        for href in re.findall(r'href="(https://www.englishclub.com/ref/esl/Idioms/[^"]+)"', html):
            slug = href.lower()
            score = sum(1 for part in parts if part in slug)
            need = min(2, len(parts)) if len(parts) > 1 else 1
            if parts and score > best_score and score >= need:
                best = href
                best_score = score
        if parts and best_score >= len(parts):
            break
    if not best:
        return {"url": index_url}
    status, page = fetch(best, 12)
    if status != 200 or not page:
        return {"url": best}
    meaning = ""
    match = re.search(r"<h2>\s*Meaning\s*</h2>\s*<p>(.*?)</p>", page, re.S | re.I)
    if match:
        meaning = strip_tags(match.group(1))
    examples = []
    chunk = page
    start = page.lower().find('class="example"')
    if start != -1:
        chunk = page[start:start + 4000]
    for raw in re.findall(r"<li>(.*?)</li>", chunk, re.S):
        text = strip_tags(raw)
        if text and text not in examples:
            examples.append(text)
    return {"url": best, "meaning": meaning, "examples": examples[:6]}


def english_at_home_lookup(word):
    index = "https://english-at-home.com/idioms/"
    try:
        label = (word or "").strip()
        search = "https://english-at-home.com/?s=" + urllib.parse.quote_plus(label)
        status, html = fetch(search, 10)
        if status != 200 or not html:
            return {"url": index}
        links = []
        for href in re.findall(r'href="(https://english-at-home.com/idioms/[^"#]+)"', html):
            if href.rstrip("/") != index.rstrip("/") and href not in links:
                links.append(href)
        if not links:
            return {"url": search}
        status, page = fetch(links[0], 10)
        if status != 200 or not page:
            return {"url": index}
        parts = [part for part in re.findall(r"[a-z0-9]+", label.lower()) if len(part) > 2]
        for title_raw, rest_raw in re.findall(r"<p>\s*<strong>(.*?)</strong>(.*?)</p>", page, re.S):
            title = strip_tags(title_raw).lower()
            if parts and not all(part in title for part in parts):
                continue
            rest = strip_tags(rest_raw)
            meaning_match = re.search(r"^=\s*([^:]+):", rest)
            quote = re.search(r"[“\"]([^”\"]+)[”\"]", rest)
            return {
                "url": links[0],
                "meaning": meaning_match.group(1).strip() if meaning_match else "",
                "examples": [quote.group(1).strip()] if quote else [],
            }
        return {"url": index}
    except Exception:
        return {"url": index}


LOOKUP_CACHE = {}


def cached_lookup(key, build):
    if key in LOOKUP_CACHE:
        return LOOKUP_CACHE[key]
    value = build()
    if len(LOOKUP_CACHE) > 300:
        LOOKUP_CACHE.clear()
    LOOKUP_CACHE[key] = value
    return value


def tidy_query(word):
    text = re.sub(r"\s+", " ", word or "").strip()
    return text.strip(".,;:!?\"'“”«»()[]")


def wiki_plain(text):
    text = text or ""
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = text.split("{{")[0]
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", text)
    text = text.replace("[[", "").replace("]]", "")
    text = text.replace("'''", "").replace("''", "")
    return strip_tags(text)


def unique_keep(items, limit):
    kept = []
    for item in items:
        text = re.sub(r"\s+", " ", item or "").strip(" ,;.")
        if not text or text in kept:
            continue
        kept.append(text)
        if len(kept) >= limit:
            break
    return kept


def wiktionary_lookup(word):
    label = tidy_query(word)
    if not label:
        return None
    return cached_lookup("wk:" + label.lower(), lambda: _wiktionary_lookup(label))


def _wiktionary_lookup(label):
    russian = is_russian(label)
    host = "ru.wiktionary.org" if russian else "en.wiktionary.org"
    title = label.replace(" ", "_")
    page = "https://%s/wiki/%s" % (host, urllib.parse.quote(title))
    api = "https://%s/w/api.php?action=parse&page=%s&prop=wikitext&format=json&formatversion=2&redirects=1" % (
        host,
        urllib.parse.quote(title),
    )
    status, body = fetch(api, 12)
    if status != 200 or not body:
        return {"url": page}
    try:
        payload = json.loads(body)
    except Exception:
        return {"url": page}
    wikitext = ((payload.get("parse") or {}).get("wikitext")) or ""
    if not wikitext:
        return {"url": page}
    lang = "en" if russian else "ru"
    found = []
    for raw in re.findall(r"\{\{t(?:\+|-simple)?\|%s\|([^|}]+)" % lang, wikitext):
        text = wiki_plain(raw)
        if text:
            found.append(text)
    if russian:
        block = re.search(r"^\|en=(.*)$", wikitext, re.M)
        if block:
            raw = re.sub(r"<!--.*?-->", "", block.group(1))
            for word in re.findall(r"\[\[([^|\]]+)\]\]", raw):
                text = wiki_plain(word)
                if text:
                    found.append(text)
    translations = unique_keep(found, 8)
    ipa = ""
    ipa_match = re.search(r"\{\{IPA\|en\|(/[^|}\s]+)", wikitext)
    if ipa_match:
        ipa = ipa_match.group(1).strip("/")
    definition = ""
    for line in wikitext.splitlines():
        if line.startswith("# ") and not line.startswith("#:"):
            definition = wiki_plain(line[2:])
            if definition:
                break
    examples = []
    for raw in re.findall(r"\{\{(?:ux|uxi)\|en\|([^|}]+)", wikitext):
        text = wiki_plain(raw)
        if text and text not in examples:
            examples.append(text)
    result = {"url": page, "translations": translations, "ipa": ipa, "definition": definition, "examples": examples[:6]}
    if russian:
        result["en"] = ", ".join(translations[:6])
    else:
        result["ru"] = ", ".join(translations[:6])
    return result


def wikdict_lookup(word):
    label = tidy_query(word)
    if not label:
        return None
    return cached_lookup("wd:" + label.lower(), lambda: _wikdict_lookup(label))


def _wikdict_lookup(label):
    pair = "ru-en" if is_russian(label) else "en-ru"
    url = "https://www.wikdict.com/%s/%s" % (pair, urllib.parse.quote(label))
    status, html = fetch(url, 12)
    if status != 200 or not html or "no translations" in html.lower():
        return {"url": url}
    translations = []
    notes = []
    tables = re.findall(r'<table class="lexentry\b.*?</table>', html, re.S)
    chosen = ""
    for table in tables:
        head = re.search(r"<h3>\s*([^<]+)", table)
        if head and head.group(1).strip().lower() == label.lower():
            chosen = table
            break
    if not chosen:
        return {"url": url}
    for row in re.findall(r'<tr class="sense-groups">.*?</tr>', chosen, re.S):
        cells = [strip_tags(cell) for cell in re.findall(r"<td\b[^>]*>.*?</td>", row, re.S)]
        if len(cells) < 2:
            continue
        gloss, other = cells[0], cells[-1]
        if is_russian(label):
            if not re.search(r"[A-Za-z]", other):
                continue
        elif not is_russian(other):
            continue
        for part in re.split(r"\s*,\s*", other):
            part = wiki_plain(part).strip(" .;")
            if part and part not in translations and part.lower() != label.lower():
                translations.append(part)
        if gloss and gloss not in notes and len(gloss) < 160:
            notes.append(gloss)
    result = {"url": url, "translations": translations[:8], "notes": notes[:4]}
    if is_russian(label):
        result["en"] = ", ".join(translations[:6])
    else:
        result["ru"] = ", ".join(translations[:6])
    return result


def openrussian_lookup(word):
    label = tidy_query(word)
    if not label:
        return None
    return cached_lookup("or:" + label.lower(), lambda: _openrussian_lookup(label))


def _openrussian_lookup(label):
    if is_russian(label):
        url = "https://en.openrussian.org/ru/" + urllib.parse.quote(label)
    else:
        url = "https://en.openrussian.org/en/" + urllib.parse.quote(label)
    status, html = fetch(url, 12)
    if status != 200 or not html:
        return {"url": "https://en.openrussian.org/dictionary"}
    return parse_openrussian(html, url, is_russian(label))


def parse_openrussian(html, url, russian_query):
    block_match = re.search(r'class="translations">(.*?)</ul>', html or "", re.S)
    block = block_match.group(1) if block_match else ""
    translations = []
    examples = []
    for item in re.findall(r"<li>(.*?)</li>", block, re.S):
        gloss_match = re.search(r'class="first-line">\s*<p class="tl">(.*?)</p>', item, re.S)
        if gloss_match:
            words = [strip_tags(part) for part in re.findall(r"<span[^>]*>(.*?)</span>", gloss_match.group(1), re.S)]
            words = [part for part in words if part]
            gloss = ", ".join(words) if words else strip_tags(gloss_match.group(1))
            if gloss and gloss not in translations and len(gloss) < 180:
                translations.append(gloss)
        native_match = re.search(r'class="native">(.*?)</p>', item, re.S)
        english_match = re.search(r'class="example">.*?class="tl">(.*?)</p>', item, re.S)
        if native_match and english_match:
            russian = strip_tags(native_match.group(1))
            english = strip_tags(english_match.group(1))
            if russian and english and is_russian(russian) and not is_russian(english):
                pair = {"ru": russian, "en": english}
                if pair not in examples:
                    examples.append(pair)
    if not translations:
        meta = re.search(r'name="description" content="Translation:\s*([^."<]+)', html or "")
        if meta:
            gloss = strip_tags(meta.group(1))
            if gloss:
                translations.append(gloss)
    if not translations and not examples:
        return {"url": url}
    result = {"url": url, "translations": translations[:8], "examples": examples[:6]}
    if russian_query:
        result["en"] = ", ".join(translations[:6])
    else:
        result["ru"] = ", ".join(translations[:6])
    return result


def freedict_url():
    return "https://freedict.org/"


def translate_selection(word):
    label = tidy_query(word)
    if not label:
        return {"word": "", "lines": []}
    return cached_lookup("tr:" + label.lower(), lambda: _translate_selection(label))


def _translate_selection(label):
    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {
            "wk": pool.submit(wiktionary_lookup, label),
            "wd": pool.submit(wikdict_lookup, label),
            "or": pool.submit(openrussian_lookup, label),
        }
        got = {key: job.result() for key, job in jobs.items()}
    lines = []
    wiktionary = got["wk"] or {}
    wikdict = got["wd"] or {}
    open_russian = got["or"] or {}
    wiki_text = wiktionary.get("ru") or wiktionary.get("en") or ""
    if wiki_text:
        lines.append({
            "source": "Wiktionary",
            "text": wiki_text,
            "note": wiktionary.get("definition") or "",
            "url": wiktionary.get("url") or "",
        })
    dict_text = wikdict.get("ru") or wikdict.get("en") or ""
    if dict_text:
        lines.append({
            "source": "WikDict",
            "text": dict_text,
            "note": (wikdict.get("notes") or [""])[0],
            "url": wikdict.get("url") or "",
        })
    open_text = open_russian.get("ru") or open_russian.get("en") or ""
    if open_text:
        lines.append({
            "source": "OpenRussian",
            "text": open_text,
            "note": "",
            "url": open_russian.get("url") or "",
        })
    pair = "ru-en" if is_russian(label) else "en-ru"
    return {
        "word": label,
        "lines": lines,
        "links": {
            "wiktionary": (wiktionary.get("url") or ("https://%s/wiki/%s" % (
                "ru.wiktionary.org" if is_russian(label) else "en.wiktionary.org",
                urllib.parse.quote(label.replace(" ", "_")),
            ))),
            "wikdict": wikdict.get("url") or ("https://www.wikdict.com/%s/%s" % (pair, urllib.parse.quote(label))),
            "openRussian": open_russian.get("url") or "https://en.openrussian.org/dictionary",
            "freeDict": freedict_url(),
        },
    }


def build_usages(headword, wooordhunt, cambridge, oxford=None, longman=None, collins=None, merriam=None, english_club=None, english_at_home=None, wiktionary=None, wikdict=None, open_russian=None):
    items = []
    seen = set()

    def add(english, russian, kind, source, trust=False):
        english = re.sub(r"\s+", " ", english or "").strip(" .…")
        english = english.strip()
        if len(english) < 3 or len(english) > 320:
            return
        if not trust and not contains_head(english, headword):
            return
        key = english.lower()
        if key in seen or key == headword.strip().lower():
            return
        seen.add(key)
        items.append({
            "en": english,
            "ru": re.sub(r"\s+", " ", russian or "").strip(),
            "kind": kind,
            "source": source,
        })

    wooordhunt = wooordhunt or {}
    cambridge = cambridge or {}
    for phrase in wooordhunt.get("phrases") or []:
        english = phrase.get("en") or ""
        short = len(re.findall(r"[A-Za-z']+", english)) <= 5
        add(english, phrase.get("ru"), usage_kind(english, collocation=short), "Wooordhunt")
    for example in wooordhunt.get("examples") or []:
        english = example.get("en") or ""
        add(english, example.get("ru"), usage_kind(english), "Wooordhunt")
    for english in cambridge.get("examples") or []:
        add(english, "", usage_kind(english), "Cambridge")
    for english in (oxford or {}).get("examples") or []:
        add(english, "", usage_kind(english), "Oxford")
    for english in (longman or {}).get("examples") or []:
        add(english, "", usage_kind(english), "Longman")
    for english in (collins or {}).get("examples") or []:
        add(english, "", usage_kind(english), "Collins")
    for english in (merriam or {}).get("examples") or []:
        add(english, "", usage_kind(english), "Merriam-Webster")
    for english in (english_club or {}).get("examples") or []:
        add(english, "", usage_kind(english), "English Club", trust=True)
    for english in (english_at_home or {}).get("examples") or []:
        add(english, "", usage_kind(english), "English at Home", trust=True)
    for english in (wiktionary or {}).get("examples") or []:
        add(english, "", usage_kind(english), "Wiktionary")
    russian_head = is_russian(headword)
    for example in (open_russian or {}).get("examples") or []:
        english = example.get("en") or ""
        russian = example.get("ru") or ""
        if russian_head:
            add(english or russian, russian if english else "", usage_kind(english or russian), "OpenRussian", trust=True)
        else:
            add(english, russian, usage_kind(english), "OpenRussian")
    corpus = cambridge.get("corpus") or []
    corpus.sort(key=lambda text: abs(len(re.findall(r"[A-Za-z']+", text)) - 18))
    for english in corpus:
        add(english, "", "complex", "Cambridge")

    simple = [item for item in items if item["kind"] == "simple"]
    complex_items = [item for item in items if item["kind"] == "complex"]
    picked = []
    picked.extend(simple[:6])
    picked.extend(complex_items[:6])
    for item in items:
        if len(picked) >= 14:
            break
        if item not in picked:
            picked.append(item)
    for source in ("Longman", "Collins", "Merriam-Webster", "English Club", "English at Home", "Wiktionary", "OpenRussian"):
        have = sum(1 for row in picked if row.get("source") == source)
        for item in items:
            if have >= 2 or len(picked) >= 18:
                break
            if item.get("source") == source and item not in picked:
                picked.append(item)
                have += 1
    return picked


def is_russian(word):
    return bool(re.search(r"[а-яё]", word, re.I))


def english_alts(russian_word, headword):
    url = "https://wooordhunt.ru/word/" + urllib.parse.quote(russian_word.strip())
    status, html = fetch(url)
    if status != 200 or "ru_content" not in html:
        return []
    chunk = html.split("ru_content", 1)[1]
    cut = chunk.find("<h4>")
    if cut != -1:
        chunk = chunk[:cut]
    alts = []
    head = (headword or "").strip().lower()
    for text in re.findall(r'href="/word/[^"]+"[^>]*>([^<]+)</a>', chunk):
        text = strip_tags(text)
        if not text or is_russian(text) or not re.search(r"[A-Za-z]", text):
            continue
        if text.lower() == head or text in alts:
            continue
        alts.append(text)
        if len(alts) == 3:
            break
    return alts


def lookup_from_english(word):
    label = word.strip()
    wooordhunt_url = "https://wooordhunt.ru/word/" + urllib.parse.quote(slug_wooordhunt(label))
    cambridge_url = "https://dictionary.cambridge.org/dictionary/english/" + urllib.parse.quote(slug_cambridge(label))
    oxford_url = "https://www.oxfordlearnersdictionaries.com/definition/english/" + urllib.parse.quote(slug_oxford(label))
    slug = slug_oxford(label)
    longman_url = "https://www.ldoceonline.com/dictionary/" + urllib.parse.quote(slug)
    collins_url = "https://www.collinsdictionary.com/dictionary/english/" + urllib.parse.quote(slug)
    merriam_url = "https://www.merriam-webster.com/dictionary/" + urllib.parse.quote(label.strip().lower())
    british_url = "https://learnenglish.britishcouncil.org/search?keys=" + urllib.parse.quote(label)
    perfect_url = "https://www.perfect-english-grammar.com/?s=" + urllib.parse.quote(label)
    letter = ""
    for char in label:
        if char.isalpha():
            letter = char.lower()
            break
    with ThreadPoolExecutor(max_workers=12) as pool:
        jobs = {
            "wh": pool.submit(fetch, wooordhunt_url, 20),
            "cam": pool.submit(fetch, cambridge_url, 20),
            "ox": pool.submit(fetch, oxford_url, 20),
            "lo": pool.submit(fetch, longman_url, 15),
            "co": pool.submit(fetch, collins_url, 8),
            "mw": pool.submit(fetch, merriam_url, 8),
            "ec": pool.submit(english_club_lookup, label),
            "ah": pool.submit(english_at_home_lookup, label),
            "wk": pool.submit(wiktionary_lookup, label),
            "wd": pool.submit(wikdict_lookup, label),
            "or": pool.submit(openrussian_lookup, label),
        }
        got = {key: job.result() for key, job in jobs.items()}
    wh_status, wh_html = got["wh"]
    cam_status, cam_html = got["cam"]
    ox_status, ox_html = got["ox"]
    lo_status, lo_html = got["lo"]
    co_status, co_html = got["co"]
    mw_status, mw_html = got["mw"]
    english_club = got["ec"] if isinstance(got["ec"], dict) else {"url": "https://www.englishclub.com/ref/Idioms/"}
    english_at_home = got["ah"] if isinstance(got["ah"], dict) else {"url": "https://english-at-home.com/idioms/"}
    wiktionary = got["wk"] if isinstance(got["wk"], dict) else None
    wikdict = got["wd"] if isinstance(got["wd"], dict) else None
    open_russian = got["or"] if isinstance(got["or"], dict) else None
    wooordhunt = parse_wooordhunt(wh_html) if wh_status == 200 else None
    cambridge = parse_cambridge(cam_html) if cam_status == 200 else None
    oxford = parse_oxford(ox_html) if ox_status == 200 else None
    longman = parse_longman(lo_html) if lo_status == 200 else None
    collins = parse_collins(co_html) if co_status == 200 else None
    merriam = parse_merriam(mw_html) if mw_status == 200 else None
    ru = (wooordhunt or {}).get("gloss") or ""
    ru_source = "Wooordhunt" if ru else ""
    if not ru and (wiktionary or {}).get("ru"):
        ru = wiktionary.get("ru") or ""
        ru_source = "Wiktionary"
    if not ru and (wikdict or {}).get("ru"):
        ru = wikdict.get("ru") or ""
        ru_source = "WikDict"
    if not ru and (open_russian or {}).get("ru"):
        ru = open_russian.get("ru") or ""
        ru_source = "OpenRussian"
    found = bool(
        ru
        or (cambridge or {}).get("definition")
        or (cambridge or {}).get("examples")
        or (oxford or {}).get("examples")
        or (longman or {}).get("definition")
        or (longman or {}).get("examples")
        or (collins or {}).get("definition")
        or (collins or {}).get("examples")
        or (merriam or {}).get("definition")
        or (merriam or {}).get("examples")
        or (english_club or {}).get("meaning")
        or (english_club or {}).get("examples")
        or (english_at_home or {}).get("meaning")
        or (english_at_home or {}).get("examples")
        or (wiktionary or {}).get("definition")
        or (wiktionary or {}).get("translations")
        or (wiktionary or {}).get("examples")
        or (wikdict or {}).get("translations")
        or (open_russian or {}).get("translations")
        or (open_russian or {}).get("examples")
    )
    alts = []
    if ru:
        first = re.split(r"[,;]", ru)[0].strip()
        if first and is_russian(first) and " " not in first:
            alts = english_alts(first, label)
    return {
        "found": found,
        "word": label,
        "ru": ru,
        "ruSource": ru_source,
        "direction": "en",
        "query": label,
        "englishAlts": alts,
        "usages": build_usages(label, wooordhunt, cambridge, oxford, longman, collins, merriam, english_club, english_at_home, wiktionary, wikdict, open_russian),
        "wooordhunt": wooordhunt,
        "cambridge": cambridge,
        "oxford": oxford,
        "longman": longman,
        "collins": collins,
        "merriam": merriam,
        "englishClub": english_club,
        "englishAtHome": english_at_home,
        "wiktionary": wiktionary,
        "wikdict": wikdict,
        "openRussian": open_russian,
        "links": {
            "wooordhunt": wooordhunt_url,
            "cambridge": cambridge_url,
            "oxford": oxford_url,
            "longman": longman_url,
            "collins": collins_url,
            "merriamWebster": merriam_url,
            "englishClub": (english_club or {}).get("url") or "https://www.englishclub.com/ref/Idioms/",
            "idiomConnection": "https://www.idiomconnection.com/" + (letter + "quiz.html" if letter else ""),
            "learnEnglishToday": "https://www.learn-english-today.com/idioms/idioms_proverbs.html",
            "eslCafe": "https://www.eslcafe.com/resources/idioms",
            "learnEnglishDe": "https://www.learnenglish.de/idiompage.html",
            "englishAtHome": (english_at_home or {}).get("url") or "https://english-at-home.com/idioms/",
            "britishCouncil": british_url,
            "perfectEnglish": perfect_url,
            "wiktionary": (wiktionary or {}).get("url") or ("https://en.wiktionary.org/wiki/" + urllib.parse.quote(label.replace(" ", "_"))),
            "wikdict": (wikdict or {}).get("url") or ("https://www.wikdict.com/en-ru/" + urllib.parse.quote(label)),
            "openRussian": (open_russian or {}).get("url") or "https://en.openrussian.org/dictionary",
            "freeDict": freedict_url(),
        },
    }


def english_from_open(entry):
    text = ((entry or {}).get("en") or "").strip()
    if not text:
        translations = (entry or {}).get("translations") or []
        text = translations[0] if translations else ""
    text = re.split(r"[,;]", text)[0].strip()
    if not text or is_russian(text) or " " in text:
        return ""
    return text


def lookup_from_russian(word):
    query = word.strip()
    url = "https://wooordhunt.ru/word/" + urllib.parse.quote(query)
    status, html = fetch(url)
    english = ""
    if status == 200 and "ru_content" in html:
        chunk = html.split("ru_content", 1)[1]
        cut = chunk.find("<h4>")
        head = chunk[:cut] if cut != -1 else chunk[:5000]
        match = re.search(r'href="/word/([^"]+)"[^>]*>([^<]+)</a>', head)
        if match:
            found_english = strip_tags(match.group(2))
            if found_english and not is_russian(found_english):
                english = found_english
    open_russian = openrussian_lookup(query)
    wiktionary = wiktionary_lookup(query)
    wikdict = wikdict_lookup(query)
    if not english:
        english = english_from_open(open_russian) or english_from_open(wiktionary) or english_from_open(wikdict)
    if not english:
        alts = unique_keep(
            ((open_russian or {}).get("translations") or [])
            + ((wiktionary or {}).get("translations") or [])
            + ((wikdict or {}).get("translations") or []),
            6,
        )
        found = bool(alts or (open_russian or {}).get("examples"))
        return {
            "found": found,
            "word": query,
            "ru": query,
            "ruSource": "OpenRussian" if (open_russian or {}).get("translations") else ("Wiktionary" if (wiktionary or {}).get("translations") else "WikDict"),
            "direction": "ru",
            "query": query,
            "englishAlts": alts,
            "usages": build_usages(query, None, None, open_russian=open_russian),
            "wiktionary": wiktionary,
            "wikdict": wikdict,
            "openRussian": open_russian,
            "links": {
                "wooordhunt": url,
                "wiktionary": (wiktionary or {}).get("url") or ("https://ru.wiktionary.org/wiki/" + urllib.parse.quote(query.replace(" ", "_"))),
                "wikdict": (wikdict or {}).get("url") or ("https://www.wikdict.com/ru-en/" + urllib.parse.quote(query)),
                "openRussian": (open_russian or {}).get("url") or ("https://en.openrussian.org/ru/" + urllib.parse.quote(query)),
                "freeDict": freedict_url(),
            },
        }
    data = lookup_from_english(english)
    data["query"] = query
    data["direction"] = "ru"
    data["word"] = english
    if not data.get("ru"):
        data["ru"] = query
        data["ruSource"] = data.get("ruSource") or "OpenRussian"
        data["found"] = True
    extra = []
    for entry in (open_russian, wiktionary, wikdict):
        extra.extend((entry or {}).get("translations") or [])
    data["englishAlts"] = unique_keep((data.get("englishAlts") or []) + english_alts(query, data["word"]) + extra, 6)
    if open_russian and (open_russian.get("translations") or open_russian.get("examples")):
        data["openRussian"] = open_russian
    if wiktionary and (wiktionary.get("translations") or wiktionary.get("en")):
        data["wiktionaryRu"] = wiktionary
    links = data.get("links") or {}
    links["wooordhuntRu"] = url
    if open_russian and open_russian.get("url"):
        links["openRussian"] = open_russian["url"]
    if wikdict and wikdict.get("url"):
        links["wikdictRu"] = wikdict["url"]
    data["links"] = links
    return data


def third_person_bases(word):
    text = (word or "").strip().lower()
    if not re.fullmatch(r"[a-z]+", text or ""):
        return []
    if text == "has":
        return ["have"]
    if text == "does":
        return ["do"]
    if text == "goes":
        return ["go"]
    if text == "says":
        return ["say"]
    if len(text) < 4 or not text.endswith("s") or text.endswith("ss"):
        return []
    bases = []
    if text.endswith("ies"):
        bases.append(text[:-3] + "y")
    if text.endswith("es"):
        stem = text[:-2]
        if re.search(r"(?:s|x|z|ch|sh|o)$", stem):
            bases.append(stem)
    simple = text[:-1]
    if simple not in bases:
        bases.append(simple)
    return [base for base in bases if base and base != text and len(base) > 1]


def context_allows_third(word, context):
    plural = {"i", "we", "you", "they", "these", "those", "i'm", "we're", "you're", "they're"}
    singular = {"he", "she", "it", "he's", "she's", "it's", "who", "this", "that", "everybody", "everyone", "someone", "somebody", "nobody", "anybody", "anyone"}
    skip = {"really", "always", "never", "also", "just", "still", "often", "usually", "already", "not", "even", "only", "sometimes", "ever"}
    tokens = re.findall(r"[a-z']+", (context or "").lower())
    target = (word or "").strip().lower()
    if target not in tokens:
        return None
    prev = tokens.index(target) - 1
    while prev >= 0 and tokens[prev] in skip:
        prev -= 1
    if prev < 0:
        return None
    if tokens[prev] in plural:
        return False
    if tokens[prev] in singular:
        return True
    return None


def is_verb_entry(data, primary_only=False):
    cam = (data or {}).get("cambridge") or {}
    poses = cam.get("poses") or ([cam.get("pos")] if cam.get("pos") else [])
    poses = [str(item).lower() for item in poses]
    if not poses:
        return False
    if primary_only:
        return "verb" in poses[0]
    return any("verb" in item for item in poses)


def lookup_with_third_person(word, context=""):
    text = word.strip()
    if is_russian(text):
        return lookup_from_russian(text)
    if " " in text:
        return lookup_from_english(text)
    data = lookup_from_english(text)
    allow = context_allows_third(text, context)
    if allow is False:
        return data
    bases = third_person_bases(text)
    if not bases:
        return data
    surface_verb = is_verb_entry(data, True)
    if data.get("found") and data.get("ru") and surface_verb:
        base_data = lookup_from_english(bases[0])
        if base_data.get("found") and is_verb_entry(base_data, allow is not True):
            data["base"] = bases[0]
            data["grammar"] = {
                "form": "third-person singular",
                "note": "The verb takes an -s because it is used in the third person singular.",
            }
        return data
    if data.get("found") and data.get("ru") and allow is not True:
        return data
    for base in bases:
        base_data = lookup_from_english(base)
        if not base_data.get("found") or not base_data.get("ru") or not is_verb_entry(base_data, allow is not True):
            continue
        verb_gloss = ((base_data.get("wooordhunt") or {}).get("verbGloss") or "").strip()
        if verb_gloss:
            base_data["ru"] = verb_gloss
            base_data["ruSource"] = "Wooordhunt"
        base_data["word"] = text
        base_data["query"] = text
        base_data["base"] = base
        base_data["grammar"] = {
            "form": "third-person singular",
            "note": "The verb takes an -s because it is used in the third person singular.",
        }
        return base_data
    return data


def lookup(word, context=""):
    return lookup_with_third_person(word, context)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            accounts.preflight(self)
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _signed_in(self):
        conn = accounts.db()
        try:
            return accounts.current_user(conn, self)
        finally:
            conn.close()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            accounts.handle(self, "GET", parsed)
            return
        if parsed.path not in ("/lookup", "/translate"):
            self.send_error(404)
            return
        # Match Worker: dictionary lookup requires a signed-in session.
        if not self._signed_in():
            self._json(401, {"error": "Sign in first."})
            return
        query = urllib.parse.parse_qs(parsed.query)
        word = (query.get("word") or [""])[0].strip()
        context = (query.get("context") or [""])[0].strip()
        if not word or len(word) > 80:
            self._json(400, {"error": "Type a word or a short phrase."})
            return
        if len(context) > 400:
            context = context[:400]
        if parsed.path == "/translate":
            self._json(200, translate_selection(word))
            return
        data = lookup(word, context)
        if not data.get("found"):
            self._json(404, {"error": "No such word or phrase."})
            return
        self._json(200, data)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            accounts.handle(self, "POST", parsed)
            return
        self.send_error(404)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            accounts.handle(self, "PUT", parsed)
            return
        self.send_error(404)

    def _cors(self):
        origin = self.headers.get("Origin") or ""
        if origin in accounts.ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(fmt % args)


if __name__ == "__main__":
    print("lookup http://127.0.0.1:%d/lookup" % PORT, flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
