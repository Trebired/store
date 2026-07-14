import { AsyncLocalStorage } from "node:async_hooks";

import type { StoreRequestContext, StoreRequestContextMeta } from "#y31thwq3bdf0";

const requestStorage = new AsyncLocalStorage<StoreRequestContext>();

function runWithStoreRequestContext<T>(run: () => T): T;
function runWithStoreRequestContext<T>(meta: StoreRequestContextMeta, run: () => T): T;
function runWithStoreRequestContext<T>(
  metaOrRun: StoreRequestContextMeta | (() => T),
  maybeRun?: () => T,
): T {
  const meta = typeof metaOrRun === "function" ? {} : metaOrRun;
  const run = typeof metaOrRun === "function" ? metaOrRun : maybeRun;
  if (!run) {
    throw new Error("Store request context handler is required.");
  }

  return requestStorage.run({
    entityLoaders: new Map(),
    meta,
    values: new Map(),
  }, run);
}

function getStoreRequestContext(): StoreRequestContext | null {
  return requestStorage.getStore() ?? null;
}

function getOrCreateRequestLoader<T>(key: string, create: () => T): T {
  const store = ensureRequestStore();
  if (!store.entityLoaders.has(key)) {
    store.entityLoaders.set(key, create());
  }

  return store.entityLoaders.get(key) as T;
}

function getOrCreateRequestValue<T>(key: string, create: () => T): T {
  const store = ensureRequestStore();
  if (!store.values.has(key)) {
    store.values.set(key, create());
  }

  return store.values.get(key) as T;
}

function clearRequestEntityLoaders(entity?: string): void {
  const store = requestStorage.getStore();
  if (!store) {
    return;
  }

  if (!entity) {
    store.entityLoaders.clear();
    return;
  }

  for (const key of store.entityLoaders.keys()) {
    if (key === entity || key.startsWith(`${entity}:`)) {
      store.entityLoaders.delete(key);
    }
  }
}

function ensureRequestStore(): StoreRequestContext {
  const store = requestStorage.getStore();
  if (!store) {
    throw new Error("No store request context is active.");
  }

  return store;
}

export {
  clearRequestEntityLoaders,
  getOrCreateRequestLoader,
  getOrCreateRequestValue,
  getStoreRequestContext,
  runWithStoreRequestContext,
};
