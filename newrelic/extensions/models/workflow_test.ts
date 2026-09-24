import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./workflow.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const wf = {
  name: "Alert route",
  destinationConfigurations: [{ channelId: "c1" }],
};

Deno.test(
  "create stores workflow",
  withFetchRestore(async () => {
    stubFetch({
      aiWorkflowsCreateWorkflow: {
        workflow: { id: "w1", name: "Alert route", workflowEnabled: true },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute(wf, ctx);
    assertEquals(written[0].data.id, "w1");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      aiWorkflowsCreateWorkflow: {
        workflow: null,
        errors: [{ description: "bad", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(wf, ctx),
      Error,
      "aiWorkflowsCreateWorkflow failed",
    );
  }),
);

Deno.test(
  "update stores updated workflow",
  withFetchRestore(async () => {
    stubFetch({
      aiWorkflowsUpdateWorkflow: {
        workflow: { id: "w1", name: "Renamed", workflowEnabled: false },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute({ id: "w1", name: "Renamed" }, ctx);
    assertEquals(written[0].data.name, "Renamed");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ aiWorkflowsDeleteWorkflow: { id: "w1", errors: [] } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ id: "w1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by id returns workflow",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          aiWorkflows: {
            workflows: { entities: [{ id: "w1", name: "Alert route" }] },
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ id: "w1" }, ctx);
    assertEquals(written[0].data.id, "w1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({
      actor: { account: { aiWorkflows: { workflows: { entities: [] } } } },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ id: "w1" }, ctx),
      Error,
      "No workflow",
    );
  }),
);

Deno.test(
  "lookup requires id or name",
  withFetchRestore(async () => {
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({}, ctx),
      Error,
      "requires id or name",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "nah" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(wf, ctx),
      Error,
      "nah",
    );
  }),
);
