import hmac
import time

from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from app.config import settings
from app.pipeline import analyze

app = FastAPI(title="Expression Analyzer", version="1")

# Wire budget above Pydantic max_length (100k) to cover JSON wrappers.
MAX_ANALYZE_BYTES = 120_000


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100000)
    contentType: str = "TEXT"


@app.middleware("http")
async def limit_analyze_body(request: Request, call_next):
    if request.url.path == "/api/v1/analyze" and request.method == "POST":
        length = request.headers.get("content-length")
        # Require Content-Length so chunked/omitted CL cannot bypass the cap.
        if length is None:
            return JSONResponse({"detail": "Content-Length required"}, status_code=411)
        try:
            size = int(length)
        except ValueError:
            return JSONResponse({"detail": "Bad request"}, status_code=400)
        if size < 0 or size > MAX_ANALYZE_BYTES:
            return JSONResponse({"detail": "Payload too large"}, status_code=413)

        received = 0

        async def limited_receive():
            nonlocal received
            message = await request.receive()
            body = message.get("body") or b""
            received += len(body)
            if received > MAX_ANALYZE_BYTES:
                return {"type": "http.disconnect"}
            return message

        request._receive = limited_receive
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok", "llm": bool(settings.llm_base_url and settings.llm_model)}


def presented_key(x_api_key, authorization):
    if x_api_key:
        return x_api_key
    if authorization and authorization[:7].lower() == "bearer ":
        return authorization[7:].strip()
    return ""


def key_matches(presented, expected):
    if not expected:
        return False
    left = presented or ""
    right = expected
    # compare_digest requires equal length; pad/normalize via sha256 digests.
    return hmac.compare_digest(
        hmac.new(b"enquiz-analyzer", left.encode("utf-8"), "sha256").digest(),
        hmac.new(b"enquiz-analyzer", right.encode("utf-8"), "sha256").digest(),
    )


@app.post("/api/v1/analyze")
def analyze_route(
    body: AnalyzeRequest,
    x_api_key: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if settings.require_key and not settings.api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if settings.api_key and not key_matches(presented_key(x_api_key, authorization), settings.api_key):
        raise HTTPException(status_code=401, detail="Unauthorized")
    started = time.perf_counter()
    print("analysis started chars=%s type=%s" % (len(body.text), body.contentType))
    result = analyze(body.text, body.contentType or "TEXT")
    result["stats"]["durationMs"] = round((time.perf_counter() - started) * 1000, 1)
    return result
