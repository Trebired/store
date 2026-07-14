import type {
  MaybePromise,
  StoreLogger,
} from "#y31thwq3bdf0";
import type { SqliteDatabase } from "#qmu6u0jug6cv";

export interface StoreRuntimeSqliteOptions {
  database?: SqliteDatabase;
  path?: string;
  indexes?: readonly RuntimeSqliteIndex[];
  migrations?: readonly RuntimeSqliteMigration[];
  slowQueryMs?: number;
  logOperations?: boolean;
  resultMode?: "throw" | "envelope";
  logger?: StoreLogger;
  metrics?(event: RuntimeSqliteMetricsEvent): MaybePromise<void>;
}

export interface RuntimeSqliteMetricsEvent {
  elapsedMs: number;
  operation?: string;
  name?: string;
  success: boolean;
  rowCount: number;
}

export interface RuntimeSqliteIndex {
  table: string;
  name?: string;
  expression: string;
}

export type RuntimeSqliteMigration = (api: RuntimeSqliteMigrationApi) => MaybePromise<void>;

export interface RuntimeSqliteMigrationApi {
  query(sql: string, params?: readonly unknown[]): Promise<RuntimeSqliteQueryResult<unknown>>;
}

export interface StoreRuntimeSqlite {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    options?: RuntimeSqliteQueryOptions,
  ): Promise<RuntimeSqliteQueryResult<T>>;
  init(): Promise<void>;
}

export type RuntimeSqliteQueryResult<T = Record<string, unknown>> = {
  ok?: true;
  rows: T[];
  rowCount?: number;
} | {
  ok: false;
  error: true;
  error_code: string;
  message: string;
  rows: [];
  rowCount: 0;
};

export interface RuntimeSqliteQueryOptions {
  operation?: "read" | "write" | "ddl" | "migration";
  name?: string;
  allowLiterals?: boolean;
}
