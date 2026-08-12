import type { SqliteDatabase } from "./types.js";

type SqliteRun = (
  database: SqliteDatabase,
  sql: string,
  params: readonly unknown[],
) => Promise<unknown>;

async function ensureSqliteRecordTable(
  database: SqliteDatabase,
  quotedTable: string,
  run: SqliteRun,
): Promise<void> {
  await run(database, `create table if not exists ${quotedTable} (id text primary key, record text not null)`, []);
}

export {
  ensureSqliteRecordTable,
};
