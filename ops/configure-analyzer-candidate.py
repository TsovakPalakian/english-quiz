"""Configure a copied analyzer deployment without printing or replacing its secrets."""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
if not root.name.startswith("expression-analyzer-candidate-"):
    raise SystemExit("Expected a candidate deployment directory")
path = root / ".env"
lines = path.read_text().splitlines()
updates = {
    "LLM_BASE_URL": "http://ollama:11434",
    "LLM_MODEL": "qwen2.5:1.5b",
    "LLM_TIMEOUT": "45",
    "LLM_MAX_CANDIDATES": "2",
    "SPACY_MODEL": "en_core_web_sm",
}
lines = [line for line in lines if line.split("=", 1)[0] not in updates]
lines.extend(key + "=" + value for key, value in updates.items())
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
print("Candidate configured; existing secrets preserved")
