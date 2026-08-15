import type {
  RuntimeMemoReadKeyInput,
  StoreRuntimeMemo,
} from "./types.js";

interface StoreMemoCacheFacade {
  deleteByEntity(entity: unknown): void;
  deleteByEntityAsync(entity: unknown): Promise<void>;
  entityVersion(entity: unknown): number;
  get<T=unknown>(key: string): Promise<T|null>;
  getAsync<T=unknown>(key: string, entity?: string): Promise<T|null>;
  inspectRead(key: string, entity?: string): ReturnType<StoreRuntimeMemo["inspectRead"]>;
  keyForRead(input: StoreMemoCacheReadKeyInput): string;
  run<T>(key: string, entity: unknown, loader: () => Promise<T>|T): Promise<T>;
  setCacheValue(key: string, entity: unknown, value: unknown, options?: StoreMemoCacheSetOptions): void;
  setCacheValueAsync(key: string, entity: unknown, value: unknown, options?: StoreMemoCacheSetOptions): Promise<void>;
}

type StoreMemoCacheReadKeyInput = Partial<RuntimeMemoReadKeyInput>& {
  ctx?: RuntimeMemoReadKeyInput["context"];
  op?: RuntimeMemoReadKeyInput["operation"];
  opts?: RuntimeMemoReadKeyInput["options"];
};

interface StoreMemoCacheSetOptions {
  ttlMs?: number;
  version?: number;
}

function createStoreMemoCache(memo: StoreRuntimeMemo): StoreMemoCacheFacade {
  return {
    deleteByEntity: (entity) => {
      void memo.invalidateEntity(normalizedEntity(entity));
    },
    deleteByEntityAsync: async(entity) => {
      await memo.invalidateEntity(normalizedEntity(entity));
    },
    entityVersion: (entity) => memo.entityVersion(normalizedEntity(entity)),
    get: (key) => memo.get(key),
    getAsync: (key) => memo.get(key),
    inspectRead: (key, entity = "") => memo.inspectRead(key, entity),
    keyForRead: (input) => memo.keyForRead(normalizeReadKeyInput(input)),
    run: (key, entity, loader) =>
    memo.run(key, loader, {
        entity: normalizedEntity(entity),
    }),
    setCacheValue: (key, entity, value, options = {}) => {
      void memo.set(key, value, cacheSetOptions(entity, options));
    },
    setCacheValueAsync: async(key, entity, value, options = {}) => {
      await memo.set(key, value, cacheSetOptions(entity, options));
    },
  };
}

function cacheSetOptions(entity: unknown, options: StoreMemoCacheSetOptions) {
  return {
    entity: normalizedEntity(entity),
    ttlMs: Number(options.ttlMs) || undefined,
  };
}

function normalizeReadKeyInput(input: StoreMemoCacheReadKeyInput): RuntimeMemoReadKeyInput {
  const source = input && typeof input === "object" ? input : {};
  return {
    context: source.context || source.ctx,
    entity: normalizedEntity(source.entity),
    input: source.input,
    mode: source.mode,
    operation: String(source.operation || source.op || "read"),
    options: source.options || source.opts,
    where: source.where,
  };
}

function normalizedEntity(entity: unknown): string {
  return String(entity || "");
}

export {
  createStoreMemoCache,
};
export type {
  StoreMemoCacheFacade,
  StoreMemoCacheReadKeyInput,
  StoreMemoCacheSetOptions,
};
