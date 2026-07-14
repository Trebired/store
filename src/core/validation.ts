import type {
  EntityDefinition,
  StoreContext,
  StoreRecord,
  StoreResult,
  StoreWhere,
} from "#y31thwq3bdf0";
import { fail, ok } from "./result.js";

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

function normalizeContext(entity: string, context: unknown): StoreResult<StoreContext> {
  if (context === null || context === undefined) {
    return ok({}, "Store context normalized.");
  }

  if (!isPlainObject(context)) {
    return fail("store-invalid-context", "Store context must be an object.", {
      entity,
    });
  }

  return ok(context as StoreContext, "Store context normalized.");
}

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

function validateOptionalWhere(entity: string, where: StoreWhere | undefined): StoreResult<true> | null {
  return where === undefined ? null : validateWhere(entity, where);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export {
  applyRequiredContext,
  normalizeContext,
  validateContext,
  validateId,
  validateOptionalWhere,
  validateRecord,
  validateWhere,
};
