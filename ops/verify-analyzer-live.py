"""Run inside the analyzer container; never print its API key."""

import json
import os
import sys
import urllib.error
import urllib.request


base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def request(path, body=None, authenticated=False):
    headers = {"Content-Type": "application/json"}
    if authenticated:
        headers["X-Api-Key"] = os.environ["ANALYZER_API_KEY"]
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=65) as response:
        return json.load(response)


health = request("/health")
print("health:", json.dumps(health), flush=True)
assert health["llm"] is True and health["spacy"]["enabled"] is True
try:
    request("/api/v1/analyze", {"text": "She gave it up."})
except urllib.error.HTTPError as error:
    assert error.code == 401, error.code
    print("unauthenticated: 401", flush=True)
else:
    raise AssertionError("Unauthenticated analysis was allowed")

for content_type, text, expected in (
    ("TEXT", "She gave it up. Let's break the ice.", "give up"),
    ("LYRICS", "Never give up.\nLet's break the ice.", "give up"),
):
    result = request("/api/v1/analyze", {"text": text, "contentType": content_type}, True)
    expressions = result["expressions"]
    print(content_type, json.dumps({
        "stats": result["stats"],
        "expressions": [{"canonicalForm": row["canonicalForm"], "llmDecision": row.get("llmDecision")} for row in expressions],
    }), flush=True)
    assert result["stats"]["llm"] == "ok", "AI did not complete successfully"
    assert any(row.get("llmDecision") for row in expressions), "AI decisions were not applied"
    assert any(row["canonicalForm"] == expected for row in expressions), expected

print("Live analyzer verification passed", flush=True)
