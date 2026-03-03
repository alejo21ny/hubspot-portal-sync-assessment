// src/utils/logger.js
function now() {
  return new Date().toISOString();
}

function info(message, meta = {}) {
  console.log(`[INFO] ${now()} ${message}`, meta);
}

function warn(message, meta = {}) {
  console.warn(`[WARN] ${now()} ${message}`, meta);
}

function error(message, meta = {}) {
  console.error(`[ERROR] ${now()} ${message}`, meta);
}

module.exports = { info, warn, error };