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
export type StoreContextInput = StoreContext | null | undefined;
export type StoreWhere = Record<string, unknown>;
export type StoreMode = "raw" | "full" | (string & {});
export type StorePrivateUnlocks = boolean | string[] | Record<string, boolean>;
export type StoreSortDirection = "asc" | "desc";
export type StoreSortSpec = `${string}:${StoreSortDirection}`;

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
  [key: string]: unknown;
}

export interface EntityModeDefinition<TRecord extends StoreRecord = StoreRecord> {
  name?: string;
  enrich?: string;
  hooks?: EntityModeHookMap;
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
  where?: StoreWhere;
  limit?: number;
  sort?: readonly StoreSortSpec[];
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
  where?: StoreWhere;
  limit?: number;
  sort?: readonly StoreSortSpec[];
}

export interface StorageAdapter<TRecord extends StoreRecord = StoreRecord> {
  all(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<TRecord[]>;
  by(entity: ResolvedEntity<TRecord>, where: StoreWhere, context: StoreContext, options?: StorageReadOptions): Promise<TRecord | null>;
  byIds(entity: ResolvedEntity<TRecord>, ids: string[], context: StoreContext, options?: StorageReadOptions): Promise<TRecord[]>;
  count(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<number>;
  hasAny(entity: ResolvedEntity<TRecord>, context: StoreContext, options?: StorageReadOptions): Promise<boolean>;
  put(entity: ResolvedEntity<TRecord>, context: StoreContext, record: TRecord, options?: StoreWriteOptions): Promise<TRecord>;
  remove(entity: ResolvedEntity<TRecord>, context: StoreContext, id: string, options?: StoreWriteOptions): Promise<boolean>;
  removeMany?(entity: ResolvedEntity<TRecord>, context: StoreContext, ids: string[], options?: StoreWriteOptions): Promise<StoreBulkRemoveResult>;
  ensureReadyFor?(entity: ResolvedEntity<TRecord>): Promise<void>;
}

export interface ModeEnricherContext {
  entity: string;
  mode: string;
  context: StoreContext;
}

export type ModeEnricher = (record: StoreRecord, context: ModeEnricherContext) => MaybePromise<StoreRecord>;
export type ModeEnricherRegistry = Record<string, ModeEnricher>;
export type EntityModeHookMap = Record<string, boolean> | readonly string[];

export interface ModeEnricherHookContext extends ModeEnricherContext {
  hook: string;
}

export interface ModeEnricherHookApi {
  recorded_at: string;
  readAll(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord[]>>;
  readById(entity: string, id: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord | null>>;
}

export type ModeEnricherHook = (
  record: StoreRecord,
  api: ModeEnricherHookApi,
  context: ModeEnricherHookContext,
) => MaybePromise<StoreRecord>;

export type ModeEnricherHookLoader = (input: {
  entity: string;
  hook: string;
  mode: string;
}) => MaybePromise<ModeEnricherHook | null | undefined>;

export interface ModeEnricherRegistryBuilderOptions<TRegistry extends EntityRegistry = EntityRegistry> {
  entities: TRegistry;
  loadHook: ModeEnricherHookLoader;
  getStore?: () => Store;
  readAll?(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord[]>>;
  readById?(entity: string, id: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord | null>>;
  now?(): string;
}

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
    context: StoreContextInput,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord[]>>;
  by<TRecord extends StoreRecord = StoreRecord>(
    entity: string,
    where: StoreWhere,
    context: StoreContextInput,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord | null>>;
  count(entity: string, context: StoreContextInput, options?: StoreReadOptions): Promise<StoreResult<number>>;
  hasAny(entity: string, context: StoreContextInput, options?: StoreReadOptions): Promise<StoreResult<boolean>>;
}

export interface StoreEntityWrite {
  put<TRecord extends StoreRecord = StoreRecord>(
    entity: string,
    context: StoreContextInput,
    record: TRecord,
    options?: StoreWriteOptions,
  ): Promise<StoreResult<TRecord>>;
  by<TPatch extends StoreWhere = StoreWhere>(
    entity: string,
    where: StoreWhere,
    context: StoreContextInput,
    patch: TPatch,
    options?: StoreWriteOptions,
  ): Promise<StoreResult<StoreRecord | null>>;
  remove(entity: string, context: StoreContextInput, id: string, options?: StoreWriteOptions): Promise<StoreResult<boolean>>;
  removeMany(
    entity: string,
    ids: string[],
    context?: StoreContextInput,
    options?: StoreWriteOptions,
  ): Promise<StoreResult<StoreBulkRemoveResult>>;
}

export interface Store {
  entity: {
    read: StoreEntityRead;
    write: StoreEntityWrite;
  };
  cache: StoreCacheController;
  records<TViews extends RecordViewConfigMap>(entity: string, views: TViews): RecordViewRegistry<TViews>;
  repair: StoreRepairApi;
  subEntity: StoreSubEntityRead;
  inspectCache(): StoreCacheState;
}

export interface StoreCacheController {
  inspect(): StoreCacheState;
  invalidateEntity(entity: string): void;
}

export interface StoreCacheState {
  enabled: boolean;
  entityVersions: Record<string, number>;
  l1Size: number;
  trackedKeys: Record<string, number>;
  inflight: number;
}

export interface StoreBulkRemoveResult {
  requested: number;
  removed: number;
  missing: number;
  ids: string[];
}

export type RecordViewDefaults =
  | Partial<StoreRecord>
  | ((patch?: Partial<StoreRecord>) => Partial<StoreRecord>);

export interface RecordViewConfig {
  kind: string;
  discriminatorField?: string;
  defaults?: RecordViewDefaults;
  normalize?(row: StoreRecord): StoreRecord;
  sort?: readonly StoreSortSpec[];
  uniqueBy?: readonly string[];
}

export type RecordViewConfigMap = Record<string, RecordViewConfig>;

export interface RecordViewOptions extends StoreReadOptions {
  context?: StoreContext;
}

export interface RecordViewWriteOptions extends StoreWriteOptions {
  context?: StoreContext;
}

export interface RecordViewListOptions extends RecordViewOptions {
  limit?: number;
  sort?: readonly StoreSortSpec[];
}

export interface RecordViewUniqueUpsertOptions extends RecordViewWriteOptions {}

export interface RecordView<TRecord extends StoreRecord = StoreRecord> {
  entity: string;
  config: RecordViewConfig;
  is(row: StoreRecord): boolean;
  create(patch?: Partial<TRecord>): TRecord;
  normalize(row: Partial<TRecord> | TRecord): TRecord;
  byId(id: string, options?: RecordViewOptions): Promise<StoreResult<TRecord | null>>;
  by(where: StoreWhere, options?: RecordViewOptions): Promise<StoreResult<TRecord | null>>;
  list(options?: RecordViewListOptions): Promise<StoreResult<TRecord[]>>;
  put(row: TRecord, options?: RecordViewWriteOptions): Promise<StoreResult<TRecord>>;
  patch(where: StoreWhere, patch: Partial<TRecord>, options?: RecordViewWriteOptions): Promise<StoreResult<StoreRecord | null>>;
  remove(id: string, options?: RecordViewWriteOptions): Promise<StoreResult<boolean>>;
  upsertUnique(row: TRecord, options?: RecordViewUniqueUpsertOptions): Promise<StoreResult<TRecord>>;
}

export type RecordViewRegistry<TViews extends RecordViewConfigMap = RecordViewConfigMap> = {
  [K in keyof TViews]: RecordView;
};

export interface StoreRepairApi {
  orphansAndDuplicates(input: StoreRepairOrphansAndDuplicatesInput): Promise<StoreRepairSummary>;
}

export interface StoreRepairOrphansAndDuplicatesInput {
  child: RecordView;
  parent: RecordView;
  childParentKey: string;
  uniqueBy: readonly string[];
  keep: "freshest";
  freshnessFields: readonly string[];
  context?: StoreContext;
}

export interface StoreRepairSummary {
  scannedParentCount: number;
  scannedChildCount: number;
  deletedOrphanCount: number;
  deletedDuplicateCount: number;
  deletedTotal: number;
  remainingChildCount: number;
  skipped: boolean;
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

export type StoreRequestContextMeta = Record<string, unknown>;

export interface StoreRequestContext {
  entityLoaders: Map<string, unknown>;
  meta: StoreRequestContextMeta;
  values: Map<string, unknown>;
}
