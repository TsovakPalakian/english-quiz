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
    prompt = {
        "task": (
            "You help an English learner. Keep a candidate only if the learner can reuse the pattern in new sentences. "
            "Prefer reusable patterns such as 'look forward to + V-ing' over ordinary combinations such as 'open the door'. "
            "Use the sentence to choose the meaning. Do not invent a second expression for each grammatical form. Return JSON only."
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
        "schema": {
            "items": [
                {
                    "isExpression": True,
                    "type": "PHRASAL_VERB",
                    "exactText": "",
                    "canonicalForm": "",
                    "meaning": "",
                    "usefulnessScore": 0.0,
                    "idiomaticityScore": 0.0,
                    "reusabilityScore": 0.0,
                    "confidence": 0.0,
                }
            ]
        },
    }
    url = settings.llm_base_url + "/api/chat"
    body = {
        "model": settings.llm_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": "You return a JSON object with an items array. Judge learning value, not just whether the English is grammatical. No prose."},
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
        for row in rows[:500]:
            clean = valid_item(row)
            if clean:
                items.append(clean)
            else:
                print("llm item discarded")
        return {"status": "ok", "items": items}
    except Exception as error:
        print("llm unavailable: %s" % type(error).__name__)
        return {"status": "unavailable", "items": []}
