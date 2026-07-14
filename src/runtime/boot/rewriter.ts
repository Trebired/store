import { readBootBoolean } from "./followups.js";
import type {
  RuntimeBootActionContext,
  RuntimeRewrite,
} from "#pq1c0xwc48qu";
import type {
  MaybePromise,
  StoreRecord,
} from "#y31thwq3bdf0";

type BootRecordTransform = (
  record: StoreRecord,
  context: RuntimeBootActionContext,
) => MaybePromise<StoreRecord | null | undefined | void>;

interface BootStringFieldOptions {
  fallbackFrom?: string | readonly string[];
  fallback?: string;
  default?: string;
  prefix?: string;
}

interface BootNumberFieldOptions {
  fallback?: number;
  default?: number;
}

interface BootBooleanFieldOptions {
  fallback?: boolean;
  default?: boolean;
}

interface BootObjectFieldOptions {
  defaults?: Record<string, unknown>;
}

interface BootArrayFieldOptions {
  default?: readonly unknown[];
}

interface BootSlugFieldOptions {
  fallback?: string;
  prefix?: string;
  separator?: string;
}

function createBootRewriter(records: Record<string, RuntimeRewrite>): RuntimeRewrite {
  return async (record, context) => {
    const rewrite = records[context.entity];
    return rewrite ? rewrite(record, context) : record;
  };
}

function bootRecord(transforms: readonly BootRecordTransform[]): RuntimeRewrite {
  return async (record, context) => {
    if (!isRecord(record)) return record;
    let current = cloneRecord(record);
    for (const transform of transforms) {
      const next = await transform(current, context);
      if (next && isRecord(next)) {
        current = next;
      }
    }
    return current;
  };
}

function stringField(field: string, options: BootStringFieldOptions = {}): BootRecordTransform {
  return (record) => {
    const current = cleanString(getPath(record, field));
    if (current) {
      setPath(record, field, current);
      return record;
    }
    const fallback = findStringFallback(record, options);
    if (fallback !== undefined) {
      setPath(record, field, fallback);
    }
    return record;
  };
}

function numberField(field: string, options: BootNumberFieldOptions = {}): BootRecordTransform {
  return (record) => {
    const value = Number(getPath(record, field));
    const fallback = options.default ?? options.fallback;
    setPath(record, field, Number.isFinite(value) ? value : fallback ?? 0);
    return record;
  };
}

function booleanField(field: string, options: BootBooleanFieldOptions = {}): BootRecordTransform {
  return (record) => {
    setPath(record, field, readBootBoolean(record, field, options.default ?? options.fallback ?? false));
    return record;
  };
}

function objectField(field: string, options: BootObjectFieldOptions = {}): BootRecordTransform {
  return (record) => {
    const value = getPath(record, field);
    const object = isPlainObject(value) ? value : {};
    setPath(record, field, mergeDefaults(object as StoreRecord, options.defaults || {}));
    return record;
  };
}

function arrayField(field: string, options: BootArrayFieldOptions = {}): BootRecordTransform {
  return (record) => {
    const value = getPath(record, field);
    setPath(record, field, Array.isArray(value) ? [...value] : [...(options.default || [])]);
    return record;
  };
}

function uniqueStringArrayField(field: string, aliases: readonly string[] = []): BootRecordTransform {
  return (record) => {
    const values = [getPath(record, field), ...aliases.map((alias) => getPath(record, alias))];
    setPath(record, field, uniqueStrings(values));
    return record;
  };
}

function stringAliases(target: string, aliases: readonly string[]): BootRecordTransform {
  return (record) => {
    if (cleanString(getPath(record, target))) return record;
    const value = aliases.map((alias) => cleanString(getPath(record, alias))).find(Boolean);
    if (value) setPath(record, target, value);
    return record;
  };
}

