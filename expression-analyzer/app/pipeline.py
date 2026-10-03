import re
import time

from app.config import settings
from app.lexicon import compiled
from app import llm

ENTRIES = compiled()

# Bound worst-case O(tokens × lexicon) work on max-size texts.
MAX_SENTENCES = 400
MAX_TOKENS_PER_SENTENCE = 300
MAX_TOTAL_TOKENS = 12000
ANALYZE_DEADLINE_MS = 8000

SPLITS = {
    "don't": ["do", "not"],
    "doesn't": ["does", "not"],
    "didn't": ["did", "not"],
    "can't": ["can", "not"],
    "cannot": ["can", "not"],
    "won't": ["will", "not"],
    "couldn't": ["could", "not"],
    "shouldn't": ["should", "not"],
    "wouldn't": ["would", "not"],
    "isn't": ["is", "not"],
    "aren't": ["are", "not"],
    "wasn't": ["was", "not"],
    "weren't": ["were", "not"],
    "haven't": ["have", "not"],
    "hasn't": ["has", "not"],
    "hadn't": ["had", "not"],
    "i'm": ["i", "am"],
    "i've": ["i", "have"],
    "i'd": ["i", "would"],
    "it's": ["it", "is"],
    "there's": ["there", "is"],
    "that's": ["that", "is"],
    "he's": ["he", "is"],
    "she's": ["she", "is"],
    "we're": ["we", "are"],
    "they're": ["they", "are"],
    "you're": ["you", "are"],
    "let's": ["let", "us"],
}

PRONOUNS = {
    "you", "me", "him", "her", "them", "us", "it", "myself", "yourself", "himself",
    "herself", "ourselves", "themselves", "someone", "somebody", "this", "that",
}
OBJECT_PRONOUNS = {"you", "me", "him", "her", "them", "us", "it"}
SEPARABLE_BLOCK = {"way", "evening", "life", "thing"}
LITERAL_TIME = {
    "star", "stars", "night", "evening", "morning", "sunset", "dusk", "dawn",
    "afternoon", "clock", "hour", "tonight", "noon", "moon", "moonlight", "bat", "bats",
}
DET = {"a", "an", "the", "my", "your", "his", "her", "our", "their", "this", "that", "these", "those", "some", "any"}
TAIL = {"out", "up", "away", "off"}
STOP = {"and", "but", "because", "when", "if", "so", "although", "while", "which", "who"}
FUNCTION = {"to", "of", "for", "with", "at", "from", "into", "in", "on", "about", "by", "as"}
COPULA = {"am", "is", "are", "was", "were", "be", "been", "being"}
NEGATION = {"not", "never"}
ING_BLOCK = {"interesting", "morning", "evening", "something", "anything", "nothing", "everything", "during", "clothing", "ceiling"}
JUNK = {
    "open the door", "drink some water", "drink water", "read a book", "walk down the street",
    "look at the sky", "go to work", "eat breakfast", "close the window", "sit on the chair",
    "come into the room",
}
TYPE_SCORES = {
    "PHRASAL_VERB": (0.88, 0.90, 0.86, 0.93),
    "IDIOM": (0.90, 0.95, 0.84, 0.94),
    "FIXED_EXPRESSION": (0.86, 0.84, 0.93, 0.94),
    "COLLOCATION": (0.82, 0.72, 0.84, 0.90),
    "LEXICAL_CHUNK": (0.86, 0.78, 0.92, 0.90),
    "GRAMMATICAL_PATTERN": (0.94, 0.80, 0.97, 0.93),
    "SENTENCE_FRAME": (0.95, 0.82, 0.98, 0.93),
}


def clamp(value):
    return max(0.0, min(1.0, float(value)))


def score_of(usefulness, idiomaticity, reusability, confidence):
    weights = settings.weights
    total = sum(weights.values()) or 1
    raw = (
        clamp(usefulness) * weights["usefulness"]
        + clamp(idiomaticity) * weights["idiomaticity"]
        + clamp(reusability) * weights["reusability"]
        + clamp(confidence) * weights["confidence"]
    )
    return round(clamp(raw / total), 3)


def words_of(sentence):
    clean = sentence.replace("’", "'").replace("‘", "'")
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", clean)


def pieces_of(words):
    pieces = []
    for index, word in enumerate(words):
        parts = SPLITS.get(word.lower(), [word.lower()])
        for part in parts:
            pieces.append({"norm": part, "surface": index})
    return pieces


def sentences_of(text):
    parts = re.split(r"(?<=[.!?])\s+|\n+", (text or "").strip())
    return [part.strip() for part in parts if part.strip()]


