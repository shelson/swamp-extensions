// extensions/models/catalog_test.ts
import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1.0.19";
import {
  createModelTestContext,
  type ModelTestContextOptions,
} from "jsr:@swamp-club/swamp-testing@0.20260706.24";
import { model } from "./catalog.ts";

/**
 * createModelTestContext() fakes the extension-author-facing MethodContext
 * subset (writeResource/readResource/createFileWriter/logger), which does not
 * include `deleteResource` or `dataRepository` — both of which this model
 * uses (deleteResource for removeHost/removeGroup, dataRepository.findAllForModel
 * for listing hosts). This wrapper adds minimal in-memory fakes for both so the
 * full method surface is testable.
 */
interface CatalogTestContextOptions extends ModelTestContextOptions {
  /** Host instance names (e.g. "host-web-01") to expose via dataRepository.findAllForModel. */
  hostInstances?: string[];
}

function createCatalogTestContext(options: CatalogTestContextOptions = {}) {
  const { hostInstances = [], ...rest } = options;
  const base = createModelTestContext(rest);
  const deletedResources: string[] = [];

  const context = {
    ...base.context,
    modelType: "@shelson/catalog",
    modelId: "test-catalog",
    deleteResource: (instanceName: string) => {
      deletedResources.push(instanceName);
      return Promise.resolve();
    },
    dataRepository: {
      findAllForModel: (_type: string, _modelId: string) =>
        Promise.resolve(
          hostInstances.map((name) => ({ name, tags: { specName: "host" } })),
        ),
    },
  };

  return {
    ...base,
    context,
    getDeletedResources: () => [...deletedResources],
  };
}

function writesFor(
  written: ReturnType<
    ReturnType<typeof createCatalogTestContext>["getWrittenResources"]
  >,
  specName: string,
) {
  return written.filter((w) => w.specName === specName);
}

// --- addHost ---------------------------------------------------------------

Deno.test("addHost creates a host and resolves it", async () => {
  const { context, getWrittenResources } = createCatalogTestContext();

  const result = await model.methods.addHost.execute(
    { name: "web-01", idempotent: false },
    context,
  );

  const written = getWrittenResources();
  assertEquals(writesFor(written, "host")[0].data, {
    name: "web-01",
    groups: [],
    metadata: {},
  });
  assertEquals(writesFor(written, "resolved")[0].data.host, "web-01");
  assertEquals(writesFor(written, "resolved")[0].data.metadata, {});
  assertEquals(result.dataHandles?.length, 2);
});

