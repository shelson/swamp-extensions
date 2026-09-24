import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./muting_rule.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const rule = {
  name: "Deploy window",
  enabled: true,
  condition: {
    operator: "AND" as const,
    conditions: [{
      attribute: "tag.env",
      operator: "EQUALS",
      values: ["prod"],
    }],
  },
};

Deno.test(
  "create stores muting rule",
  withFetchRestore(async () => {
    stubFetch({
      alertsMutingRuleCreate: { id: "1", name: "Deploy window", enabled: true },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute(rule, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "update stores updated rule",
  withFetchRestore(async () => {
    stubFetch({
      alertsMutingRuleUpdate: { id: "1", name: "Renamed", enabled: false },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({ id: "1", name: "Renamed" }, ctx);
    assertEquals(written[0].data.name, "Renamed");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ alertsMutingRuleDelete: { id: "1" } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ id: "1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by id returns rule",
  withFetchRestore(async () => {
    stubFetch({
      actor: { account: { alerts: { mutingRule: { id: "1", name: "R" } } } },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ id: "1" }, ctx);
    assertEquals(written[0].data.id, "1");
  }),
);

Deno.test(
  "lookup by name scans all rules",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          alerts: {
            mutingRules: [{ id: "2", name: "Other" }, {
              id: "3",
              name: "Deploy window",
            }],
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "Deploy window" }, ctx);
    assertEquals(written[0].data.id, "3");
  }),
);

Deno.test(
  "lookup throws when rule not found",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: { alerts: { mutingRule: null } } } });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ id: "99" }, ctx),
      Error,
      "No muting rule",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "fail" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(rule, ctx),
      Error,
      "fail",
    );
  }),
);