def is_ing(token):
    return len(token) > 4 and token.endswith("ing") and token not in ING_BLOCK


def take_ing(pieces, index):
    if index >= len(pieces) or not is_ing(pieces[index]["norm"]):
        return None
    end = index + 1
    if end < len(pieces) and pieces[end]["norm"] in OBJECT_PRONOUNS | TAIL:
        return end + 1
    if end < len(pieces) and pieces[end]["norm"] in {"a", "an", "the"} and end + 1 < len(pieces):
        if pieces[end + 1]["norm"] not in STOP:
            return end + 2
    if end < len(pieces) and pieces[end]["norm"] not in STOP | FUNCTION | DET:
        return end + 1
    return end


def looks_like_next_verb(token):
    if token in COPULA or token in {"do", "does", "did", "have", "has", "had", "will", "would", "can", "could"}:
        return True
    if len(token) > 4 and token.endswith("ed") and token not in {"tired", "used", "interested"}:
        return True
    return False


def noun_word(token):
    return token not in STOP | FUNCTION | DET | NEGATION and not looks_like_next_verb(token)


def blocked_context(entry, words, source):
    lowered = {word.lower() for word in words}
    if entry["expression"] == "at the end of the day" and lowered & LITERAL_TIME:
        return True
    if entry["expression"] == "break down" and source != "context":
        return True
    return False


def take_noun(pieces, index):
    if index >= len(pieces):
        return None
    norm = pieces[index]["norm"]
    if norm in STOP or norm in FUNCTION or norm in NEGATION:
        return None
    if norm in PRONOUNS:
        return index + 1
    if norm in DET:
        noun_at = index + 1
        if noun_at >= len(pieces) or not noun_word(pieces[noun_at]["norm"]):
            return None
        end = noun_at + 1
        if end < len(pieces) and noun_word(pieces[end]["norm"]) and not looks_like_next_verb(pieces[noun_at]["norm"]):
            end += 1
        return end
    if looks_like_next_verb(norm):
        return None
    return index + 1


def take_slot(pieces, index, kind):
    if kind == "ing":
        return take_ing(pieces, index)
    if kind == "noun":
        return take_noun(pieces, index)
    if kind == "ing-or-noun":
        return take_ing(pieces, index) or take_noun(pieces, index)
    return None


def match_sequence(pieces, start, token_sets, optional):
    index = start
    begin = None
    for pos, options in enumerate(token_sets):
        if index < len(pieces) and pieces[index]["norm"] in options:
            if begin is None:
                begin = index
            index += 1
            continue
        if pos in optional:
            continue
        return None
    if begin is None:
        return None
    return begin, index


def match_separable(pieces, start, verbs, particle):
    if pieces[start]["norm"] not in verbs:
        return None
    size = len(pieces)
    if start + 1 < size and pieces[start + 1]["norm"] == particle:
        return start + 2
    if start + 2 < size and pieces[start + 1]["norm"] in PRONOUNS and pieces[start + 2]["norm"] == particle:
        return start + 3
    if start + 3 < size and pieces[start + 1]["norm"] in DET and pieces[start + 3]["norm"] == particle:
        if pieces[start + 2]["norm"] in SEPARABLE_BLOCK:
            return None
        return start + 4
    return None


def extend_left(pieces, start, keep_copula):
    index = start
    saw_not = False
    while index > 0:
        prev = pieces[index - 1]["norm"]
        if prev in NEGATION:
            saw_not = True
            index -= 1
            continue
        if prev in {"do", "does", "did"} and saw_not:
            index -= 1
            continue
        if keep_copula and prev in COPULA:
            index -= 1
            continue
        break
    return index


def surface(words, pieces, start, end):
    left = pieces[start]["surface"]
    right = pieces[end - 1]["surface"] + 1
    return " ".join(words[left:right])


def choose_meaning(entry, words, after):
    best = None
    best_score = 0
    lowered = {word.lower() for word in words}
    for sense in entry["senses"]:
        score = 0
        if after and after in (sense.get("after") or []):
            score += 3
        for cue in sense.get("cues") or []:
            if cue in lowered:
                score += 1
        if score > best_score:
            best = sense
            best_score = score
    if best and best_score:
        return best["meaning"], "context"
    return entry["meaning"], "dictionary"


