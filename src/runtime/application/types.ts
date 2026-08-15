import type {
  MaybePromise,
  StoreContextInput,
  StoreLogger,
  StoreLoggerAdapter,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";
import type { StoreMemoCacheFacade } from "#lcolgs63toxx";
import type {
  RuntimeEntityRegistry,
  RuntimeJsonMemoAdapter,
  RuntimePostgresIndex,
  RuntimeRedisMemoAdapterInput,
  StoreRuntimeBootOptions,
  StoreRuntimeCreateOptions,
  StoreRuntimeEvents,
  StoreRuntimeFacade,
  StoreRuntimeMemoOptions,
  StoreRuntimeModeOptions,
  StoreRuntimePostgresOptions,
  StoreRuntimePostgresPoolOptions,
} from "#pq1c0xwc48qu";

type StoreApplicationEnv = Record<string, unknown>;
type StoreStartupMarkDone = (metadata?: Record<string, unknown>) => void;
type StoreStartupMark = (label: string) => void |StoreStartupMarkDone;

interface StoreApplicationRuntimeOptions<TRegistry extends RuntimeEntityRegistry=RuntimeEntityRegistry> {
  boot?: StoreRuntimeBootOptions;
  bootEnvironment?: StoreRuntimeBootOptions["environment"];
  bootFollowUps?: StoreRuntimeBootOptions["followUps"];
  bootRewrites?: StoreRuntimeBootOptions["rewrites"];
  entities: TRegistry;
  env?: StoreApplicationEnv;
  events?: StoreRuntimeEvents;
  indexMap?: StorePostgresIndexMap;
  logger?: StoreLogger;
  loggerAdapter?: StoreLoggerAdapter;
  memo?: StoreRuntimeMemoOptions;
  modes?: StoreRuntimeModeOptions;
  onBootResult ? (result: Parameters<NonNullable<StoreRuntimeBootOptions["onResult"]>>[0]) : MaybePromise<void>;
  onWrite?: StoreRuntimeEvents["onWrite"];
  postgres?: false | StoreApplicationPostgresOptions;
  redisMemo?: false | RuntimeRedisMemoAdapterInput | RuntimeJsonMemoAdapter | null;
  sqlite?: StoreRuntimeCreateOptions["sqlite"];
  startup?: StoreStartupBridge;
  subEntities?: StoreRuntimeCreateOptions["subEntities"];
}

interface StoreApplicationRuntimeFacade extends StoreRuntimeFacade {
  memoCache: StoreMemoCacheFacade;
  readEntityRecord(
    entityName: string,
    where: StoreWhere,
    context?: StoreContextInput,
    options?: StoreWhere,
  ): Promise<StoreRecord|null>;
}

interface StoreApplicationPostgresOptions extends Omit<StoreRuntimePostgresOptions, "indexes"|"pool"> {
  indexMap?: StorePostgresIndexMap;
  indexes?: readonly RuntimePostgresIndex[];
  pool?: StoreRuntimePostgresPoolOptions;
}

interface StoreStartupBridge {
  mark?: StoreStartupMark;
  markLabel?: string;
}

type StorePostgresIndexMap = Record<string, readonly StorePostgresIndexMapItem[]>;

interface StorePostgresIndexMapItem {
  expression?: string;
  expr?: string;
  method?: RuntimePostgresIndex["method"];
  name?: string;
}

interface StoreBootResultSummary {
  changed: number;
  entities: number;
  failures: number;
  follow_ups_queued: number;
  follow_ups_run: number;
}

export type {
  StoreApplicationEnv,
  StoreApplicationPostgresOptions,
  StoreApplicationRuntimeFacade,
  StoreApplicationRuntimeOptions,
  StoreBootResultSummary,
  StorePostgresIndexMap,
  StorePostgresIndexMapItem,
  StoreStartupBridge,
  StoreStartupMark,
  StoreStartupMarkDone,
};
