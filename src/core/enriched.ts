import type { StoreRecord, StoreResult } from "#y31thwq3bdf0";
import { fail } from "./result.js";

const STORE_ENRICHED_MARKER = "__store_enriched";
const enrichedBrand = Symbol("@trebired/store.enriched");
const enrichedRecords = new WeakSet<object>();

function markEnrichedRecord<T extends StoreRecord>(record: T): T {
  Object.defineProperty(record, STORE_ENRICHED_MARKER, {
    configurable: false,
    enumerable: true,
    value: true,
    writable: false,
  });
  Object.defineProperty(record, enrichedBrand, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  enrichedRecords.add(record);
  return deepFreeze(record);
}

function assertReadableRawRecord(entity: string, record: StoreRecord): StoreResult<true> | null {
  if (Object.prototype.hasOwnProperty.call(record, STORE_ENRICHED_MARKER)) {
    return fail("store-enriched-marker-persisted", "Stored record contains the enriched record marker.", {
      entity,
      id: record.id,
    }, 500);
  }

  return null;
}

function assertWritableRecord(entity: string, record: StoreRecord): StoreResult<true> | null {
  if (
    enrichedRecords.has(record)
    || Object.prototype.hasOwnProperty.call(record, STORE_ENRICHED_MARKER)
    || Object.prototype.hasOwnProperty.call(record, enrichedBrand)
    || Object.isFrozen(record)
  ) {
    return fail("store-enriched-record", "Enriched records cannot be written back as stored records.", {
      entity,
      id: typeof record.id === "string" ? record.id : undefined,
    });
  }

  return null;
}

function deepFreeze<T extends StoreRecord>(record: T): T {
  for (const value of Object.values(record)) {
    if (isFreezable(value) && !Object.isFrozen(value)) {
      deepFreezeObject(value);
    }
  }

  return Object.freeze(record);
}

function deepFreezeObject(value: object): void {
  for (const nested of Object.values(value)) {
    if (isFreezable(nested) && !Object.isFrozen(nested)) {
      deepFreezeObject(nested);
    }
  }

  Object.freeze(value);
}

function isFreezable(value: unknown): value is object {
  return Boolean(value && typeof value === "object");
}

export {
  assertReadableRawRecord,
  assertWritableRecord,
  markEnrichedRecord,
};
