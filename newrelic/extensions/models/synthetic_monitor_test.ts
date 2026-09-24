import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./synthetic_monitor.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const monitor = {
  name: "Check",
  period: "EVERY_5_MINUTES",
  status: "ENABLED" as const,
  uri: "https://example.com",
};

Deno.test(
  "create stores monitor with monitorType",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsCreateSimpleMonitor: {
        monitor: {
          id: "m1",
          guid: "g1",
          name: "Check",
          period: "EVERY_5_MINUTES",
          status: "ENABLED",
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute({ monitorType: "SIMPLE", monitor }, ctx);
    assertEquals(written[0].data.guid, "g1");
    assertEquals(written[0].data.monitorType, "SIMPLE");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsCreateSimpleMonitor: {
        monitor: null,
        errors: [{ description: "bad", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () =>
        model.methods.create.execute({ monitorType: "SIMPLE", monitor }, ctx),
      Error,
      "failed",
    );
  }),
);

Deno.test(
  "update stores updated monitor",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsUpdateSimpleMonitor: {
        monitor: {
          id: "m1",
          guid: "g1",
          name: "Check2",
          period: "EVERY_10_MINUTES",
          status: "ENABLED",
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({
      guid: "g1",
      monitorType: "SIMPLE",
      monitor: { ...monitor, name: "Check2" },
    }, ctx);
    assertEquals(written[0].data.name, "Check2");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ syntheticsDeleteMonitor: { deletedGuid: "g1" } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ guid: "g1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by guid returns entity",
  withFetchRestore(async () => {
    stubFetch({
      actor: { entity: { guid: "g1", name: "Check", monitorType: "SIMPLE" } },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ guid: "g1" }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "lookup by name searches then fetches entity",
  withFetchRestore(async () => {
    let call = 0;
    globalThis.fetch = () => {
      call++;
      const body = call === 1
        ? {
          data: {
            actor: {
              entitySearch: { results: { entities: [{ guid: "g1" }] } },
            },
          },
        }
        : {
          data: {
            actor: {
              entity: { guid: "g1", name: "Check", monitorType: "SIMPLE" },
            },
          },
        };
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200 }),
      );
    };
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "Check" }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({ actor: { entity: null } });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ guid: "g1" }, ctx),
      Error,
      "not found",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "oops" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ guid: "g1" }, ctx),
      Error,
      "oops",
    );
  }),
);
