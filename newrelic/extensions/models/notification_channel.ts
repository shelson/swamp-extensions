/**
 * New Relic notification channels (NerdGraph `aiNotificationsCreateChannel` /
 * `UpdateChannel` / `DeleteChannel`).
 *
 * A channel binds a destination to a message template for a product (usually
 * `ALERTS`). Its `id` is the `channelId` that
 * `@shelson/newrelic-workflow.destinationConfigurations` expects, so even a
 * `lookup`-only use of this type is worth having.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

const ChannelType = z.enum([
  "EMAIL",
  "EVENT_BRIDGE",
  "JIRA_CLASSIC",
  "JIRA_NEXTGEN",
  "MICROSOFT_TEAMS",
  "MOBILE_PUSH",
  "PAGERDUTY_ACCOUNT_INTEGRATION",
  "PAGERDUTY_SERVICE_INTEGRATION",
  "SERVICE_NOW_APP",
  "SERVICENOW_EVENTS",
  "SERVICENOW_INCIDENTS",
  "SLACK",
  "SLACK_COLLABORATION",
  "SLACK_LEGACY",
  "WEBHOOK",
  "WORKFLOW_AUTOMATION",
]);

/** Type-specific payload, e.g. `payload` for WEBHOOK, `channelId` for SLACK. */
const Property = z.looseObject({
  key: z.string(),
  value: z.string(),
  label: z.string().optional(),
  displayValue: z.string().optional(),
});

const FIELDS = `id name type product active status destinationId accountId
  properties { key value label displayValue }`;

const ERRORS =
  `errors { ... on AiNotificationsResponseError { description type } }`;

const definition = nrModel({
  type: "@shelson/newrelic-notification-channel",
  description:
    "New Relic notification channel (channelId source for workflows)",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    destinationId: z.string(),
  }),
  syncKey: "id",
  syncLookupArg: "channelId",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create a notification channel on a destination",
      arguments: z.object({
        name: z.string(),
        type: ChannelType,
        destinationId: z.string(),
        product: z.string().default("ALERTS"),
        properties: z.array(Property),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const data = await nr.query<
          { aiNotificationsCreateChannel: { channel: Record<string, unknown> } }
        >(
          `mutation($accountId: Int, $channel: AiNotificationsChannelInput!) {
             aiNotificationsCreateChannel(accountId: $accountId, channel: $channel) {
               channel { ${FIELDS} }
               ${ERRORS}
             }
           }`,
          { accountId: nr.accountId, channel: args },
        );
        assertNoErrors(
          data.aiNotificationsCreateChannel,
          "aiNotificationsCreateChannel",
        );
        return data.aiNotificationsCreateChannel.channel;
      },
    },
    update: {
      description: "Update a notification channel",
      arguments: z.object({
        channelId: z.string(),
        name: z.string().optional(),
        active: z.boolean().optional(),
        properties: z.array(Property).optional(),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const { channelId, ...channel } = args;
        const data = await nr.query<
          { aiNotificationsUpdateChannel: { channel: Record<string, unknown> } }
        >(
          `mutation($accountId: Int, $channelId: ID!, $channel: AiNotificationsChannelUpdate!) {
             aiNotificationsUpdateChannel(
               accountId: $accountId, channelId: $channelId, channel: $channel
             ) {
               channel { ${FIELDS} }
               ${ERRORS}
             }
           }`,
          { accountId: nr.accountId, channelId, channel },
        );
        assertNoErrors(
          data.aiNotificationsUpdateChannel,
          "aiNotificationsUpdateChannel",
        );
        return data.aiNotificationsUpdateChannel.channel;
      },
    },
    delete: {
      description: "Delete a notification channel by ID",
      arguments: z.object({ channelId: z.string() }),
      run: async (args: { channelId: string }, nr) => {
        const data = await nr.query<{ aiNotificationsDeleteChannel: unknown }>(
          `mutation($accountId: Int, $channelId: ID!) {
             aiNotificationsDeleteChannel(accountId: $accountId, channelId: $channelId) {
               ids
               ${ERRORS}
             }
           }`,
          { accountId: nr.accountId, channelId: args.channelId },
        );
        assertNoErrors(
          data.aiNotificationsDeleteChannel,
          "aiNotificationsDeleteChannel",
        );
        return null;
      },
    },
    lookup: {
      description:
        "Look up a channel by ID, or by name (optionally scoped to a destination) — " +
        "use this to resolve the channelId a workflow needs",
      arguments: z.object({
        channelId: z.string().optional(),
        name: z.string().optional(),
        destinationId: z.string().optional(),
      }),
      run: async (
        args: { channelId?: string; name?: string; destinationId?: string },
        nr,
      ) => {
        if (!args.channelId && !args.name) {
          throw new Error("lookup requires channelId or name");
        }
        const filters: Record<string, string> = args.channelId
          ? { id: args.channelId }
          : { name: args.name as string };
        if (args.destinationId) filters.destinationId = args.destinationId;
        const data = await nr.query<
          {
            actor: {
              account: {
                aiNotifications: {
                  channels: { entities: Record<string, unknown>[] };
                };
              };
            };
          }
        >(
          `query($accountId: Int!, $filters: AiNotificationsChannelFilter) {
             actor { account(id: $accountId) { aiNotifications {
               channels(filters: $filters) { entities { ${FIELDS} } }
             } } }
           }`,
          { accountId: nr.accountId, filters },
        );
        const found = data.actor.account.aiNotifications.channels.entities;
        // The `name` filter is a substring match server-side; prefer an exact hit.
        const exact = args.name
          ? found.find((c) => c.name === args.name)
          : undefined;
        const channel = exact ?? found[0];
        if (!channel) {
          throw new NotFoundError(
            `No channel matching ${args.channelId ?? args.name}`,
          );
        }
        return channel;
      },
    },
  },
});

/** New Relic notification channel model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-notification-channel",
  version: "2026.09.25.1",
};
