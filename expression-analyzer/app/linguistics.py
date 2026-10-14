import re
from functools import lru_cache
from threading import Lock

from app.config import settings

_lock = Lock()


@lru_cache(maxsize=1)
def model():
    try:
        import spacy
        return spacy.load(settings.spacy_model, disable=["ner"])
    except (ImportError, OSError):
        return None


def status():
    return {"enabled": model() is not None, "model": settings.spacy_model}


def annotate(sentence):
    nlp = model()
    if nlp is None:
        return []
    # Keep regex surface offsets unchanged for existing cards and text highlights.
    clean = sentence.replace("\u2019", "'").replace("\u2018", "'")
    matches = list(re.finditer(r"[A-Za-z]+(?:'[A-Za-z]+)?", clean))
    with _lock:
        doc = nlp(clean)
    tokens = iter(doc)
    token = next(tokens, None)
    result = []
    for match in matches:
        while token is not None and token.idx + len(token) <= match.start():
            token = next(tokens, None)
        if token is not None and token.idx <= match.start():
            result.append({"lemma": token.lemma_.lower(), "pos": token.pos_, "dep": token.dep_})
        else:
            result.append({})
    return result