def build(entry, exact, meaning, meaning_source, sentence, sentence_index, start, end):
    usefulness, idiomaticity, reusability, confidence = TYPE_SCORES.get(entry["type"], (0.8, 0.75, 0.8, 0.85))
    usefulness = clamp(0.8 * usefulness + 0.2 * entry["frequency"])
    if meaning_source == "context":
        confidence = clamp(confidence + 0.03)
    scores = {
        "usefulnessScore": round(usefulness, 3),
        "idiomaticityScore": round(idiomaticity, 3),
        "reusabilityScore": round(reusability, 3),
        "confidence": round(confidence, 3),
    }
    scores["overallScore"] = score_of(usefulness, idiomaticity, reusability, confidence)
    return {
        "exactText": exact,
        "canonicalForm": entry["canonicalForm"],
        "type": entry["type"],
        "meaning": meaning,
        "meaningSource": meaning_source,
        "context": sentence,
        "sentence": sentence_index,
        "start": start,
        "end": end,
        "children": [],
        "patterns": entry["patterns"],
        "source": "dictionary",
        "analyzerDecision": {
            "accepted": True,
            "source": "dictionary",
            "features": {
                "dictionaryMatch": True,
                "grammaticalPattern": entry["type"] in ("GRAMMATICAL_PATTERN", "SENTENCE_FRAME"),
                "phrasalVerb": entry["type"] == "PHRASAL_VERB",
                "idiom": entry["type"] == "IDIOM",
                "length": end - start,
                "contextMeaning": meaning_source == "context",
                "frequency": entry["frequency"],
            },
        },
        "llmDecision": None,
        "occurrences": [{"exactText": exact, "context": sentence, "meaning": meaning}],
        **scores,
    }


def hits_in(words, sentence, sentence_index):
    pieces = pieces_of(words)
    found = []
    for entry in ENTRIES:
        separable = entry["separable"] and entry["particle"] and len(entry["tokens"]) == 2
        for index in range(len(pieces)):
            if separable:
                end = match_separable(pieces, index, entry["tokens"][0], entry["particle"])
                begin = index if end else None
            else:
                matched = match_sequence(pieces, index, entry["tokens"], entry["optional"])
                if not matched:
                    continue
                begin, end = matched
            if not end:
                continue
            head_begin, head_end = begin, end
            if entry["slot"]:
                slot_end = take_slot(pieces, end, entry["slot"])
                if slot_end is None and not entry["slotOptional"]:
                    continue
                if slot_end is not None:
                    end = slot_end
            begin = extend_left(pieces, begin, entry["keepCopula"])
            after = pieces[end]["norm"] if end < len(pieces) else ""
            meaning, source = choose_meaning(entry, words, after)
            if blocked_context(entry, words, source):
                continue
            item = build(entry, surface(words, pieces, begin, end), meaning, source, sentence, sentence_index, begin, end)
            head_exact = surface(words, pieces, head_begin, head_end)
            if head_exact.lower() != item["exactText"].lower():
                item["children"].append({
                    "exactText": head_exact,
                    "canonicalForm": entry["expression"],
                    "type": entry["type"],
                })
            found.append(item)
    return found


def same_span(items):
    best = {}
    for item in items:
        key = (item["sentence"], item["start"], item["end"], item["canonicalForm"])
        have = best.get(key)
        if not have or item["reusabilityScore"] > have["reusabilityScore"]:
            best[key] = item
    return list(best.values())


def link_nested(items):
    items.sort(key=lambda item: (item["sentence"], item["start"], -(item["end"] - item["start"])))
    kept = []
    rejected = []
    for item in items:
        parent = None
        for other in kept:
            if other["sentence"] != item["sentence"]:
                continue
            if other["start"] <= item["start"] and other["end"] >= item["end"] and (other["end"] - other["start"]) > (item["end"] - item["start"]):
                parent = other
                break
        if parent:
            parent["children"].append({
                "exactText": item["exactText"],
                "canonicalForm": item["canonicalForm"],
                "type": item["type"],
            })
            rejected.append({"exactText": item["exactText"], "canonicalForm": item["canonicalForm"], "reason": "nested-in-longer-expression"})
            continue
        kept.append(item)
    return kept, rejected


def dedupe(items):
    by_key = {}
    for item in items:
        have = by_key.get(item["canonicalForm"])
        if not have:
            by_key[item["canonicalForm"]] = item
            continue
        known = {(row["exactText"].lower(), row["context"]) for row in have["occurrences"]}
        for row in item["occurrences"]:
            if (row["exactText"].lower(), row["context"]) not in known:
                have["occurrences"].append(row)
        seen = {child["canonicalForm"] for child in have["children"]}
        for child in item["children"]:
            if child["canonicalForm"] not in seen:
                have["children"].append(child)
                seen.add(child["canonicalForm"])
        meanings = []
        for row in have["occurrences"]:
            if row["meaning"] not in meanings:
                meanings.append(row["meaning"])
        have["meaning"] = meanings[0] if len(meanings) == 1 else " / ".join(meanings[:3])
    return list(by_key.values())


