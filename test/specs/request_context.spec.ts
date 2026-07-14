import { expect, test } from "bun:test";

import {
  getOrCreateRequestValue,
  getStoreRequestContext,
  runWithStoreRequestContext,
} from "#index";

test("exposes request context metadata through the package-owned AsyncLocalStorage", () => {
  runWithStoreRequestContext({
    requestId: "req_1",
  }, () => {
    const context = getStoreRequestContext();
    const value = getOrCreateRequestValue("requestId", () => context?.meta.requestId);

    expect(context?.meta.requestId).toBe("req_1");
    expect(value).toBe("req_1");
  });

  expect(getStoreRequestContext()).toBeNull();
});
