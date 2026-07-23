/**
 * Unit tests for the compose-project model.
 *
 * @module
 */
import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import {
  createModelTestContext,
  withMockedFetch,
} from "@systeminit/swamp-testing";
import { model } from "./compose_project.ts";

const GLOBAL_ARGS = { projectName: "test-stack" };

type StoredResources = Record<string, Record<string, unknown>>;

// The `execute` signatures below type their `context` parameter with
// `extensionFile`, but the swamp-testing package's MethodContext doesn't
// implement it — all our tests seed a cached `active` compose-spec resource
// so the code path that calls `extensionFile` (bundled-schema fallback) is
// never actually exercised at runtime. Stub it as an identity function
// (paths resolve relative to this file's cwd, matching real repo-relative
// resolution) purely to satisfy the type.
function modelTestContext(
  options?: Parameters<typeof createModelTestContext>[0],
) {
  const result = createModelTestContext(options);
  return {
    ...result,
    context: {
      ...result.context,
      extensionFile: (path: string) => path,
    },
  };
}

// Minimal compose-spec-shaped schema fixture — just enough surface (service
// image/ports/restart, volume driver/external, network driver, project
// version) to exercise validateField/validateDocument without depending on
// the real bundled compose-spec.json or network access.
// Mirrors the real compose-spec.default.json's structure closely enough to
// exercise whole-document validation faithfully: each of services/volumes/
// networks routes its entries through patternProperties into the matching
// $defs entry (with additionalProperties: false), the same shape the real
// schema uses, rather than a bare `{"type": "object"}` that would let
// invalid nested fields through validateDocument unnoticed.
const SCHEMA_FIXTURE = {
  "$id": "compose-spec-test",
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "services": {
      "type": "object",
      "patternProperties": {
        "^[a-zA-Z0-9._-]+$": { "$ref": "#/$defs/service" },
      },
      "additionalProperties": false,
    },
    "volumes": {
      "type": "object",
      "patternProperties": {
        "^[a-zA-Z0-9._-]+$": { "$ref": "#/$defs/volume" },
      },
      "additionalProperties": false,
    },
    "networks": {
      "type": "object",
      "patternProperties": {
        "^[a-zA-Z0-9._-]+$": { "$ref": "#/$defs/network" },
      },
      "additionalProperties": false,
    },
  },
  "$defs": {
    "service": {
      "type": "object",
      "properties": {
        "image": { "type": "string" },
        "ports": { "type": "array", "items": { "type": "string" } },
        "restart": { "type": "string" },
      },
      "patternProperties": { "^x-": {} },
      "additionalProperties": false,
    },
    "volume": {
      "type": "object",
      "properties": {
        "driver": { "type": "string" },
        "external": { "type": "boolean" },
      },
      "patternProperties": { "^x-": {} },
      "additionalProperties": false,
    },
    "network": {
      "type": "object",
      "properties": {
        "driver": { "type": "string" },
      },
      "patternProperties": { "^x-": {} },
      "additionalProperties": false,
    },
  },
};

function mustFind<T extends { specName: string }>(
  items: T[],
  specName: string,
): T {
  const found = items.find((r) => r.specName === specName);
  if (!found) throw new Error(`expected a write to spec '${specName}'`);
  return found;
}

