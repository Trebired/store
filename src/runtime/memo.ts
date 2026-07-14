import type {
  RuntimeMemoReadKeyInput,
  StoreRuntimeMemo,
  StoreRuntimeMemoOptions,
} from "./types.js";

type MemoEntry = {
  entity?: string;
  expiresAt: number;
  value: unknown;
};

const DEFAULT_IGNORED_KEYS = [
  "req",
  "res",
  "request",
  "response",
  "meta",
  "frontend",
  "runtime",
  "cacheBypass",
  "cache",
  "signal",
];

function createRuntimeMemo(options: StoreRuntimeMemoOptions = {}): StoreRuntimeMemo {
  const l1 = new Map<string, MemoEntry>();
  const inflight = new Map<string, Promise<unknown>>();
  const versions = new Map<string, number>();
  const maxEntries = options.l1 === false ? 0 : options.l1?.maxEntries ?? 500;
  const ttlMs = options.l1 === false ? 0 : options.l1?.ttlMs ?? 30_000;
  const ignoredKeys = new Set([
    ...DEFAULT_IGNORED_KEYS,
    ...(options.ignoredKeys || []),
  ]);

  const memo: StoreRuntimeMemo = {
    entityVersion: (entity) => versions.get(entity) || 0,
    get: (key) => getValue(key, l1, options),
    inspectRead: (key, entity) => inspectRead(key, entity, l1, versions),
    invalidateEntity: async (entity) => {
      versions.set(entity, (versions.get(entity) || 0) + 1);
      clearEntityKeys(l1, entity);
      await options.redis?.publish("store:memo:invalidate", entity);
    },
    keyForRead: (input) => stableStringify(normalizeReadKey(input, ignoredKeys, versions)),
    run: (key, load, runOptions) => runMemo(key, load, runOptions, l1, inflight, options, ttlMs, maxEntries),
    set: (key, value, setOptions) => setValue(key, value, setOptions, l1, options, ttlMs, maxEntries),
  };

  void options.redis?.subscribe?.("store:memo:invalidate", (entity) => {
    versions.set(entity, (versions.get(entity) || 0) + 1);
    clearEntityKeys(l1, entity);
  });

  return memo;
}

async function getValue<T>(
  key: string,
  l1: Map<string, MemoEntry>,
  options: StoreRuntimeMemoOptions,
): Promise<T | null> {
  const local = readL1<T>(key, l1);
  if (local !== null) {
    return local;
  }

  return await options.l2?.get<T>(key) ?? null;
}

async function setValue<T>(
  key: string,
  value: T,
  options: { ttlMs?: number; entity?: string } | undefined,
  l1: Map<string, MemoEntry>,
  config: StoreRuntimeMemoOptions,
  ttlMs: number,
  maxEntries: number,
): Promise<void> {
  writeL1(key, value, options?.ttlMs ?? ttlMs, options?.entity, l1, maxEntries);
  await config.l2?.set(key, value);
}

async function runMemo<T>(
  key: string,
  load: () => T | Promise<T>,
  options: { ttlMs?: number; entity?: string } | undefined,
  l1: Map<string, MemoEntry>,
  inflight: Map<string, Promise<unknown>>,
  config: StoreRuntimeMemoOptions,
  ttlMs: number,
  maxEntries: number,
): Promise<T> {
  const cached = await getValue<T>(key, l1, config);
  if (cached !== null) {
    return cached;
  }

  const pending = inflight.get(key);
  if (pending) {
    return await pending as T;
  }

  const next = Promise.resolve(load());
  inflight.set(key, next);
  try {
    const value = await next;
    await setValue(key, value, options, l1, config, ttlMs, maxEntries);
    return value;
  } finally {
    inflight.delete(key);
  }
}

function inspectRead(
  key: string,
  entity: string | undefined,
  l1: Map<string, MemoEntry>,
  versions: Map<string, number>,
) {
  return {
    hit: readL1(key, l1) === null ? "miss" as const : "l1" as const,
    key,
    version: entity ? versions.get(entity) || 0 : 0,
  };
}

function readL1<T>(key: string, l1: Map<string, MemoEntry>): T | null {
  const entry = l1.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    l1.delete(key);
    return null;
  }
  return entry.value as T;
}

function writeL1(
  key: string,
  value: unknown,
  ttlMs: number,
  entity: string | undefined,
  l1: Map<string, MemoEntry>,
  maxEntries: number,
): void {
  if (maxEntries <= 0) {
    return;
  }

  l1.set(key, {
    entity,
    expiresAt: Date.now() + ttlMs,
    value,
  });
  while (l1.size > maxEntries) {
    const oldest = l1.keys().next().value;
    if (oldest) {
      l1.delete(oldest);
    }
  }
}

function clearEntityKeys(l1: Map<string, MemoEntry>, entity: string): void {
  for (const [key, value] of l1) {
    if (value.entity === entity) {
      l1.delete(key);
    }
  }
}

function normalizeReadKey(
  input: RuntimeMemoReadKeyInput,
  ignoredKeys: Set<string>,
  versions: Map<string, number>,
): Record<string, unknown> {
  return {
    context: filterObject(input.context || {}, ignoredKeys),
    entity: input.entity,
    input: filterUnknown(input.input, ignoredKeys),
    mode: input.mode || "full",
    operation: input.operation,
    options: filterObject(input.options || {}, ignoredKeys),
    version: versions.get(input.entity) || 0,
    where: filterObject(input.where || {}, ignoredKeys),
  };
}

function filterUnknown(value: unknown, ignoredKeys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => filterUnknown(item, ignoredKeys));
  }
  if (value && typeof value === "object") {
    return filterObject(value as Record<string, unknown>, ignoredKeys);
  }
  return value;
}

function filterObject(value: Record<string, unknown>, ignoredKeys: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !ignoredKeys.has(key))
    .map(([key, item]) => [key, filterUnknown(item, ignoredKeys)]));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export {
  createRuntimeMemo,
};
