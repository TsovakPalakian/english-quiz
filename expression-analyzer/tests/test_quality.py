from app.config import settings
from app.pipeline import analyze, score_of
from app import llm

settings.llm_base_url = ""
settings.llm_model = ""


def test_scores_stay_inside_zero_and_one():
    result = analyze("I don't feel like going out. At the end of the day she gave up.")
    for item in result["expressions"]:
        for key in ("usefulnessScore", "idiomaticityScore", "reusabilityScore", "confidence", "overallScore"):
            assert 0 <= item[key] <= 1


def test_one_metric_cannot_dominate():
    saved = dict(settings.weights)
    settings.weights = {"usefulness": 0.34, "idiomaticity": 0.22, "reusability": 0.22, "confidence": 0.22}
    try:
        assert score_of(1, 0, 0, 0) == round(0.34 / 1.0, 3)
        assert score_of(1, 1, 1, 1) == 1
    finally:
        settings.weights = saved


def test_rank_does_not_depend_on_other_candidates():
    alone = analyze("People should never give up.")
    crowded = analyze("People should never give up. Open the door. Read a book. Walk down the street.")
    left = next(item for item in alone["expressions"] if item["canonicalForm"] == "give up")
    right = next(item for item in crowded["expressions"] if item["canonicalForm"] == "give up")
    assert left["overallScore"] == right["overallScore"]
    assert crowded["expressions"] == [right] or all(item["canonicalForm"] == "give up" for item in crowded["expressions"])


def test_two_senses_keep_their_own_meanings():
    result = analyze("The plane took off at six. He took off his jacket.")
    item = next(found for found in result["expressions"] if found["canonicalForm"] == "take off")
    meanings = [row["meaning"].lower() for row in item["occurrences"]]
    assert any("ground" in meaning for meaning in meanings)
    assert any("remove" in meaning for meaning in meanings)
    assert len(item["occurrences"]) == 2


def test_llm_failure_keeps_dictionary_results(monkeypatch):
    settings.llm_base_url = "http://llm.invalid"
    settings.llm_model = "test-model"

    def explode(items):
        raise RuntimeError("down")

    monkeypatch.setattr(llm, "classify", explode)
    try:
        result = analyze("She gave up after a long day.")
        assert result["stats"]["llm"] == "unavailable"
        assert any(item["canonicalForm"] == "give up" for item in result["expressions"])
    finally:
        settings.llm_base_url = ""
        settings.llm_model = ""


def test_llm_cannot_replace_a_dictionary_hit(monkeypatch):
    settings.llm_base_url = "http://llm.invalid"
    settings.llm_model = "test-model"

    def deny(items):
        return {
            "status": "ok",
            "items": [{
                "exactText": items[0]["exactText"],
                "isExpression": False,
                "type": "OTHER",
                "canonicalForm": "not this",
                "meaning": "ordinary words",
                "usefulnessScore": 0.2,
                "idiomaticityScore": 0.2,
                "reusabilityScore": 0.2,
                "confidence": 0.2,
            }],
        }

    monkeypatch.setattr(llm, "classify", deny)
    try:
        result = analyze("She gave up.")
        item = result["expressions"][0]
        assert item["canonicalForm"] == "give up"
        assert item["llmDecision"]["isExpression"] is False
    finally:
        settings.llm_base_url = ""
        settings.llm_model = ""


def test_api_key_and_bearer(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    settings.api_key = "local-test-key"
    client = TestClient(app)
    body = {"text": "She gave up."}
    try:
        assert client.post("/api/v1/analyze", json=body).status_code == 401
        assert client.post("/api/v1/analyze", json=body, headers={"X-Api-Key": "nope"}).status_code == 401
        assert client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.post("/api/v1/analyze", json=body, headers={"X-Api-Key": "local-test-key"}).status_code == 200
        assert client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer local-test-key"}).status_code == 200
    finally:
        settings.api_key = ""