function schemaResource(): StoredResources {
  return {
    "active": {
      schema: SCHEMA_FIXTURE,
      source: "test-fixture",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function withService(
  name: string,
  extra: StoredResources = {},
): StoredResources {
  return {
    [`service-${name}`]: {
      name,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    },
    ...extra,
  };
}

function withVolume(
  name: string,
  extra: StoredResources = {},
): StoredResources {
  return {
    [`volume-${name}`]: {
      name,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    },
    ...extra,
  };
}

function withNetwork(
  name: string,
  extra: StoredResources = {},
): StoredResources {
  return {
    [`network-${name}`]: {
      name,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    },
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// setServiceParameter — upsert (replaces createServiceParameter/
// updateServiceParameter)
// ---------------------------------------------------------------------------

Deno.test("setServiceParameter: creates a new parameter when absent", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withService("web") },
  });

  await model.methods.setServiceParameter.execute(
    { serviceName: "web", key: "image", value: "nginx" },
    context,
  );

  const param = getWrittenResources().find((r) =>
    r.specName === "serviceParameter"
  );
  assertEquals(param?.data.value, "nginx");
  assertEquals(param?.data.createdAt, param?.data.updatedAt);
});

Deno.test("setServiceParameter: updates in place, preserving createdAt", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: {
      ...schemaResource(),
      ...withService("web"),
      "service-web::image": {
        serviceName: "web",
        key: "image",
        value: "nginx:1.24",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    },
  });

  await model.methods.setServiceParameter.execute(
    { serviceName: "web", key: "image", value: "nginx:1.25" },
    context,
  );

  const param = getWrittenResources().find((r) =>
    r.specName === "serviceParameter"
  );
  assertEquals(param?.data.value, "nginx:1.25");
  assertEquals(param?.data.createdAt, "2020-01-01T00:00:00.000Z");
  assertNotEquals(param?.data.updatedAt, "2020-01-01T00:00:00.000Z");
});

Deno.test("setServiceParameter: throws when the service doesn't exist", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource() },
  });

  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      { serviceName: "ghost", key: "image", value: "nginx" },
      context,
    )
  );
});

Deno.test("setServiceParameter: throws on a value that fails compose-spec validation", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withService("web") },
  });

  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      // schema declares ports as an array — a bare string must fail
      { serviceName: "web", key: "ports", value: "8080:80" },
      context,
    )
  );
});

Deno.test("setServiceParameter: rejects the reserved parameter-list key", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withService("web") },
  });

  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      { serviceName: "web", key: "__params__", value: "x" },
      context,
    )
  );
});

Deno.test("setServiceParameter: rejects a field the active schema doesn't recognize", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withService("web") },
  });

  // "environment" isn't one of the fields SCHEMA_FIXTURE's service def
  // declares — an unrecognized field is rejected outright (it is not
  // passed through), so a field newer than the active schema snapshot
  // requires updateSchema before it can be set.
  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      { serviceName: "web", key: "environment", value: { FOO: "bar" } },
      context,
    )
  );
});

Deno.test("setServiceParameter: validates the whole document before writing, so a stale unrelated field blocks the write instead of partially applying it", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: {
      ...schemaResource(),
      ...withService("web"),
      // buildComposeDocument only looks at a service's parameters if that
      // service appears in the top-level "services" list resource.
      "services": { services: [{ name: "web", ...withService("web")["service-web"] }] },
      // Simulates a value that's stale relative to the active schema —
      // e.g. it satisfied an earlier compose-spec revision's type for
      // "ports" before updateSchema refreshed the cache to the current
      // one, which (per SCHEMA_FIXTURE) requires an array.
      "service-web::__params__": {
        serviceName: "web",
        parameters: [{
          serviceName: "web",
          key: "ports",
          value: "8080:80",
          createdAt: "2019-01-01T00:00:00.000Z",
          updatedAt: "2019-01-01T00:00:00.000Z",
        }],
      },
    },
  });

  // Setting a perfectly valid, unrelated field still fails, because
  // re-rendering the whole document surfaces the stale "ports" value.
  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      { serviceName: "web", key: "restart", value: "always" },
      context,
    )
  );

  // Critically, that failure must happen *before* any write — "restart"
  // must not end up persisted just because the final render step is what
  // rejected the overall call.
  assertEquals(getWrittenResources().length, 0);
});

// ---------------------------------------------------------------------------
// setVolumeParameter / setNetworkParameter / setProjectParameter — same
// upsert contract, abbreviated coverage (schema-validation and reserved-key
// paths are shared code already covered above).
// ---------------------------------------------------------------------------

