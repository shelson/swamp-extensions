import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./notification_destination.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const dest = {
  name: "Webhook",
  type: "WEBHOOK" as const,
  properties: [{ key: "url", value: "https://example.com" }],
};

Deno.test(
  "create stores destination",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsCreateDestination: {
        destination: {
          id: "d1",
          name: "Webhook",
          type: "WEBHOOK",
          active: true,
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute(dest, ctx);
    assertEquals(written[0].data.id, "d1");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsCreateDestination: {
        destination: null,
        errors: [{ description: "nope", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(dest, ctx),
      Error,
      "aiNotificationsCreateDestination failed",
    );
  }),
);

Deno.test(
  "update stores updated destination",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsUpdateDestination: {
        destination: {
          id: "d1",
          name: "Renamed",
          type: "WEBHOOK",
          active: true,
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute(
      { destinationId: "d1", name: "Renamed" },
      ctx,
    );
    assertEquals(written[0].data.name, "Renamed");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsDeleteDestination: { ids: ["d1"], errors: [] },
    });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ destinationId: "d1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by name returns first match",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          aiNotifications: {
            destinations: { entities: [{ id: "d1", name: "Webhook" }] },
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "Webhook" }, ctx);
    assertEquals(written[0].data.id, "d1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: { aiNotifications: { destinations: { entities: [] } } },
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ name: "gone" }, ctx),
      Error,
      "No destination",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "err" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(dest, ctx),
      Error,
      "err",
    );
  }),
);
