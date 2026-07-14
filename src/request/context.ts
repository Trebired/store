import { AsyncLocalStorage } from "node:async_hooks";

type RequestStore = {
  entityLoaders: Map<string, unknown>;
  values: Map<string, unknown>;
};

const requestStorage = new AsyncLocalStorage<RequestStore>();

function runWithStoreRequestContext<T>(run: () => T): T {
  return requestStorage.run({
    entityLoaders: new Map(),
    values: new Map(),
  }, run);
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

function ensureRequestStore(): RequestStore {
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
  runWithStoreRequestContext,
};