function copyAlias(target: string, aliases: readonly string[]): BootRecordTransform {
  return (record) => {
    if (getPath(record, target) !== undefined) return record;
    for (const alias of aliases) {
      const value = getPath(record, alias);
      if (value !== undefined) {
        setPath(record, target, cloneValue(value));
        break;
      }
    }
    return record;
  };
}

function defaultValue(field: string, value: unknown): BootRecordTransform {
  return (record) => {
    const current = getPath(record, field);
    if (current === undefined || current === null || current === "") {
      setPath(record, field, cloneValue(value));
    }
    return record;
  };
}

function defaultStatus(status: string): BootRecordTransform {
  return defaultValue("status", status);
}

function nestedDefaults(path: string, defaults: Record<string, unknown>): BootRecordTransform {
  return (record) => {
    const current = getPath(record, path);
    const object = isPlainObject(current) ? current : {};
    setPath(record, path, mergeDefaults(object, defaults));
    return record;
  };
}

function booleanPolicyDefaults(path: string, defaults: Record<string, boolean>): BootRecordTransform {
  return (record) => {
    const current = getPath(record, path);
    const policy: Record<string, unknown> = isPlainObject(current) ? { ...current } : {};
    for (const [key, value] of Object.entries(defaults)) {
      policy[key] = readBootBoolean({
        ...policy,
        id: "",
      }, key, value);
    }
    setPath(record, path, policy);
    return record;
  };
}

function slugField(target: string, sourceFields: readonly string[], options: BootSlugFieldOptions = {}): BootRecordTransform {
  return (record) => {
    if (cleanString(getPath(record, target))) return record;
    const source = sourceFields.map((field) => cleanString(getPath(record, field))).find(Boolean) || options.fallback || "";
    const slug = toSlug(source, options.separator || "-");
    if (slug) setPath(record, target, `${options.prefix || ""}${slug}`);
    return record;
  };
}

function customTransform(transform: BootRecordTransform): BootRecordTransform {
  return transform;
}

function findStringFallback(record: StoreRecord, options: BootStringFieldOptions): string | undefined {
  const fields = typeof options.fallbackFrom === "string" ? [options.fallbackFrom] : options.fallbackFrom || [];
  const fallback = fields.map((field) => cleanString(getPath(record, field))).find(Boolean)
    ?? cleanString(options.default)
    ?? cleanString(options.fallback);
  return fallback ? `${options.prefix || ""}${fallback}` : undefined;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
    const text = cleanString(value);
    if (text) out.add(text);
  }
  return [...out];
}

function getPath(row: StoreRecord, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  }, row);
}

function setPath(row: StoreRecord, path: string, value: unknown): void {
  const parts = path.split(".");
  const key = parts.pop();
  let current = row;
  for (const part of parts) {
    if (!isPlainObject(current[part])) {
      current[part] = {};
    }
    current = current[part] as StoreRecord;
  }
  if (key) current[key] = value;
}

function mergeDefaults(current: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const out = cloneValue(defaults);
  for (const [key, value] of Object.entries(current)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? mergeDefaults(value, out[key])
      : cloneValue(value);
  }
  return out;
}

function cloneRecord(record: StoreRecord): StoreRecord {
  return cloneValue(record) as StoreRecord;
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)])) as T;
  }
  return value;
}

function cleanString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function toSlug(value: string, separator: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${escapeRegExp(separator)}+`, "g"), separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, "g"), "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is StoreRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export {
  arrayField,
  booleanField,
  booleanPolicyDefaults,
  bootRecord,
  copyAlias,
  createBootRewriter,
  customTransform,
  defaultStatus,
  defaultValue,
  nestedDefaults,
  numberField,
  objectField,
  slugField,
  stringAliases,
  stringField,
  uniqueStringArrayField,
};

export type {
  BootArrayFieldOptions,
  BootBooleanFieldOptions,
  BootNumberFieldOptions,
  BootObjectFieldOptions,
  BootRecordTransform,
  BootSlugFieldOptions,
  BootStringFieldOptions,
};
