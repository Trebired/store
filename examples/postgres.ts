import { Pool } from "pg";

import {
  createPostgresJsonbStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "@trebired/store";

const entities = defineEntityRegistry({
  documents: {
    context: ["workspaceId"],
    storage: "postgres",
    table: "documents",
  },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const postgres = createPostgresJsonbStorageAdapter({
  client: pool,
  schema: "public",
});

const store = createStore({
  entities,
  storages: {
    postgres,
  },
});

await postgres.ensureReadyFor?.({
  definition: entities.documents,
  name: "documents",
});

await store.entity.write.put("documents", {
  workspaceId: "workspace_1",
}, {
  id: "doc_1",
  status: "active",
  title: "PostgreSQL JSONB store",
});

const all = await store.entity.read.all("documents", {
  workspaceId: "workspace_1",
}, {
  where: {
    status: "active",
  },
});

console.log(all.data);
await pool.end();
