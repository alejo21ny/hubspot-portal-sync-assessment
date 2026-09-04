const test = require("node:test");
const assert = require("node:assert/strict");

const { hsFetch } = require("../src/hubspot/client");

function fakeResponse({ ok, status, body }) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

test("sends a Bearer-authenticated JSON request and returns the parsed body", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    fakeResponse({ ok: true, status: 200, body: { id: "1", properties: {} } }),
  );

  const result = await hsFetch("secret-token", "/crm/v3/objects/tickets/1", { method: "GET" });

  assert.deepEqual(result, { id: "1", properties: {} });
  assert.equal(fetchMock.mock.callCount(), 1);

  const [url, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "https://api.hubapi.com/crm/v3/objects/tickets/1");
  assert.equal(init.headers.Authorization, "Bearer secret-token");
  assert.equal(init.headers["Content-Type"], "application/json");
});

test("serializes a request body as JSON when one is given", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    fakeResponse({ ok: true, status: 201, body: { id: "new" } }),
  );

  await hsFetch("secret-token", "/crm/v3/objects/tickets", {
    method: "POST",
    body: { properties: { ticket_name: "Test" } },
  });

  const [, init] = fetchMock.mock.calls[0].arguments;
  assert.equal(init.body, JSON.stringify({ properties: { ticket_name: "Test" } }));
});

test("returns null for an empty (but ok) response body", async (t) => {
  t.mock.method(globalThis, "fetch", async () => fakeResponse({ ok: true, status: 204 }));

  const result = await hsFetch("secret-token", "/crm/v3/objects/tickets/1", { method: "DELETE" });

  assert.equal(result, null);
});

test("throws a HubSpotApiError with status/data/url/method on a non-ok response", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    fakeResponse({ ok: false, status: 500, body: { message: "Internal error" } }),
  );

  await assert.rejects(
    () => hsFetch("secret-token", "/crm/v3/objects/tickets/1", { method: "GET" }),
    (err) => {
      assert.equal(err.name, "HubSpotApiError");
      assert.equal(err.status, 500);
      assert.equal(err.message, "Internal error");
      assert.equal(err.url, "https://api.hubapi.com/crm/v3/objects/tickets/1");
      assert.equal(err.method, "GET");
      return true;
    },
  );
});

test("never leaks the bearer token into a thrown error", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    fakeResponse({ ok: false, status: 401, body: { message: "Unauthorized" } }),
  );

  const token = "pat-na1-do-not-leak-this-value";

  await assert.rejects(
    () => hsFetch(token, "/crm/v3/objects/tickets/1", { method: "GET" }),
    (err) => {
      const serialized = JSON.stringify({
        message: err.message,
        data: err.data,
        url: err.url,
        method: err.method,
      });
      assert.ok(!serialized.includes(token));
      return true;
    },
  );
});
