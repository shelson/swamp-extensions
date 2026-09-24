import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./notification_channel.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const ch = {
  name: "Slack",
  type: "SLACK" as const,
  destinationId: "d1",
  product: "ALERTS",
  properties: [{ key: "channelId", value: "C123" }],
};

Deno.test(
  "create stores channel",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsCreateChannel: {
        channel: {
          id: "c1",
          name: "Slack",
          type: "SLACK",
          destinationId: "d1",
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute(ch, ctx);
    assertEquals(written[0].data.id, "c1");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsCreateChannel: {
        channel: null,
        errors: [{ description: "bad dest", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute(ch, ctx),
      Error,
      "aiNotificationsCreateChannel failed",
    );
  }),
);

Deno.test(
  "update stores updated channel",
  withFetchRestore(async () => {
    stubFetch({
      aiNotificationsUpdateChannel: {
        channel: {
          id: "c1",
          name: "Slack2",
          type: "SLACK",
          destinationId: "d1",
        },
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute(
      { channelId: "c1", name: "Slack2" },
      ctx,
    );
    assertEquals(written[0].data.name, "Slack2");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ aiNotificationsDeleteChannel: { ids: ["c1"], errors: [] } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ channelId: "c1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by name returns exact match",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          aiNotifications: {
            channels: {
              entities: [{
                id: "c1",
                name: "Slack",
                type: "SLACK",
                destinationId: "d1",
              }],
            },
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "Slack" }, ctx);
    assertEquals(written[0].data.id, "c1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({
      actor: { account: { aiNotifications: { channels: { entities: [] } } } },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ name: "nope" }, ctx),
      Error,
      "No channel",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "denied" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ channelId: "c1" }, ctx),
      Error,
      "denied",
    );
  }),
);
