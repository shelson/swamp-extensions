/**
 * New Relic alert muting rules (NerdGraph `alertsMutingRule*`).
 *
 * @module
 */
import { z } from "npm:zod@4";
import { NotFoundError, nrModel } from "./nerdgraph.ts";

const ConditionGroup = z.looseObject({
  operator: z.enum(["AND", "OR"]),
  conditions: z.array(z.looseObject({
    attribute: z.string(),
    operator: z.string(),
    values: z.array(z.string()),
  })),
});

/** Schedule times are NaiveDateTime — local wall-clock, no offset. */
const Schedule = z.looseObject({
  timeZone: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  repeat: z.string().optional(),
  repeatCount: z.number().optional(),
  endRepeat: z.string().optional(),
  weeklyRepeatDays: z.array(z.string()).optional(),
});

const FIELDS = `id name enabled description status accountId
  condition { operator conditions { attribute operator values } }
  schedule { startTime endTime timeZone repeat repeatCount endRepeat weeklyRepeatDays }`;

const definition = nrModel({
  type: "@shelson/newrelic-muting-rule",
  description: "New Relic alert muting rule",
  schema: z.looseObject({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
  }),
  syncKey: "id",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create a muting rule",
      arguments: z.object({
        name: z.string(),
        enabled: z.boolean().default(true),
        condition: ConditionGroup,
        description: z.string().optional(),
        schedule: Schedule.optional(),
        actionOnMutingRuleWindowEnded: z.string().optional(),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const data = await nr.query<
          { alertsMutingRuleCreate: Record<string, unknown> }
        >(
          `mutation($accountId: Int!, $rule: AlertsMutingRuleInput!) {
             alertsMutingRuleCreate(accountId: $accountId, rule: $rule) { ${FIELDS} }
           }`,
          { accountId: nr.accountId, rule: args },
        );
        return data.alertsMutingRuleCreate;
      },
    },
    update: {
      description: "Update a muting rule",
      arguments: z.object({
        id: z.string(),
        name: z.string().optional(),
        enabled: z.boolean().optional(),
        condition: ConditionGroup.optional(),
        description: z.string().optional(),
        schedule: Schedule.partial().optional(),
        actionOnMutingRuleWindowEnded: z.string().optional(),
      }),
      run: async (args: Record<string, unknown>, nr) => {
        const { id, ...rule } = args;
        const data = await nr.query<
          { alertsMutingRuleUpdate: Record<string, unknown> }
        >(
          `mutation($accountId: Int!, $id: ID!, $rule: AlertsMutingRuleUpdateInput!) {
             alertsMutingRuleUpdate(accountId: $accountId, id: $id, rule: $rule) { ${FIELDS} }
           }`,
          { accountId: nr.accountId, id, rule },
        );
        return data.alertsMutingRuleUpdate;
      },
    },
    delete: {
      description: "Delete a muting rule by ID",
      arguments: z.object({ id: z.string() }),
      run: async (args: { id: string }, nr) => {
        await nr.query(
          `mutation($accountId: Int!, $id: ID!) {
             alertsMutingRuleDelete(accountId: $accountId, id: $id) { id }
           }`,
          { accountId: nr.accountId, id: args.id },
        );
        return null;
      },
    },
    lookup: {
      description:
        "Look up a muting rule by ID, or by exact name within the account",
      arguments: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { id?: string; name?: string }, nr) => {
        if (args.id) {
          const data = await nr.query<
            {
              actor: {
                account: {
                  alerts: { mutingRule: Record<string, unknown> | null };
                };
              };
            }
          >(
            `query($accountId: Int!, $id: ID!) {
               actor { account(id: $accountId) { alerts { mutingRule(id: $id) { ${FIELDS} } } } }
             }`,
            { accountId: nr.accountId, id: args.id },
          );
          const rule = data.actor.account.alerts.mutingRule;
          if (!rule) throw new NotFoundError(`No muting rule ${args.id}`);
          return rule;
        }
        if (!args.name) throw new Error("lookup requires id or name");
        // There is no server-side name filter for muting rules, so list and match.
        // ponytail: client-side scan of every muting rule in the account. Fine for
        // the tens-of-rules case; add a cached id if an account grows thousands.
        const data = await nr.query<
          {
            actor: {
              account: { alerts: { mutingRules: Record<string, unknown>[] } };
            };
          }
        >(
          `query($accountId: Int!) {
             actor { account(id: $accountId) { alerts { mutingRules { ${FIELDS} } } } }
           }`,
          { accountId: nr.accountId },
        );
        const found = (data.actor.account.alerts.mutingRules ?? []).find(
          (r) => r.name === args.name,
        );
        if (!found) {
          throw new NotFoundError(`No muting rule named ${args.name}`);
        }
        return found;
      },
    },
  },
});

/** New Relic muting rule model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-muting-rule",
  version: "2026.09.25.1",
};