Deno.test("addHost throws when the host already exists", async () => {
  const { context } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  await assertRejects(
    () =>
      model.methods.addHost.execute(
        { name: "web-01", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" already exists',
  );
});

Deno.test("addHost no-ops when idempotent and the host already exists", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  const result = await model.methods.addHost.execute(
    { name: "web-01", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getWrittenResources().length, 0);
});

// --- removeHost --------------------------------------------------------------

Deno.test("removeHost deletes the host and its resolved entry", async () => {
  const { context, getDeletedResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  const result = await model.methods.removeHost.execute(
    { name: "web-01", idempotent: false },
    context,
  );

  assertEquals(result, {});
  assertEquals(
    getDeletedResources().sort(),
    ["host-web-01", "resolved-web-01"].sort(),
  );
});

Deno.test("removeHost throws when the host does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.removeHost.execute(
        { name: "web-01", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" not found',
  );
});

Deno.test("removeHost no-ops when idempotent and the host is absent", async () => {
  const { context, getDeletedResources } = createCatalogTestContext();

  const result = await model.methods.removeHost.execute(
    { name: "web-01", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getDeletedResources().length, 0);
});

// --- addGroup ----------------------------------------------------------------

Deno.test("addGroup creates a group", async () => {
  const { context, getWrittenResources } = createCatalogTestContext();

  const result = await model.methods.addGroup.execute(
    { name: "prod", idempotent: false },
    context,
  );

  assertEquals(getWrittenResources()[0].data, { name: "prod", metadata: {} });
  assertEquals(result.dataHandles?.length, 1);
});

Deno.test("addGroup throws when the group already exists", async () => {
  const { context } = createCatalogTestContext({
    storedResources: { "group-prod": { name: "prod", metadata: {} } },
  });

  await assertRejects(
    () =>
      model.methods.addGroup.execute(
        { name: "prod", idempotent: false },
        context,
      ),
    Error,
    'Group "prod" already exists',
  );
});

Deno.test("addGroup no-ops when idempotent and the group already exists", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: { "group-prod": { name: "prod", metadata: {} } },
  });

  const result = await model.methods.addGroup.execute(
    { name: "prod", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getWrittenResources().length, 0);
});

// --- removeGroup ---------------------------------------------------------------

Deno.test("removeGroup deletes the group and scrubs membership from affected hosts", async () => {
  const { context, getWrittenResources, getDeletedResources } =
    createCatalogTestContext({
      hostInstances: ["host-web-01", "host-web-02"],
      storedResources: {
        "group-prod": { name: "prod", metadata: { tier: "critical" } },
        "host-web-01": {
          name: "web-01",
          groups: ["prod", "linux"],
          metadata: {},
        },
        "host-web-02": { name: "web-02", groups: ["linux"], metadata: {} },
      },
    });

  await model.methods.removeGroup.execute(
    { name: "prod", idempotent: false },
    context,
  );

  assertEquals(getDeletedResources(), ["group-prod"]);
  const hostWrites = writesFor(getWrittenResources(), "host");
  assertEquals(hostWrites.length, 1);
  assertEquals(hostWrites[0].name, "host-web-01");
  assertEquals(hostWrites[0].data.groups, ["linux"]);
  const resolvedWrites = writesFor(getWrittenResources(), "resolved");
  assertEquals(resolvedWrites.length, 1);
  assertEquals(resolvedWrites[0].name, "resolved-web-01");
});

Deno.test("removeGroup throws when the group does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.removeGroup.execute(
        { name: "prod", idempotent: false },
        context,
      ),
    Error,
    'Group "prod" not found',
  );
});

Deno.test("removeGroup no-ops when idempotent and the group is absent", async () => {
  const { context, getDeletedResources } = createCatalogTestContext();

  const result = await model.methods.removeGroup.execute(
    { name: "prod", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getDeletedResources().length, 0);
});

// --- addHostToGroup --------------------------------------------------------

Deno.test("addHostToGroup adds the group to the host and resolves merged metadata", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
      "group-prod": { name: "prod", metadata: { tier: "critical" } },
    },
  });

  await model.methods.addHostToGroup.execute(
    { host: "web-01", group: "prod", idempotent: false },
    context,
  );

  const hostWrite = writesFor(getWrittenResources(), "host")[0];
  assertEquals(hostWrite.data.groups, ["prod"]);
  const resolvedWrite = writesFor(getWrittenResources(), "resolved")[0];
  assertEquals(resolvedWrite.data.metadata, { tier: "critical" });
});

Deno.test("addHostToGroup throws when the host does not exist", async () => {
  const { context } = createCatalogTestContext({
    storedResources: { "group-prod": { name: "prod", metadata: {} } },
  });

  await assertRejects(
    () =>
      model.methods.addHostToGroup.execute(
        { host: "web-01", group: "prod", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" not found',
  );
});

Deno.test("addHostToGroup throws when the group does not exist", async () => {
  const { context } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  await assertRejects(
    () =>
      model.methods.addHostToGroup.execute(
        { host: "web-01", group: "prod", idempotent: false },
        context,
      ),
    Error,
    'Group "prod" not found',
  );
});

Deno.test("addHostToGroup throws when already a member", async () => {
  const { context } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: ["prod"], metadata: {} },
      "group-prod": { name: "prod", metadata: {} },
    },
  });

  await assertRejects(
    () =>
      model.methods.addHostToGroup.execute(
        { host: "web-01", group: "prod", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" is already a member of group "prod"',
  );
});

