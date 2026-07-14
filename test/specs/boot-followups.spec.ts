import { expect, test } from "bun:test";

import {
  bootFollowUpSkipped,
  bootRecord,
  booleanPolicyDefaults,
  createBootFollowUpDispatcher,
  createBootRewriter,
  createStoreRuntime,
  customTransform,
  defaultStatus,
  objectField,
  readBootBoolean,
  slugField,
  stringAliases,
  stringField,
  uniqueStringArrayField,
} from "#index";

test("boot follow-up dispatcher runs direct function handlers", async () => {
  const seen: string[] = [];
  const followUps = createBootFollowUpDispatcher({
    handlers: {
      "records.ensure": async ({ call, record }) => {
        seen.push(`${call}:${record.id}`);
        return {
          ensured: true,
        };
      },
    },
  });

  const result = await followUps["records.ensure"]({
    call: "records.ensure",
    entity: "records",
    record: {
      id: "rec_1",
    },
  });

  expect(seen).toEqual(["records.ensure:rec_1"]);
  expect(result).toMatchObject({
    ok: true,
    result: {
      ensured: true,
    },
    skipped: false,
  });
});

test("boot follow-up dispatcher runs object handlers and reads nested policy values", async () => {
  const followUps = createBootFollowUpDispatcher({
    handlers: {
      "records.start": {
        policy: "runtime.policy.enabled",
        run: async ({ api, record }) => api.succeeded({
          enabled: api.readBoolean(record, "runtime.policy.enabled"),
        }),
      },
    },
  });

  const result = await followUps["records.start"]({
    call: "records.start",
    entity: "records",
    record: {
      id: "rec_1",
      runtime: {
        policy: {
          enabled: "yes",
        },
      },
    },
  });

  expect(readBootBoolean({
    id: "rec",
    nested: {
      value: "on",
    },
  }, "nested.value")).toBe(true);
  expect(result).toMatchObject({
    ok: true,
    result: {
      enabled: true,
    },
    skipped: false,
  });
});

test("boot follow-up dispatcher skips unknown calls, thrown errors, false policy, and guard timeouts", async () => {
  let guardedRuns = 0;
  const followUps = createBootFollowUpDispatcher({
    guards: {
      ready: {
        isReady: async () => false,
        pollMs: 1,
        resolveTarget: async () => "target_1",
        timeoutMs: 2,
      },
    },
    handlers: {
      "records.disabled": {
        policy: {
          fallback: false,
          field: "runtime.policy.enabled",
        },
        run: async () => {
          throw new Error("should not run");
        },
      },
      "records.error": async () => {
        throw new Error("boom");
      },
      "records.guarded": {
        guard: "ready",
        run: async () => {
          guardedRuns += 1;
        },
      },
    },
  });
  const base = {
    entity: "records",
    record: {
      id: "rec_1",
    },
  };

  expect(await followUps["records.unknown"]({
    ...base,
    call: "records.unknown",
  })).toMatchObject({
    error_code: "boot-follow-up-skipped",
    skipped: true,
  });
  expect(await followUps["records.error"]({
    ...base,
    call: "records.error",
  })).toMatchObject({
    error_code: "boot-follow-up-failed",
    ok: false,
  });
  expect(await followUps["records.disabled"]({
    ...base,
    call: "records.disabled",
  })).toMatchObject({
    skipped: true,
  });
  expect(await followUps["records.guarded"]({
    ...base,
    call: "records.guarded",
  })).toMatchObject({
    skipped: true,
  });
  expect(guardedRuns).toBe(0);
});

test("boot follow-up dispatcher waits for a guard until ready", async () => {
  let checks = 0;
  const followUps = createBootFollowUpDispatcher({
    guards: {
      ready: {
        isReady: async () => {
          checks += 1;
          return checks > 1;
        },
        pollMs: 1,
        resolveTarget: async () => "target_1",
        timeoutMs: 30,
      },
    },
    handlers: {
      "records.ready": {
        guard: "ready",
        run: async ({ api }) => api.succeeded("ran"),
      },
    },
  });

  const result = await followUps["records.ready"]({
    call: "records.ready",
    entity: "records",
    record: {
      id: "rec_1",
    },
  });

  expect(result).toMatchObject({
    ok: true,
    result: "ran",
    skipped: false,
  });
  expect(checks).toBeGreaterThan(1);
});

