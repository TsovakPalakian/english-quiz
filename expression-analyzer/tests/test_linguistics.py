from app import linguistics
from app.pipeline import hits_in, words_of, analyze


def test_spacy_verb_lemma_can_match_without_changing_surface():
    words = ["She", "gived", "up"]
    annotations = [{}, {"lemma": "give", "pos": "VERB"}, {}]
    hits = hits_in(words, "She gived up.", 0, annotations)
    assert any(item["canonicalForm"] == "give up" and item["exactText"] == "gived up" for item in hits)


def test_real_spacy_model():
    assert linguistics.status()["enabled"] is True
    words = words_of("She gave it up.")
    annotations = linguistics.annotate(" ".join(words))
    assert len(words) == len(annotations)
    assert annotations[1]["lemma"] == "give"
    assert annotations[1]["pos"] == "VERB"


def test_spacy_failure_preserves_dictionary(monkeypatch):
    monkeypatch.setattr(linguistics, "model", lambda: None)
    result = analyze("She gave up.")
    assert any(item["canonicalForm"] == "give up" for item in result["expressions"])
    assert result["stats"]["spacy"]["enabled"] is False
