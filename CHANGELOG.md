# Changelog

## 1.0.2

- Moved package-owned store logging under the `trebired.store` group root across runtime creation, reads, writes, cache invalidation, boot follow-ups, SQLite, and Postgres diagnostics.

## 1.0.1

- Normalized `null` and `undefined` store contexts to `{}` across entity reads, writes, record views, provider-backed virtual sub-entities, and cache key creation.
- Added clean `store-invalid-context` result failures for non-object contexts instead of leaking runtime `TypeError`s or misclassifying them as storage errors.
- Kept required context validation and enriched-record safeguards unchanged, with regression coverage for both paths.

## 1.0.0

- Added first-class SQLite support through `createSqliteJsonStorageAdapter(...)`, with JSON string records, scoped context filtering, `where` and `options.where`, `byIds`, `limit`, `sort`, `count`, `hasAny`, native `removeMany`, and strict identifier/path validation.
- Added `createStoreRuntime({ sqlite, entities, ... })` with runtime-owned SQLite query/init support, table creation, expression indexes, migrations, optional metrics/logging, and structured envelope query failures.
- Updated runtime entity storage defaults so explicit storage always wins, SQLite-only runtimes default to `sqlite`, and mixed Postgres/SQLite runtimes remain deterministic with explicit per-entity storage available.
- Exported SQLite adapter, database/client, runtime facade, query, migration, index, and metrics types from the package root.
- Added SQLite examples, README coverage, and tests for direct adapter usage, runtime initialization, migrations, mixed storage, query validation, malformed JSON reads, and bulk operations.

## 0.7.0

- Added `createBootFollowUpDispatcher(...)` with generic call lookup, structured skipped/success/failure outcomes, exception handling, optional boolean policy checks, readiness guard polling, timeout skips, and package-owned follow-up log metadata.
- Added boot follow-up result helpers and `readBootBoolean(...)` for hosts that need direct control while keeping result envelopes consistent.
- Expanded `RuntimeBootResult` with `followUps` and `followUpsRunCount` so queued follow-up outcomes are visible alongside boot changes and failures.
- Added boot rewrite builders including `createBootRewriter(...)`, `bootRecord(...)`, alias/default/nested/object/array/string/number/boolean transforms, slug generation, boolean policy defaults, and `customTransform(...)`.
- Documented the generic boot dispatcher and rewrite-builder patterns so hosts can keep only handler implementations, target readiness checks, and host-specific transforms.

## 0.6.0

- Added package-owned runtime boot helper builders for reusable boot fix declarations, status reset actions, default field actions, truthy policy conditions, follow-up queues, and boot option merging.
- Kept host-owned follow-up execution and record normalization outside the package while reducing the repetitive boot configuration code hosts need to keep.

## 0.5.0

- Added package-owned normalization for concise runtime entity registries, including `required`, `private`, concise mode hook maps, and automatic `"with-"` hook-name stripping.
- Added strict runtime registry validation so invalid definitions fail during runtime creation.
- Expanded runtime PostgreSQL support with envelope result mode, query metrics callbacks, one-time init guarding, pool wait logging, and structured query validation errors.
- Added `createRedisMemoAdapter(...)` plus richer runtime memo inspection, stale L2 entry rejection, entity invalidation metadata, and cross-process invalidation wiring.
- Extended boot reconciliation with runtime context/environment config, `{ ctx: "..." }` value resolvers, stable change detection, strict record id failure reporting, and result callbacks.
- Added first-class provider-backed virtual sub-entities routed through `runtime.entity.read.*`.

## 0.4.0

- Added `createStoreRuntime(...)`, a high-level runtime facade that exposes entity, cache, records, repair, sub-entity, Postgres, memo, and boot APIs from one package-owned bootstrap.
- Added runtime-owned PostgreSQL pool/query/init support with query safety validation, redacted URL logging, caller metadata, schema/table creation, default JSONB GIN indexes, expression indexes, and migration hooks.
- Added a generic boot reconciliation runner with matching conditions, nested field reads, set/set-if-missing/unset, rewrites, follow-up queues, skip rules, and structured boot summaries.
- Added runtime memo caching with stable read keys, ignored request/runtime keys, L1 TTL/max-entry support, optional L2, in-flight de-duplication, entity versioning, invalidation, and optional remote invalidation.
- Added declarative hydration builders for relation, count, and computed mode enrichment, while preserving hook loading and legacy hook adapters for complex host-owned behavior.
- Moved `pg` to runtime dependencies because the runtime now owns explicit PostgreSQL pool creation.

## 0.3.0

- Added generic record views with discriminator-scoped reads, normalized writes, default values, sort/limit read options, unique upsert, and enforced enriched-record safeguards.
- Added `store.entity.write.removeMany(...)` with storage-native bulk delete support and safe per-id fallback behavior.
- Added generic orphan and duplicate repair helpers for parent/child record views, including freshest duplicate selection and bulk deletion summaries.
- Expanded memory and PostgreSQL JSONB adapters to support sorted and limited reads, plus native PostgreSQL bulk removal.
- Updated documentation and examples for record views, raw versus enriched reads, unique upsert, bulk removal, and generic repair flows.

## 0.2.0

- Added first-class `where` support for `read.all`, `read.count`, and `read.hasAny`, with cache keys, validation, memory storage, and PostgreSQL JSONB storage all using the same criteria semantics.
- Expanded request-scoped context helpers with metadata access through `getStoreRequestContext()` and metadata-aware `runWithStoreRequestContext(...)`.
- Added generic mode-enricher registry construction from entity mode hook maps, with sequential hook execution and read-only hook APIs.
- Added package-owned cache invalidation through `store.cache.invalidateEntity(...)` and kept enriched-record protections mandatory for marked, branded, frozen, or persisted enriched records.

## 0.1.1

- Added `@trebired/logger-adapter` support with package-owned `logger` and `loggerAdapter` options, public store logger types, and generic store lifecycle/read/write/cache events.

## 0.1.0

- Initial public release of `@trebired/store`.
- Added the generic entity registry, store read/write API, request-scoped loader helpers, mode enrichment, private field redaction, enriched-record safety guards, cache invalidation, sub-entity execution, and the PostgreSQL JSONB storage adapter.
