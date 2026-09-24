/**
 * New Relic notification destinations (NerdGraph `aiNotificationsCreateDestination`
 * / `UpdateDestination` / `DeleteDestination`).
 *
 * A destination is the endpoint (Slack workspace, PagerDuty account, webhook,
 * email); channels layered on top of it are still out of scope — workflows
 * reference channels by `channelId`.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

const DestinationType = z.enum([
  "EMAIL",
  "EVENT_BRIDGE",
  "JIRA",
  "MICROSOFT_TEAMS",
  "MOBILE_PUSH",
  "PAGERDUTY_ACCOUNT_INTEGRATION",
  "PAGERDUTY_SERVICE_INTEGRATION",
  "SERVICE_NOW",
  "SERVICE_NOW_APP",
  "SLACK",
  "SLACK_COLLABORATION",
  "SLACK_LEGACY",
  "WEBHOOK",
  "WORKFLOW_AUTOMATION",
]);

/** `properties` is the type-specific payload (e.g. `url` for WEBHOOK). */
const Property = z.looseObject({
  key: z.string(),
  value: z.string(),
  label: z.string().optional(),
  displayValue: z.string().optional(),
});

/** Credentials are secrets — never stored back into model data. */
const Auth = z.looseObject({ type: z.string() });

const FIELDS = `id name type active status guid accountId
  properties { key value label displayValue }`;

const definition = nrModel({
  type: "@shelson/newrelic-notification-destination",
  description: "New Relic notification destination",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    active: z.boolean().optional(),
  }),
  syncKey: "id",
  syncLookupArg: "destinationId",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create a notification destination",
      arguments: z.object({
        name: z.string(),
        type: DestinationType,
        properties: z.array(Property),
        auth: Auth.optional(),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const data = await nr.query<
          {
            aiNotificationsCreateDestination: {
              destination: Record<string, unknown>;
            };
          }
        >(
          `mutation($accountId: Int, $destination: AiNotificationsDestinationInput!) {
             aiNotificationsCreateDestination(accountId: $accountId, destination: $destination) {
               destination { ${FIELDS} }
               errors { ... on AiNotificationsResponseError { description type } }
             }
           }`,
          { accountId: nr.accountId, destination: args },
        );
        assertNoErrors(
          data.aiNotificationsCreateDestination,
          "aiNotificationsCreateDestination",
        );
        return data.aiNotificationsCreateDestination.destination;
      },
    },
    update: {
      description: "Update a notification destination",
      arguments: z.object({
        destinationId: z.string(),
        name: z.string().optional(),
        active: z.boolean().optional(),
        properties: z.array(Property).optional(),
        auth: Auth.optional(),
        disableAuth: z.boolean().optional(),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const { destinationId, ...destination } = args;
        const data = await nr.query<
          {
            aiNotificationsUpdateDestination: {
              destination: Record<string, unknown>;
            };
          }
        >(
          `mutation($accountId: Int, $destinationId: ID!, $destination: AiNotificationsDestinationUpdate!) {
             aiNotificationsUpdateDestination(
               accountId: $accountId, destinationId: $destinationId, destination: $destination
             ) {
               destination { ${FIELDS} }
               errors { ... on AiNotificationsResponseError { description type } }
             }
           }`,
          { accountId: nr.accountId, destinationId, destination },
        );
        assertNoErrors(
          data.aiNotificationsUpdateDestination,
          "aiNotificationsUpdateDestination",
        );
        return data.aiNotificationsUpdateDestination.destination;
      },
    },
    delete: {
      description: "Delete a notification destination by ID",
      arguments: z.object({ destinationId: z.string() }),
      run: async (args: { destinationId: string }, nr) => {
        const data = await nr.query<
          { aiNotificationsDeleteDestination: unknown }
        >(
          `mutation($accountId: Int, $destinationId: ID!) {
             aiNotificationsDeleteDestination(accountId: $accountId, destinationId: $destinationId) {
               ids
               errors { ... on AiNotificationsResponseError { description type } }
             }
           }`,
          { accountId: nr.accountId, destinationId: args.destinationId },
        );
        assertNoErrors(
          data.aiNotificationsDeleteDestination,
          "aiNotificationsDeleteDestination",
        );
        return null;
      },
    },
    lookup: {
      description: "Look up a notification destination by ID or exact name",
      arguments: z.object({
        destinationId: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { destinationId?: string; name?: string }, nr) => {
        if (!args.destinationId && !args.name) {
          throw new Error("lookup requires destinationId or name");
        }
        const data = await nr.query<
          {
            actor: {
              account: {
                aiNotifications: {
                  destinations: { entities: Record<string, unknown>[] };
                };
              };
            };
          }
        >(
          `query($accountId: Int!, $filters: AiNotificationsDestinationFilter) {
             actor { account(id: $accountId) { aiNotifications {
               destinations(filters: $filters) { entities { ${FIELDS} } }
             } } }
           }`,
          {
            accountId: nr.accountId,
            filters: args.destinationId
              ? { id: args.destinationId }
              : { exactName: args.name },
          },
        );
        const found = data.actor.account.aiNotifications.destinations.entities;
        if (found.length === 0) {
          throw new NotFoundError(
            `No destination matching ${args.destinationId ?? args.name}`,
          );
        }
        return found[0];
      },
    },
  },
});

/** New Relic notification destination model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-notification-destination",
  version: "2026.09.25.1",
};
