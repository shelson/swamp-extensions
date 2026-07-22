/**
 * Docker Compose project model — tracks a compose project's structure
 * (services, volumes, networks) and flexible key/value configuration as
 * swamp-managed data. Services live as sub-resources of their owning
 * project, so a service is always linked to exactly one project by
 * construction — there is no separate compose-service model type.
 *
 * Every parameter, service field, and volume/network option is validated
 * against the official compose-spec JSON Schema
 * (https://github.com/compose-spec/compose-go) before it's written, so a
 * typo or malformed value is rejected at write time instead of surfacing
 * later as a broken `docker compose` run. A snapshot of the schema ships
 * bundled with this extension so validation works fully offline out of the
 * box; run the `updateSchema` method on an instance to refresh it from the
 * canonical repository when you need a field the bundled snapshot doesn't
 * know about yet. Vendor extension fields (the compose-spec `x-` prefix)
 * and any field the active schema doesn't recognize are always passed
 * through unvalidated — a stale schema should never silently corrupt data,
 * only decline to check it.
 *
 * This model is data-only: it does not run `docker compose` itself. Pair it
 * with `@keeb/docker/compose` for actual lifecycle execution once a
 * project's structure is defined here.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { parse as parseYaml } from "jsr:@std/yaml@1";
import { isAbsolute, join } from "jsr:@std/path@1";
import {
  ComposeSchemaValidationError,
  validateDocument,
  validateField,
  validateOptions,
} from "./_lib/schema_validation.ts";

const GlobalArgsSchema = z.object({
  projectName: z.string().min(1).describe(
    "Compose project name (COMPOSE_PROJECT_NAME)",
  ),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

// A parameter value is one JSON leaf/collection level — string, number,
// boolean, null, an object, or an array. This covers both scalar settings
// (e.g. restart: "always") and structured ones (e.g. healthcheck: {...},
// ports: ["8080:80"]), which matters for round-tripping real compose.yaml
// fields via importFromFile, not just hand-entered parameters.
const ParameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);
type ParameterValue = z.infer<typeof ParameterValueSchema>;

const ParameterSchema = z.object({
  key: z.string(),
  value: ParameterValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
type Parameter = z.infer<typeof ParameterSchema>;
const ParameterListSchema = z.object({ parameters: z.array(ParameterSchema) });

const ServiceSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type Service = z.infer<typeof ServiceSchema>;
const ServiceListSchema = z.object({ services: z.array(ServiceSchema) });

const ServiceParameterSchema = z.object({
  serviceName: z.string(),
  key: z.string(),
  value: ParameterValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
type ServiceParameter = z.infer<typeof ServiceParameterSchema>;
const ServiceParameterListSchema = z.object({
  serviceName: z.string(),
  parameters: z.array(ServiceParameterSchema),
});

// Volumes and networks are both "named definitions with an options bag" in
// compose — same shape, two separate typed collections so they don't share
// a namespace or get confused with generic project parameters.
const NamedDefinitionSchema = z.object({
  name: z.string(),
  options: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type NamedDefinition = z.infer<typeof NamedDefinitionSchema>;
const NamedDefinitionListSchema = z.object({
  items: z.array(NamedDefinitionSchema),
});

// The active compose-spec JSON Schema document, cached as instance data.
// `schema` is the full parsed compose-spec.json (draft 2020-12) — stored
// as-is rather than picking out individual definitions, since ajv needs the
// whole document available to resolve internal $ref chains (e.g. a
// service's `healthcheck` property refs `$defs/healthcheck`).
const ComposeSchemaCacheSchema = z.object({
  schema: z.record(z.string(), z.unknown()),
  source: z.string(),
  fetchedAt: z.string(),
});
type ComposeSchemaCache = z.infer<typeof ComposeSchemaCacheSchema>;

const COMPOSE_SPEC_SCHEMA_URL =
  "https://raw.githubusercontent.com/compose-spec/compose-go/main/schema/compose-spec.json";
const BUNDLED_SCHEMA_PATH =
  "extensions/models/schema/compose-spec.default.json";

function nowIso(): string {
  return new Date().toISOString();
}

// Resource instance names are unique storage paths across every spec on the
// model (see extension model API docs) — each collection gets a
// non-colliding prefix so e.g. a service and a volume can share a name.
const SERVICES_LIST_INSTANCE = "services";
const VOLUMES_LIST_INSTANCE = "volumes";
const NETWORKS_LIST_INSTANCE = "networks";
const PARAMETERS_LIST_INSTANCE = "parameters";
const COMPOSE_SCHEMA_INSTANCE = "active";
const serviceInstance = (name: string) => `service-${name}`;
const volumeInstance = (name: string) => `volume-${name}`;
const networkInstance = (name: string) => `network-${name}`;
const parameterInstance = (key: string) => `param-${key}`;
// Service parameters nest under the same "service-<name>" prefix as the
// service record itself (e.g. service-proxy::networks), rather than a
// separate svcparam(s)- family, so `swamp data get` output visibly reads as
// "attached to" the service. "__params__" is reserved for the per-service
// parameter list — RESERVED_SERVICE_PARAMETER_KEY guards against a
// user-supplied key colliding with it, since keys are otherwise unrestricted
// strings.
const RESERVED_SERVICE_PARAMETER_KEY = "__params__";
const serviceParametersListInstance = (serviceName: string) =>
  `service-${serviceName}::${RESERVED_SERVICE_PARAMETER_KEY}`;
const serviceParameterInstance = (serviceName: string, key: string) =>
  `service-${serviceName}::${key}`;

function assertValidServiceParameterKey(key: string): void {
  if (key === RESERVED_SERVICE_PARAMETER_KEY) {
    throw new Error(
      `Parameter key '${RESERVED_SERVICE_PARAMETER_KEY}' is reserved`,
    );
  }
}

type WriteResource = (
  specName: string,
  name: string,
  data: Record<string, unknown>,
) => Promise<{ name: string }>;
type ReadResource = (
  instanceName: string,
) => Promise<Record<string, unknown> | null>;

function resolveComposeFilePath(path: string, repoDir: string): string {
  return isAbsolute(path) ? path : join(repoDir, path);
}

// Used by importFromFile to upsert parsed entries into an existing list
// resource by name/key — items already present but absent from the file
// being imported are left untouched, so importing one compose file never
// silently drops data brought in from another.
function mergeByKey<T>(
  existing: T[],
  updates: T[],
  keyOf: (item: T) => string,
): T[] {
  const map = new Map(existing.map((item) => [keyOf(item), item] as const));
  for (const item of updates) map.set(keyOf(item), item);
  return [...map.values()];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Load the compose-spec schema this instance should validate against: the
 * cached live copy (written by `updateSchema`) if one exists, otherwise the
 * schema bundled with this extension. This means a freshly created
 * instance validates correctly with zero network access, and an instance
 * that has run `updateSchema` picks up the refreshed copy automatically on
 * every subsequent call — no extra wiring needed since `readResource`
 * always returns the latest version.
 */
