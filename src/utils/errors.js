// src/utils/errors.js
class HubSpotApiError extends Error {
  constructor(message, { status, data, url, method } = {}) {
    super(message);
    this.name = "HubSpotApiError";
    this.status = status;
    this.data = data;
    this.url = url;
    this.method = method;
  }
}

module.exports = { HubSpotApiError };