def apply_llm(items):
    try:
        judged = llm.classify(items[:12])
    except Exception as error:
        print("llm unavailable: %s" % type(error).__name__)
        return "unavailable"
    by_exact = {row["exactText"].lower(): row for row in judged["items"]}
    for item in items:
        extra = by_exact.get(item["exactText"].lower())
        if not extra:
            continue
        flag = extra.get("isExpression", True)
        if isinstance(flag, bool):
            is_expr = flag
        elif flag in (0, "0", "false", "False", "no", "No"):
            is_expr = False
        else:
            is_expr = True
        item["llmDecision"] = {
            "isExpression": is_expr,
            "suggestedType": extra.get("type"),
            "suggestedCanonical": extra.get("canonicalForm"),
            "applied": True,
        }
        if item["meaningSource"] != "context" and extra.get("meaning"):
            item["meaning"] = extra["meaning"]
            for row in item["occurrences"]:
                if row["context"] == item["context"]:
                    row["meaning"] = extra["meaning"]
        for key in ("usefulnessScore", "idiomaticityScore", "reusabilityScore", "confidence"):
            if isinstance(extra.get(key), (int, float)):
                item[key] = round(clamp(0.65 * item[key] + 0.35 * extra[key]), 3)
        item["overallScore"] = score_of(
            item["usefulnessScore"], item["idiomaticityScore"], item["reusabilityScore"], item["confidence"]
        )
    return judged["status"]


def ordinary_phrases(words):
    lowered = [word.lower() for word in words]
    found = []
    for width in (2, 3, 4, 5):
        for index in range(0, len(lowered) - width + 1):
            text = " ".join(lowered[index:index + width])
            if text in JUNK:
                found.append(text)
    return found


def ngram_count(words):
    count = 0
    for width in (2, 3, 4, 5, 6):
        count += max(0, len(words) - width + 1)
    return count


def analyze(text, content_type="TEXT"):
    started = time.perf_counter()
    deadline = started + (ANALYZE_DEADLINE_MS / 1000.0)
    raw = []
    rejected = []
    ordinary = []
    grams = 0
    total_tokens = 0
    for sentence_index, sentence in enumerate(sentences_of(text)):
        if sentence_index >= MAX_SENTENCES or time.perf_counter() > deadline:
            break
        words = words_of(sentence)
        if len(words) > MAX_TOKENS_PER_SENTENCE:
            words = words[:MAX_TOKENS_PER_SENTENCE]
        total_tokens += len(words)
        if total_tokens > MAX_TOTAL_TOKENS:
            break
        raw.extend(hits_in(words, sentence, sentence_index))
        grams += ngram_count(words)
        ordinary.extend(ordinary_phrases(words))
        if time.perf_counter() > deadline:
            break
    raw = same_span(raw)
    kept, nested = link_nested(raw)
    rejected.extend(nested)
    merged = dedupe(kept)
    llm_note = "skipped"
    if settings.llm_base_url and settings.llm_model and merged and time.perf_counter() <= deadline:
        llm_note = apply_llm(merged)
    accepted = []
    for item in merged:
        if item.get("llmDecision", {}).get("isExpression") is False:
            rejected.append({
                "exactText": item["exactText"],
                "canonicalForm": item["canonicalForm"],
                "reason": "llm-not-expression",
            })
            continue
        if item["overallScore"] < settings.min_score:
            rejected.append({"exactText": item["exactText"], "canonicalForm": item["canonicalForm"], "reason": "below-minimum-score"})
            continue
        accepted.append(item)
    accepted.sort(key=lambda item: (-item["overallScore"], item["sentence"], item["start"]))
    for item in accepted:
        item.pop("sentence", None)
        item.pop("start", None)
        item.pop("end", None)
        item.pop("meaningSource", None)
    duration = round((time.perf_counter() - started) * 1000, 1)
    print(
        "analysis finished content=%s candidates=%s ngrams=%s rejected=%s accepted=%s llm=%s ms=%s"
        % (content_type, len(raw), grams, len(rejected), len(accepted), llm_note, duration)
    )
    return {
        "contentType": content_type,
        "expressions": accepted,
        "stats": {
            "candidateCount": len(raw),
            "ngramCount": grams,
            "junkDropped": len(set(ordinary)),
            "rejectedCount": len(rejected),
            "acceptedCount": len(accepted),
            "llm": llm_note,
            "durationMs": duration,
            "candidates": [
                {"exactText": item["exactText"], "canonicalForm": item["canonicalForm"], "type": item["type"]}
                for item in raw[:60]
            ],
            "rejected": rejected[:40],
            "ordinaryRejected": sorted(set(ordinary))[:20],
        },
    }
