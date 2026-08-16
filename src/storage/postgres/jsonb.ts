import type {
  PostgresJsonbAdapterOptions,
  ResolvedEntity,
  StorageAdapter,
  StorageReadOptions,
  StoreContext,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";
import { isPlainObject } from "#yfg488ybfy5n";
import {
  applyStorageContext,
  buildStorageWhere,
} from "#9193g93dz8pe";
import {
  quoteIdentifier,
  validatePlaceholderOrder,
  validatePostgresSchema,
  validateSqlIdentifier,
} from "./validation.js";

type Row = {
  id: string;
  record: StoreRecord;
};

function createPostgresJsonbStorageAdapter(options: PostgresJsonbAdapterOptions): StorageAdapter {
  const schema = validatePostgresSchema(options.schema);

  return {
    all: (entity, context, readOptions) => queryMany(options, schema, entity, {}, context, readOptions),
    by: async(entity, where, context, readOptions) => {
      const rows = await queryMany(options, schema, entity, where, context, readOptions, 1);
      return rows[0] ?? null;
    },
    byIds: (entity, ids, context, readOptions) => queryMany(options, schema, entity, { id: ids }, context, readOptions),
    count: async(entity, context, readOptions) => {
      const sql = buildSelectSql(schema, entity, {}, context, readOptions, "count(*)::int as count", undefined, false);
      const result = await options.client.query<{count:number}>(sql.text, sql.params);
      return Number(result.rows[0]?.count || 0);
    },
    hasAny: async(entity, context, readOptions) => {
      const rows = await queryMany(options, schema, entity, {}, context, readOptions, 1);
      return rows.length > 0;
    },
    put: async(entity, context, record) => {
      const table = qualifiedTable(schema, entity);
      const stored = applyContext(record, entity, context);
      const storedJson = JSON.stringify(stored);
      const sql = `insert into ${table} (id, record) values ($1, $2::jsonb)
      on conflict (id) do update set record = excluded.record
      returning id, record`;
      assertPlaceholders(sql, [stored.id, storedJson]);
      const result = await options.client.query<Row>(sql, [stored.id, storedJson]);
      return normalizeRow(result.rows[0]);
    },
    remove: (entity, context, id, readOptions) => removeOne(options, schema, entity, context, id, readOptions),
    removeMany: (entity, context, ids, readOptions) => removeMany(options, schema, entity, context, ids, readOptions),
    ensureReadyFor: (entity) => ensureReadyFor(options, schema, entity),
  };
}

async function removeOne(
  options: PostgresJsonbAdapterOptions,
  schema: string,
  entity: ResolvedEntity,
  context: StoreContext,
  id: string,
  readOptions?: StorageReadOptions,
): Promise<boolean> {
  const result = await deleteRows(options, schema, entity, context, {
      id,
    }, readOptions);
  return result.rows.length > 0;
}

async function removeMany(
  options: PostgresJsonbAdapterOptions,
  schema: string,
  entity: ResolvedEntity,
  context: StoreContext,
  ids: string[],
  readOptions?: StorageReadOptions,
) {
  const result = await deleteRows(options, schema, entity, context, {
      id: ids,
    }, readOptions);
  return {
    ids,
    missing: ids.length - result.rows.length,
    removed: result.rows.length,
    requested: ids.length,
  };
}

async function deleteRows(
  options: PostgresJsonbAdapterOptions,
  schema: string,
  entity: ResolvedEntity,
  context: StoreContext,
  whereInput: StoreWhere,
  readOptions?: StorageReadOptions,
) {
  const table = qualifiedTable(schema, entity);
  const where = buildStorageWhere(entity, whereInput, context, readOptions, pushJsonFilter);
  const sql = `delete from ${table} ${where.sql} returning id`;
  assertPlaceholders(sql, where.params);
  return options.client.query<{id:string}>(sql, where.params);
}

async function ensureReadyFor(
  options: PostgresJsonbAdapterOptions,
  schema: string,
  entity: ResolvedEntity,
): Promise<void> {
  const table = qualifiedTable(schema, entity);
  const sql = `create table if not exists ${table} (id text primary key, record jsonb not null)`;
  await options.client.query(sql, []);
}

function buildSelectSql(
  schema: string,
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
  const table = qualifiedTable(schema, entity);
  const clause = buildStorageWhere(entity, where, context, options, pushJsonFilter);
  const order = includeSort ? buildOrderBy(options?.sort || []) : "";
  const bounded = normalizeLimit(limit ?? options?.limit);
  const limitClause = bounded === null ? "" : ` limit ${bounded}`;
  const text = `select ${select} from ${table} ${clause.sql}${order}${limitClause}`;
  assertPlaceholders(text, clause.params);
  return {
    params: clause.params,
    text,
  };
}

async function queryMany(
  options: PostgresJsonbAdapterOptions,
  schema: string,
  entity: ResolvedEntity,
  where: StoreWhere,
  context: StoreContext,
  readOptions?: StorageReadOptions,
  limit?: number,
): Promise<StoreRecord[]> {
  const sql = buildSelectSql(schema, entity, where, context, readOptions, "id, record", limit);
  const result = await options.client.query<Row>(sql.text, sql.params);
  return result.rows.map(normalizeRow);
}

function buildOrderBy(sort: readonly string[]): string {
  if (sort.length === 0) {
    return "";
  }

  const parts = sort.map((spec) => {
      const [field, direction] = spec.split(":");
      const err = validateSqlIdentifier(field || "");
      if (err) {
        throw new Error(err.message);
      }
      if (direction !== "asc" && direction !== "desc") {
        throw new Error("PostgreSQL JSONB adapter sort direction must be asc or desc.");
      }

      return field === "id" ? `id ${direction}` : `record->>'${field}' ${direction}`;
  });

  return ` order by ${parts.join(", ")}`;
}

function normalizeLimit(limit: number | undefined): number | null {
  if (limit === undefined) {
    return null;
  }

  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("PostgreSQL JSONB adapter limit must be a non-negative integer.");
  }

  return limit;
}

