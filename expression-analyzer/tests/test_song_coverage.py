from app.config import settings
from app import pipeline


def test_song_phrases_and_word_lemmas(monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", "")
    result = pipeline.analyze("You've got to cool down, relax, take it easy. Keep on running. Slow down.", "LYRICS")
    canonical = {item["canonicalForm"] for item in result["expressions"]}
    assert {"cool down", "take it easy", "keep on", "slow down"} <= canonical
    assert result["wordLemmas"]["running"] == "run"
    assert result["stats"]["partial"] is False


def test_truncated_text_is_explicit(monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", "")
    monkeypatch.setattr(pipeline, "MAX_SENTENCES", 1)
    result = pipeline.analyze("She gave up. He found out.")
    assert result["stats"]["partial"] is True
    assert result["stats"]["processedSentences"] == 1
    assert result["stats"]["totalSentences"] == 2


def test_unreviewed_candidates_are_not_reported_as_full_ai_analysis(monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", "http://fixture")
    monkeypatch.setattr(settings, "llm_model", "fixture")
    monkeypatch.setattr(pipeline, "apply_llm", lambda items: "unavailable")
    result = pipeline.analyze("She gave up.")
    assert result["stats"]["llmPartial"] is True
    assert result["stats"]["llmReviewed"] == 0


def test_review_offset_advances_to_the_next_candidates(monkeypatch):
    monkeypatch.setattr(settings, "llm_base_url", "http://fixture")
    monkeypatch.setattr(settings, "llm_model", "fixture")
    monkeypatch.setattr(settings, "llm_candidates", 2)
    reviewed = []

    def review(items):
        reviewed.append([item["canonicalForm"] for item in items])
        for item in items:
            item["llmDecision"] = {"isExpression": True, "applied": True}
        return "ok"

    monkeypatch.setattr(pipeline, "apply_llm", review)
    text = "She gave up. He found out. I look after her. They carry on."
    first = pipeline.analyze(text)
    second = pipeline.analyze(text, review_offset=first["stats"]["nextReviewOffset"])
    assert len(reviewed[0]) == len(reviewed[1]) == 2
    assert set(reviewed[0]).isdisjoint(reviewed[1])
    assert second["stats"]["nextReviewOffset"] is None
