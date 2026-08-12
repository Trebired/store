import { result, type ResultLike } from "@package/result";

import type { StoreErrorCode, StoreErrorDetails, StoreResult } from "#y31thwq3bdf0";

function ok<T>(data: T, message = "Success.", meta?: Record<string, unknown>): StoreResult<T> {
  return withStoreMessage(result.ok<T, StoreErrorDetails>(statusCodeFromMessage(message), {
        data,
        ...meta,
    }), message);
}

function fail<T>(
  code: StoreErrorCode,
  message: string,
  details: Omit<StoreErrorDetails, "code"> = {},
  status = 400,
): StoreResult<T> {
  return withStoreMessage(result.error<T, StoreErrorDetails>(code, status, {
        details: {
          ...details,
          code,
          message,
        },
    }), message);
}

function storageFail<T>(cause: unknown, entity?: string, storage?: string): StoreResult<T> {
  return fail("store-storage-error", "Store storage operation failed.", {
      cause,
      entity,
      storage,
    }, 500);
}

function statusCodeFromMessage(message: string): string {
  return message.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "success";
}

function withStoreMessage<T>(envelope: ResultLike<T, StoreErrorDetails>, message: string): StoreResult<T> {
  return {
    ...envelope,
    message,
  } as unknown as StoreResult<T>;
}

export {
  fail,
  ok,
  storageFail,
};
