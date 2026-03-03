// src/hubspot/source.js
const { hsFetch } = require("./client");

function buildPropsQuery(properties = []) {
  if (!properties.length) return "";
  return `?properties=${encodeURIComponent(properties.join(","))}`;
}

async function getSourceTicketById(sourceToken, objectType, objectId) {
  // archived=true so we can read even if it was archived (useful for delete/archive sync)
  const props = [
    "ticket_name",
    "external_id",
    "status",
    "budget",
    "hubspot_owner_id",
    "hs_lastmodifieddate",
  ];

  const qs = buildPropsQuery(props);
  return hsFetch(sourceToken, `/crm/v3/objects/${objectType}/${objectId}${qs}&archived=true`, {
    method: "GET",
  });
}

async function updateSourceSyncFields(sourceToken, objectType, objectId, properties) {
  return hsFetch(sourceToken, `/crm/v3/objects/${objectType}/${objectId}`, {
    method: "PATCH",
    body: { properties },
  });
}

module.exports = {
  getSourceTicketById,
  updateSourceSyncFields,
};