import type {
  ModeEnricherHook,
  ModeEnricherHookApi,
  ModeEnricherRegistry,
  ModeEnricherRegistryBuilderOptions,
  StoreContext,
  StoreReadOptions,
  StoreRecord,
} from "#y31thwq3bdf0";
import { assertWritableRecord } from "#613yyghfyv0a";

function createModeEnricherRegistry(
  options: ModeEnricherRegistryBuilderOptions,
): ModeEnricherRegistry {
  const registry: ModeEnricherRegistry = {};

  for (const [entity, definition] of Object.entries(options.entities)) {
    for (const [mode, modeDefinition] of Object.entries(definition.modes || {})) {
      const hooks = normalizeHookNames(modeDefinition.hooks);
      if (hooks.length === 0) {
        continue;
      }

      registry[modeDefinition.enrich || `${entity}.${mode}`] = async (record, context) => {
        const api = createHookApi(options);
        return runHooks(options, record, hooks, {
          context: context.context,
          entity,
          mode,
        }, api);
      };
    }
  }

  return registry;
}

async function runHooks(
  options: ModeEnricherRegistryBuilderOptions,
  record: StoreRecord,
  hooks: string[],
  context: {
    context: StoreContext;
    entity: string;
    mode: string;
  },
  api: ModeEnricherHookApi,
): Promise<StoreRecord> {
  let current = record;
  for (const hookName of hooks) {
    const hook = await options.loadHook({
      entity: context.entity,
      hook: hookName,
      mode: context.mode,
    });
    current = hook ? await runHook(hook, current, context, hookName, api) : current;
  }

  return current;
}

async function runHook(
  hook: ModeEnricherHook,
  record: StoreRecord,
  context: {
    context: StoreContext;
    entity: string;
    mode: string;
  },
  hookName: string,
  api: ModeEnricherHookApi,
): Promise<StoreRecord> {
  const next = await hook(record, api, {
    context: context.context,
    entity: context.entity,
    hook: hookName,
    mode: context.mode,
  });
  const invalid = assertWritableRecord(context.entity, next);
  if (invalid) {
    throw new Error(invalid.message);
  }

  return next;
}

function createHookApi(options: ModeEnricherRegistryBuilderOptions): ModeEnricherHookApi {
  const recorded_at = options.now?.() ?? new Date().toISOString();
  return {
    readAll: (entity, context, readOptions) => readAll(options, entity, context, readOptions),
    readById: (entity, id, context, readOptions) => readById(options, entity, id, context, readOptions),
    recorded_at,
  };
}

function readAll(
  options: ModeEnricherRegistryBuilderOptions,
  entity: string,
  context: StoreContext,
  readOptions?: StoreReadOptions,
) {
  if (options.readAll) {
    return options.readAll(entity, context, readOptions);
  }

  return options.getStore?.().entity.read.all(entity, context, readOptions) ?? missingStore();
}

function readById(
  options: ModeEnricherRegistryBuilderOptions,
  entity: string,
  id: string,
  context: StoreContext,
  readOptions?: StoreReadOptions,
) {
  if (options.readById) {
    return options.readById(entity, id, context, readOptions);
  }

  return options.getStore?.().entity.read.by(entity, { id }, context, readOptions) ?? missingStore();
}

function normalizeHookNames(hooks: unknown): string[] {
  if (Array.isArray(hooks)) {
    return hooks.filter((hook): hook is string => typeof hook === "string" && hook.length > 0);
  }

  if (hooks && typeof hooks === "object") {
    return Object.entries(hooks)
      .filter(([, enabled]) => enabled === true)
      .map(([hook]) => hook);
  }

  return [];
}

function missingStore(): never {
  throw new Error("Mode enricher hook read API requires getStore or explicit read helpers.");
}

export {
  createModeEnricherRegistry,
};
