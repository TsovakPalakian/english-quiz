import time

from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.pipeline import analyze

app = FastAPI(title="Expression Analyzer", version="1")


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000000)
    contentType: str = "TEXT"


@app.get("/health")
def health():
    return {"status": "ok", "llm": bool(settings.llm_base_url and settings.llm_model)}


def presented_key(x_api_key, authorization):
    if x_api_key:
        return x_api_key
    if authorization and authorization[:7].lower() == "bearer ":
        return authorization[7:].strip()
    return ""


@app.post("/api/v1/analyze")
def analyze_route(
    body: AnalyzeRequest,
    x_api_key: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if settings.require_key and not settings.api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if settings.api_key and presented_key(x_api_key, authorization) != settings.api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
    started = time.perf_counter()
    print("analysis started chars=%s type=%s" % (len(body.text), body.contentType))
    result = analyze(body.text, body.contentType or "TEXT")
    result["stats"]["durationMs"] = round((time.perf_counter() - started) * 1000, 1)
    return result
