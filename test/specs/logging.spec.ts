import { expect, test } from "bun:test";

import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "#index";
import type { StoreLogEvent, StoreRecord } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    context: ["tenantId"],
    storage: "memory",
    table: "libraries",
  },
});

function createLoggedStore(events: StoreLogEvent[], seed: StoreRecord[] = []) {
  return createStore({
    entities,
    loggerAdapter(_logger, event) {
      events.push(event);
    },
    storages: {
      memory: createMemoryStorageAdapter({
        libraries: seed,
      }),
    },
  });
}

test("emits generic logger-adapter events when a logger adapter is provided", async () => {
  const events: StoreLogEvent[] = [];
  const store = createLoggedStore(events);
  const context = {
    tenantId: "tenant_a",
  };

  await store.entity.write.put("libraries", context, {
    id: "lib_1",
    name: "One",
  });
  await store.entity.read.by("libraries", {
    id: "lib_1",
  }, context);
  await store.entity.write.remove("libraries", context, "lib_1");

  expect(events.map((event) => event.group)).toContain("store.create");
  expect(events.map((event) => event.group)).toContain("store.write");
  expect(events.map((event) => event.group)).toContain("store.read");
  expect(events.map((event) => event.group)).toContain("store.cache");
  expect(events.every((event) => event.level === "info")).toBe(true);
});

test("keeps logging optional when no logger or adapter is configured", async () => {
  const store = createStore({
    entities,
    storages: {
      memory: createMemoryStorageAdapter(),
    },
  });

  const result = await store.entity.read.all("libraries", {
    tenantId: "tenant_a",
  });
  expect(result.ok).toBe(true);
});
