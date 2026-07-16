import type {
  EntityRegistry,
  NormalizedStoreLogger,
} from "#y31thwq3bdf0";
import { quoteIdentifier, validateSqlIdentifier } from "#zeealawo10hg";
import { detectQueryCaller } from "./postgres-safety.js";
import type { SqliteDatabase } from "#qmu6u0jug6cv";
import type {
  RuntimeSqliteQueryOptions,
  RuntimeSqliteQueryResult,
  StoreRuntimeSqlite,
  StoreRuntimeSqliteOptions,
} from "./sqlite/types.js";

const DEFAULT_SLOW_QUERY_MS = 250;
function createRuntimeSqlite(
  options: StoreRuntimeSqliteOptions | undefined,
  entities: EntityRegistry,
  logger: NormalizedStoreLogger | null,
): {
  client: SqliteDatabase | null;
  sqlite: StoreRuntimeSqlite;
} {
  const config = options || {};
  const client = options ? resolveDatabase(config, logger) : null;
  let initPromise: Promise<void> | null = null;
  return {
    client,
    sqlite: {
      init: async () => {
        if (!client) return;
        initPromise = initPromise || initSqlite(client, entities, config, logger);
        return initPromise;
      },
      query: (sql, params = [], queryOptions) => runQuery(client, sql, params, queryOptions, config, logger),
    },
  };
}

function resolveDatabase(options: StoreRuntimeSqliteOptions, logger: NormalizedStoreLogger | null): SqliteDatabase {
  if (options.database) return options.database;
  if (options.path) {
    logger?.info("trebired.store.sqlite", "SQLite database configured.", {
      path: options.path,
    });
    return createLazyBunSqliteDatabase(options.path);
  }
  throw new Error("SQLite runtime requires a database or path.");
}

function createLazyBunSqliteDatabase(path: string): SqliteDatabase {
  let promise: Promise<SqliteDatabase> | null = null;
  const load = async () => {
    promise = promise || import("bun:sqlite").then((mod) => new mod.Database(path) as SqliteDatabase);
    return promise;
  };
  return {
    all: async <T>(sql: string, params: readonly unknown[] = []) => {
      const statement = (await load()).query?.(sql) as { all(...input: unknown[]): T[] } | undefined;
      return statement?.all(...params) || [];
    },
    get: async <T>(sql: string, params: readonly unknown[] = []) => {
      const statement = (await load()).query?.(sql) as { get?(...input: unknown[]): T | null | undefined } | undefined;
      return statement?.get?.(...params);
    },
    run: async (sql: string, params: readonly unknown[] = []) => {
      const statement = (await load()).query?.(sql) as { run?(...input: unknown[]): unknown } | undefined;
      await statement?.run?.(...params);
      return {};
    },
  };
}

async function runQuery<T>(
  client: SqliteDatabase | null,
  sql: string,
  params: readonly unknown[],
  options: RuntimeSqliteQueryOptions | undefined,
  config: StoreRuntimeSqliteOptions,
  logger: NormalizedStoreLogger | null,
): Promise<RuntimeSqliteQueryResult<T>> {
  const invalid = validateQueryResult(sql, params, options);
  if (invalid) return handleQueryError<T>(invalid, config);
  if (!client) return handleQueryError<T>(new Error("SQLite runtime is not configured."), config);
  const started = Date.now();
  const caller = detectQueryCaller();
  try {
    const result = await queryClient<T>(client, sql, params, options);
    logQuerySuccess(logger, sql, params, Date.now() - started, caller, options, config);
    void config.metrics?.(metricEvent(Date.now() - started, options, true, result.rowCount));
    return envelopeSuccess(result.rows, result.rowCount, config);
  } catch (error) {
    logger?.error("trebired.store.sqlite", "SQLite query failed.", {
      caller,
      error,
      name: options?.name,
      operation: options?.operation,
    });
    void config.metrics?.(metricEvent(Date.now() - started, options, false, 0));
    return handleQueryError<T>(error, config);
  }
}

