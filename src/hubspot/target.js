// src/hubspot/target.js
const { hsFetch } = require("./client");

async function searchTargetByExternalId(targetToken, objectType, externalId) {
  return hsFetch(targetToken, `/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    body: {
      filterGroups: [
        {
          filters: [
            { propertyName: "external_id", operator: "EQ", value: externalId },
          ],
        },
      ],
      properties: ["ticket_name", "external_id", "status", "budget", "hubspot_owner_id"],
      limit: 10,
    },
  });
}

async function createTargetTicket(targetToken, objectType, properties) {
  return hsFetch(targetToken, `/crm/v3/objects/${objectType}`, {
    method: "POST",
    body: { properties },
  });
}

async function updateTargetTicket(targetToken, objectType, targetId, properties) {
  return hsFetch(targetToken, `/crm/v3/objects/${objectType}/${targetId}`, {
    method: "PATCH",
    body: { properties },
  });
}

async function archiveTargetTicket(targetToken, objectType, targetId) {
  // HubSpot uses DELETE to archive CRM objects
  return hsFetch(targetToken, `/crm/v3/objects/${objectType}/${targetId}`, {
    method: "DELETE",
  });
}

module.exports = {
  searchTargetByExternalId,
  createTargetTicket,
  updateTargetTicket,
  archiveTargetTicket,
};