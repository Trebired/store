import type {
  Store,
  StoreContext,
  StoreRecord,
  StoreRepairApi,
  StoreRepairOrphansAndDuplicatesInput,
  StoreRepairSummary,
} from "#y31thwq3bdf0";

function createStoreRepairApi(store: Pick<Store, "entity">): StoreRepairApi {
  return {
    orphansAndDuplicates: (input) => repairOrphansAndDuplicates(store, input),
  };
}

async function repairOrphansAndDuplicates(
  store: Pick<Store, "entity">,
  input: StoreRepairOrphansAndDuplicatesInput,
): Promise<StoreRepairSummary> {
  const context = input.context || {};
  const scope = input.context ? "context" : "all";
  const [parents, children] = await Promise.all([
    input.parent.list({
      context,
      mode: "raw",
      scope,
    }),
    input.child.list({
      context,
      mode: "raw",
      scope,
    }),
  ]);
  if (!parents.ok || !children.ok) {
    return emptySummary(true);
  }

  const parentIds = new Set((parents.data || []).map((row) => row.id));
  const childRows = children.data || [];
  const orphanIds = findOrphanIds(childRows, parentIds, input.childParentKey);
  const duplicateIds = findDuplicateIds(childRows, input.uniqueBy, input.freshnessFields);
  const ids = [...new Set([
    ...orphanIds,
    ...duplicateIds,
  ])];
  const removed = ids.length
    ? await store.entity.write.removeMany(input.child.entity, ids, context, {
      scope,
    })
    : null;
  const deletedTotal = removed?.ok ? removed.data?.removed || 0 : 0;

  return {
    deletedDuplicateCount: duplicateIds.length,
    deletedOrphanCount: orphanIds.length,
    deletedTotal,
    remainingChildCount: childRows.length - deletedTotal,
    scannedChildCount: childRows.length,
    scannedParentCount: parents.data?.length || 0,
    skipped: Boolean(removed && !removed.ok),
  };
}

function findOrphanIds(rows: StoreRecord[], parentIds: Set<string>, childParentKey: string): string[] {
  return rows
    .filter((row) => typeof row[childParentKey] === "string" && !parentIds.has(row[childParentKey] as string))
    .map((row) => row.id);
}

function findDuplicateIds(
  rows: StoreRecord[],
  uniqueBy: readonly string[],
  freshnessFields: readonly string[],
): string[] {
  const groups = new Map<string, StoreRecord[]>();
  for (const row of rows) {
    const key = uniqueKey(row, uniqueBy);
    groups.set(key, [
      ...(groups.get(key) || []),
      row,
    ]);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) => duplicateLosers(group, freshnessFields).map((row) => row.id));
}

function duplicateLosers(group: StoreRecord[], freshnessFields: readonly string[]): StoreRecord[] {
  const sorted = [...group].sort((a, b) => compareFreshness(b, a, freshnessFields));
  return sorted.slice(1);
}

function compareFreshness(a: StoreRecord, b: StoreRecord, fields: readonly string[]): number {
  for (const field of fields) {
    const comparison = compareValues(a[field], b[field]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  return compareValues(a.id, b.id);
}

function compareValues(a: unknown, b: unknown): number {
  const left = toComparable(a);
  const right = toComparable(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

function toComparable(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function uniqueKey(row: StoreRecord, fields: readonly string[]): string {
  return JSON.stringify(fields.map((field) => row[field] ?? null));
}

function emptySummary(skipped: boolean): StoreRepairSummary {
  return {
    deletedDuplicateCount: 0,
    deletedOrphanCount: 0,
    deletedTotal: 0,
    remainingChildCount: 0,
    scannedChildCount: 0,
    scannedParentCount: 0,
    skipped,
  };
}

export {
  createStoreRepairApi,
};
