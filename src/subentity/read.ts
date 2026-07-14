import type {
  CreateStoreOptions,
  StoreContext,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
  StoreSubEntityRead,
  StoreWhere,
  SubEntityDefinition,
} from "#y31thwq3bdf0";
import { fail, ok } from "#44o0z05ifdgn";
import { validateWhere } from "#xwy7fgl52hsw";

interface SubEntityInternals {
  options: CreateStoreOptions;
  readBy<TRecord extends StoreRecord>(
    entity: string,
    where: StoreWhere,
    context: StoreContext,
    options?: StoreReadOptions,
  ): Promise<StoreResult<TRecord | null>>;
}

type ResolvedChildren = {
  children: StoreRecord[];
  definition: SubEntityDefinition;
  parent: StoreRecord;
};

function createSubEntityReader(internals: SubEntityInternals): StoreSubEntityRead {
  return {
    by: (name, parentWhere, where, context, options) => readSubEntityBy(internals, name, parentWhere, where, context, options),
    count: (name, parentWhere, context, options) => countSubEntities(internals, name, parentWhere, context, options),
    list: (name, parentWhere, context, options) => listSubEntities(internals, name, parentWhere, context, options),
  };
}

async function listSubEntities<TRecord extends StoreRecord = StoreRecord>(
  internals: SubEntityInternals,
  name: string,
  parentWhere: StoreWhere,
  context: StoreContext,
  options?: StoreReadOptions,
): Promise<StoreResult<TRecord[]>> {
  const resolved = await resolveChildren(internals, name, parentWhere, context, options);
  if (!resolved.ok) {
    return resolved as StoreResult<TRecord[]>;
  }

  const { definition, parent, children } = resolved.data || emptyResolvedChildren();
  const base = definition.list ? await definition.list(children, {
    context,
    definition,
    name,
    parent,
  }) : children;
  return ok(await enrichChildren(definition, name, parent, base, context) as TRecord[], "Store sub-entity read completed.");
}

async function readSubEntityBy<TRecord extends StoreRecord = StoreRecord>(
  internals: SubEntityInternals,
  name: string,
  parentWhere: StoreWhere,
  where: StoreWhere,
  context: StoreContext,
  options?: StoreReadOptions,
): Promise<StoreResult<TRecord | null>> {
  const whereError = validateWhere(name, where);
  if (whereError) {
    return whereError as StoreResult<TRecord | null>;
  }

  const resolved = await resolveChildren(internals, name, parentWhere, context, options);
  if (!resolved.ok) {
    return resolved as StoreResult<TRecord | null>;
  }

  const { definition, parent, children } = resolved.data || emptyResolvedChildren();
  const base = definition.list ? await definition.list(children, {
    context,
    definition,
    name,
    parent,
  }) : children;
  const found = definition.by
    ? await definition.by(base, where, {
      context,
      definition,
      name,
      parent,
    })
    : base.find((row) => matchesWhere(row, where)) ?? null;
  const out = found ? await enrich(definition, name, parent, found, context) : null;
  return ok(out as TRecord | null, "Store sub-entity read completed.");
}

async function countSubEntities(
  internals: SubEntityInternals,
  name: string,
  parentWhere: StoreWhere,
  context: StoreContext,
  options?: StoreReadOptions,
): Promise<StoreResult<number>> {
  const resolved = await resolveChildren(internals, name, parentWhere, context, options);
  if (!resolved.ok) {
    return resolved as StoreResult<number>;
  }

  const { definition, parent, children } = (resolved.data || emptyResolvedChildren()) as ResolvedChildren;
  const value = definition.count ? await definition.count(children, {
    context,
    definition,
    name,
    parent,
  }) : children.length;
  return ok(value, "Store sub-entity count completed.");
}

async function enrichChildren(
  definition: SubEntityDefinition,
  name: string,
  parent: StoreRecord,
  children: StoreRecord[],
  context: StoreContext,
): Promise<StoreRecord[]> {
  const out = [];
  for (const child of children) {
    out.push(await enrich(definition, name, parent, child, context));
  }

  return out;
}

function emptyResolvedChildren(): ResolvedChildren {
  return {
    children: [],
    definition: {
      childKey: "",
      identityField: "id",
      parent: "",
    },
    parent: {} as StoreRecord,
  };
}

async function resolveChildren(
  internals: SubEntityInternals,
  name: string,
  parentWhere: StoreWhere,
  context: StoreContext,
  options: StoreReadOptions = {},
): Promise<StoreResult<ResolvedChildren>> {
  const definition = internals.options.subEntities?.[name];
  if (!definition) {
    return fail("store-sub-entity-not-found", "Store sub-entity is not registered.", {
      entity: name,
    }, 404);
  }

  const contextError = definition.validateContext?.(context);
  if (contextError) {
    return contextError as StoreResult<ResolvedChildren>;
  }

  const parent = await internals.readBy(definition.parent, parentWhere, context, {
    ...options,
    mode: definition.sourceMode || options.mode || "full",
  });
  if (!parent.ok || !parent.data) {
    return parent as StoreResult<ResolvedChildren>;
  }

  const value = parent.data[definition.childKey];
  const children = Array.isArray(value) ? value.filter(isStoreRecord) : [];
  return ok({
    children,
    definition,
    parent: parent.data,
  });
}

async function enrich(
  definition: NonNullable<CreateStoreOptions["subEntities"]>[string],
  name: string,
  parent: StoreRecord,
  child: StoreRecord,
  context: StoreContext,
): Promise<StoreRecord> {
  if (!definition.enrich) {
    return child;
  }

  return definition.enrich(child, {
    context,
    definition,
    name,
    parent,
  });
}

function matchesWhere(row: StoreRecord, where: StoreWhere): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function isStoreRecord(value: unknown): value is StoreRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as StoreRecord).id === "string");
}

export {
  createSubEntityReader,
};
