import { result } from "@trebired/result";

import { resolveLogger } from "#3ug859kbex8c";
import type {
  RuntimeBootFollowUpOutcome,
  RuntimeFollowUp,
  RuntimeFollowUpRegistry,
} from "#pq1c0xwc48qu";
import type {
  MaybePromise,
  NormalizedStoreLogger,
  StoreContext,
  StoreLogger,
  StoreLoggerAdapter,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";

const BOOT_FOLLOW_UP_DISPATCH = Symbol.for("@trebired/store.bootFollowUpDispatch");
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

interface BootFollowUpDispatcherOptions {
  logger?: StoreLogger;
  loggerAdapter?: StoreLoggerAdapter;
  group?: string;
  guards?: Record<string, BootFollowUpGuard>;
  handlers: Record<string, BootFollowUpHandler>;
}
type BootFollowUpHandler = BootFollowUpFunction | BootFollowUpHandlerConfig;
type BootFollowUpFunction = (input: BootFollowUpHandlerInput) => MaybePromise<unknown>;
interface BootFollowUpHandlerConfig {
  guard?: string;
  policy?: string | {
    field: string;
    fallback?: boolean;
  };
  run: BootFollowUpFunction;
}
interface BootFollowUpGuard {
  timeoutMs?: number;
  pollMs?: number;
  resolveTarget(input: BootFollowUpHandlerInput): MaybePromise<string | null | undefined>;
  isReady(targetId: string, input: BootFollowUpHandlerInput): MaybePromise<boolean>;
  onWaitMessage?: string;
  onReadyMessage?: string;
  onTimeoutMessage?: string;
}
interface BootFollowUpHandlerInput {
  call: string;
  entity: string;
  record: StoreRecord;
  config?: StoreWhere;
  context?: StoreContext;
  api: BootFollowUpHandlerApi;
}
interface BootFollowUpHandlerApi {
  readBoolean(record: StoreRecord, path: string, fallback?: boolean): boolean;
  skipped(details?: BootFollowUpOutcomeDetails): RuntimeBootFollowUpOutcome;
  succeeded(value?: unknown): RuntimeBootFollowUpOutcome;
  failed(error?: unknown): RuntimeBootFollowUpOutcome;
}
type BootFollowUpOutcomeDetails = {
  recordId?: string;
  message?: string;
  error_code?: string;
  result?: unknown;
  details?: unknown;
};
type BootFollowUpDispatcherRegistry = RuntimeFollowUpRegistry & {
  [BOOT_FOLLOW_UP_DISPATCH]: RuntimeFollowUp;
};

function createBootFollowUpDispatcher(options: BootFollowUpDispatcherOptions): BootFollowUpDispatcherRegistry {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const group = options.group || "store.boot";
  const registry = {} as BootFollowUpDispatcherRegistry;
  const dispatch = async (input: Parameters<RuntimeFollowUp>[0]) => {
    return dispatchFollowUp(input, options, logger, group);
  };

  Object.defineProperty(registry, BOOT_FOLLOW_UP_DISPATCH, {
    enumerable: true,
    value: dispatch,
  });
  for (const call of Object.keys(options.handlers)) {
    registry[call] = dispatch;
  }
  return new Proxy(registry, {
    get(target, property) {
      if (typeof property === "string" && !(property in target)) {
        return dispatch;
      }
      return target[property as keyof BootFollowUpDispatcherRegistry];
    },
  }) as BootFollowUpDispatcherRegistry;
}

async function dispatchFollowUp(
  base: Parameters<RuntimeFollowUp>[0],
  options: BootFollowUpDispatcherOptions,
  logger: NormalizedStoreLogger | null,
  group: string,
): Promise<RuntimeBootFollowUpOutcome> {
  const handler = options.handlers[base.call];
  const api = createApi(base);
  const input = {
    ...base,
    api,
  };
  if (!handler) {
    return bootFollowUpSkipped(base.call, base.entity, {
      message: "Boot follow-up call is not registered.",
      recordId: base.record.id,
    });
  }

  try {
    return await runRegisteredHandler(handler, input, options, logger, group);
  } catch (error) {
    logger?.error(group, "Boot follow-up failed.", logMeta(input, error));
    return bootFollowUpFailed(base.call, base.entity, error, base.record.id);
  }
}

async function runRegisteredHandler(
  handler: BootFollowUpHandler,
  input: BootFollowUpHandlerInput,
  options: BootFollowUpDispatcherOptions,
  logger: NormalizedStoreLogger | null,
  group: string,
): Promise<RuntimeBootFollowUpOutcome> {
  const config = normalizeHandler(handler);
  const policy = readPolicy(config.policy, input.record);
  if (policy === false) {
    return input.api.skipped({
      message: "Boot follow-up policy is disabled.",
    });
  }

  const guardSkip = await runGuard(config.guard, input, options, logger, group);
  if (guardSkip) return guardSkip;
  const output = await config.run(input);
  return normalizeOutcome(output, input);
}

function normalizeHandler(handler: BootFollowUpHandler): Required<Pick<BootFollowUpHandlerConfig, "run">> & Omit<BootFollowUpHandlerConfig, "run"> {
  return typeof handler === "function" ? { run: handler } : handler;
}

function readPolicy(policy: BootFollowUpHandlerConfig["policy"], record: StoreRecord): boolean {
  if (!policy) return true;
  if (typeof policy === "string") {
    return readBootBoolean(record, policy, false);
  }
  return readBootBoolean(record, policy.field, policy.fallback ?? false);
}

async function runGuard(
  name: string | undefined,
  input: BootFollowUpHandlerInput,
  options: BootFollowUpDispatcherOptions,
  logger: NormalizedStoreLogger | null,
  group: string,
): Promise<RuntimeBootFollowUpOutcome | null> {
  if (!name) return null;
  const guard = options.guards?.[name];
  if (!guard) {
    return input.api.skipped({
      message: `Boot follow-up guard "${name}" is not registered.`,
    });
  }
  return runReadyGuard(guard, input, logger, group);
}

async function runReadyGuard(
  guard: BootFollowUpGuard,
  input: BootFollowUpHandlerInput,
  logger: NormalizedStoreLogger | null,
  group: string,
): Promise<RuntimeBootFollowUpOutcome | null> {
  const targetId = await guard.resolveTarget(input);
  if (!targetId) return null;
  if (await guard.isReady(targetId, input)) return null;
  logger?.info(group, guard.onWaitMessage || "Waiting for boot follow-up guard.", logMeta(input, null, targetId));
  return pollReadyGuard(guard, input, logger, group, targetId);
}

async function pollReadyGuard(
  guard: BootFollowUpGuard,
  input: BootFollowUpHandlerInput,
  logger: NormalizedStoreLogger | null,
  group: string,
  targetId: string,
): Promise<RuntimeBootFollowUpOutcome | null> {
  const timeoutMs = guard.timeoutMs ?? 30_000;
  const pollMs = guard.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (await guard.isReady(targetId, input)) {
      logger?.info(group, guard.onReadyMessage || "Boot follow-up guard became ready.", logMeta(input, null, targetId));
      return null;
    }
  }
  logger?.warn(group, guard.onTimeoutMessage || "Boot follow-up guard timed out.", logMeta(input, null, targetId));
  return input.api.skipped({
    message: guard.onTimeoutMessage || "Boot follow-up guard timed out.",
  });
}

