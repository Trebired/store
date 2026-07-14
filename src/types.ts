import type {
  LoggerAdapterEvent,
  LoggerAdapterGenericLogMethod,
  LoggerAdapterLogger,
  LoggerAdapterLogMethod,
  LoggerAdapterWriter,
  NormalizedLoggerAdapter,
} from "@trebired/logger-adapter";
import type { ResultLike } from "@trebired/result";

export type MaybePromise<T> = T | Promise<T>;
export type StoreLogMethod = LoggerAdapterLogMethod;
export type StoreLogEvent = LoggerAdapterEvent;
export type StoreGenericLogMethod = LoggerAdapterGenericLogMethod;
export type StoreLogger = LoggerAdapterLogger;
export type StoreLoggerAdapter = LoggerAdapterWriter;
export type NormalizedStoreLogger = NormalizedLoggerAdapter;
export type StoreRecord = { id: string } & Record<string, unknown>;
export type StoreContext = Record<string, unknown>;
export type StoreWhere = Record<string, unknown>;
export type StoreMode = "raw" | "full" | (string & {});
export type StorePrivateUnlocks = boolean | string[] | Record<string, boolean>;

export type StoreErrorCode =
  | "store-cache-error"
  | "store-enriched-marker-persisted"
  | "store-enriched-record"
  | "store-entity-not-found"
  | "store-invalid-context"
  | "store-invalid-id"
  | "store-invalid-mode"
  | "store-invalid-record"
  | "store-invalid-where"
  | "store-missing-id"
  | "store-sql-identifier"
  | "store-sql-placeholder"
  | "store-storage-error"
  | "store-sub-entity-not-found";

export type StoreResult<T> = ResultLike<T, StoreErrorDetails>;

export type StoreErrorDetails = {
  code: StoreErrorCode;
  entity?: string;
  field?: string;
  id?: string;
  mode?: string;
  storage?: string;
  cause?: unknown;
};

export interface EntityMetadata {
  icon?: string;
  name?: string;
  [key: string]: unknown;
}

export interface EntityModeDefinition<TRecord extends StoreRecord = StoreRecord> {
  name?: string;
  enrich?: string;
  privateFields?: string[];
  metadata?: EntityMetadata;
  select?(record: TRecord): StoreRecord;
}

export interface EntityDefinition<TRecord extends StoreRecord = StoreRecord> {
  table: string;
  storage: string;
  context?: readonly string[];
  aliases?: readonly string[];
  modes?: Record<string, EntityModeDefinition<TRecord>>;
  privateFields?: Record<string, string | readonly string[] | true>;
  metadata?: EntityMetadata;
}

export type EntityRegistry = Record<string, EntityDefinition>;

export interface ResolvedEntity<TRecord extends StoreRecord = StoreRecord> {
  name: string;
  definition: EntityDefinition<TRecord>;
}

export interface StoreReadOptions {
  mode?: StoreMode;
  includePrivate?: StorePrivateUnlocks;
  scope?: "context" | "all";
  cache?: boolean;
  cacheBypass?: boolean;
  cacheMeta?: boolean;
}

export interface StoreWriteOptions {
  scope?: "context" | "all";
}

export interface StoreCacheInspection {
  enabled: boolean;
  hit: "l1" | "l2" | "miss" | "deduped";
  key: string | null;
  version: number;
}

export interface StoreReadMeta {
  cache?: StoreCacheInspection;
}

export interface StorageReadOptions {
  scope?: "context" | "all";
  bypassCache?: boolean;
}

