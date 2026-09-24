/**
 * New Relic synthetics private locations (NerdGraph
 * `syntheticsCreatePrivateLocation` / `Update` / `Delete`).
 *
 * The mutations take flat scalar arguments rather than an input object, and
 * there is no `privateLocations` query — `lookup` goes through entity search.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

const RESULT =
  `guid name description key locationId domainId accountId shared verifiedScriptExecution`;

const definition = nrModel({
  type: "@shelson/newrelic-private-location",
  description: "New Relic synthetics private location",
  schema: z.looseObject({
    guid: z.string(),
    name: z.string(),
    // `key` is the private-location key used by minions to poll for work.
    key: z.string().meta({ sensitive: true }).optional(),
  }),
  syncKey: "guid",
  idempotentCreate: true,
  nameFromArgs: (args: { name?: string }) => args.name,
  methods: {
    create: {
      description: "Create a private location",
      arguments: z.object({
        name: z.string(),
        description: z.string().optional(),
        verifiedScriptExecution: z.boolean().default(false),
        shared: z.boolean().optional(),
      }),
      run: async (
        args: {
          name: string;
          description?: string;
          verifiedScriptExecution?: boolean;
          shared?: boolean;
        },
        nr,
      ) => {
        const data = await nr.query<
          { syntheticsCreatePrivateLocation: Record<string, unknown> }
        >(
          `mutation($accountId: Int!, $name: String!, $description: String, $vse: Boolean!, $shared: Boolean) {
             syntheticsCreatePrivateLocation(
               accountId: $accountId, name: $name, description: $description,
               verifiedScriptExecution: $vse, shared: $shared
             ) { ${RESULT} errors { description type } }
           }`,
          {
            accountId: nr.accountId,
            name: args.name,
            description: args.description ?? null,
            vse: args.verifiedScriptExecution ?? false,
            shared: args.shared ?? null,
          },
        );
        assertNoErrors(
          data.syntheticsCreatePrivateLocation,
          "syntheticsCreatePrivateLocation",
        );
        return data.syntheticsCreatePrivateLocation;
      },
    },
    update: {
      description:
        "Update a private location's description or execution settings",
      arguments: z.object({
        guid: z.string(),
        description: z.string().optional(),
        verifiedScriptExecution: z.boolean().optional(),
        shared: z.boolean().optional(),
      }),
      run: async (
        args: {
          guid: string;
          description?: string;
          verifiedScriptExecution?: boolean;
          shared?: boolean;
        },
        nr,
      ) => {
        const data = await nr.query<
          { syntheticsUpdatePrivateLocation: Record<string, unknown> }
        >(
          `mutation($guid: EntityGuid!, $description: String, $vse: Boolean, $shared: Boolean) {
             syntheticsUpdatePrivateLocation(
               guid: $guid, description: $description,
               verifiedScriptExecution: $vse, shared: $shared
             ) { ${RESULT} errors { description type } }
           }`,
          {
            guid: args.guid,
            description: args.description ?? null,
            vse: args.verifiedScriptExecution ?? null,
            shared: args.shared ?? null,
          },
        );
        assertNoErrors(
          data.syntheticsUpdatePrivateLocation,
          "syntheticsUpdatePrivateLocation",
        );
        return data.syntheticsUpdatePrivateLocation;
      },
    },
    delete: {
      description: "Delete a private location by GUID",
      arguments: z.object({ guid: z.string() }),
      run: async (args: { guid: string }, nr) => {
        const data = await nr.query<
          { syntheticsDeletePrivateLocation: unknown }
        >(
          `mutation($guid: EntityGuid!) {
             syntheticsDeletePrivateLocation(guid: $guid) { errors { description type } }
           }`,
          { guid: args.guid },
        );
        assertNoErrors(
          data.syntheticsDeletePrivateLocation,
          "syntheticsDeletePrivateLocation",
        );
        return null;
      },
    },
    lookup: {
      description:
        "Look up a private location by GUID, or by exact name within the account",
      arguments: z.object({
        guid: z.string().optional(),
        name: z.string().optional(),
      }),
      run: async (args: { guid?: string; name?: string }, nr) => {
        const q = args.guid
          ? `domain = 'SYNTH' AND type = 'PRIVATE_LOCATION' AND id = '${args.guid}'`
          : `domain = 'SYNTH' AND type = 'PRIVATE_LOCATION' AND accountId = ${nr.accountId} ` +
            `AND name = '${(args.name ?? "").replace(/'/g, "\\'")}'`;
        if (!args.guid && !args.name) {
          throw new Error("lookup requires guid or name");
        }
        const data = await nr.query<
          {
            actor: {
              entitySearch: {
                results: {
                  entities: { guid: string; name: string; accountId: number }[];
                };
              };
            };
          }
        >(
          `query($q: String!) {
             actor { entitySearch(query: $q) {
               results { entities { guid name accountId } }
             } }
           }`,
          { q },
        );
        const found = data.actor.entitySearch.results.entities;
        if (found.length === 0) {
          throw new NotFoundError(
            `No private location matching ${args.guid ?? args.name}`,
          );
        }
        return found[0];
      },
    },
  },
});

/** New Relic synthetics private location model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-private-location",
  version: "2026.09.25.1",
};
