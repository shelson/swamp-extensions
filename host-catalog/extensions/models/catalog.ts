/**
 * A catalogue of hosts and groups with hierarchical key=value metadata.
 *
 * Metadata can be defined at three scopes — global, group, and host. A host
 * may belong to any number of groups. Values are strings, numbers, booleans,
 * or lists of those — kept as their native JSON type (not stringified) so
 * they flow straight into typed method arguments (e.g. a numeric `sshPort`)
 * without a cast at the call site. Resolution treats scalars and lists
 * differently, since they represent different kinds of attribute:
 *
 * - **Scalar values override**: host beats group beats global. Among
 *   conflicting groups, the group listed earliest in the host's `groups`
 *   array wins.
 * - **List values union**: every list found for a key across global, the
 *   host's groups, and the host itself is combined and deduplicated — no
 *   value is discarded. A key mixing scalar and list values across scopes
 *   falls back to override semantics (last-write-wins), since a set union
 *   isn't well-defined against a scalar.
 *
 * This lets a key like `workflows` accumulate across scopes (a host should
 * run every workflow named at any level it belongs to) without special-
 * casing that key by name — the behavior follows from the value's shape.
 *
 * Every method that mutates a host, group, or global attribute recomputes
 * and stores the affected host(s)' resolved metadata as part of the same
 * call — `resolved` is always in sync with the latest write, with no
 * separate step required.
 *
 * @module
 */
// extensions/models/catalog.ts
import { z } from "npm:zod@4";

const MetadataScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const MetadataValueSchema = z.union([
  MetadataScalarSchema,
  z.array(MetadataScalarSchema),
]);
const MetadataSchema = z.record(z.string(), MetadataValueSchema);
type MetadataScalar = z.infer<typeof MetadataScalarSchema>;
type Metadata = z.infer<typeof MetadataSchema>;

const ScopeSchema = z.enum(["global", "group", "host"]);

const GlobalArgsSchema = z.object({});

const GlobalMetadataSchema = z.object({
  metadata: MetadataSchema,
});
type GlobalMetadataData = z.infer<typeof GlobalMetadataSchema>;

const HostSchema = z.object({
  name: z.string(),
  groups: z.array(z.string()),
  metadata: MetadataSchema,
});
type HostData = z.infer<typeof HostSchema>;

const GroupSchema = z.object({
  name: z.string(),
  metadata: MetadataSchema,
});
type GroupData = z.infer<typeof GroupSchema>;

const ResolvedSchema = z.object({
  host: z.string(),
  metadata: MetadataSchema,
  resolvedAt: z.string(),
});

const GLOBAL_INSTANCE = "global";

function hostInstance(name: string): string {
  return `host-${name}`;
}

function groupInstance(name: string): string {
  return `group-${name}`;
}

function resolvedInstance(name: string): string {
  return `resolved-${name}`;
}

/**
 * Merge metadata across scopes, in array order (later layers take precedence
 * for override semantics). Per key: if every contributing layer's value is a
 * list, union and deduplicate them (preserving first-seen order). Otherwise
 * — a scalar contributed at any layer — override: the last layer defining
 * the key wins.
 */
function mergeMetadata(layers: Metadata[]): Metadata {
  const keys = new Set<string>();
  for (const layer of layers) {
    for (const key of Object.keys(layer)) keys.add(key);
  }

  const merged: Metadata = {};
  for (const key of keys) {
    const contributions = layers
      .filter((layer) => key in layer)
      .map((layer) => layer[key]);

    if (contributions.every((v) => Array.isArray(v))) {
      const union: MetadataScalar[] = [];
      for (const list of contributions as MetadataScalar[][]) {
        for (const item of list) {
          if (!union.includes(item)) union.push(item);
        }
      }
      merged[key] = union;
    } else {
      merged[key] = contributions[contributions.length - 1];
    }
  }
  return merged;
}

type Logger = { info(msg: string, props?: Record<string, unknown>): void };

type ReadResource = (
  instanceName: string,
) => Promise<Record<string, unknown> | null>;

type WriteResource = (
  specName: string,
  name: string,
  data: Record<string, unknown>,
) => Promise<{ name: string }>;

type DeleteResource = (instanceName: string) => Promise<void>;

type DataRepository = {
  findAllForModel: (
    type: string,
    modelId: string,
  ) => Promise<Array<{ name: string; tags?: Record<string, string> }>>;
};