Deno.test("setVolumeParameter: creates then updates, preserving createdAt", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withVolume("db-data") },
  });

  await model.methods.setVolumeParameter.execute(
    { volumeName: "db-data", key: "driver", value: "local" },
    context,
  );
  const created = mustFind(getWrittenResources(), "volumeParameter");
  assertEquals(created.data.createdAt, created.data.updatedAt);

  const { context: context2, getWrittenResources: written2 } = modelTestContext(
    {
      globalArgs: GLOBAL_ARGS,
      storedResources: {
        ...schemaResource(),
        ...withVolume("db-data"),
        "volume-db-data::driver": created.data,
      },
    },
  );
  await model.methods.setVolumeParameter.execute(
    { volumeName: "db-data", key: "driver", value: "nfs" },
    context2,
  );
  const updated = mustFind(written2(), "volumeParameter");
  assertEquals(updated.data.value, "nfs");
  assertEquals(updated.data.createdAt, created.data.createdAt);
});

Deno.test("setNetworkParameter: creates then updates, preserving createdAt", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource(), ...withNetwork("backend") },
  });

  await model.methods.setNetworkParameter.execute(
    { networkName: "backend", key: "driver", value: "bridge" },
    context,
  );
  const created = mustFind(getWrittenResources(), "networkParameter");
  assertEquals(created.data.createdAt, created.data.updatedAt);

  const { context: context2, getWrittenResources: written2 } = modelTestContext(
    {
      globalArgs: GLOBAL_ARGS,
      storedResources: {
        ...schemaResource(),
        ...withNetwork("backend"),
        "network-backend::driver": created.data,
      },
    },
  );
  await model.methods.setNetworkParameter.execute(
    { networkName: "backend", key: "driver", value: "overlay" },
    context2,
  );
  const updated = mustFind(written2(), "networkParameter");
  assertEquals(updated.data.value, "overlay");
  assertEquals(updated.data.createdAt, created.data.createdAt);
});

Deno.test("setProjectParameter: creates then updates, preserving createdAt", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource() },
  });

  await model.methods.setProjectParameter.execute(
    { key: "version", value: "3.9" },
    context,
  );
  const created = mustFind(getWrittenResources(), "parameter");
  assertEquals(created.data.createdAt, created.data.updatedAt);

  const { context: context2, getWrittenResources: written2 } = modelTestContext(
    {
      globalArgs: GLOBAL_ARGS,
      storedResources: {
        ...schemaResource(),
        "param-version": created.data,
      },
    },
  );
  await model.methods.setProjectParameter.execute(
    { key: "version", value: "3.10" },
    context2,
  );
  const updated = mustFind(written2(), "parameter");
  assertEquals(updated.data.value, "3.10");
  assertEquals(updated.data.createdAt, created.data.createdAt);
});

// ---------------------------------------------------------------------------
// Delete idempotency — deletes must succeed as a no-op when the target is
// already gone, never throw.
// ---------------------------------------------------------------------------

Deno.test("deleteService: succeeds when the service doesn't exist", async () => {
  const { context } = modelTestContext({ globalArgs: GLOBAL_ARGS });
  // deno-lint-ignore no-explicit-any
  await model.methods.deleteService.execute({ name: "ghost" }, context as any);
});

Deno.test("deleteVolume: succeeds when the volume doesn't exist", async () => {
  const { context } = modelTestContext({ globalArgs: GLOBAL_ARGS });
  await model.methods.deleteVolume.execute({ name: "ghost" }, context);
});

Deno.test("deleteNetwork: succeeds when the network doesn't exist", async () => {
  const { context } = modelTestContext({ globalArgs: GLOBAL_ARGS });
  await model.methods.deleteNetwork.execute({ name: "ghost" }, context);
});

Deno.test("deleteServiceParameter: succeeds when the parameter doesn't exist", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withService("web") },
  });
  await model.methods.deleteServiceParameter.execute(
    { serviceName: "web", key: "ghost" },
    context,
  );
});

Deno.test("deleteVolumeParameter: succeeds when the parameter doesn't exist", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withVolume("db-data") },
  });
  await model.methods.deleteVolumeParameter.execute(
    { volumeName: "db-data", key: "ghost" },
    context,
  );
});

Deno.test("deleteNetworkParameter: succeeds when the parameter doesn't exist", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withNetwork("backend") },
  });
  await model.methods.deleteNetworkParameter.execute(
    { networkName: "backend", key: "ghost" },
    context,
  );
});

