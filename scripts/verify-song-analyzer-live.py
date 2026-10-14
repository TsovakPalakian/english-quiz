"""Authenticated inference probe; reads, but never prints, the container API key."""
import json
import os
import sys
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
text = "You've got to cool down, relax, take it easy. Keep on running. Slow down."
offset = 0
reviewed = set()
while True:
    request = urllib.request.Request(
        base + "/api/v1/analyze",
        data=json.dumps({"text": text, "contentType": "LYRICS", "reviewOffset": offset}).encode(),
        headers={"Content-Type": "application/json", "X-Api-Key": os.environ["ANALYZER_API_KEY"]},
    )
    with urllib.request.urlopen(request, timeout=65) as response:
        result = json.load(response)
    stats = result["stats"]
    print(json.dumps({"offset": offset, "llm": stats["llm"], "durationMs": stats["durationMs"], "partial": stats["partial"], "running": result["wordLemmas"].get("running"), "reviewed": stats["reviewedExpressions"]}), flush=True)
    assert stats["llm"] == "ok"
    assert stats["partial"] is False
    assert result["wordLemmas"].get("running") == "run"
    expected = {"cool down", "take it easy", "keep on", "slow down"}
    assert expected <= {row["canonicalForm"] for row in result["expressions"]}
    reviewed.update(row["canonicalForm"] for row in stats["reviewedExpressions"])
    next_offset = stats["nextReviewOffset"]
    if next_offset is None:
        assert expected <= reviewed
        break
    assert next_offset > offset
    offset = next_offset
print("Song analyzer live verification passed", flush=True)
