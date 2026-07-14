import type {
  EntityDefinition,
  EntityRegistry,
  L2CacheAdapter,
  MaybePromise,
  ModeEnricherHook,
  Store,
  StoreContext,
  StoreLogger,
  StoreLoggerAdapter,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
  SubEntityRegistry,
  StoreWhere,
} from "#y31thwq3bdf0";

export type RuntimeEntityRegistry = Record<string, RuntimeEntityDefinition>;

export interface RuntimeEntityDefinition extends Omit<EntityDefinition, "storage" | "modes"> {
  required?: readonly string[];
  private?: Record<string, string | readonly string[] | true>;
  storage?: string;
  modes?: Record<string, RuntimeEntityModeDefinition>;
  [key: string]: unknown;
}

export interface RuntimeEntityModeDefinition {
  name?: string;
  enrich?: string;
  hooks?: Record<string, boolean> | readonly string[];
  privateFields?: string[];
  metadata?: Record<string, unknown>;
  select?(record: StoreRecord): StoreRecord;
  with?: RuntimeHydrationMap;
  [key: string]: unknown;
}

export type RuntimeHydrationMap = Record<string, RuntimeHydrationDeclaration>;

export type RuntimeHydrationDeclaration =
  | RuntimeRelationHydration
  | RuntimeCountHydration
  | RuntimeComputedHydration;

export interface RuntimeRelationHydration {
  type: "relation";
  entity: string;
  id: string;
  mode?: string;
  assign: string;
  when?: RuntimeBootCondition;
}

export interface RuntimeCountHydration {
  type: "count";
  entity: string;
  foreignKey: string;
  localKey: string;
  assign: Record<string, string | readonly [string, { where?: StoreWhere }]>;
  set?: readonly RuntimeHydrationSet[];
}

export interface RuntimeHydrationSet {
  field: string;
  value: unknown;
  when?: RuntimeBootCondition;
}

export interface RuntimeComputedHydration {
  type: "computed";
  compute(record: StoreRecord, api: RuntimeHydrationApi): MaybePromise<Partial<StoreRecord>>;
}

