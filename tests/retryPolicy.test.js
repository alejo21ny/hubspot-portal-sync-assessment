const test = require("node:test");
const assert = require("node:assert/strict");

const { withRetry, shouldRetry } = require("../src/services/retryPolicy");

// Keep the suite fast: real backoff delays would make this suite slow for
// no reason, so every retrying call below uses a near-zero baseDelayMs.
const FAST = { baseDelayMs: 1 };

test("shouldRetry: true for 429 (rate limited)", () => {
  assert.equal(shouldRetry({ status: 429 }), true);
});

test("shouldRetry: true for the full 5xx range", () => {
  assert.equal(shouldRetry({ status: 500 }), true);
  assert.equal(shouldRetry({ status: 503 }), true);
  assert.equal(shouldRetry({ status: 599 }), true);
});

test("shouldRetry: false for ordinary 4xx errors", () => {
  assert.equal(shouldRetry({ status: 400 }), false);
  assert.equal(shouldRetry({ status: 404 }), false);
});

test("shouldRetry: false when the error carries no status at all", () => {
  assert.equal(shouldRetry(new Error("network blip")), false);
});

test("withRetry: resolves on the first attempt when the call succeeds", async () => {
  const fn = () => Promise.resolve("ok");
  assert.equal(await withRetry(fn, { retries: 1, ...FAST }), "ok");
});

test("withRetry: retries once after a 429 and then succeeds", async (t) => {
  let calls = 0;
  const fn = t.mock.fn(() => {
    calls += 1;
    if (calls === 1) return Promise.reject({ status: 429 });
    return Promise.resolve("ok");
  });

  const result = await withRetry(fn, { retries: 1, ...FAST });

  assert.equal(result, "ok");
  assert.equal(fn.mock.callCount(), 2);
});

test("withRetry: retries once after a 5xx and then succeeds", async (t) => {
  let calls = 0;
  const fn = t.mock.fn(() => {
    calls += 1;
    if (calls === 1) return Promise.reject({ status: 503 });
    return Promise.resolve("ok");
  });

  const result = await withRetry(fn, { retries: 1, ...FAST });

  assert.equal(result, "ok");
  assert.equal(fn.mock.callCount(), 2);
});

test("withRetry: does not retry a non-retryable 4xx — fails on the first attempt", async (t) => {
  const fn = t.mock.fn(() => Promise.reject({ status: 400, message: "Bad Request" }));

  await assert.rejects(() => withRetry(fn, { retries: 3, ...FAST }), { status: 400 });
  assert.equal(fn.mock.callCount(), 1);
});

test("withRetry: exhausts retries and throws the last error", async (t) => {
  const fn = t.mock.fn(() => Promise.reject({ status: 500, message: "still down" }));

  await assert.rejects(() => withRetry(fn, { retries: 2, ...FAST }), { status: 500 });
  // 1 initial attempt + 2 retries = 3 calls total
  assert.equal(fn.mock.callCount(), 3);
});
