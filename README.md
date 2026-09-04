# HubSpot Portal Sync

Idempotent sync of a custom HubSpot object between two portals, keyed by an external identifier so re-running it never creates duplicates.

## Overview

Two HubSpot portals ("source" and "target") each hold their own copy of an `implementation_tickets` custom object. This service reads one record from the source portal, maps it to the target portal's schema, and creates, updates, or archives the matching target record — driven from either a HubSpot Serverless Function or a Workflow Custom Code Action. The sync's own outcome (pending/synced/failed, last error, last sync time) is written back onto the source record, so a portal admin can see sync health without leaving HubSpot.

## Architecture

```
Source (HubSpot)  →  Sync Service  →  Mapper  →  HubSpot Client  →  Target (HubSpot)
```

- **Source** (`src/hubspot/source.js`) — reads a ticket by ID from the source portal (including archived ones, so a closed/deleted source record can still be synced as an archive), and writes the sync-status fields back onto it.
- **Sync Service** (`src/services/syncService.js`) — the orchestrator. Marks the record `Pending`, reads it, maps it, looks it up in the target portal by `external_id`, decides create/update/archive/no-op, and writes the final `Synced`/`Failed` status back — all described in detail below.
- **Mapper** (`src/services/mapper.js`) — a small pure function, `mapSourceToTargetProps`, that turns source properties into target properties. No I/O, easy to unit test in isolation (see `tests/mapper.test.js`). Full field-by-field detail in `docs/field-mapping.md`.
- **HubSpot Client** (`src/hubspot/client.js`) — the one place an HTTP request is actually made (`hsFetch`). Bearer-token auth, JSON in/out, throws a `HubSpotApiError` (with `status`/`data`/`url`/`method`) on any non-2xx response.
- **Retry policy** (`src/services/retryPolicy.js`) — wraps individual API calls with a retry for `429`/`5xx` responses only; any other error (a `4xx`, a mapping error) is not retried.

A Mermaid diagram of the same flow, including where retries and error paths sit, is in [`docs/architecture.mmd`](docs/architecture.mmd).

## Data Flow

