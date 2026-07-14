import {
  computed,
  countBy,
  createStoreRuntime,
  relation,
} from "@trebired/store";

const runtime = createStoreRuntime({
  boot: {
    fixes: [
      {
        actions: [
          {
            if: {
              equals: "starting",
              field: "status",
            },
            set: {
              status: "stopped",
            },
            unset: [
              "runtime.pid",
            ],
          },
        ],
        entity: "items",
      },
    ],
  },
  entities: {
    items: {
      aliases: [
        "item",
      ],
      modes: {
        detail: {
          with: {
            owner: relation({
              assign: "owner",
              entity: "owners",
              id: "owner_id",
              mode: "raw",
            }),
            totals: countBy({
              assign: {
                total: "children_total",
              },
              entity: "children",
              foreignKey: "item_id",
              localKey: "id",
            }),
            url: computed((record, api) => ({
              url: api.url(record),
            })),
          },
        },
      },
      table: "items",
    },
    owners: {
      table: "owners",
    },
    children: {
      table: "children",
    },
  },
});

await runtime.entity.write.put("owners", {}, {
  id: "owner_1",
  name: "Owner",
});
await runtime.entity.write.put("items", {}, {
  id: "item_1",
  owner_id: "owner_1",
  status: "starting",
});
await runtime.entity.write.put("children", {}, {
  id: "child_1",
  item_id: "item_1",
});
await runtime.onBoot();

const detail = await runtime.entity.read.by("item", {
  id: "item_1",
}, {}, {
  mode: "detail",
});

console.log(detail.data);
