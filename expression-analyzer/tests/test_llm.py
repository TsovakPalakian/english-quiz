import json

from app import llm


CANDIDATES = [{"exactText": "gave it up", "canonicalForm": "give up", "type": "PHRASAL_VERB", "context": "She gave it up."}]


def respond(monkeypatch, items):
    class Response:
        content = b"{}"

        def raise_for_status(self):
            pass

        def json(self):
            return {"message": {"content": json.dumps({"items": items})}}

    def post(url, json, timeout):
        assert json["format"]["type"] == "object"
        assert json["options"]["num_predict"] <= 220
        return Response()

    monkeypatch.setattr(llm.httpx, "post", post)


def test_compact_reply_preserves_dictionary_identity(monkeypatch):
    respond(monkeypatch, [{"exactText": "gave it up", "isExpression": True, "meaning": "Stopped trying", "confidence": 0.9}])
    result = llm.classify(CANDIDATES)
    assert result["status"] == "ok"
    assert result["items"][0]["canonicalForm"] == "give up"
    assert result["items"][0]["type"] == "PHRASAL_VERB"


def test_empty_or_unrelated_reply_is_not_success(monkeypatch):
    for rows in ([], [{"exactText": "invented phrase"}]):
        respond(monkeypatch, rows)
        assert llm.classify(CANDIDATES)["status"] == "invalid"


def test_repeated_reply_does_not_hide_missing_candidate(monkeypatch):
    row = {"exactText": "gave it up", "isExpression": True, "confidence": 0.9}
    respond(monkeypatch, [row, row])
    other = {**CANDIDATES[0], "exactText": "give up"}
    assert llm.classify(CANDIDATES + [other])["status"] == "invalid"
