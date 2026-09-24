import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./alert_condition.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const condition = {
  name: "High CPU",
  enabled: true,
  nrql: { query: "SELECT count(*) FROM Transaction" },
};

Deno.test(
  "create stores condition",
  withFetchRestore(async () => {
    stubFetch({
      alertsNrqlConditionStaticCreate: {
        id: "1",
        name: "High CPU",
        policyId: "10",
        enabled: true,
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute({
      policyId: "10",
      conditionType: "STATIC",
      condition,
    }, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "update stores updated condition",
  withFetchRestore(async () => {
    stubFetch({
      alertsNrqlConditionStaticUpdate: {
        id: "1",
        name: "Low CPU",
        policyId: "10",
        enabled: false,
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({
      id: "1",
      conditionType: "STATIC",
      condition: { enabled: false },
    }, ctx);
    assertEquals(written[0].data.enabled, false);
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ alertsConditionDelete: { id: "1" } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ id: "1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by id returns condition",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: { alerts: { nrqlCondition: { id: "1", name: "High CPU" } } },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ id: "1" }, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: { alerts: { nrqlCondition: null } } } });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ id: "99" }, ctx),
      Error,
      "No alert condition",
    );
  }),
);

Deno.test(
  "lookup by name returns first match",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          alerts: {
            nrqlConditionsSearch: { nrqlConditions: [{ id: "2", name: "X" }] },
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "X" }, ctx);
    assertEquals(written[0].data.id, "2");
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "denied" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ id: "1" }, ctx),
      Error,
      "denied",
    );
  }),
);
