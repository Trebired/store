import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import {
  createSqliteJsonStorageAdapter,
  createStore,
  createStoreRuntime,
  defineEntityRegistry,
} from "#index";
import type {
  RuntimePostgresClient,
  StoreRecord,
} from "#index";

test("SQLite JSON adapter supports scoped reads writes where byIds sort limit and bulk removal", async () => {
  const database = new Database(":memory:");
  const entities = defineEntityRegistry({
    rows: {
      context: [
        "tenant_id",
      ],
      storage: "sqlite",
      table: "rows",
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
    definition: entities.rows,
    name: "rows",
  });
  await store.entity.write.put("rows", {
    tenant_id: "t1",
  }, {
    id: "row_1",
    priority: 2,
    status: "active",
  });
  await store.entity.write.put("rows", {
    tenant_id: "t1",
  }, {
    group: {
      key: "a",
    },
    id: "row_2",
    priority: 1,
    status: "active",
  });
  await store.entity.write.put("rows", {
    tenant_id: "t2",
  }, {
    id: "row_3",
    priority: 3,
    status: "active",
  });

  const scoped = await store.entity.read.all("rows", {
    tenant_id: "t1",
  }, {
    mode: "raw",
    sort: [
      "priority:asc",
    ],
    where: {
      status: "active",
    },
  });
  const nested = await store.entity.read.by("rows", {
    group: {
      key: "a",
    },
  }, {
    tenant_id: "t1",
  }, {
    mode: "raw",
  });
  const byIds = await sqlite.byIds({
    definition: entities.rows,
    name: "rows",
  }, [
    "row_1",
    "row_3",
  ], {
    tenant_id: "t1",
  });
  const count = await store.entity.read.count("rows", {
    tenant_id: "t1",
  }, {
    where: {
      status: "active",
    },
  });
  const hasAny = await store.entity.read.hasAny("rows", {
    tenant_id: "t1",
  }, {
    where: {
      priority: 1,
    },
  });
  const allScope = await store.entity.read.all("rows", {}, {
    limit: 2,
    mode: "raw",
    scope: "all",
    sort: [
      "priority:desc",
    ],
  });
  const removed = await store.entity.write.removeMany("rows", [
    "row_1",
    "row_2",
    "missing",
  ], {
    tenant_id: "t1",
  });

  expect(scoped.data?.map((row) => row.id)).toEqual([
    "row_2",
    "row_1",
  ]);
  expect(nested.data?.id).toBe("row_2");
  expect(byIds.map((row) => row.id)).toEqual(["row_1"]);
  expect(count.data).toBe(2);
  expect(hasAny.data).toBe(true);
  expect(allScope.data?.map((row) => row.id)).toEqual([
    "row_3",
    "row_1",
  ]);
  expect(removed.data).toMatchObject({
    missing: 1,
    removed: 2,
    requested: 3,
  });
  database.close();
});

test("SQLite adapter rejects invalid identifiers and fails malformed stored JSON", async () => {
  const database = new Database(":memory:");
  const adapter = createSqliteJsonStorageAdapter({
    database,
  });
  const entity = {
    definition: {
      storage: "sqlite",
      table: "rows",
    },
    name: "rows",
  };
  await adapter.ensureReadyFor?.(entity);
  database.query("insert into rows (id, record) values (?, ?)").run("bad", "{no");

  await expect(adapter.all({
    definition: {
      storage: "sqlite",
      table: "bad-table",
    },
    name: "bad",
  }, {}, {})).rejects.toThrow("Invalid SQL identifier");
  await expect(adapter.all(entity, {}, {
    where: {
      "bad-field": "x",
    },
  })).rejects.toThrow("Invalid SQLite JSON field path");
  await expect(adapter.by(entity, {
    id: "bad",
  }, {})).rejects.toThrow("could not parse");
  database.close();
});

test("SQLite runtime initializes tables indexes migrations and defaults entities to sqlite", async () => {
  const database = new Database(":memory:");
  const migrated: string[] = [];
  const runtime = createStoreRuntime({
    entities: {
      rows: {
        context: [
          "tenant_id",
        ],
        table: "rows",
      },
    },
    sqlite: {
      database,
      indexes: [
        {
          expression: "json_extract(record, '$.status')",
          table: "rows",
        },
      ],
      migrations: [
        async ({ query }) => {
          const result = await query("create table if not exists migrations (id text primary key)", []);
          migrated.push(String(result.rowCount ?? 0));
        },
      ],
      resultMode: "envelope",
    },
  });

  await runtime.onBoot();
  await runtime.entity.write.put("rows", {
    tenant_id: "t1",
  }, {
    id: "row_1",
    status: "ready",
  });
  const row = await runtime.entity.read.by("rows", {
    id: "row_1",
  }, {
    tenant_id: "t1",
  }, {
    mode: "raw",
  });
  const table = await runtime.sqlite.query<{ name: string }>("select name from sqlite_master where type = ? and name = ?", [
    "table",
    "rows",
  ], {
    operation: "read",
  });
  const invalid = await runtime.sqlite.query("select 'inline'", [], {
    operation: "read",
  });

  expect(row.data).toMatchObject({
    id: "row_1",
    status: "ready",
    tenant_id: "t1",
  });
  expect(table.rows[0]?.name).toBe("rows");
  expect(migrated).toHaveLength(1);
  expect(invalid).toMatchObject({
    error_code: "query-literal-forbidden",
    ok: false,
  });
  database.close();
});

test("SQLite runtime supports explicit SQLite memory and Postgres storage together", async () => {
  const database = new Database(":memory:");
  const postgres = new CapturePostgresClient();
  const runtime = createStoreRuntime({
    entities: {
      local: {
        storage: "sqlite",
        table: "local_rows",
      },
      remote: {
        storage: "postgres",
        table: "remote_rows",
      },
      scratch: {
        storage: "memory",
        table: "scratch_rows",
      },
    },
    postgres: {
      client: postgres,
      schema: "public",
    },
    sqlite: {
      database,
    },
  });

  await runtime.onBoot();
  await runtime.entity.write.put("local", {}, {
    id: "local_1",
  });
  await runtime.entity.write.put("scratch", {}, {
    id: "scratch_1",
  });
  const local = await runtime.entity.read.by("local", {
    id: "local_1",
  }, {}, {
    mode: "raw",
  });
  const scratch = await runtime.entity.read.by("scratch", {
    id: "scratch_1",
  }, {}, {
    mode: "raw",
  });

  expect(local.data?.id).toBe("local_1");
  expect(scratch.data?.id).toBe("scratch_1");
  expect(postgres.sql.some((sql) => sql.includes("\"remote_rows\""))).toBe(true);
  expect(postgres.sql.some((sql) => sql.includes("\"local_rows\""))).toBe(false);
  database.close();
});

class CapturePostgresClient implements RuntimePostgresClient {
  readonly params: unknown[][] = [];
  readonly sql: string[] = [];

  async query<T = StoreRecord>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
    this.sql.push(sql);
    this.params.push([...params]);
    return {
      rows: [],
    };
  }
}
