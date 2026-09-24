/**
 * New Relic account with its user/group permission picture.
 *
 * Read-only by design: this model captures who can do what in an account so
 * workflows and reports can assert on it. User and group *writes* live in
 * `userManagement*` mutations and are deliberately not exposed yet.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { nrModel } from "./nerdgraph.ts";

const definition = nrModel({
  type: "@shelson/newrelic-account",
  description:
    "New Relic account with authentication domains, groups and users",
  schema: z.looseObject({
    id: z.number(),
    name: z.string(),
    authenticationDomains: z.array(z.looseObject({
      id: z.string(),
      name: z.string(),
    })),
  }),
  resources: {
    query: {
      description: "Results of an ad-hoc NRQL query",
      schema: z.looseObject({
        query: z.string(),
        results: z.array(z.looseObject({})),
      }),
    },
  },
  methods: {
    lookup: {
      description:
        "Read the account plus its organization's authentication domains, groups and users",
      arguments: z.object({
        /** Include per-group user membership (extra API cost on large orgs). */
        includeUsers: z.boolean().default(true),
      }),
      run: async (args: { includeUsers?: boolean }, nr) => {
        const users = args.includeUsers === false
          ? ""
          : `users { users { id name email } }`;
        const data = await nr.query<{
          actor: {
            account: { id: number; name: string } | null;
            organization: {
              id: string;
              name: string;
              userManagement: {
                authenticationDomains: {
                  authenticationDomains: Record<string, unknown>[];
                };
              };
            } | null;
          };
        }>(
          `query($accountId: Int!) {
             actor {
               account(id: $accountId) { id name }
               organization {
                 id
                 name
                 userManagement {
                   authenticationDomains {
                     authenticationDomains {
                       id
                       name
                       provisioningType
                       groups { groups { id displayName ${users} } }
                     }
                   }
                 }
               }
             }
           }`,
          { accountId: nr.accountId },
        );
        const account = data.actor.account;
        if (!account) {
          throw new Error(
            `Account ${nr.accountId} not visible to this API key`,
          );
        }
        const org = data.actor.organization;
        return {
          id: account.id,
          name: account.name,
          organizationId: org?.id ?? null,
          organizationName: org?.name ?? null,
          authenticationDomains:
            org?.userManagement.authenticationDomains.authenticationDomains ??
              [],
        };
      },
    },
    nrql: {
      description: "Run an ad-hoc NRQL query and store its results",
      resource: "query",
      resourceName: (args: { name?: string }) => args.name ?? "result",
      arguments: z.object({
        /** NRQL statement, e.g. `SELECT count(*) FROM Transaction`. */
        query: z.string(),
        /** Resource instance name, so several queries can be kept side by side. */
        name: z.string().default("result"),
      }),
      run: async (args: { query: string }, nr) => {
        const data = await nr.query<
          {
            actor: {
              account: { nrql: { results: Record<string, unknown>[] } };
            };
          }
        >(
          `query($accountId: Int!, $query: Nrql!) {
             actor { account(id: $accountId) { nrql(query: $query) { results } } }
           }`,
          { accountId: nr.accountId, query: args.query },
        );
        return {
          query: args.query,
          results: data.actor.account.nrql.results,
        };
      },
    },
  },
});

/** New Relic account model (read-only). */
export const model = {
  ...definition,
  type: "@shelson/newrelic-account",
  version: "2026.09.25.1",
};
