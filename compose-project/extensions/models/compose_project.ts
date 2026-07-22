/**
 * Docker Compose project model — tracks a compose project's structure
 * (services, volumes, networks) and flexible key/value configuration as
 * swamp-managed data. Services, volumes, and networks all share the same
 * shape: a bare named link (`EntityRefSchema`) plus a flat bag of per-key
 * parameters validated against the matching compose-spec definition
 * ("service" / "volume" / "network"). Project-level fields (version,
 * configs, secrets, x-* extensions, ...) work the same way one level up,
 * validated against the document root instead of a named definition.
 * Services live as sub-resources of their owning project, so a service is
 * always linked to exactly one project by construction — there is no
 * separate compose-service model type.
 *
 * Every parameter, service field, and volume/network field is validated
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
import {
  parse as parseYaml,
  stringify as stringifyYaml,
} from "jsr:@std/yaml@1";
import { isAbsolute, join } from "jsr:@std/path@1";
import {
  ComposeSchemaValidationError,
  validateDocument,
  validateField,
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

// Project-level (top-of-document) configuration parameters.
const ProjectParameterSchema = z.object({
  key: z.string(),
  value: ParameterValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
type ProjectParameter = z.infer<typeof ProjectParameterSchema>;
const ProjectParameterListSchema = z.object({
  parameters: z.array(ProjectParameterSchema),
});

// Services, volumes, and networks are all "a named thing linked to this
// project" — same bare identity shape, three separate typed collections so
// a service, a volume, and a network can share a name without colliding.
// Everything about what the thing actually configures (image, ports,
// driver, driver_opts, ...) lives as per-key parameters, not fields on this
// record, so create/update/delete for those fields is one generic
// mechanism per kind instead of a bespoke "replace the whole options
// object" method.
const EntityRefSchema = z.object({
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type EntityRef = z.infer<typeof EntityRefSchema>;

const ServiceListSchema = z.object({ services: z.array(EntityRefSchema) });
const VolumeListSchema = z.object({ items: z.array(EntityRefSchema) });
const NetworkListSchema = z.object({ items: z.array(EntityRefSchema) });

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

const VolumeParameterSchema = z.object({
  volumeName: z.string(),
  key: z.string(),
  value: ParameterValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
type VolumeParameter = z.infer<typeof VolumeParameterSchema>;
const VolumeParameterListSchema = z.object({
  volumeName: z.string(),
  parameters: z.array(VolumeParameterSchema),
});

const NetworkParameterSchema = z.object({
  networkName: z.string(),
  key: z.string(),
  value: ParameterValueSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
type NetworkParameter = z.infer<typeof NetworkParameterSchema>;
const NetworkParameterListSchema = z.object({
  networkName: z.string(),
  parameters: z.array(NetworkParameterSchema),
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

// The rendered compose.yaml document produced by `renderComposeFile` —
// derived data, not a source of truth. Re-rendered wholesale from the
// project's services/volumes/networks/parameters on every call, so it
// always reflects their current state rather than drifting out of sync.
const ComposeFileSchema = z.object({
  yaml: z.string(),
  generatedAt: z.string(),
});
type ComposeFile = z.infer<typeof ComposeFileSchema>;

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
const PROJECT_PARAMETERS_LIST_INSTANCE = "parameters";
const COMPOSE_SCHEMA_INSTANCE = "active";
const COMPOSE_FILE_INSTANCE = "composeFile";
const serviceInstance = (name: string) => `service-${name}`;
const volumeInstance = (name: string) => `volume-${name}`;
const networkInstance = (name: string) => `network-${name}`;
const projectParameterInstance = (key: string) => `param-${key}`;

// Per-entity parameters nest under the same "<kind>-<name>" prefix as the
// entity record itself (e.g. service-proxy::ports), rather than a separate
// family of instance names, so `swamp data get` output visibly reads as
// "attached to" the service/volume/network. "__params__" is reserved for
// the per-entity parameter list — assertValidParameterKey guards against a
// user-supplied key colliding with it, since keys are otherwise
// unrestricted strings.
const RESERVED_PARAMETER_LIST_KEY = "__params__";
const serviceParametersListInstance = (serviceName: string) =>
  `service-${serviceName}::${RESERVED_PARAMETER_LIST_KEY}`;
const serviceParameterInstance = (serviceName: string, key: string) =>
  `service-${serviceName}::${key}`;
const volumeParametersListInstance = (volumeName: string) =>
  `volume-${volumeName}::${RESERVED_PARAMETER_LIST_KEY}`;
const volumeParameterInstance = (volumeName: string, key: string) =>
  `volume-${volumeName}::${key}`;
const networkParametersListInstance = (networkName: string) =>
  `network-${networkName}::${RESERVED_PARAMETER_LIST_KEY}`;
const networkParameterInstance = (networkName: string, key: string) =>
  `network-${networkName}::${key}`;

function assertValidParameterKey(key: string): void {
  if (key === RESERVED_PARAMETER_LIST_KEY) {
    throw new Error(
      `Parameter key '${RESERVED_PARAMETER_LIST_KEY}' is reserved`,
    );
  }
}

// Entity instance names (service-${name}, volume-${name}, network-${name})
// share a storage namespace with their own "::"-delimited sub-instances
// (service-${name}::__params__, service-${name}::${key}, ...). A name
// containing "::" can be crafted to collide with another entity's
// parameter-list or parameter instance — e.g. a service literally named
// "web::__params__" collides with the parameter-list instance of a service
// named "web" — silently overwriting the wrong resource on write. Rejecting
// "::" in names (parameter keys may still contain it freely) keeps the
// delimiter unambiguous: the first "::" after the prefix always marks the
// end of the name.
function assertValidEntityName(kind: string, name: string): void {
  if (name.includes("::")) {
    throw new Error(
      `${kind} name '${name}' must not contain '::' (reserved as the internal parameter-instance delimiter)`,
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
type Logger = {
  info: (msg: string, props: Record<string, unknown>) => void;
};

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

// Write a single parameter record, preserving createdAt across repeat
// writes to the same key. Shared by the setXParameter methods (single-key
// upsert) and importFromFile (bulk upsert) so the "what does it mean to set
// one parameter" logic exists in exactly one place. List-level merging is
// deliberately left to each call site, since a single `set*` call and a
// bulk import legitimately want different list-write shapes (one merged
// write per key vs. one merged write per whole import).
async function writeServiceParameterRecord(
  context: { readResource: ReadResource; writeResource: WriteResource },
  serviceName: string,
  key: string,
  value: ParameterValue,
  timestamp: string,
): Promise<{ handle: { name: string }; parameter: ServiceParameter }> {
  const existing = await context.readResource(
    serviceParameterInstance(serviceName, key),
  ) as ServiceParameter | null;
  const parameter: ServiceParameter = {
    serviceName,
    key,
    value,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const handle = await context.writeResource(
    "serviceParameter",
    serviceParameterInstance(serviceName, key),
    parameter,
  );
  return { handle, parameter };
}

async function writeVolumeParameterRecord(
  context: { readResource: ReadResource; writeResource: WriteResource },
  volumeName: string,
  key: string,
  value: ParameterValue,
  timestamp: string,
): Promise<{ handle: { name: string }; parameter: VolumeParameter }> {
  const existing = await context.readResource(
    volumeParameterInstance(volumeName, key),
  ) as VolumeParameter | null;
  const parameter: VolumeParameter = {
    volumeName,
    key,
    value,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const handle = await context.writeResource(
    "volumeParameter",
    volumeParameterInstance(volumeName, key),
    parameter,
  );
  return { handle, parameter };
}

async function writeNetworkParameterRecord(
  context: { readResource: ReadResource; writeResource: WriteResource },
  networkName: string,
  key: string,
  value: ParameterValue,
  timestamp: string,
): Promise<{ handle: { name: string }; parameter: NetworkParameter }> {
  const existing = await context.readResource(
    networkParameterInstance(networkName, key),
  ) as NetworkParameter | null;
  const parameter: NetworkParameter = {
    networkName,
    key,
    value,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const handle = await context.writeResource(
    "networkParameter",
    networkParameterInstance(networkName, key),
    parameter,
  );
  return { handle, parameter };
}

async function writeProjectParameterRecord(
  context: { readResource: ReadResource; writeResource: WriteResource },
  key: string,
  value: ParameterValue,
  timestamp: string,
): Promise<{ handle: { name: string }; parameter: ProjectParameter }> {
  const existing = await context.readResource(
    projectParameterInstance(key),
  ) as ProjectParameter | null;
  const parameter: ProjectParameter = {
    key,
    value,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  const handle = await context.writeResource(
    "parameter",
    projectParameterInstance(key),
    parameter,
  );
  return { handle, parameter };
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

/**
 * Reassemble this project's current services (with their per-service
 * parameters), volumes, networks (each with their per-entity parameters),
 * and project-level parameters into a compose document, validate it
 * against the active compose-spec schema, and store the serialized YAML as
 * the `composeFile` resource.
 *
 * Called at the end of every method that mutates project structure
 * (`importFromFile` and the create/update/delete methods below), so
 * `composeFile` is always current for any other code reading this model's
 * data — callers should never need to invoke `renderComposeFile` manually
 * as a separate step.
 */
