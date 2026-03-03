// src/services/syncService.js
const { SYNC_STATUS_VALUES } = require("../config/constants");
const { withRetry } = require("./retryPolicy");
const { mapSourceToTargetProps } = require("./mapper");
const { getSourceTicketById, updateSourceSyncFields } = require("../hubspot/source");
const {
  searchTargetByExternalId,
  createTargetTicket,
  updateTargetTicket,
  archiveTargetTicket,
} = require("../hubspot/target");
const logger = require("../utils/logger");

function truncate(str, max = 5000) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) : str;
}

function normalizeError(err) {
  const status = err?.status ? ` (HTTP ${err.status})` : "";
  const msg = err?.message || "Unknown error";
  return `${msg}${status}`;
}

/**
 * Sync single Implementation Ticket Source -> Target
 * - Idempotent by external_id
 * - Prevents duplicates
 * - Updates sync_status + last_sync_error in source
 */
async function syncImplementationTicket({
  sourceToken,
  targetToken,
  objectType,
  sourceObjectId,
  syncStatusProperty,
  lastSyncErrorProperty,
  lastSyncAtProperty,
}) {
  const context = { sourceObjectId, objectType };

  // 1) mark Pending early (best effort)
  try {
    await updateSourceSyncFields(sourceToken, objectType, sourceObjectId, {
      [syncStatusProperty]: SYNC_STATUS_VALUES.PENDING,
      [lastSyncErrorProperty]: "",
    });
  } catch (e) {
    // not fatal, continue
    logger.warn("Failed to set Pending status (continuing)", { ...context, error: e?.message });
  }

  try {
    // 2) read source record (retry on 429/5xx)
    const sourceRecord = await withRetry(
      () => getSourceTicketById(sourceToken, objectType, sourceObjectId),
      { retries: 1 }
    );

    const props = sourceRecord?.properties || {};
    const externalId = props.external_id;

    // archived flag in HubSpot v3
    const isArchived = sourceRecord?.archived === true;

    // 3) map to target payload (validates external_id)
    const targetProps = mapSourceToTargetProps(props);

    logger.info("Starting sync", { ...context, externalId, isArchived });

    // 4) find target by external_id
    const search = await withRetry(
      () => searchTargetByExternalId(targetToken, objectType, externalId),
      { retries: 1 }
    );

    const results = search?.results || [];

    if (results.length > 1) {
      throw new Error(`Duplicate detected in Target for external_id=${externalId} (${results.length} records)`);
    }

    let action = "noop";

    // 5) if archived in source -> archive in target if exists
    if (isArchived) {
      if (results.length === 1) {
        await withRetry(
          () => archiveTargetTicket(targetToken, objectType, results[0].id),
          { retries: 1 }
        );
        action = "archived";
      } else {
        action = "already-missing";
      }
    } else {
      // 6) upsert
      if (results.length === 0) {
        await withRetry(
          () => createTargetTicket(targetToken, objectType, targetProps),
          { retries: 1 }
        );
        action = "created";
      } else {
        await withRetry(
          () => updateTargetTicket(targetToken, objectType, results[0].id, targetProps),
          { retries: 1 }
        );
        action = "updated";
      }
    }

    // 7) mark Synced
    await updateSourceSyncFields(sourceToken, objectType, sourceObjectId, {
      [syncStatusProperty]: SYNC_STATUS_VALUES.SYNCED,
      [lastSyncErrorProperty]: "",
      [lastSyncAtProperty]: new Date().toISOString(),
    });

    logger.info("Sync succeeded", { ...context, externalId, action });

    return { ok: true, action, externalId };
  } catch (err) {
    const msg = normalizeError(err);
    logger.error("Sync failed", { ...context, error: msg, data: err?.data });

    // mark Failed (best effort)
    try {
      await updateSourceSyncFields(sourceToken, objectType, sourceObjectId, {
        [syncStatusProperty]: SYNC_STATUS_VALUES.FAILED,
        [lastSyncErrorProperty]: truncate(msg),
      });
    } catch (e) {
      logger.error("Failed to update source sync fields after error", { ...context, error: e?.message });
    }

    return { ok: false, error: msg };
  }
}

module.exports = { syncImplementationTicket };