export interface RuntimeHydrationApi {
  context: StoreContext;
  readAll(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord[]>>;
  readById(entity: string, id: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord | null>>;
  url(record: StoreRecord): string;
}

export interface StoreRuntimeCreateOptions<TRegistry extends RuntimeEntityRegistry = RuntimeEntityRegistry> {
  entities: TRegistry;
  postgres?: StoreRuntimePostgresOptions;
  modes?: StoreRuntimeModeOptions;
  boot?: StoreRuntimeBootOptions;
  memo?: StoreRuntimeMemoOptions;
  events?: StoreRuntimeEvents;
  subEntities?: SubEntityRegistry | RuntimeProviderSubEntityRegistry;
  logger?: StoreLogger;
  loggerAdapter?: StoreLoggerAdapter;
}

export interface StoreRuntimePostgresOptions {
  databaseUrl?: string;
  schema?: string;
  pool?: StoreRuntimePostgresPoolOptions;
  client?: RuntimePostgresClient;
  indexes?: readonly RuntimePostgresIndex[];
  migrations?: readonly RuntimePostgresMigration[];
  slowQueryMs?: number;
  logOperations?: boolean;
  resultMode?: "throw" | "envelope";
  logger?: StoreLogger;
  metrics?(event: RuntimePostgresMetricsEvent): MaybePromise<void>;
}

export interface StoreRuntimePostgresPoolOptions {
  max?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
}

export interface RuntimePostgresClient {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  connect?(): Promise<RuntimePostgresClient & { release?(): void }>;
  on?(event: "error", handler: (error: unknown) => void): void;
  idleCount?: number;
  totalCount?: number;
  waitingCount?: number;
}

export interface RuntimePostgresMetricsEvent {
  elapsedMs: number;
  operation?: string;
  name?: string;
  success: boolean;
  rowCount: number;
}

export interface RuntimePostgresIndex {
  table: string;
  name?: string;
  expression: string;
  method?: "btree" | "gin";
}

export type RuntimePostgresMigration = (api: RuntimePostgresMigrationApi) => MaybePromise<void>;

export interface RuntimePostgresMigrationApi {
  query(sql: string, params?: readonly unknown[]): Promise<RuntimePostgresQueryResult<unknown>>;
  schema: string;
}

export interface StoreRuntimeModeOptions {
  hookRoot?: URL;
  hookFileConvention?: "entity/with/name" | "entity/name" | string;
  legacyHookAdapter?: RuntimeLegacyHookAdapter;
}

export type RuntimeLegacyHookAdapter = (
  input: { entity: string; hook: string; mode: string },
) => MaybePromise<ModeEnricherHook | null | undefined>;

export interface StoreRuntimeBootOptions {
  fixes?: readonly RuntimeBootFix[];
  rewrites?: RuntimeRewriteRegistry;
  followUps?: RuntimeFollowUpRegistry;
  context?: StoreContext;
  environment?: {
    developerMode?: boolean;
    splitDev?: boolean;
    [key: string]: unknown;
  };
  onResult?(result: RuntimeBootResult): MaybePromise<void>;
  developerMode?: boolean;
  splitDev?: boolean;
}

export interface RuntimeBootFix {
  entity: string;
  actions: readonly RuntimeBootAction[];
  context?: StoreContext;
}

export interface RuntimeBootAction {
  if?: RuntimeBootCondition;
  if_all?: readonly RuntimeBootCondition[];
  set?: StoreWhere;
  set_if_missing?: StoreWhere;
  unset?: readonly string[];
  rewrite?: string;
  after?: readonly RuntimeFollowUpConfig[];
  run_after_on_match?: boolean;
  skip_in_developer_mode?: boolean;
  skip_in_split_dev?: boolean;
}

export interface RuntimeBootCondition {
  field: string;
  equals?: unknown;
  equals_any?: readonly unknown[];
  gt?: number;
}

export type RuntimeRewriteRegistry =
  | Record<string, RuntimeRewrite>
  | Record<string, Record<string, RuntimeRewrite>>;

export type RuntimeRewrite = (record: StoreRecord, context: RuntimeBootActionContext) => MaybePromise<StoreRecord>;

export interface RuntimeBootActionContext {
  entity: string;
  context: StoreContext;
  config: RuntimeBootAction;
}

export interface RuntimeFollowUpConfig {
  call: string;
  config?: StoreWhere;
}

export type RuntimeFollowUpRegistry = Record<string, RuntimeFollowUp>;

export type RuntimeFollowUp = (input: {
  entity: string;
  record: StoreRecord;
  config?: StoreWhere;
}) => MaybePromise<void>;

export interface RuntimeBootResult {
  changedCount: number;
  entities: Record<string, RuntimeBootEntityResult>;
  queuedFollowUps: RuntimeQueuedFollowUp[];
  followUpCount: number;
  failures: RuntimeBootFailure[];
  skipped: RuntimeBootSkipped[];
}

export interface RuntimeBootEntityResult {
  scanned: number;
  changed: number;
}

export interface RuntimeQueuedFollowUp {
  entity: string;
  recordId: string;
  record?: StoreRecord;
  call: string;
  config?: StoreWhere;
}

export interface RuntimeBootFailure {
  entity: string;
  id?: string;
  message: string;
}

export interface RuntimeBootSkipped {
  entity: string;
  reason: string;
}

export interface StoreRuntimeEvents {
  onWrite?(event: StoreRuntimeWriteEvent): MaybePromise<void>;
}

export interface StoreRuntimeWriteEvent {
  entity: string;
  context: StoreContext;
  record?: StoreRecord;
  operation: "put" | "by" | "remove" | "removeMany";
}

export interface StoreRuntimeMemoOptions {
  redis?: RuntimeRemoteInvalidationAdapter;
  l1?: false | RuntimeL1MemoOptions;
  l2?: L2CacheAdapter | RuntimeJsonMemoAdapter;
  ignoredKeys?: readonly string[];
  invalidationTtlMs?: number;
}

export interface RuntimeL1MemoOptions {
  maxEntries?: number;
  ttlMs?: number;
}

export interface RuntimeRemoteInvalidationAdapter {
  publish(channel: string, message: string): MaybePromise<void>;
  subscribe?(channel: string, handler: (message: string) => void): MaybePromise<void>;
}

export interface RuntimeRedisMemoAdapterInput {
  getJson<T = unknown>(key: string): MaybePromise<T | null>;
  setJson<T = unknown>(key: string, value: T, ttlMs?: number): MaybePromise<unknown>;
  del?(key: string): MaybePromise<unknown>;
  incr?(key: string): MaybePromise<number>;
  publishJson?(channel: string, payload: unknown): MaybePromise<unknown>;
  subscribeJson?(channel: string, handler: (payload: unknown) => void): MaybePromise<unknown>;
}

export interface RuntimeJsonMemoAdapter extends L2CacheAdapter, RuntimeRemoteInvalidationAdapter {}

export interface StoreRuntimeMemo {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttlMs?: number; entity?: string }): Promise<void>;
  run<T>(key: string, load: () => MaybePromise<T>, options?: { ttlMs?: number; entity?: string }): Promise<T>;
  invalidateEntity(entity: string): Promise<void>;
  inspectRead(key: string, entity?: string): RuntimeMemoInspection;
  keyForRead(input: RuntimeMemoReadKeyInput): string;
  entityVersion(entity: string): number;
}

