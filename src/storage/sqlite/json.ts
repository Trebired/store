import type {
  ResolvedEntity,
  StorageAdapter,
  StorageReadOptions,
  StoreContext,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";
import { isPlainObject } from "#yfg488ybfy5n";
import { quoteIdentifier, validateSqlIdentifier } from "#zeealawo10hg";
import {
  applyStorageContext,
  buildStorageWhere,
} from "#9193g93dz8pe";
import { ensureSqliteRecordTable } from "./table.js";
import type { SqliteDatabase, SqliteJsonAdapterOptions } from "./types.js";

type Row = {
  id: string;
  record: string;
};

const JSON_FIELD = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u;

function createSqliteJsonStorageAdapter(options: SqliteJsonAdapterOptions): StorageAdapter {
  return {
    all: (entity, context, readOptions) => queryMany(options.database, entity, {}, context, readOptions),
    by: async(entity, where, context, readOptions) => {
      const rows = await queryMany(options.database, entity, where, context, readOptions, 1);
      return rows[0] ?? null;
    },
    byIds: (entity, ids, context, readOptions) => queryMany(options.database, entity, { id: ids }, context, readOptions),
    count: async(entity, context, readOptions) => {
      const sql = buildSelectSql(entity, {}, context, readOptions, "count(*) as count", undefined, false);
      const row = await sqliteGet<{count:number}>(options.database, sql.text, sql.params);
      return Number(row?.count || 0);
    },
    hasAny: async(entity, context, readOptions) => {
      const rows = await queryMany(options.database, entity, {}, context, readOptions, 1);
      return rows.length > 0;
    },
    put: async(entity, context, record) => {
      const stored = applyContext(record, entity, context);
      const sql = `insert into ${tableName(entity)} (id, record) values (?, ?)
      on conflict(id) do update set record = excluded.record`;
      await sqliteRun(options.database, sql, [stored.id, stringifyRecord(stored)]);
      return stored;
    },
    remove: (entity, context, id, readOptions) => removeOne(options.database, entity, context, id, readOptions),
    removeMany: (entity, context, ids, readOptions) => removeMany(options.database, entity, context, ids, readOptions),
    ensureReadyFor: (entity) => ensureSqliteRecordTable(options.database, tableName(entity), sqliteRun),
  };
}

async function removeOne(
  database: SqliteDatabase,
  entity: ResolvedEntity,
  context: StoreContext,
  id: string,
  readOptions?: StorageReadOptions,
): Promise<boolean> {
  const result = await deleteRows(database, entity, context, {
      id,
    }, readOptions);
  return result.length > 0;
}

async function removeMany(
  database: SqliteDatabase,
  entity: ResolvedEntity,
  context: StoreContext,
  ids: string[],
  readOptions?: StorageReadOptions,
) {
  const result = await deleteRows(database, entity, context, {
      id: ids,
    }, readOptions);
  return {
    ids,
    missing: ids.length - result.length,
    removed: result.length,
    requested: ids.length,
  };
}

async function deleteRows(
  database: SqliteDatabase,
  entity: ResolvedEntity,
  context: StoreContext,
  whereInput: StoreWhere,
  readOptions?: StorageReadOptions,
): Promise<{id:string}[]> {
  const where = buildStorageWhere(entity, whereInput, context, readOptions, pushJsonFilter);
  const select = `select id from ${tableName(entity)} ${where.sql}`;
  const rows = await sqliteAll<{id:string}>(database, select, where.params);
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => "?").join(", ");
  await sqliteRun(database, `delete from ${tableName(entity)} where id in (${placeholders})`, rows.map((row) => row.id));
  return rows;
}

async function queryMany(
  database: SqliteDatabase,
  entity: ResolvedEntity,
  where: StoreWhere,
  context: StoreContext,
  readOptions?: StorageReadOptions,
  limit?: number,
): Promise<StoreRecord[]> {
  const sql = buildSelectSql(entity, where, context, readOptions, "id, record", limit);
  const result = await sqliteAll<Row>(database, sql.text, sql.params);
  return result.map(normalizeRow);
}

function buildSelectSql(
  entity: ResolvedEntity,
  where: StoreWhere,
  context: StoreContext,
  options: StorageReadOptions | undefined,
  select = "id, record",
  limit?: number,
  includeSort = true,
): {
  params: unknown[];
  text: string;
} {
  const clause = buildStorageWhere(entity, where, context, options, pushJsonFilter);
  const order = includeSort ? buildOrderBy(options?.sort || []) : "";
  const bounded = normalizeLimit(limit ?? options?.limit);
  const limitClause = bounded === null ? "" : ` limit ${bounded}`;
  return {
    params: clause.params,
    text: `select ${select} from ${tableName(entity)} ${clause.sql}${order}${limitClause}`,
  };
}

