import type {
  EntityDefinition,
  StorePrivateUnlocks,
  StoreRecord,
} from "#y31thwq3bdf0";

function redactPrivateFields<T extends StoreRecord>(
  record: T,
  definition: EntityDefinition,
  includePrivate?: StorePrivateUnlocks,
): T {
  const privateFields = definition.privateFields || {};
  const out = {
    ...record,
  };

  for (const [field, unlock] of Object.entries(privateFields)) {
    if (!isPrivateFieldUnlocked(field, unlock, includePrivate)) {
      delete out[field];
    }
  }

  return out as T;
}

function isPrivateFieldUnlocked(
  field: string,
  unlock: string | readonly string[] | true,
  includePrivate?: StorePrivateUnlocks,
): boolean {
  if (includePrivate === true) {
    return true;
  }

  if (Array.isArray(includePrivate)) {
    const keys = unlock === true ? [field] : Array.isArray(unlock) ? unlock : [unlock];
    return keys.some((key) => includePrivate.includes(key));
  }

  if (includePrivate && typeof includePrivate === "object") {
    const keys = unlock === true ? [field] : Array.isArray(unlock) ? unlock : [unlock];
    return keys.some((key) => includePrivate[key]);
  }

  return false;
}

export {
  redactPrivateFields,
};
