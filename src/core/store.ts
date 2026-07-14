import { createSubEntityReader } from "#bo18xc6n4smu";
import { clearRequestEntityLoaders } from "#g8u7bg42czn8";
import type { CreateStoreOptions, Store } from "#y31thwq3bdf0";
import { createRecordViews } from "#4f4sym6qlwt3";
import { createStoreRepairApi } from "#jk4ufstswpvh";
import { createEntityRead } from "./read.js";
import { StoreRuntime } from "./runtime.js";
import { createEntityWrite } from "./write.js";

function createStore(options: CreateStoreOptions): Store {
  const runtime = new StoreRuntime(options);
  const read = createEntityRead(runtime);
  const write = createEntityWrite(runtime, read.by);
  const entity = {
    read,
    write,
  };

  return {
    cache: {
      inspect: () => runtime.cache.inspect(),
      invalidateEntity: (entity) => {
        clearRequestEntityLoaders(entity);
        runtime.invalidate(entity);
      },
    },
    entity,
    inspectCache: () => runtime.cache.inspect(),
    records: (name, views) => createRecordViews({
      entity,
    }, name, views),
    repair: createStoreRepairApi({
      entity,
    }),
    subEntity: createSubEntityReader({
      options,
      readBy: read.by,
    }),
  };
}

export {
  createStore,
};
