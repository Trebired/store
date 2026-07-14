# @trebired/store

Reusable generic entity store for Bun and Node.js applications, with typed entity registries, scoped JSONB storage, mode enrichment, request-scoped loaders, cache invalidation, and host-defined sub-entity reads.

`@trebired/store` is the generic Trebired package for hosts that already know their entities but should not keep rebuilding the same persistence, context scoping, read modes, cache, and enriched-record safety layer.

It owns:

- entity registry resolution
- high-level store runtime bootstrap
- PostgreSQL pool, query, and schema/table initialization
- scoped entity reads and writes
- storage adapter contracts
- PostgreSQL JSONB storage
- raw, full, and named mode output
- private field redaction
- enriched-record write protection
- optional L1/L2 cache orchestration
- request-scoped loaders with `AsyncLocalStorage`
- discriminator-based record views over shared physical entities
- bulk removal and generic orphan/duplicate repair helpers
- boot reconciliation, declarative hydration, and runtime memo caching
- generic sub-entity execution
- stable result/error envelopes
- optional Trebired logger-adapter integration

It stays intentionally generic.

It does not know about products, deployments, repositories, routes, frontend panels, permissions, or any host-specific business entities.

## Install

Runtime support: Bun 1+ and Node.js 18+.

```sh
npm install @trebired/store
```

For the PostgreSQL adapter:

```sh
npm install pg
```

## Quick Start

Define the host-owned entity registry:

```ts
import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "@trebired/store";

const entities = defineEntityRegistry({
  documents: {
    table: "documents",
    storage: "memory",
    context: ["workspaceId"],
    aliases: ["document", "docs"],
    metadata: {
      owner: "content",
    },
    privateFields: {
      token: "documents:private",
    },
    modes: {
      summary: {
        enrich: "documents.summary",
      },
    },
  },
});

const store = createStore({
  entities,
  storages: {
    memory: createMemoryStorageAdapter(),
  },
  enrichers: {
    "documents.summary": (record) => ({
      id: record.id,
      title: record.title,
    }),
  },
});
```

Write records through the package API:

```ts
await store.entity.write.put("documents", {
  workspaceId: "workspace_1",
}, {
  id: "doc_1",
  title: "Store extraction",
  token: "secret",
});
```

Read scoped records:

```ts
const document = await store.entity.read.by("document", {
  id: "doc_1",
}, {
  workspaceId: "workspace_1",
}, {
  mode: "summary",
});
```

All public operations return explicit Trebired-style result objects with `ok`, `error_code`, `message`, `data`, and optional `details`.

## Logging

Logging is optional and uses `@trebired/logger-adapter`, matching the other Trebired packages.

```ts
const store = createStore({
  entities,
  storages,
  logger: console,
});
```

Hosts can also pass `loggerAdapter` for a custom sink. The package emits generic store lifecycle/read/write/cache events only; it does not know about app routes, pages, permissions, or business objects.

## Core API

The high-level factory is `createStoreRuntime(options)`.

