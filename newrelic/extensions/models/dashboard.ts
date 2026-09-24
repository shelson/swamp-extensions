/**
 * New Relic dashboards (NerdGraph `dashboardCreate` / `dashboardUpdate` /
 * `dashboardDelete`).
 *
 * The `dashboard` argument is passed through to the NerdGraph `DashboardInput`
 * type unchanged — pages and widgets are too large and too fast-moving to
 * re-model here, so the GraphQL schema stays the contract.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

const DashboardInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.enum(["PRIVATE", "PUBLIC_READ_ONLY", "PUBLIC_READ_WRITE"]),
  pages: z.array(z.looseObject({ name: z.string() })),
  variables: z.array(z.looseObject({})).optional(),
});

const ENTITY_FIELDS = `guid name description permissions accountId updatedAt`;

const definition = nrModel({
  type: "@shelson/newrelic-dashboard",
  description: "New Relic dashboard entity",
  schema: z.looseObject({
    guid: z.string(),
    name: z.string(),
    accountId: z.number().optional(),
    permissions: z.string().optional(),
  }),
  syncKey: "guid",
  idempotentCreate: true,
  nameFromArgs: (args: { dashboard?: { name?: string } }) =>
    args.dashboard?.name,
  methods: {
    create: {
      description: "Create a dashboard",
      arguments: z.object({ dashboard: DashboardInput }),
      run: async (args: { dashboard: unknown }, nr) => {
        const data = await nr.query<
          { dashboardCreate: { entityResult: Record<string, unknown> } }
        >(
          `mutation($accountId: Int!, $dashboard: DashboardInput!) {
             dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
               entityResult { ${ENTITY_FIELDS} }
               errors { description type }
             }
           }`,
          { accountId: nr.accountId, dashboard: args.dashboard },
        );
        assertNoErrors(data.dashboardCreate, "dashboardCreate");
        return data.dashboardCreate.entityResult;
      },
    },
    update: {
      description: "Replace a dashboard's definition",
      arguments: z.object({ guid: z.string(), dashboard: DashboardInput }),
      run: async (args: { guid: string; dashboard: unknown }, nr) => {
        const data = await nr.query<
          { dashboardUpdate: { entityResult: Record<string, unknown> } }
        >(
          `mutation($guid: EntityGuid!, $dashboard: DashboardInput!) {
             dashboardUpdate(guid: $guid, dashboard: $dashboard) {
               entityResult { ${ENTITY_FIELDS} }
               errors { description type }
             }
           }`,
          { guid: args.guid, dashboard: args.dashboard },
        );
        assertNoErrors(data.dashboardUpdate, "dashboardUpdate");
        return data.dashboardUpdate.entityResult;
      },
    },
    delete: {
      description: "Delete a dashboard by GUID",
      arguments: z.object({ guid: z.string() }),
      run: async (args: { guid: string }, nr) => {
        const data = await nr.query<{ dashboardDelete: unknown }>(
          `mutation($guid: EntityGuid!) {
             dashboardDelete(guid: $guid) { status errors { description type } }
           }`,
          { guid: args.guid },
        );
        assertNoErrors(data.dashboardDelete, "dashboardDelete");
        return null;
      },
    },
    lookup: {
      description:
        "Look up a dashboard by GUID, or by exact name within the account",
      arguments: z.object({
        guid: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { guid?: string; name?: string }, nr) => {
        let guid = args.guid;
        if (!guid) {
          if (!args.name) throw new Error("lookup requires guid or name");
          const search = await nr.query<
            {
              actor: {
                entitySearch: { results: { entities: { guid: string }[] } };
              };
            }
          >(
            `query($q: String!) {
               actor { entitySearch(query: $q) { results { entities { guid } } } }
             }`,
            {
              q: `type = 'DASHBOARD' AND name = '${
                args.name.replace(/'/g, "\\'")
              }' ` +
                `AND accountId = ${nr.accountId}`,
            },
          );
          const found = search.actor.entitySearch.results.entities;
          if (found.length === 0) {
            throw new NotFoundError(`No dashboard named ${args.name}`);
          }
          guid = found[0].guid;
        }
        const data = await nr.query<
          { actor: { entity: Record<string, unknown> | null } }
        >(
          `query($guid: EntityGuid!) {
             actor { entity(guid: $guid) { ... on DashboardEntity { ${ENTITY_FIELDS} } } }
           }`,
          { guid },
        );
        if (!data.actor.entity) {
          throw new NotFoundError(`Dashboard ${guid} not found`);
        }
        return data.actor.entity;
      },
    },
  },
});

/** New Relic dashboard model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-dashboard",
  version: "2026.09.25.1",
};
