import type {
  EntityDefinition,
  EntityMetadata,
  EntityRegistry,
  ResolvedEntity,
} from "#y31thwq3bdf0";

function defineEntityRegistry<TRegistry extends EntityRegistry>(registry: TRegistry): TRegistry {
  return registry;
}

function resolveEntityName(registry: EntityRegistry, nameOrAlias: string): string | null {
  if (registry[nameOrAlias]) {
    return nameOrAlias;
  }

  const normalized = normalizeEntityToken(nameOrAlias);
  for (const [name, definition] of Object.entries(registry)) {
    const aliases = createEntityAliases(name, definition);
    if (aliases.has(normalized)) {
      return name;
    }
  }

  return null;
}

function resolveEntityDefinition<TRecord = never>(
  registry: EntityRegistry,
  nameOrAlias: string,
): ResolvedEntity | null {
  void (null as TRecord | null);
  const name = resolveEntityName(registry, nameOrAlias);
  if (!name) {
    return null;
  }

  const definition = registry[name];
  return definition ? {
    definition,
    name,
  } : null;
}

function resolveEntityIcon(registry: EntityRegistry, nameOrAlias: string): string | null {
  return resolveEntityMetadata(registry, nameOrAlias)?.icon ?? null;
}

function resolveEntityMetadata(registry: EntityRegistry, nameOrAlias: string): EntityMetadata | null {
  return resolveEntityDefinition(registry, nameOrAlias)?.definition.metadata ?? null;
}

function createEntityAliases(name: string, definition: EntityDefinition): Set<string> {
  const aliases = new Set<string>([
    normalizeEntityToken(name),
    normalizeEntityToken(singularize(name)),
    normalizeEntityToken(pluralize(name)),
  ]);

  for (const alias of definition.aliases || []) {
    aliases.add(normalizeEntityToken(alias));
    aliases.add(normalizeEntityToken(singularize(alias)));
    aliases.add(normalizeEntityToken(pluralize(alias)));
  }

  return aliases;
}

function normalizeEntityToken(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/gu, "-");
}

function singularize(value: string): string {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }

  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function pluralize(value: string): string {
  if (value.endsWith("y")) {
    return `${value.slice(0, -1)}ies`;
  }

  return value.endsWith("s") ? value : `${value}s`;
}

export {
  defineEntityRegistry,
  resolveEntityDefinition,
  resolveEntityIcon,
  resolveEntityMetadata,
  resolveEntityName,
};