async function renderAndWriteComposeFile(
  context: {
    writeResource: WriteResource;
    readResource: ReadResource;
    extensionFile: (path: string) => string;
  },
): Promise<{ name: string }> {
  const servicesList = (await context.readResource(
    SERVICES_LIST_INSTANCE,
  )) as { services: EntityRef[] } | null;
  const volumesList = (await context.readResource(
    VOLUMES_LIST_INSTANCE,
  )) as { items: EntityRef[] } | null;
  const networksList = (await context.readResource(
    NETWORKS_LIST_INSTANCE,
  )) as { items: EntityRef[] } | null;
  const parametersList = (await context.readResource(
    PROJECT_PARAMETERS_LIST_INSTANCE,
  )) as { parameters: ProjectParameter[] } | null;

  const services: Record<string, Record<string, unknown>> = {};
  for (const service of servicesList?.services ?? []) {
    const serviceParams = (await context.readResource(
      serviceParametersListInstance(service.name),
    )) as { serviceName: string; parameters: ServiceParameter[] } | null;
    const serviceDoc: Record<string, unknown> = {};
    for (const param of serviceParams?.parameters ?? []) {
      serviceDoc[param.key] = param.value;
    }
    services[service.name] = serviceDoc;
  }

  const volumes: Record<string, Record<string, unknown>> = {};
  for (const volume of volumesList?.items ?? []) {
    const volumeParams = (await context.readResource(
      volumeParametersListInstance(volume.name),
    )) as { volumeName: string; parameters: VolumeParameter[] } | null;
    const volumeDoc: Record<string, unknown> = {};
    for (const param of volumeParams?.parameters ?? []) {
      volumeDoc[param.key] = param.value;
    }
    volumes[volume.name] = volumeDoc;
  }

  const networks: Record<string, Record<string, unknown>> = {};
  for (const network of networksList?.items ?? []) {
    const networkParams = (await context.readResource(
      networkParametersListInstance(network.name),
    )) as { networkName: string; parameters: NetworkParameter[] } | null;
    const networkDoc: Record<string, unknown> = {};
    for (const param of networkParams?.parameters ?? []) {
      networkDoc[param.key] = param.value;
    }
    networks[network.name] = networkDoc;
  }

  const compose: Record<string, unknown> = {};
  for (const param of parametersList?.parameters ?? []) {
    compose[param.key] = param.value;
  }
  if (Object.keys(services).length > 0) compose.services = services;
  if (Object.keys(volumes).length > 0) compose.volumes = volumes;
  if (Object.keys(networks).length > 0) compose.networks = networks;

  const activeSchema = await getActiveComposeSchema(context);
  try {
    validateDocument(activeSchema, compose);
  } catch (err) {
    if (err instanceof ComposeSchemaValidationError) {
      throw new Error(
        `Rendered compose document is invalid: ${err.message}`,
      );
    }
    throw err;
  }

  const composeFile: ComposeFile = {
    yaml: stringifyYaml(compose, { sortKeys: false }),
    generatedAt: nowIso(),
  };
  return await context.writeResource(
    "composeFile",
    COMPOSE_FILE_INSTANCE,
    composeFile,
  );
}

