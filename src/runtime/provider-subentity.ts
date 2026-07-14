import { ok, fail } from "#44o0z05ifdgn";
import type {
  Store,
  StoreContext,
  StoreEntityRead,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import type {
  RuntimeProviderSubEntityApi,
  RuntimeProviderSubEntityDefinition,
  RuntimeProviderSubEntityRegistry,
} from "./types.js";

function wrapProviderSubEntities(
  read: StoreEntityRead,
  providers: RuntimeProviderSubEntityRegistry | undefined,
): StoreEntityRead {
  if (!providers || Object.keys(providers).length === 0) {
    return read;
  }

  return {
    all: (entity, context, options) => {
      const provider = providers[entity];
      return provider ? readProviderAll(read, provider, context, options) : read.all(entity, context, options);
    },
    by: (entity, where, context, options) => {
      const provider = providers[entity];
      return provider ? readProviderBy(read, provider, where, context, options) : read.by(entity, where, context, options);
    },
    count: (entity, context, options) => {
      const provider = providers[entity];
      return provider ? readProviderCount(read, provider, context, options) : read.count(entity, context, options);
    },
    hasAny: async (entity, context, options) => {
      const provider = providers[entity];
      if (!provider) {
        return read.hasAny(entity, context, options);
      }
      const count = await readProviderCount(read, provider, context, options);
      return count.ok ? ok(Number(count.data) > 0, "Store virtual sub-entity read completed.") : count as StoreResult<boolean>;
    },
  };
}

async function readProviderAll<TRecord extends StoreRecord>(
  read: StoreEntityRead,
  provider: RuntimeProviderSubEntityDefinition,
  context: StoreContext,
  options: StoreReadOptions = {},
): Promise<StoreResult<TRecord[]>> {
  const valid = validateProviderContext(provider, context);
  if (!valid.ok) {
    return valid.result as StoreResult<TRecord[]>;
  }
  const rows = await provider.list?.(valid.context, options, createProviderApi(read)) ?? [];
  return ok(rows as TRecord[], "Store virtual sub-entity read completed.");
}

async function readProviderBy<TRecord extends StoreRecord>(
  read: StoreEntityRead,
  provider: RuntimeProviderSubEntityDefinition,
  where: StoreWhere,
  context: StoreContext,
  options: StoreReadOptions = {},
): Promise<StoreResult<TRecord | null>> {
  const valid = validateProviderContext(provider, context);
  if (!valid.ok) {
    return valid.result as StoreResult<TRecord | null>;
  }
  const row = await provider.by?.(where, valid.context, options, createProviderApi(read)) ?? null;
  return ok(row as TRecord | null, "Store virtual sub-entity read completed.");
}

async function readProviderCount(
  read: StoreEntityRead,
  provider: RuntimeProviderSubEntityDefinition,
  context: StoreContext,
  options: StoreReadOptions = {},
): Promise<StoreResult<number>> {
  const valid = validateProviderContext(provider, context);
  if (!valid.ok) {
    return valid.result as StoreResult<number>;
  }
  const count = await provider.count?.(valid.context, options, createProviderApi(read)) ?? 0;
  return ok(Number(count) || 0, "Store virtual sub-entity count completed.");
}

function validateProviderContext(
  provider: RuntimeProviderSubEntityDefinition,
  context: StoreContext,
): {
  context: StoreContext;
  ok: true;
} | {
  ok: false;
  result: StoreResult<never>;
} {
  const validation = provider.validateContext?.(context);
  if (!validation || validation.ok === true) {
    const ctx = validation && "ctx" in validation ? validation.ctx || context : context;
    return {
      context: ctx as StoreContext,
      ok: true,
    };
  }
  return {
    ok: false,
    result: fail("store-invalid-context", "Store virtual sub-entity context is invalid."),
  };
}

function createProviderApi(read: StoreEntityRead): RuntimeProviderSubEntityApi {
  return {
    readAll: (entity, context, options) => read.all(entity, context, options),
    readById: (entity, id, context, options) => read.by(entity, {
      id,
    }, context, options),
    recorded_at: new Date().toISOString(),
  };
}

function isProviderSubEntityRegistry(input: unknown): input is RuntimeProviderSubEntityRegistry {
  return Boolean(input && typeof input === "object" && Object.values(input).some((value) => {
    return Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "provider");
  }));
}

export {
  isProviderSubEntityRegistry,
  wrapProviderSubEntities,
};
