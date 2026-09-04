const test = require("node:test");
const assert = require("node:assert/strict");

const { mapSourceToTargetProps } = require("../src/services/mapper");

test("maps all known fields through unchanged when present", () => {
  const result = mapSourceToTargetProps({
    external_id: "ext-1",
    ticket_name: "Onboard Acme Corp",
    status: "In Progress",
    budget: "5000",
    hubspot_owner_id: "12345",
  });

  assert.deepEqual(result, {
    ticket_name: "Onboard Acme Corp",
    external_id: "ext-1",
    status: "In Progress",
    budget: "5000",
    hubspot_owner_id: "12345",
  });
});

test("defaults status to 'New' when missing", () => {
  const result = mapSourceToTargetProps({ external_id: "ext-1" });
  assert.equal(result.status, "New");
});

test("defaults ticket_name to an empty string when missing", () => {
  const result = mapSourceToTargetProps({ external_id: "ext-1" });
  assert.equal(result.ticket_name, "");
});

test("defaults budget and hubspot_owner_id to null when missing", () => {
  const result = mapSourceToTargetProps({ external_id: "ext-1" });
  assert.equal(result.budget, null);
  assert.equal(result.hubspot_owner_id, null);
});

test("throws when external_id is missing", () => {
  assert.throws(
    () => mapSourceToTargetProps({ ticket_name: "No id here" }),
    /external_id/,
  );
});

test("throws when external_id is an empty/whitespace string", () => {
  assert.throws(() => mapSourceToTargetProps({ external_id: "   " }), /external_id/);
});

test("throws when called with no source properties at all", () => {
  assert.throws(() => mapSourceToTargetProps(), /external_id/);
});