function createApi(input: Parameters<RuntimeFollowUp>[0]): BootFollowUpHandlerApi {
  return {
    failed: (error) => bootFollowUpFailed(input.call, input.entity, error, input.record.id),
    readBoolean: readBootBoolean,
    skipped: (details) => bootFollowUpSkipped(input.call, input.entity, {
      recordId: input.record.id,
      ...details,
    }),
    succeeded: (value) => bootFollowUpSucceeded(input.call, input.entity, value, input.record.id),
  };
}

function normalizeOutcome(output: unknown, input: BootFollowUpHandlerInput): RuntimeBootFollowUpOutcome {
  if (isBootFollowUpOutcome(output)) {
    return {
      recordId: input.record.id,
      ...output,
    };
  }
  return input.api.succeeded(output);
}

function isBootFollowUpOutcome(value: unknown): value is RuntimeBootFollowUpOutcome {
  return Boolean(value && typeof value === "object" && "call" in value && "entity" in value && "skipped" in value);
}

function bootFollowUpSkipped(
  call: string,
  entity: string,
  details: BootFollowUpOutcomeDetails = {},
): RuntimeBootFollowUpOutcome {
  const envelope = result.noop("boot-follow-up-skipped", details.message || "Boot follow-up skipped.", {
    details: details.details,
  });
  return {
    ...envelope,
    call,
    entity,
    error_code: details.error_code || envelope.error_code,
    recordId: details.recordId,
    result: details.result,
    skipped: true,
  };
}

function bootFollowUpSucceeded(
  call: string,
  entity: string,
  value?: unknown,
  recordId?: string,
): RuntimeBootFollowUpOutcome {
  const envelope = result.ok("Boot follow-up completed.", {
    data: value ?? null,
  });
  return {
    ...envelope,
    call,
    entity,
    recordId,
    result: value,
    skipped: false,
  };
}

function bootFollowUpFailed(
  call: string,
  entity: string,
  error?: unknown,
  recordId?: string,
): RuntimeBootFollowUpOutcome {
  const message = error instanceof Error ? error.message : "Boot follow-up failed.";
  const envelope = result.error(500, "boot-follow-up-failed", message, {
    details: {
      cause: error,
    },
  });
  return {
    ...envelope,
    call,
    entity,
    recordId,
    result: error,
    skipped: false,
  };
}

function readBootBoolean(record: StoreRecord, path: string, fallback = false): boolean {
  const value = getPath(record, path);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function getPath(row: StoreRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  }, row);
}

function logMeta(input: BootFollowUpHandlerInput, error?: unknown, targetId?: string): Record<string, unknown> {
  return {
    call: input.call,
    entity: input.entity,
    error,
    recordId: input.record.id,
    targetId,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export {
  BOOT_FOLLOW_UP_DISPATCH,
  bootFollowUpFailed,
  bootFollowUpSkipped,
  bootFollowUpSucceeded,
  createBootFollowUpDispatcher,
  readBootBoolean,
};

export type {
  BootFollowUpDispatcherOptions,
  BootFollowUpDispatcherRegistry,
  BootFollowUpFunction,
  BootFollowUpGuard,
  BootFollowUpHandler,
  BootFollowUpHandlerApi,
  BootFollowUpHandlerConfig,
  BootFollowUpHandlerInput,
  BootFollowUpOutcomeDetails,
};
