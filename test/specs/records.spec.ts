import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "#index";
import type {
  ResolvedEntity,
  StorageAdapter,
  StorageReadOptions,
  StoreContext,
  StoreRecord,
} from "#index";

const ENRICHED_MARKER = "__store_enriched";

const entities = defineEntityRegistry({
  rows: {
    storage: "memory",
    table: "rows",
  },
});

function createRecordFixture(seed: StoreRecord[] = []) {
  const store = createStore({
    entities,
    storages: {
      memory: createMemoryStorageAdapter({
        rows: seed,
      }),
    },
  });
  const records = store.records("rows", {
    item: {
      defaults: {
        status: "open",
      },
      kind: "item",
      normalize: (row) => ({
        ...row,
        normalized: true,
      }) as StoreRecord,
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

  return {
    records,
    store,
  };
}

test("record views filter by discriminator and apply defaults, normalize, sort, and limit", async () => {
  const { records, store } = createRecordFixture([
    {
      id: "i1",
      kind: "item",
      priority: 2,
      recorded_at: "2025-01-01",
    },
    {
      id: "i2",
      kind: "item",
      priority: 1,
      recorded_at: "2025-01-02",
    },
    {
      id: "t1",
      kind: "target",
      priority: 0,
    },
  ]);

  const listed = await records.item.list({
    limit: 1,
    mode: "raw",
  });
  expect(listed.data?.map((row) => row.id)).toEqual(["i2"]);

  const written = await records.item.put({
    id: "i3",
    kind: "target",
  });
  expect(written.data).toMatchObject({
    id: "i3",
    kind: "item",
    normalized: true,
    status: "open",
  });

  const raw = await store.entity.read.by("rows", {
    id: "i3",
  }, {}, {
    mode: "raw",
  });
  expect(raw.data?.kind).toBe("item");
});

test("record views pass discriminator where, sort, and limit into storage", async () => {
  const adapter = new CaptureStorage();
  const store = createStore({
    entities,
    storages: {
      memory: adapter,
    },
  });
  const records = store.records("rows", {
    item: {
      kind: "item",
    },
  });

  await records.item.list({
    limit: 5,
    mode: "raw",
    sort: [
      "priority:asc",
    ],
    where: {
      status: "open",
    },
  });

  expect(adapter.lastRead?.options).toMatchObject({
    limit: 5,
    sort: [
      "priority:asc",
    ],
    where: {
      kind: "item",
      status: "open",
    },
  });
});

test("record views upsert unique rows while preserving an existing id", async () => {
  const { records } = createRecordFixture([
    {
      id: "t1",
      item_id: "i1",
      kind: "target",
      server_id: "s1",
      value: "old",
    },
  ]);

  const upserted = await records.target.upsertUnique({
    id: "t2",
    item_id: "i1",
    kind: "target",
    server_id: "s1",
    value: "new",
  });

  expect(upserted.data).toMatchObject({
    id: "t1",
    value: "new",
  });
  expect((await records.target.list({
    mode: "raw",
  })).data?.map((row) => row.id)).toEqual(["t1"]);
});

test("bulk remove deletes many rows and repair removes orphans and duplicate losers", async () => {
  const { records, store } = createRecordFixture([
    {
      id: "i1",
      kind: "item",
    },
    {
      id: "i2",
      kind: "item",
    },
    {
      id: "c1",
      item_id: "i1",
      kind: "target",
      recorded_at: "2024-01-01",
      server_id: "s1",
    },
    {
      id: "c2",
      item_id: "i1",
      kind: "target",
      recorded_at: "2025-01-01",
      server_id: "s1",
    },
    {
      id: "c3",
      item_id: "missing",
      kind: "target",
      server_id: "s2",
    },
    {
      id: "c4",
      item_id: "i2",
      kind: "target",
      server_id: "s3",
    },
  ]);

  const summary = await store.repair.orphansAndDuplicates({
    child: records.target,
    childParentKey: "item_id",
    freshnessFields: [
      "recorded_at",
      "last_seen_at",
      "applied_at",
      "removed_at",
    ],
    keep: "freshest",
    parent: records.item,
    uniqueBy: [
      "item_id",
      "server_id",
    ],
  });

  expect(summary).toEqual({
    deletedDuplicateCount: 1,
    deletedOrphanCount: 1,
    deletedTotal: 2,
    remainingChildCount: 2,
    scannedChildCount: 4,
    scannedParentCount: 2,
    skipped: false,
  });
  expect((await records.target.list({
    mode: "raw",
  })).data?.map((row) => row.id).sort()).toEqual([
    "c2",
    "c4",
  ]);

  const removed = await store.entity.write.removeMany("rows", [
    "c2",
    "missing",
  ]);
  expect(removed.data).toMatchObject({
    missing: 1,
    removed: 1,
    requested: 2,
  });
});

test("bulk remove falls back to per-id adapter removal when native bulk delete is absent", async () => {
  const adapter = new CaptureStorage();
  const store = createStore({
    entities,
    storages: {
      memory: adapter,
    },
  });

  const removed = await store.entity.write.removeMany("rows", [
    "row_1",
    "missing",
  ]);

  expect(removed.data).toMatchObject({
    missing: 1,
    removed: 1,
    requested: 2,
  });
  expect(adapter.removedIds).toEqual([
    "row_1",
    "missing",
  ]);
});

test("record views keep enriched-record safeguards mandatory", async () => {
  const { records } = createRecordFixture([
    {
      id: "i1",
      kind: "item",
      nested: {
        values: [
          "a",
        ],
      },
    },
    {
      [ENRICHED_MARKER]: true,
      id: "i2",
      kind: "item",
    },
  ]);

  const enriched = await records.item.byId("i1");
  expect(Object.isFrozen(enriched.data as StoreRecord)).toBe(true);
  expect(Object.isFrozen((enriched.data as StoreRecord).nested as object)).toBe(true);
  expect((await records.item.put(enriched.data as StoreRecord)).error_code).toBe("store-enriched-record");
  expect((await records.item.byId("i2")).error_code).toBe("store-enriched-marker-persisted");
});

class CaptureStorage implements StorageAdapter {
  lastRead: {
    context: StoreContext;
    entity: ResolvedEntity;
    options?: StorageReadOptions;
  } | null = null;
  readonly removedIds: string[] = [];

  async all(entity: ResolvedEntity, context: StoreContext, options?: StorageReadOptions): Promise<StoreRecord[]> {
    this.lastRead = {
      context,
      entity,
      options,
    };
    return [];
  }

  async by(): Promise<StoreRecord | null> {
    return null;
  }

  async byIds(): Promise<StoreRecord[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async hasAny(): Promise<boolean> {
    return false;
  }

  async put(_entity: ResolvedEntity, _context: StoreContext, record: StoreRecord): Promise<StoreRecord> {
    return record;
  }

  async remove(_entity: ResolvedEntity, _context: StoreContext, id: string): Promise<boolean> {
    this.removedIds.push(id);
    return id !== "missing";
  }
}
