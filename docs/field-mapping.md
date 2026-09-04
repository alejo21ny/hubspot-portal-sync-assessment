# Field Mapping

The mapping implemented in `src/services/mapper.js` (`mapSourceToTargetProps`). This is the
only place source→target field mapping happens — everything downstream (`syncService.js`,
`hubspot/target.js`) works with the object this function returns.

| Source field (`implementation_tickets`) | Target field | Transformation / default | Notes |
|---|---|---|---|
| `external_id` | `external_id` | **Required.** Throws `"Source record missing required field: external_id"` if missing, `null`, or an empty/whitespace-only string. | The idempotency key — `hubspot/target.js` searches the target portal by exact match on this field before deciding whether to create or update. |
| `ticket_name` | `ticket_name` | Defaults to `""` if missing. | |
| `status` | `status` | Defaults to `"New"` if missing. | Passed through as-is otherwise — no value translation between source and target status vocabularies. |
| `budget` | `budget` | Defaults to `null` if missing or `undefined`. | Passed through unmodified (no currency parsing/formatting). |
| `hubspot_owner_id` | `hubspot_owner_id` | Defaults to `null` if missing or `undefined`. | Passed through unmodified — no validation that the owner exists in the target portal. |

## Fields read but not currently mapped

`src/hubspot/source.js` also requests `hs_lastmodifieddate` when reading the source record, but
nothing in `mapper.js` or `syncService.js` currently reads or acts on it — it's fetched but
unused. Documented here rather than silently left out, since it's a reasonable hook for a future
last-write-wins conflict check that hasn't been built.

## Sync-tracking fields (not part of the mapping — written back to the *source* record)

These are never sent to the target portal. `syncService.js` writes them back onto the *source*
record to track the sync's own state:

| Field | Written when | Value |
|---|---|---|
| `sync_status` (configurable, `SYNC_STATUS_PROPERTY`) | Every sync attempt | `Pending` → `Synced` or `Failed` |
| `last_sync_error` (configurable, `LAST_SYNC_ERROR_PROPERTY`) | Every sync attempt | `""` on success; the error message (truncated to 5000 characters) on failure |
| `last_sync_at` (configurable, `LAST_SYNC_AT_PROPERTY`) | On success only | ISO 8601 timestamp |
| `sync_attempt_count` (configurable, `SYNC_ATTEMPT_COUNT_PROPERTY`) | Never | Loaded from config in `src/config/env.js` but not yet read or incremented anywhere in `syncService.js` — reserved for a future retry-count feature, not wired in yet. Documented here rather than implied to work. |
