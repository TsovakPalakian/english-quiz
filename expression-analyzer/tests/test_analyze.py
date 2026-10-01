import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import settings
from app.llm import valid_item
from app.main import app
from app.pipeline import analyze

settings.llm_base_url = ""
settings.llm_model = ""

ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def canonicals(text):
    result = analyze(text)
    return [item["canonicalForm"] for item in result["expressions"]]


def test_phrasal_idiom_fixed_and_frames():
    found = canonicals(
        "Don't give up. I look forward to the trip. Let's break the ice. At the end of the day it is fine. "
        "I don't feel like going out. There is no point in arguing."
    )
    for name in (
        "give up",
        "look forward to + noun/V-ing",
        "break the ice",
        "at the end of the day",
        "feel like + V-ing",
        "there is no point in + V-ing",
    ):
        assert name in found


def test_junk_ngrams_are_dropped():
    result = analyze("Open the door. Drink water. Walk down the street. Read a book. Look at the sky.")
    texts = [item["exactText"].lower() for item in result["expressions"]]
    assert texts == []
    assert result["stats"]["junkDropped"] > 0


def test_inflected_forms_share_one_card():
    result = analyze("I look forward to dinner. She is looking forward to seeing you. He looked forward to it.")
    matches = [item for item in result["expressions"] if item["canonicalForm"] == "look forward to + noun/V-ing"]
    assert len(matches) == 1
    assert len(matches[0]["occurrences"]) >= 2


def test_nested_feel_like_keeps_the_frame():
    result = analyze("I don't feel like going out tonight.")
    forms = [item["canonicalForm"] for item in result["expressions"]]
    assert forms == ["feel like + V-ing"]
    assert result["expressions"][0]["exactText"].lower() == "don't feel like going out"


def test_context_is_the_sentence():
    result = analyze("The plane took off at six in the morning.")
    item = result["expressions"][0]
    assert item["canonicalForm"] == "take off"
    assert "took off" in item["context"]
    assert item["exactText"].lower() == "took off"


def test_malformed_llm_item_is_discarded():
    assert valid_item("nope") is None
    assert valid_item({"exactText": "give up", "usefulnessScore": 4}) is None
    clean = valid_item({"exactText": "give up", "type": "PHRASAL_VERB", "confidence": 0.9})
    assert clean["exactText"] == "give up"


def test_api_returns_expressions():
    response = client.post("/api/v1/analyze", json={"text": "I can't help thinking about it.", "contentType": "TEXT"})
    assert response.status_code == 200
    body = response.json()
    assert body["expressions"][0]["canonicalForm"] == "can't help + V-ing"


def test_eval_dataset():
    data = json.loads((ROOT / "eval" / "dataset.json").read_text())
    tp = fp = fn = 0
    problems = []
    for group, rows in data.items():
        for row in rows:
            result = analyze(row["text"])
            got = {item["canonicalForm"] for item in result["expressions"]}
            expected = {item["canonical"] for item in row["expect"]}
            for item in row["expect"]:
                match = next((found for found in result["expressions"] if found["canonicalForm"] == item["canonical"]), None)
                if not match:
                    fn += 1
                    problems.append("missing %s in %s" % (item["canonical"], group))
                    continue
                tp += 1
                if item.get("type"):
                    assert match["type"] == item["type"]
                if item.get("meaning"):
                    blob = " ".join(occ["meaning"] for occ in match["occurrences"]).lower()
                    assert item["meaning"] in blob
                if item.get("exact"):
                    exacts = [match["exactText"].lower()] + [occ["exactText"].lower() for occ in match["occurrences"]]
                    assert item["exact"] in exacts
            for extra in got - expected:
                fp += 1
                problems.append("extra %s in %s (%s)" % (extra, group, row["text"]))
            for name in row.get("reject", []):
                assert name not in got
                assert all(name not in found["exactText"].lower() for found in result["expressions"])
    precision = 1.0 if tp + fp == 0 else tp / (tp + fp)
    recall = 1.0 if tp + fn == 0 else tp / (tp + fn)
    assert problems == []
    assert precision == 1
    assert recall == 1
