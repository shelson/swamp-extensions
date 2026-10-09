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
import {
  assertNoErrors,
  client,
  discoverAllMethod,
  type MethodLogger,
  type NerdGraph,
  NotFoundError,
  nrModel,
} from "./nerdgraph.ts";

const DashboardInput = z.object({
  name: z.string(),
  description: z.string().optional(),
  permissions: z.enum(["PRIVATE", "PUBLIC_READ_ONLY", "PUBLIC_READ_WRITE"]),
  pages: z.array(z.looseObject({ name: z.string() })),
  variables: z.array(z.looseObject({})).optional(),
});

const ENTITY_FIELDS = `guid name description permissions accountId updatedAt`;

const DEFINITION_FIELDS = `
  guid name description permissions accountId
  pages {
    guid name description
    widgets {
      id title
      visualization { id }
      layout { column row width height }
      rawConfiguration
    }
  }`;

/** `getDefinitions` fetches this many guids per NerdGraph call. */
const DEFINITION_CHUNK_SIZE = 25;

interface DashboardOutline extends Record<string, unknown> {
  guid: string;
  name: string;
}

/** Context for methods with their own `execute` (see `extraMethods`). */
interface FactoryContext {
  globalArgs: Parameters<typeof client>[0];
  logger: MethodLogger;
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
}

