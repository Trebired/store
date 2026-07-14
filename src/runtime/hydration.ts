import {
  getOrCreateRequestValue,
  getStoreRequestContext,
} from "#g8u7bg42czn8";
import type {
  ModeEnricher,
  ModeEnricherRegistry,
  Store,
  StoreContext,
  StoreRecord,
} from "#y31thwq3bdf0";
import type {
  RuntimeBootCondition,
  RuntimeComputedHydration,
  RuntimeCountHydration,
  RuntimeHydrationApi,
  RuntimeHydrationDeclaration,
  RuntimeRelationHydration,
  RuntimeEntityRegistry,
} from "./types.js";

const fallbackMemo = new Map<string, unknown>();

function relation(config: Omit<RuntimeRelationHydration, "type">): RuntimeRelationHydration {
  return {
    ...config,
    type: "relation",
  };
}

function countBy(config: Omit<RuntimeCountHydration, "type">): RuntimeCountHydration {
  return {
    ...config,
    type: "count",
  };
}

function computed(compute: RuntimeComputedHydration["compute"]): RuntimeComputedHydration {
  return {
    compute,
    type: "computed",
  };
}

function createHydrationEnrichers(
  entities: RuntimeEntityRegistry,
  getStore: () => Store,
): ModeEnricherRegistry {
  const enrichers: ModeEnricherRegistry = {};
  for (const [entity, definition] of Object.entries(entities)) {
    for (const [mode, modeDefinition] of Object.entries(definition.modes || {})) {
      if (!modeDefinition.with) {
        continue;
      }
      enrichers[modeDefinition.enrich || `${entity}.${mode}`] = createHydrator(getStore, Object.values(modeDefinition.with));
    }
  }
  return enrichers;
}

function createHydrator(
  getStore: () => Store,
  declarations: RuntimeHydrationDeclaration[],
): ModeEnricher {
  return async (record, context) => {
    let current = record;
    for (const declaration of declarations) {
      current = await applyHydration(getStore(), current, context.context, declaration);
    }
    return current;
  };
}

async function applyHydration(
  store: Store,
  record: StoreRecord,
  context: StoreContext,
  declaration: RuntimeHydrationDeclaration,
): Promise<StoreRecord> {
  if (declaration.type === "relation") {
    return hydrateRelation(store, record, context, declaration);
  }
  if (declaration.type === "count") {
    return hydrateCount(store, record, context, declaration);
  }
  return {
    ...record,
    ...await declaration.compute(record, createHydrationApi(store, context)),
  };
}

async function hydrateRelation(
  store: Store,
  record: StoreRecord,
  context: StoreContext,
  declaration: RuntimeRelationHydration,
): Promise<StoreRecord> {
  if (declaration.when && !matchesCondition(record, declaration.when)) {
    return record;
  }
  const id = resolveExpression(record, declaration.id);
  if (typeof id !== "string" || !id) {
    return record;
  }

  const key = `relation:${declaration.entity}:${declaration.mode || "full"}:${id}:${JSON.stringify(context)}`;
  const related = await memoValue(key, async () => {
    return store.entity.read.by(declaration.entity, {
      id,
    }, context, {
      mode: declaration.mode,
    });
  });
  return related.ok && related.data ? {
    ...record,
    [declaration.assign]: related.data,
  } : record;
}

async function hydrateCount(
  store: Store,
  record: StoreRecord,
  context: StoreContext,
  declaration: RuntimeCountHydration,
): Promise<StoreRecord> {
  const local = record[declaration.localKey];
  if (local === undefined || local === null) {
    return record;
  }

  const rows = await memoValue(`count:${declaration.entity}:${declaration.foreignKey}:${JSON.stringify(context)}`, async () => {
    return store.entity.read.all(declaration.entity, context, {
      mode: "raw",
    });
  });
  if (!rows.ok) {
    return record;
  }

  const related = (rows.data || []).filter((row) => row[declaration.foreignKey] === local);
  let next = {
    ...record,
    ...countAssignments(related, declaration),
  };
  for (const item of declaration.set || []) {
    if (!item.when || matchesCondition(next, item.when)) {
      next = {
        ...next,
        [item.field]: item.value,
      };
    }
  }
  return next;
}

function countAssignments(rows: StoreRecord[], declaration: RuntimeCountHydration): StoreRecord {
  const out: Record<string, unknown> = {};
  for (const value of Object.values(declaration.assign)) {
    const [field, filter] = Array.isArray(value) ? value : [value, {}];
    out[field] = rows.filter((row) => matchesWhere(row, filter.where || {})).length;
  }
  return out as StoreRecord;
}

function createHydrationApi(store: Store, context: StoreContext): RuntimeHydrationApi {
  return {
    context,
    readAll: (entity, readContext, options) => store.entity.read.all(entity, readContext, options),
    readById: (entity, id, readContext, options) => store.entity.read.by(entity, {
      id,
    }, readContext, options),
    url: (record) => String(record.url || record.href || `/${record.id}`),
  };
}

function matchesCondition(record: StoreRecord, condition: RuntimeBootCondition): boolean {
  const value = resolveExpression(record, condition.field);
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

function matchesWhere(record: StoreRecord, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

function resolveExpression(record: StoreRecord, expression: string): unknown {
  const path = expression.startsWith("entity.") ? expression.slice("entity.".length) : expression;
  return path.split(".").reduce<unknown>((current, key) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  }, record);
}

function memoValue<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (getStoreRequestContext()) {
    return Promise.resolve(getOrCreateRequestValue(key, () => load())).then((value) => value);
  }

  if (!fallbackMemo.has(key)) {
    fallbackMemo.set(key, load());
  }
  return fallbackMemo.get(key) as Promise<T>;
}

export {
  computed,
  countBy,
  createHydrationEnrichers,
  relation,
};