function pushJsonFilter(parts: string[], params: unknown[], field: string, value: unknown): void {
  if (field === "id") {
    pushIdFilter(parts, params, value);
    return;
  }
  const path = jsonPath(field);
  if (Array.isArray(value)) {
    const placeholders = value.map(() => "?").join(", ");
    parts.push(`json_extract(record, '${path}') in (${placeholders})`);
    params.push(...value.map(normalizeFilterValue));
    return;
  }
  if (isPlainObject(value)) {
    for (const [child, childValue] of Object.entries(value)) {
      pushJsonFilter(parts, params, `${field}.${child}`, childValue);
    }
    return;
  }
  parts.push(`json_extract(record, '${path}') = ?`);
  params.push(normalizeFilterValue(value));
}

function pushIdFilter(parts: string[], params: unknown[], value: unknown): void {
  if (Array.isArray(value)) {
    const placeholders = value.map(() => "?").join(", ");
    parts.push(`id in (${placeholders})`);
    params.push(...value);
    return;
  }
  parts.push("id = ?");
  params.push(value);
}

function buildOrderBy(sort: readonly string[]): string {
  if (sort.length === 0) return "";
  const parts = sort.map((spec) => {
      const [field, direction] = spec.split(":");
      if (direction !== "asc" && direction !== "desc") {
        throw new Error("SQLite JSON adapter sort direction must be asc or desc.");
      }
      return `json_extract(record, '${jsonPath(field || "")}') ${direction}`;
  });
  return ` order by ${parts.join(", ")}`;
}

function normalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) return null;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("SQLite JSON adapter limit must be a non-negative integer.");
  }
  return limit;
}

function tableName(entity: ResolvedEntity): string {
  const error = validateSqlIdentifier(entity.definition.table);
  if (error) throw new Error(error.message);
  return quoteIdentifier(entity.definition.table);
}

function jsonPath(field: string): string {
  if (!JSON_FIELD.test(field)) {
    throw new Error(`Invalid SQLite JSON field path: ${field}`);
  }
  return `$.${field.split(".").join(".")}`;
}

const applyContext = applyStorageContext;

function normalizeRow(row: Row): StoreRecord {
  try {
    const parsed = JSON.parse(row.record) as StoreRecord;
    return {
      ...parsed,
      id: parsed.id || row.id,
    };
  } catch (error) {
    throw new Error(`SQLite JSON adapter could not parse stored record ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stringifyRecord(record: StoreRecord): string {
  try {
    return JSON.stringify(record);
  } catch (error) {
    throw new Error(`SQLite JSON adapter could not stringify record ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeFilterValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return null;
  return value;
}

async function sqliteAll<T>(database: SqliteDatabase, sql: string, params: readonly unknown[]): Promise<T[]> {
  if (database.all) return database.all<T>(sql, [...params]);
  const statement = prepare<T>(database, sql);
  return statement.all(...params);
}

async function sqliteGet<T>(database: SqliteDatabase, sql: string, params: readonly unknown[]): Promise<T|null|undefined> {
  if (database.get) return database.get<T>(sql, [...params]);
  const statement = prepare<T>(database, sql);
  if (statement.get) return statement.get(...params);
  const rows = await statement.all(...params);
  return rows[0];
}

async function sqliteRun(database: SqliteDatabase, sql: string, params: readonly unknown[]): Promise<void> {
  if (database.run) {
    await database.run(sql, [...params]);
    return;
  }
  if (params.length === 0 && database.exec) {
    await database.exec(sql);
    return;
  }
  const statement = prepare(database, sql);
  if (statement.run) {
    await statement.run(...params);
    return;
  }
  await statement.all(...params);
}

function prepare<T>(database: SqliteDatabase, sql: string) {
  const statement = database.query?.(sql) || database.prepare?.(sql);
  if (!statement) {
    throw new Error("SQLite database must provide query, prepare, all/get, or run methods.");
  }
  return statement as {
    all(...params: unknown[]): Promise<T[]>|T[];
    get ? (...params: unknown[]) : Promise<T|null|undefined>|T | null | undefined;
    run ? (...params: unknown[]) : Promise<unknown>|unknown;
  };
}

export {
  createSqliteJsonStorageAdapter,
};