```ts
import {
  computed,
  countBy,
  createRedisMemoAdapter,
  createStoreRuntime,
  relation,
} from "@trebired/store";

const redisMemo = createRedisMemoAdapter({
  getJson: redis.getJson,
  setJson: redis.setJson,
  del: redis.del,
  incr: redis.incr,
  publishJson: redis.publishJson,
  subscribeJson: redis.subscribeJson,
});

const runtime = createStoreRuntime({
  entities: {
    items: {
      table: "items",
      aliases: ["item"],
      required: ["workspaceId"],
      private: {
        token: "items:private",
      },
      metadata: {
        owner: "runtime",
      },
      modes: {
        detail: {
          // Concise mode hook maps strip the "with-" prefix before loading hooks.
          // This loads hooks named "label" and "audit".
          "with-label": true,
          hooks: {
            "with-label": true,
            "with-audit": true,
          },
          with: {
            owner: relation({
              entity: "owners",
              id: "owner_id",
              mode: "raw",
              assign: "owner",
            }),
            children: countBy({
              entity: "children",
              foreignKey: "item_id",
              localKey: "id",
              assign: {
                total: "children_total",
              },
            }),
            url: computed((record, api) => ({
              url: api.url(record),
            })),
          },
        },
      },
    },
  },
  postgres: {
    databaseUrl: process.env.DATABASE_URL,
    schema: "public",
    resultMode: "envelope",
    logOperations: true,
    slowQueryMs: 250,
    pool: {
      max: 10,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 15_000,
    },
    indexes: [
      {
        table: "items",
        expression: "(record->>'status')",
      },
    ],
    migrations: [
      async ({ query }) => {
        const result = await query("select $1", ["migration-ok"]);
        if (result.ok === false) throw new Error(result.message);
      },
    ],
    metrics(event) {
      console.log(event.operation, event.elapsedMs);
    },
  },
  modes: {
    hookRoot: new URL("./entities/", import.meta.url),
    hookFileConvention: "entity/with/name",
    legacyHookAdapter({ hook }) {
      return legacyHooks[hook];
    },
  },
  boot: {
    context: {
      now_iso: new Date().toISOString(),
    },
    environment: {
      developerMode: process.env.NODE_ENV === "development",
      splitDev: process.env.SPLIT_DEV === "1",
    },
    fixes: [
      {
        entity: "items",
        actions: [
          {
            if: {
              field: "status",
              equals: "starting",
            },
            set: {
              status: "stopped",
              stopped_at: {
                ctx: "now_iso",
              },
            },
            unset: [
              "runtime.pid",
            ],
          },
        ],
      },
    ],
    rewrites: {
      items: {
        normalize(record) {
          return record;
        },
      },
    },
    followUps: {
      "items.ensure": async ({ record }) => {
        console.log(record.id);
      },
    },
  },
  memo: {
    l1: {
      maxEntries: 500,
      ttlMs: 30_000,
    },
    l2: redisMemo,
    redis: redisMemo,
  },
  subEntities: {
    "items.children": {
      kind: "provider",
      validateContext(ctx) {
        return ctx.item_id ? { ok: true, ctx } : { ok: false };
      },
      async list(ctx, options, api) {
        return api.readAll("children", ctx, options).then((res) => res.data || []);
      },
      async count(ctx) {
        return Number(ctx.item_id ? 1 : 0);
      },
    },
  },
  events: {
    onWrite({ entity, operation }) {
      console.log(entity, operation);
    },
  },
});
```

The runtime exposes the store surface directly:

```ts
export const entity = runtime.entity;
export const cache = runtime.cache;
export const records = runtime.records;
export const repair = runtime.repair;
export const subEntity = runtime.subEntity;
export const memo = runtime.memo;
export const onBoot = runtime.onBoot;
```

Runtime Postgres:

- creates a pool from explicit `databaseUrl` and pool options, or uses an injected client for tests and custom hosts
- redacts database URLs in logs
- validates application queries for empty SQL, comments, multiple statements, placeholder order, and inline read/write literals
- supports `resultMode: "envelope"` for `{ ok, rows, rowCount }` success and structured `{ ok: false, error_code, message }` failures
- logs pool creation, first connection, pool waits, pool errors, slow queries, query failures, and optional operation logs
- calls an optional query metrics callback
- creates the schema, JSONB entity tables, default GIN indexes, extra expression indexes, and safe migration hooks
- wires the package PostgreSQL JSONB adapter internally

Runtime registry normalization supports concise app-owned entity definitions. `required` becomes `context`, `private` becomes `privateFields`, and mode hooks such as `"with-profile": true` load hook name `"profile"`. Unknown fields can be preserved as opaque metadata, but the package does not interpret display or presentation metadata.

