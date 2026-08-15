import type { StoreRuntimeFacade } from "#pq1c0xwc48qu";

function createLazyStoreRecords(runtime: Pick<StoreRuntimeFacade, "records">): StoreRuntimeFacade["records"] {
  return function records(name, views) {
    let registry: ReturnType<StoreRuntimeFacade["records"]>|null = null;
    const viewCache = new Map<PropertyKey, unknown>();
    const readRegistry = () => {
      registry ||= runtime.records(name, views);
      return registry;
    };
    const viewProxy = (viewKey: PropertyKey) =>
    new Proxy(
      {},
      {
        get(_target, methodKey) {
          return (...args: unknown[]) => {
            const view = readRegistry()[viewKey as keyof typeof registry];
            const method = view && view[methodKey as keyof typeof view];
            return typeof method === "function"
            ? (method as(...input: unknown[]) => unknown)(...args)
            : method;
          };
        },
      },
    );

    return new Proxy(
      {},
      {
        get(_target, key) {
          if (!viewCache.has(key)) viewCache.set(key, viewProxy(key));
          return viewCache.get(key);
        },
      },
    ) as ReturnType<StoreRuntimeFacade["records"]>;
  } as StoreRuntimeFacade["records"];
}

export { createLazyStoreRecords };