async function queryClient<T>(
  client: SqliteDatabase,
  sql: string,
  params: readonly unknown[],
  options: RuntimeSqliteQueryOptions | undefined,
): Promise<{ rows: T[]; rowCount: number }> {
  if ((options?.operation || inferOperation(sql)) === "read") {
    const rows = await sqliteAll<T>(client, sql, params);
    return {
      rowCount: rows.length,
      rows,
    };
  }
  const result = await sqliteRun(client, sql, params);
  return {
    rowCount: Number(result.changes || 0),
    rows: [],
  };
}

async function initSqlite(
  client: SqliteDatabase,
  entities: EntityRegistry,
  options: StoreRuntimeSqliteOptions,
  logger: NormalizedStoreLogger | null,
): Promise<void> {
  await runInternal(client, "select 1", [], logger, "SQLite first query succeeded.");
  for (const definition of Object.values(entities).filter((item) => item.storage === "sqlite")) {
    await createEntityTable(client, definition.table);
  }
  for (const index of options.indexes || []) {
    await createExpressionIndex(client, index.table, index.expression, index.name);
  }
  for (const migrate of options.migrations || []) {
    await migrate({
      query: (sql, params = []) => runQuery(client, sql, params, {
        allowLiterals: true,
        operation: "migration",
      }, options, logger),
    });
  }
}

async function createEntityTable(client: SqliteDatabase, tableInput: string): Promise<void> {
  await sqliteRun(client, `create table if not exists ${tableName(tableInput)} (id text primary key, record text not null)`, []);
}

async function createExpressionIndex(
  client: SqliteDatabase,
  tableInput: string,
  expression: string,
  name: string | undefined,
): Promise<void> {
  validateSqlFragment(expression);
  const indexName = name || `${tableInput}_${hashText(expression)}_idx`;
  const sql = `create index if not exists ${quoteIdentifier(indexName)} on ${tableName(tableInput)} (${expression})`;
  await sqliteRun(client, sql, []);
}

async function runInternal(
  client: SqliteDatabase,
  sql: string,
  params: readonly unknown[],
  logger: NormalizedStoreLogger | null,
  message?: string,
): Promise<void> {
  await sqliteAll(client, sql, params);
  if (message) logger?.info("trebired.store.sqlite", message, {});
}

function validateRuntimeSqliteQuery(
  sql: string,
  params: readonly unknown[],
  options: RuntimeSqliteQueryOptions | undefined,
): void {
  const text = sql.trim();
  if (!text) throw new Error("SQLite query must not be empty.");
  if (/--|\/\*/u.test(text)) throw new Error("SQLite query comments are forbidden.");
  if (hasMultipleStatements(text)) throw new Error("SQLite query must not contain multiple statements.");
  if (!options?.allowLiterals && (options?.operation === "read" || options?.operation === "write") && /'[^']*'/u.test(text)) {
    throw new Error("SQLite read/write queries must not contain inline string literals.");
  }
  validateQuestionPlaceholders(text, params);
  validateNumericPlaceholders(text, params);
}

function validateQuestionPlaceholders(sql: string, params: readonly unknown[]): void {
  const questionCount = (sql.match(/\?/gu) || []).length;
  if (questionCount > 0 && questionCount !== params.length) {
    throw new Error("SQLite placeholder count does not match parameter count.");
  }
}

function validateNumericPlaceholders(sql: string, params: readonly unknown[]): void {
  const placeholders = [...sql.matchAll(/\$(\d+)/gu)].map((match) => Number(match[1]));
  if (placeholders.length === 0) return;
  const expected = [...new Set(placeholders)].sort((a, b) => a - b);
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== index + 1) {
      throw new Error("SQLite placeholders must be contiguous and 1-based.");
    }
  }
  if (expected.length !== params.length) {
    throw new Error("SQLite placeholder count does not match parameter count.");
  }
}

function hasMultipleStatements(sql: string): boolean {
  return sql.replace(/;\s*$/u, "").includes(";");
}