Deno.test("deleteProjectParameter: succeeds when the parameter doesn't exist", async () => {
  const { context } = modelTestContext({ globalArgs: GLOBAL_ARGS });
  await model.methods.deleteProjectParameter.execute(
    { key: "ghost" },
    context,
  );
});

Deno.test("deleteServiceParameter: removes the parameter when present", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: {
      ...withService("web"),
      "service-web::__params__": {
        serviceName: "web",
        parameters: [{
          serviceName: "web",
          key: "image",
          value: "nginx",
          createdAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
        }],
      },
    },
  });

  await model.methods.deleteServiceParameter.execute(
    { serviceName: "web", key: "image" },
    context,
  );

  const list = getWrittenResources().find((r) =>
    r.specName === "serviceParameters"
  );
  assertEquals(list?.data.parameters, []);
});

// ---------------------------------------------------------------------------
// Entity-link creates stay strict — regression lock, not new behavior.
// ---------------------------------------------------------------------------

Deno.test("createService: still throws when the service already exists", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withService("web") },
  });
  await assertRejects(() =>
    // deno-lint-ignore no-explicit-any
    model.methods.createService.execute({ name: "web" }, context as any)
  );
});

Deno.test("createVolume: still throws when the volume already exists", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withVolume("db-data") },
  });
  await assertRejects(() =>
    model.methods.createVolume.execute({ name: "db-data" }, context)
  );
});

Deno.test("createNetwork: still throws when the network already exists", async () => {
  const { context } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withNetwork("backend") },
  });
  await assertRejects(() =>
    model.methods.createNetwork.execute({ name: "backend" }, context)
  );
});

// ---------------------------------------------------------------------------
// Instance-name collision proofing — service-${name}, volume-${name}, and
// network-${name} share a storage namespace with their own
// service-${name}::__params__ / service-${name}::${key} sub-instances. A
// name containing "::" can be crafted to collide with another entity's
// parameter-list or parameter instance (e.g. a service literally named
// "web::__params__" collides with the parameter list of a service named
// "web"), silently overwriting the wrong resource. Names must reject "::".
// ---------------------------------------------------------------------------

