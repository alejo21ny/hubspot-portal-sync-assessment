// src/handlers/workflowCodeActionHandler.js
const { loadConfig } = require("../config/env");
const { syncImplementationTicket } = require("../services/syncService");

exports.main = async (event = {}) => {
  const cfg = loadConfig();

  // Workflow custom code usually provides objectId in event.object.objectId (varies)
  const sourceObjectId =
    event?.object?.objectId ||
    event?.inputFields?.hs_object_id ||
    event?.inputFields?.objectId;

  if (!sourceObjectId) {
    throw new Error("Missing objectId in workflow event payload");
  }

  const result = await syncImplementationTicket({
    sourceToken: cfg.sourceToken,
    targetToken: cfg.targetToken,
    objectType: cfg.objectType,
    sourceObjectId,
    syncStatusProperty: cfg.syncStatusProperty,
    lastSyncErrorProperty: cfg.lastSyncErrorProperty,
    lastSyncAtProperty: cfg.lastSyncAtProperty,
  });

  return {
    outputFields: {
      sync_ok: result.ok ? "true" : "false",
      sync_action: result.action || "",
      sync_error: result.error || "",
    },
  };
};