function validateQueryResult(
  sql: string,
  params: readonly unknown[],
  options: RuntimeSqliteQueryOptions | undefined,
): Error | null {
  try {
    validateRuntimeSqliteQuery(sql, params, options);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function handleQueryError<T>(error: unknown, config: StoreRuntimeSqliteOptions): RuntimeSqliteQueryResult<T> {
  if (config.resultMode === "envelope") {
    return {
      error: true,
      error_code: errorCode(error),
      message: error instanceof Error ? error.message : String(error || "SQLite query failed."),
      ok: false,
      rowCount: 0,
      rows: [],
    };
  }
  throw error;
}

function envelopeSuccess<T>(rows: T[], rowCount: number, config: StoreRuntimeSqliteOptions): RuntimeSqliteQueryResult<T> {
  return config.resultMode === "envelope" ? {
    ok: true,
    rowCount,
    rows,
  } : {
    rowCount,
    rows,
  };
}

function logQuerySuccess(
  logger: NormalizedStoreLogger | null,
  sql: string,
  params: readonly unknown[],
  elapsedMs: number,
  caller: ReturnType<typeof detectQueryCaller>,
  options: RuntimeSqliteQueryOptions | undefined,
  config: StoreRuntimeSqliteOptions,
): void {
  const slow = elapsedMs >= (config.slowQueryMs ?? DEFAULT_SLOW_QUERY_MS);
  if (!slow && !config.logOperations) return;
  logger?.[slow ? "warn" : "info"]("trebired.store.sqlite", slow ? "SQLite slow query completed." : "SQLite query completed.", {
    caller,
    elapsedMs,
    name: options?.name,
    operation: options?.operation,
    params: params.length,
    sql: summarizeSql(sql),
  });
}

function metricEvent(
  elapsedMs: number,
  options: RuntimeSqliteQueryOptions | undefined,
  success: boolean,
  rowCount: number,
) {
  return {
    elapsedMs,
    name: options?.name,
    operation: options?.operation,
    rowCount,
    success,
  };
}

async function sqliteAll<T>(database: SqliteDatabase, sql: string, params: readonly unknown[]): Promise<T[]> {
  if (database.all) return database.all<T>(sql, [...params]);
  const statement = database.query?.(sql) || database.prepare?.(sql);
  if (!statement) throw new Error("SQLite database must provide all, query, or prepare methods.");
  return (statement as { all(...input: unknown[]): T[] | Promise<T[]> }).all(...params);
}

async function sqliteRun(database: SqliteDatabase, sql: string, params: readonly unknown[]) {
  if (database.run) return database.run(sql, [...params]);
  if (params.length === 0 && database.exec) {
    await database.exec(sql);
    return {};
  }
  const statement = database.query?.(sql) || database.prepare?.(sql);
  const runnable = statement as { run?(...input: unknown[]): Promise<{ changes?: number }> | { changes?: number } } | undefined;
  if (!runnable?.run) throw new Error("SQLite database must provide run, query, or prepare methods.");
  return runnable.run(...params);
}

function inferOperation(sql: string): RuntimeSqliteQueryOptions["operation"] {
  return sql.trim().toLowerCase().startsWith("select") ? "read" : "write";
}

function tableName(tableInput: string): string {
  const error = validateSqlIdentifier(tableInput);
  if (error) throw new Error(error.message);
  return quoteIdentifier(tableInput);
}

function validateSqlFragment(value: string): void {
  if (!value.trim() || /--|\/\*|;/u.test(value)) {
    throw new Error("SQLite index expression is not safe.");
  }
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/gu, " ").trim().slice(0, 240);
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  if (message.includes("empty")) return "query-empty";
  if (message.includes("multiple")) return "query-multi-statement";
  if (message.includes("comment")) return "query-comments-forbidden";
  if (message.includes("placeholder")) return "query-placeholder-mismatch";
  if (message.includes("literal")) return "query-literal-forbidden";
  return "query-failed";
}

function hashText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export {
  createRuntimeSqlite,
  validateRuntimeSqliteQuery,
};
