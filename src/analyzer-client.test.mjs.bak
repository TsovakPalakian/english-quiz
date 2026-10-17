import assert from "node:assert/strict";
import test from "node:test";
import { analyzerHeaders, analyzerOutcome, analyzerTimeoutMs } from "./analyzer-client.js";
import { mergeTextRecords } from "./worker.js";

test("timeout stays between 1 and 60 seconds", () => {
  assert.equal(analyzerTimeoutMs(undefined), 20000);
  assert.equal(analyzerTimeoutMs(""), 20000);
  assert.equal(analyzerTimeoutMs(0), 20000);
  assert.equal(analyzerTimeoutMs(999), 20000);
  assert.equal(analyzerTimeoutMs(1000), 1000);
  assert.equal(analyzerTimeoutMs(20000), 20000);
  assert.equal(analyzerTimeoutMs(60000), 60000);
  assert.equal(analyzerTimeoutMs(60001), 60000);
});

test("worker hides analyzer failures and keeps a successful body", () => {
  for (const status of [401, 403, 404, 422, 429, 500]) {
    const failed = analyzerOutcome(status, { detail: "secret-token", expressions: [] });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error, "Analysis service temporarily unavailable.");
    assert.equal(JSON.stringify(failed.body).includes("secret-token"), false);
  }
  assert.equal(analyzerOutcome(200, null).status, 503);
  assert.equal(analyzerOutcome(200, { detail: "not json expressions" }).status, 503);
  const ok = analyzerOutcome(200, { expressions: [{ canonicalForm: "give up" }] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.expressions[0].canonicalForm, "give up");
});

test("analyzer key stays in the request header only", () => {
  const headers = analyzerHeaders("local-secret");
  assert.equal(headers.Authorization, "Bearer local-secret");
  assert.equal(headers["X-Api-Key"], "local-secret");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(analyzerHeaders(""), { "Content-Type": "application/json" });
});

test("a failed analyze does not erase a saved analysis or other texts", () => {
  const saved = [
    {
      id: "one",
      title: "Note",
      text: "She gave up.",
      updatedAt: "2026-09-29T10:00:00.000Z",
      analysis: { expressions: [{ canonicalForm: "give up", type: "PHRASAL_VERB" }] }
    },
    {
      id: "two",
      title: "Other",
      text: "By the way, hello.",
      updatedAt: "2026-09-29T11:00:00.000Z",
      analysis: null
    }
  ];
  assert.deepEqual(mergeTextRecords(saved, []), saved.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  const replaced = mergeTextRecords(saved, [{
    id: "one",
    title: "Note",
    text: "She gave up.",
    updatedAt: "2026-09-29T12:00:00.000Z",
    analysis: { expressions: [{ canonicalForm: "give up", type: "PHRASAL_VERB" }] }
  }]);
  assert.equal(replaced.find((item) => item.id === "two").text, "By the way, hello.");
  assert.equal(replaced.find((item) => item.id === "one").analysis.expressions.length, 1);
});
