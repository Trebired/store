import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "#index";
import type { StoreRecord } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    context: ["tenantId"],
    storage: "memory",
    table: "libraries",
  },
});

function createFixtureStore(seed: StoreRecord[] = []) {
  return createStore({
    entities,
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

test("reads host-defined sub-entities from a parent record", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      shelves: [
        {
          id: "shelf_1",
          label: "A",
        },
        {
          id: "shelf_2",
          label: "B",
        },
      ],
      tenantId: "tenant_a",
    },
  ]);

  const list = await store.subEntity.list("shelves", {
    id: "lib_1",
  }, {
    tenantId: "tenant_a",
  });
  expect(list.data?.map((shelf) => shelf.id)).toEqual(["shelf_1", "shelf_2"]);

  const by = await store.subEntity.by("shelves", {
    id: "lib_1",
  }, {
    id: "shelf_2",
  }, {
    tenantId: "tenant_a",
  });
  expect(by.data?.label).toBe("B");

  const count = await store.subEntity.count("shelves", {
    id: "lib_1",
  }, {
    tenantId: "tenant_a",
  });
  expect(count.data).toBe(2);
});
