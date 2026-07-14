import { Database } from "bun:sqlite";

import {
  createSqliteJsonStorageAdapter,
  createStore,
  createStoreRuntime,
  defineEntityRegistry,
} from "@trebired/store";

const database = new Database(":memory:");

const entities = defineEntityRegistry({
  users: {
    context: [
      "tenant_id",
    ],
    storage: "sqlite",
    table: "users",
  },
});

const sqlite = createSqliteJsonStorageAdapter({
  database,
});

const store = createStore({
  entities,
  storages: {
    sqlite,
  },
});

await sqlite.ensureReadyFor?.({
  definition: entities.users,
  name: "users",
});

await store.entity.write.put("users", {
  tenant_id: "tenant_1",
}, {
  email: "ada@example.test",
  id: "user_1",
  name: "Ada",
});

const directRead = await store.entity.read.all("users", {
  tenant_id: "tenant_1",
}, {
  mode: "raw",
  where: {
    email: "ada@example.test",
  },
});

const runtime = createStoreRuntime({
  entities: {
    users: {
      context: [
        "tenant_id",
      ],
      storage: "sqlite",
      table: "runtime_users",
    },
  },
  sqlite: {
    database,
  },
});

await runtime.onBoot();
await runtime.entity.write.put("users", {
  tenant_id: "tenant_1",
}, {
  email: "grace@example.test",
  id: "user_2",
  name: "Grace",
});

const runtimeRead = await runtime.entity.read.by("users", {
  id: "user_2",
}, {
  tenant_id: "tenant_1",
}, {
  mode: "raw",
});

console.log(directRead.data, runtimeRead.data);
database.close();
