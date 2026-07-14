# Changelog

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
