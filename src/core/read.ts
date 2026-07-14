import type {
  StoreContext,
  StoreEntityRead,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import { validateContext, validateWhere } from "./validation.js";
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
  context: StoreContext,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<TRecord[]>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<TRecord[]>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<TRecord[]>;
  }

  const contextError = validateContext(resolved.value.name, resolved.value.definition, context, readOptions.scope);
  if (contextError) {
    return contextError as StoreResult<TRecord[]>;
  }

  return runtime.cachedRead(resolved.value, "all", {}, context, readOptions, async () => {
    const rows = await storage.value.all(resolved.value, context, runtime.toStorageOptions(readOptions));
    return runtime.mapRows<TRecord>(resolved.value, rows, context, readOptions);
  });
}

async function readBy<TRecord extends StoreRecord>(
  runtime: StoreRuntime,
  entityInput: string,
  where: StoreWhere,
  context: StoreContext,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<TRecord | null>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<TRecord | null>;
  }

  const invalid = validateWhere(resolved.value.name, where)
    || validateContext(resolved.value.name, resolved.value.definition, context, readOptions.scope);
  if (invalid) {
    return invalid as StoreResult<TRecord | null>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<TRecord | null>;
  }

  return runtime.cachedRead(resolved.value, "by", where, context, readOptions, async () => {
    const row = await storage.value.by(resolved.value, where, context, runtime.toStorageOptions(readOptions));
    return row ? runtime.mapRow<TRecord>(resolved.value, row, context, readOptions) : null;
  });
}

async function count(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContext,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<number>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<number>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<number>;
  }

  const contextError = validateContext(resolved.value.name, resolved.value.definition, context, readOptions.scope);
  if (contextError) {
    return contextError as StoreResult<number>;
  }

  return runtime.cachedRead(resolved.value, "count", {}, context, readOptions, () => {
    return storage.value.count(resolved.value, context, runtime.toStorageOptions(readOptions));
  });
}

async function hasAny(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContext,
  readOptions: StoreReadOptions = {},
): Promise<StoreResult<boolean>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<boolean>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<boolean>;
  }

  const contextError = validateContext(resolved.value.name, resolved.value.definition, context, readOptions.scope);
  if (contextError) {
    return contextError as StoreResult<boolean>;
  }

  return runtime.cachedRead(resolved.value, "hasAny", {}, context, readOptions, () => {
    return storage.value.hasAny(resolved.value, context, runtime.toStorageOptions(readOptions));
  });
}

export {
  createEntityRead,
};