const definition = nrModel({
  type: "@shelson/newrelic-dashboard",
  description: "New Relic dashboard entity",
  schema: z.looseObject({
    guid: z.string(),
    name: z.string(),
    accountId: z.number().optional(),
    permissions: z.string().optional(),
  }),
  resources: {
    definition: {
      description: "Full pages/widgets/rawConfiguration for a dashboard guid",
      schema: z.looseObject({ guid: z.string(), name: z.string() }),
    },
    definitionFailures: {
      description:
        "Chunks that failed during a getDefinitions batch (e.g. a malformed guid), so a bad entry doesn't lose progress on everything else",
      schema: z.object({
        failedChunks: z.array(z.object({
          guids: z.array(z.string()),
          error: z.string(),
        })),
        fetchedAt: z.string(),
      }),
    },
  },
  extraMethods: {
    discoverAll: discoverAllMethod<DashboardOutline>({
      description:
        "List every dashboard in this account and write each as its own state resource instance (factory pattern)",
      keyOf: (d) => d.guid,
      fetchPage: async (nr: NerdGraph, cursor) => {
        const data = await nr.query<{
          actor: {
            entitySearch: {
              results: {
                entities: DashboardOutline[];
                nextCursor: string | null;
              };
            };
          };
        }>(
          `query($query: String!, $cursor: String) {
             actor { entitySearch(query: $query) {
               results(cursor: $cursor) {
                 entities {
                   guid
                   name
                   accountId
                   ... on DashboardEntityOutline { permissions }
                 }
                 nextCursor
               }
             } }
           }`,
          {
            query: `type = 'DASHBOARD' AND accountId = ${nr.accountId}`,
            cursor,
          },
        );
        const result = data.actor.entitySearch.results;
        return { items: result.entities, nextCursor: result.nextCursor };
      },
    }),
    tag: {
      description:
        "Add tags to the stored dashboard entity via taggingAddTagsToEntity",
      arguments: z.object({
        tags: z.array(z.object({
          key: z.string(),
          values: z.array(z.string()).min(1),
        })).min(1),
      }),
      execute: async (
        args: { tags: { key: string; values: string[] }[] },
        context: FactoryContext,
      ) => {
        context.logger.info("newrelic-dashboard.tag: running", {
          tags: args.tags.length,
        });
        const current = await context.readResource("current");
        const guid = current?.guid;
        if (typeof guid !== "string" || guid.length === 0) {
          throw new Error(
            "no stored dashboard state with a guid — run create or lookup first",
          );
        }
        const data = await client(context.globalArgs).query<
          { taggingAddTagsToEntity: unknown }
        >(
          `mutation($guid: EntityGuid!, $tags: [TaggingTagInput!]!) {
             taggingAddTagsToEntity(guid: $guid, tags: $tags) {
               errors { message }
             }
           }`,
          { guid, tags: args.tags },
        );
        assertNoErrors(data.taggingAddTagsToEntity, "taggingAddTagsToEntity");
        context.logger.info("newrelic-dashboard.tag: tags applied", {
          guid,
          tags: args.tags,
        });
        const handle = await context.writeResource("state", "current", {
          ...current,
          tags: args.tags,
        });
        return { dataHandles: [handle] };
      },
    },
    getDefinition: {
      description:
        "Fetch the full pages/widgets/rawConfiguration for a dashboard by guid",
      arguments: z.object({ guid: z.string() }),
      execute: async (args: { guid: string }, context: FactoryContext) => {
        context.logger.info("getDefinition: running", { guid: args.guid });
        const data = await client(context.globalArgs).query<
          { actor: { entity: Record<string, unknown> | null } }
        >(
          `query($guid: EntityGuid!) {
             actor { entity(guid: $guid) { ... on DashboardEntity { ${DEFINITION_FIELDS} } } }
           }`,
          { guid: args.guid },
        );
        const entity = data.actor.entity;
        if (!entity || typeof entity.guid !== "string") {
          throw new NotFoundError(`Dashboard ${args.guid} not found`);
        }
        const handle = await context.writeResource(
          "definition",
          args.guid,
          entity,
        );
        context.logger.info("getDefinition: definition written", {
          guid: args.guid,
        });
        return { dataHandles: [handle] };
      },
    },
    getDefinitions: {
      description:
        "Fetch full pages/widgets/rawConfiguration for many dashboard guids in one execution (factory pattern) — avoids per-model lock contention from calling getDefinition once per guid",
      arguments: z.object({ guids: z.array(z.string()).min(1) }),
      execute: async (args: { guids: string[] }, context: FactoryContext) => {
        const nr = client(context.globalArgs);
        context.logger.info("getDefinitions: running", {
          guids: args.guids.length,
        });
        const handles = [];
        let notFound = 0;
        let okChunks = 0;
        const failedChunks: { guids: string[]; error: string }[] = [];
        for (let i = 0; i < args.guids.length; i += DEFINITION_CHUNK_SIZE) {
          const chunk = args.guids.slice(i, i + DEFINITION_CHUNK_SIZE);
          try {
            const data = await nr.query<
              { actor: { entities: (Record<string, unknown> | null)[] } }
            >(
              `query($guids: [EntityGuid!]!) {
                 actor { entities(guids: $guids) { ... on DashboardEntity { ${DEFINITION_FIELDS} } } }
               }`,
              { guids: chunk },
            );
            const entities = data.actor.entities.filter(
              (e): e is Record<string, unknown> => typeof e?.guid === "string",
            );
            okChunks++;
            const found = new Set(entities.map((e) => e.guid as string));
            notFound += chunk.filter((g) => !found.has(g)).length;
            for (const entity of entities) {
              handles.push(
                await context.writeResource(
                  "definition",
                  entity.guid as string,
                  entity,
                ),
              );
            }
          } catch (e) {
            // One malformed guid would otherwise abort a batch after earlier
            // chunks already succeeded — record it and keep going.
            const message = e instanceof Error ? e.message : String(e);
            context.logger.warning(
              "getDefinitions: chunk starting at {index} failed: {message}",
              { index: i, message },
            );
            failedChunks.push({ guids: chunk, error: message });
          }
        }
        if (okChunks === 0) {
          throw new Error(
            `getDefinitions: all ${failedChunks.length} chunk(s) failed; first error: ${
              failedChunks[0]?.error ?? "unknown"
            }`,
          );
        }
        context.logger.info(
          "getDefinitions: fetched {count}, not found {notFound}, failed chunks {failed}",
          { count: handles.length, notFound, failed: failedChunks.length },
        );
        if (failedChunks.length > 0) {
          handles.push(
            await context.writeResource("definitionFailures", "last-run", {
              failedChunks,
              fetchedAt: new Date().toISOString(),
            }),
          );
        }
        return { dataHandles: handles };
      },
    },
  },
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
  version: "2026.10.10.1",
};
