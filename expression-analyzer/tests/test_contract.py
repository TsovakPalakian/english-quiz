from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

settings.llm_base_url = ""
settings.llm_model = ""
client = TestClient(app, raise_server_exceptions=False)


def setup_function():
    settings.api_key = ""
    settings.require_key = False
    settings.llm_base_url = ""
    settings.llm_model = ""


def teardown_function():
    settings.api_key = ""
    settings.require_key = False
    settings.llm_base_url = ""
    settings.llm_model = ""


def test_valid_request():
    response = client.post("/api/v1/analyze", json={"text": "She gave up."})
    assert response.status_code == 200
    body = response.json()
    assert body["expressions"][0]["canonicalForm"] == "give up"
    assert "analyzerDecision" in body["expressions"][0]


def test_empty_text():
    assert client.post("/api/v1/analyze", json={"text": ""}).status_code == 422


def test_oversized_text():
    assert client.post("/api/v1/analyze", json={"text": "a" * 2000001}).status_code == 422


def test_valid_and_invalid_keys():
    settings.api_key = "contract-key"
    body = {"text": "She gave up."}
    assert client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer contract-key"}).status_code == 200
    denied = client.post("/api/v1/analyze", json=body, headers={"Authorization": "Bearer wrong"})
    assert denied.status_code == 401
    assert "contract-key" not in denied.text


def test_missing_key_when_required():
    settings.require_key = True
    settings.api_key = ""
    denied = client.post("/api/v1/analyze", json={"text": "She gave up."})
    assert denied.status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/health").json()["status"] == "ok"


def test_health_without_key_or_llm():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["llm"] is False


def test_malformed_request():
    assert client.post("/api/v1/analyze", content="not-json", headers={"Content-Type": "application/json"}).status_code == 422
    assert client.post("/api/v1/analyze", json={"contentType": "TEXT"}).status_code == 422


def test_error_response_does_not_contain_the_key(monkeypatch):
    settings.api_key = "contract-key"
    settings.require_key = True

    def explode(text, content_type="TEXT"):
        raise RuntimeError("contract-key should not leak")

    monkeypatch.setattr("app.main.analyze", explode)
    response = client.post(
        "/api/v1/analyze",
        json={"text": "She gave up."},
        headers={"Authorization": "Bearer contract-key"},
    )
    assert response.status_code == 500
    assert "contract-key" not in response.text