async function getActiveComposeSchema(
  context: {
    readResource: ReadResource;
    extensionFile: (path: string) => string;
  },
): Promise<Record<string, unknown>> {
  const cached = await context.readResource(COMPOSE_SCHEMA_INSTANCE) as
    | ComposeSchemaCache
    | null;
  if (cached) return cached.schema;

  const bundledPath = context.extensionFile(BUNDLED_SCHEMA_PATH);
  const raw = await Deno.readTextFile(bundledPath);
  return JSON.parse(raw) as Record<string, unknown>;
}

/** Docker Compose project model definition — structure and configuration only. */
export const model = {
  type: "@shelson/compose/project",
  version: "2026.07.23.2",
  globalArguments: GlobalArgsSchema,

  resources: {
    "services": {
      description: "List of services linked to this project",
      schema: ServiceListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "service": {
      description: "Single compose service linked to this project",
      schema: ServiceSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "serviceParameters": {
      description: "List of configuration parameters for a single service",
      schema: ServiceParameterListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "serviceParameter": {
      description: "Single service configuration parameter",
      schema: ServiceParameterSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "volumes": {
      description: "List of volume definitions for this project",
      schema: NamedDefinitionListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "volume": {
      description: "Single volume definition",
      schema: NamedDefinitionSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "networks": {
      description: "List of network definitions for this project",
      schema: NamedDefinitionListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "network": {
      description: "Single network definition",
      schema: NamedDefinitionSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "parameters": {
      description: "List of project-level configuration parameters",
      schema: ParameterListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "parameter": {
      description: "Single project-level configuration parameter",
      schema: ParameterSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "composeSchema": {
      description:
        "Active compose-spec JSON Schema used to validate parameters, refreshed via updateSchema",
      schema: ComposeSchemaCacheSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },

  methods: {
    // -----------------------------------------------------------------
    // Schema cache — refresh the compose-spec JSON Schema used to
    // validate every other method below. Falls back to the bundled
    // snapshot until this has been run at least once.
    // -----------------------------------------------------------------
    updateSchema: {
      description:
        "Fetch the latest compose-spec JSON Schema from the canonical compose-go repository and cache it on this instance for validating future create/update/import calls",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          writeResource: WriteResource;
          logger: {
            info: (msg: string, props: Record<string, unknown>) => void;
          };
        },
      ) => {
        const response = await fetch(COMPOSE_SPEC_SCHEMA_URL);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch compose-spec schema from ${COMPOSE_SPEC_SCHEMA_URL}: HTTP ${response.status}`,
          );
        }
        const text = await response.text();

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          throw new Error(
            `Fetched compose-spec schema is not valid JSON: ${
              (err as Error).message
            }`,
          );
        }

        if (
          !parsed || typeof parsed !== "object" ||
          !("properties" in (parsed as Record<string, unknown>))
        ) {
          throw new Error(
            "Fetched content does not look like a compose-spec JSON Schema document (missing 'properties')",
          );
        }

        const handle = await context.writeResource(
          "composeSchema",
          COMPOSE_SCHEMA_INSTANCE,
          {
            schema: parsed,
            source: COMPOSE_SPEC_SCHEMA_URL,
            fetchedAt: nowIso(),
          },
        );

        context.logger.info(
          "Refreshed compose-spec schema cache from {source}",
          { source: COMPOSE_SPEC_SCHEMA_URL },
        );
        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Bulk import from an existing compose.yaml / docker-compose.yml
    // -----------------------------------------------------------------
    importFromFile: {
      description:
        "Populate this project from an existing compose.yaml/docker-compose.yml file — services and their per-service config, volumes, networks, and any other top-level keys as project parameters. Validated against the active compose-spec schema before anything is written. Entries already present are updated in place (matched by name/key); entries not mentioned in the file are left untouched.",
      arguments: z.object({
        path: z.string().min(1).describe(
          "Path to the compose.yaml/docker-compose.yml file to import, relative to the repository root or absolute",
        ),
      }),
      execute: async (
        args: { path: string },
        context: {
          repoDir: string;
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: {
            info: (msg: string, props: Record<string, unknown>) => void;
          };
        },
      ) => {
        const filePath = resolveComposeFilePath(args.path, context.repoDir);

        let raw: string;
        try {
          raw = await Deno.readTextFile(filePath);
        } catch (err) {
          throw new Error(
            `Could not read compose file at '${filePath}': ${
              (err as Error).message
            }`,
          );
        }

        let parsed: unknown;
        try {
          parsed = parseYaml(raw);
        } catch (err) {
          throw new Error(
            `Failed to parse '${filePath}' as YAML: ${(err as Error).message}`,
          );
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            `'${filePath}' does not contain a compose document (expected a top-level mapping)`,
          );
        }
        const compose = parsed as Record<string, unknown>;

        // Validate the whole document up front, before any writes — a
        // partially-imported project on invalid input would be worse than
        // rejecting the import outright.
        const activeSchema = await getActiveComposeSchema(context);
        try {
          validateDocument(activeSchema, compose);
        } catch (err) {
          if (err instanceof ComposeSchemaValidationError) {
            throw new Error(`'${filePath}' ${err.message}`);
          }
          throw err;
        }

        const timestamp = nowIso();
        const handles: { name: string }[] = [];

        // ---- services + per-service parameters ----
        const existingServicesList = (await context.readResource(
          SERVICES_LIST_INSTANCE,
        )) as { services: Service[] } | null;
        const importedServices: Service[] = [];

        const servicesBlock = asRecord(compose.services);
        for (
          const [serviceName, serviceDefRaw] of Object.entries(servicesBlock)
        ) {
          const serviceDef = asRecord(serviceDefRaw);
          const existingService = await context.readResource(
            serviceInstance(serviceName),
          ) as Service | null;

          const service: Service = {
            name: serviceName,
            description: existingService?.description,
            createdAt: existingService?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource(
              "service",
              serviceInstance(serviceName),
              service,
            ),
          );
          importedServices.push(service);

          const existingServiceParamsList = (await context.readResource(
            serviceParametersListInstance(serviceName),
          )) as { serviceName: string; parameters: ServiceParameter[] } | null;
          const importedServiceParams: ServiceParameter[] = [];

          for (const [key, value] of Object.entries(serviceDef)) {
            if (key === RESERVED_SERVICE_PARAMETER_KEY) {
              context.logger.info(
                "Skipping reserved parameter key {key} on service {service} from {file}",
                { key, service: serviceName, file: filePath },
              );
              continue;
            }
            const existingParam = await context.readResource(
              serviceParameterInstance(serviceName, key),
            ) as ServiceParameter | null;
            const parameter: ServiceParameter = {
              serviceName,
              key,
              value: value as ParameterValue,
              createdAt: existingParam?.createdAt ?? timestamp,
              updatedAt: timestamp,
            };
            handles.push(
              await context.writeResource(
                "serviceParameter",
                serviceParameterInstance(serviceName, key),
                parameter,
              ),
            );
            importedServiceParams.push(parameter);
          }

          const mergedServiceParams = mergeByKey(
            existingServiceParamsList?.parameters ?? [],
            importedServiceParams,
            (p) => p.key,
          );
          handles.push(
            await context.writeResource(
              "serviceParameters",
              serviceParametersListInstance(serviceName),
              { serviceName, parameters: mergedServiceParams },
            ),
          );
        }

        const mergedServices = mergeByKey(
          existingServicesList?.services ?? [],
          importedServices,
          (s) => s.name,
        );
        handles.push(
          await context.writeResource("services", SERVICES_LIST_INSTANCE, {
            services: mergedServices,
          }),
        );

        // ---- volumes ----
        const existingVolumesList = (await context.readResource(
          VOLUMES_LIST_INSTANCE,
        )) as { items: NamedDefinition[] } | null;
        const importedVolumes: NamedDefinition[] = [];

        for (
          const [name, optionsRaw] of Object.entries(asRecord(compose.volumes))
        ) {
          const existingVolume = await context.readResource(
            volumeInstance(name),
          ) as NamedDefinition | null;
          const volume: NamedDefinition = {
            name,
            options: asRecord(optionsRaw),
            createdAt: existingVolume?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource("volume", volumeInstance(name), volume),
          );
          importedVolumes.push(volume);
        }

        const mergedVolumes = mergeByKey(
          existingVolumesList?.items ?? [],
          importedVolumes,
          (v) => v.name,
        );
        handles.push(
          await context.writeResource("volumes", VOLUMES_LIST_INSTANCE, {
            items: mergedVolumes,
          }),
        );

        // ---- networks ----
        const existingNetworksList = (await context.readResource(
          NETWORKS_LIST_INSTANCE,
        )) as { items: NamedDefinition[] } | null;
        const importedNetworks: NamedDefinition[] = [];

        for (
          const [name, optionsRaw] of Object.entries(
            asRecord(compose.networks),
          )
        ) {
          const existingNetwork = await context.readResource(
            networkInstance(name),
          ) as NamedDefinition | null;
          const network: NamedDefinition = {
            name,
            options: asRecord(optionsRaw),
            createdAt: existingNetwork?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource(
              "network",
              networkInstance(name),
              network,
            ),
          );
          importedNetworks.push(network);
        }

        const mergedNetworks = mergeByKey(
          existingNetworksList?.items ?? [],
          importedNetworks,
          (n) => n.name,
        );
        handles.push(
          await context.writeResource("networks", NETWORKS_LIST_INSTANCE, {
            items: mergedNetworks,
          }),
        );

        // ---- everything else at the top level becomes a project parameter
        // (version, configs, secrets, x-* extensions, name, ...) so import
        // doesn't silently drop fields this model has no dedicated slot for.
        const structuralKeys = new Set(["services", "volumes", "networks"]);
        const existingProjectParamsList = (await context.readResource(
          PARAMETERS_LIST_INSTANCE,
        )) as { parameters: Parameter[] } | null;
        const importedParameters: Parameter[] = [];

        for (const [key, value] of Object.entries(compose)) {
          if (structuralKeys.has(key)) continue;
          const existingParam = await context.readResource(
            parameterInstance(key),
          ) as Parameter | null;
          const parameter: Parameter = {
            key,
            value: value as ParameterValue,
            createdAt: existingParam?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource(
              "parameter",
              parameterInstance(key),
              parameter,
            ),
          );
          importedParameters.push(parameter);
        }

        const mergedParameters = mergeByKey(
          existingProjectParamsList?.parameters ?? [],
          importedParameters,
          (p) => p.key,
        );
        handles.push(
          await context.writeResource("parameters", PARAMETERS_LIST_INSTANCE, {
            parameters: mergedParameters,
          }),
        );

        context.logger.info(
          "Imported {services} service(s), {volumes} volume(s), {networks} network(s), {parameters} project parameter(s) from {file}",
          {
            services: importedServices.length,
            volumes: importedVolumes.length,
            networks: importedNetworks.length,
            parameters: importedParameters.length,
            file: filePath,
          },
        );

        return { dataHandles: handles };
      },
    },

    // -----------------------------------------------------------------
    // Services — "create and link a child compose-service" is realized
    // by writing the service as a sub-resource of this project instance,
    // so ownership by exactly one project holds by construction.
    // -----------------------------------------------------------------
    createService: {
      description: "Create and link a new compose service to this project",
      arguments: z.object({
        name: z.string().min(1).describe("Service name"),
        description: z.string().optional().describe(
          "Optional human-readable description",
        ),
      }),
      execute: async (
        args: { name: string; description?: string },
        context: {
          globalArgs: GlobalArgs;
          writeResource: WriteResource;
          readResource: ReadResource;
          logger: {
            info: (msg: string, props: Record<string, unknown>) => void;
          };
        },
      ) => {
        const existing = await context.readResource(
          serviceInstance(args.name),
        );
        if (existing) {
          throw new Error(`Service '${args.name}' already exists`);
        }

        const timestamp = nowIso();
        const service: Service = {
          name: args.name,
          description: args.description,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const serviceHandle = await context.writeResource(
          "service",
          serviceInstance(args.name),
          service,
        );

        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: Service[] }
          | null;
        const services = [...(list?.services ?? []), service];
        const listHandle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services },
        );

        context.logger.info("Linked service {name} to project {project}", {
          name: args.name,
          project: context.globalArgs.projectName,
        });
        return { dataHandles: [serviceHandle, listHandle] };
      },
    },

    listServices: {
      description: "List services linked to this project",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: Service[] }
          | null;
        const handle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services: list?.services ?? [] },
        );
        return { dataHandles: [handle] };
      },
    },

    getService: {
      description: "Fetch a single service by name",
      arguments: z.object({ name: z.string().describe("Service name") }),
      execute: async (
        args: { name: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const service = await context.readResource(serviceInstance(args.name));
        if (!service) {
          throw new Error(`Service '${args.name}' not found`);
        }
        const handle = await context.writeResource(
          "service",
          serviceInstance(args.name),
          service,
        );
        return { dataHandles: [handle] };
      },
    },

    updateService: {
      description: "Update a service's description",
      arguments: z.object({
        name: z.string().describe("Service name"),
        description: z.string().describe("New description"),
      }),
      execute: async (
        args: { name: string; description: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const existing = await context.readResource(
          serviceInstance(args.name),
        ) as Service | null;
        if (!existing) {
          throw new Error(`Service '${args.name}' not found`);
        }

        const updated: Service = {
          ...existing,
          description: args.description,
          updatedAt: nowIso(),
        };
        const serviceHandle = await context.writeResource(
          "service",
          serviceInstance(args.name),
          updated,
        );

        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: Service[] }
          | null;
        const services = (list?.services ?? []).map((s) =>
          s.name === args.name ? updated : s
        );
        const listHandle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services },
        );

        return { dataHandles: [serviceHandle, listHandle] };
      },
    },

    deleteService: {
      description: "Unlink a service from this project",
      arguments: z.object({ name: z.string().describe("Service name") }),
      execute: async (
        args: { name: string },
        context: {
          globalArgs: GlobalArgs;
          writeResource: WriteResource;
          readResource: ReadResource;
          logger: {
            info: (msg: string, props: Record<string, unknown>) => void;
          };
        },
      ) => {
        const existing = await context.readResource(
          serviceInstance(args.name),
        );
        if (!existing) {
          throw new Error(`Service '${args.name}' not found`);
        }

        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: Service[] }
          | null;
        const services = (list?.services ?? []).filter((s) =>
          s.name !== args.name
        );
        const handle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services },
        );

        context.logger.info("Unlinked service {name} from project {project}", {
          name: args.name,
          project: context.globalArgs.projectName,
        });
        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Service-level configuration parameters (key/value, per service)
    // -----------------------------------------------------------------
    createServiceParameter: {
      description:
        "Create a configuration parameter on a service, validated against the active compose-spec schema",
      arguments: z.object({
        serviceName: z.string().describe("Service name"),
        key: z.string().min(1).describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "Parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { serviceName: string; key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        assertValidServiceParameterKey(args.key);
        const serviceExists = await context.readResource(
          serviceInstance(args.serviceName),
        );
        if (!serviceExists) {
          throw new Error(`Service '${args.serviceName}' not found`);
        }
        const existing = await context.readResource(
          serviceParameterInstance(args.serviceName, args.key),
        );
        if (existing) {
          throw new Error(
            `Parameter '${args.key}' already exists on service '${args.serviceName}'`,
          );
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, "service", args.key, args.value);

        const timestamp = nowIso();
        const parameter: ServiceParameter = {
          serviceName: args.serviceName,
          key: args.key,
          value: args.value,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const paramHandle = await context.writeResource(
          "serviceParameter",
          serviceParameterInstance(args.serviceName, args.key),
          parameter,
        );

        const listInstance = serviceParametersListInstance(args.serviceName);
        const list = (await context.readResource(listInstance)) as
          | { serviceName: string; parameters: ServiceParameter[] }
          | null;
        const parameters = [...(list?.parameters ?? []), parameter];
        const listHandle = await context.writeResource(
          "serviceParameters",
          listInstance,
          { serviceName: args.serviceName, parameters },
        );

        return { dataHandles: [paramHandle, listHandle] };
      },
    },

    listServiceParameters: {
      description: "List configuration parameters for a service",
      arguments: z.object({
        serviceName: z.string().describe("Service name"),
      }),
      execute: async (
        args: { serviceName: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const listInstance = serviceParametersListInstance(args.serviceName);
        const list = (await context.readResource(listInstance)) as
          | { serviceName: string; parameters: ServiceParameter[] }
          | null;
        const handle = await context.writeResource(
          "serviceParameters",
          listInstance,
          { serviceName: args.serviceName, parameters: list?.parameters ?? [] },
        );
        return { dataHandles: [handle] };
      },
    },

    getServiceParameter: {
      description: "Fetch a single service configuration parameter",
      arguments: z.object({
        serviceName: z.string().describe("Service name"),
        key: z.string().describe("Parameter key"),
      }),
      execute: async (
        args: { serviceName: string; key: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        assertValidServiceParameterKey(args.key);
        const parameter = await context.readResource(
          serviceParameterInstance(args.serviceName, args.key),
        );
        if (!parameter) {
          throw new Error(
            `Parameter '${args.key}' not found on service '${args.serviceName}'`,
          );
        }
        const handle = await context.writeResource(
          "serviceParameter",
          serviceParameterInstance(args.serviceName, args.key),
          parameter,
        );
        return { dataHandles: [handle] };
      },
    },

    updateServiceParameter: {
      description:
        "Update a service configuration parameter's value, validated against the active compose-spec schema",
      arguments: z.object({
        serviceName: z.string().describe("Service name"),
        key: z.string().describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "New parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { serviceName: string; key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        assertValidServiceParameterKey(args.key);
        const existing = await context.readResource(
          serviceParameterInstance(args.serviceName, args.key),
        ) as ServiceParameter | null;
        if (!existing) {
          throw new Error(
            `Parameter '${args.key}' not found on service '${args.serviceName}'`,
          );
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, "service", args.key, args.value);

        const updated: ServiceParameter = {
          ...existing,
          value: args.value,
          updatedAt: nowIso(),
        };
        const paramHandle = await context.writeResource(
          "serviceParameter",
          serviceParameterInstance(args.serviceName, args.key),
          updated,
        );

        const listInstance = serviceParametersListInstance(args.serviceName);
        const list = (await context.readResource(listInstance)) as
          | { serviceName: string; parameters: ServiceParameter[] }
          | null;
        const parameters = (list?.parameters ?? []).map((p) =>
          p.key === args.key ? updated : p
        );
        const listHandle = await context.writeResource(
          "serviceParameters",
          listInstance,
          { serviceName: args.serviceName, parameters },
        );

        return { dataHandles: [paramHandle, listHandle] };
      },
    },

    deleteServiceParameter: {
      description: "Delete a service configuration parameter",
      arguments: z.object({
        serviceName: z.string().describe("Service name"),
        key: z.string().describe("Parameter key"),
      }),
      execute: async (
        args: { serviceName: string; key: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        assertValidServiceParameterKey(args.key);
        const existing = await context.readResource(
          serviceParameterInstance(args.serviceName, args.key),
        );
        if (!existing) {
          throw new Error(
            `Parameter '${args.key}' not found on service '${args.serviceName}'`,
          );
        }

        const listInstance = serviceParametersListInstance(args.serviceName);
        const list = (await context.readResource(listInstance)) as
          | { serviceName: string; parameters: ServiceParameter[] }
          | null;
        const parameters = (list?.parameters ?? []).filter((p) =>
          p.key !== args.key
        );
        const handle = await context.writeResource(
          "serviceParameters",
          listInstance,
          { serviceName: args.serviceName, parameters },
        );

        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Project-level configuration parameters (key/value)
    // -----------------------------------------------------------------
    createParameter: {
      description:
        "Create a project-level configuration parameter, validated against the active compose-spec schema",
      arguments: z.object({
        key: z.string().min(1).describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "Parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(
          parameterInstance(args.key),
        );
        if (existing) {
          throw new Error(`Parameter '${args.key}' already exists`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, null, args.key, args.value);

        const timestamp = nowIso();
        const parameter: Parameter = {
          key: args.key,
          value: args.value,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const paramHandle = await context.writeResource(
          "parameter",
          parameterInstance(args.key),
          parameter,
        );

        const list = (await context.readResource(PARAMETERS_LIST_INSTANCE)) as
          | { parameters: Parameter[] }
          | null;
        const parameters = [...(list?.parameters ?? []), parameter];
        const listHandle = await context.writeResource(
          "parameters",
          PARAMETERS_LIST_INSTANCE,
          { parameters },
        );

        return { dataHandles: [paramHandle, listHandle] };
      },
    },

    listParameters: {
      description: "List project-level configuration parameters",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const list = (await context.readResource(PARAMETERS_LIST_INSTANCE)) as
          | { parameters: Parameter[] }
          | null;
        const handle = await context.writeResource(
          "parameters",
          PARAMETERS_LIST_INSTANCE,
          { parameters: list?.parameters ?? [] },
        );
        return { dataHandles: [handle] };
      },
    },

    getParameter: {
      description: "Fetch a single project-level configuration parameter",
      arguments: z.object({ key: z.string().describe("Parameter key") }),
      execute: async (
        args: { key: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const parameter = await context.readResource(
          parameterInstance(args.key),
        );
        if (!parameter) {
          throw new Error(`Parameter '${args.key}' not found`);
        }
        const handle = await context.writeResource(
          "parameter",
          parameterInstance(args.key),
          parameter,
        );
        return { dataHandles: [handle] };
      },
    },

    updateParameter: {
      description:
        "Update a project-level configuration parameter's value, validated against the active compose-spec schema",
      arguments: z.object({
        key: z.string().describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "New parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(
          parameterInstance(args.key),
        ) as Parameter | null;
        if (!existing) {
          throw new Error(`Parameter '${args.key}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, null, args.key, args.value);

        const updated: Parameter = {
          ...existing,
          value: args.value,
          updatedAt: nowIso(),
        };
        const paramHandle = await context.writeResource(
          "parameter",
          parameterInstance(args.key),
          updated,
        );

        const list = (await context.readResource(PARAMETERS_LIST_INSTANCE)) as
          | { parameters: Parameter[] }
          | null;
        const parameters = (list?.parameters ?? []).map((p) =>
          p.key === args.key ? updated : p
        );
        const listHandle = await context.writeResource(
          "parameters",
          PARAMETERS_LIST_INSTANCE,
          { parameters },
        );

        return { dataHandles: [paramHandle, listHandle] };
      },
    },

    deleteParameter: {
      description: "Delete a project-level configuration parameter",
      arguments: z.object({ key: z.string().describe("Parameter key") }),
      execute: async (
        args: { key: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const existing = await context.readResource(
          parameterInstance(args.key),
        );
        if (!existing) {
          throw new Error(`Parameter '${args.key}' not found`);
        }

        const list = (await context.readResource(PARAMETERS_LIST_INSTANCE)) as
          | { parameters: Parameter[] }
          | null;
        const parameters = (list?.parameters ?? []).filter((p) =>
          p.key !== args.key
        );
        const handle = await context.writeResource(
          "parameters",
          PARAMETERS_LIST_INSTANCE,
          { parameters },
        );

        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Volume definitions
    // -----------------------------------------------------------------
    createVolume: {
      description:
        "Create a volume definition for this project, with options validated against the active compose-spec schema",
      arguments: z.object({
        name: z.string().min(1).describe("Volume name"),
        options: z.record(z.string(), z.unknown()).optional().describe(
          "Volume options (driver, driver_opts, external, labels, ...)",
        ),
      }),
      execute: async (
        args: { name: string; options?: Record<string, unknown> },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(volumeInstance(args.name));
        if (existing) {
          throw new Error(`Volume '${args.name}' already exists`);
        }

        const options = args.options ?? {};
        const activeSchema = await getActiveComposeSchema(context);
        validateOptions(activeSchema, "volume", options);

        const timestamp = nowIso();
        const volume: NamedDefinition = {
          name: args.name,
          options,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const volumeHandle = await context.writeResource(
          "volume",
          volumeInstance(args.name),
          volume,
        );

        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = [...(list?.items ?? []), volume];
        const listHandle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [volumeHandle, listHandle] };
      },
    },

    listVolumes: {
      description: "List volume definitions for this project",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const handle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items: list?.items ?? [] },
        );
        return { dataHandles: [handle] };
      },
    },

    getVolume: {
      description: "Fetch a single volume definition",
      arguments: z.object({ name: z.string().describe("Volume name") }),
      execute: async (
        args: { name: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const volume = await context.readResource(volumeInstance(args.name));
        if (!volume) {
          throw new Error(`Volume '${args.name}' not found`);
        }
        const handle = await context.writeResource(
          "volume",
          volumeInstance(args.name),
          volume,
        );
        return { dataHandles: [handle] };
      },
    },

    updateVolume: {
      description:
        "Update a volume definition's options, validated against the active compose-spec schema",
      arguments: z.object({
        name: z.string().describe("Volume name"),
        options: z.record(z.string(), z.unknown()).describe(
          "New volume options (replaces the existing options object)",
        ),
      }),
      execute: async (
        args: { name: string; options: Record<string, unknown> },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(
          volumeInstance(args.name),
        ) as NamedDefinition | null;
        if (!existing) {
          throw new Error(`Volume '${args.name}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateOptions(activeSchema, "volume", args.options);

        const updated: NamedDefinition = {
          ...existing,
          options: args.options,
          updatedAt: nowIso(),
        };
        const volumeHandle = await context.writeResource(
          "volume",
          volumeInstance(args.name),
          updated,
        );

        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = (list?.items ?? []).map((v) =>
          v.name === args.name ? updated : v
        );
        const listHandle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [volumeHandle, listHandle] };
      },
    },

    deleteVolume: {
      description: "Delete a volume definition",
      arguments: z.object({ name: z.string().describe("Volume name") }),
      execute: async (
        args: { name: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const existing = await context.readResource(volumeInstance(args.name));
        if (!existing) {
          throw new Error(`Volume '${args.name}' not found`);
        }

        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = (list?.items ?? []).filter((v) => v.name !== args.name);
        const handle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Network definitions
    // -----------------------------------------------------------------
    createNetwork: {
      description:
        "Create a network definition for this project, with options validated against the active compose-spec schema",
      arguments: z.object({
        name: z.string().min(1).describe("Network name"),
        options: z.record(z.string(), z.unknown()).optional().describe(
          "Network options (driver, driver_opts, external, labels, ...)",
        ),
      }),
      execute: async (
        args: { name: string; options?: Record<string, unknown> },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(
          networkInstance(args.name),
        );
        if (existing) {
          throw new Error(`Network '${args.name}' already exists`);
        }

        const options = args.options ?? {};
        const activeSchema = await getActiveComposeSchema(context);
        validateOptions(activeSchema, "network", options);

        const timestamp = nowIso();
        const network: NamedDefinition = {
          name: args.name,
          options,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const networkHandle = await context.writeResource(
          "network",
          networkInstance(args.name),
          network,
        );

        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = [...(list?.items ?? []), network];
        const listHandle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [networkHandle, listHandle] };
      },
    },

    listNetworks: {
      description: "List network definitions for this project",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const handle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items: list?.items ?? [] },
        );
        return { dataHandles: [handle] };
      },
    },

    getNetwork: {
      description: "Fetch a single network definition",
      arguments: z.object({ name: z.string().describe("Network name") }),
      execute: async (
        args: { name: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const network = await context.readResource(networkInstance(args.name));
        if (!network) {
          throw new Error(`Network '${args.name}' not found`);
        }
        const handle = await context.writeResource(
          "network",
          networkInstance(args.name),
          network,
        );
        return { dataHandles: [handle] };
      },
    },

    updateNetwork: {
      description:
        "Update a network definition's options, validated against the active compose-spec schema",
      arguments: z.object({
        name: z.string().describe("Network name"),
        options: z.record(z.string(), z.unknown()).describe(
          "New network options (replaces the existing options object)",
        ),
      }),
      execute: async (
        args: { name: string; options: Record<string, unknown> },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
        },
      ) => {
        const existing = await context.readResource(
          networkInstance(args.name),
        ) as NamedDefinition | null;
        if (!existing) {
          throw new Error(`Network '${args.name}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateOptions(activeSchema, "network", args.options);

        const updated: NamedDefinition = {
          ...existing,
          options: args.options,
          updatedAt: nowIso(),
        };
        const networkHandle = await context.writeResource(
          "network",
          networkInstance(args.name),
          updated,
        );

        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = (list?.items ?? []).map((n) =>
          n.name === args.name ? updated : n
        );
        const listHandle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [networkHandle, listHandle] };
      },
    },

    deleteNetwork: {
      description: "Delete a network definition",
      arguments: z.object({ name: z.string().describe("Network name") }),
      execute: async (
        args: { name: string },
        context: { writeResource: WriteResource; readResource: ReadResource },
      ) => {
        const existing = await context.readResource(
          networkInstance(args.name),
        );
        if (!existing) {
          throw new Error(`Network '${args.name}' not found`);
        }

        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: NamedDefinition[] }
          | null;
        const items = (list?.items ?? []).filter((n) => n.name !== args.name);
        const handle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items },
        );

        return { dataHandles: [handle] };
      },
    },
  },
};
