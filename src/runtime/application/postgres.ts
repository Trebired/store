import { toFiniteNumber, toObject, toTrimmedString } from "@trebired/utils";

import type {
  RuntimePostgresIndex,
  StoreRuntimePostgresOptions,
} from "#pq1c0xwc48qu";
import type {
  StoreApplicationEnv,
  StoreApplicationRuntimeOptions,
  StorePostgresIndexMap,
} from "./types.js";

const DEFAULT_POSTGRES_POOL_MAX = 20;
const DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_POSTGRES_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS = 0;
const DEFAULT_POSTGRES_SLOW_QUERY_MS = 250;

function createApplicationPostgresOptions(
  options: StoreApplicationRuntimeOptions,
): StoreRuntimePostgresOptions | undefined {
  if (options.postgres === false) {
    return undefined;
  }

  const postgres = options.postgres || {};
  const env = options.env || {};
  return {
    client: postgres.client,
    databaseUrl: postgres.databaseUrl ?? envText(env, "DATABASE_URL"),
    indexes: [
      ...normalizePostgresIndexMap(options.indexMap),
      ...normalizePostgresIndexMap(postgres.indexMap),
      ...(postgres.indexes || []),
    ],
    logOperations: postgres.logOperations ?? envText(env, "STORE_LOG_OPS").trim() === "1",
    logSql: postgres.logSql ?? envText(env, "STORE_LOG_SQL").trim() === "1",
    logger: postgres.logger,
    metrics: postgres.metrics,
    migrations: postgres.migrations,
    pool: {
      connectionTimeoutMs: postgres.pool?.connectionTimeoutMs ?? envNumber(
        env,
        "PGPOOL_CONNECTION_TIMEOUT_MS",
        DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
        0,
      ),
      idleTimeoutMs: postgres.pool?.idleTimeoutMs ?? envNumber(
        env,
        "PGPOOL_IDLE_TIMEOUT_MS",
        DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
        0,
      ),
      max: postgres.pool?.max ?? envNumber(env, "PGPOOL_MAX", DEFAULT_POSTGRES_POOL_MAX, 1),
      statementTimeoutMs: postgres.pool?.statementTimeoutMs ?? envNumber(
        env,
        "PG_STATEMENT_TIMEOUT_MS",
        DEFAULT_POSTGRES_STATEMENT_TIMEOUT_MS,
        0,
      ),
    },
    resultMode: postgres.resultMode || "envelope",
    schema: postgres.schema || "public",
    slowQueryMs: postgres.slowQueryMs ?? envNumber(env, "DB_SLOW_MS", DEFAULT_POSTGRES_SLOW_QUERY_MS, 0),
  };
}

function normalizePostgresIndexMap(indexMap: StorePostgresIndexMap | null | undefined): RuntimePostgresIndex[] {
  return Object.entries(indexMap || {}).flatMap(([table, indexes]) =>
    indexes.map((index) => ({
          expression: index.expression || index.expr || "",
          method: index.method,
          name: index.name,
          table,
    })).filter((index) => index.expression));
}

function envText(env: StoreApplicationEnv, key: string): string {
  return toTrimmedString(toObject(env)[key]);
}

function envNumber(env: StoreApplicationEnv, key: string, fallback: number, min: number): number {
  const value = toFiniteNumber(envText(env, key));
  if (value == null) return fallback;
  return Math.max(min, Math.trunc(value));
}

export {
  createApplicationPostgresOptions,
  normalizePostgresIndexMap,
};
