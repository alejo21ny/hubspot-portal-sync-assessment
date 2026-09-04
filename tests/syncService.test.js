const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

// syncService.js resolves its collaborators via destructuring at
// require-time (`const { getSourceTicketById } = require("../hubspot/source")`),
// so reassigning `source.getSourceTicketById` *after* syncService has already
// been required would never be seen by syncService — it already holds its
// own local reference to whatever the function was at require-time.
//
// To make each test's mock actually take effect, every exported function on
// `source`/`target` is replaced *once*, before syncService is first
// required, with a thin wrapper that forwards to a reassignable `let`. Tests
// then swap the `let`, not the module export, and syncService's frozen
// reference calls straight through to whatever the test set most recently.
const source = require("../src/hubspot/source");
const target = require("../src/hubspot/target");
const logger = require("../src/utils/logger");

let getSourceTicketByIdImpl;
let updateSourceSyncFieldsImpl;
let searchTargetByExternalIdImpl;
let createTargetTicketImpl;
let updateTargetTicketImpl;
let archiveTargetTicketImpl;
let loggerImpl;

source.getSourceTicketById = (...args) => getSourceTicketByIdImpl(...args);
source.updateSourceSyncFields = (...args) => updateSourceSyncFieldsImpl(...args);
target.searchTargetByExternalId = (...args) => searchTargetByExternalIdImpl(...args);
target.createTargetTicket = (...args) => createTargetTicketImpl(...args);
target.updateTargetTicket = (...args) => updateTargetTicketImpl(...args);
target.archiveTargetTicket = (...args) => archiveTargetTicketImpl(...args);
logger.info = (...args) => loggerImpl.info(...args);
logger.warn = (...args) => loggerImpl.warn(...args);
logger.error = (...args) => loggerImpl.error(...args);

const { syncImplementationTicket } = require("../src/services/syncService");

const ARGS = {
  sourceToken: "src-token-do-not-leak",
  targetToken: "tgt-token-do-not-leak",
  objectType: "implementation_tickets",
  sourceObjectId: "123",
  syncStatusProperty: "sync_status",
  lastSyncErrorProperty: "last_sync_error",
  lastSyncAtProperty: "last_sync_at",
};

function sourceRecord(overrides = {}) {
  return {
    archived: false,
    properties: {
      external_id: "ext-1",
      ticket_name: "Onboard Acme",
      status: "New",
      budget: "1000",
      hubspot_owner_id: "999",
    },
    ...overrides,
  };
}

let sourceUpdateCalls;
let loggedCalls;

beforeEach(() => {
  sourceUpdateCalls = [];
  loggedCalls = [];

  getSourceTicketByIdImpl = async () => sourceRecord();
  updateSourceSyncFieldsImpl = async (token, objectType, objectId, properties) => {
    sourceUpdateCalls.push(properties);
    return {};
  };
  searchTargetByExternalIdImpl = async () => ({ results: [] });
  createTargetTicketImpl = async () => ({ id: "target-1" });
  updateTargetTicketImpl = async () => ({});
  archiveTargetTicketImpl = async () => ({});

  loggerImpl = {
    info: (message, meta) => loggedCalls.push({ level: "info", message, meta }),
    warn: (message, meta) => loggedCalls.push({ level: "warn", message, meta }),
    error: (message, meta) => loggedCalls.push({ level: "error", message, meta }),
  };
});

