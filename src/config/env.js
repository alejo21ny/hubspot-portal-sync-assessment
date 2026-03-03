// src/config/env.js
const dotenv = require("dotenv");

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback = undefined) {
  const value = process.env[name];
  return value && String(value).trim() !== "" ? value : fallback;
}

function loadConfig() {
  return {
    sourceToken: required("SOURCE_PRIVATE_APP_TOKEN"),
    targetToken: required("TARGET_PRIVATE_APP_TOKEN"),

    objectType: optional("OBJECT_TYPE", "implementation_tickets"),

    syncStatusProperty: optional("SYNC_STATUS_PROPERTY", "sync_status"),
    lastSyncErrorProperty: optional("LAST_SYNC_ERROR_PROPERTY", "last_sync_error"),
    lastSyncAtProperty: optional("LAST_SYNC_AT_PROPERTY", "last_sync_at"),

    syncAttemptCountProperty: optional("SYNC_ATTEMPT_COUNT_PROPERTY", "sync_attempt_count"),
  };
}

module.exports = { loadConfig };