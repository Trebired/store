import type {
  RecordView,
  RecordViewConfig,
  RecordViewConfigMap,
  RecordViewDefaults,
  RecordViewListOptions,
  RecordViewOptions,
  RecordViewRegistry,
  RecordViewUniqueUpsertOptions,
  RecordViewWriteOptions,
  Store,
  StoreContext,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import { fail, ok } from "#44o0z05ifdgn";

function createRecordViews<TViews extends RecordViewConfigMap>(
  store: Pick<Store, "entity">,
  entity: string,
  views: TViews,
): RecordViewRegistry<TViews> {
  return Object.fromEntries(Object.entries(views).map(([name, config]) => [
    name,
    createRecordView(store, entity, config),
  ])) as RecordViewRegistry<TViews>;
}

function createRecordView(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
): RecordView {
  return {
    config,
    entity,
    by: (where, options) => readBy(store, entity, config, where, options),
    byId: (id, options) => readBy(store, entity, config, {
      id,
    }, options),
    create: (patch) => normalize(config, patch || {}),
    is: (row) => row[discriminatorField(config)] === config.kind,
    list: (options) => list(store, entity, config, options),
    normalize: (row) => normalize(config, row),
    patch: (where, patch, options) => patchBy(store, entity, config, where, patch, options),
    put: (row, options) => store.entity.write.put(entity, context(options), normalize(config, row), options),
    remove: (id, options) => remove(store, entity, config, id, options),
    upsertUnique: (row, options) => upsertUnique(store, entity, config, row, options),
  };
}

async function readBy<TRecord extends StoreRecord>(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
  where: StoreWhere,
  options?: RecordViewOptions,
): Promise<StoreResult<TRecord | null>> {
  return store.entity.read.by<TRecord>(entity, withDiscriminator(config, where), context(options), options);
}

async function list<TRecord extends StoreRecord>(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
  options: RecordViewListOptions = {},
): Promise<StoreResult<TRecord[]>> {
  return store.entity.read.all<TRecord>(entity, context(options), {
    ...options,
    sort: options.sort || config.sort,
    where: withDiscriminator(config, options.where || {}),
  });
}

async function patchBy(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
  where: StoreWhere,
  patch: Partial<StoreRecord>,
  options?: RecordViewWriteOptions,
): Promise<StoreResult<StoreRecord | null>> {
  const current = await store.entity.read.by(entity, withDiscriminator(config, where), context(options), {
    cacheBypass: true,
    mode: "raw",
    scope: options?.scope,
  });
  if (!current.ok || !current.data) {
    return current;
  }

  const next = normalize(config, {
    ...current.data,
    ...patch,
    id: current.data.id,
  });
  return store.entity.write.put(entity, context(options), next, options);
}

async function remove(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
  id: string,
  options?: RecordViewWriteOptions,
): Promise<StoreResult<boolean>> {
  const current = await store.entity.read.by(entity, withDiscriminator(config, {
    id,
  }), context(options), {
    cacheBypass: true,
    mode: "raw",
    scope: options?.scope,
  });
  if (!current.ok || !current.data) {
    return current.ok ? ok(false, "Record view row was already absent.") : current as StoreResult<boolean>;
  }

  return store.entity.write.remove(entity, context(options), id, options);
}

async function upsertUnique<TRecord extends StoreRecord>(
  store: Pick<Store, "entity">,
  entity: string,
  config: RecordViewConfig,
  row: TRecord,
  options?: RecordViewUniqueUpsertOptions,
): Promise<StoreResult<TRecord>> {
  const normalized = normalize(config, row) as TRecord;
  const where = uniqueWhere(config, normalized);
  if (!where.ok) {
    return where as StoreResult<TRecord>;
  }

  const unique = where.data as StoreWhere;
  const current = await store.entity.read.by<TRecord>(entity, withDiscriminator(config, unique), context(options), {
    cacheBypass: true,
    mode: "raw",
    scope: options?.scope,
  });
  if (!current.ok) {
    return current as StoreResult<TRecord>;
  }

  const next = current.data ? normalize(config, {
    ...current.data,
    ...normalized,
    id: current.data.id,
  }) as TRecord : normalized;
  return store.entity.write.put<TRecord>(entity, context(options), next, options);
}

function normalize<TRecord extends StoreRecord>(
  config: RecordViewConfig,
  row: Partial<TRecord> | TRecord,
): TRecord {
  const next = {
    ...defaults(config.defaults, row as Partial<StoreRecord>),
    ...row,
    [discriminatorField(config)]: config.kind,
  } as StoreRecord;
  const normalized = config.normalize ? config.normalize(next) : next;
  return {
    ...normalized,
    [discriminatorField(config)]: config.kind,
  } as TRecord;
}

function defaults(value: RecordViewDefaults | undefined, patch: Partial<StoreRecord>): Partial<StoreRecord> {
  if (!value) {
    return {};
  }

  return typeof value === "function" ? value(patch) : value;
}

function uniqueWhere(config: RecordViewConfig, row: StoreRecord): StoreResult<StoreWhere> {
  if (!config.uniqueBy?.length) {
    return fail("store-invalid-where", "Record view unique fields are not configured.");
  }

  const where: StoreWhere = {};
  for (const field of config.uniqueBy) {
    const value = row[field];
    if (value === undefined || value === null || value === "") {
      return fail("store-invalid-where", "Record view unique field is missing.", {
        field,
      });
    }
    where[field] = value;
  }

  return ok(where, "Record view unique fields resolved.");
}

function withDiscriminator(config: RecordViewConfig, where: StoreWhere): StoreWhere {
  return {
    ...where,
    [discriminatorField(config)]: config.kind,
  };
}

function discriminatorField(config: RecordViewConfig): string {
  return config.discriminatorField || "kind";
}

function context(options?: {
  context?: StoreContext;
}): StoreContext {
  return options?.context || {};
}

export {
  createRecordViews,
};
