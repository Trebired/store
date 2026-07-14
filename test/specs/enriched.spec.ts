import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "#index";
import * as storeApi from "#index";
import type { StoreRecord } from "#index";

const ENRICHED_MARKER = "__store_enriched";

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
  });
}

test("fails reads when persisted data contains the enriched marker", async () => {
  const store = createFixtureStore([
    {
      [ENRICHED_MARKER]: true,
      id: "lib_1",
      name: "Bad",
      tenantId: "tenant_a",
    },
  ]);

  const read = await store.entity.read.by("libraries", {
    id: "lib_1",
  }, {
    tenantId: "tenant_a",
  });
  expect(read.ok).toBe(false);
  expect(read.error_code).toBe("store-enriched-marker-persisted");
});

test("fails writes for input records with the visible enriched marker", async () => {
  const store = createFixtureStore();
  const write = await store.entity.write.put("libraries", {
    tenantId: "tenant_a",
  }, {
    [ENRICHED_MARKER]: true,
    id: "lib_1",
    name: "Bad",
  });

  expect(write.ok).toBe(false);
  expect(write.error_code).toBe("store-enriched-record");
});

test("deep-freezes enriched records and rejects same-object marker deletion attempts", async () => {
  const store = createFixtureStore([
    {
      id: "lib_1",
      name: "One",
      nested: {
        tags: [
          "a",
        ],
      },
      tenantId: "tenant_a",
    },
  ]);
  const context = {
    tenantId: "tenant_a",
  };
  const read = await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context);
  const enriched = read.data as StoreRecord;
  const nested = enriched.nested as {
    tags: string[];
  };

  expect(enriched[ENRICHED_MARKER]).toBe(true);
  expect(Object.keys(enriched)).toContain(ENRICHED_MARKER);
  expect(Object.isFrozen(enriched)).toBe(true);
  expect(Object.isFrozen(nested)).toBe(true);
  expect(Object.isFrozen(nested.tags)).toBe(true);
  expect(() => {
    delete enriched[ENRICHED_MARKER];
  }).toThrow();
  expect(() => {
    enriched.name = "Mutated";
  }).toThrow();
  expect(() => {
    nested.tags.push("b");
  }).toThrow();
  expect(enriched.name).toBe("One");
  expect(enriched[ENRICHED_MARKER]).toBe(true);
  expect(nested.tags).toEqual(["a"]);
  expect((await store.entity.write.put("libraries", context, enriched)).error_code).toBe("store-enriched-record");
  expect((await store.entity.write.put("libraries", context, structuredClone(enriched))).error_code).toBe("store-enriched-record");
});

test("does not expose public APIs for disabling enriched-record safeguards", () => {
  const publicNames = Object.keys(storeApi);
  expect(publicNames).not.toContain("getEnrichedMarkerKey");

  for (const name of publicNames) {
    expect(name).not.toMatch(/disableEnrichedRecordGuard|allowEnrichedWrites|skipFreeze|unsafeMode/u);
    expect(name).not.toMatch(/repairEnrichedRecords|stripEnrichedMarker/u);
  }
});
