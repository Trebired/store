import { result } from "@trebired/result";

import type { StoreErrorCode, StoreErrorDetails, StoreResult } from "#y31thwq3bdf0";

function ok<T>(data: T, message = "Success.", meta?: Record<string, unknown>): StoreResult<T> {
  return result.ok(message, {
    data,
    meta,
  }) as StoreResult<T>;
}

function fail<T>(
  code: StoreErrorCode,
  message: string,
  details: Omit<StoreErrorDetails, "code"> = {},
  status = 400,
): StoreResult<T> {
  return result.error(status, code, message, {
    details: {
      ...details,
      code,
    },
  }) as StoreResult<T>;
}

function storageFail<T>(cause: unknown, entity?: string, storage?: string): StoreResult<T> {
  return fail("store-storage-error", "Store storage operation failed.", {
    cause,
    entity,
    storage,
  }, 500);
}

export {
  fail,
  ok,
  storageFail,
};