function pushJsonFilter(parts: string[], params: unknown[], field: string, value: unknown): void {
  const err = validateSqlIdentifier(field);
  if (err) {
    throw new Error(err.message);
  }

  if (field === "id") {
    pushIdFilter(parts, params, value);
    return;
  }

  if (Array.isArray(value)) {
    params.push(value);
    parts.push(`record->>'${field}' = any($${params.length}::text[])`);
    return;
  }

  if (isPlainObject(value)) {
    params.push(JSON.stringify({
          [field]: value,
    }));
    parts.push(`record @> $${params.length}::jsonb`);
    return;
  }

  params.push(JSON.stringify({
        [field]: value,
  }));
  parts.push(`record @> $${params.length}::jsonb`);
}

function pushIdFilter(parts: string[], params: unknown[], value: unknown): void {
  if (Array.isArray(value)) {
    params.push(value.map((item) => String(item)));
    parts.push(`id = any($${params.length}::text[])`);
    return;
  }

  params.push(String(value));
  parts.push(`id = $${params.length}`);
}

function qualifiedTable(schema: string, entity: ResolvedEntity): string {
  const tableError = validateSqlIdentifier(entity.definition.table);
  if (tableError) {
    throw new Error(tableError.message);
  }

  return `${quoteIdentifier(schema)}.${quoteIdentifier(entity.definition.table)}`;
}

const applyContext = applyStorageContext;

function normalizeRow(row: Row | undefined): StoreRecord {
  if (!row) {
    throw new Error("Postgres JSONB adapter returned no row.");
  }

  return typeof row.record === "string" ? JSON.parse(row.record) as StoreRecord : row.record;
}

function assertPlaceholders(sql: string, params: unknown[]): void {
  const error = validatePlaceholderOrder(sql, params);
  if (error) {
    throw new Error(error.message);
  }
}

export {
  createPostgresJsonbStorageAdapter,
};