export interface StorageAdapter<TRecord extends StoreRecord = StoreRecord> {
  all(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<TRecord[]>;
  by(entity: ResolvedEntity<TRecord>, where: StoreWhere, context: StoreContext, options?: StorageReadOptions): Promise<TRecord | null>;
  byIds(entity: ResolvedEntity<TRecord>, ids: string[], context: StoreContext, options?: StorageReadOptions): Promise<TRecord[]>;
  count(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<number>;
  hasAny(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<boolean>;
  put(entity: ResolvedEntity<TRecord>, context: StoreContext, record: TRecord, options?: StoreWriteOptions): Promise<TRecord>;
  remove(entity: ResolvedEntity<TRecord>, context: StoreContext, id: string, options?: StoreWriteOptions): Promise<boolean>;
  ensureReadyFor?(entity: ResolvedEntity<TRecord>): Promise<void>;
}

export interface ModeEnricherContext {
  entity: string;
  mode: string;
  context: StoreContext;
}

export type ModeEnricher = (record: StoreRecord, context: ModeEnricherContext) => MaybePromise<StoreRecord>;
export type ModeEnricherRegistry = Record<string, ModeEnricher>;

export interface L2CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface StoreCacheOptions {
  enabled?: boolean;
  l2?: L2CacheAdapter;
  ignoredContextKeys?: readonly string[];
}

export interface CreateStoreOptions<TRegistry extends EntityRegistry = EntityRegistry> {
  entities: TRegistry;
  storage?: StorageAdapter | Record<string, StorageAdapter>;
  storages?: Record<string, StorageAdapter>;
  enrichers?: ModeEnricherRegistry;
  cache?: boolean | StoreCacheOptions;
  subEntities?: SubEntityRegistry;
  logger?: StoreLogger;
  loggerAdapter?: StoreLoggerAdapter;
}

export interface StoreEntityRead {
  all<TRecord extends StoreRecord = StoreRecord>(
    entity: string,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord[]>>;
  by<TRecord extends StoreRecord = StoreRecord>(
    entity: string,
    where: StoreWhere,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord | null>>;
  count(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<number>>;
  hasAny(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<boolean>>;
}

export interface StoreEntityWrite {
  put<TRecord extends StoreRecord = StoreRecord>(
    entity: string,
    context: StoreContext,
    record: TRecord,
    options?: StoreWriteOptions,
  ): Promise<StoreResult<TRecord>>;
  by<TPatch extends StoreWhere = StoreWhere>(
    entity: string,
    where: StoreWhere,
    context: StoreContext,
    patch: TPatch,
    options?: StoreWriteOptions,
  ): Promise<StoreResult<StoreRecord | null>>;
  remove(entity: string, context: StoreContext, id: string, options?: StoreWriteOptions): Promise<StoreResult<boolean>>;
}

export interface Store {
  entity: {
    read: StoreEntityRead;
    write: StoreEntityWrite;
  };
  subEntity: StoreSubEntityRead;
  inspectCache(): StoreCacheState;
}

export interface StoreCacheState {
  enabled: boolean;
  entityVersions: Record<string, number>;
  l1Size: number;
  trackedKeys: Record<string, number>;
  inflight: number;
}

export interface SubEntityDefinition {
  parent: string;
  childKey: string;
  identityField: string;
  sourceMode?: StoreMode;
  validateContext?(context: StoreContext): StoreResult<true> | null | undefined;
  list?(children: StoreRecord[], context: SubEntityContext): MaybePromise<StoreRecord[]>;
  by?(children: StoreRecord[], where: StoreWhere, context: SubEntityContext): MaybePromise<StoreRecord | null>;
  count?(children: StoreRecord[], context: SubEntityContext): MaybePromise<number>;
  enrich?(record: StoreRecord, context: SubEntityContext): MaybePromise<StoreRecord>;
}

export type SubEntityRegistry = Record<string, SubEntityDefinition>;

export interface SubEntityContext {
  name: string;
  definition: SubEntityDefinition;
  parent: StoreRecord;
  context: StoreContext;
}

export interface StoreSubEntityRead {
  list<TRecord extends StoreRecord = StoreRecord>(
    name: string,
    parentWhere: StoreWhere,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord[]>>;
  by<TRecord extends StoreRecord = StoreRecord>(
    name: string,
    parentWhere: StoreWhere,
    where: StoreWhere,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord | null>>;
  count(
    name: string,
    parentWhere: StoreWhere,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<number>>;
}

export interface PostgresStoreClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface PostgresJsonbAdapterOptions {
  client: PostgresStoreClient;
  schema?: string;
}
