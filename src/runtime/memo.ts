import type {
  RuntimeRedisMemoAdapterInput,
  RuntimeMemoReadKeyInput,
  StoreRuntimeMemo,
  StoreRuntimeMemoOptions,
} from "./types.js";

type MemoEntry = {
  entity?: string;
  expiresAt: number;
  value: unknown;
  version: number;
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
  const invalidated = new Map<string, MemoEntry & { invalidatedAt: number }>();
  const inflight = new Map<string, Promise<unknown>>();
  const inflightEntity = new Map<string, string>();
  const versions = new Map<string, number>();
  const maxEntries = options.l1 === false ? 0 : options.l1?.maxEntries ?? 500;
  const ttlMs = options.l1 === false ? 0 : options.l1?.ttlMs ?? 30_000;
  const ignoredKeys = new Set([
    ...DEFAULT_IGNORED_KEYS,
    ...(options.ignoredKeys || []),
  ]);

  const memo: StoreRuntimeMemo = {
    entityVersion: (entity) => versions.get(entity) || 0,
    get: (key) => getValue(key, l1, options, versions),
    inspectRead: (key, entity) => inspectRead(key, entity, l1, invalidated, inflight, versions),
    invalidateEntity: async (entity) => {
      const version = applyInvalidation(entity, l1, invalidated, inflight, inflightEntity, versions);
      await options.redis?.publish("store:memo:invalidate", JSON.stringify({
        entity,
        invalidatedAt: Date.now(),
        version,
      }));
    },
    keyForRead: (input) => stableStringify(normalizeReadKey(input, ignoredKeys, versions)),
    run: (key, load, runOptions) => runMemo(key, load, runOptions, l1, inflight, inflightEntity, options, versions, ttlMs, maxEntries),
    set: (key, value, setOptions) => setValue(key, value, setOptions, l1, options, versions, ttlMs, maxEntries),
  };

  void options.redis?.subscribe?.("store:memo:invalidate", (message) => {
    const payload = parseInvalidation(message);
    applyInvalidation(payload.entity, l1, invalidated, inflight, inflightEntity, versions, payload.version, payload.invalidatedAt);
  });

  return memo;
}

async function getValue<T>(
  key: string,
  l1: Map<string, MemoEntry>,
  options: StoreRuntimeMemoOptions,
  versions: Map<string, number>,
): Promise<T | null> {
  const local = readL1<T>(key, l1);
  if (local !== null) {
    return local;
  }

  return await readL2<T>(key, options, l1, versions);
}

async function setValue<T>(
  key: string,
  value: T,
  options: { ttlMs?: number; entity?: string } | undefined,
  l1: Map<string, MemoEntry>,
  config: StoreRuntimeMemoOptions,
  versions: Map<string, number>,
  ttlMs: number,
  maxEntries: number,
): Promise<void> {
  const entry = writeL1(key, value, options?.ttlMs ?? ttlMs, options?.entity, l1, versions, maxEntries);
  await config.l2?.set(key, entry);
}

async function runMemo<T>(
  key: string,
  load: () => T | Promise<T>,
  options: { ttlMs?: number; entity?: string } | undefined,
  l1: Map<string, MemoEntry>,
  inflight: Map<string, Promise<unknown>>,
  inflightEntity: Map<string, string>,
  config: StoreRuntimeMemoOptions,
  versions: Map<string, number>,
  ttlMs: number,
  maxEntries: number,
): Promise<T> {
  const cached = await getValue<T>(key, l1, config, versions);
  if (cached !== null) {
    return cached;
  }

  const pending = inflight.get(key);
  if (pending) {
    return await pending as T;
  }

  const next = Promise.resolve(load());
  inflight.set(key, next);
  if (options?.entity) {
    inflightEntity.set(key, options.entity);
  }
  try {
    const value = await next;
    await setValue(key, value, options, l1, config, versions, ttlMs, maxEntries);
    return value;
  } finally {
    inflight.delete(key);
    inflightEntity.delete(key);
  }
}