export interface RuntimeMemoInspection {
  enabled: boolean;
  cached: boolean;
  inflight: boolean;
  invalidated: boolean;
  invalidatedAt: string;
  invalidatedVersion: number;
  hit: "l1" | "l2" | "miss";
  key: string;
  version: number;
}

export interface RuntimeMemoReadKeyInput {
  entity: string;
  operation: string;
  mode?: string;
  context?: StoreContext;
  where?: StoreWhere;
  input?: unknown;
  options?: StoreWhere;
}

export interface StoreRuntimePostgres {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    options?: RuntimePostgresQueryOptions,
  ): Promise<RuntimePostgresQueryResult<T>>;
  init(): Promise<void>;
}

export type RuntimePostgresQueryResult<T = Record<string, unknown>> = {
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

export interface RuntimePostgresQueryOptions {
  operation?: "read" | "write" | "ddl" | "migration";
  name?: string;
  allowLiterals?: boolean;
}

export interface StoreRuntimeFacade extends Pick<Store, "cache" | "entity" | "inspectCache" | "records" | "repair" | "subEntity"> {
  onBoot(): Promise<RuntimeBootResult>;
  postgres: StoreRuntimePostgres;
  memo: StoreRuntimeMemo;
}

export type RuntimeProviderSubEntityRegistry = Record<string, RuntimeProviderSubEntityDefinition>;

export interface RuntimeProviderSubEntityDefinition {
  kind: "provider";
  validateContext?(context: StoreContext): StoreResult<true> | { ok: true; ctx?: StoreContext } | null | undefined;
  list?(context: StoreContext, options: StoreReadOptions, api: RuntimeProviderSubEntityApi): MaybePromise<StoreRecord[]>;
  by?(where: StoreWhere, context: StoreContext, options: StoreReadOptions, api: RuntimeProviderSubEntityApi): MaybePromise<StoreRecord | null>;
  count?(context: StoreContext, options: StoreReadOptions, api: RuntimeProviderSubEntityApi): MaybePromise<number>;
}

export interface RuntimeProviderSubEntityApi {
  readAll(entity: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord[]>>;
  readById(entity: string, id: string, context: StoreContext, options?: StoreReadOptions): Promise<StoreResult<StoreRecord | null>>;
  recorded_at: string;
}

export interface NormalizedRuntimeConfig {
  entities: EntityRegistry;
}
