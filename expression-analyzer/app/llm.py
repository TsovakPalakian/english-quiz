import json

import httpx

from app.config import settings

ITEM_FIELDS = {
    "isExpression",
    "type",
    "exactText",
    "canonicalForm",
    "meaning",
    "usefulnessScore",
    "idiomaticityScore",
    "reusabilityScore",
    "confidence",
}
TYPES = {
    "PHRASAL_VERB",
    "IDIOM",
    "FIXED_EXPRESSION",
    "COLLOCATION",
    "LEXICAL_CHUNK",
    "GRAMMATICAL_PATTERN",
    "SENTENCE_FRAME",
    "OTHER",
}


def valid_item(row):
    if not isinstance(row, dict):
        return None
    if "exactText" not in row or not isinstance(row.get("exactText"), str):
        return None
    if row.get("type") not in TYPES:
        row = dict(row)
        row["type"] = "OTHER"
    # Coerce isExpression to a real bool; non-bool / missing defaults to True (keep).
    flag = row.get("isExpression", True)
    if isinstance(flag, bool):
        pass
    elif flag in (0, "0", "false", "False", "no", "No"):
        flag = False
    elif flag in (1, "1", "true", "True", "yes", "Yes"):
        flag = True
    else:
        return None
    row = dict(row)
    row["isExpression"] = flag
    for key in ("usefulnessScore", "idiomaticityScore", "reusabilityScore", "confidence"):
        value = row.get(key)
        if value is None:
            continue
        if not isinstance(value, (int, float)) or value < 0 or value > 1:
            return None
    return {key: row.get(key) for key in ITEM_FIELDS if key in row}


def classify(candidates):
    if not candidates:
        return {"status": "ok", "items": []}
    originals = {item["exactText"].lower(): item for item in candidates}
    prompt = {
        "task": (
            "Judge each English expression in context. Keep reusable expressions, not ordinary word combinations. "
            "Copy exactText unchanged. Give a concise English meaning (at most eight words) and confidence from 0 to 1."
        ),
        "items": [
            {
                "exactText": item["exactText"],
                "canonicalForm": item["canonicalForm"],
                "type": item["type"],
                "context": item["context"],
            }
            for item in candidates
        ],
    }
    schema = {
        "type": "object",
        "properties": {"items": {
            "type": "array", "minItems": len(candidates), "maxItems": len(candidates),
            "items": {
                "type": "object",
                "properties": {
                    "exactText": {"type": "string", "enum": [item["exactText"] for item in candidates]},
                    "isExpression": {"type": "boolean"},
                    "meaning": {"type": "string", "maxLength": 100},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                },
                "required": ["exactText", "isExpression", "meaning", "confidence"],
                "additionalProperties": False,
            },
        }},
        "required": ["items"],
        "additionalProperties": False,
    }
    url = settings.llm_base_url + "/api/chat"
    body = {
        "model": settings.llm_model,
        "stream": False,
        "format": schema,
        "keep_alive": "30m",
        "options": {"temperature": 0, "num_predict": 220, "num_ctx": 2048, "num_thread": 1},
        "messages": [
            {"role": "system", "content": "Return JSON with an items array, one judgment per candidate. No prose."},
            {"role": "user", "content": json.dumps(prompt)},
        ],
    }
    try:
        response = httpx.post(url, json=body, timeout=settings.llm_timeout)
        response.raise_for_status()
        # Cap wire size before json parse (env-trusted peer, still bound memory).
        if len(response.content or b"") > 2_000_000:
            print("llm response discarded: too large")
            return {"status": "invalid", "items": []}
        payload = response.json()
        content = payload.get("message", {}).get("content", "")
        if isinstance(content, str) and len(content) > 1_000_000:
            print("llm response discarded: content too large")
            return {"status": "invalid", "items": []}
        parsed = json.loads(content)
        rows = parsed.get("items") if isinstance(parsed, dict) else None
        if not isinstance(rows, list):
            print("llm response discarded: items array missing")
            return {"status": "invalid", "items": []}
        items = []
        seen = set()
        for row in rows[:500]:
            if not isinstance(row, dict) or not isinstance(row.get("exactText"), str):
                continue
            exact = row["exactText"].lower()
            original = originals.get(exact)
            if not original or exact in seen:
                continue
            row = {"type": original["type"], "canonicalForm": original["canonicalForm"], **row}
            clean = valid_item(row)
            if clean:
                items.append(clean)
                seen.add(exact)
            else:
                print("llm item discarded")
        return {"status": "ok" if seen == set(originals) else "invalid", "items": items}
    except Exception as error:
        print("llm unavailable: %s" % type(error).__name__)
        return {"status": "unavailable", "items": []}
