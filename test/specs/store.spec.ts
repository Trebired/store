import { expect, test } from "bun:test";

import {
  clearRequestEntityLoaders,
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
  getOrCreateRequestLoader,
  getOrCreateRequestValue,
  resolveEntityDefinition,
  resolveEntityMetadata,
  resolveEntityName,
  runWithStoreRequestContext,
} from "#index";
import { StoreCache } from "#oz5habwl5021";
import type { StoreRecord } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    aliases: ["library", "collections"],
    context: ["tenantId"],
    metadata: {
      owner: "fixtures",
    },
    modes: {
      summary: {
        enrich: "libraries.summary",
      },
    },
    privateFields: {
      secret: "private:library",
    },
    storage: "memory",
    table: "libraries",
  },
});

function createFixtureStore(seed: StoreRecord[] = []) {
  return createStore({
    cache: true,
    entities,
    enrichers: {
      "libraries.summary": (record) => ({
        ...record,
        summary: `${record.name}`,
      }),
    },
    storages: {
      memory: createMemoryStorageAdapter({
        libraries: seed,
      }),
    },
    subEntities: {
      shelves: {
        childKey: "shelves",
        identityField: "id",
        parent: "libraries",
        sourceMode: "raw",
      },
    },
  });
}

function createUnscopedStore(seed: StoreRecord[] = []) {
  const unscoped = defineEntityRegistry({
    notes: {
      storage: "memory",
      table: "notes",
    },
  });
  return createStore({
    cache: true,
    entities: unscoped,
    storages: {
      memory: createMemoryStorageAdapter({
        notes: seed,
      }),
    },
  });
}

test("resolves entities by name, singular, plural, explicit aliases, and metadata", () => {
  expect(resolveEntityName(entities, "libraries")).toBe("libraries");
  expect(resolveEntityName(entities, "library")).toBe("libraries");
  expect(resolveEntityName(entities, "collection")).toBe("libraries");
  expect(resolveEntityDefinition(entities, "collections")?.definition.table).toBe("libraries");
  expect(resolveEntityMetadata(entities, "library")?.owner).toBe("fixtures");
});

test("validates required context for scoped reads and allows all-scope reads", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "Shared",
      tenantId: "tenant_a",
    },
  ]);

  const missing = await store.entity.read.all("libraries", {});
  expect(missing.ok).toBe(false);
  expect(missing.error_code).toBe("store-invalid-context");

  const scoped = await store.entity.read.all("libraries", {
    tenantId: "tenant_b",
  });
  expect(scoped.data).toEqual([]);

  const allScope = await store.entity.read.all("libraries", {}, {
    scope: "all",
  });
  expect(allScope.data?.map((row) => row.id)).toEqual(["lib_1"]);
});

test("reads all, by, count, and hasAny with context scoping", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      tenantId: "tenant_a",
    },
    {
      id: "lib_2",
      name: "Two",
      tenantId: "tenant_b",
    },
  ]);

  const context = {
    tenantId: "tenant_a",
  };

  expect((await store.entity.read.all("libraries", context)).data?.map((row) => row.id)).toEqual(["lib_1"]);
  expect((await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context)).data?.name).toBe("One");
  expect((await store.entity.read.count("libraries", context)).data).toBe(1);
  expect((await store.entity.read.hasAny("libraries", context)).data).toBe(true);
});

test("writes put, patch by where, remove, and applies required context", async () => {
  const store = createFixtureStore();
  const context = {
    tenantId: "tenant_a",
  };

  const put = await store.entity.write.put("libraries", context, {
    id: "lib_1",
    name: "One",
  });
  expect(put.ok).toBe(true);
  expect((put.data as StoreRecord | null)?.tenantId).toBe("tenant_a");

  const patched = await store.entity.write.by("libraries", {
    id: "lib_1",
  }, context, {
    id: "ignored",
    name: "Updated",
  });
  expect(patched.data?.id).toBe("lib_1");
  expect(patched.data?.name).toBe("Updated");

  const removed = await store.entity.write.remove("libraries", context, "lib_1");
  expect(removed.data).toBe(true);
  expect((await store.entity.read.hasAny("libraries", context)).data).toBe(false);
});

test("normalizes null and undefined context to empty objects for unscoped reads and writes", async () => {
  const store = createUnscopedStore();

  expect((await store.entity.write.put("notes", null, {
    id: "note_1",
    title: "One",
  })).ok).toBe(true);
  expect((await store.entity.read.all("notes", null)).data?.map((row) => row.id)).toEqual(["note_1"]);
  expect((await store.entity.read.by("notes", {
    id: "note_1",
  }, null)).data?.title).toBe("One");
  expect((await store.entity.read.count("notes", undefined)).data).toBe(1);
  expect((await store.entity.read.hasAny("notes", null)).data).toBe(true);

  expect((await store.entity.write.by("notes", {
    id: "note_1",
  }, null, {
    title: "Updated",
  })).data?.title).toBe("Updated");
  expect((await store.entity.write.put("notes", undefined, {
    id: "note_2",
    title: "Two",
  })).ok).toBe(true);
  expect((await store.entity.write.remove("notes", null, "note_2")).data).toBe(true);
  expect((await store.entity.write.removeMany("notes", [
    "note_1",
  ], null)).data).toMatchObject({
    removed: 1,
    requested: 1,
  });
});

