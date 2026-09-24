/**
 * New Relic NRQL alert conditions.
 *
 * One model type covers all three condition flavours — static, baseline and
 * outlier — because the lifecycle is identical and only the mutation name and
 * a couple of input fields differ. `conditionType` selects the variant.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { NotFoundError, nrModel } from "./nerdgraph.ts";

const ConditionType = z.enum(["STATIC", "BASELINE", "OUTLIER"]);

/** NerdGraph mutation name fragment per condition type, e.g. `Static`. */
function variant(conditionType: string): string {
  return conditionType.charAt(0) + conditionType.slice(1).toLowerCase();
}

const ConditionInput = z.looseObject({
  name: z.string(),
  enabled: z.boolean(),
  nrql: z.looseObject({ query: z.string() }),
  terms: z.array(z.looseObject({})).optional(),
  description: z.string().optional(),
  runbookUrl: z.string().optional(),
  signal: z.looseObject({}).optional(),
  violationTimeLimitSeconds: z.number().optional(),
});

const FIELDS =
  `id name enabled policyId entityGuid description runbookUrl nrql { query }`;

const definition = nrModel({
  type: "@shelson/newrelic-alert-condition",
  description: "New Relic NRQL alert condition",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    policyId: z.string(),
    enabled: z.boolean(),
  }),
  syncKey: "id",
  idempotentCreate: true,
  nameFromArgs: (args: { condition?: { name?: string } }) =>
    args.condition?.name,
  methods: {
    create: {
      description: "Create a NRQL alert condition on a policy",
      arguments: z.object({
        policyId: z.string(),
        conditionType: ConditionType.default("STATIC"),
        condition: ConditionInput,
      }),
      run: async (
        args: { policyId: string; conditionType: string; condition: unknown },
        nr,
      ) => {
        const v = variant(args.conditionType);
        const mutation = `alertsNrqlCondition${v}Create`;
        const data = await nr.query<Record<string, Record<string, unknown>>>(
          `mutation($accountId: Int!, $policyId: ID!, $condition: AlertsNrqlCondition${v}Input!) {
             ${mutation}(accountId: $accountId, policyId: $policyId, condition: $condition) { ${FIELDS} }
           }`,
          {
            accountId: nr.accountId,
            policyId: args.policyId,
            condition: args.condition,
          },
        );
        return data[mutation];
      },
    },
    update: {
      description: "Update a NRQL alert condition",
      arguments: z.object({
        id: z.string(),
        conditionType: ConditionType.default("STATIC"),
        condition: ConditionInput.partial(),
      }),
      run: async (
        args: { id: string; conditionType: string; condition: unknown },
        nr,
      ) => {
        const v = variant(args.conditionType);
        const mutation = `alertsNrqlCondition${v}Update`;
        const data = await nr.query<Record<string, Record<string, unknown>>>(
          `mutation($accountId: Int!, $id: ID!, $condition: AlertsNrqlConditionUpdate${v}Input!) {
             ${mutation}(accountId: $accountId, id: $id, condition: $condition) { ${FIELDS} }
           }`,
          { accountId: nr.accountId, id: args.id, condition: args.condition },
        );
        return data[mutation];
      },
    },
    delete: {
      description: "Delete an alert condition by ID",
      arguments: z.object({ id: z.string() }),
      run: async (args: { id: string }, nr) => {
        await nr.query(
          `mutation($accountId: Int!, $id: ID!) {
             alertsConditionDelete(accountId: $accountId, id: $id) { id }
           }`,
          { accountId: nr.accountId, id: args.id },
        );
        return null;
      },
    },
    lookup: {
      description:
        "Look up a NRQL alert condition by ID, or by exact name within a policy",
      arguments: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        policyId: z.string().optional(),
      }),
      run: async (
        args: { id?: string; name?: string; policyId?: string },
        nr,
      ) => {
        if (args.id) {
          const data = await nr.query<
            {
              actor: {
                account: {
                  alerts: { nrqlCondition: Record<string, unknown> | null };
                };
              };
            }
          >(
            `query($accountId: Int!, $id: ID!) {
               actor { account(id: $accountId) { alerts { nrqlCondition(id: $id) { ${FIELDS} } } } }
             }`,
            { accountId: nr.accountId, id: args.id },
          );
          const condition = data.actor.account.alerts.nrqlCondition;
          if (!condition) {
            throw new NotFoundError(`No alert condition ${args.id}`);
          }
          return condition;
        }
        if (!args.name) throw new Error("lookup requires id or name");
        const data = await nr.query<
          {
            actor: {
              account: {
                alerts: {
                  nrqlConditionsSearch: {
                    nrqlConditions: Record<string, unknown>[];
                  };
                };
              };
            };
          }
        >(
          // policyId must be omitted entirely when unset — NerdGraph rejects an
          // explicit null with "account_policy_id must be of type Long but was 'NaN'".
          `query($accountId: Int!, $criteria: AlertsNrqlConditionsSearchCriteriaInput) {
             actor { account(id: $accountId) { alerts {
               nrqlConditionsSearch(searchCriteria: $criteria) {
                 nrqlConditions { ${FIELDS} }
               }
             } } }
           }`,
          {
            accountId: nr.accountId,
            criteria: args.policyId
              ? { name: args.name, policyId: args.policyId }
              : { name: args.name },
          },
        );
        const found =
          data.actor.account.alerts.nrqlConditionsSearch.nrqlConditions;
        if (found.length === 0) {
          throw new NotFoundError(`No alert condition named ${args.name}`);
        }
        return found[0];
      },
    },
  },
});

/** New Relic NRQL alert condition model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-alert-condition",
  version: "2026.09.25.1",
};
