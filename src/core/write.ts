import { clearRequestEntityLoaders } from "#g8u7bg42czn8";
import type {
  StoreContext,
  StoreEntityWrite,
  StoreRecord,
  StoreResult,
  StoreWhere,
  StoreWriteOptions,
} from "#y31thwq3bdf0";
import { assertWritableRecord } from "./enriched.js";
import { ok, storageFail } from "./result.js";
import type { StoreRuntime } from "./runtime.js";
import {
  applyRequiredContext,
  validateContext,
  validateId,
  validateRecord,
} from "./validation.js";

function createEntityWrite(
  runtime: StoreRuntime,
  readBy: (entity: string, where: StoreWhere, context: StoreContext, options?: { mode?: "raw"; cacheBypass?: boolean; scope?: "context" | "all" }) => Promise<StoreResult<StoreRecord | null>>,
): StoreEntityWrite {
  return {
    by: (entity, where, context, patch, options) => writeBy(runtime, readBy, entity, where, context, patch, options),
    put: (entity, context, record, options) => put(runtime, entity, context, record, options),
    remove: (entity, context, id, options) => remove(runtime, entity, context, id, options),
  };
}

async function put<TRecord extends StoreRecord>(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContext,
  record: TRecord,
  writeOptions: StoreWriteOptions = {},
): Promise<StoreResult<TRecord>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<TRecord>;
  }

  const invalid = validateWriteInput(resolved.value.name, resolved.value.definition, context, record, writeOptions);
  if (invalid) {
    return invalid as StoreResult<TRecord>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<TRecord>;
  }

  try {
    const stored = applyRequiredContext(record, resolved.value.definition, context) as TRecord;
    const out = await storage.value.put(resolved.value, context, stored, writeOptions);
    invalidate(runtime, resolved.value.name);
    runtime.logger?.info("store.write", "Store record saved.", {
      entity: resolved.value.name,
      id: out.id,
      operation: "put",
    });
    return ok(out as TRecord, "Store record saved.");
  } catch (error) {
    runtime.logger?.error("store.write", "Store record save failed.", {
      entity: resolved.value.name,
      error,
      operation: "put",
    });
    return storageFail(error, resolved.value.name, resolved.value.definition.storage);
  }
}

async function writeBy(
  runtime: StoreRuntime,
  readBy: (entity: string, where: StoreWhere, context: StoreContext, options?: { mode?: "raw"; cacheBypass?: boolean; scope?: "context" | "all" }) => Promise<StoreResult<StoreRecord | null>>,
  entityInput: string,
  where: StoreWhere,
  context: StoreContext,
  patch: StoreWhere,
  writeOptions: StoreWriteOptions = {},
): Promise<StoreResult<StoreRecord | null>> {
  const current = await readBy(entityInput, where, context, {
    cacheBypass: true,
    mode: "raw",
    scope: writeOptions.scope,
  });
  if (!current.ok || !current.data) {
    return current as StoreResult<StoreRecord | null>;
  }

  return put(runtime, entityInput, context, {
    ...current.data,
    ...patch,
    id: current.data.id,
  }, writeOptions);
}

async function remove(
  runtime: StoreRuntime,
  entityInput: string,
  context: StoreContext,
  id: string,
  writeOptions: StoreWriteOptions = {},
): Promise<StoreResult<boolean>> {
  const resolved = runtime.resolveEntity(entityInput);
  if (!resolved.ok) {
    return resolved.result as StoreResult<boolean>;
  }

  const invalid = validateContext(resolved.value.name, resolved.value.definition, context, writeOptions.scope)
    || validateId(resolved.value.name, id);
  if (invalid) {
    return invalid as StoreResult<boolean>;
  }

  const storage = runtime.resolveStorageResult(resolved.value);
  if (!storage.ok) {
    return storage.result as StoreResult<boolean>;
  }

  try {
    const removed = await storage.value.remove(resolved.value, context, id, writeOptions);
    invalidate(runtime, resolved.value.name);
    runtime.logger?.info("store.write", "Store record remove completed.", {
      entity: resolved.value.name,
      id,
      operation: "remove",
      removed,
    });
    return ok(removed, removed ? "Store record removed." : "Store record was already absent.");
  } catch (error) {
    runtime.logger?.error("store.write", "Store record remove failed.", {
      entity: resolved.value.name,
      error,
      id,
      operation: "remove",
    });
    return storageFail(error, resolved.value.name, resolved.value.definition.storage);
  }
}

function validateWriteInput(
  entity: string,
  definition: Parameters<typeof validateContext>[1],
  context: StoreContext,
  record: StoreRecord,
  writeOptions: StoreWriteOptions,
) {
  return validateContext(entity, definition, context, writeOptions.scope)
    || validateRecord(entity, record)
    || assertWritableRecord(entity, record);
}

function invalidate(runtime: StoreRuntime, entity: string): void {
  clearRequestEntityLoaders(entity);
  runtime.invalidate(entity);
}

export {
  createEntityWrite,
};
