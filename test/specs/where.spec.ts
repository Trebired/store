import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "#index";
import type { StoreCacheInspection } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    context: ["tenantId"],
    storage: "memory",
    table: "libraries",
  },
});

function createFixtureStore() {
  return createStore({
    cache: true,
    entities,
    storages: {
      memory: createMemoryStorageAdapter({
        libraries: [
          {
            id: "lib_1",
            meta: {
              tier: "gold",
            },
            name: "One",
            status: "active",
            tenantId: "tenant_a",
          },
          {
            id: "lib_2",
            meta: {
              tier: "silver",
            },
            name: "Two",
            status: "archived",
            tenantId: "tenant_a",
          },
          {
            id: "lib_3",
            name: "Three",
            status: "active",
            tenantId: "tenant_b",
          },
        ],
      }),
    },
  });
}

test("filters memory all, count, and hasAny reads with scoped where clauses", async () => {
  const store = createFixtureStore();
  const context = {
    tenantId: "tenant_a",
  };

  const active = await store.entity.read.all("libraries", context, {
    where: {
      status: "active",
    },
  });
  expect(active.data?.map((row) => row.id)).toEqual(["lib_1"]);

  const count = await store.entity.read.count("libraries", context, {
    where: {
      meta: {
        tier: "gold",
      },
    },
  });
  expect(count.data).toBe(1);

  const hasAny = await store.entity.read.hasAny("libraries", context, {
    where: {
      status: [
        "active",
        "missing",
      ],
    },
  });
  expect(hasAny.data).toBe(true);
});

test("supports all-scope memory reads with where clauses", async () => {
  const store = createFixtureStore();
  const active = await store.entity.read.all("libraries", {}, {
    scope: "all",
    where: {
      status: "active",
    },
  });

  expect(active.data?.map((row) => row.id)).toEqual(["lib_1", "lib_3"]);
});

test("validates read option where clauses and includes where in cache keys", async () => {
  const store = createFixtureStore();
  const context = {
    tenantId: "tenant_a",
  };

  const invalid = await store.entity.read.all("libraries", context, {
    where: {},
  });
  expect(invalid.error_code).toBe("store-invalid-where");

  const first = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
    where: {
      status: "active",
    },
  });
  const second = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
    where: {
      status: "active",
    },
  });
  const third = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
    where: {
      status: "archived",
    },
  });

  expect(cacheHit(first.meta?.cache)).toBe("miss");
  expect(cacheHit(second.meta?.cache)).toBe("l1");
  expect(cacheHit(third.meta?.cache)).toBe("miss");

  store.cache.invalidateEntity("libraries");
  const afterInvalidate = await store.entity.read.all("libraries", context, {
    cacheMeta: true,
    where: {
      status: "active",
    },
  });
  expect(cacheHit(afterInvalidate.meta?.cache)).toBe("miss");
});

function cacheHit(value: unknown): StoreCacheInspection["hit"] | undefined {
  return (value as StoreCacheInspection | undefined)?.hit;
}