Deno.test("addHostToGroup no-ops when idempotent and already a member", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: ["prod"], metadata: {} },
      "group-prod": { name: "prod", metadata: {} },
    },
  });

  const result = await model.methods.addHostToGroup.execute(
    { host: "web-01", group: "prod", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getWrittenResources().length, 0);
});

// --- removeHostFromGroup -----------------------------------------------------

Deno.test("removeHostFromGroup removes the group from the host and resolves", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": {
        name: "web-01",
        groups: ["prod", "linux"],
        metadata: {},
      },
    },
  });

  await model.methods.removeHostFromGroup.execute(
    { host: "web-01", group: "prod", idempotent: false },
    context,
  );

  const hostWrite = writesFor(getWrittenResources(), "host")[0];
  assertEquals(hostWrite.data.groups, ["linux"]);
});

Deno.test("removeHostFromGroup throws when the host does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.removeHostFromGroup.execute(
        { host: "web-01", group: "prod", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" not found',
  );
});

Deno.test("removeHostFromGroup throws when not a member", async () => {
  const { context } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  await assertRejects(
    () =>
      model.methods.removeHostFromGroup.execute(
        { host: "web-01", group: "prod", idempotent: false },
        context,
      ),
    Error,
    'Host "web-01" is not a member of group "prod"',
  );
});

Deno.test("removeHostFromGroup no-ops when idempotent and not a member", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  const result = await model.methods.removeHostFromGroup.execute(
    { host: "web-01", group: "prod", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getWrittenResources().length, 0);
});

// --- setMetadata ---------------------------------------------------------------

Deno.test("setMetadata requires target for group/host scope", () => {
  assertThrows(() =>
    model.methods.setMetadata.arguments.parse({
      scope: "host",
      key: "sshUser",
      value: "deploy",
    })
  );
});

Deno.test("setMetadata at host scope writes the key and resolves that host", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  await model.methods.setMetadata.execute(
    { scope: "host", target: "web-01", key: "sshPort", value: 2222 },
    context,
  );

  const hostWrite = writesFor(getWrittenResources(), "host")[0];
  assertEquals(hostWrite.data.metadata, { sshPort: 2222 });
  const resolvedWrite = writesFor(getWrittenResources(), "resolved")[0];
  assertEquals(resolvedWrite.data.metadata, { sshPort: 2222 });
});

Deno.test("setMetadata at host scope throws when the host does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.setMetadata.execute(
        { scope: "host", target: "web-01", key: "sshPort", value: 2222 },
        context,
      ),
    Error,
    'Host "web-01" not found',
  );
});

Deno.test("setMetadata at group scope throws when the group does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.setMetadata.execute(
        { scope: "group", target: "prod", key: "tier", value: "critical" },
        context,
      ),
    Error,
    'Group "prod" not found',
  );
});

Deno.test("setMetadata at group scope writes the key and resolves only member hosts", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    hostInstances: ["host-web-01", "host-web-02"],
    storedResources: {
      "group-prod": { name: "prod", metadata: {} },
      "host-web-01": { name: "web-01", groups: ["prod"], metadata: {} },
      "host-web-02": { name: "web-02", groups: [], metadata: {} },
    },
  });

  await model.methods.setMetadata.execute(
    { scope: "group", target: "prod", key: "tier", value: "critical" },
    context,
  );

  const groupWrite = writesFor(getWrittenResources(), "group")[0];
  assertEquals(groupWrite.data.metadata, { tier: "critical" });
  const resolvedWrites = writesFor(getWrittenResources(), "resolved");
  assertEquals(resolvedWrites.length, 1);
  assertEquals(resolvedWrites[0].name, "resolved-web-01");
});

