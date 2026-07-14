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
  expect(client.queries[0]?.sql).toContain("record->>'id' = $1");
  expect(client.queries[0]?.sql).toContain("record->>'tenantId' = $2");
  expect(client.queries[0]?.params).toEqual(["lib_1", "tenant_a"]);
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
      rows: [],
    };
  }
}
