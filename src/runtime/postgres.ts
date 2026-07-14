import { Pool } from "pg";

import type { EntityRegistry, NormalizedStoreLogger, PostgresStoreClient } from "#y31thwq3bdf0";
import type {
  RuntimePostgresClient,
  RuntimePostgresQueryOptions,
  StoreRuntimePostgres,
  StoreRuntimePostgresOptions,
} from "./types.js";
import { quoteIdentifier, validatePlaceholderOrder, validateSqlIdentifier } from "#zeealawo10hg";

const DEFAULT_SLOW_QUERY_MS = 250;

function createRuntimePostgres(
  options: StoreRuntimePostgresOptions | undefined,
  entities: EntityRegistry,
  logger: NormalizedStoreLogger | null,
): {
  client: PostgresStoreClient;
  postgres: StoreRuntimePostgres;
  schema: string;
} {
  const config = options || {};
  const schema = validateSchema(config.schema);
  const client = config.client || createPool(config, logger);
  const postgres = {
    init: () => initPostgres(client, schema, entities, config, logger),
    query: <T = Record<string, unknown>>(sql: string, params: readonly unknown[] = [], queryOptions?: RuntimePostgresQueryOptions) => {
      return runQuery<T>(client, sql, params, queryOptions, config, logger);
    },
  };

  attachPoolErrorLogger(client, logger);
  return {
    client: createStorageClient(client, config, logger),
    postgres,
    schema,
  };
}

function createStorageClient(
  client: RuntimePostgresClient,
  config: StoreRuntimePostgresOptions,
  logger: NormalizedStoreLogger | null,
): PostgresStoreClient {
  return {
    query: (sql, params = []) => runQuery(client, sql, params, {
      allowLiterals: true,
      operation: sql.trim().toLowerCase().startsWith("select") ? "read" : "write",
    }, config, logger),
  };
}

function createPool(options: StoreRuntimePostgresOptions, logger: NormalizedStoreLogger | null): RuntimePostgresClient {
  const pool = new Pool({
    connectionString: options.databaseUrl,
    connectionTimeoutMillis: options.pool?.connectionTimeoutMs,
    idleTimeoutMillis: options.pool?.idleTimeoutMs,
    max: options.pool?.max,
    statement_timeout: options.pool?.statementTimeoutMs,
  });
  logger?.info("store.postgres", "Postgres pool created.", {
    databaseUrl: redactDatabaseUrl(options.databaseUrl),
    pool: options.pool || {},
  });
  return pool;
}

async function runQuery<T>(
  client: RuntimePostgresClient,
  sql: string,
  params: readonly unknown[],
  options: RuntimePostgresQueryOptions | undefined,
  config: StoreRuntimePostgresOptions,
  logger: NormalizedStoreLogger | null,
): Promise<{ rows: T[] }> {
  validateRuntimePostgresQuery(sql, params, options);
  const started = Date.now();
  const caller = detectQueryCaller();
  try {
    const result = await client.query<T>(sql, [...params]);
    logQuerySuccess(logger, sql, params, Date.now() - started, caller, options, config);
    return result;
  } catch (error) {
    logger?.error("store.postgres", "Postgres query failed.", {
      caller,
      error,
      name: options?.name,
      operation: options?.operation,
    });
    throw error;
  }
}

async function initPostgres(
  client: RuntimePostgresClient,
  schema: string,
  entities: EntityRegistry,
  options: StoreRuntimePostgresOptions,
  logger: NormalizedStoreLogger | null,
): Promise<void> {
  await runInternal(client, "select 1", [], logger, "Postgres first connection succeeded.");
  await runInternal(client, `create schema if not exists ${quoteIdentifier(schema)}`, [], logger);
  for (const definition of Object.values(entities)) {
    await createEntityTable(client, schema, definition.table, logger);
  }
  for (const index of options.indexes || []) {
    await createExpressionIndex(client, schema, index.table, index.expression, index.name, index.method || "btree", logger);
  }
  for (const migrate of options.migrations || []) {
    await migrate({
      query: (sql, params = []) => runQuery(client, sql, params, {
        allowLiterals: true,
        operation: "migration",
      }, options, logger),
      schema,
    });
  }
}

async function createEntityTable(
  client: RuntimePostgresClient,
  schema: string,
  tableInput: string,
  logger: NormalizedStoreLogger | null,
): Promise<void> {
  const table = tableName(schema, tableInput);
  await runInternal(client, `create table if not exists ${table} (id text primary key, record jsonb not null)`, [], logger);
  await runInternal(client, `create index if not exists ${quoteIdentifier(`${tableInput}_record_gin_idx`)} on ${table} using gin (record)`, [], logger);
}

