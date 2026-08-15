import type {
  MaybePromise,
  StoreReadOptions,
  StoreRecord,
  StoreResult,
} from "#y31thwq3bdf0";

interface StoreHookReadApi {
  readAll ? (
    entity: string,
    context: unknown,
    options?: StoreReadOptions,
  ) : MaybePromise<StoreResult<StoreRecord[]>|StoreRecord[]|null|undefined>;
  readById ? (
    entity: string,
    id: string,
    context: unknown,
    options?: StoreReadOptions,
  ) : MaybePromise<StoreResult<StoreRecord|null>|StoreRecord|null|undefined>;
}

function hookResultData<T>(input: unknown, fallback: T): T {
  if (
    input &&
      typeof input === "object" &&
      typeof(input as { ok?: unknown }).ok === "boolean" &&
      Object.prototype.hasOwnProperty.call(input, "data")
  ) {
    return (input as { ok: boolean; data?: T }).ok === true
    ? (input as { data?: T }).data ?? fallback
    : fallback;
  }

  return input == null ? fallback : input as T;
}

async function hookReadAll(
  api: StoreHookReadApi | null | undefined,
  entity: string,
  context: unknown = null,
  options: StoreReadOptions | undefined = undefined,
): Promise<StoreRecord[]> {
  if (!api || typeof api.readAll !== "function") return [];
  const result = await api.readAll(entity, context, options || undefined);
  const data = hookResultData<StoreRecord[]>(result, []);
  return Array.isArray(data) ? data : [];
}

async function hookReadById(
  api: StoreHookReadApi | null | undefined,
  entity: string,
  id: string,
  context: unknown = null,
  options: StoreReadOptions | undefined = undefined,
): Promise<StoreRecord|null> {
  if (!api || typeof api.readById !== "function") return null;
  return hookResultData<StoreRecord|null>(
    await api.readById(entity, id, context, options || undefined),
    null,
  );
}

export {
  hookReadAll,
  hookReadById,
  hookResultData,
};
export type {
  StoreHookReadApi,
};
