import { expect, test } from "bun:test";

import {
  createPostgresJsonbStorageAdapter,
  defineEntityRegistry,
  validatePlaceholderOrder,
  validateSqlIdentifier,
} from "#index";
import type { PostgresStoreClient } from "#index";

const entities = defineEntityRegistry({
  libraries: {
    context: ["tenantId"],
    storage: "postgres",
    table: "libraries",
  },
});

test("validates PostgreSQL identifiers, placeholders, and JSONB query shape", async () => {
  expect(validateSqlIdentifier("valid_name")?.ok ?? true).toBe(true);
  expect(validateSqlIdentifier("bad-name")?.error_code).toBe("store-sql-identifier");
  expect(validatePlaceholderOrder("select $1, $3", ["a", "b"])?.error_code).toBe("store-sql-placeholder");

  const client = new CaptureClient();
  const adapter = createPostgresJsonbStorageAdapter({
    client,
  });

  await adapter.by({
    definition: entities.libraries,
    name: "libraries",
  }, {
    id: "lib_1",
  }, {
    tenantId: "tenant_a",
  });

  expect(client.queries[0]?.sql).toContain("\"public\".\"libraries\"");
  expect(client.queries[0]?.sql).toContain("record @> $1::jsonb");
  expect(client.queries[0]?.sql).toContain("record @> $2::jsonb");
  expect(client.queries[0]?.params).toEqual([
    JSON.stringify({
      id: "lib_1",
    }),
    JSON.stringify({
      tenantId: "tenant_a",
    }),
  ]);
});

test("combines scoped context and where filters in PostgreSQL reads", async () => {
  const client = new CaptureClient();
  const adapter = createPostgresJsonbStorageAdapter({
    client,
  });

  await adapter.all({
    definition: entities.libraries,
    name: "libraries",
  }, {
    tenantId: "tenant_a",
  }, {
    where: {
      meta: {
        tier: "gold",
      },
      status: "active",
    },
  });

  expect(client.queries[0]?.sql).toContain("record @> $1::jsonb");
  expect(client.queries[0]?.sql).toContain("record @> $2::jsonb");
  expect(client.queries[0]?.sql).toContain("record @> $3::jsonb");
  expect(client.queries[0]?.params).toEqual([
    JSON.stringify({
      meta: {
        tier: "gold",
      },
    }),
    JSON.stringify({
      status: "active",
    }),
    JSON.stringify({
      tenantId: "tenant_a",
    }),
  ]);
});

test("supports all-scope PostgreSQL reads with where filters", async () => {
  const client = new CaptureClient();
  const adapter = createPostgresJsonbStorageAdapter({
    client,
  });

  await adapter.all({
    definition: entities.libraries,
    name: "libraries",
  }, {}, {
    scope: "all",
    where: {
      status: "active",
    },
  });

  expect(client.queries[0]?.sql).toContain("record @> $1::jsonb");
  expect(client.queries[0]?.sql).not.toContain("tenantId");
  expect(client.queries[0]?.params).toEqual([
    JSON.stringify({
      status: "active",
    }),
  ]);
});

test("applies where filters to PostgreSQL count, hasAny, and byIds", async () => {
  const client = new CaptureClient();
  const adapter = createPostgresJsonbStorageAdapter({
    client,
  });
  const entity = {
    definition: entities.libraries,
    name: "libraries",
  };

  await adapter.count(entity, {
    tenantId: "tenant_a",
  }, {
    where: {
      status: "active",
    },
  });
  await adapter.hasAny(entity, {
    tenantId: "tenant_a",
  }, {
    where: {
      status: "active",
    },
  });
  await adapter.byIds(entity, ["lib_1", "lib_2"], {
    tenantId: "tenant_a",
  }, {
    where: {
      status: "active",
    },
  });

  expect(client.queries[0]?.sql).toContain("count(*)::int as count");
  expect(client.queries[0]?.params[0]).toBe(JSON.stringify({
    status: "active",
  }));
  expect(client.queries[1]?.sql).toContain("limit 1");
  expect(client.queries[2]?.sql).toContain("record->>'id' = any($2::text[])");
  expect(client.queries[2]?.params).toEqual([
    JSON.stringify({
      status: "active",
    }),
    [
      "lib_1",
      "lib_2",
    ],
    JSON.stringify({
      tenantId: "tenant_a",
    }),
  ]);
});

class CaptureClient implements PostgresStoreClient {
  readonly queries: Array<{
    params: unknown[];
    sql: string;
  }> = [];

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    this.queries.push({
      params,
      sql,
    });
    return {
      rows: sql.includes("count(*)") ? [
        {
          count: 0,
        } as T,
      ] : [],
    };
  }
}
