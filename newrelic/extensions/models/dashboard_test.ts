import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./dashboard.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const dash = {
  name: "D",
  permissions: "PUBLIC_READ_ONLY" as const,
  pages: [{ name: "P1" }],
};

Deno.test(
  "create stores dashboard entity",
  withFetchRestore(async () => {
    stubFetch({
      dashboardCreate: { entityResult: { guid: "g1", name: "D" }, errors: [] },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute({ dashboard: dash }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      dashboardCreate: {
        entityResult: null,
        errors: [{ description: "bad", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute({ dashboard: dash }, ctx),
      Error,
      "dashboardCreate failed",
    );
  }),
);

Deno.test(
  "update stores updated entity",
  withFetchRestore(async () => {
    stubFetch({
      dashboardUpdate: { entityResult: { guid: "g1", name: "D2" }, errors: [] },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({ guid: "g1", dashboard: dash }, ctx);
    assertEquals(written[0].data.name, "D2");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ dashboardDelete: { status: "SUCCESS", errors: [] } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ guid: "g1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by guid returns entity",
  withFetchRestore(async () => {
    stubFetch({ actor: { entity: { guid: "g1", name: "D" } } });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ guid: "g1" }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "lookup throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "nope" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ guid: "g1" }, ctx),
      Error,
      "nope",
    );
  }),
);

Deno.test(
  "delete is idempotent when the dashboard is already gone",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "Dashboard not found" }]);
    const { ctx, deleted } = mockContext({
      current: { guid: "g1", name: "D" },
    });
    await model.methods.delete.execute({ guid: "g1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "sync refreshes dashboard state by guid",
  withFetchRestore(async () => {
    stubFetch({ actor: { entity: { guid: "g1", name: "D2" } } });
    const { ctx, written } = mockContext({
      current: { guid: "g1", name: "D1" },
    });
    await model.methods.sync.execute({}, ctx);
    assertEquals(written[0].data.name, "D2");
  }),
);