Runtime boot reconciliation supports generic `fixes` with `if`, `if_all`, nested field paths, `equals`, `equals_any`, `gt`, `set`, `set_if_missing`, `unset`, `rewrite`, `after`, `run_after_on_match`, `skip_in_developer_mode`, and `skip_in_split_dev`. Boot values can resolve from context with `{ ctx: "now_iso" }`. The package queues and runs app-owned follow-up callbacks, but does not know what those callbacks do.

For host code that has many boot rules, the package exports reusable boot builders:

```ts
import {
  bootFollowUpWhen,
  bootResetStatus,
  bootRewrite,
  bootSetIfMissing,
  bootTruthyCondition,
  defineBootFix,
  mergeBootOptions,
} from "@trebired/store";

const boot = mergeBootOptions({
  fixes: [
    defineBootFix("jobs", [
      bootRewrite(),
      bootSetIfMissing({ owner: "system" }),
      bootResetStatus(["running", "starting"], "stopped", {
        unset: ["runtime.pid"],
      }),
      bootFollowUpWhen("jobs.start", [
        { field: "status", equals: "stopped" },
        bootTruthyCondition("runtime.policy.auto_start"),
      ]),
    ]),
  ],
});
```

Runtime memo exposes:

- `runtime.memo.get(...)`
- `runtime.memo.set(...)`
- `runtime.memo.run(...)`
- `runtime.memo.invalidateEntity(...)`
- `runtime.memo.inspectRead(...)`
- `runtime.memo.keyForRead(...)`
- `runtime.memo.entityVersion(...)`

Stable memo keys ignore request/runtime-only fields such as `req`, `res`, `meta`, `frontend`, `cacheBypass`, and `cache`.

Provider-backed virtual sub-entities can be declared under `subEntities` with `kind: "provider"` and are routed through `runtime.entity.read.all/by/count/hasAny(...)`.

For lower-level integrations, `createStore(options)` remains available.

Entity reads:

- `store.entity.read.all(entity, context, options?)`
- `store.entity.read.by(entity, where, context, options?)`
- `store.entity.read.count(entity, context, options?)`
- `store.entity.read.hasAny(entity, context, options?)`

`all`, `count`, and `hasAny` accept `options.where` with the same validation as `read.by(...)`:

```ts
const activeDocuments = await store.entity.read.all("documents", {
  workspaceId: "workspace_1",
}, {
  where: {
    status: "active",
  },
});

const hasGoldDocuments = await store.entity.read.hasAny("documents", {
  workspaceId: "workspace_1",
}, {
  where: {
    meta: {
      tier: "gold",
    },
  },
});
```

Entity writes:

- `store.entity.write.put(entity, context, record, options?)`
- `store.entity.write.by(entity, where, context, patch, options?)`
- `store.entity.write.remove(entity, context, id, options?)`
- `store.entity.write.removeMany(entity, ids, context?, options?)`

Record views:

- `store.records(entity, views)`

Sub-entity reads:

- `store.subEntity.list(name, parentWhere, context, options?)`
- `store.subEntity.by(name, parentWhere, where, context, options?)`
- `store.subEntity.count(name, parentWhere, context, options?)`

## Entity Definitions

Hosts define the registry. The package only understands the generic contract:

```ts
const entities = defineEntityRegistry({
  documents: {
    table: "documents",
    storage: "postgres",
    context: ["workspaceId"],
    aliases: ["document", "docs"],
    metadata: {
      owner: "content",
    },
    privateFields: {
      token: "documents:private",
    },
    modes: {
      summary: {
        enrich: "documents.summary",
      },
    },
  },
});
```

Helpers:

- `defineEntityRegistry(registry)`
- `resolveEntityName(registry, nameOrAlias)`
- `resolveEntityDefinition(registry, nameOrAlias)`
- `resolveEntityMetadata(registry, nameOrAlias)`

Resolution supports the canonical key, singular/plural forms, and explicit aliases.

## Record Views

Record views are discriminator-filtered helpers over one physical entity. They are useful when a host stores several generic row shapes in one table but does not want to rebuild local wrapper APIs.

