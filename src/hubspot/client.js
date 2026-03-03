// src/hubspot/client.js
const { HubSpotApiError } = require("../utils/errors");

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

async function parseResponse(res) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function hsFetch(token, path, { method = "GET", body, headers = {} } = {}) {
  const url = `${HUBSPOT_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.raw ||
      `HubSpot API error (${res.status})`;

    throw new HubSpotApiError(msg, {
      status: res.status,
      data,
      url,
      method,
    });
  }

  return data;
}

module.exports = { hsFetch };