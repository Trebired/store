import {
  createNullRedisMemoAdapter,
  createRedisMemoAdapter,
} from "#u0w09xmglhng";
import type {
  RuntimeJsonMemoAdapter,
  RuntimeRedisMemoAdapterInput,
  StoreRuntimeMemoOptions,
} from "#pq1c0xwc48qu";
import type { StoreApplicationRuntimeOptions } from "./types.js";

function createApplicationMemoOptions(
  options: StoreApplicationRuntimeOptions,
): StoreRuntimeMemoOptions {
  const memo = {
    ...(options.memo || {}),
  };
  if (options.redisMemo === false) {
    return memo;
  }

  const adapter = normalizeMemoAdapter(options.redisMemo);
  return {
    ...memo,
    l2: memo.l2 || adapter,
    redis: memo.redis || adapter,
  };
}

function normalizeMemoAdapter(
  input: StoreApplicationRuntimeOptions["redisMemo"],
): RuntimeJsonMemoAdapter {
  if (!input) {
    return createNullRedisMemoAdapter();
  }
  if (isRedisMemoAdapterInput(input)) {
    return createRedisMemoAdapter(input);
  }
  return input;
}

function isRedisMemoAdapterInput(input: RuntimeJsonMemoAdapter | RuntimeRedisMemoAdapterInput): input is RuntimeRedisMemoAdapterInput {
  return typeof(input as RuntimeRedisMemoAdapterInput).getJson === "function";
}

export { createApplicationMemoOptions };
