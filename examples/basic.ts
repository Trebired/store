import {
  createMemoryStorageAdapter,
  createStore,
  defineEntityRegistry,
} from "@trebired/store";

const entities = defineEntityRegistry({
  documents: {
    aliases: ["document", "docs"],
    context: ["workspaceId"],
    metadata: {
      icon: "file-text",
      name: "Document",
    },
    modes: {
      summary: {
        enrich: "documents.summary",
      },
    },
    privateFields: {
      token: "documents:private",
    },
    storage: "memory",
    table: "documents",
  },
});

const store = createStore({
  entities,
  enrichers: {
    "documents.summary": (record) => ({
      id: record.id,
      title: record.title,
      wordCount: String(record.body || "").split(/\s+/u).filter(Boolean).length,
    }),
  },
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
  title: "Store extraction",
  token: "secret",
});

const document = await store.entity.read.by("document", {
  id: "doc_1",
}, context, {
  mode: "summary",
});

const comments = await store.subEntity.list("comments", {
  id: "doc_1",
}, context);

console.log(document.data, comments.data);
