import type { MaybePromise } from "#y31thwq3bdf0";

export interface SqliteRunResult {
  changes?: number;
  lastInsertRowid?: number | bigint;
}

export interface SqliteStatement<T = Record<string, unknown>> {
  all(...params: unknown[]): MaybePromise<T[]>;
  get?(...params: unknown[]): MaybePromise<T | null | undefined>;
  run?(...params: unknown[]): MaybePromise<SqliteRunResult>;
}

export interface SqliteDatabase {
  query?(sql: string): unknown;
  prepare?(sql: string): unknown;
  exec?(sql: string): MaybePromise<unknown>;
  run?(sql: string, params?: readonly unknown[]): MaybePromise<SqliteRunResult>;
  all?<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): MaybePromise<T[]>;
  get?<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): MaybePromise<T | null | undefined>;
}

export interface SqliteJsonAdapterOptions {
  database: SqliteDatabase;
}
