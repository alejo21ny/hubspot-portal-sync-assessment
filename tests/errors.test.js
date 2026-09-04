const test = require("node:test");
const assert = require("node:assert/strict");

const { HubSpotApiError } = require("../src/utils/errors");

test("carries status/data/url/method and is a real Error", () => {
  const err = new HubSpotApiError("Not Found", {
    status: 404,
    data: { message: "object not found" },
    url: "https://api.hubapi.com/crm/v3/objects/tickets/123",
    method: "GET",
  });

  assert.ok(err instanceof Error);
  assert.equal(err.name, "HubSpotApiError");
  assert.equal(err.message, "Not Found");
  assert.equal(err.status, 404);
  assert.deepEqual(err.data, { message: "object not found" });
  assert.equal(err.url, "https://api.hubapi.com/crm/v3/objects/tickets/123");
  assert.equal(err.method, "GET");
});

test("does not require options — fields are simply undefined", () => {
  const err = new HubSpotApiError("Something broke");
  assert.equal(err.status, undefined);
  assert.equal(err.data, undefined);
  assert.equal(err.url, undefined);
  assert.equal(err.method, undefined);
});