async function createExpressionIndex(
  client: RuntimePostgresClient,
  schema: string,
  tableInput: string,
  expression: string,
  name: string | undefined,
  method: "btree" | "gin",
  logger: NormalizedStoreLogger | null,
): Promise<void> {
  validateSqlFragment(expression);
  const indexName = name || `${tableInput}_${hashText(expression)}_idx`;
  const sql = `create index if not exists ${quoteIdentifier(indexName)} on ${tableName(schema, tableInput)} using ${method} (${expression})`;
  await runInternal(client, sql, [], logger);
}

async function runInternal(
  client: RuntimePostgresClient,
  sql: string,
  params: readonly unknown[],
  logger: NormalizedStoreLogger | null,
  message?: string,
): Promise<void> {
  await client.query(sql, [...params]);
  if (message) {
    logger?.info("store.postgres", message, {});
  }
}

function validateRuntimePostgresQuery(
  sql: string,
  params: readonly unknown[] = [],
  options: RuntimePostgresQueryOptions = {},
): void {
  if (!sql.trim()) {
    throw new Error("Postgres query cannot be empty.");
  }
  if (hasSqlComment(sql)) {
    throw new Error("Postgres application queries cannot contain SQL comments.");
  }
  if (hasMultipleStatements(sql)) {
    throw new Error("Postgres application queries cannot contain multiple statements.");
  }
  const placeholder = validatePlaceholderOrder(sql, [...params]);
  if (placeholder) {
    throw new Error(placeholder.message);
  }
  if ((options.operation === "read" || options.operation === "write") && !options.allowLiterals && hasInlineStringLiteral(sql)) {
    throw new Error("Postgres read/write queries cannot contain inline string literals.");
  }
}

function logQuerySuccess(
  logger: NormalizedStoreLogger | null,
  sql: string,
  params: readonly unknown[],
  elapsedMs: number,
  caller: ReturnType<typeof detectQueryCaller>,
  options: RuntimePostgresQueryOptions | undefined,
  config: StoreRuntimePostgresOptions,
): void {
  const slow = elapsedMs >= (config.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS);
  if (!slow && !config.logOperations) {
    return;
  }

  logger?.[slow ? "warn" : "info"]("store.postgres", slow ? "Postgres slow query completed." : "Postgres query completed.", {
    caller,
    elapsedMs,
    name: options?.name,
    operation: options?.operation,
    params: params.length,
    sql: summarizeSql(sql),
  });
}

function attachPoolErrorLogger(client: RuntimePostgresClient, logger: NormalizedStoreLogger | null): void {
  client.on?.("error", (error) => {
    logger?.error("store.postgres", "Postgres pool error.", {
      error,
    });
  });
}

function redactDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "redacted";
    }
    if (url.username) {
      url.username = "redacted";
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:@/]+)(?::([^@/]+))?@/u, "://redacted:redacted@");
  }
}

function detectQueryCaller(): { file?: string; line?: number } {
  const stack = new Error().stack?.split("\n").slice(2) || [];
  const frame = stack.find((line) => !line.includes("/runtime/postgres."));
  const match = frame?.match(/(?:\()?(.*):(\d+):(\d+)\)?$/u);
  return {
    file: match?.[1],
    line: match?.[2] ? Number(match[2]) : undefined,
  };
}

function validateSchema(schemaInput?: string): string {
  const schema = schemaInput || "public";
  const error = validateSqlIdentifier(schema);
  if (error) {
    throw new Error(error.message);
  }
  return schema;
}

function tableName(schema: string, tableInput: string): string {
  const error = validateSqlIdentifier(tableInput);
  if (error) {
    throw new Error(error.message);
  }
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableInput)}`;
}

function hasSqlComment(sql: string): boolean {
  return /--|\/\*/u.test(sql);
}

function hasMultipleStatements(sql: string): boolean {
  return sql.trim().replace(/;$/u, "").includes(";");
}

function hasInlineStringLiteral(sql: string): boolean {
  return /'([^']|'')*'/u.test(sql);
}

function validateSqlFragment(value: string): void {
  if (!value.trim() || hasSqlComment(value) || hasMultipleStatements(value)) {
    throw new Error("Postgres index expression is not safe.");
  }
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim().slice(0, 240);
}

function hashText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export {
  createRuntimePostgres,
  detectQueryCaller,
  redactDatabaseUrl,
  validateRuntimePostgresQuery,
};
