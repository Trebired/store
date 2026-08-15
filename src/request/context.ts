import { AsyncLocalStorage } from "node:async_hooks";

import type { StoreRequestContext, StoreRequestContextMeta } from "#y31thwq3bdf0";
import { stableStringify } from "#yfg488ybfy5n";

const requestStorage = new AsyncLocalStorage<StoreRequestContext>();

type StoreRequestContextKeyInput = string | Record<string, unknown>;

function runWithStoreRequestContext<T>(run: () => T): T;
function runWithStoreRequestContext<T>(meta: StoreRequestContextMeta | null | undefined, run: () => T): T;
function runWithStoreRequestContext<T>(
  metaOrRun: StoreRequestContextMeta | null | undefined | (() => T),
  maybeRun?: () => T,
): T {
  const meta = typeof metaOrRun === "function" ? {} : metaOrRun;
  const run = typeof metaOrRun === "function" ? metaOrRun : maybeRun;
  if (!run) {
    throw new Error("Store request context handler is required.");
  }
  if (requestStorage.getStore()) {
    return run();
  }

  return requestStorage.run({
      entityLoaders: new Map(),
      meta: meta && typeof meta === "object" ? meta : {},
      values: new Map(),
    }, run);
}

function getStoreRequestContext(): StoreRequestContext | null {
  return requestStorage.getStore() ?? null;
}

function bindExpressStoreRequestContext(req: unknown, res: unknown, next: () => void): void {
  return runWithStoreRequestContext({ kind: "http", req, res }, () => {
      const locals = (res as { locals?: Record<string, unknown> } | null | undefined)?.locals;
      if (locals && typeof locals === "object") {
        locals.storeRequestContext = true;
      }
      next();
  });
}

function getOrCreateRequestLoader<T>(key: StoreRequestContextKeyInput, create: () => T): T {
  const store = requestStorage.getStore();
  if (!store) {
    return create();
  }
  const normalizedKey = storeRequestKey(key);
  if (!store.entityLoaders.has(normalizedKey)) {
    store.entityLoaders.set(normalizedKey, create());
  }

  return store.entityLoaders.get(normalizedKey) as T;
}

function getOrCreateRequestValue<T>(key: StoreRequestContextKeyInput, create: () => T): T {
  const store = requestStorage.getStore();
  if (!store) {
    return create();
  }
  const normalizedKey = storeRequestKey(key);
  if (!store.values.has(normalizedKey)) {
    store.values.set(normalizedKey, create());
  }

  return store.values.get(normalizedKey) as T;
}

function clearRequestEntityLoaders(entity?: unknown): void {
  const store = requestStorage.getStore();
  if (!store) {
    return;
  }
  const entityName = String(entity || "").trim();

  if (!entityName) {
    store.entityLoaders.clear();
    return;
  }

  for (const key of store.entityLoaders.keys()) {
    if (key === entityName || key.startsWith(`${entityName}:`)) {
      store.entityLoaders.delete(key);
    }
  }
}

function storeRequestKey(input: StoreRequestContextKeyInput): string {
  if (typeof input === "string") {
    return input;
  }
  const entity = String(input.entity || "").trim();
  const key = stableStringify(normalizeRequestKeyValue(input));
  return entity ? `${entity}:${key}` : key;
}

function normalizeRequestKeyValue(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(normalizeRequestKeyValue);
  if (typeof value !== "object") {
    return typeof value === "function" ? null : value;
  }

  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .sort()
    .flatMap((key) => {
        const next = (value as Record<string, unknown>)[key];
        if (next === undefined || typeof next === "function") return [];
        if (key === "req" || key === "res" || key === "meta") return [];
        return [[key, normalizeRequestKeyValue(next)]];
  }));
}

export {
  bindExpressStoreRequestContext,
  clearRequestEntityLoaders,
  getOrCreateRequestLoader,
  getOrCreateRequestValue,
  getStoreRequestContext,
  runWithStoreRequestContext,
  storeRequestKey,
};
export type {
  StoreRequestContextKeyInput,
};
