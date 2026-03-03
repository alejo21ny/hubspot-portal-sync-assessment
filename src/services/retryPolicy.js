// src/services/retryPolicy.js
function shouldRetry(err) {
  const status = err?.status;
  return status === 429 || (status >= 500 && status <= 599);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { retries = 1, baseDelayMs = 800 } = {}) {
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;

      if (attempt > retries || !shouldRetry(err)) {
        throw err;
      }

      // small backoff
      await sleep(baseDelayMs * attempt);
    }
  }
}

module.exports = { withRetry, shouldRetry };