function inspectRead(
  key: string,
  entity: string | undefined,
  l1: Map<string, MemoEntry>,
  invalidated: Map<string, MemoEntry & { invalidatedAt: number }>,
  inflight: Map<string, Promise<unknown>>,
  versions: Map<string, number>,
) {
  const invalidatedEntry = invalidated.get(key);
  const hit = readL1(key, l1) === null ? "miss" as const : "l1" as const;
  return {
    cached: hit !== "miss",
    enabled: true,
    hit,
    inflight: inflight.has(key),
    invalidated: Boolean(invalidatedEntry),
    invalidatedAt: invalidatedEntry?.invalidatedAt ? new Date(invalidatedEntry.invalidatedAt).toISOString() : "",
    invalidatedVersion: invalidatedEntry?.version || 0,
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
  versions: Map<string, number>,
  maxEntries: number,
): MemoEntry {
  const entry = {
    entity,
    expiresAt: Date.now() + ttlMs,
    value,
    version: entity ? versions.get(entity) || 0 : 0,
  };
  if (maxEntries <= 0) {
    return entry;
  }

  l1.set(key, entry);
  while (l1.size > maxEntries) {
    const oldest = l1.keys().next().value;
    if (oldest) {
      l1.delete(oldest);
    }
  }
  return entry;
}

function clearEntityKeys(l1: Map<string, MemoEntry>, entity: string): void {
  for (const [key, value] of l1) {
    if (value.entity === entity) {
      l1.delete(key);
    }
  }
}

async function readL2<T>(
  key: string,
  options: StoreRuntimeMemoOptions,
  l1: Map<string, MemoEntry>,
  versions: Map<string, number>,
): Promise<T | null> {
  const remote = await options.l2?.get<MemoEntry | T>(key);
  if (!remote) {
    return null;
  }
  if (!isMemoEntry(remote)) {
    return remote as T;
  }
  if (remote.expiresAt <= Date.now()) {
    await options.l2?.delete?.(key);
    return null;
  }
  if (remote.entity && remote.version < (versions.get(remote.entity) || 0)) {
    return null;
  }
  if (remote.entity) {
    versions.set(remote.entity, Math.max(versions.get(remote.entity) || 0, remote.version));
  }
  l1.set(key, remote);
  return remote.value as T;
}

function applyInvalidation(
  entity: string,
  l1: Map<string, MemoEntry>,
  invalidated: Map<string, MemoEntry & { invalidatedAt: number }>,
  inflight: Map<string, Promise<unknown>>,
  inflightEntity: Map<string, string>,
  versions: Map<string, number>,
  version?: number,
  invalidatedAt = Date.now(),
): number {
  const next = Math.max(version || 0, (versions.get(entity) || 0) + 1);
  versions.set(entity, next);
  for (const [key, value] of l1) {
    if (value.entity === entity) {
      l1.delete(key);
      invalidated.set(key, {
        ...value,
        invalidatedAt,
        version: next,
      });
    }
  }
  for (const [key, value] of invalidated) {
    if (value.entity === entity) {
      invalidated.set(key, {
        ...value,
        invalidatedAt,
        version: next,
      });
    }
  }
  for (const [key, value] of inflightEntity) {
    if (value === entity) {
      inflight.delete(key);
      inflightEntity.delete(key);
    }
  }
  return next;
}

function createRedisMemoAdapter(input: RuntimeRedisMemoAdapterInput) {
  return {
    delete: async (key: string) => {
      await input.del?.(key);
    },
    get: async <T>(key: string) => input.getJson<T>(key),
    publish: async (channel: string, message: string) => {
      await input.publishJson?.(channel, JSON.parse(message));
    },
    set: async <T>(key: string, value: T) => {
      await input.setJson(key, value);
    },
    subscribe: async (channel: string, handler: (message: string) => void) => {
      await input.subscribeJson?.(channel, (payload) => handler(JSON.stringify(payload)));
    },
  };
}

function parseInvalidation(message: string): { entity: string; invalidatedAt: number; version?: number } {
  try {
    const value = JSON.parse(message) as Record<string, unknown>;
    return {
      entity: String(value.entity || ""),
      invalidatedAt: Number(value.invalidatedAt) || Date.parse(String(value.invalidated_at || "")) || Date.now(),
      version: Number(value.version) || undefined,
    };
  } catch {
    return {
      entity: message,
      invalidatedAt: Date.now(),
    };
  }
}

function isMemoEntry(value: unknown): value is MemoEntry {
  return Boolean(value && typeof value === "object" && "expiresAt" in value && "value" in value);
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
  createRedisMemoAdapter,
  createRuntimeMemo,
};
