import type {
  RuntimeBootAction,
  RuntimeBootCondition,
  RuntimeBootFix,
  RuntimeFollowUpConfig,
  RuntimeRewriteRegistry,
  StoreRuntimeBootOptions,
} from "#pq1c0xwc48qu";
import type { StoreContext, StoreWhere } from "#y31thwq3bdf0";

const DEFAULT_TRUTHY_VALUES = Object.freeze(["true", "1", "yes", "on"]);

function defineBootFix(entity: string, actions: readonly RuntimeBootAction[], context?: StoreContext): RuntimeBootFix {
  return context ? { actions, context, entity } : { actions, entity };
}

function bootRewrite(name = "normalize"): RuntimeBootAction {
  return { rewrite: name };
}

function bootSet(fields: StoreWhere, condition?: RuntimeBootCondition): RuntimeBootAction {
  return condition ? { if: condition, set: fields } : { set: fields };
}

function bootSetIfMissing(fields: StoreWhere): RuntimeBootAction {
  return { set_if_missing: fields };
}

function bootUnset(fields: readonly string[], condition?: RuntimeBootCondition): RuntimeBootAction {
  return condition ? { if: condition, unset: fields } : { unset: fields };
}

function bootResetStatus(
  statuses: readonly unknown[],
  nextStatus: unknown,
  options: {
    field?: string;
    set?: StoreWhere;
    setIfMissing?: StoreWhere;
    unset?: readonly string[];
  } = {},
): RuntimeBootAction {
  return {
    if: {
      equals_any: statuses,
      field: options.field || "status",
    },
    set: {
      ...(options.set || {}),
      [options.field || "status"]: nextStatus,
    },
    set_if_missing: options.setIfMissing,
    unset: options.unset,
  };
}

function bootTruthyCondition(field: string, truthy: readonly unknown[] = DEFAULT_TRUTHY_VALUES): RuntimeBootCondition {
  return {
    equals_any: truthy,
    field,
  };
}

function bootFollowUpWhen(
  call: string,
  conditions: RuntimeBootCondition | readonly RuntimeBootCondition[],
  options: {
    config?: StoreWhere;
    followUps?: readonly RuntimeFollowUpConfig[];
  } = {},
): RuntimeBootAction {
  const list = Array.isArray(conditions) ? conditions : [conditions];
  return {
    after: options.followUps || [{ call, config: options.config }],
    if_all: list,
    run_after_on_match: true,
  };
}

function mergeBootOptions(...items: readonly (StoreRuntimeBootOptions | null | undefined)[]): StoreRuntimeBootOptions {
  const out: StoreRuntimeBootOptions = {};
  for (const item of items) {
    if (!item) continue;
    out.context = { ...(out.context || {}), ...(item.context || {}) };
    out.environment = { ...(out.environment || {}), ...(item.environment || {}) };
    out.fixes = [...(out.fixes || []), ...(item.fixes || [])];
    out.followUps = { ...(out.followUps || {}), ...(item.followUps || {}) };
    out.rewrites = { ...(out.rewrites || {}), ...(item.rewrites || {}) } as RuntimeRewriteRegistry;
    out.onResult = item.onResult || out.onResult;
    out.developerMode = item.developerMode ?? out.developerMode;
    out.splitDev = item.splitDev ?? out.splitDev;
  }
  return out;
}

export {
  bootFollowUpWhen,
  bootResetStatus,
  bootRewrite,
  bootSet,
  bootSetIfMissing,
  bootTruthyCondition,
  bootUnset,
  defineBootFix,
  mergeBootOptions,
};
