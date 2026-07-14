import { expect, test } from "bun:test";

import {
  computed,
  countBy,
  createStoreRuntime,
  redactDatabaseUrl,
  relation,
  validateRuntimePostgresQuery,
} from "#index";
import type {
  RuntimePostgresClient,
  StoreLogEvent,
  StoreRecord,
} from "#index";

test("validates runtime Postgres application queries", () => {
  expect(() => validateRuntimePostgresQuery("", [])).toThrow("empty");
  expect(() => validateRuntimePostgresQuery("select $1; select $2", [1, 2])).toThrow("multiple");
  expect(() => validateRuntimePostgresQuery("select $1 -- no", [1])).toThrow("comments");
  expect(() => validateRuntimePostgresQuery("select $2", [1])).toThrow("placeholder");
  expect(() => validateRuntimePostgresQuery("select * from rows where name = 'x'", [], {
    operation: "read",
  })).toThrow("inline string");
  expect(() => validateRuntimePostgresQuery("select * from rows where id = $1", ["x"], {
    operation: "read",
  })).not.toThrow();
});

test("logs redacted Postgres URLs, caller metadata, and initializes schema tables indexes and migrations", async () => {
  const events: StoreLogEvent[] = [];
  expect(redactDatabaseUrl("postgres://user:secret@example.test/db")).toBe("postgres://redacted:redacted@example.test/db");
  const client = new CapturePostgresClient();
  const runtime = createStoreRuntime({
    entities: {
      rows: {
        table: "rows",
      },
    },
    loggerAdapter(_logger, event) {
      events.push(event);
    },
    postgres: {
      client,
      indexes: [
        {
          expression: "(record->>'status')",
          table: "rows",
        },
      ],
      logOperations: true,
      migrations: [
        async (api) => {
          await api.query("select $1", ["migration"]);
        },
      ],
      schema: "app",
    },
  });

  await runtime.postgres.query("select $1", ["ok"], {
    name: "read-one",
    operation: "read",
  });
  await runtime.postgres.init();

  expect(events.some((event) => event.message.includes("Postgres query completed"))).toBe(true);
  expect(events.some((event) => Boolean((event.metadata as { caller?: unknown } | undefined)?.caller))).toBe(true);
  expect(client.sql).toContain("create schema if not exists \"app\"");
  expect(client.sql).toContain("create table if not exists \"app\".\"rows\" (id text primary key, record jsonb not null)");
  expect(client.sql.some((sql) => sql.includes("using gin (record)"))).toBe(true);
  expect(client.sql.some((sql) => sql.includes("(record->>'status')"))).toBe(true);
  expect(client.params.some((params) => params[0] === "migration")).toBe(true);
});

test("runs boot fixes with matching, set, unset, set_if_missing, rewrites, follow-ups, and skip rules", async () => {
  const followUps: string[] = [];
  const runtime = createStoreRuntime({
    boot: {
      developerMode: true,
      fixes: [
        {
          actions: [
            {
              rewrite: "normalize",
            },
            {
              if: {
                equals_any: [
                  "running",
                  "starting",
                ],
                field: "status",
              },
              set: {
                status: "stopped",
              },
              set_if_missing: {
                seen: true,
              },
              unset: [
                "runtime.pid",
              ],
            },
            {
              after: [
                {
                  call: "tasks.start",
                },
              ],
              if_all: [
                {
                  equals: "stopped",
                  field: "status",
                },
                {
                  equals_any: [
                    "true",
                    "1",
                  ],
                  field: "runtime.policy.auto_start",
                },
              ],
              run_after_on_match: true,
            },
            {
              set: {
                ignored: true,
              },
              skip_in_developer_mode: true,
            },
          ],
          entity: "tasks",
        },
      ],
      followUps: {
        "tasks.start": async ({ record }) => {
          followUps.push(record.id);
        },
      },
      rewrites: {
        tasks: {
          normalize: (record) => ({
            ...record,
            normalized: true,
          }),
        },
      },
    },
    entities: {
      tasks: {
        table: "tasks",
      },
    },
  });

  await runtime.entity.write.put("tasks", {}, {
    id: "task_1",
    runtime: {
      pid: 42,
      policy: {
        auto_start: "true",
      },
    },
    status: "running",
  });
  const result = await runtime.onBoot();
  const row = await runtime.entity.read.by("tasks", {
    id: "task_1",
  }, {}, {
    mode: "raw",
  });

  expect(result.changedCount).toBe(1);
  expect(result.queuedFollowUps).toHaveLength(1);
  expect(result.skipped[0]?.reason).toBe("developer-mode");
  expect(followUps).toEqual(["task_1"]);
  expect(row.data).toMatchObject({
    normalized: true,
    seen: true,
    status: "stopped",
  });
  expect((row.data?.runtime as { pid?: number }).pid).toBeUndefined();
});

