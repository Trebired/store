import { Pool } from "pg";
import type { EntityRegistry, NormalizedStoreLogger, PostgresStoreClient } from "#y31thwq3bdf0";
import { buildStoreLogGroup } from "#3ug859kbex8c";
import type {
  RuntimePostgresClient,
  RuntimePostgresQueryResult,
  RuntimePostgresQueryOptions,
  StoreRuntimePostgres,
  StoreRuntimePostgresOptions,
} from "./types.js";
import {
  quoteIdentifier,
  validatePostgresSchema,
  validateSqlIdentifier,
} from "#zeealawo10hg";
import {
  detectQueryCaller,
  redactDatabaseUrl,
  validateRuntimePostgresQuery,
} from "./postgres-safety.js";
import {
  createRuntimeMetricEvent,
  hashText,
  runtimeQueryErrorCode,
  summarizeSql,
} from "./sql.js";

const DEFAULT_SLOW_QUERY_MS = 250;
const POSTGRES_LOG_GROUP = buildStoreLogGroup("postgres");

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
  const schema = validatePostgresSchema(config.schema);
  const client = config.client || createPool(config, logger);
  let initPromise: Promise<void>|null = null;
  const postgres = {
    init: () => {
      initPromise = initPromise || initPostgres(client, schema, entities, config, logger);
      return initPromise;
    },
    query: <T = Record < string, unknown >> (sql: string, params: readonly unknown[] = [], queryOptions?: RuntimePostgresQueryOptions) => {
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
  logger?.info(POSTGRES_LOG_GROUP, "Postgres pool created.", {
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
): Promise<RuntimePostgresQueryResult<T>> {
  const invalid = validateQueryResult(sql, params, options);
  if (invalid) {
    return handleQueryError<T>(invalid, config);
  }
  const started = Date.now();
  const caller = detectQueryCaller();
  try {
    const result = await queryClient<T>(client, sql, params, caller, options, config, logger);
    logQuerySuccess(logger, sql, params, Date.now() - started, caller, options, config);
    void config.metrics?.(createRuntimeMetricEvent(Date.now() - started, options, true, rowCount(result)));
    return envelopeSuccess(result, config);
  } catch (error) {
    logger?.error(POSTGRES_LOG_GROUP, "Postgres query failed.", {
        caller,
        error,
        name: options?.name,
        operation: options?.operation,
    });
    void config.metrics?.(createRuntimeMetricEvent(Date.now() - started, options, false, 0));
    return handleQueryError<T>(error, config);
  }
}

async function queryClient<T>(
  client: RuntimePostgresClient,
  sql: string,
  params: readonly unknown[],
  caller: ReturnType<typeof detectQueryCaller>,
  options: RuntimePostgresQueryOptions | undefined,
  config: StoreRuntimePostgresOptions,
  logger: NormalizedStoreLogger | null,
) {
  if (!client.connect) {
    return client.query<T>(sql, [...params]);
  }
  const waitStarted = Date.now();
  const pooled = await client.connect();
  logPoolWait(client, Date.now() - waitStarted, caller, options, config, logger);
  try {
    return await pooled.query<T>(sql, [...params]);
  } finally {
    pooled.release?.();
  }
}

function envelopeSuccess<T>(
  result: { rows?: T[]; rowCount?: number },
  config: StoreRuntimePostgresOptions,
): RuntimePostgresQueryResult<T> {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return config.resultMode === "envelope" ? {
    ok: true,
    rowCount: rowCount(result),
    rows,
  } : {
    rowCount: rowCount(result),
    rows,
  };
}

function handleQueryError<T>(error: unknown, config: StoreRuntimePostgresOptions): RuntimePostgresQueryResult<T> {
  if (config.resultMode === "envelope") {
    return {
      error: true,
      error_code: errorCode(error),
      message: error instanceof Error ? error.message : String(error || "Postgres query failed."),
      ok: false,
      rowCount: 0,
      rows: [],
    };
  }
  throw error;
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
  for (const definition of Object.values(entities).filter((item) => item.storage === "postgres")) {
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
  await runInternal(
    client,
    `create index if not exists ${quoteIdentifier(`${tableInput}_record_gin_idx`)} on ${table} using gin (record)`,
    [],
    logger
  );
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
    logger?.info(POSTGRES_LOG_GROUP, message, {});
  }
}

function validateQueryResult(
  sql: string,
  params: readonly unknown[],
  options: RuntimePostgresQueryOptions | undefined,
): Error | null {
  try {
    validateRuntimePostgresQuery(sql, params, options);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
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
  logger?.[slow ? "warn" : "info"](POSTGRES_LOG_GROUP, slow ? "Postgres slow query completed." : "Postgres query completed.", {
      caller,
      elapsedMs,
      name: options?.name,
      operation: options?.operation,
      params: params.length,
      sql: summarizeSql(sql),
  });
}

function logPoolWait(
  client: RuntimePostgresClient,
  elapsedMs: number,
  caller: ReturnType<typeof detectQueryCaller>,
  options: RuntimePostgresQueryOptions | undefined,
  config: StoreRuntimePostgresOptions,
  logger: NormalizedStoreLogger | null,
): void {
  if (elapsedMs < 100) {
    return;
  }
  logger?.warn(POSTGRES_LOG_GROUP, "Postgres pool wait completed.", {
      caller,
      elapsedMs,
      idle: client.idleCount || 0,
      name: options?.name,
      operation: options?.operation,
      total: client.totalCount || 0,
      waiting: client.waitingCount || 0,
  });
  void config.metrics?.(createRuntimeMetricEvent(elapsedMs, options, true, 0));
}

function rowCount(result: { rows?: unknown[]; rowCount?: number }): number {
  return Number.isFinite(Number(result.rowCount)) ? Number(result.rowCount) : result.rows?.length || 0;
}

const errorCode = runtimeQueryErrorCode;

function attachPoolErrorLogger(client: RuntimePostgresClient, logger: NormalizedStoreLogger | null): void {
  client.on?.("error", (error) => {
      logger?.error(POSTGRES_LOG_GROUP, "Postgres pool error.", {
          error,
      });
  });
}

function tableName(schema: string, tableInput: string): string {
  const error = validateSqlIdentifier(tableInput);
  if (error) {
    throw new Error(error.message);
  }
  return `${quoteIdentifier(schema)}.${quoteIdentifier(tableInput)}`;
}

function validateSqlFragment(value: string): void {
  try {
    validateRuntimePostgresQuery(`select ${value}`, [], {
        allowLiterals: true,
        operation: "read",
    });
  } catch {
    throw new Error("Postgres index expression is not safe.");
  }
}

export {
  createRuntimePostgres,
};
