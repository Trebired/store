import {
  resolveLogger as resolveSharedLogger,
} from "@trebired/logger-adapter";

import type {
  NormalizedStoreLogger,
  StoreLogger,
  StoreLoggerAdapter,
} from "#y31thwq3bdf0";

const STORE_LOG_GROUP = "trebired.store";

function resolveLogger(
  logger?: StoreLogger,
  adapter?: StoreLoggerAdapter,
): NormalizedStoreLogger | null {
  if (!logger && !adapter) {
    return null;
  }

  return resolveSharedLogger({
    adapter,
    fallback: "console",
    logger,
    source: STORE_LOG_GROUP,
  }) as NormalizedStoreLogger;
}

export {
  resolveLogger,
  STORE_LOG_GROUP,
};
