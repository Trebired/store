import { expect, test } from "bun:test";

import {
  clearRequestEntityLoaders,
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
  getOrCreateRequestLoader,
  getOrCreateRequestValue,
  resolveEntityDefinition,
  resolveEntityIcon,
  resolveEntityName,
  runWithStoreRequestContext,
} from "#index";
import type { StoreRecord } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    aliases: ["library", "collections"],
    context: ["tenantId"],
    metadata: {
      icon: "book",
      name: "Library",
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

test("resolves entities by name, singular, plural, explicit aliases, and metadata", () => {
  expect(resolveEntityName(entities, "libraries")).toBe("libraries");
  expect(resolveEntityName(entities, "library")).toBe("libraries");
  expect(resolveEntityName(entities, "collection")).toBe("libraries");
  expect(resolveEntityDefinition(entities, "collections")?.definition.table).toBe("libraries");
  expect(resolveEntityIcon(entities, "library")).toBe("book");
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
