import { StoreCache } from "#oz5habwl5021";
import { resolveEntityDefinition } from "#8pewakkhamie";
import type {
  CreateStoreOptions,
  EntityDefinition,
  ResolvedEntity,
  StorageAdapter,
  StoreContext,
  StoreMode,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
} from "#y31thwq3bdf0";
import { assertReadableRawRecord, markEnrichedRecord } from "./enriched.js";
import { redactPrivateFields } from "./private.js";
import { fail, ok, storageFail } from "./result.js";

class StoreOperationError extends Error {
  constructor(readonly result: StoreResult<never>) {
    super(result.message);
  }
}

class StoreRuntime {
  readonly cache: StoreCache;
  private readonly resolveStorage: (definition: EntityDefinition) => StorageAdapter | null;

  constructor(readonly options: CreateStoreOptions) {
    this.cache = new StoreCache(options.cache);
    this.resolveStorage = createStorageResolver(options);
  }

  resolveEntity(entityInput: string): StoreRuntimeResolved<ResolvedEntity> {
    const value = resolveEntityDefinition(this.options.entities, entityInput);
    if (!value) {
      return unresolved("store-entity-not-found", "Store entity is not registered.", entityInput, 404);
    }

    return {
      ok: true,
      value,
    };
  }

  resolveStorageResult(entity: ResolvedEntity): StoreRuntimeResolved<StorageAdapter> {
    const value = this.resolveStorage(entity.definition);
    if (!value) {
      return unresolved("store-storage-error", "Store storage adapter is not registered.", entity.name, 500, {
        storage: entity.definition.storage,
      });
    }

    return {
      ok: true,
      value,
    };
  }

  async cachedRead<T>(
    entity: ResolvedEntity,
    operation: string,
    input: unknown,
    context: StoreContext,
    readOptions: StoreReadOptions,
    load: () => Promise<T>,
  ): Promise<StoreResult<T>> {
    try {
      const mode = readOptions.mode || "full";
      const key = this.cache.createKey(entity.name, operation, createReadKeyInput(input, readOptions), context, mode);
      const cached = await this.cache.read(entity.name, key, load, readOptions.cacheBypass || readOptions.cache === false);
      return ok(cached.value, "Store read completed.", readOptions.cacheMeta ? {
        cache: cached.inspection,
      } : undefined);
    } catch (error) {
      return error instanceof StoreOperationError
        ? error.result as StoreResult<T>
        : storageFail(error, entity.name, entity.definition.storage);
    }
  }

  async mapRows<TRecord extends StoreRecord>(
    entity: ResolvedEntity,
    rows: StoreRecord[],
    context: StoreContext,
    readOptions: StoreReadOptions,
  ): Promise<TRecord[]> {
    const out: TRecord[] = [];
    for (const row of rows) {
      out.push(await this.mapRow<TRecord>(entity, row, context, readOptions));
    }

    return out;
  }

  async mapRow<TRecord extends StoreRecord>(
    entity: ResolvedEntity,
    row: StoreRecord,
    context: StoreContext,
    readOptions: StoreReadOptions,
  ): Promise<TRecord> {
    assertReadable(entity, row);
    if (readOptions.mode === "raw") {
      return structuredClone(row) as TRecord;
    }

    const mode = readOptions.mode || "full";
    const enriched = await this.enrichRecord(entity, structuredClone(row), context, mode);
    const redacted = redactPrivateFields(enriched, entity.definition, readOptions.includePrivate);
    return markEnrichedRecord(redacted) as TRecord;
  }

  invalidate(entity: string): void {
    this.cache.invalidateEntity(entity);
  }

  toStorageOptions(options: StoreReadOptions) {
    return {
      bypassCache: options.cacheBypass,
      scope: options.scope,
    };
  }

  private async enrichRecord(
    entity: ResolvedEntity,
    record: StoreRecord,
    context: StoreContext,
    mode: StoreMode,
  ): Promise<StoreRecord> {
    if (mode === "full") {
      return record;
    }

    const modeDefinition = entity.definition.modes?.[mode];
    if (!modeDefinition) {
      throw new StoreOperationError(fail("store-invalid-mode", "Store mode is not registered.", {
        entity: entity.name,
        mode,
      }) as StoreResult<never>);
    }

    const selected = modeDefinition.select ? modeDefinition.select(record) : record;
    const enricher = this.options.enrichers?.[modeDefinition.enrich || `${entity.name}.${mode}`];
    return enricher ? enricher(selected, {
      context,
      entity: entity.name,
      mode,
    }) : selected;
  }
}

type StoreRuntimeResolved<T> = {
  ok: true;
  value: T;
} | {
  ok: false;
  result: StoreResult<never>;
};

function unresolved(
  code: Parameters<typeof fail>[0],
  message: string,
  entity: string,
  status: number,
  details: Record<string, unknown> = {},
): StoreRuntimeResolved<never> {
  return {
    ok: false,
    result: fail(code, message, {
      ...details,
      entity,
    }, status),
  };
}

function assertReadable(entity: ResolvedEntity, row: StoreRecord): void {
  const invalid = assertReadableRawRecord(entity.name, row);
  if (invalid) {
    throw new StoreOperationError(invalid as StoreResult<never>);
  }
}

function createReadKeyInput(input: unknown, readOptions: StoreReadOptions): Record<string, unknown> {
  return {
    includePrivate: readOptions.includePrivate ?? false,
    input,
    scope: readOptions.scope || "context",
  };
}

function createStorageResolver(options: CreateStoreOptions): (definition: EntityDefinition) => StorageAdapter | null {
  return (definition) => {
    if (options.storages?.[definition.storage]) {
      return options.storages[definition.storage] || null;
    }

    if (options.storage && "all" in options.storage) {
      return options.storage as StorageAdapter;
    }

    return (options.storage as Record<string, StorageAdapter> | undefined)?.[definition.storage] || null;
  };
}

export {
  StoreRuntime,
};
