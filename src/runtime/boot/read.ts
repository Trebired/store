import { hookResultData } from "#4ehy9amylf43";
import { getPath } from "#yfg488ybfy5n";
import type {
  StoreContextInput,
  StoreEntityRead,
  StoreReadOptions,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

type BootEntityReaderInput =
|StoreEntityRead
| { entity?: { read?: StoreEntityRead }; read?: StoreEntityRead }
|(() => BootEntityReaderInput | null | undefined)
|null
|undefined;

async function readBootRecord(
  reader: BootEntityReaderInput,
  entity: string,
  where: StoreWhere,
  context: StoreContextInput = null,
  options: StoreReadOptions = {},
): Promise<StoreRecord|null> {
  const read = resolveBootEntityReader(reader);
  if (!read) return null;
  return hookResultData<StoreRecord|null>(
    await read.by(entity, where, context, options),
    null,
  );
}

async function readBootRecordById(
  reader: BootEntityReaderInput,
  entity: string,
  id: string,
  context: StoreContextInput = null,
  options: StoreReadOptions = {},
): Promise<StoreRecord|null> {
  if (!id) return null;
  return readBootRecord(reader, entity, { id }, context, options);
}

async function readBootRecordBoolean(
  reader: BootEntityReaderInput,
  entity: string,
  where: StoreWhere,
  path: string,
  fallback = false,
  context: StoreContextInput = null,
  options: StoreReadOptions = {},
): Promise<boolean> {
  const record = await readBootRecord(reader, entity, where, context, options);
  return record ? readBootBoolean(record, path, fallback) : fallback;
}

function readBootBoolean(
  record: StoreRecord,
  path: string,
  fallback = false,
): boolean {
  const value = getPath(record, path);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function resolveBootEntityReader(
  input: BootEntityReaderInput,
): StoreEntityRead | null {
  const value = typeof input === "function" ? input() : input;
  if (!value) return null;
  if (isEntityRead(value)) return value;
  const wrapped = value as {
    entity?: { read?: StoreEntityRead };
    read?: StoreEntityRead;
  };
  if (isEntityRead(wrapped.read)) return wrapped.read;
  if (isEntityRead(wrapped.entity?.read)) return wrapped.entity.read;
  return null;
}

function isEntityRead(value: unknown): value is StoreEntityRead {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof(value as StoreEntityRead).by === "function",
  );
}

export {
  readBootBoolean,
  readBootRecord,
  readBootRecordBoolean,
  readBootRecordById,
};
export type {
  BootEntityReaderInput,
};
