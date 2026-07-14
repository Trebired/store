# Changelog

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