type Ctx = {
  logger: Logger;
  readResource: ReadResource;
  writeResource: WriteResource;
  deleteResource: DeleteResource;
  dataRepository: DataRepository;
  modelType: string;
  modelId: string;
};

async function listHosts(ctx: Ctx): Promise<HostData[]> {
  const all = await ctx.dataRepository.findAllForModel(
    ctx.modelType,
    ctx.modelId,
  );
  const hosts: HostData[] = [];
  for (const entry of all) {
    if (entry.tags?.specName !== "host") continue;
    const data = await ctx.readResource(entry.name) as HostData | null;
    if (data) hosts.push(data);
  }
  return hosts;
}

async function readGlobalMetadata(ctx: Ctx): Promise<Metadata> {
  const data = await ctx.readResource(GLOBAL_INSTANCE) as
    | GlobalMetadataData
    | null;
  return data?.metadata ?? {};
}

/** Compute and store one host's effective metadata (global + its groups + its own). */
async function resolveHost(
  ctx: Ctx,
  host: HostData,
  globalMetadata: Metadata,
): Promise<{ name: string }> {
  const groupLayers: Metadata[] = [];
  for (const groupName of [...host.groups].reverse()) {
    const groupData = await ctx.readResource(
      groupInstance(groupName),
    ) as GroupData | null;
    if (groupData) groupLayers.push(groupData.metadata);
  }
  const merged = mergeMetadata([globalMetadata, ...groupLayers, host.metadata]);
  return await ctx.writeResource("resolved", resolvedInstance(host.name), {
    host: host.name,
    metadata: merged,
    resolvedAt: new Date().toISOString(),
  });
}

/** Resolve a specific set of hosts, sharing one global-metadata read across all of them. */
async function resolveHosts(
  ctx: Ctx,
  hosts: HostData[],
): Promise<Array<{ name: string }>> {
  const globalMetadata = await readGlobalMetadata(ctx);
  const handles: Array<{ name: string }> = [];
  for (const host of hosts) {
    handles.push(await resolveHost(ctx, host, globalMetadata));
  }
  return handles;
}

/** Resolve every host in the catalogue. */
async function resolveAllHosts(ctx: Ctx): Promise<Array<{ name: string }>> {
  return await resolveHosts(ctx, await listHosts(ctx));
}

/** Resolve every host that is a member of the given group. */
async function resolveHostsInGroup(
  ctx: Ctx,
  groupName: string,
): Promise<Array<{ name: string }>> {
  const hosts = await listHosts(ctx);
  return await resolveHosts(
    ctx,
    hosts.filter((h) => h.groups.includes(groupName)),
  );
}

/**
 * A catalogue of hosts and groups with hierarchical global/group/host
 * metadata, resolved per host on every mutating write.
 */
