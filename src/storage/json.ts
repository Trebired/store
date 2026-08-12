import type {
  ResolvedEntity,
  StorageReadOptions,
  StoreContext,
  StoreRecord,
  StoreWhere,
} from "#y31thwq3bdf0";

type JsonFilterPusher = (
  parts: string[],
  params: unknown[],
  field: string,
  value: unknown,
) => void;

function applyStorageContext(
  record: StoreRecord,
  entity: ResolvedEntity,
  context: StoreContext,
): StoreRecord {
  const out = {
    ...record,
  };
  for (const key of entity.definition.context || []) {
    out[key] = context[key];
  }

  return out;
}

function buildStorageWhere(
  entity: ResolvedEntity,
  where: StoreWhere,
  context: StoreContext,
  options: StorageReadOptions | undefined,
  pushFilter: JsonFilterPusher,
): {
  params: unknown[];
  sql: string;
} {
  const parts: string[] = [];
  const params: unknown[] = [];

  for (const [field, value] of Object.entries(options?.where || {})) {
    pushFilter(parts, params, field, value);
  }
  for (const [field, value] of Object.entries(where)) {
    pushFilter(parts, params, field, value);
  }
  if (options?.scope !== "all") {
    for (const key of entity.definition.context || []) {
      pushFilter(parts, params, key, context[key]);
    }
  }

  return {
    params,
    sql: parts.length ? `where ${parts.join(" and ")}` : "",
  };
}

export {
  applyStorageContext,
  buildStorageWhere,
};