/** Docker Compose project model definition — structure and configuration only. */
export const model = {
  type: "@shelson/compose/project",
  version: "2026.07.23.5",
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
      schema: EntityRefSchema,
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
      schema: VolumeListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "volume": {
      description: "Single volume definition",
      schema: EntityRefSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "volumeParameters": {
      description: "List of configuration parameters for a single volume",
      schema: VolumeParameterListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "volumeParameter": {
      description: "Single volume configuration parameter",
      schema: VolumeParameterSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "networks": {
      description: "List of network definitions for this project",
      schema: NetworkListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "network": {
      description: "Single network definition",
      schema: EntityRefSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "networkParameters": {
      description: "List of configuration parameters for a single network",
      schema: NetworkParameterListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "networkParameter": {
      description: "Single network configuration parameter",
      schema: NetworkParameterSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    "parameters": {
      description: "List of project-level configuration parameters",
      schema: ProjectParameterListSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    "parameter": {
      description: "Single project-level configuration parameter",
      schema: ProjectParameterSchema,
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
    "composeFile": {
      description:
        "Rendered compose.yaml document generated from this project's current services, volumes, networks, and parameters",
      schema: ComposeFileSchema,
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
          logger: Logger;
        },
      ) => {
        context.logger.info("Fetching compose-spec schema from {source}", {
          source: COMPOSE_SPEC_SCHEMA_URL,
        });

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
        "Populate this project from an existing compose.yaml/docker-compose.yml file — services, volumes, and networks (each with their per-entity config), and any other top-level keys as project parameters. Validated against the active compose-spec schema before anything is written. Entries already present are updated in place (matched by name/key); entries not mentioned in the file are left untouched.",
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
          logger: Logger;
        },
      ) => {
        const filePath = resolveComposeFilePath(args.path, context.repoDir);

        context.logger.info("Importing compose file {file}", {
          file: filePath,
        });

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

        // Also reject entity names that would collide with the internal
        // "::"-delimited parameter-instance namespace (see
        // assertValidEntityName) — before any writes, same as the schema
        // check above.
        for (const serviceName of Object.keys(asRecord(compose.services))) {
          assertValidEntityName("Service", serviceName);
        }
        for (const volumeName of Object.keys(asRecord(compose.volumes))) {
          assertValidEntityName("Volume", volumeName);
        }
        for (const networkName of Object.keys(asRecord(compose.networks))) {
          assertValidEntityName("Network", networkName);
        }

        const timestamp = nowIso();
        const handles: { name: string }[] = [];

        // ---- services + per-service parameters ----
        const existingServicesList = (await context.readResource(
          SERVICES_LIST_INSTANCE,
        )) as { services: EntityRef[] } | null;
        const importedServices: EntityRef[] = [];

        const servicesBlock = asRecord(compose.services);
        for (
          const [serviceName, serviceDefRaw] of Object.entries(servicesBlock)
        ) {
          const serviceDef = asRecord(serviceDefRaw);
          const existingService = await context.readResource(
            serviceInstance(serviceName),
          ) as EntityRef | null;

          const service: EntityRef = {
            name: serviceName,
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
            if (key === RESERVED_PARAMETER_LIST_KEY) {
              context.logger.info(
                "Skipping reserved parameter key {key} on service {service} from {file}",
                { key, service: serviceName, file: filePath },
              );
              continue;
            }
            const { handle, parameter } = await writeServiceParameterRecord(
              context,
              serviceName,
              key,
              value as ParameterValue,
              timestamp,
            );
            handles.push(handle);
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

        // ---- volumes + per-volume parameters ----
        const existingVolumesList = (await context.readResource(
          VOLUMES_LIST_INSTANCE,
        )) as { items: EntityRef[] } | null;
        const importedVolumes: EntityRef[] = [];

        for (
          const [volumeName, optionsRaw] of Object.entries(
            asRecord(compose.volumes),
          )
        ) {
          const options = asRecord(optionsRaw);
          const existingVolume = await context.readResource(
            volumeInstance(volumeName),
          ) as EntityRef | null;

          const volume: EntityRef = {
            name: volumeName,
            createdAt: existingVolume?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource(
              "volume",
              volumeInstance(volumeName),
              volume,
            ),
          );
          importedVolumes.push(volume);

          const existingVolumeParamsList = (await context.readResource(
            volumeParametersListInstance(volumeName),
          )) as { volumeName: string; parameters: VolumeParameter[] } | null;
          const importedVolumeParams: VolumeParameter[] = [];

          for (const [key, value] of Object.entries(options)) {
            if (key === RESERVED_PARAMETER_LIST_KEY) {
              context.logger.info(
                "Skipping reserved parameter key {key} on volume {volume} from {file}",
                { key, volume: volumeName, file: filePath },
              );
              continue;
            }
            const { handle, parameter } = await writeVolumeParameterRecord(
              context,
              volumeName,
              key,
              value as ParameterValue,
              timestamp,
            );
            handles.push(handle);
            importedVolumeParams.push(parameter);
          }

          const mergedVolumeParams = mergeByKey(
            existingVolumeParamsList?.parameters ?? [],
            importedVolumeParams,
            (p) => p.key,
          );
          handles.push(
            await context.writeResource(
              "volumeParameters",
              volumeParametersListInstance(volumeName),
              { volumeName, parameters: mergedVolumeParams },
            ),
          );
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

        // ---- networks + per-network parameters ----
        const existingNetworksList = (await context.readResource(
          NETWORKS_LIST_INSTANCE,
        )) as { items: EntityRef[] } | null;
        const importedNetworks: EntityRef[] = [];

        for (
          const [networkName, optionsRaw] of Object.entries(
            asRecord(compose.networks),
          )
        ) {
          const options = asRecord(optionsRaw);
          const existingNetwork = await context.readResource(
            networkInstance(networkName),
          ) as EntityRef | null;

          const network: EntityRef = {
            name: networkName,
            createdAt: existingNetwork?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          handles.push(
            await context.writeResource(
              "network",
              networkInstance(networkName),
              network,
            ),
          );
          importedNetworks.push(network);

          const existingNetworkParamsList = (await context.readResource(
            networkParametersListInstance(networkName),
          )) as { networkName: string; parameters: NetworkParameter[] } | null;
          const importedNetworkParams: NetworkParameter[] = [];

          for (const [key, value] of Object.entries(options)) {
            if (key === RESERVED_PARAMETER_LIST_KEY) {
              context.logger.info(
                "Skipping reserved parameter key {key} on network {network} from {file}",
                { key, network: networkName, file: filePath },
              );
              continue;
            }
            const { handle, parameter } = await writeNetworkParameterRecord(
              context,
              networkName,
              key,
              value as ParameterValue,
              timestamp,
            );
            handles.push(handle);
            importedNetworkParams.push(parameter);
          }

          const mergedNetworkParams = mergeByKey(
            existingNetworkParamsList?.parameters ?? [],
            importedNetworkParams,
            (p) => p.key,
          );
          handles.push(
            await context.writeResource(
              "networkParameters",
              networkParametersListInstance(networkName),
              { networkName, parameters: mergedNetworkParams },
            ),
          );
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
          PROJECT_PARAMETERS_LIST_INSTANCE,
        )) as { parameters: ProjectParameter[] } | null;
        const importedParameters: ProjectParameter[] = [];

        for (const [key, value] of Object.entries(compose)) {
          if (structuralKeys.has(key)) continue;
          const { handle, parameter } = await writeProjectParameterRecord(
            context,
            key,
            value as ParameterValue,
            timestamp,
          );
          handles.push(handle);
          importedParameters.push(parameter);
        }

        const mergedParameters = mergeByKey(
          existingProjectParamsList?.parameters ?? [],
          importedParameters,
          (p) => p.key,
        );
        handles.push(
          await context.writeResource(
            "parameters",
            PROJECT_PARAMETERS_LIST_INSTANCE,
            { parameters: mergedParameters },
          ),
        );

        handles.push(await renderAndWriteComposeFile(context));

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
    // Render — the inverse of importFromFile. Every method below that
    // mutates project structure already calls renderAndWriteComposeFile
    // itself, so composeFile is always current; this method exists only
    // to force a fresh render with no other side effect (e.g. after
    // running updateSchema, to re-validate against a refreshed schema).
    // -----------------------------------------------------------------
    renderComposeFile: {
      description:
        "Force a fresh render of this project's current services, volumes, networks, and parameters into a valid compose.yaml document, storing it as the composeFile data attribute. Every mutating method already does this automatically after writing its own change — call this directly only to refresh composeFile with no other side effect (e.g. after updateSchema)",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Rendering compose file", {});
        const handle = await renderAndWriteComposeFile(context);
        context.logger.info("Rendered compose file", {});
        return { dataHandles: [handle] };
      },
    },

    // -----------------------------------------------------------------
    // Services — "create and link a child compose-service" is realized
    // by writing the service as a sub-resource of this project instance,
    // so ownership by exactly one project holds by construction. Every
    // compose field a service needs (image, ports, environment, ...) is
    // set afterwards via createServiceParameter/updateServiceParameter/
    // deleteServiceParameter — there is no separate "update" for the
    // service link itself since it has no mutable fields of its own.
    // -----------------------------------------------------------------
    createService: {
      description: "Create and link a new compose service to this project",
      arguments: z.object({
        name: z.string().min(1).describe("Service name"),
      }),
      execute: async (
        args: { name: string },
        context: {
          globalArgs: GlobalArgs;
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Creating service {name}", { name: args.name });

        assertValidEntityName("Service", args.name);
        const existing = await context.readResource(
          serviceInstance(args.name),
        );
        if (existing) {
          throw new Error(`Service '${args.name}' already exists`);
        }

        const timestamp = nowIso();
        const service: EntityRef = {
          name: args.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const serviceHandle = await context.writeResource(
          "service",
          serviceInstance(args.name),
          service,
        );

        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: EntityRef[] }
          | null;
        const services = [...(list?.services ?? []), service];
        const listHandle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Linked service {name} to project {project}", {
          name: args.name,
          project: context.globalArgs.projectName,
        });
        return { dataHandles: [serviceHandle, listHandle, composeFileHandle] };
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
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Deleting service {name}", { name: args.name });

        const list = (await context.readResource(SERVICES_LIST_INSTANCE)) as
          | { services: EntityRef[] }
          | null;
        const services = (list?.services ?? []).filter((s) =>
          s.name !== args.name
        );
        const handle = await context.writeResource(
          "services",
          SERVICES_LIST_INSTANCE,
          { services },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Unlinked service {name} from project {project}", {
          name: args.name,
          project: context.globalArgs.projectName,
        });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    // -----------------------------------------------------------------
    // Service-level configuration parameters (key/value, per service)
    // -----------------------------------------------------------------
    setServiceParameter: {
      description:
        "Create or update a configuration parameter on a service (upsert), validated against the active compose-spec schema",
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
          logger: Logger;
        },
      ) => {
        context.logger.info("Setting parameter {key} on service {service}", {
          key: args.key,
          service: args.serviceName,
        });

        assertValidParameterKey(args.key);
        const serviceExists = await context.readResource(
          serviceInstance(args.serviceName),
        );
        if (!serviceExists) {
          throw new Error(`Service '${args.serviceName}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, "service", args.key, args.value);

        const { handle: paramHandle, parameter } =
          await writeServiceParameterRecord(
            context,
            args.serviceName,
            args.key,
            args.value,
            nowIso(),
          );

        const listInstance = serviceParametersListInstance(args.serviceName);
        const list = (await context.readResource(listInstance)) as
          | { serviceName: string; parameters: ServiceParameter[] }
          | null;
        const parameters = mergeByKey(
          list?.parameters ?? [],
          [parameter],
          (p) => p.key,
        );
        const listHandle = await context.writeResource(
          "serviceParameters",
          listInstance,
          { serviceName: args.serviceName, parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Set parameter {key} on service {service}", {
          key: args.key,
          service: args.serviceName,
        });
        return { dataHandles: [paramHandle, listHandle, composeFileHandle] };
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
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info(
          "Deleting parameter {key} from service {service}",
          { key: args.key, service: args.serviceName },
        );

        assertValidParameterKey(args.key);

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

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Deleted parameter {key} from service {service}", {
          key: args.key,
          service: args.serviceName,
        });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    // -----------------------------------------------------------------
    // Volumes — same pattern as services: create/delete the link only,
    // every volume field (driver, driver_opts, external, labels, ...) is
    // set afterwards via createVolumeParameter/updateVolumeParameter/
    // deleteVolumeParameter.
    // -----------------------------------------------------------------
    createVolume: {
      description: "Create and link a new volume definition to this project",
      arguments: z.object({
        name: z.string().min(1).describe("Volume name"),
      }),
      execute: async (
        args: { name: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Creating volume {name}", { name: args.name });

        assertValidEntityName("Volume", args.name);
        const existing = await context.readResource(volumeInstance(args.name));
        if (existing) {
          throw new Error(`Volume '${args.name}' already exists`);
        }

        const timestamp = nowIso();
        const volume: EntityRef = {
          name: args.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const volumeHandle = await context.writeResource(
          "volume",
          volumeInstance(args.name),
          volume,
        );

        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: EntityRef[] }
          | null;
        const items = [...(list?.items ?? []), volume];
        const listHandle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Created volume {name}", { name: args.name });
        return { dataHandles: [volumeHandle, listHandle, composeFileHandle] };
      },
    },

    deleteVolume: {
      description: "Delete a volume definition",
      arguments: z.object({ name: z.string().describe("Volume name") }),
      execute: async (
        args: { name: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Deleting volume {name}", { name: args.name });

        const list = (await context.readResource(VOLUMES_LIST_INSTANCE)) as
          | { items: EntityRef[] }
          | null;
        const items = (list?.items ?? []).filter((v) => v.name !== args.name);
        const handle = await context.writeResource(
          "volumes",
          VOLUMES_LIST_INSTANCE,
          { items },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Deleted volume {name}", { name: args.name });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    setVolumeParameter: {
      description:
        "Create or update a configuration parameter on a volume (upsert), validated against the active compose-spec schema",
      arguments: z.object({
        volumeName: z.string().describe("Volume name"),
        key: z.string().min(1).describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "Parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { volumeName: string; key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Setting parameter {key} on volume {volume}", {
          key: args.key,
          volume: args.volumeName,
        });

        assertValidParameterKey(args.key);
        const volumeExists = await context.readResource(
          volumeInstance(args.volumeName),
        );
        if (!volumeExists) {
          throw new Error(`Volume '${args.volumeName}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, "volume", args.key, args.value);

        const { handle: paramHandle, parameter } =
          await writeVolumeParameterRecord(
            context,
            args.volumeName,
            args.key,
            args.value,
            nowIso(),
          );

        const listInstance = volumeParametersListInstance(args.volumeName);
        const list = (await context.readResource(listInstance)) as
          | { volumeName: string; parameters: VolumeParameter[] }
          | null;
        const parameters = mergeByKey(
          list?.parameters ?? [],
          [parameter],
          (p) => p.key,
        );
        const listHandle = await context.writeResource(
          "volumeParameters",
          listInstance,
          { volumeName: args.volumeName, parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Set parameter {key} on volume {volume}", {
          key: args.key,
          volume: args.volumeName,
        });
        return { dataHandles: [paramHandle, listHandle, composeFileHandle] };
      },
    },

    deleteVolumeParameter: {
      description: "Delete a volume configuration parameter",
      arguments: z.object({
        volumeName: z.string().describe("Volume name"),
        key: z.string().describe("Parameter key"),
      }),
      execute: async (
        args: { volumeName: string; key: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Deleting parameter {key} from volume {volume}", {
          key: args.key,
          volume: args.volumeName,
        });

        assertValidParameterKey(args.key);

        const listInstance = volumeParametersListInstance(args.volumeName);
        const list = (await context.readResource(listInstance)) as
          | { volumeName: string; parameters: VolumeParameter[] }
          | null;
        const parameters = (list?.parameters ?? []).filter((p) =>
          p.key !== args.key
        );
        const handle = await context.writeResource(
          "volumeParameters",
          listInstance,
          { volumeName: args.volumeName, parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Deleted parameter {key} from volume {volume}", {
          key: args.key,
          volume: args.volumeName,
        });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    // -----------------------------------------------------------------
    // Networks — same pattern as volumes.
    // -----------------------------------------------------------------
    createNetwork: {
      description: "Create and link a new network definition to this project",
      arguments: z.object({
        name: z.string().min(1).describe("Network name"),
      }),
      execute: async (
        args: { name: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Creating network {name}", { name: args.name });

        assertValidEntityName("Network", args.name);
        const existing = await context.readResource(
          networkInstance(args.name),
        );
        if (existing) {
          throw new Error(`Network '${args.name}' already exists`);
        }

        const timestamp = nowIso();
        const network: EntityRef = {
          name: args.name,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const networkHandle = await context.writeResource(
          "network",
          networkInstance(args.name),
          network,
        );

        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: EntityRef[] }
          | null;
        const items = [...(list?.items ?? []), network];
        const listHandle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Created network {name}", { name: args.name });
        return {
          dataHandles: [networkHandle, listHandle, composeFileHandle],
        };
      },
    },

    deleteNetwork: {
      description: "Delete a network definition",
      arguments: z.object({ name: z.string().describe("Network name") }),
      execute: async (
        args: { name: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Deleting network {name}", { name: args.name });

        const list = (await context.readResource(NETWORKS_LIST_INSTANCE)) as
          | { items: EntityRef[] }
          | null;
        const items = (list?.items ?? []).filter((n) => n.name !== args.name);
        const handle = await context.writeResource(
          "networks",
          NETWORKS_LIST_INSTANCE,
          { items },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Deleted network {name}", { name: args.name });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    setNetworkParameter: {
      description:
        "Create or update a configuration parameter on a network (upsert), validated against the active compose-spec schema",
      arguments: z.object({
        networkName: z.string().describe("Network name"),
        key: z.string().min(1).describe("Parameter key"),
        value: ParameterValueSchema.describe(
          "Parameter value (string, number, boolean, null, JSON object, or JSON array)",
        ),
      }),
      execute: async (
        args: { networkName: string; key: string; value: ParameterValue },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Setting parameter {key} on network {network}", {
          key: args.key,
          network: args.networkName,
        });

        assertValidParameterKey(args.key);
        const networkExists = await context.readResource(
          networkInstance(args.networkName),
        );
        if (!networkExists) {
          throw new Error(`Network '${args.networkName}' not found`);
        }

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, "network", args.key, args.value);

        const { handle: paramHandle, parameter } =
          await writeNetworkParameterRecord(
            context,
            args.networkName,
            args.key,
            args.value,
            nowIso(),
          );

        const listInstance = networkParametersListInstance(
          args.networkName,
        );
        const list = (await context.readResource(listInstance)) as
          | { networkName: string; parameters: NetworkParameter[] }
          | null;
        const parameters = mergeByKey(
          list?.parameters ?? [],
          [parameter],
          (p) => p.key,
        );
        const listHandle = await context.writeResource(
          "networkParameters",
          listInstance,
          { networkName: args.networkName, parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Set parameter {key} on network {network}", {
          key: args.key,
          network: args.networkName,
        });
        return { dataHandles: [paramHandle, listHandle, composeFileHandle] };
      },
    },

    deleteNetworkParameter: {
      description: "Delete a network configuration parameter",
      arguments: z.object({
        networkName: z.string().describe("Network name"),
        key: z.string().describe("Parameter key"),
      }),
      execute: async (
        args: { networkName: string; key: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info(
          "Deleting parameter {key} from network {network}",
          { key: args.key, network: args.networkName },
        );

        assertValidParameterKey(args.key);

        const listInstance = networkParametersListInstance(
          args.networkName,
        );
        const list = (await context.readResource(listInstance)) as
          | { networkName: string; parameters: NetworkParameter[] }
          | null;
        const parameters = (list?.parameters ?? []).filter((p) =>
          p.key !== args.key
        );
        const handle = await context.writeResource(
          "networkParameters",
          listInstance,
          { networkName: args.networkName, parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info(
          "Deleted parameter {key} from network {network}",
          { key: args.key, network: args.networkName },
        );
        return { dataHandles: [handle, composeFileHandle] };
      },
    },

    // -----------------------------------------------------------------
    // Project-level configuration parameters (key/value)
    // -----------------------------------------------------------------
    setProjectParameter: {
      description:
        "Create or update a project-level configuration parameter (upsert), validated against the active compose-spec schema",
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
          logger: Logger;
        },
      ) => {
        context.logger.info("Setting project parameter {key}", {
          key: args.key,
        });

        const activeSchema = await getActiveComposeSchema(context);
        validateField(activeSchema, null, args.key, args.value);

        const { handle: paramHandle, parameter } =
          await writeProjectParameterRecord(
            context,
            args.key,
            args.value,
            nowIso(),
          );

        const list = (await context.readResource(
          PROJECT_PARAMETERS_LIST_INSTANCE,
        )) as
          | { parameters: ProjectParameter[] }
          | null;
        const parameters = mergeByKey(
          list?.parameters ?? [],
          [parameter],
          (p) => p.key,
        );
        const listHandle = await context.writeResource(
          "parameters",
          PROJECT_PARAMETERS_LIST_INSTANCE,
          { parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Set project parameter {key}", { key: args.key });
        return { dataHandles: [paramHandle, listHandle, composeFileHandle] };
      },
    },

    deleteProjectParameter: {
      description: "Delete a project-level configuration parameter",
      arguments: z.object({ key: z.string().describe("Parameter key") }),
      execute: async (
        args: { key: string },
        context: {
          writeResource: WriteResource;
          readResource: ReadResource;
          extensionFile: (path: string) => string;
          logger: Logger;
        },
      ) => {
        context.logger.info("Deleting project parameter {key}", {
          key: args.key,
        });

        const list = (await context.readResource(
          PROJECT_PARAMETERS_LIST_INSTANCE,
        )) as
          | { parameters: ProjectParameter[] }
          | null;
        const parameters = (list?.parameters ?? []).filter((p) =>
          p.key !== args.key
        );
        const handle = await context.writeResource(
          "parameters",
          PROJECT_PARAMETERS_LIST_INSTANCE,
          { parameters },
        );

        const composeFileHandle = await renderAndWriteComposeFile(context);

        context.logger.info("Deleted project parameter {key}", {
          key: args.key,
        });
        return { dataHandles: [handle, composeFileHandle] };
      },
    },
  },
};