```ts
const records = store.records("documents", {
  item: {
    kind: "item",
    defaults: {
      status: "open",
    },
    normalize: (row) => ({
      ...row,
      title: String(row.title || "Untitled"),
    }),
    sort: [
      "priority:asc",
      "recorded_at:desc",
    ],
  },
  target: {
    kind: "target",
    uniqueBy: [
      "item_id",
      "server_id",
    ],
  },
});
```

The default discriminator field is `kind`. Set `discriminatorField` on a view to use another field.

View reads automatically add the discriminator to `where` and push `where`, `sort`, and `limit` into storage where the adapter supports it:

```ts
const openItems = await records.item.list({
  context,
  limit: 20,
  where: {
    status: "open",
  },
});

const item = await records.item.byId("item_1", {
  context,
});
```

View writes apply defaults, run `normalize`, and enforce the discriminator before writing:

```ts
await records.item.put({
  id: "item_1",
  title: "Reusable state",
}, {
  context,
});

await records.item.patch({
  id: "item_1",
}, {
  priority: 2,
}, {
  context,
});
```

Unique upserts read by the configured unique fields, preserve an existing id when found, and write the normalized merged record:

```ts
await records.target.upsertUnique({
  id: "target_1",
  item_id: "item_1",
  server_id: "server_1",
  status: "current",
}, {
  context,
});
```

Record views use the same entity write paths as the core API, so enriched-record safeguards remain mandatory.

## Storage Adapters

Adapters implement:

- `all`
- `by`
- `byIds`
- `count`
- `hasAny`
- `put`
- `remove`
- optional `removeMany`
- `ensureReadyFor`

The package includes `createPostgresJsonbStorageAdapter(...)`.

PostgreSQL records are stored as:

```sql
id text primary key,
record jsonb not null
```

The adapter validates SQL identifiers and placeholder order, scopes reads by required context, applies required context on write, supports `scope: "all"` with optional `where`, supports `byIds`, supports `sort` and `limit`, supports native bulk delete, and accepts an explicit client. It does not read environment files or host configuration.

```ts
import { Pool } from "pg";
import { createPostgresJsonbStorageAdapter } from "@trebired/store";

const postgres = createPostgresJsonbStorageAdapter({
  client: new Pool({
    connectionString: process.env.DATABASE_URL,
  }),
  schema: "public",
});
```

## Modes And Private Fields

Reads support:

- `raw`
- `full`
- any named mode from the entity definition

Raw mode returns stored records without enrichment or private-field filtering.

Non-raw reads redact private fields unless `includePrivate` explicitly allows them. Named modes can use host-owned enrichers:

```ts
const store = createStore({
  entities,
  storages,
  enrichers: {
    "documents.summary": (record) => ({
      id: record.id,
      title: record.title,
    }),
  },
});
```

For mode definitions made of reusable hooks, build the registry from entity config:

```ts
import { createModeEnricherRegistry } from "@trebired/store";

const entities = defineEntityRegistry({
  documents: {
    table: "documents",
    storage: "postgres",
    modes: {
      detail: {
        hooks: {
          "with-owner": true,
          "with-url": true,
        },
      },
    },
  },
});

const enrichers = createModeEnricherRegistry({
  entities,
  getStore: () => store,
  loadHook({ hook }) {
    return hooks[hook];
  },
});
```

Hooks run sequentially in definition order and receive a read-only API:

```ts
const hooks = {
  async "with-owner"(record, api, context) {
    const owner = await api.readById("owners", String(record.ownerId), context.context, {
      mode: "raw",
    });

    return {
      ...record,
      ownerName: owner.data?.name,
      recorded_at: api.recorded_at,
    };
  },
};
```

## Enriched-Record Safety

Non-raw read results are marked as enriched records and deep-frozen before they are returned.

Every enriched record receives:

- an enumerable `__store_enriched: true` marker, so JSON-serialized enriched data remains detectable
- an internal non-enumerable runtime brand plus `WeakSet` tracking, so same-object marker deletion or hiding attempts are rejected
- a recursive freeze across nested objects and arrays, so enriched records are output-only

If persisted JSONB data already contains the enriched marker, reads fail with `store-enriched-marker-persisted`.

If write input contains or has been tracked as enriched, writes fail with `store-enriched-record`.

Use `mode: "raw"` when the host needs stored data for a write path:

```ts
const raw = await store.entity.read.by("documents", {
  id: "doc_1",
}, context, {
  mode: "raw",
});
```

There is no option to disable this guard, no auto-repair path, and no exported helper that strips, bypasses, repairs, or ignores the marker.

## Cache

Enable caching with `cache: true` or a cache config:

```ts
const store = createStore({
  entities,
  storages,
  cache: {
    enabled: true,
    l2: redisLikeAdapter,
  },
});
```

The cache provides:

- L1 memory cache
- optional L2 adapter
- entity versioning
- key tracking per entity
- invalidation per entity
- in-flight read de-duplication
- optional read cache metadata

Cache keys ignore request/frontend/runtime-only context fields and include only data that changes read results.

Cache keys include entity, operation, mode, scoped context, where/input, scope, private-field unlocks, and entity version.

Writes and removes clear request loaders and invalidate the affected entity cache. Hosts can also invalidate generic entity cache directly:

```ts
store.cache.invalidateEntity("documents");
```

## Repair Helpers

The generic repair API cleans up relationships between record views without host-side SQL:

```ts
const summary = await store.repair.orphansAndDuplicates({
  child: records.target,
  parent: records.item,
  childParentKey: "item_id",
  uniqueBy: [
    "item_id",
    "server_id",
  ],
  keep: "freshest",
  freshnessFields: [
    "recorded_at",
    "last_seen_at",
    "applied_at",
    "removed_at",
  ],
  context,
});
```

It scans parent and child views in raw mode, finds children whose parent id is missing, finds duplicate children by `uniqueBy`, keeps the freshest duplicate, deletes invalid rows through `removeMany`, and returns counts for scanned, deleted, remaining, and skipped work.

## Request Context

Request helpers use `AsyncLocalStorage` and are framework-neutral:

```ts
import {
  getStoreRequestContext,
  getOrCreateRequestLoader,
  runWithStoreRequestContext,
} from "@trebired/store";

await runWithStoreRequestContext({
  requestId: "req_1",
}, async () => {
  const loader = getOrCreateRequestLoader("documents:all", () => new Map());
  const request = getStoreRequestContext();
  console.log(request?.meta.requestId);
  return loader;
});
```

Exports:

- `runWithStoreRequestContext`
- `getStoreRequestContext`
- `getOrCreateRequestLoader`
- `getOrCreateRequestValue`
- `clearRequestEntityLoaders`

Framework bindings should live as small host adapters.

## Sub-Entities

Sub-entities are host-defined child collections read from a parent entity:

```ts
const store = createStore({
  entities,
  storages,
  subEntities: {
    comments: {
      parent: "documents",
      childKey: "comments",
      identityField: "id",
      sourceMode: "raw",
    },
  },
});

const comments = await store.subEntity.list("comments", {
  id: "doc_1",
}, {
  workspaceId: "workspace_1",
});
```

A sub-entity can define context validation, list/by/count implementations, and enrichment hooks. The package owns the execution contract; hosts own concrete definitions.

## Errors

Generic error codes include:

- `store-entity-not-found`
- `store-sub-entity-not-found`
- `store-invalid-context`
- `store-missing-id`
- `store-invalid-id`
- `store-invalid-where`
- `store-invalid-mode`
- `store-enriched-record`
- `store-enriched-marker-persisted`
- `store-sql-identifier`
- `store-sql-placeholder`
- `store-storage-error`

The core package does not include frontend-specific, route-specific, or exception-format adapters.
