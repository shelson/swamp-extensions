/**
 * New Relic alert policies (NerdGraph `alertsPolicyCreate` / `Update` / `Delete`).
 *
 * @module
 */
import { z } from "npm:zod@4";
import { NotFoundError, nrModel } from "./nerdgraph.ts";

const IncidentPreference = z.enum([
  "PER_POLICY",
  "PER_CONDITION",
  "PER_CONDITION_AND_TARGET",
]);

const FIELDS = `id name incidentPreference accountId`;

const definition = nrModel({
  type: "@shelson/newrelic-alert-policy",
  description: "New Relic alert policy",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    incidentPreference: z.string(),
  }),
  syncKey: "id",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create an alert policy",
      arguments: z.object({
        name: z.string(),
        incidentPreference: IncidentPreference,
      }),
      run: async (args: { name: string; incidentPreference: string }, nr) => {
        const data = await nr.query<
          { alertsPolicyCreate: Record<string, unknown> }
        >(
          `mutation($accountId: Int!, $policy: AlertsPolicyInput!) {
             alertsPolicyCreate(accountId: $accountId, policy: $policy) { ${FIELDS} }
           }`,
          { accountId: nr.accountId, policy: args },
        );
        return data.alertsPolicyCreate;
      },
    },
    update: {
      description: "Update an alert policy's name or incident preference",
      arguments: z.object({
        id: z.string(),
        name: z.string().optional(),
        incidentPreference: IncidentPreference.optional(),
      }),
      run: async (
        args: { id: string; name?: string; incidentPreference?: string },
        nr,
      ) => {
        const { id, ...policy } = args;
        const data = await nr.query<
          { alertsPolicyUpdate: Record<string, unknown> }
        >(
          `mutation($accountId: Int!, $id: ID!, $policy: AlertsPolicyUpdateInput!) {
             alertsPolicyUpdate(accountId: $accountId, id: $id, policy: $policy) { ${FIELDS} }
           }`,
          { accountId: nr.accountId, id, policy },
        );
        return data.alertsPolicyUpdate;
      },
    },
    delete: {
      description: "Delete an alert policy by ID",
      arguments: z.object({ id: z.string() }),
      run: async (args: { id: string }, nr) => {
        await nr.query(
          `mutation($accountId: Int!, $id: ID!) {
             alertsPolicyDelete(accountId: $accountId, id: $id) { id }
           }`,
          { accountId: nr.accountId, id: args.id },
        );
        return null;
      },
    },
    lookup: {
      description: "Look up an alert policy by ID or exact name",
      arguments: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { id?: string; name?: string }, nr) => {
        if (args.id) {
          const data = await nr.query<
            {
              actor: {
                account: { alerts: { policy: Record<string, unknown> | null } };
              };
            }
          >(
            `query($accountId: Int!, $id: ID!) {
               actor { account(id: $accountId) { alerts { policy(id: $id) { ${FIELDS} } } } }
             }`,
            { accountId: nr.accountId, id: args.id },
          );
          const policy = data.actor.account.alerts.policy;
          if (!policy) throw new NotFoundError(`No alert policy ${args.id}`);
          return policy;
        }
        if (!args.name) throw new Error("lookup requires id or name");
        const data = await nr.query<
          {
            actor: {
              account: {
                alerts: {
                  policiesSearch: { policies: Record<string, unknown>[] };
                };
              };
            };
          }
        >(
          `query($accountId: Int!, $name: String!) {
             actor { account(id: $accountId) { alerts {
               policiesSearch(searchCriteria: { name: $name }) { policies { ${FIELDS} } }
             } } }
           }`,
          { accountId: nr.accountId, name: args.name },
        );
        const policies = data.actor.account.alerts.policiesSearch.policies;
        if (policies.length === 0) {
          throw new NotFoundError(`No alert policy named ${args.name}`);
        }
        return policies[0];
      },
    },
  },
});

/** New Relic alert policy model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-alert-policy",
  version: "2026.09.25.1",
};