test("runtime memo supports stable keys, inflight dedupe, L1/L2 reads, entity invalidation, and remote invalidation", async () => {
  let remoteHandler: ((message: string) => void) | null = null;
  const l2 = new Map<string, unknown>();
  const runtime = createStoreRuntime({
    entities: {
      rows: {
        table: "rows",
      },
    },
    memo: {
      l2: {
        delete: async (key) => {
          l2.delete(key);
        },
        get: async <T>(key: string) => l2.get(key) as T | null ?? null,
        set: async (key, value) => {
          l2.set(key, value);
        },
      },
      redis: {
        publish: async (_channel, message) => {
          remoteHandler?.(message);
        },
        subscribe: async (_channel, handler) => {
          remoteHandler = handler;
        },
      },
    },
  });
  const one = runtime.memo.keyForRead({
    context: {
      req: {},
      tenant: "a",
    },
    entity: "rows",
    operation: "all",
    options: {
      cache: false,
    },
  });
  const two = runtime.memo.keyForRead({
    context: {
      tenant: "a",
    },
    entity: "rows",
    operation: "all",
  });

  expect(one).toBe(two);
  let loads = 0;
  const [a, b] = await Promise.all([
    runtime.memo.run("shared", async () => {
      loads += 1;
      return "value";
    }, {
      entity: "rows",
    }),
    runtime.memo.run("shared", async () => {
      loads += 1;
      return "other";
    }, {
      entity: "rows",
    }),
  ]);
  expect([a, b]).toEqual([
    "value",
    "value",
  ]);
  expect(loads).toBe(1);
  expect(await runtime.memo.get<string>("shared")).toBe("value");
  expect(runtime.memo.inspectRead("shared", "rows").hit).toBe("l1");
  await runtime.memo.invalidateEntity("rows");
  expect(runtime.memo.entityVersion("rows")).toBe(2);
  expect(await runtime.memo.get<string>("shared")).toBe("value");
});

test("declarative hydration supports relation, counts, computed fields, and request memo reuse", async () => {
  const runtime = createStoreRuntime({
    entities: {
      jobs: {
        modes: {
          detail: {
            with: {
              organization: relation({
                assign: "organization",
                entity: "organizations",
                id: "organization_id",
                mode: "raw",
              }),
              processes: countBy({
                assign: {
                  running: [
                    "processes_running",
                    {
                      where: {
                        status: "running",
                      },
                    },
                  ],
                  total: "processes_total",
                },
                entity: "processes",
                foreignKey: "job_id",
                localKey: "id",
                set: [
                  {
                    field: "status",
                    value: "running",
                    when: {
                      field: "processes_running",
                      gt: 0,
                    },
                  },
                ],
              }),
              url: computed((record, api) => ({
                url: api.url(record),
              })),
            },
          },
        },
        table: "jobs",
      },
      organizations: {
        table: "organizations",
      },
      processes: {
        table: "processes",
      },
    },
  });

  await runtime.entity.write.put("organizations", {}, {
    id: "org_1",
    name: "Org",
  });
  await runtime.entity.write.put("jobs", {}, {
    id: "job_1",
    organization_id: "org_1",
  });
  await runtime.entity.write.put("processes", {}, {
    id: "proc_1",
    job_id: "job_1",
    status: "running",
  });
  await runtime.entity.write.put("processes", {}, {
    id: "proc_2",
    job_id: "job_1",
    status: "stopped",
  });

  const hydrated = await runtime.entity.read.by("jobs", {
    id: "job_1",
  }, {}, {
    mode: "detail",
  });

  expect(hydrated.data).toMatchObject({
    processes_running: 1,
    processes_total: 2,
    status: "running",
    url: "/job_1",
  });
  expect((hydrated.data?.organization as StoreRecord).name).toBe("Org");
});

test("runtime lets a small app use entities, hooks, boot fixes, Postgres config, and write events without wrappers", async () => {
  const writes: string[] = [];
  const runtime = createStoreRuntime({
    boot: {
      fixes: [
        {
          actions: [
            {
              if: {
                equals: "new",
                field: "status",
              },
              set: {
                status: "ready",
              },
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
            hooks: {
              "with-label": true,
            },
          },
        },
        table: "items",
      },
    },
    events: {
      onWrite: ({ entity, operation }) => {
        writes.push(`${entity}:${operation}`);
      },
    },
    modes: {
      legacyHookAdapter({ hook }) {
        if (hook !== "with-label") {
          return null;
        }
        return (record) => ({
          ...record,
          label: `Item ${record.id}`,
        });
      },
    },
  });

  await runtime.entity.write.put("item", {}, {
    id: "item_1",
    status: "new",
  });
  await runtime.onBoot();
  const detail = await runtime.entity.read.by("items", {
    id: "item_1",
  }, {}, {
    mode: "detail",
  });

  expect(detail.data).toMatchObject({
    label: "Item item_1",
    status: "ready",
  });
  expect(writes).toEqual([
    "items:put",
    "items:put",
  ]);
});

class CapturePostgresClient implements RuntimePostgresClient {
  readonly params: unknown[][] = [];
  readonly sql: string[] = [];

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<{ rows: T[] }> {
    this.sql.push(sql);
    this.params.push([...params]);
    return {
      rows: [],
    };
  }
}
