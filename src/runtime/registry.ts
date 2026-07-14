import type { EntityDefinition, EntityRegistry, StoreRecord } from "#y31thwq3bdf0";
import type {
  RuntimeEntityDefinition,
  RuntimeEntityModeDefinition,
  RuntimeEntityRegistry,
} from "./types.js";

const ENTITY_KEYS = new Set([
  "aliases",
  "context",
  "metadata",
  "modes",
  "private",
  "privateFields",
  "required",
  "storage",
  "table",
]);

const MODE_KEYS = new Set([
  "enrich",
  "hooks",
  "metadata",
  "name",
  "privateFields",
  "select",
  "with",
]);

function normalizeRuntimeEntities(entities: RuntimeEntityRegistry, hasPostgres: boolean): EntityRegistry {
  return Object.fromEntries(Object.entries(entities).map(([name, definition]) => [
    name,
    normalizeRuntimeEntity(name, definition, hasPostgres),
  ]));
}

function normalizeRuntimeEntity(
  name: string,
  definition: RuntimeEntityDefinition,
  hasPostgres: boolean,
): EntityDefinition {
  validateEntityDefinition(name, definition);
  return {
    aliases: definition.aliases,
    context: definition.context || definition.required,
    metadata: mergeMetadata(definition, definition.metadata),
    modes: normalizeRuntimeModes(name, definition.modes),
    privateFields: definition.privateFields || definition.private,
    storage: definition.storage || (hasPostgres ? "postgres" : "memory"),
    table: definition.table,
  };
}

function normalizeRuntimeModes(
  entity: string,
  modes: Record<string, RuntimeEntityModeDefinition> | undefined,
) {
  return Object.fromEntries(Object.entries(modes || {}).map(([mode, definition]) => [
    mode,
    {
      enrich: definition.enrich || `${entity}.${mode}`,
      hooks: normalizeModeHooks(definition.hooks || conciseHooks(definition)),
      metadata: mergeMetadata(definition, definition.metadata),
      name: definition.name,
      privateFields: definition.privateFields,
      select: definition.select as ((record: StoreRecord) => StoreRecord) | undefined,
    },
  ]));
}

function normalizeModeHooks(input: unknown): Record<string, boolean> | string[] {
  if (Array.isArray(input)) {
    return input.map(normalizeHookName).filter(Boolean);
  }

  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(source)
    .map(([name, enabled]) => [normalizeHookName(name), enabled === true] as const)
    .filter(([name]) => Boolean(name)));
}

function conciseHooks(definition: RuntimeEntityModeDefinition): Record<string, boolean> {
  return Object.fromEntries(Object.entries(definition)
    .filter(([key, value]) => !MODE_KEYS.has(key) && typeof value === "boolean")) as Record<string, boolean>;
}

function normalizeHookName(input: string): string {
  const value = String(input || "").trim();
  return value.startsWith("with-") ? value.slice("with-".length) : value;
}

function mergeMetadata(
  source: Record<string, unknown>,
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const unknown = Object.fromEntries(Object.entries(source)
    .filter(([key, value]) => !ENTITY_KEYS.has(key) && !MODE_KEYS.has(key) && value !== undefined));
  return Object.keys(unknown).length || metadata ? {
    ...unknown,
    ...(metadata || {}),
  } : undefined;
}

function validateEntityDefinition(name: string, definition: RuntimeEntityDefinition): void {
  if (!definition || typeof definition !== "object") {
    throw new Error(`Store runtime entity '${name}' must be an object.`);
  }
  if (typeof definition.table !== "string" || !definition.table.trim()) {
    throw new Error(`Store runtime entity '${name}' requires a table.`);
  }
  if (definition.required && !Array.isArray(definition.required)) {
    throw new Error(`Store runtime entity '${name}' required must be an array.`);
  }
  if (definition.context && !Array.isArray(definition.context)) {
    throw new Error(`Store runtime entity '${name}' context must be an array.`);
  }
}

export {
  normalizeHookName,
  normalizeRuntimeEntities,
};
