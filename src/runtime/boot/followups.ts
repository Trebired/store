import { hookResultData } from "#4ehy9amylf43";
import { buildStoreLogGroup, resolveLogger } from "#3ug859kbex8c";
import {
  bootFollowUpFailed,
  bootFollowUpSkipped,
  bootFollowUpSucceeded,
  type BootFollowUpOutcomeDetails,
} from "./outcomes.js";
import {
  readBootBoolean,
  readBootRecord,
  readBootRecordBoolean,
  readBootRecordById,
  type BootEntityReaderInput,
} from "./read.js";
import type {
  RuntimeBootFollowUpOutcome,
  RuntimeFollowUp,
  RuntimeFollowUpRegistry,
} from "#pq1c0xwc48qu";
import type {
  MaybePromise,
  NormalizedStoreLogger,
  StoreContext,
  StoreContextInput,
  StoreLogger,
  StoreLoggerAdapter,
  StoreReadOptions,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";

const BOOT_FOLLOW_UP_DISPATCH = Symbol.for ("@package/store/boot-follow-up-dispatch");

interface BootFollowUpDispatcherOptions {
  logger?: StoreLogger;
  loggerAdapter?: StoreLoggerAdapter;
  reader?: BootEntityReaderInput;
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
  resolveTarget(input: BootFollowUpHandlerInput): MaybePromise<string|null|undefined>;
  isReady(targetId: string, input: BootFollowUpHandlerInput): MaybePromise<boolean>;
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
  readById(
    entity: string,
    id: string,
    context?: StoreContextInput,
    options?: StoreReadOptions,
  ): Promise<StoreRecord|null>;
  readRecord(
    entity: string,
    where: StoreWhere,
    context?: StoreContextInput,
    options?: StoreReadOptions,
  ): Promise<StoreRecord|null>;
  readRecordBoolean(
    entity: string,
    where: StoreWhere,
    path: string,
    fallback?: boolean,
    context?: StoreContextInput,
    options?: StoreReadOptions,
  ): Promise<boolean>;
  skipped(details?: BootFollowUpOutcomeDetails): RuntimeBootFollowUpOutcome;
  succeeded(value?: unknown): RuntimeBootFollowUpOutcome;
  failed(error?: unknown): RuntimeBootFollowUpOutcome;
}
type BootFollowUpDispatcherRegistry = RuntimeFollowUpRegistry& {
  [BOOT_FOLLOW_UP_DISPATCH]: RuntimeFollowUp;
};

function createBootFollowUpDispatcher(options: BootFollowUpDispatcherOptions): BootFollowUpDispatcherRegistry {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const group = buildStoreLogGroup("boot");
  const registry = {} as BootFollowUpDispatcherRegistry;
  const dispatch = async(input: Parameters<RuntimeFollowUp>[0]) => {
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
  const api = createApi(base, options.reader);
  const input = {
    ...base,
    api,
  };
  if (!handler) {
    return bootFollowUpSkipped(base.call, base.entity, {
        message: "Boot follow-up call is not registered",
        recordId: base.record.id,
    });
  }
  try {
    return await runRegisteredHandler(handler, input, options, logger, group);
  } catch (error) {
    logger?.error(group, "follow-up failed", logMeta(input, error));
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
        message: "Boot follow-up policy is disabled",
    });
  }
  const guardSkip = await runGuard(config.guard, input, options, logger, group);
  if (guardSkip) return guardSkip;
  const output = await config.run(input);
  return normalizeOutcome(output, input);
}

function normalizeHandler(handler: BootFollowUpHandler): Required<Pick<BootFollowUpHandlerConfig, "run">>&Omit<BootFollowUpHandlerConfig, "run"> {
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
): Promise<RuntimeBootFollowUpOutcome|null> {
  if (!name) return null;
  const guard = options.guards?.[name];
  if (!guard) {
    return input.api.skipped({
        message: `Boot follow-up guard "${name}" is not registered`,
    });
  }
  return runReadyGuard(guard, input, logger, group);
}

async function runReadyGuard(
  guard: BootFollowUpGuard,
  input: BootFollowUpHandlerInput,
  logger: NormalizedStoreLogger | null,
  group: string,
): Promise<RuntimeBootFollowUpOutcome|null> {
  const targetId = await guard.resolveTarget(input);
  if (!targetId) return null;
  if (await guard.isReady(targetId, input)) return null;
  logger?.info(group, "waiting for follow-up guard", logMeta(input, null, targetId));
  return pollReadyGuard(guard, input, logger, group, targetId);
}

async function pollReadyGuard(
  guard: BootFollowUpGuard,
  input: BootFollowUpHandlerInput,
  logger: NormalizedStoreLogger | null,
  group: string,
  targetId: string,
): Promise<RuntimeBootFollowUpOutcome|null> {
  const timeoutMs = guard.timeoutMs ?? 30_000;
  const pollMs = guard.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    if (await guard.isReady(targetId, input)) {
      logger?.info(group, "follow-up guard became ready", logMeta(input, null, targetId));
      return null;
    }
  }
  logger?.warn(group, "follow-up guard timed out", logMeta(input, null, targetId));
  return input.api.skipped({
      message: "Boot follow-up guard timed out",
  });
}

function createApi(
  input: Parameters<RuntimeFollowUp>[0],
  reader: BootEntityReaderInput,
): BootFollowUpHandlerApi {
  return {
    failed: (error) => bootFollowUpFailed(input.call, input.entity, error, input.record.id),
    readById: (entity, id, context, options) => readBootRecordById(reader, entity, id, context, options),
    readBoolean: readBootBoolean,
    readRecord: (entity, where, context, options) => readBootRecord(reader, entity, where, context, options),
    readRecordBoolean: (entity, where, path, fallback, context, options) =>
    readBootRecordBoolean(reader, entity, where, path, fallback, context, options),
    skipped: (details) => bootFollowUpSkipped(input.call, input.entity, {
        recordId: input.record.id,
        ...details,
    }),
    succeeded: (value) => bootFollowUpSucceeded(input.call, input.entity, value, input.record.id),
  };
}

function finishBootFollowUp(
  api: Pick<BootFollowUpHandlerApi, "failed"|"succeeded">,
  output: unknown,
): RuntimeBootFollowUpOutcome {
  return output && typeof output === "object" &&
    ((output as { ok?: unknown }).ok === true || (output as { noop?: unknown }).noop === true)
  ? api.succeeded(output)
  : api.failed(output);
}

const bootResultData = hookResultData;

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
  return Boolean(value && typeof value === "object" && "call"in value && "entity"in value && "skipped"in value);
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
  bootResultData,
  bootFollowUpSkipped,
  bootFollowUpSucceeded,
  createBootFollowUpDispatcher,
  finishBootFollowUp,
  readBootRecord,
  readBootRecordBoolean,
  readBootRecordById,
  readBootBoolean,
};
export type {
  BootEntityReaderInput,
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
