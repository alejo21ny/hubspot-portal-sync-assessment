// Local, offline demonstration of the sync decision logic — no network
// calls, no HubSpot credentials required. Run with: npm run example
//
// Fakes the two portals in memory (`sourceRecords`, `targetRecords`) and
// drives the exact same `syncImplementationTicket` used in production
// against three representative source records, printing what each one
// decided and why. This exercises the mapper, the idempotent
// lookup-by-external_id, and the create/update/archive branching described
// in docs/architecture.mmd — it does not exercise the HTTP layer
// (src/hubspot/client.js), since that's what the real HubSpot API sits
// behind.

const source = require("../src/hubspot/source");
const target = require("../src/hubspot/target");

// See tests/syncService.test.js for why this indirection is needed: the
// sync service destructures these functions at require-time, so a plain
// reassignment after that first require would never be observed by it.
let getSourceTicketByIdImpl;
let updateSourceSyncFieldsImpl;
let searchTargetByExternalIdImpl;
let createTargetTicketImpl;
let updateTargetTicketImpl;
let archiveTargetTicketImpl;

source.getSourceTicketById = (...args) => getSourceTicketByIdImpl(...args);
source.updateSourceSyncFields = (...args) => updateSourceSyncFieldsImpl(...args);
target.searchTargetByExternalId = (...args) => searchTargetByExternalIdImpl(...args);
target.createTargetTicket = (...args) => createTargetTicketImpl(...args);
target.updateTargetTicket = (...args) => updateTargetTicketImpl(...args);
target.archiveTargetTicket = (...args) => archiveTargetTicketImpl(...args);

const { syncImplementationTicket } = require("../src/services/syncService");

// --- In-memory fake portals -------------------------------------------------

const sourceRecords = {
  "src-1": {
    archived: false,
    properties: {
      external_id: "acme-042",
      ticket_name: "Onboard Acme Corp",
      status: "In Progress",
      budget: "12000",
      hubspot_owner_id: "9001",
    },
  },
  "src-2": {
    // Already exists in the target portal below — this run should UPDATE it.
    archived: false,
    properties: {
      external_id: "globex-007",
      ticket_name: "Globex renewal (budget revised)",
      status: "In Progress",
      budget: "8000",
      hubspot_owner_id: "9002",
    },
  },
  "src-3": {
    // Closed on the source side — this run should ARCHIVE the target copy.
    archived: true,
    properties: {
      external_id: "initech-013",
      ticket_name: "Initech pilot",
      status: "Closed",
      budget: "3000",
      hubspot_owner_id: "9003",
    },
  },
};

let targetRecords = [
  { id: "tgt-88", properties: { external_id: "globex-007" } },
  { id: "tgt-13", properties: { external_id: "initech-013" } },
];

getSourceTicketByIdImpl = async (token, objectType, objectId) => sourceRecords[objectId];

updateSourceSyncFieldsImpl = async (token, objectType, objectId, properties) => {
  console.log(`  [source] ${objectId} <- ${JSON.stringify(properties)}`);
};

searchTargetByExternalIdImpl = async (token, objectType, externalId) => ({
  results: targetRecords.filter((r) => r.properties.external_id === externalId),
});

createTargetTicketImpl = async (token, objectType, properties) => {
  const created = { id: `tgt-${Math.floor(Math.random() * 1000)}`, properties };
  targetRecords.push(created);
  console.log(`  [target] created ${created.id} <- ${JSON.stringify(properties)}`);
  return created;
};

updateTargetTicketImpl = async (token, objectType, targetId, properties) => {
  targetRecords = targetRecords.map((r) => (r.id === targetId ? { ...r, properties } : r));
  console.log(`  [target] updated ${targetId} <- ${JSON.stringify(properties)}`);
};

archiveTargetTicketImpl = async (token, objectType, targetId) => {
  targetRecords = targetRecords.filter((r) => r.id !== targetId);
  console.log(`  [target] archived ${targetId}`);
};

// --- Run it ------------------------------------------------------------------

async function run() {
  for (const sourceObjectId of Object.keys(sourceRecords)) {
    console.log(`\nSyncing source object "${sourceObjectId}"...`);

    const result = await syncImplementationTicket({
      sourceToken: "example-source-token",
      targetToken: "example-target-token",
      objectType: "implementation_tickets",
      sourceObjectId,
      syncStatusProperty: "sync_status",
      lastSyncErrorProperty: "last_sync_error",
      lastSyncAtProperty: "last_sync_at",
    });

    console.log(`  => ${result.ok ? `ok (${result.action})` : `failed: ${result.error}`}`);
  }
}

run();