export const model = {
  type: "@shelson/catalog",
  version: "2026.07.27.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "global": {
      description: "Global-scope metadata, shared by every host",
      schema: GlobalMetadataSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "host": {
      description:
        "A catalogued host: its group memberships and host-scope metadata",
      schema: HostSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "group": {
      description: "A catalogued group and its group-scope metadata",
      schema: GroupSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "resolved": {
      description:
        "Effective metadata for a host, merged from global, group, and host scopes",
      schema: ResolvedSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },
  methods: {
    addHost: {
      description: "Add a host to the catalogue",
      arguments: z.object({
        name: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe(
            "If true, no-op instead of throwing when the host already exists",
          ),
      }),
      execute: async (
        args: { name: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const instanceName = hostInstance(args.name);
        const existing = await ctx.readResource(instanceName);
        if (existing) {
          if (!args.idempotent) {
            throw new Error(`Host "${args.name}" already exists`);
          }
          ctx.logger.info("Host {name} already exists, no-op", {
            name: args.name,
          });
          return {};
        }
        ctx.logger.info("Adding host {name}", { name: args.name });
        const newHost: HostData = { name: args.name, groups: [], metadata: {} };
        const handle = await ctx.writeResource("host", instanceName, newHost);
        const resolvedHandles = await resolveHosts(ctx, [newHost]);
        ctx.logger.info("Added host {name}", { name: args.name });
        return { dataHandles: [handle, ...resolvedHandles] };
      },
    },
    removeHost: {
      description: "Remove a host from the catalogue",
      arguments: z.object({
        name: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe(
            "If true, no-op instead of throwing when the host does not exist",
          ),
      }),
      execute: async (
        args: { name: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const instanceName = hostInstance(args.name);
        const existing = await ctx.readResource(instanceName);
        if (!existing) {
          if (!args.idempotent) {
            throw new Error(`Host "${args.name}" not found`);
          }
          ctx.logger.info("Host {name} already absent, no-op", {
            name: args.name,
          });
          return {};
        }
        ctx.logger.info("Removing host {name}", { name: args.name });
        await ctx.deleteResource(instanceName);
        await ctx.deleteResource(resolvedInstance(args.name));
        ctx.logger.info("Removed host {name}", { name: args.name });
        return {};
      },
    },
    addGroup: {
      description: "Add a group to the catalogue",
      arguments: z.object({
        name: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe(
            "If true, no-op instead of throwing when the group already exists",
          ),
      }),
      execute: async (
        args: { name: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const instanceName = groupInstance(args.name);
        const existing = await ctx.readResource(instanceName);
        if (existing) {
          if (!args.idempotent) {
            throw new Error(`Group "${args.name}" already exists`);
          }
          ctx.logger.info("Group {name} already exists, no-op", {
            name: args.name,
          });
          return {};
        }
        ctx.logger.info("Adding group {name}", { name: args.name });
        const handle = await ctx.writeResource("group", instanceName, {
          name: args.name,
          metadata: {},
        });
        ctx.logger.info("Added group {name}", { name: args.name });
        return { dataHandles: [handle] };
      },
    },
    removeGroup: {
      description:
        "Remove a group from the catalogue, and from every host's membership list",
      arguments: z.object({
        name: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe(
            "If true, no-op instead of throwing when the group does not exist",
          ),
      }),
      execute: async (
        args: { name: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const instanceName = groupInstance(args.name);
        const existing = await ctx.readResource(instanceName);
        if (!existing) {
          if (!args.idempotent) {
            throw new Error(`Group "${args.name}" not found`);
          }
          ctx.logger.info("Group {name} already absent, no-op", {
            name: args.name,
          });
          return {};
        }
        ctx.logger.info("Removing group {name}", { name: args.name });
        await ctx.deleteResource(instanceName);

        const hosts = await listHosts(ctx);
        const affected = hosts.filter((h) => h.groups.includes(args.name));
        const handles: Array<{ name: string }> = [];
        const updatedHosts: HostData[] = [];
        for (const host of affected) {
          const updated: HostData = {
            ...host,
            groups: host.groups.filter((g) => g !== args.name),
          };
          const handle = await ctx.writeResource(
            "host",
            hostInstance(host.name),
            updated,
          );
          handles.push(handle);
          updatedHosts.push(updated);
        }
        const resolvedHandles = await resolveHosts(ctx, updatedHosts);
        ctx.logger.info("Removed group {name} from {count} host(s)", {
          name: args.name,
          count: handles.length,
        });
        return { dataHandles: [...handles, ...resolvedHandles] };
      },
    },
    addHostToGroup: {
      description: "Add a host to a group",
      arguments: z.object({
        host: z.string().min(1),
        group: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe("If true, no-op instead of throwing when already a member"),
      }),
      execute: async (
        args: { host: string; group: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const hostData = await ctx.readResource(
          hostInstance(args.host),
        ) as HostData | null;
        if (!hostData) throw new Error(`Host "${args.host}" not found`);

        const groupData = await ctx.readResource(groupInstance(args.group));
        if (!groupData) throw new Error(`Group "${args.group}" not found`);

        if (hostData.groups.includes(args.group)) {
          if (!args.idempotent) {
            throw new Error(
              `Host "${args.host}" is already a member of group "${args.group}"`,
            );
          }
          ctx.logger.info("Host {host} already in group {group}, no-op", {
            host: args.host,
            group: args.group,
          });
          return {};
        }

        ctx.logger.info("Adding host {host} to group {group}", {
          host: args.host,
          group: args.group,
        });
        const updated: HostData = {
          ...hostData,
          groups: [...hostData.groups, args.group],
        };
        const handle = await ctx.writeResource(
          "host",
          hostInstance(args.host),
          updated,
        );
        const resolvedHandles = await resolveHosts(ctx, [updated]);
        ctx.logger.info("Added host {host} to group {group}", {
          host: args.host,
          group: args.group,
        });
        return { dataHandles: [handle, ...resolvedHandles] };
      },
    },
    removeHostFromGroup: {
      description: "Remove a host from a group",
      arguments: z.object({
        host: z.string().min(1),
        group: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe("If true, no-op instead of throwing when not a member"),
      }),
      execute: async (
        args: { host: string; group: string; idempotent: boolean },
        ctx: Ctx,
      ) => {
        const hostData = await ctx.readResource(
          hostInstance(args.host),
        ) as HostData | null;
        if (!hostData) throw new Error(`Host "${args.host}" not found`);

        if (!hostData.groups.includes(args.group)) {
          if (!args.idempotent) {
            throw new Error(
              `Host "${args.host}" is not a member of group "${args.group}"`,
            );
          }
          ctx.logger.info("Host {host} already not in group {group}, no-op", {
            host: args.host,
            group: args.group,
          });
          return {};
        }

        ctx.logger.info("Removing host {host} from group {group}", {
          host: args.host,
          group: args.group,
        });
        const updated: HostData = {
          ...hostData,
          groups: hostData.groups.filter((g) => g !== args.group),
        };
        const handle = await ctx.writeResource(
          "host",
          hostInstance(args.host),
          updated,
        );
        const resolvedHandles = await resolveHosts(ctx, [updated]);
        ctx.logger.info("Removed host {host} from group {group}", {
          host: args.host,
          group: args.group,
        });
        return { dataHandles: [handle, ...resolvedHandles] };
      },
    },
    setMetadata: {
      description:
        "Set (create or overwrite) a metadata key at the global, group, or host scope",
      arguments: z.object({
        scope: ScopeSchema,
        target: z.string().min(1).optional()
          .describe('Group or host name; required unless scope is "global"'),
        key: z.string().min(1),
        value: MetadataValueSchema,
      }).refine((v) => v.scope === "global" || !!v.target, {
        message: 'target is required when scope is "group" or "host"',
        path: ["target"],
      }),
      execute: async (
        args: {
          scope: "global" | "group" | "host";
          target?: string;
          key: string;
          value: MetadataScalar | MetadataScalar[];
        },
        ctx: Ctx,
      ) => {
        ctx.logger.info("Setting {scope} metadata key {key}", {
          scope: args.scope,
          key: args.key,
          target: args.target,
        });

        if (args.scope === "global") {
          const metadata = await readGlobalMetadata(ctx);
          metadata[args.key] = args.value;
          const handle = await ctx.writeResource("global", GLOBAL_INSTANCE, {
            metadata,
          });
          const resolvedHandles = await resolveAllHosts(ctx);
          ctx.logger.info("Set global metadata key {key}", { key: args.key });
          return { dataHandles: [handle, ...resolvedHandles] };
        }

        if (args.scope === "group") {
          const instanceName = groupInstance(args.target!);
          const groupData = await ctx.readResource(instanceName) as
            | GroupData
            | null;
          if (!groupData) throw new Error(`Group "${args.target}" not found`);
          const updated: GroupData = {
            ...groupData,
            metadata: { ...groupData.metadata, [args.key]: args.value },
          };
          const handle = await ctx.writeResource(
            "group",
            instanceName,
            updated,
          );
          const resolvedHandles = await resolveHostsInGroup(ctx, args.target!);
          ctx.logger.info("Set metadata key {key} on group {group}", {
            key: args.key,
            group: args.target,
          });
          return { dataHandles: [handle, ...resolvedHandles] };
        }

        const instanceName = hostInstance(args.target!);
        const hostData = await ctx.readResource(instanceName) as
          | HostData
          | null;
        if (!hostData) throw new Error(`Host "${args.target}" not found`);
        const updated: HostData = {
          ...hostData,
          metadata: { ...hostData.metadata, [args.key]: args.value },
        };
        const handle = await ctx.writeResource("host", instanceName, updated);
        const resolvedHandles = await resolveHosts(ctx, [updated]);
        ctx.logger.info("Set metadata key {key} on host {host}", {
          key: args.key,
          host: args.target,
        });
        return { dataHandles: [handle, ...resolvedHandles] };
      },
    },
    removeMetadata: {
      description: "Remove a metadata key at the global, group, or host scope",
      arguments: z.object({
        scope: ScopeSchema,
        target: z.string().min(1).optional()
          .describe('Group or host name; required unless scope is "global"'),
        key: z.string().min(1),
        idempotent: z.boolean().default(false)
          .describe(
            "If true, no-op instead of throwing when the key is not set",
          ),
      }).refine((v) => v.scope === "global" || !!v.target, {
        message: 'target is required when scope is "group" or "host"',
        path: ["target"],
      }),
      execute: async (
        args: {
          scope: "global" | "group" | "host";
          target?: string;
          key: string;
          idempotent: boolean;
        },
        ctx: Ctx,
      ) => {
        if (args.scope === "global") {
          const metadata = await readGlobalMetadata(ctx);
          if (!(args.key in metadata)) {
            if (!args.idempotent) {
              throw new Error(`Global metadata key "${args.key}" is not set`);
            }
            return {};
          }
          delete metadata[args.key];
          ctx.logger.info("Removing global metadata key {key}", {
            key: args.key,
          });
          const handle = await ctx.writeResource("global", GLOBAL_INSTANCE, {
            metadata,
          });
          const resolvedHandles = await resolveAllHosts(ctx);
          ctx.logger.info("Removed global metadata key {key}", {
            key: args.key,
          });
          return { dataHandles: [handle, ...resolvedHandles] };
        }

        if (args.scope === "group") {
          const instanceName = groupInstance(args.target!);
          const groupData = await ctx.readResource(instanceName) as
            | GroupData
            | null;
          if (!groupData) throw new Error(`Group "${args.target}" not found`);
          if (!(args.key in groupData.metadata)) {
            if (!args.idempotent) {
              throw new Error(
                `Metadata key "${args.key}" is not set on group "${args.target}"`,
              );
            }
            return {};
          }
          const metadata = { ...groupData.metadata };
          delete metadata[args.key];
          ctx.logger.info("Removing metadata key {key} from group {group}", {
            key: args.key,
            group: args.target,
          });
          const handle = await ctx.writeResource("group", instanceName, {
            ...groupData,
            metadata,
          });
          const resolvedHandles = await resolveHostsInGroup(ctx, args.target!);
          ctx.logger.info("Removed metadata key {key} from group {group}", {
            key: args.key,
            group: args.target,
          });
          return { dataHandles: [handle, ...resolvedHandles] };
        }

        const instanceName = hostInstance(args.target!);
        const hostData = await ctx.readResource(instanceName) as
          | HostData
          | null;
        if (!hostData) throw new Error(`Host "${args.target}" not found`);
        if (!(args.key in hostData.metadata)) {
          if (!args.idempotent) {
            throw new Error(
              `Metadata key "${args.key}" is not set on host "${args.target}"`,
            );
          }
          return {};
        }
        const metadata = { ...hostData.metadata };
        delete metadata[args.key];
        ctx.logger.info("Removing metadata key {key} from host {host}", {
          key: args.key,
          host: args.target,
        });
        const updated: HostData = { ...hostData, metadata };
        const handle = await ctx.writeResource("host", instanceName, updated);
        const resolvedHandles = await resolveHosts(ctx, [updated]);
        ctx.logger.info("Removed metadata key {key} from host {host}", {
          key: args.key,
          host: args.target,
        });
        return { dataHandles: [handle, ...resolvedHandles] };
      },
    },
    resolveMetadata: {
      description:
        "Force-recompute effective metadata per host (scalar keys: host > group > global, earliest-listed group wins ties; list keys: unioned and deduplicated across global, all member groups, and the host). Every mutating method already keeps `resolved` current as a side effect, so this is only needed to backfill hosts added before that behavior existed, or to force a refresh with no other change. Resolves every host, or just the one named.",
      arguments: z.object({
        host: z.string().min(1).optional()
          .describe("If omitted, resolves every host in the catalogue"),
      }),
      execute: async (
        args: { host?: string },
        ctx: Ctx,
      ) => {
        if (args.host) {
          const hostData = await ctx.readResource(
            hostInstance(args.host),
          ) as HostData | null;
          if (!hostData) throw new Error(`Host "${args.host}" not found`);
          ctx.logger.info("Resolving metadata for host {host}", {
            host: args.host,
          });
          const handles = await resolveHosts(ctx, [hostData]);
          ctx.logger.info("Resolved metadata for host {host}", {
            host: args.host,
          });
          return { dataHandles: handles };
        }

        const hosts = await listHosts(ctx);
        ctx.logger.info("Resolving metadata for {count} host(s)", {
          count: hosts.length,
        });
        const handles = await resolveHosts(ctx, hosts);
        ctx.logger.info("Resolved metadata for {count} host(s)", {
          count: hosts.length,
        });
        return { dataHandles: handles };
      },
    },
  },
};
