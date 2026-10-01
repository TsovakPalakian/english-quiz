# Expression Analyzer

Stateless HTTP service that finds reusable English expressions in a text. The quiz application stores texts and cards. This service does not.

## Run locally

```bash
docker compose up --build
```

```bash
curl http://localhost:8000/health
```

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"I don'\''t feel like going out tonight."}'
```

Without Docker:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Ollama is optional. With no `LLM_BASE_URL`, the service answers from the dictionary and grammar patterns.

## Run with Ollama

```bash
LLM_BASE_URL=http://ollama:11434 LLM_MODEL=qwen2.5:7b docker compose --profile llm up --build
```

Pull the model once inside the Ollama container. If Ollama is down, analysis still returns the dictionary result.

## Environment

| Variable | Local | Production |
|---|---|---|
| `ANALYZER_API_KEY` | empty | long random secret |
| `ANALYZER_REQUIRE_KEY` | empty | `1` |
| `LLM_BASE_URL` | empty | `http://ollama:11434` only if you use a model |
| `LLM_MODEL` | empty | model name |
| `LLM_TIMEOUT` | `20` | `20` |
| `MIN_OVERALL_SCORE` | `0.55` | `0.55` |
| `RANK_USEFULNESS` | `0.34` | `0.34` |
| `RANK_IDIOMATICITY` | `0.22` | `0.22` |
| `RANK_REUSABILITY` | `0.22` | `0.22` |
| `RANK_CONFIDENCE` | `0.22` | `0.22` |

Do not commit these values. The Worker holds `EXPRESSION_ANALYZER_URL`, `EXPRESSION_ANALYZER_TIMEOUT`, and `EXPRESSION_ANALYZER_KEY`. The browser never sees the key.

## Endpoints

`GET /health`

```json
{"status": "ok", "llm": false}
```

No authentication. Works when Ollama is off.

`POST /api/v1/analyze`

Request:

```json
{"text": "I've been looking forward to seeing you.", "contentType": "TEXT"}
```

Response includes `expressions` and `stats`. Each expression has `exactText`, `canonicalForm`, `type`, `meaning`, `context`, `confidence`, `usefulnessScore`, `idiomaticityScore`, `reusabilityScore`, `overallScore`, `occurrences`, `analyzerDecision`, and `llmDecision`.

Authentication, when `ANALYZER_API_KEY` is set:

```text
Authorization: Bearer <key>
```

or

```text
X-Api-Key: <key>
```

A wrong or missing key returns 401. Health stays open. Set `ANALYZER_REQUIRE_KEY=1` in production so a forgotten key does not leave analysis open.

The browser calls the Cloudflare Worker. The Worker calls this service. Do not add open CORS for the public site.

## Docker

The image is `python:3.12-slim`, runs as uid 10001, has a healthcheck, and keeps no data. Uvicorn is the main process, so `SIGTERM` stops it.

```bash
docker compose config
docker compose up --build
```

## Production deployment

Any VPS is fine. The service is a container behind HTTPS.

```text
Internet
   |
   v
Caddy or nginx (HTTPS)
   |
   v
expression-analyzer:8000
   |
   v
Ollama (optional, private network only)
```

Caddy is the smaller choice because it requests a certificate by itself.

```caddyfile
analyzer.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

On the analyzer host:

```bash
ANALYZER_API_KEY='replace-with-a-long-secret' ANALYZER_REQUIRE_KEY=1 docker compose up --build -d
```

Check:

```bash
curl https://analyzer.example.com/health
curl -X POST https://analyzer.example.com/api/v1/analyze \
  -H "Authorization: Bearer replace-with-a-long-secret" \
  -H "Content-Type: application/json" \
  -d '{"text":"She gave up."}'
```

Then set the Worker secrets, not the frontend:

```text
EXPRESSION_ANALYZER_URL=https://analyzer.example.com
EXPRESSION_ANALYZER_TIMEOUT=20000
EXPRESSION_ANALYZER_KEY=<same secret>
```

Local Worker values, only in `.dev.vars` (gitignored):

```text
EXPRESSION_ANALYZER_URL=http://localhost:8000
EXPRESSION_ANALYZER_TIMEOUT=20000
EXPRESSION_ANALYZER_KEY=
```

Do not put the key in `wrangler.toml` `[vars]`, `preview.js`, or HTML.

Worker deploy is a separate step. From the quiz directory, after the secrets exist:

```bash
npx wrangler secret put EXPRESSION_ANALYZER_KEY
npx wrangler deploy
```

`EXPRESSION_ANALYZER_URL` and `EXPRESSION_ANALYZER_TIMEOUT` can be Wrangler secrets as well if you do not want the URL in the toml file.
