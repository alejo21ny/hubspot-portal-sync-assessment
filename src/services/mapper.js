// src/services/mapper.js

function mapSourceToTargetProps(sourceProperties = {}) {
  const externalId = sourceProperties.external_id;

  if (!externalId || String(externalId).trim() === "") {
    throw new Error("Source record missing required field: external_id");
  }

  return {
    ticket_name: sourceProperties.ticket_name || "",
    external_id: externalId,
    status: sourceProperties.status || "New",
    budget: sourceProperties.budget ?? null,
    hubspot_owner_id: sourceProperties.hubspot_owner_id ?? null,
  };
}

module.exports = { mapSourceToTargetProps };