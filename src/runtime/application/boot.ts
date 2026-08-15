import { buildStoreLogGroup, resolveLogger } from "#3ug859kbex8c";
import type {
  NormalizedStoreLogger,
} from "#y31thwq3bdf0";
import { mergeBootOptions } from "#by12tg0dnbxs";
import type {
  StoreRuntimeBootOptions,
  StoreRuntimeFacade,
} from "#pq1c0xwc48qu";
import type {
  StoreApplicationRuntimeOptions,
  StoreBootResultSummary,
  StoreStartupBridge,
} from "./types.js";

const STORE_BOOT_LOG_GROUP = buildStoreLogGroup("boot");

function createApplicationBootOptions(
  options: StoreApplicationRuntimeOptions,
): StoreRuntimeBootOptions | undefined {
  if (!options.boot && !options.bootEnvironment && !options.bootFollowUps && !options.bootRewrites && !options.onBootResult) {
    return undefined;
  }

  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const boot = mergeBootOptions(options.boot, {
      environment: options.bootEnvironment,
      followUps: options.bootFollowUps,
      rewrites: options.bootRewrites,
  });
  const onResult = boot.onResult;
  boot.onResult = async(result) => {
    logStoreBootResult(result, logger);
    await onResult?.(result);
    await options.onBootResult?.(result);
  };
  return boot;
}

function createApplicationBootInitializer(
  runtime: StoreRuntimeFacade,
  startup: StoreStartupBridge | undefined,
): StoreRuntimeFacade["onBoot"] {
  return async() => {
    const done = startup?.mark?.(startup.markLabel || "store boot");
    try {
      return await runtime.onBoot();
    } finally {
      if (typeof done === "function") {
        done();
      }
    }
  };
}

function logStoreBootResult(
  result: Parameters<NonNullable<StoreRuntimeBootOptions["onResult"]>>[0],
  logger: NormalizedStoreLogger | null,
): void {
  const summary = summarizeStoreBootResult(result);
  logger?.info(
    STORE_BOOT_LOG_GROUP,
    summary.changed > 0
    ? "boot check complete, updates applied"
    : "boot check complete, nothing to do",
    summary,
  );
}

function summarizeStoreBootResult(
  result: Parameters<NonNullable<StoreRuntimeBootOptions["onResult"]>>[0],
): StoreBootResultSummary {
  return {
    changed: Number(result.changedCount) || 0,
    entities: Object.keys(result.entities || {}).length,
    failures: Array.isArray(result.failures) ? result.failures.length : 0,
    follow_ups_queued: Number(result.followUpCount) || 0,
    follow_ups_run: Number(result.followUpsRunCount) || 0,
  };
}

export {
  createApplicationBootInitializer,
  createApplicationBootOptions,
  logStoreBootResult,
  summarizeStoreBootResult,
};
