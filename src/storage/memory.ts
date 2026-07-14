import type {
  ResolvedEntity,
  StorageAdapter,
  StorageReadOptions,
  StoreContext,
  StoreRecord,
  StoreWhere,
  StoreWriteOptions,
} from "#y31thwq3bdf0";

function createMemoryStorageAdapter(seed: Record<string, StoreRecord[]> = {}): StorageAdapter {
  const records = new Map<string, Map<string, StoreRecord>>();
  for (const [entity, rows] of Object.entries(seed)) {
    records.set(entity, new Map(rows.map((row) => [row.id, clone(row)])));
  }

  return {
    async all(entity, context, options) {
      return filterRows([...table(records, entity.name).values()], entity, context, options).map(clone);
    },
    async by(entity, where, context, options) {
      return filterRows([...table(records, entity.name).values()], entity, context, {
        ...options,
        where: {
          ...(options?.where || {}),
          ...where,
        },
      })[0] ?? null;
    },
    async byIds(entity, ids, context, options) {
      return filterRows(ids.map((id) => table(records, entity.name).get(id)).filter(Boolean) as StoreRecord[], entity, context, options)
        .map(clone);
    },
    async count(entity, context, options) {
      return filterRows([...table(records, entity.name).values()], entity, context, options).length;
    },
    async hasAny(entity, context, options) {
      return filterRows([...table(records, entity.name).values()], entity, context, options).length > 0;
    },
    async put(entity, context, record, _options?: StoreWriteOptions) {
      const next = clone(record);
      for (const key of entity.definition.context || []) {
        next[key] = context[key];
      }
      table(records, entity.name).set(next.id, next);
      return clone(next);
    },
    async remove(entity, _context, id) {
      return table(records, entity.name).delete(id);
    },
    removeMany: async (entity, _context, ids) => removeManyRows(records, entity.name, ids),
  };
}

function removeManyRows(
  records: Map<string, Map<string, StoreRecord>>,
  entity: string,
  ids: string[],
) {
  let removed = 0;
  for (const id of ids) {
    if (table(records, entity).delete(id)) {
      removed += 1;
    }
  }

  return {
    ids,
    missing: ids.length - removed,
    removed,
    requested: ids.length,
  };
}

function table(records: Map<string, Map<string, StoreRecord>>, entity: string): Map<string, StoreRecord> {
  const existing = records.get(entity);
  if (existing) {
    return existing;
  }

  const next = new Map<string, StoreRecord>();
  records.set(entity, next);
  return next;
}

function filterRows(
  rows: StoreRecord[],
  entity: ResolvedEntity,
  context: StoreContext,
  options?: StorageReadOptions,
): StoreRecord[] {
  const filtered = rows.filter((row) => matchesScope(row, entity, context, options) && matchesWhere(row, options?.where || {}));
  const sorted = sortRows(filtered, options?.sort || []);
  return typeof options?.limit === "number" ? sorted.slice(0, Math.max(0, options.limit)) : sorted;
}

function matchesWhere(row: StoreRecord, where: StoreWhere): boolean {
  return Object.entries(where).every(([key, value]) => matchesValue(row[key], value));
}

function matchesScope(
  row: StoreRecord,
  entity: ResolvedEntity,
  context: StoreContext,
  options?: StorageReadOptions,
): boolean {
  if (options?.scope === "all") {
    return true;
  }

  return (entity.definition.context || []).every((key) => row[key] === context[key]);
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return expected.some((value) => matchesValue(actual, value));
  }

  if (isPlainObject(expected)) {
    return isPlainObject(actual) && Object.entries(expected).every(([key, value]) => matchesValue(actual[key], value));
  }

  return actual === expected;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortRows(rows: StoreRecord[], sort: readonly string[]): StoreRecord[] {
  if (sort.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => compareRows(a, b, sort));
}

function compareRows(a: StoreRecord, b: StoreRecord, sort: readonly string[]): number {
  for (const spec of sort) {
    const [field, direction] = spec.split(":");
    const comparison = compareValues(a[field || ""], b[field || ""]);
    if (comparison !== 0) {
      return direction === "desc" ? -comparison : comparison;
    }
  }

  return 0;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }

  if (a === null || a === undefined) {
    return 1;
  }

  if (b === null || b === undefined) {
    return -1;
  }

  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
  });
}

function clone<T extends StoreRecord>(record: T): T {
  return structuredClone(record);
}

export {
  createMemoryStorageAdapter,
};
