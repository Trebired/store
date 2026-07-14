import type {
  EntityDefinition,
  StoreContext,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import { fail } from "./result.js";

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

function validateContext(
  entity: string,
  definition: EntityDefinition,
  context: StoreContext,
  scope: "context" | "all" = "context",
): StoreResult<true> | null {
  if (scope === "all") {
    return null;
  }

  for (const key of definition.context || []) {
    const value = context[key];
    if (value === undefined || value === null || value === "") {
      return fail("store-invalid-context", `Missing required context key: ${key}.`, {
        entity,
        field: key,
      });
    }
  }

  return null;
}

function validateId(entity: string, id: unknown, missingCode = "store-missing-id" as const): StoreResult<true> | null {
  if (typeof id !== "string" || id.length === 0) {
    return fail(missingCode, "Store records require a non-empty string id.", {
      entity,
    });
  }

  if (!VALID_ID.test(id)) {
    return fail("store-invalid-id", "Store record id contains unsupported characters.", {
      entity,
      id,
    });
  }

  return null;
}

function validateRecord(entity: string, record: StoreRecord): StoreResult<true> | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return fail("store-invalid-record", "Store record must be an object.", {
      entity,
    });
  }

  return validateId(entity, record.id);
}

function validateWhere(entity: string, where: StoreWhere): StoreResult<true> | null {
  if (!where || typeof where !== "object" || Array.isArray(where)) {
    return fail("store-invalid-where", "Store where clause must be an object.", {
      entity,
    });
  }

  if (Object.keys(where).length === 0) {
    return fail("store-invalid-where", "Store where clause cannot be empty.", {
      entity,
    });
  }

  return null;
}

function applyRequiredContext(record: StoreRecord, definition: EntityDefinition, context: StoreContext): StoreRecord {
  const out = {
    ...record,
  };

  for (const key of definition.context || []) {
    out[key] = context[key];
  }

  return out;
}

export {
  applyRequiredContext,
  validateContext,
  validateId,
  validateRecord,
  validateWhere,
};
