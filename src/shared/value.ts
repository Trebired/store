import type { StoreRecord } from "#y31thwq3bdf0";
import { isRecord as isPlainObject } from "@trebired/utils";

function getPath(row: StoreRecord | Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
      return isPlainObject(current) ? current[key] : undefined;
    }, row);
}

function identity<TValue>(value: TValue): TValue {
  return value;
}

function isStoreRecord(value: unknown): value is StoreRecord {
  return isPlainObject(value);
}

function matchesStoreWhere(row: StoreRecord, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
  }

  return JSON.stringify(value);
}

export {
  getPath,
  identity,
  isPlainObject,
  isStoreRecord,
  matchesStoreWhere,
  stableStringify,
};
