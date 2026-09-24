import { assertEquals, assertRejects } from "@std/assert";
import { z } from "npm:zod@4";
import { assertNoErrors, client, NotFoundError, nrModel } from "./nerdgraph.ts";
import {
  mockContext,
  stubFetchQueue,
  withFetchRestore,
} from "./test_helpers.ts";

Deno.test("assertNoErrors throws only on a non-empty errors array", () => {
  assertNoErrors({ errors: [] }, "x");
  assertNoErrors({ monitor: {} }, "x");
  assertNoErrors(null, "x");
  let threw = false;
  try {
    assertNoErrors({ errors: [{ description: "bad" }] }, "dashboardCreate");
  } catch (e) {
    threw = true;
    if (!(e as Error).message.includes("dashboardCreate failed")) throw e;
  }
  if (!threw) throw new Error("expected assertNoErrors to throw");
});

Deno.test("client surfaces GraphQL errors from a 200 response", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ errors: [{ message: "nope" }] }), {
        status: 200,
      }),
    );
  try {
    const nr = client({
      accountId: 1,
      apiKey: "k",
      endpoint: "https://example.invalid",
    });
    await nr.query("{ actor { user { name } } }").then(
      () => {
        throw new Error("expected query to throw");
      },
      (e: Error) => {
        if (!e.message.includes("nope")) throw e;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("nrModel writes state/current by default and honours resource overrides", async () => {
  const model = nrModel({
    type: "@test/fake",
    description: "fake",
    schema: z.looseObject({ a: z.string() }),
    methods: {
      lookup: {
        description: "default output",
        arguments: z.object({}),
        run: () => Promise.resolve({ a: "1" }),
      },
      named: {
        description: "overridden output",
        arguments: z.object({ name: z.string().optional() }),
        resource: "extra",
        resourceName: (args: { name?: string }) => args.name ?? "res",
        run: () => Promise.resolve({ a: "2" }),
      },
    },
    resources: {
      extra: { description: "extra", schema: z.looseObject({ a: z.string() }) },
    },
  });
  const { ctx, written } = mockContext();
  await model.methods.lookup.execute({}, ctx);
  await model.methods.named.execute({ name: "q1" }, ctx);
  assertEquals(written[0].spec, "state");
  assertEquals(written[0].name, "current");
  assertEquals(written[1].spec, "extra");
  assertEquals(written[1].name, "q1");
  assertEquals(
    Object.keys(model.resources).sort(),
    ["extra", "state"],
  );
});

type FactoryDef = Parameters<typeof nrModel>[0];

/** Minimal fake model builder for the shared factory behaviours. */
function fakeModel(extra: Omit<FactoryDef, "type" | "description" | "schema">) {
  return nrModel({
    type: "@test/fake",
    description: "fake",
    schema: z.looseObject({ id: z.string(), name: z.string().optional() }),
    ...extra,
  });
}

Deno.test("delete succeeds when the entity is already gone", async () => {
  const model = fakeModel({
    methods: {
      delete: {
        description: "delete",
        arguments: z.object({ id: z.string() }),
        run: () => Promise.reject(new NotFoundError("No fake x")),
      },
    },
  });
  const { ctx, deleted } = mockContext({ current: { id: "x" } });
  const result = await model.methods.delete.execute({ id: "x" }, ctx);
  assertEquals(result.dataHandles, []);
  assertEquals(deleted, ["current"]);
});

Deno.test("sync refreshes stored state via lookup", async () => {
  const model = fakeModel({
    syncKey: "id",
    methods: {
      lookup: {
        description: "lookup",
        arguments: z.object({ id: z.string().optional() }),
        run: (args: { id?: string }) =>
          Promise.resolve({ id: args.id, name: "n2" }),
      },
    },
  });
  const { ctx, written } = mockContext({ current: { id: "x", name: "n1" } });
  await model.methods.sync.execute({}, ctx);
  assertEquals(written[0].data.name, "n2");
});

Deno.test("sync marks state not_found when the entity is gone", async () => {
  const model = fakeModel({
    syncKey: "id",
    methods: {
      lookup: {
        description: "lookup",
        arguments: z.object({ id: z.string().optional() }),
        run: () => Promise.reject(new NotFoundError("gone")),
      },
    },
  });
  const { ctx, written } = mockContext({ current: { id: "x", name: "n1" } });
  await model.methods.sync.execute({}, ctx);
  assertEquals(written[0].data.status, "not_found");
  assertEquals(written[0].data.name, "n1");
});

Deno.test("create adopts the existing entity on a uniqueness conflict", async () => {
  const model = fakeModel({
    idempotentCreate: true,
    nameFromArgs: (args: { name?: string }) => args.name,
    methods: {
      create: {
        description: "create",
        arguments: z.object({ name: z.string() }),
        run: () => Promise.reject(new Error("name must be unique")),
      },
      lookup: {
        description: "lookup",
        arguments: z.object({ name: z.string().optional() }),
        run: (args: { name?: string }) =>
          Promise.resolve({ id: "existing", name: args.name }),
      },
    },
  });
  const { ctx, written } = mockContext();
  await model.methods.create.execute({ name: "dup" }, ctx);
  assertEquals(written[0].data.id, "existing");
});

Deno.test("create rethrows when a conflict cannot be resolved", async () => {
  const model = fakeModel({
    idempotentCreate: true,
    nameFromArgs: (args: { name?: string }) => args.name,
    methods: {
      create: {
        description: "create",
        arguments: z.object({ name: z.string() }),
        run: () => Promise.reject(new Error("name must be unique")),
      },
      lookup: {
        description: "lookup",
        arguments: z.object({ name: z.string().optional() }),
        run: () => Promise.reject(new NotFoundError("gone")),
      },
    },
  });
  const { ctx } = mockContext();
  await assertRejects(
    () => model.methods.create.execute({ name: "dup" }, ctx),
    Error,
    "must be unique",
  );
});

Deno.test(
  "client retries a 429 then succeeds",
  withFetchRestore(async () => {
    const counter = stubFetchQueue([
      () =>
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0" },
        }),
      () =>
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    ]);
    const nr = client({
      accountId: 1,
      apiKey: "k",
      endpoint: "https://example.invalid",
    });
    const data = await nr.query<{ ok: boolean }>("query { ok }");
    assertEquals(data.ok, true);
    assertEquals(counter.calls, 2);
  }),
);

Deno.test(
  "client does not retry a mutation on 503",
  withFetchRestore(async () => {
    const counter = stubFetchQueue([
      () => new Response("unavailable", { status: 503 }),
    ]);
    const nr = client({
      accountId: 1,
      apiKey: "k",
      endpoint: "https://example.invalid",
    });
    await assertRejects(() => nr.query("mutation { x }"), Error, "503");
    assertEquals(counter.calls, 1);
  }),
);
