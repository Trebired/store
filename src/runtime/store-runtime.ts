import { createModeEnricherRegistry } from "#1e65qk7we0f3";
import { createRecordViews } from "#4f4sym6qlwt3";
import { createStore } from "#g06v32kod8xy";
import { resolveLogger } from "#3ug859kbex8c";
import { createMemoryStorageAdapter } from "#mq84z0z7glm9";
import { createPostgresJsonbStorageAdapter } from "#b9rnmvf9p9z3";
import { resolveEntityName } from "#8pewakkhamie";
import type {
  ModeEnricher,
  ModeEnricherRegistry,
  Store,
  StoreContext,
  StoreRecord,
} from "#y31thwq3bdf0";
import { createBootRunner } from "./boot.js";
import { createHydrationEnrichers } from "./hydration.js";
import { createRuntimeMemo } from "./memo.js";
import { createRuntimePostgres } from "./postgres.js";
import {
  isProviderSubEntityRegistry,
  wrapProviderSubEntities,
} from "./provider-subentity.js";
import { normalizeRuntimeEntities } from "./registry.js";
import type {
  StoreRuntimeCreateOptions,
  StoreRuntimeEvents,
  StoreRuntimeFacade,
  StoreRuntimeModeOptions,
} from "./types.js";

function createStoreRuntime(options: StoreRuntimeCreateOptions): StoreRuntimeFacade {
  const logger = resolveLogger(options.logger, options.loggerAdapter);
  const entities = normalizeRuntimeEntities(options.entities, Boolean(options.postgres));
  const postgresLogger = resolveLogger(options.postgres?.logger || options.logger, options.loggerAdapter);
  const postgresRuntime = createRuntimePostgres(options.postgres, entities, postgresLogger || logger);
  const memo = createRuntimeMemo(options.memo);
  let store: Store;
  const enrichers = createRuntimeEnrichers(options, () => store);
  store = createStore({
    cache: {
      enabled: options.memo?.l1 !== false,
      l2: options.memo?.l2,
    },
    entities,
    enrichers,
    logger: options.logger,
    loggerAdapter: options.loggerAdapter,
    storages: createRuntimeStorages(postgresRuntime),
    subEntities: isProviderSubEntityRegistry(options.subEntities) ? undefined : options.subEntities,
  });
  const read = wrapProviderSubEntities(store.entity.read, isProviderSubEntityRegistry(options.subEntities) ? options.subEntities : undefined);
  const entity = wrapEntityEvents({
    read,
    write: store.entity.write,
  }, options.events?.onWrite, (name) => resolveEntityName(entities, name) || name);
  const boot = createBootRunner({
    entity,
  }, options.boot);

  return {
    cache: store.cache,
    entity,
    inspectCache: () => store.inspectCache(),
    memo,
    onBoot: async () => {
      if (options.postgres) {
        await postgresRuntime.postgres.init();
      }
      return boot();
    },
    postgres: postgresRuntime.postgres,
    records: (name, views) => createRecordViews({
      entity,
    }, name, views),
    repair: store.repair,
    subEntity: store.subEntity,
  };
}

function createRuntimeStorages(postgresRuntime: ReturnType<typeof createRuntimePostgres>) {
  return {
    memory: createMemoryStorageAdapter(),
    postgres: createPostgresJsonbStorageAdapter({
      client: postgresRuntime.client,
      schema: postgresRuntime.schema,
    }),
  };
}

function createRuntimeEnrichers(
  options: StoreRuntimeCreateOptions,
  getStore: () => Store,
): ModeEnricherRegistry {
  const hydration = createHydrationEnrichers(options.entities, getStore);
  const hooks = createModeEnricherRegistry({
    entities: normalizeRuntimeEntities(options.entities, Boolean(options.postgres)),
    getStore,
    loadHook: (input) => loadRuntimeHook(options.modes, input),
  });
  return combineEnrichers(hydration, hooks);
}

function combineEnrichers(...registries: ModeEnricherRegistry[]): ModeEnricherRegistry {
  const keys = new Set(registries.flatMap((registry) => Object.keys(registry)));
  return Object.fromEntries([...keys].map((key) => [
    key,
    combineKey(registries.map((registry) => registry[key]).filter(Boolean)),
  ]));
}

function combineKey(enrichers: ModeEnricher[]): ModeEnricher {
  return async (record, context) => {
    let current = record;
    for (const enricher of enrichers) {
      current = await enricher(current, context);
    }
    return current;
  };
}

async function loadRuntimeHook(
  options: StoreRuntimeModeOptions | undefined,
  input: { entity: string; hook: string; mode: string },
) {
  const legacy = await options?.legacyHookAdapter?.(input);
  if (legacy || !options?.hookRoot) {
    return legacy;
  }

  const file = hookFileUrl(options, input);
  try {
    const mod = await import(file.href);
    return mod.default || mod[input.hook] || mod.hook;
  } catch (error) {
    if ((error as { code?: string }).code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

function hookFileUrl(
  options: StoreRuntimeModeOptions,
  input: { entity: string; hook: string },
): URL {
  const convention = options.hookFileConvention || "entity/with/name";
  const path = convention
    .replace("entity", input.entity)
    .replace("with", "with")
    .replace("name", input.hook)
    .replace(/\/+/gu, "/");
  return new URL(`${path}.js`, options.hookRoot);
}

function wrapEntityEvents(
  entity: Store["entity"],
  onWrite: StoreRuntimeEvents["onWrite"] | undefined,
  canonicalName: (entity: string) => string,
): Store["entity"] {
  if (!onWrite) {
    return entity;
  }

  return {
    read: entity.read,
    write: {
      by: async (name, where, context, patch, options) => {
        const result = await entity.write.by(name, where, context, patch, options);
        if (result.ok && result.data) {
          await onWriteEvent(onWrite, canonicalName(name), context, result.data, "by");
        }
        return result;
      },
      put: async (name, context, record, options) => {
        const result = await entity.write.put(name, context, record, options);
        if (result.ok && result.data) {
          await onWriteEvent(onWrite, canonicalName(name), context, result.data, "put");
        }
        return result;
      },
      remove: async (name, context, id, options) => {
        const result = await entity.write.remove(name, context, id, options);
        if (result.ok) {
          await onWriteEvent(onWrite, canonicalName(name), context, {
            id,
          }, "remove");
        }
        return result;
      },
      removeMany: async (name, ids, context, options) => {
        const result = await entity.write.removeMany(name, ids, context, options);
        if (result.ok) {
          await onWriteEvent(onWrite, canonicalName(name), context || {}, {
            id: ids.join(","),
            ids,
          }, "removeMany");
        }
        return result;
      },
    },
  };
}

async function onWriteEvent(
  onWrite: NonNullable<StoreRuntimeCreateOptions["events"]>["onWrite"],
  entity: string,
  context: StoreContext,
  record: StoreRecord,
  operation: "put" | "by" | "remove" | "removeMany",
): Promise<void> {
  await onWrite?.({
    context,
    entity,
    operation,
    record,
  });
}

export {
  createStoreRuntime,
};
