import {
  resolveLogger as resolveSharedLogger,
} from "@package/logger-adapter";

import { buildPackageLogGroup, PACKAGE_NAME } from "./package-metadata.js";
import type {
  NormalizedStoreLogger,
  StoreLogger,
  StoreLoggerAdapter,
} from "#y31thwq3bdf0";

const STORE_LOG_GROUP = buildPackageLogGroup();
const STORE_PACKAGE_NAME = PACKAGE_NAME;

function buildStoreLogGroup(...parts: string[]): string {
  return buildPackageLogGroup(...parts);
}

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
    source: STORE_PACKAGE_NAME,
  }) as NormalizedStoreLogger;
}

export {
  buildStoreLogGroup,
  resolveLogger,
  STORE_LOG_GROUP,
  STORE_PACKAGE_NAME,
};