1. A HubSpot Serverless Function or Workflow Custom Code Action receives an object ID and calls `syncImplementationTicket`.
2. The source record is marked `Pending` (best-effort — a failure here doesn't stop the sync).
3. The source record is read (retried on `429`/`5xx`).
4. It's mapped to target properties — this is also where a missing `external_id` is caught and rejected.
5. The target portal is searched for an existing record with that `external_id` (retried).
6. Based on what's found and whether the source record is archived, exactly one of **create**, **update**, **archive**, or **no-op** happens (retried).
7. The source record is marked `Synced` (with a timestamp) on success, or `Failed` (with a truncated error message) if any step above threw.

## Reliability & Idempotency

- **Idempotency key:** `external_id`, present on both portals. Every sync looks up the target by this field before deciding what to do — running the same sync twice never creates a second target record.
- **Duplicate detection:** if the target search ever returns more than one match for the same `external_id`, the sync fails loudly (`Duplicate detected in Target for external_id=...`) instead of guessing which one to update.
- **Archived records:** if the source record is archived, the corresponding target record is archived too (if it exists) — otherwise it's a clean no-op, not an error.
- **Retries:** `429` (rate limited) and `5xx` (server error) responses are retried once with a short backoff; a `4xx` (bad request, not found, etc.) fails immediately, since retrying it would just fail the same way again.
- **Failure state is always recorded:** whatever fails, `syncService.js` writes `sync_status=Failed` and a truncated `last_sync_error` back onto the source record inside its own best-effort try/catch — a failure to write that status never masks or replaces the original error.

## Field Mapping

See [`docs/field-mapping.md`](docs/field-mapping.md) for the full source→target table, defaults, and the sync-tracking fields written back onto the source record.

## Error Handling

- `hsFetch` (`src/hubspot/client.js`) throws a `HubSpotApiError` for any non-2xx HubSpot response, carrying `status`, the parsed response `data`, the request `url`, and `method`.
- `retryPolicy.withRetry` retries only when `shouldRetry(err)` is true — `err.status === 429` or `500 <= err.status <= 599`. Everything else (a `4xx`, a plain `Error` with no `status` at all, like the mapper's validation error) is terminal on the first attempt.
- A terminal error is caught once, in `syncImplementationTicket`, normalized to a short `message (HTTP status)` string, logged, and written back to the source record's `last_sync_error` (truncated to 5000 characters so it can never exceed a HubSpot property's practical size).
- Access tokens are passed as plain function arguments end-to-end and are never included in a log call or in a thrown error's message/data — see `tests/client.test.js` and `tests/syncService.test.js` for tests that assert this directly.

## Testing

```bash
npm test          # runs the full suite (node's built-in test runner)
npm run lint       # ESLint
npm run example    # runs scripts/example.js — a live demo against fake data, see below
```

42 tests, all against mocks/fakes — **no live HubSpot calls, no credentials required to run them**. Coverage includes: field mapping and its defaults/validation; the retry policy's `429`/`5xx`/non-retryable-`4xx`/exhaustion behavior; `HubSpotApiError`'s shape; the HTTP client's request construction and error translation; and, for the sync service itself, the create/update/archive/no-op decision, duplicate detection, a transient failure that recovers via retry, a persistent failure that exhausts retries, a missing-`external_id` failure, failure-message truncation, the best-effort Pending write not aborting the sync on its own failure, and — twice — that neither access token ever reaches a log call. The two HubSpot handlers are covered separately for their object-ID-extraction and response-shaping logic.

No mocking library is used. `syncService.js` and the two handlers resolve their collaborators via `require()` destructuring at import time, so each test file replaces the relevant module's exports **once**, before the module under test is first required, with a thin function that forwards to a reassignable variable — tests then swap that variable per test case. See the comment at the top of `tests/syncService.test.js` for the full reasoning.

## Running Locally

```bash
npm install
npm test
npm run lint
npm run example
```

To actually run a sync against real HubSpot portals, create a `.env` from `.env.example`:

```
SOURCE_PRIVATE_APP_TOKEN=<your-token>
TARGET_PRIVATE_APP_TOKEN=<your-token>
OBJECT_TYPE=implementation_tickets
SYNC_STATUS_PROPERTY=sync_status
LAST_SYNC_ERROR_PROPERTY=last_sync_error
LAST_SYNC_AT_PROPERTY=last_sync_at
SYNC_ATTEMPT_COUNT_PROPERTY=sync_attempt_count
```

Never commit a `.env` file or a real token — see Security below.

## Engineering Decisions

- **Two thin handlers, one shared service.** `serverlessHandler.js` and `workflowCodeActionHandler.js` each only extract an object ID from a differently-shaped trigger payload and call `syncImplementationTicket` — HubSpot's two most common trigger types for this kind of custom-object automation, kept separate because their input/output contracts genuinely differ (an HTTP-style `{statusCode, body}` vs. Workflow's `{outputFields}` with string-typed values), not duplicated business logic.
- **Retry only what's safe to retry.** `shouldRetry` is deliberately narrow — `429`/`5xx` only. Retrying a `4xx` (bad request, missing field, not found) would just fail again identically while adding latency, so those fail immediately instead.
- **Status writes are separated from the retried operations.** The `Pending`/`Synced`/`Failed` writes to the source record are not retried — only the actual create/update/archive/read/search calls are. A missed status write is a minor observability gap; retrying it risked masking the real error that caused the failure in the first place.
- **`sync_attempt_count` is loaded but not yet used.** `src/config/env.js` reads `SYNC_ATTEMPT_COUNT_PROPERTY`, but nothing currently increments or reads it — it's a reserved hook for a future feature (e.g. surfacing retry counts on the source record), not a hidden bug. Called out explicitly in `docs/field-mapping.md` rather than left to look finished.
- **Node's built-in test runner, not a framework.** The project had one dependency (`dotenv`) and no test framework at all. `node:test` (Node 18+) covers everything this suite needs — mocking included, via `t.mock`/`mock.method` — without adding Jest or Mocha as a dependency for a project this size.

## Security

- Secrets (`SOURCE_PRIVATE_APP_TOKEN`, `TARGET_PRIVATE_APP_TOKEN`) are read from the environment via `src/config/env.js` (`dotenv` for local `.env` loading) — never hardcoded, never committed. `.env` is git-ignored; `.env.example` documents the shape with placeholders only.
- No credentials are required to run the test suite, the linter, or `npm run example` — all three run entirely offline against fakes.
- Access tokens flow as plain function parameters from `loadConfig()` down to `hsFetch`'s `Authorization: Bearer` header and nowhere else — they are never written to a log call or embedded in a thrown error's message/data, which `tests/client.test.js` and `tests/syncService.test.js` assert directly rather than just assume.
- `APP_DEBUG`-style stack traces aren't a concern here (there's no HTTP server exposed to end users — both entry points are HubSpot-invoked), but `HubSpotApiError` still deliberately carries only `status`/`data`/`url`/`method`, not the request headers that included the token.
