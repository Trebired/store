import type { StoreContextInput, StoreRecord, StoreWhere } from "#y31thwq3bdf0";

import {
  clearRequestEntityLoaders,
} from "#g8u7bg42czn8";
import {
  createApplicationBootInitializer,
  createApplicationBootOptions,
  logStoreBootResult,
  summarizeStoreBootResult,
} from "./application/boot.js";
import { createApplicationMemoOptions } from "./application/memo.js";
import {
  createApplicationPostgresOptions,
  normalizePostgresIndexMap,
} from "./application/postgres.js";
import { createLazyStoreRecords } from "./application/records.js";
import type {
  StoreApplicationRuntimeFacade,
  StoreApplicationRuntimeOptions,
} from "./application/types.js";
import { createStoreMemoCache } from "./cache.js";
import { createStoreRuntime } from "./store.js";
import type {
  RuntimeEntityRegistry,
  StoreRuntimeEvents,
  StoreRuntimeFacade,
} from "./types.js";

function createStoreApplicationRuntime<TRegistry extends RuntimeEntityRegistry>(
  options: StoreApplicationRuntimeOptions<TRegistry>,
): StoreApplicationRuntimeFacade {
  const boot = createApplicationBootOptions(options);
  const inputOnWrite = options.onWrite || options.events?.onWrite;
  const runtime = createStoreRuntime({
      boot,
      entities: options.entities,
      events: {
        onWrite: (event) => handleApplicationWrite(event, inputOnWrite),
      },
      logger: options.logger,
      loggerAdapter: options.loggerAdapter,
      memo: createApplicationMemoOptions(options),
      modes: options.modes,
      postgres: createApplicationPostgresOptions(options),
      sqlite: options.sqlite,
      subEntities: options.subEntities,
  });
  const memoCache = createStoreMemoCache(runtime.memo);

  return {
    ...runtime,
    memoCache,
    onBoot: createApplicationBootInitializer(runtime, options.startup),
    readEntityRecord: (entityName, where, context = null, readOptions = {}) =>
    readApplicationEntityRecord(runtime, entityName, where, context, readOptions),
    records: createLazyStoreRecords(runtime),
  };
}

async function handleApplicationWrite(
  event: Parameters<NonNullable<StoreRuntimeEvents["onWrite"]>>[0],
  onWrite: StoreRuntimeEvents["onWrite"] | undefined,
): Promise<void> {
  clearRequestEntityLoaders(event.entity);
  await onWrite?.(event);
}

async function readApplicationEntityRecord(
  runtime: StoreRuntimeFacade,
  entityName: string,
  where: StoreWhere,
  context: StoreContextInput,
  options: StoreWhere,
): Promise<StoreRecord|null> {
  const result = await runtime.entity.read.by(entityName, where, context, options);
  return result.ok === true && result.data && typeof result.data === "object"
  ? result.data
  : null;
}

export {
  createStoreApplicationRuntime,
  logStoreBootResult,
  normalizePostgresIndexMap,
  summarizeStoreBootResult,
};
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
} from "./application/types.js";