test("returns invalid-context results for non-object contexts without storage failures", async () => {
  const store = createUnscopedStore();
  const invalidContexts = [
    "tenant",
    1,
    true,
    [],
    new Date(),
    () => ({}),
  ];

  for (const context of invalidContexts) {
    const read = await store.entity.read.all("notes", context as never);
    const write = await store.entity.write.put("notes", context as never, {
      id: `note_${crypto.randomUUID()}`,
    });
    expect(read).toMatchObject({
      error_code: "store-invalid-context",
      ok: false,
      status: 400,
    });
    expect(write).toMatchObject({
      error_code: "store-invalid-context",
      ok: false,
      status: 400,
    });
    expect(read.error_code).not.toBe("store-storage-error");
    expect(write.error_code).not.toBe("store-storage-error");
  }

  const invalid = [] as never;
  const results = [
    await store.entity.read.by("notes", {
      id: "note_1",
    }, invalid),
    await store.entity.read.count("notes", invalid),
    await store.entity.read.hasAny("notes", invalid),
    await store.entity.write.by("notes", {
      id: "note_1",
    }, invalid, {
      title: "Nope",
    }),
    await store.entity.write.remove("notes", invalid, "note_1"),
    await store.entity.write.removeMany("notes", [
      "note_1",
    ], invalid),
  ];
  for (const result of results) {
    expect(result).toMatchObject({
      error_code: "store-invalid-context",
      ok: false,
      status: 400,
    });
  }
});

test("required context still fails after null context normalizes to empty object", async () => {
  const store = createFixtureStore();
  const read = await store.entity.read.all("libraries", null);
  const write = await store.entity.write.put("libraries", undefined, {
    id: "lib_1",
  });

  expect(read).toMatchObject({
    error_code: "store-invalid-context",
    ok: false,
  });
  expect(read.message).toContain("Missing required context key");
  expect(write).toMatchObject({
    error_code: "store-invalid-context",
    ok: false,
  });
});

test("store cache key creation is defensive for nullable and invalid contexts", () => {
  const cache = new StoreCache(true);

  expect(() => cache.createKey("notes", "all", {}, null, "raw")).not.toThrow();
  expect(() => cache.createKey("notes", "all", {}, undefined, "raw")).not.toThrow();
  expect(() => cache.createKey("notes", "all", {}, "bad", "raw")).not.toThrow();
});

test("rejects missing ids, invalid ids, and invalid where clauses", async () => {
  const store = createFixtureStore();
  const context = {
    tenantId: "tenant_a",
  };

  expect((await store.entity.write.put("libraries", context, {
    id: "",
  })).error_code).toBe("store-missing-id");
  expect((await store.entity.write.remove("libraries", context, "not valid")).error_code).toBe("store-invalid-id");
  expect((await store.entity.write.by("libraries", {}, context, {
    name: "x",
  })).error_code).toBe("store-invalid-where");
});

test("redacts private fields unless private unlocks are allowed", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      secret: "hidden",
      tenantId: "tenant_a",
    },
  ]);
  const context = {
    tenantId: "tenant_a",
  };

  expect((await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context)).data?.secret).toBeUndefined();
  expect((await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context, {
    includePrivate: ["private:library"],
  })).data?.secret).toBe("hidden");
});

test("supports raw reads and named mode enrichment", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      secret: "hidden",
      tenantId: "tenant_a",
    },
  ]);
  const context = {
    tenantId: "tenant_a",
  };

  const raw = await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context, {
    mode: "raw",
  });
  expect(raw.data?.secret).toBe("hidden");

  const summary = await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context, {
    mode: "summary",
  });
  expect(summary.data?.summary).toBe("One");
});

test("invalidates entity cache after writes and removes", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      tenantId: "tenant_a",
    },
  ]);
  const context = {
    request: crypto.randomUUID(),
    tenantId: "tenant_a",
  };

  const first = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
  });
  const second = await store.entity.read.all("libraries", {
    ...context,
    request: crypto.randomUUID(),
  }, {
    cacheMeta: true,
  });
  expect(first.meta?.cache).toMatchObject({
    hit: "miss",
  });
  expect(second.meta?.cache).toMatchObject({
    hit: "l1",
  });

  await store.entity.write.put("libraries", context, {
    id: "lib_2",
    name: "Two",
  });
  const afterWrite = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
  });
  expect(afterWrite.meta?.cache).toMatchObject({
    hit: "miss",
  });
  expect(store.inspectCache().entityVersions.libraries).toBe(1);
});

test("supports request-scoped loaders and values with explicit clearing", () => {
  runWithStoreRequestContext(() => {
    const first = getOrCreateRequestLoader("libraries:all", () => ({
      id: crypto.randomUUID(),
    }));
    const second = getOrCreateRequestLoader("libraries:all", () => ({
      id: "new",
    }));
    const value = getOrCreateRequestValue("trace", () => "trace_1");

    expect(second).toBe(first);
    expect(value).toBe("trace_1");

    clearRequestEntityLoaders("libraries");
    const third = getOrCreateRequestLoader("libraries:all", () => ({
      id: "after-clear",
    }));
    expect(third).not.toBe(first);
  });
});
