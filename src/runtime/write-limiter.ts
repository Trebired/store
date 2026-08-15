import type { MaybePromise } from "#y31thwq3bdf0";

interface StoreWriteLimiterOptions {
  enabled?: boolean;
  maxConcurrency?: number;
  minTimeMs?: number;
  redis?: StoreWriteLimiterRedisAdapter | null;
}

interface StoreWriteLimiterRedisAdapter {
  isEnabled ? () : boolean;
  setIfNotExists ? (key: string, value: string, ttlMs: number) : MaybePromise<boolean>;
}

interface StoreWriteLimiter {
  acquireWriteWindow(subsystem: string, key: unknown, ttlMs: number): Promise<boolean>;
  scheduleWrite<T>(subsystem: string, key: unknown, handler: () => Promise<T>): Promise<T>;
}

type QueueItem = {
  run: () => Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
};

function createStoreWriteLimiter(options: StoreWriteLimiterOptions = {}): StoreWriteLimiter {
  const localWindows = new Map<string, number>();
  const queues = new Map<string, QueueItem[]>();
  const active = new Map<string, number>();
  const nextAllowedAt = new Map<string, number>();
  const config = normalizeWriteLimiterOptions(options);

  async function scheduleWrite<T>(
    subsystem: string,
    key: unknown,
    handler: () => Promise<T>,
  ): Promise<T> {
    if (!config.enabled) return await handler();
    const queueKey = limiterQueueKey(subsystem, key);
    return await new Promise<T>((resolve, reject) => {
        const item = {
          reject,
          resolve: resolve as(value: unknown) => void,
          run: handler as() => Promise<unknown>,
        };
        queues.set(queueKey, [...(queues.get(queueKey) || []), item]);
        drainQueue(queueKey, queues, active, nextAllowedAt, config);
    });
  }

  async function acquireWriteWindow(subsystem: string, key: unknown, ttlMs: number): Promise<boolean> {
    const safeTtlMs = Math.max(0, Math.floor(Number(ttlMs) || 0));
    if (safeTtlMs <= 0) return true;
    const localKey = limiterQueueKey(subsystem, key);
    const now = Date.now();
    pruneLocalWindows(localWindows, now);
    if (options.redis?.isEnabled?.() && options.redis.setIfNotExists) {
      const ok = await options.redis.setIfNotExists(`write-window:${localKey}`, "1", safeTtlMs);
      if (ok) localWindows.set(localKey, now + safeTtlMs);
      return ok;
    }

    const existing = localWindows.get(localKey);
    if (Number.isFinite(existing) && Number(existing) > now) return false;
    localWindows.set(localKey, now + safeTtlMs);
    return true;
  }

  return {
    acquireWriteWindow,
    scheduleWrite,
  };
}

function drainQueue(
  key: string,
  queues: Map<string, QueueItem[]>,
  active: Map<string, number>,
  nextAllowedAt: Map<string, number>,
  config: Required<Pick<StoreWriteLimiterOptions, "enabled"|"maxConcurrency"|"minTimeMs">>,
): void {
  const currentActive = active.get(key) || 0;
  if (currentActive >= config.maxConcurrency) return;
  const queue = queues.get(key) || [];
  const item = queue.shift();
  if (!item) return;
  queues.set(key, queue);
  const delay = Math.max(0, (nextAllowedAt.get(key) || 0) - Date.now());
  active.set(key, currentActive + 1);
  setTimeout(() => {
      nextAllowedAt.set(key, Date.now() + config.minTimeMs);
      void item.run().then(item.resolve, item.reject).finally(() => {
          active.set(key, Math.max(0, (active.get(key) || 1) - 1));
          drainQueue(key, queues, active, nextAllowedAt, config);
      });
    }, delay);
}

function normalizeWriteLimiterOptions(
  options: StoreWriteLimiterOptions,
): Required<Pick<StoreWriteLimiterOptions, "enabled"|"maxConcurrency"|"minTimeMs">> {
  return {
    enabled: options.enabled ?? true,
    maxConcurrency: Math.max(1, Math.floor(Number(options.maxConcurrency) || 1)),
    minTimeMs: Math.max(0, Math.floor(Number(options.minTimeMs) || 0)),
  };
}

function limiterQueueKey(subsystem: string, key: unknown): string {
  return `${String(subsystem || "default").trim() || "default"}:${String(key || "global").trim() || "global"}`;
}

function pruneLocalWindows(windows: Map<string, number>, now = Date.now()): void {
  for (const [key, expiresAt] of windows.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      windows.delete(key);
    }
  }
}

export { createStoreWriteLimiter };
export type {
  StoreWriteLimiter,
  StoreWriteLimiterOptions,
  StoreWriteLimiterRedisAdapter,
};
