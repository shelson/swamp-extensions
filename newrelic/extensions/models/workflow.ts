/**
 * New Relic applied-intelligence workflows (NerdGraph `aiWorkflows*`).
 *
 * Notification destinations/channels are referenced by ID here, not created —
 * see the extension README for why.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

const MutingRulesHandling = z.enum([
  "DONT_NOTIFY_FULLY_MUTED_ISSUES",
  "DONT_NOTIFY_FULLY_OR_PARTIALLY_MUTED_ISSUES",
  "NOTIFY_ALL_ISSUES",
]);

const DestinationConfiguration = z.looseObject({
  channelId: z.string(),
  notificationTriggers: z.array(z.string()).optional(),
});

const IssuesFilter = z.looseObject({
  name: z.string(),
  type: z.string(),
  predicates: z.array(z.looseObject({
    attribute: z.string(),
    operator: z.string(),
    values: z.array(z.string()),
  })).optional(),
});

const FIELDS =
  `id name workflowEnabled destinationsEnabled mutingRulesHandling accountId
  destinationConfigurations { channelId name type }
  issuesFilter { id name type predicates { attribute operator values } }`;

const definition = nrModel({
  type: "@shelson/newrelic-workflow",
  description: "New Relic applied-intelligence workflow",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    workflowEnabled: z.boolean().optional(),
  }),
  syncKey: "id",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create a workflow",
      arguments: z.object({
        name: z.string(),
        mutingRulesHandling: MutingRulesHandling.default("NOTIFY_ALL_ISSUES"),
        destinationConfigurations: z.array(DestinationConfiguration),
        issuesFilter: IssuesFilter.optional(),
        workflowEnabled: z.boolean().default(true),
        destinationsEnabled: z.boolean().default(true),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const data = await nr.query<
          { aiWorkflowsCreateWorkflow: { workflow: Record<string, unknown> } }
        >(
          `mutation($accountId: Int!, $data: AiWorkflowsCreateWorkflowInput!) {
             aiWorkflowsCreateWorkflow(accountId: $accountId, createWorkflowData: $data) {
               workflow { ${FIELDS} }
               errors { description type }
             }
           }`,
          { accountId: nr.accountId, data: args },
        );
        assertNoErrors(
          data.aiWorkflowsCreateWorkflow,
          "aiWorkflowsCreateWorkflow",
        );
        return data.aiWorkflowsCreateWorkflow.workflow;
      },
    },
    update: {
      description: "Update a workflow",
      arguments: z.object({
        id: z.string(),
        name: z.string().optional(),
        mutingRulesHandling: MutingRulesHandling.optional(),
        destinationConfigurations: z.array(DestinationConfiguration).optional(),
        issuesFilter: IssuesFilter.optional(),
        workflowEnabled: z.boolean().optional(),
        destinationsEnabled: z.boolean().optional(),
        deleteUnusedChannels: z.boolean().default(false),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const { deleteUnusedChannels, ...update } = args;
        const data = await nr.query<
          { aiWorkflowsUpdateWorkflow: { workflow: Record<string, unknown> } }
        >(
          `mutation($accountId: Int!, $del: Boolean!, $data: AiWorkflowsUpdateWorkflowInput!) {
             aiWorkflowsUpdateWorkflow(
               accountId: $accountId, deleteUnusedChannels: $del, updateWorkflowData: $data
             ) {
               workflow { ${FIELDS} }
               errors { description type }
             }
           }`,
          {
            accountId: nr.accountId,
            del: deleteUnusedChannels ?? false,
            data: update,
          },
        );
        assertNoErrors(
          data.aiWorkflowsUpdateWorkflow,
          "aiWorkflowsUpdateWorkflow",
        );
        return data.aiWorkflowsUpdateWorkflow.workflow;
      },
    },
    delete: {
      description: "Delete a workflow by ID",
      arguments: z.object({
        id: z.string(),
        deleteChannels: z.boolean().default(false),
      }),
      run: async (args: { id: string; deleteChannels?: boolean }, nr) => {
        const data = await nr.query<{ aiWorkflowsDeleteWorkflow: unknown }>(
          `mutation($accountId: Int!, $id: ID!, $deleteChannels: Boolean!) {
             aiWorkflowsDeleteWorkflow(
               accountId: $accountId, id: $id, deleteChannels: $deleteChannels
             ) { id errors { description type } }
           }`,
          {
            accountId: nr.accountId,
            id: args.id,
            deleteChannels: args.deleteChannels ?? false,
          },
        );
        assertNoErrors(
          data.aiWorkflowsDeleteWorkflow,
          "aiWorkflowsDeleteWorkflow",
        );
        return null;
      },
    },
    lookup: {
      description: "Look up a workflow by ID or exact name",
      arguments: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { id?: string; name?: string }, nr) => {
        if (!args.id && !args.name) {
          throw new Error("lookup requires id or name");
        }
        const data = await nr.query<
          {
            actor: {
              account: {
                aiWorkflows: {
                  workflows: { entities: Record<string, unknown>[] };
                };
              };
            };
          }
        >(
          `query($accountId: Int!, $filters: AiWorkflowsFilters) {
             actor { account(id: $accountId) { aiWorkflows {
               workflows(filters: $filters) { entities { ${FIELDS} } }
             } } }
           }`,
          {
            accountId: nr.accountId,
            filters: args.id ? { id: args.id } : { name: args.name },
          },
        );
        const found = data.actor.account.aiWorkflows.workflows.entities;
        if (found.length === 0) {
          throw new NotFoundError(
            `No workflow matching ${args.id ?? args.name}`,
          );
        }
        return found[0];
      },
    },
  },
});

/** New Relic workflow model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-workflow",
  version: "2026.09.25.1",
};
