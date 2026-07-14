import { createSubEntityReader } from "#bo18xc6n4smu";
import type { CreateStoreOptions, Store } from "#y31thwq3bdf0";
import { createEntityRead } from "./read.js";
import { StoreRuntime } from "./runtime.js";
import { createEntityWrite } from "./write.js";

function createStore(options: CreateStoreOptions): Store {
  const runtime = new StoreRuntime(options);
  const read = createEntityRead(runtime);

  return {
    entity: {
      read,
      write: createEntityWrite(runtime, read.by),
    },
    inspectCache: () => runtime.cache.inspect(),
    subEntity: createSubEntityReader({
      options,
      readBy: read.by,
    }),
  };
}

export {
  createStore,
};
