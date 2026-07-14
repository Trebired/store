import type { Store } from "#y31thwq3bdf0";
import type {
  RuntimeBootAction,
  RuntimeBootCondition,
  RuntimeBootFailure,
  RuntimeBootFix,
  RuntimeBootResult,
  RuntimeFollowUpConfig,
  RuntimeQueuedFollowUp,
  RuntimeRewrite,
  RuntimeRewriteRegistry,
  StoreRuntimeBootOptions,
} from "./types.js";
import type { StoreContext, StoreRecord } from "#y31thwq3bdf0";

function createBootRunner(store: Pick<Store, "entity">, options: StoreRuntimeBootOptions = {}) {
  return async (): Promise<RuntimeBootResult> => {
    const result = emptyResult();
    for (const fix of options.fixes || []) {
      await runFix(store, fix, options, result);
    }
    await runFollowUps(options, result);
    result.followUpCount = result.queuedFollowUps.length;
    return result;
  };
}

async function runFix(
  store: Pick<Store, "entity">,
  fix: RuntimeBootFix,
  options: StoreRuntimeBootOptions,
  result: RuntimeBootResult,
): Promise<void> {
  const context = fix.context || {};
  const rows = await store.entity.read.all(fix.entity, context, {
    mode: "raw",
    scope: "all",
  });
  if (!rows.ok) {
    result.failures.push({
      entity: fix.entity,
      message: rows.message,
    });
    return;
  }

  result.entities[fix.entity] = result.entities[fix.entity] || {
    changed: 0,
    scanned: 0,
  };
  for (const row of rows.data || []) {
    await runActions(store, fix, row, context, options, result);
  }
}

async function runActions(
  store: Pick<Store, "entity">,
  fix: RuntimeBootFix,
  row: StoreRecord,
  context: StoreContext,
  options: StoreRuntimeBootOptions,
  result: RuntimeBootResult,
): Promise<void> {
  let current = row;
  let changed = false;
  result.entities[fix.entity].scanned += 1;
  for (const action of fix.actions) {
    const skip = skipReason(action, options);
    if (skip) {
      result.skipped.push({
        entity: fix.entity,
        reason: skip,
      });
      continue;
    }
    if (!matchesAction(current, action)) {
      continue;
    }

    const next = await applyAction(current, action, fix.entity, context, options.rewrites);
    changed = changed || JSON.stringify(next) !== JSON.stringify(current);
    current = next;
    if (action.run_after_on_match) {
      queueFollowUps(result, fix.entity, current, action.after || []);
    }
  }

  if (changed) {
    const saved = await store.entity.write.put(fix.entity, context, current, {
      scope: "all",
    });
    if (saved.ok) {
      result.changedCount += 1;
      result.entities[fix.entity].changed += 1;
    } else {
      result.failures.push({
        entity: fix.entity,
        id: current.id,
        message: saved.message,
      });
    }
  }
}

async function applyAction(
  row: StoreRecord,
  action: RuntimeBootAction,
  entity: string,
  context: StoreContext,
  rewrites?: RuntimeRewriteRegistry,
): Promise<StoreRecord> {
  let next = structuredClone(row);
  if (action.rewrite) {
    next = await resolveRewrite(rewrites, entity, action.rewrite)?.(next, {
      config: action,
      context,
      entity,
    }) ?? next;
  }
  for (const [field, value] of Object.entries(action.set || {})) {
    setPath(next, field, value);
  }
  for (const [field, value] of Object.entries(action.set_if_missing || {})) {
    if (getPath(next, field) === undefined) {
      setPath(next, field, value);
    }
  }
  for (const field of action.unset || []) {
    unsetPath(next, field);
  }
  return next;
}

function matchesAction(row: StoreRecord, action: RuntimeBootAction): boolean {
  if (action.if && !matchesCondition(row, action.if)) {
    return false;
  }
  if (action.if_all?.some((condition) => !matchesCondition(row, condition))) {
    return false;
  }
  return true;
}

function matchesCondition(row: StoreRecord, condition: RuntimeBootCondition): boolean {
  const value = getPath(row, condition.field);
  if ("equals" in condition && value !== condition.equals) {
    return false;
  }
  if (condition.equals_any && !condition.equals_any.some((item) => String(item) === String(value))) {
    return false;
  }
  if (condition.gt !== undefined && !(Number(value) > condition.gt)) {
    return false;
  }
  return true;
}

function resolveRewrite(
  rewrites: RuntimeRewriteRegistry | undefined,
  entity: string,
  name: string,
): RuntimeRewrite | undefined {
  const direct = rewrites?.[name as keyof RuntimeRewriteRegistry];
  if (typeof direct === "function") {
    return direct;
  }
  const scoped = rewrites?.[entity as keyof RuntimeRewriteRegistry];
  return typeof scoped === "object" ? scoped[name] : undefined;
}

async function runFollowUps(options: StoreRuntimeBootOptions, result: RuntimeBootResult): Promise<void> {
  for (const queued of result.queuedFollowUps) {
    try {
      await options.followUps?.[queued.call]?.({
        config: queued.config,
        entity: queued.entity,
        record: queued.record || {
          id: queued.recordId,
        },
      });
    } catch (error) {
      result.failures.push({
        entity: queued.entity,
        id: queued.recordId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function queueFollowUps(
  result: RuntimeBootResult,
  entity: string,
  row: StoreRecord,
  followUps: readonly RuntimeFollowUpConfig[],
): void {
  for (const config of followUps) {
    result.queuedFollowUps.push({
      call: config.call,
      config: config.config,
      entity,
      record: structuredClone(row),
      recordId: row.id,
    });
  }
}

function skipReason(action: RuntimeBootAction, options: StoreRuntimeBootOptions): string | null {
  if (action.skip_in_developer_mode && options.developerMode) {
    return "developer-mode";
  }
  if (action.skip_in_split_dev && options.splitDev) {
    return "split-dev";
  }
  return null;
}

function getPath(row: StoreRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  }, row);
}

function setPath(row: StoreRecord, path: string, value: unknown): void {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = ensureParent(row, parts);
  if (key) {
    parent[key] = value;
  }
}

function unsetPath(row: StoreRecord, path: string): void {
  const parts = path.split(".");
  const key = parts.pop();
  const parent = ensureParent(row, parts);
  if (key) {
    delete parent[key];
  }
}

function ensureParent(row: StoreRecord, parts: string[]): Record<string, unknown> {
  let current = row;
  for (const part of parts) {
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as StoreRecord;
  }
  return current;
}

function emptyResult(): RuntimeBootResult {
  return {
    changedCount: 0,
    entities: {},
    failures: [] as RuntimeBootFailure[],
    followUpCount: 0,
    queuedFollowUps: [] as RuntimeQueuedFollowUp[],
    skipped: [],
  };
}

export {
  createBootRunner,
};
