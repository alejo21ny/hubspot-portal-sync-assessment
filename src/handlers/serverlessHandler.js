// src/handlers/serverlessHandler.js
const { loadConfig } = require("../config/env");
const { syncImplementationTicket } = require("../services/syncService");

exports.main = async (context = {}) => {
  const cfg = loadConfig();
  const body = context.body || {};

  const sourceObjectId = body.objectId || body.recordId || body.hs_object_id;

  if (!sourceObjectId) {
    return { statusCode: 400, body: { ok: false, error: "Missing objectId" } };
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

  return { statusCode: result.ok ? 200 : 500, body: result };
};