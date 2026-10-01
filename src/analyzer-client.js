function analyzerTimeoutMs(value) {
  const timeout = Number(value);
  if (!timeout || timeout < 1000) return 20000;
  if (timeout > 60000) return 60000;
  return timeout;
}

function analyzerHeaders(key) {
  const headers = { "Content-Type": "application/json" };
  if (key) {
    headers["X-Api-Key"] = key;
    headers.Authorization = "Bearer " + key;
  }
  return headers;
}

function analyzerOutcome(status, payload) {
  if (status !== 200 || !payload || !Array.isArray(payload.expressions)) {
    return { status: 503, body: { error: "Analysis service temporarily unavailable." } };
  }
  return { status: 200, body: payload };
}

export { analyzerTimeoutMs, analyzerHeaders, analyzerOutcome };
