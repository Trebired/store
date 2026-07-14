import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createModeEnricherRegistry,
  createStore,
  defineEntityRegistry,
} from "#index";
import type { ModeEnricherHook, Store } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    context: ["tenantId"],
    modes: {
      detail: {
        hooks: {
          "with-owner": true,
          "with-url": true,
        },
      },
    },
    storage: "memory",
    table: "libraries",
  },
  owners: {
    context: ["tenantId"],
    storage: "memory",
    table: "owners",
  },
});

test("builds mode enrichers from generic hook maps and executes hooks sequentially", async () => {
  const calls: string[] = [];
  let store: Store;
  const hooks: Record<string, ModeEnricherHook> = {
    "with-owner": async (record, api, context) => {
      calls.push(context.hook);
      const owner = await api.readById("owners", String(record.ownerId), context.context, {
        mode: "raw",
      });
      return {
        ...record,
        ownerName: owner.data?.name,
      };
    },
    "with-url": async (record, api, context) => {
      calls.push(context.hook);
      const libraries = await api.readAll("libraries", context.context, {
        mode: "raw",
      });
      return {
        ...record,
        recorded_at: api.recorded_at,
        totalLibraries: libraries.data?.length,
        url: `/libraries/${record.id}`,
      };
    },
  };
  const enrichers = createModeEnricherRegistry({
    entities,
    getStore: () => store,
    loadHook: ({ hook }) => hooks[hook],
    now: () => "2026-07-14T00:00:00.000Z",
  });

  store = createStore({
    entities,
    enrichers,
    storages: {
      memory: createMemoryStorageAdapter({
        libraries: [
          {
            id: "lib_1",
            name: "One",
            ownerId: "owner_1",
            tenantId: "tenant_a",
          },
        ],
        owners: [
          {
            id: "owner_1",
            name: "Ada",
            tenantId: "tenant_a",
          },
        ],
      }),
    },
  });

  const read = await store.entity.read.by("libraries", {
    id: "lib_1",
  }, {
    tenantId: "tenant_a",
  }, {
    mode: "detail",
  });

  expect(calls).toEqual(["with-owner", "with-url"]);
  expect(read.data).toMatchObject({
    ownerName: "Ada",
    recorded_at: "2026-07-14T00:00:00.000Z",
    totalLibraries: 1,
    url: "/libraries/lib_1",
  });
});
