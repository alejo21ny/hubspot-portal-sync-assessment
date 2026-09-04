const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// Same indirection technique as tests/syncService.test.js: the handlers
// destructure `syncImplementationTicket` at require-time, so the module
// export is replaced *once*, before either handler is first required, with
// a wrapper that forwards to a reassignable `let` each test can swap.
const syncService = require("../src/services/syncService");

let syncImpl;
syncService.syncImplementationTicket = (...args) => syncImpl(...args);

const serverlessHandler = require("../src/handlers/serverlessHandler");
const workflowHandler = require("../src/handlers/workflowCodeActionHandler");

let lastCallArgs;

beforeEach(() => {
  lastCallArgs = undefined;
  syncImpl = async (args) => {
    lastCallArgs = args;
    return { ok: true, action: "created", externalId: "ext-1" };
  };

  // Both handlers call loadConfig(), which requires SOURCE_PRIVATE_APP_TOKEN
  // and TARGET_PRIVATE_APP_TOKEN to be set — these are fake, local-only
  // values, never real credentials.
  process.env.SOURCE_PRIVATE_APP_TOKEN = "fake-source-token";
  process.env.TARGET_PRIVATE_APP_TOKEN = "fake-target-token";
});

test("serverlessHandler: extracts objectId from body.objectId and returns 200 on success", async () => {
  const response = await serverlessHandler.main({ body: { objectId: "123" } });

  assert.equal(response.statusCode, 200);
  assert.equal(lastCallArgs.sourceObjectId, "123");
});

test("serverlessHandler: falls back to body.recordId, then body.hs_object_id", async () => {
  await serverlessHandler.main({ body: { recordId: "456" } });
  assert.equal(lastCallArgs.sourceObjectId, "456");

  await serverlessHandler.main({ body: { hs_object_id: "789" } });
  assert.equal(lastCallArgs.sourceObjectId, "789");
});

test("serverlessHandler: returns 400 and never calls the sync service when objectId is missing", async () => {
  const response = await serverlessHandler.main({ body: {} });

  assert.equal(response.statusCode, 400);
  assert.equal(lastCallArgs, undefined);
});

test("serverlessHandler: returns 500 when the sync itself fails", async () => {
  syncImpl = async () => ({ ok: false, error: "boom" });

  const response = await serverlessHandler.main({ body: { objectId: "123" } });

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.error, "boom");
});

test("workflowCodeActionHandler: extracts objectId from event.object.objectId", async () => {
  const result = await workflowHandler.main({ object: { objectId: "abc" } });

  assert.equal(lastCallArgs.sourceObjectId, "abc");
  assert.equal(result.outputFields.sync_ok, "true");
  assert.equal(result.outputFields.sync_action, "created");
});

test("workflowCodeActionHandler: falls back to inputFields.hs_object_id / inputFields.objectId", async () => {
  await workflowHandler.main({ inputFields: { hs_object_id: "def" } });
  assert.equal(lastCallArgs.sourceObjectId, "def");

  await workflowHandler.main({ inputFields: { objectId: "ghi" } });
  assert.equal(lastCallArgs.sourceObjectId, "ghi");
});

test("workflowCodeActionHandler: throws when no objectId can be found in the event", async () => {
  await assert.rejects(() => workflowHandler.main({}), /Missing objectId/);
});

test("workflowCodeActionHandler: reports a failed sync via outputFields, not by throwing", async () => {
  syncImpl = async () => ({ ok: false, error: "target unreachable" });

  const result = await workflowHandler.main({ object: { objectId: "abc" } });

  assert.equal(result.outputFields.sync_ok, "false");
  assert.equal(result.outputFields.sync_error, "target unreachable");
});
