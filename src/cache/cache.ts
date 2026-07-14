import type {
  L2CacheAdapter,
  StoreCacheInspection,
  StoreCacheOptions,
  StoreCacheState,
  StoreContext,
} from "#y31thwq3bdf0";

type CacheEntry<T> = {
  entity: string;
  value: T;
  version: number;
};

const DEFAULT_IGNORED_KEYS = [
  "request",
  "req",
  "res",
  "response",
  "runtime",
  "frontend",
  "loader",
  "signal",
];

class StoreCache {
  private readonly enabled: boolean;
  private readonly ignoredKeys: Set<string>;
  private readonly l1 = new Map<string, CacheEntry<unknown>>();
  private readonly l2?: L2CacheAdapter;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly entityKeys = new Map<string, Set<string>>();
  private readonly versions = new Map<string, number>();

  constructor(options?: boolean | StoreCacheOptions) {
    const config = typeof options === "object" ? options : {};
    this.enabled = options === true || config.enabled === true || Boolean(config.l2);
    this.l2 = config.l2;
    this.ignoredKeys = new Set([
      ...DEFAULT_IGNORED_KEYS,
      ...(config.ignoredContextKeys || []),
    ]);
  }

  inspect(): StoreCacheState {
    return {
      enabled: this.enabled,
      entityVersions: Object.fromEntries(this.versions),
      inflight: this.inflight.size,
      l1Size: this.l1.size,
      trackedKeys: Object.fromEntries([...this.entityKeys].map(([key, value]) => [key, value.size])),
    };
  }

  version(entity: string): number {
    return this.versions.get(entity) || 0;
  }

  createKey(entity: string, operation: string, input: unknown, context: StoreContext, mode: string): string {
    return stableStringify({
      context: this.filterContext(context),
      entity,
      input,
      mode,
      operation,
      version: this.version(entity),
    });
  }

  async read<T>(entity: string, key: string, load: () => Promise<T>, bypass = false): Promise<{
    inspection: StoreCacheInspection;
    value: T;
  }> {
    const base = this.createInspection(entity, key, "miss");
    if (!this.enabled || bypass) {
      return {
        inspection: {
          ...base,
          enabled: this.enabled,
        },
        value: await load(),
      };
    }

    const l1 = this.l1.get(key);
    if (l1 && l1.version === this.version(entity)) {
      return {
        inspection: this.createInspection(entity, key, "l1"),
        value: l1.value as T,
      };
    }

    const deduped = this.inflight.get(key);
    if (deduped) {
      return {
        inspection: this.createInspection(entity, key, "deduped"),
        value: await deduped as T,
      };
    }

    const pending = this.readAndStore(entity, key, load);
    this.inflight.set(key, pending);
    try {
      const value = await pending;
      return {
        inspection: base,
        value,
      };
    } finally {
      this.inflight.delete(key);
    }
  }

  invalidateEntity(entity: string): void {
    this.versions.set(entity, this.version(entity) + 1);
    const keys = this.entityKeys.get(entity);
    if (!keys) {
      return;
    }

    for (const key of keys) {
      this.l1.delete(key);
      void this.l2?.delete?.(key);
    }

    keys.clear();
  }

  private async readAndStore<T>(entity: string, key: string, load: () => Promise<T>): Promise<T> {
    const l2Value = await this.l2?.get<T>(key);
    if (l2Value !== null && l2Value !== undefined) {
      this.track(entity, key);
      this.l1.set(key, {
        entity,
        value: l2Value,
        version: this.version(entity),
      });
      return l2Value;
    }

    const value = await load();
    this.track(entity, key);
    this.l1.set(key, {
      entity,
      value,
      version: this.version(entity),
    });
    await this.l2?.set(key, value);
    return value;
  }

  private createInspection(entity: string, key: string | null, hit: StoreCacheInspection["hit"]): StoreCacheInspection {
    return {
      enabled: this.enabled,
      hit,
      key,
      version: this.version(entity),
    };
  }

  private filterContext(context: StoreContext): StoreContext {
    return Object.fromEntries(Object.entries(context).filter(([key]) => !this.ignoredKeys.has(key)));
  }

  private track(entity: string, key: string): void {
    const keys = this.entityKeys.get(entity) || new Set<string>();
    keys.add(key);
    this.entityKeys.set(entity, keys);
  }
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
  StoreCache,
};
