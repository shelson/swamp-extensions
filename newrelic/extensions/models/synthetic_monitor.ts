/**
 * New Relic synthetic monitors (NerdGraph `syntheticsCreate*Monitor` /
 * `syntheticsUpdate*Monitor` / `syntheticsDeleteMonitor`).
 *
 * All monitor kinds share one model type: the lifecycle and stored attributes
 * are identical, only the mutation name and the `monitor` input shape differ,
 * so `monitorType` selects the mutation and the input is passed through.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { assertNoErrors, NotFoundError, nrModel } from "./nerdgraph.ts";

/** Monitor kind → NerdGraph mutation name fragment. */
const KINDS = {
  SIMPLE: "Simple",
  SIMPLE_BROWSER: "SimpleBrowser",
  SCRIPT_API: "ScriptApi",
  SCRIPT_BROWSER: "ScriptBrowser",
  CERT_CHECK: "CertCheck",
  BROKEN_LINKS: "BrokenLinks",
  STEP: "Step",
} as const;

const MonitorType = z.enum(
  Object.keys(KINDS) as [keyof typeof KINDS, ...(keyof typeof KINDS)[]],
);

const MonitorInput = z.looseObject({
  name: z.string().optional(),
  period: z.string().optional(),
  status: z.enum(["ENABLED", "DISABLED", "MUTED"]).optional(),
  locations: z.looseObject({}).optional(),
  uri: z.string().optional(),
  script: z.string().optional(),
  tags: z.array(z.looseObject({ key: z.string(), values: z.array(z.string()) }))
    .optional(),
});

const FIELDS = `id guid name period status`;

const definition = nrModel({
  type: "@shelson/newrelic-synthetic-monitor",
  description: "New Relic synthetic monitor",
  schema: z.looseObject({
    guid: z.string(),
    name: z.string(),
    monitorType: z.string(),
    status: z.string().optional(),
  }),
  syncKey: "guid",
  idempotentCreate: true,
  nameFromArgs: (args: { monitor?: { name?: string } }) => args.monitor?.name,
  methods: {
    create: {
      description: "Create a synthetic monitor of the given type",
      arguments: z.object({ monitorType: MonitorType, monitor: MonitorInput }),
      run: async (
        args: { monitorType: keyof typeof KINDS; monitor: unknown },
        nr,
      ) => {
        const kind = KINDS[args.monitorType];
        const mutation = `syntheticsCreate${kind}Monitor`;
        const data = await nr.query<
          Record<string, { monitor: Record<string, unknown> }>
        >(
          `mutation($accountId: Int!, $monitor: SyntheticsCreate${kind}MonitorInput!) {
             ${mutation}(accountId: $accountId, monitor: $monitor) {
               monitor { ${FIELDS} }
               errors { description type }
             }
           }`,
          { accountId: nr.accountId, monitor: args.monitor },
        );
        assertNoErrors(data[mutation], mutation);
        return { ...data[mutation].monitor, monitorType: args.monitorType };
      },
    },
    update: {
      description: "Update a synthetic monitor by GUID",
      arguments: z.object({
        guid: z.string(),
        monitorType: MonitorType,
        monitor: MonitorInput,
      }),
      run: async (
        args: {
          guid: string;
          monitorType: keyof typeof KINDS;
          monitor: unknown;
        },
        nr,
      ) => {
        const kind = KINDS[args.monitorType];
        const mutation = `syntheticsUpdate${kind}Monitor`;
        const data = await nr.query<
          Record<string, { monitor: Record<string, unknown> }>
        >(
          `mutation($guid: EntityGuid!, $monitor: SyntheticsUpdate${kind}MonitorInput!) {
             ${mutation}(guid: $guid, monitor: $monitor) {
               monitor { ${FIELDS} }
               errors { description type }
             }
           }`,
          { guid: args.guid, monitor: args.monitor },
        );
        assertNoErrors(data[mutation], mutation);
        return { ...data[mutation].monitor, monitorType: args.monitorType };
      },
    },
    delete: {
      description: "Delete a synthetic monitor by GUID",
      arguments: z.object({ guid: z.string() }),
      run: async (args: { guid: string }, nr) => {
        await nr.query(
          `mutation($guid: EntityGuid!) { syntheticsDeleteMonitor(guid: $guid) { deletedGuid } }`,
          { guid: args.guid },
        );
        return null;
      },
    },
    lookup: {
      description:
        "Look up a synthetic monitor by GUID, or by exact name within the account",
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
              q: `domain = 'SYNTH' AND type = 'MONITOR' ` +
                `AND name = '${
                  args.name.replace(/'/g, "\\'")
                }' AND accountId = ${nr.accountId}`,
            },
          );
          const found = search.actor.entitySearch.results.entities;
          if (found.length === 0) {
            throw new NotFoundError(`No synthetic monitor named ${args.name}`);
          }
          guid = found[0].guid;
        }
        const data = await nr.query<
          { actor: { entity: Record<string, unknown> | null } }
        >(
          `query($guid: EntityGuid!) {
             actor { entity(guid: $guid) { ... on SyntheticMonitorEntity {
               guid name monitorId monitorType period monitoredUrl accountId
             } } }
           }`,
          { guid },
        );
        if (!data.actor.entity) {
          throw new NotFoundError(`Synthetic monitor ${guid} not found`);
        }
        return data.actor.entity;
      },
    },
  },
});

/** New Relic synthetic monitor model. */
export const model = {
  ...definition,
  type: "@shelson/newrelic-synthetic-monitor",
  version: "2026.09.25.1",
};
