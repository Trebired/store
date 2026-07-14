import type {
  StoreContext,
  StoreContextInput,
  StoreEntityRead,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import { normalizeContext, validateContext, validateOptionalWhere, validateWhere } from "./validation.js";
import type { StoreRuntime } from "./runtime.js";

function createEntityRead(runtime: StoreRuntime): StoreEntityRead {
  return {
    all: (entity, context, options) => readAll(runtime, entity, context, options),
    by: (entity, where, context, options) => readBy(runtime, entity, where, context, options),
    count: (entity, context, options) => count(runtime, entity, context, options),
    hasAny: (entity, context, options) => hasAny(runtime, entity, context, options),
  };
}

async function readAll<TRecord extends StoreRecord>(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContextInput,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<TRecord[]>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<TRecord[]>;
  }

  const normalized = normalizeContext(resolved.value.name, context);
  if (!normalized.ok) {
    return normalized as StoreResult<TRecord[]>;
  }
  const ctx = normalized.data || {};
  const contextError = validateContext(resolved.value.name, resolved.value.definition, ctx, readOptions.scope);
  const whereError = validateOptionalWhere(resolved.value.name, readOptions.where);
  if (contextError || whereError) {
    return (contextError || whereError) as StoreResult<TRecord[]>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<TRecord[]>;
  }

  return runtime.cachedRead(resolved.value, "all", readOptions.where ?? {}, ctx, readOptions, async () => {
    const rows = await storage.value.all(resolved.value, ctx, runtime.toStorageOptions(readOptions));
    return runtime.mapRows<TRecord>(resolved.value, rows, ctx, readOptions);
  });
}

async function readBy<TRecord extends StoreRecord>(
  runtime: StoreRuntime,
  entityInput: string,
  where: StoreWhere,
  context: StoreContextInput,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<TRecord | null>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<TRecord | null>;
  }

  const normalized = normalizeContext(resolved.value.name, context);
  if (!normalized.ok) {
    return normalized as StoreResult<TRecord | null>;
  }
  const ctx = normalized.data || {};
  const invalid = validateWhere(resolved.value.name, where)
    || validateOptionalWhere(resolved.value.name, readOptions.where)
    || validateContext(resolved.value.name, resolved.value.definition, ctx, readOptions.scope);
  if (invalid) {
    return invalid as StoreResult<TRecord | null>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<TRecord | null>;
  }

  return runtime.cachedRead(resolved.value, "by", where, ctx, readOptions, async () => {
    const row = await storage.value.by(resolved.value, where, ctx, runtime.toStorageOptions(readOptions));
    return row ? runtime.mapRow<TRecord>(resolved.value, row, ctx, readOptions) : null;
  });
}

async function count(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContextInput,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<number>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<number>;
  }

  const normalized = normalizeContext(resolved.value.name, context);
  if (!normalized.ok) {
    return normalized as StoreResult<number>;
  }
  const ctx = normalized.data || {};
  const contextError = validateContext(resolved.value.name, resolved.value.definition, ctx, readOptions.scope);
  const whereError = validateOptionalWhere(resolved.value.name, readOptions.where);
  if (contextError || whereError) {
    return (contextError || whereError) as StoreResult<number>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<number>;
  }

  return runtime.cachedRead(resolved.value, "count", readOptions.where ?? {}, ctx, readOptions, () => {
    return storage.value.count(resolved.value, ctx, runtime.toStorageOptions(readOptions));
  });
}

async function hasAny(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContextInput,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<boolean>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<boolean>;
  }

  const normalized = normalizeContext(resolved.value.name, context);
  if (!normalized.ok) {
    return normalized as StoreResult<boolean>;
  }
  const ctx = normalized.data || {};
  const contextError = validateContext(resolved.value.name, resolved.value.definition, ctx, readOptions.scope);
  const whereError = validateOptionalWhere(resolved.value.name, readOptions.where);
  if (contextError || whereError) {
    return (contextError || whereError) as StoreResult<boolean>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<boolean>;
  }

  return runtime.cachedRead(resolved.value, "hasAny", readOptions.where ?? {}, ctx, readOptions, () => {
    return storage.value.hasAny(resolved.value, ctx, runtime.toStorageOptions(readOptions));
  });
}

export {
  createEntityRead,
};
