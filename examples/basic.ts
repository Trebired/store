import {
  createMemoryStorageAdapter,
  createModeEnricherRegistry,
  createStore,
  defineEntityRegistry,
} from "@trebired/store";
import type { ModeEnricherHook, Store } from "@trebired/store";

const entities = defineEntityRegistry({
  documents: {
    aliases: ["document", "docs"],
    context: ["workspaceId"],
    metadata: {
      owner: "content",
    },
    modes: {
      detail: {
        hooks: {
          "with-word-count": true,
          "with-url": true,
        },
      },
    },
    privateFields: {
      token: "documents:private",
    },
    storage: "memory",
    table: "documents",
  },
});

let store: Store;
const enrichers = createModeEnricherRegistry({
  entities,
  getStore: () => store,
  loadHook({ hook }) {
    const hooks: Record<string, ModeEnricherHook> = {
      "with-word-count": (record, api) => ({
        ...record,
        recorded_at: api.recorded_at,
        wordCount: String(record.body || "").split(/\s+/u).filter(Boolean).length,
      }),
      "with-url": (record) => ({
        ...record,
        url: `/documents/${record.id}`,
      }),
    };

    return hooks[hook as keyof typeof hooks];
  },
  now: () => new Date().toISOString(),
});

store = createStore({
  entities,
  enrichers,
  storages: {
    memory: createMemoryStorageAdapter(),
  },
  subEntities: {
    comments: {
      childKey: "comments",
      identityField: "id",
      parent: "documents",
      sourceMode: "raw",
    },
  },
});

const context = {
  workspaceId: "workspace_1",
};

await store.entity.write.put("documents", context, {
  body: "A reusable store belongs in a package.",
  comments: [
    {
      id: "comment_1",
      message: "Looks good.",
    },
  ],
  id: "doc_1",
  status: "active",
  title: "Store extraction",
  token: "secret",
});

const records = store.records("documents", {
  item: {
    defaults: {
      status: "draft",
    },
    kind: "item",
    normalize: (row) => ({
      ...row,
      title: String(row.title || "Untitled"),
    }),
    sort: [
      "priority:asc",
      "recorded_at:desc",
    ],
  },
  target: {
    kind: "target",
    uniqueBy: [
      "item_id",
      "server_id",
    ],
  },
});

await records.item.put({
  id: "item_1",
  priority: 1,
  title: "Record view row",
}, {
  context,
});

await records.target.upsertUnique({
  id: "target_1",
  item_id: "item_1",
  server_id: "server_1",
}, {
  context,
});

const document = await store.entity.read.by("document", {
  id: "doc_1",
}, context, {
  mode: "detail",
});

const activeDocuments = await store.entity.read.all("documents", context, {
  where: {
    status: "active",
  },
});

const comments = await store.subEntity.list("comments", {
  id: "doc_1",
}, context);

const openItems = await records.item.list({
  context,
  limit: 10,
  mode: "raw",
  where: {
    status: "draft",
  },
});

const repair = await store.repair.orphansAndDuplicates({
  child: records.target,
  childParentKey: "item_id",
  context,
  freshnessFields: [
    "recorded_at",
  ],
  keep: "freshest",
  parent: records.item,
  uniqueBy: [
    "item_id",
    "server_id",
  ],
});

console.log(document.data, activeDocuments.data, comments.data, openItems.data, repair);