Deno.test("createService: rejects a name containing '::'", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
  });
  await assertRejects(() =>
    model.methods.createService.execute(
      { name: "web::__params__" },
      // deno-lint-ignore no-explicit-any
      context as any,
    )
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("createVolume: rejects a name containing '::'", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
  });
  await assertRejects(() =>
    model.methods.createVolume.execute(
      { name: "db::__params__" },
      context,
    )
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("createNetwork: rejects a name containing '::'", async () => {
  const { context, getWrittenResources } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
  });
  await assertRejects(() =>
    model.methods.createNetwork.execute(
      { name: "backend::__params__" },
      context,
    )
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("importFromFile: rejects a service name containing '::' before writing anything", async () => {
  const tmpDir = await Deno.makeTempDir();
  const composePath = `${tmpDir}/docker-compose.yml`;
  await Deno.writeTextFile(
    composePath,
    `
services:
  "web::__params__":
    image: nginx
`,
  );

  try {
    const { context, getWrittenResources } = modelTestContext({
      globalArgs: GLOBAL_ARGS,
      repoDir: tmpDir,
      storedResources: { ...schemaResource() },
    });

    await assertRejects(() =>
      model.methods.importFromFile.execute({ path: composePath }, context)
    );
    assertEquals(getWrittenResources().length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// importFromFile — must call the same upsert primitive as setServiceParameter
// et al. rather than reimplementing it, and must render composeFile once per
// call regardless of how many services/parameters were imported.
// ---------------------------------------------------------------------------

const SAMPLE_COMPOSE = `
version: "3.9"
services:
  web:
    image: nginx
    ports:
      - "8080:80"
    restart: always
  api:
    image: myorg/api
volumes:
  db-data:
    driver: local
networks:
  backend:
    driver: bridge
`;

Deno.test("importFromFile: renders composeFile exactly once regardless of import size", async () => {
  const tmpDir = await Deno.makeTempDir();
  const composePath = `${tmpDir}/docker-compose.yml`;
  await Deno.writeTextFile(composePath, SAMPLE_COMPOSE);

  try {
    const { context, getWrittenResources } = modelTestContext({
      globalArgs: GLOBAL_ARGS,
      repoDir: tmpDir,
      storedResources: { ...schemaResource() },
    });

    await model.methods.importFromFile.execute(
      { path: composePath },
      context,
    );

    const composeFileWrites = getWrittenResources().filter((r) =>
      r.specName === "composeFile"
    );
    assertEquals(composeFileWrites.length, 1);

    const serviceParamWrites = getWrittenResources().filter((r) =>
      r.specName === "serviceParameter"
    );
    // web: image, ports, restart (3) + api: image (1) = 4
    assertEquals(serviceParamWrites.length, 4);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("importFromFile: re-importing preserves createdAt on unchanged parameters", async () => {
  const tmpDir = await Deno.makeTempDir();
  const composePath = `${tmpDir}/docker-compose.yml`;
  await Deno.writeTextFile(composePath, SAMPLE_COMPOSE);

  try {
    const { context, getWrittenResources } = modelTestContext({
      globalArgs: GLOBAL_ARGS,
      repoDir: tmpDir,
      storedResources: {
        ...schemaResource(),
        ...withService("web"),
        "service-web::image": {
          serviceName: "web",
          key: "image",
          value: "nginx",
          createdAt: "2019-01-01T00:00:00.000Z",
          updatedAt: "2019-01-01T00:00:00.000Z",
        },
      },
    });

    await model.methods.importFromFile.execute(
      { path: composePath },
      context,
    );

    const imageParam = getWrittenResources().find((r) =>
      r.specName === "serviceParameter" && r.data.key === "image" &&
      r.data.serviceName === "web"
    );
    assertEquals(imageParam?.data.createdAt, "2019-01-01T00:00:00.000Z");
    assertNotEquals(imageParam?.data.updatedAt, "2019-01-01T00:00:00.000Z");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Logging coverage — every mutating method must log at info level on entry
// (what it's about to do) and on completion (what it did), per the swamp
// extension logging-quality dimension. Entry logging must happen even when
// the method goes on to throw, so operators can see what was attempted.
// ---------------------------------------------------------------------------

Deno.test("setServiceParameter: logs on entry even when it later throws", async () => {
  const { context, getLogsByLevel } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...schemaResource() },
  });
  await assertRejects(() =>
    model.methods.setServiceParameter.execute(
      { serviceName: "ghost", key: "image", value: "nginx" },
      context,
    )
  );
  assertEquals(getLogsByLevel("info").length >= 1, true);
});

Deno.test("createService: logs on entry even when it later throws", async () => {
  const { context, getLogsByLevel } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: { ...withService("web") },
  });
  await assertRejects(() =>
    // deno-lint-ignore no-explicit-any
    model.methods.createService.execute({ name: "web" }, context as any)
  );
  assertEquals(getLogsByLevel("info").length >= 1, true);
});

Deno.test("updateSchema: logs entry and completion", async () => {
  const { context, getLogsByLevel } = modelTestContext({
    globalArgs: GLOBAL_ARGS,
  });
  await withMockedFetch(
    [
      Response.json({
        "$id": "compose-spec-test",
        "type": "object",
        "properties": {},
      }),
    ],
    () => model.methods.updateSchema.execute({}, context),
  );
  assertEquals(getLogsByLevel("info").length >= 2, true);
});

Deno.test("importFromFile: logs entry and completion", async () => {
  const tmpDir = await Deno.makeTempDir();
  const composePath = `${tmpDir}/docker-compose.yml`;
  await Deno.writeTextFile(composePath, SAMPLE_COMPOSE);

  try {
    const { context, getLogsByLevel } = modelTestContext({
      globalArgs: GLOBAL_ARGS,
      repoDir: tmpDir,
      storedResources: { ...schemaResource() },
    });
    await model.methods.importFromFile.execute({ path: composePath }, context);
    assertEquals(getLogsByLevel("info").length >= 2, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

type LoggingCoverageCase = {
  method: string;
  args: Record<string, unknown>;
  storedResources?: StoredResources;
};

const LOGGING_COVERAGE_CASES: LoggingCoverageCase[] = [
  { method: "createService", args: { name: "web" } },
  { method: "deleteService", args: { name: "web" } },
  {
    method: "setServiceParameter",
    args: { serviceName: "web", key: "image", value: "nginx" },
    storedResources: { ...schemaResource(), ...withService("web") },
  },
  {
    method: "deleteServiceParameter",
    args: { serviceName: "web", key: "image" },
  },
  { method: "createVolume", args: { name: "db-data" } },
  { method: "deleteVolume", args: { name: "db-data" } },
  {
    method: "setVolumeParameter",
    args: { volumeName: "db-data", key: "driver", value: "local" },
    storedResources: { ...schemaResource(), ...withVolume("db-data") },
  },
  {
    method: "deleteVolumeParameter",
    args: { volumeName: "db-data", key: "driver" },
  },
  { method: "createNetwork", args: { name: "backend" } },
  { method: "deleteNetwork", args: { name: "backend" } },
  {
    method: "setNetworkParameter",
    args: { networkName: "backend", key: "driver", value: "bridge" },
    storedResources: { ...schemaResource(), ...withNetwork("backend") },
  },
  {
    method: "deleteNetworkParameter",
    args: { networkName: "backend", key: "driver" },
  },
  {
    method: "setProjectParameter",
    args: { key: "version", value: "3.9" },
    storedResources: schemaResource(),
  },
  { method: "deleteProjectParameter", args: { key: "version" } },
  { method: "renderComposeFile", args: {} },
];

Deno.test("every mutating method logs both an entry and a completion message", async () => {
  for (const { method, args, storedResources } of LOGGING_COVERAGE_CASES) {
    const { context, getLogsByLevel } = modelTestContext({
      globalArgs: GLOBAL_ARGS,
      storedResources,
    });
    const methods = model.methods as unknown as Record<
      string,
      { execute: (a: Record<string, unknown>, c: unknown) => Promise<unknown> }
    >;
    await methods[method].execute(args, context);
    const infoLogs = getLogsByLevel("info");
    if (infoLogs.length < 2) {
      throw new Error(
        `${method}: expected at least 2 info logs (entry + completion), got ${infoLogs.length}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

Deno.test("valid-project-name check: passes for a valid project name", async () => {
  const result = await model.checks["valid-project-name"].execute(
    // deno-lint-ignore no-explicit-any
    { globalArgs: { projectName: "my-stack_1" } } as any,
  );
  assertEquals(result.pass, true);
});

Deno.test("valid-project-name check: fails on uppercase characters", async () => {
  const result = await model.checks["valid-project-name"].execute(
    // deno-lint-ignore no-explicit-any
    { globalArgs: { projectName: "MyStack" } } as any,
  );
  assertEquals(result.pass, false);
});

Deno.test("valid-project-name check: fails when it starts with a dash", async () => {
  const result = await model.checks["valid-project-name"].execute(
    // deno-lint-ignore no-explicit-any
    { globalArgs: { projectName: "-my-stack" } } as any,
  );
  assertEquals(result.pass, false);
});

Deno.test("compose-spec-reachable check: passes when the host responds ok", async () => {
  const { result } = await withMockedFetch(
    [new Response(null, { status: 200 })],
    () =>
      model.checks["compose-spec-reachable"].execute(
        // deno-lint-ignore no-explicit-any
        {} as any,
      ),
  );
  assertEquals(result.pass, true);
});

Deno.test("compose-spec-reachable check: fails when the host errors", async () => {
  const { result } = await withMockedFetch(
    [new Response(null, { status: 503 })],
    () =>
      model.checks["compose-spec-reachable"].execute(
        // deno-lint-ignore no-explicit-any
        {} as any,
      ),
  );
  assertEquals(result.pass, false);
});

Deno.test("compose-spec-reachable check: fails when fetch throws (offline)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network unreachable"));
  try {
    const result = await model.checks["compose-spec-reachable"].execute(
      // deno-lint-ignore no-explicit-any
      {} as any,
    );
    assertEquals(result.pass, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
