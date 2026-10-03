import os


def num(name, default):
    raw = os.environ.get(name, "")
    if raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


class Settings:
    def __init__(self):
        self.llm_base_url = os.environ.get("LLM_BASE_URL", "").rstrip("/")
        self.llm_model = os.environ.get("LLM_MODEL", "")
        self.llm_timeout = num("LLM_TIMEOUT", 20)
        self.api_key = os.environ.get("ANALYZER_API_KEY", "")
        # Default closed: require a key unless explicitly disabled with ANALYZER_REQUIRE_KEY=0.
        req = os.environ.get("ANALYZER_REQUIRE_KEY", "1").lower()
        self.require_key = req not in ("0", "false", "no")
        self.min_score = num("MIN_OVERALL_SCORE", 0.55)
        self.weights = {
            "usefulness": num("RANK_USEFULNESS", 0.34),
            "idiomaticity": num("RANK_IDIOMATICITY", 0.22),
            "reusability": num("RANK_REUSABILITY", 0.22),
            "confidence": num("RANK_CONFIDENCE", 0.22),
        }


settings = Settings()
