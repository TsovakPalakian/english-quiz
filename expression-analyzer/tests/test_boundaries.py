import time

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.pipeline import analyze

settings.llm_base_url = ""
settings.llm_model = ""
settings.api_key = ""
settings.require_key = False
client = TestClient(app)


def test_health_does_not_need_llm_or_key():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_empty_text_is_rejected():
    response = client.post("/api/v1/analyze", json={"text": ""})
    assert response.status_code == 422


def test_one_word_returns_no_expression():
    result = analyze("Hello")
    assert result["expressions"] == []


def test_apostrophes_survive_tokenization():
    result = analyze("I don't feel like going out. I've been looking forward to seeing you. I can't help it. I didn't give up.")
    forms = {item["canonicalForm"] for item in result["expressions"]}
    assert "feel like + V-ing" in forms
    assert "look forward to + noun/V-ing" in forms
    assert "give up" in forms
    exacts = " ".join(item["exactText"].lower() for item in result["expressions"])
    assert "don't feel like going out" in exacts
    assert "looking forward to seeing you" in exacts


def test_unicode_russian_quotes_and_html_do_not_crash():
    text = "«Я don't feel like going out», — said Ann.\n\n<p>Don't give up.</p>\nShe said \"I've been looking forward to seeing you.\""
    result = analyze(text)
    forms = {item["canonicalForm"] for item in result["expressions"]}
    assert "feel like + V-ing" in forms
    assert "give up" in forms
    assert "look forward to + noun/V-ing" in forms


def test_paragraphs_and_punctuation():
    result = analyze("By the way...\n\nAt the end of the day, she gave up!")
    forms = {item["canonicalForm"] for item in result["expressions"]}
    assert "by the way" in forms
    assert "at the end of the day" in forms
    assert "give up" in forms


def test_reanalyze_is_idempotent():
    text = "I don't feel like going out tonight. She gave up. He gave up too."
    first = analyze(text)["expressions"]
    second = analyze(text)["expressions"]
    assert [item["canonicalForm"] for item in first] == [item["canonicalForm"] for item in second]
    assert len({item["canonicalForm"] for item in second}) == len(second)


def test_very_long_text_stays_fast():
    sentence = "At the end of the day she gave up. "
    text = sentence * 100
    started = time.perf_counter()
    result = analyze(text)
    duration = time.perf_counter() - started
    assert duration < 5
    assert any(item["canonicalForm"] == "give up" for item in result["expressions"])
    assert result["stats"]["acceptedCount"] < 10


def test_production_key_is_required_when_configured():
    settings.require_key = True
    settings.api_key = ""
    try:
        assert client.post("/api/v1/analyze", json={"text": "She gave up."}).status_code == 401
        assert client.get("/health").status_code == 200
    finally:
        settings.require_key = False
        settings.api_key = ""


def test_wrong_and_missing_key():
    settings.api_key = "server-key"
    settings.require_key = True
    try:
        body = {"text": "She gave up."}
        assert client.post("/api/v1/analyze", json=body).status_code == 401
        assert client.post("/api/v1/analyze", json=body, headers={"X-Api-Key": "no"}).status_code == 401
        assert client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer no"}).status_code == 401
        ok = client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer server-key"})
        assert ok.status_code == 200
        assert ok.json()["expressions"]
    finally:
        settings.api_key = ""
        settings.require_key = False