Deno.test("setMetadata at global scope writes the key and resolves every host", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    hostInstances: ["host-web-01", "host-web-02"],
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
      "host-web-02": { name: "web-02", groups: [], metadata: {} },
    },
  });

  await model.methods.setMetadata.execute(
    { scope: "global", key: "sshUser", value: "deploy" },
    context,
  );

  const globalWrite = writesFor(getWrittenResources(), "global")[0];
  assertEquals(globalWrite.data.metadata, { sshUser: "deploy" });
  const resolvedWrites = writesFor(getWrittenResources(), "resolved");
  assertEquals(resolvedWrites.length, 2);
  assertEquals(
    resolvedWrites.every((w) =>
      (w.data.metadata as Record<string, unknown>).sshUser === "deploy"
    ),
    true,
  );
});

// --- removeMetadata ------------------------------------------------------------

Deno.test("removeMetadata at host scope removes the key and resolves that host", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": {
        name: "web-01",
        groups: [],
        metadata: { role: "nas" },
      },
    },
  });

  await model.methods.removeMetadata.execute(
    { scope: "host", target: "web-01", key: "role", idempotent: false },
    context,
  );

  const hostWrite = writesFor(getWrittenResources(), "host")[0];
  assertEquals(hostWrite.data.metadata, {});
});

Deno.test("removeMetadata at host scope throws when the key is not set", async () => {
  const { context } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  await assertRejects(
    () =>
      model.methods.removeMetadata.execute(
        { scope: "host", target: "web-01", key: "role", idempotent: false },
        context,
      ),
    Error,
    'Metadata key "role" is not set on host "web-01"',
  );
});

Deno.test("removeMetadata at host scope no-ops when idempotent and the key is not set", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
    },
  });

  const result = await model.methods.removeMetadata.execute(
    { scope: "host", target: "web-01", key: "role", idempotent: true },
    context,
  );

  assertEquals(result, {});
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("removeMetadata at global scope throws when the key is not set", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () =>
      model.methods.removeMetadata.execute(
        { scope: "global", key: "sshUser", idempotent: false },
        context,
      ),
    Error,
    'Global metadata key "sshUser" is not set',
  );
});

// --- resolveMetadata -------------------------------------------------------

Deno.test("resolveMetadata resolves a single named host", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: { role: "nas" } },
    },
  });

  await model.methods.resolveMetadata.execute({ host: "web-01" }, context);

  const resolvedWrite = writesFor(getWrittenResources(), "resolved")[0];
  assertEquals(resolvedWrite.data.metadata, { role: "nas" });
});

Deno.test("resolveMetadata throws when the named host does not exist", async () => {
  const { context } = createCatalogTestContext();

  await assertRejects(
    () => model.methods.resolveMetadata.execute({ host: "web-01" }, context),
    Error,
    'Host "web-01" not found',
  );
});

Deno.test("resolveMetadata with no host resolves every catalogued host", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    hostInstances: ["host-web-01", "host-web-02"],
    storedResources: {
      "host-web-01": { name: "web-01", groups: [], metadata: {} },
      "host-web-02": { name: "web-02", groups: [], metadata: {} },
    },
  });

  await model.methods.resolveMetadata.execute({}, context);

  assertEquals(writesFor(getWrittenResources(), "resolved").length, 2);
});

// --- merge precedence (integration-style) -----------------------------------

Deno.test("resolved metadata follows scalar-override / list-union precedence", async () => {
  const { context, getWrittenResources } = createCatalogTestContext({
    storedResources: {
      "global": {
        metadata: { datacenter: "home", workflows: ["patch-all"] },
      },
      "group-prod": {
        name: "prod",
        metadata: {
          tier: ["prod", "critical"],
          workflows: ["backup-db", "patch-all"],
        },
      },
      "group-web": {
        name: "web",
        metadata: { tier: "web" },
      },
      "host-web-01": {
        name: "web-01",
        groups: ["prod", "web"],
        metadata: { role: "nas", workflows: ["deploy-nas"] },
      },
    },
  });

  await model.methods.resolveMetadata.execute({ host: "web-01" }, context);

  const resolvedWrite = writesFor(getWrittenResources(), "resolved")[0];
  assertEquals(resolvedWrite.data.metadata, {
    datacenter: "home",
    tier: ["prod", "critical"],
    role: "nas",
    workflows: ["patch-all", "backup-db", "deploy-nas"],
  });
});
