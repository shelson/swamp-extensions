import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./alert_policy.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

Deno.test(
  "create stores policy",
  withFetchRestore(async () => {
    stubFetch({
      alertsPolicyCreate: {
        id: "1",
        name: "P",
        incidentPreference: "PER_POLICY",
        accountId: 1,
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute({
      name: "P",
      incidentPreference: "PER_POLICY",
    }, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "update stores updated policy",
  withFetchRestore(async () => {
    stubFetch({
      alertsPolicyUpdate: {
        id: "1",
        name: "P2",
        incidentPreference: "PER_CONDITION",
        accountId: 1,
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({ id: "1", name: "P2" }, ctx);
    assertEquals(written[0].data.name, "P2");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ alertsPolicyDelete: { id: "1" } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ id: "1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by id returns policy",
  withFetchRestore(async () => {
    stubFetch({
      actor: { account: { alerts: { policy: { id: "1", name: "P" } } } },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ id: "1" }, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "lookup throws when policy not found",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: { alerts: { policy: null } } } });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ id: "999" }, ctx),
      Error,
      "No alert policy",
    );
  }),
);

Deno.test(
  "lookup by name returns first match",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          alerts: { policiesSearch: { policies: [{ id: "2", name: "P" }] } },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "P" }, ctx);
    assertEquals(written[0].data.id, "2");
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "bad" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () =>
        model.methods.create.execute({
          name: "P",
          incidentPreference: "PER_POLICY",
        }, ctx),
      Error,
      "bad",
    );
  }),
);
