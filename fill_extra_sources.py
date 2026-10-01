#!/usr/bin/env python3
"""Add real examples from Perfect English Grammar and Longman to tense-bank.json."""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape

import build_tense_bank as bank
import lookup_server as look

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "tense-bank.json")
PEG = "https://www.perfect-english-grammar.com/"

PAGES = {
    "ps": ["present-simple-use.html", "present-simple-or-present-continuous.html", "adverbs-of-frequency.html"],
    "pc": ["present-continuous-use.html", "present-simple-or-present-continuous.html"],
    "pp": ["present-perfect-use.html", "present-perfect-or-past-simple.html"],
    "ppc": ["present-perfect-continuous-use.html", "present-perfect-simple-or-present-perfect-continuous.html"],
    "pasts": ["past-simple-use.html", "present-perfect-or-past-simple.html"],
    "pastc": ["past-continuous-use.html"],
    "pastp": ["past-perfect-use.html"],
    "pastpc": ["past-perfect-continuous-use.html"],
    "will": ["simple-future-use.html", "will-or-be-going-to.html"],
    "going": ["will-or-be-going-to.html"],
    "futc": ["future-progressive-tense-use.html"],
    "futp": ["future-perfect-tense-use.html"],
    "futpc": ["future-perfect-continuous-use.html"],
    "pcfut": ["present-continuous-use.html"],
    "psfut": ["present-simple-use.html"],
    "used": ["used-to.html"],
    "would": ["used-to.html", "would.html"],
    "beused": ["used-to.html"],
    "gerund": ["gerunds-and-infinitives.html", "gerunds-and-infinitives-verbs-1.html"],
    "inf": ["gerunds-and-infinitives-verbs-1.html", "gerunds-and-infinitives-verbs-2.html"],
    "gerinf": ["gerunds-and-infinitives-verbs-2.html", "gerunds-and-infinitives-verbs-3.html"],
    "markers": ["prepositions-of-time.html", "adverbs-of-frequency.html"],
}

SKIP = ("how to", "try ", "click", "download", "watch the", "read about", "practise", "practice", "review how")


def peg_lines(html):
    if not html:
        return []
    text = re.sub(r"<script[\s\S]*?</script>", " ", html)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>|</li>|</td>", "\n", text)
    text = unescape(re.sub(r"<[^>]+>", "\n", text))
    found = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip(" \"")
        low = line.lower()
        if low.startswith(SKIP) or "click here" in low or "membership" in low:
            continue
        if not bank.ok_sentence(line):
            continue
        if line not in found:
            found.append(line)
    return found


def main():
    data = json.load(open(OUT, encoding="utf-8"))
    seen = {tense: {bank.key_of(item["en"]) for item in spec["examples"]} for tense, spec in data.items()}

    def add(tense, text, source):
        if tense not in data or len(data[tense]["examples"]) >= 40:
            return False
        ident = bank.key_of(text)
        if not ident or ident in seen[tense]:
            return False
        seen[tense].add(ident)
        data[tense]["examples"].append({"en": bank.clean(text), "source": source})
        return True

    slugs = []
    for pages in PAGES.values():
        slugs.extend(pages)
    slugs = list(dict.fromkeys(slugs))

    def load_peg(slug):
        status, html = look.fetch(PEG + slug, 20)
        return slug, peg_lines(html) if status == 200 else []

    print("peg pages", len(slugs), flush=True)
    pages = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(load_peg, slug) for slug in slugs]):
            slug, lines = future.result()
            pages[slug] = lines
            print(" ", slug, len(lines), flush=True)

    for tense, slugs_for in PAGES.items():
        for slug in slugs_for:
            for line in pages.get(slug) or []:
                found = bank.classify(line)
                if found == tense:
                    add(tense, line, "Perfect English Grammar")
                elif found and found in data:
                    add(found, line, "Perfect English Grammar")

    def load_longman(word):
        status, html = look.fetch("https://www.ldoceonline.com/dictionary/" + look.slug_oxford(word), 20)
        parsed = look.parse_longman(html) if status == 200 else None
        return word, (parsed or {}).get("examples") or []

    print("longman", len(bank.VERBS), flush=True)
    with ThreadPoolExecutor(max_workers=6) as pool:
        for future in as_completed([pool.submit(load_longman, word) for word in bank.VERBS]):
            word, examples = future.result()
            kept = 0
            for line in examples:
                found = bank.classify(line)
                if found and add(found, line, "Longman"):
                    kept += 1
            print(" ", word, len(examples), "kept", kept, flush=True)

    for tense, spec in data.items():
        n = len(spec["examples"])
        sources = {}
        for item in spec["examples"]:
            sources[item["source"]] = sources.get(item["source"], 0) + 1
        mark = "" if n >= 30 else " LOW"
        print(f"{tense:8} {n:2}{mark} {sources}", flush=True)
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", OUT, flush=True)


if __name__ == "__main__":
    main()