test("successful sync: no existing target match creates a new ticket", async () => {
  let created = null;
  createTargetTicketImpl = async (token, objectType, properties) => {
    created = properties;
    return { id: "target-1" };
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(result.action, "created");
  assert.equal(created.external_id, "ext-1");
  assert.equal(created.ticket_name, "Onboard Acme");

  const finalUpdate = sourceUpdateCalls.at(-1);
  assert.equal(finalUpdate.sync_status, "Synced");
  assert.equal(finalUpdate.last_sync_error, "");
  assert.ok(finalUpdate.last_sync_at);
});

test("successful sync: an existing target match is updated in place", async () => {
  searchTargetByExternalIdImpl = async () => ({ results: [{ id: "target-9" }] });

  let updatedId = null;
  updateTargetTicketImpl = async (token, objectType, targetId) => {
    updatedId = targetId;
    return {};
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(result.action, "updated");
  assert.equal(updatedId, "target-9");
});

test("more than one target match for the same external_id is treated as a duplicate and fails cleanly", async () => {
  searchTargetByExternalIdImpl = async () => ({
    results: [{ id: "target-1" }, { id: "target-2" }],
  });

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, false);
  assert.match(result.error, /Duplicate/);

  const finalUpdate = sourceUpdateCalls.at(-1);
  assert.equal(finalUpdate.sync_status, "Failed");
  assert.match(finalUpdate.last_sync_error, /Duplicate/);
});

test("an archived source record archives the matching target ticket", async () => {
  getSourceTicketByIdImpl = async () => sourceRecord({ archived: true });
  searchTargetByExternalIdImpl = async () => ({ results: [{ id: "target-1" }] });

  let archivedId = null;
  archiveTargetTicketImpl = async (token, objectType, targetId) => {
    archivedId = targetId;
    return {};
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(result.action, "archived");
  assert.equal(archivedId, "target-1");
});

test("an archived source record with no matching target ticket is a clean no-op", async () => {
  getSourceTicketByIdImpl = async () => sourceRecord({ archived: true });
  searchTargetByExternalIdImpl = async () => ({ results: [] });

  let archiveCalled = false;
  archiveTargetTicketImpl = async () => {
    archiveCalled = true;
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(result.action, "already-missing");
  assert.equal(archiveCalled, false);
});

test("a transient (429) failure reading the source record still succeeds after the built-in retry", async () => {
  let attempts = 0;
  getSourceTicketByIdImpl = async () => {
    attempts += 1;
    if (attempts === 1) throw { status: 429, message: "Rate limited" };
    return sourceRecord();
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
});

test("a persistent (5xx) failure reading the source record exhausts retries and fails the sync", async () => {
  getSourceTicketByIdImpl = async () => {
    throw { status: 500, message: "Internal Server Error" };
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, false);
  assert.match(result.error, /Internal Server Error/);
  assert.match(result.error, /HTTP 500/);

  const finalUpdate = sourceUpdateCalls.at(-1);
  assert.equal(finalUpdate.sync_status, "Failed");
});

test("a source record missing external_id fails at the mapping step with a clear error", async () => {
  getSourceTicketByIdImpl = async () => sourceRecord({ properties: {} });

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, false);
  assert.match(result.error, /external_id/);

  const finalUpdate = sourceUpdateCalls.at(-1);
  assert.equal(finalUpdate.sync_status, "Failed");
  assert.match(finalUpdate.last_sync_error, /external_id/);
});

test("a very long failure message is truncated before being written back to the source", async () => {
  const longMessage = "x".repeat(6000);
  getSourceTicketByIdImpl = async () => {
    throw new Error(longMessage);
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, false);

  const finalUpdate = sourceUpdateCalls.at(-1);
  assert.equal(finalUpdate.last_sync_error.length, 5000);
});

test("a failure marking the record Pending (best-effort) does not abort the sync", async () => {
  let call = 0;
  updateSourceSyncFieldsImpl = async (token, objectType, objectId, properties) => {
    call += 1;
    sourceUpdateCalls.push(properties);
    if (call === 1) throw new Error("could not set Pending");
    return {};
  };

  const result = await syncImplementationTicket(ARGS);

  assert.equal(result.ok, true);
  assert.equal(sourceUpdateCalls.at(-1).sync_status, "Synced");
});

test("neither the source nor target token ever appears in a log call", async () => {
  // Exercise both a success path and a failure path in the same test.
  await syncImplementationTicket(ARGS);

  searchTargetByExternalIdImpl = async () => ({
    results: [{ id: "a" }, { id: "b" }],
  });
  await syncImplementationTicket(ARGS);

  const serialized = JSON.stringify(loggedCalls);
  assert.ok(!serialized.includes(ARGS.sourceToken));
  assert.ok(!serialized.includes(ARGS.targetToken));
});