test("boot runner records structured follow-up outcomes", async () => {
  const runtime = createStoreRuntime({
    boot: {
      fixes: [
        {
          actions: [
            {
              after: [
                {
                  call: "records.ensure",
                },
                {
                  call: "records.missing",
                },
              ],
              if: {
                equals: "new",
                field: "status",
              },
              run_after_on_match: true,
            },
          ],
          entity: "records",
        },
      ],
      followUps: createBootFollowUpDispatcher({
        handlers: {
          "records.ensure": async ({ api }) => api.succeeded({
            queued: true,
          }),
        },
      }),
    },
    entities: {
      records: {
        table: "records",
      },
    },
  });

  await runtime.entity.write.put("records", {}, {
    id: "rec_1",
    status: "new",
  });
  const result = await runtime.onBoot();

  expect(result.followUpCount).toBe(2);
  expect(result.followUpsRunCount).toBe(1);
  expect(result.followUps).toEqual([
    expect.objectContaining({
      call: "records.ensure",
      ok: true,
      skipped: false,
    }),
    expect.objectContaining({
      call: "records.missing",
      skipped: true,
    }),
  ]);
});

test("boot rewrite builder normalizes aliases defaults nested fields and preserves input", async () => {
  const input = {
    createdAt: "2026-01-01",
    id: "rec_1",
    metadata: "bad",
    tagIds: [
      "blue",
      "blue",
      "",
      "green",
    ],
  };
  const rewrite = bootRecord([
    stringField("name", {
      fallbackFrom: "id",
      prefix: "#",
    }),
    stringAliases("created_at", [
      "createdAt",
      "recorded_at",
    ]),
    objectField("metadata", {
      defaults: {
        source: "boot",
      },
    }),
    uniqueStringArrayField("tags", [
      "tagIds",
    ]),
    defaultStatus("stopped"),
    booleanPolicyDefaults("runtime.policy", {
      auto_start_on_boot: true,
    }),
    slugField("slug", [
      "name",
    ]),
  ]);

  const result = await rewrite(input, {
    config: {
      rewrite: "normalize",
    },
    context: {},
    entity: "records",
  });

  expect(result).toMatchObject({
    created_at: "2026-01-01",
    id: "rec_1",
    metadata: {
      source: "boot",
    },
    name: "#rec_1",
    runtime: {
      policy: {
        auto_start_on_boot: true,
      },
    },
    slug: "rec-1",
    status: "stopped",
    tags: [
      "blue",
      "green",
    ],
  });
  expect(input).not.toHaveProperty("name");
});

test("boot rewrite builder supports custom transforms and runtime rewrites", async () => {
  const rewrite = createBootRewriter({
    records: bootRecord([
      customTransform((record) => ({
        ...record,
        normalized: true,
      })),
    ]),
  });
  const runtime = createStoreRuntime({
    boot: {
      fixes: [
        {
          actions: [
            {
              rewrite: "normalize",
            },
          ],
          entity: "records",
        },
      ],
      rewrites: {
        normalize: rewrite,
      },
    },
    entities: {
      records: {
        table: "records",
      },
    },
  });

  await runtime.entity.write.put("records", {}, {
    id: "rec_1",
  });
  await runtime.onBoot();
  const row = await runtime.entity.read.by("records", {
    id: "rec_1",
  }, {}, {
    mode: "raw",
  });

  expect(row.data).toMatchObject({
    normalized: true,
  });
});

test("boot follow-up result helpers create reusable skipped outcomes", () => {
  expect(bootFollowUpSkipped("records.noop", "records", {
    recordId: "rec_1",
  })).toMatchObject({
    call: "records.noop",
    entity: "records",
    recordId: "rec_1",
    skipped: true,
  });
});
