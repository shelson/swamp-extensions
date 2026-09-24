/**
 * Model-level tests for @shelson/minecraft-worlds: execute functions exercised via
 * createModelTestContext with the cubiomes-cli subprocess mocked out by
 * withMockedCommand. Covers success paths for every method, failure paths
 * (CLI error, invalid JSON), resource/spec conformance, instance naming, and
 * 64-bit seed fidelity across the argv boundary.
 *
 * Run with the swamp-bundled deno from the repo root:
 *   ~/.swamp/deno/deno test --allow-run --allow-read extensions/models/
 *
 * @module
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import {
  createModelTestContext,
  withMockedCommand,
} from "jsr:@swamp-club/swamp-testing@0.20260910.34";
import { model } from "./mc_world.ts";

const GLOBAL_ARGS = { seed: "134344508856247344", mcVersion: "1.20" };

/**
 * Any method execute signature. `never` parameter types make every concrete
 * execute assignable (contravariance) without resorting to `any`.
 */
type AnyExecute = (
  args: never,
  ctx: never,
) => Promise<{ dataHandles: { name: string }[] }>;

/** Execute a method with a mocked CLI returning the given output. */
function runMethod(
  execute: AnyExecute,
  args: Record<string, unknown>,
  output: { stdout: string; stderr?: string; code: number },
) {
  const { context, getWrittenResources, getLogsByLevel } =
    createModelTestContext({ globalArgs: GLOBAL_ARGS });
  const mock = withMockedCommand((command, _cmdArgs) => {
    assertStringIncludes(command, "cubiomes-cli");
    return output;
  }, () => execute(args as never, context as never));
  return { mock, getWrittenResources, getLogsByLevel };
}

/** Execute a method with a mocked CLI, capturing the argv sent to it. */
async function runMethodCaptureArgv(
  execute: AnyExecute,
  args: Record<string, unknown>,
  output: { stdout: string; code: number },
) {
  const { context } = createModelTestContext({ globalArgs: GLOBAL_ARGS });
  const { calls } = await withMockedCommand(
    () => output,
    () => execute(args as never, context as never),
  );
  assertEquals(calls.length, 1);
  return calls[0].args;
}

// ---------------------------------------------------------------------------
// Success paths — one per method
// ---------------------------------------------------------------------------

Deno.test("findStructures writes a conforming structures resource", async () => {
  const stdout = JSON.stringify({
    results: [
      { x: 96, z: -4288, regionX: 0, regionZ: -9 },
      { x: 720, z: -4000, regionX: 1, regionZ: -8 },
    ],
    count: 2,
  });
  const { mock, getWrittenResources, getLogsByLevel } = runMethod(
    model.methods.findStructures.execute,
    {
      structure: "village",
      dimension: "overworld",
      centerX: 0,
      centerZ: 0,
      radiusRegions: 1,
    },
    { stdout, code: 0 },
  );
  const { result } = await mock;
  assertEquals(result.dataHandles.length, 1);

  const written = getWrittenResources();
  assertEquals(written.length, 1);
  assertEquals(written[0].specName, "structures");
  assertEquals(written[0].name, "structures_village_overworld_0_0_r1");
  const data = written[0].data as Record<string, unknown>;
  assertEquals(data.seed, GLOBAL_ARGS.seed); // string, no 2^53 loss
  assertEquals(data.mcVersion, "1.20");
  assertEquals(data.structure, "village");
  assertEquals(data.count, 2);
  assertEquals((data.results as unknown[]).length, 2);

  // entry + completion logs
  assert(getLogsByLevel("info").length >= 2);
});

Deno.test("biomeAt sanitizes negative coordinates in the instance name", async () => {
  const stdout = JSON.stringify({ biomeId: 1, biomeName: "plains" });
  const { mock, getWrittenResources } = runMethod(
    model.methods.biomeAt.execute,
    { x: -3184, z: -5328, y: 63, scale: 1, dimension: "overworld" },
    { stdout, code: 0 },
  );
  await mock;
  const written = getWrittenResources();
  assertEquals(written[0].specName, "biome");
  assertEquals(written[0].name, "biome_overworld__3184_63__5328_s1");
  const data = written[0].data as Record<string, unknown>;
  assertEquals(data.biomeName, "plains");
  assertEquals(data.x, -3184);
});

Deno.test("spawn writes the spawn-point resource", async () => {
  const stdout = JSON.stringify({ x: 32, z: -96 });
  const { mock, getWrittenResources } = runMethod(
    model.methods.spawn.execute,
    {},
    { stdout, code: 0 },
  );
  await mock;
  const written = getWrittenResources();
  assertEquals(written[0].specName, "spawn");
  assertEquals(written[0].name, "spawn-point");
  assertEquals(written[0].data.x, 32);
  assertEquals(written[0].data.z, -96);
});

Deno.test("strongholds writes ordered results", async () => {
  const stdout = JSON.stringify({
    results: [
      { index: 0, x: 404, z: 2516 },
      { index: 1, x: -2348, z: -780 },
    ],
    count: 2,
  });
  const { mock, getWrittenResources, getLogsByLevel } = runMethod(
    model.methods.strongholds.execute,
    { count: 3 },
    { stdout, code: 0 },
  );
  await mock;
  const written = getWrittenResources();
  assertEquals(written[0].specName, "strongholds");
  assertEquals(written[0].name, "strongholds-first3");
  const results = (written[0].data as { results: { index: number }[] })
    .results;
  assertEquals(results.map((r) => r.index), [0, 1]);
  // entry + completion logs
  assert(getLogsByLevel("info").length >= 2);
});

Deno.test("slimeChunks writes chunk results", async () => {
  const stdout = JSON.stringify({
    results: [{ chunkX: 0, chunkZ: -1, x: 0, z: -16 }],
    count: 1,
  });
  const { mock, getWrittenResources } = runMethod(
    model.methods.slimeChunks.execute,
    { centerX: 0, centerZ: 0, radiusChunks: 8 },
    { stdout, code: 0 },
  );
  await mock;
  const written = getWrittenResources();
  assertEquals(written[0].specName, "slimeChunks");
  assertEquals(written[0].name, "chunks_slime_0_0_r8");
  assertEquals((written[0].data as { count: number }).count, 1);
});

/** Run locateBiome with a mocked CLI hit at the given search height. */
async function runLocate(y: number) {
  const stdout = JSON.stringify({
    biomeId: 185,
    x: -1572,
    z: -3368,
    found: true,
  });
  const { mock, getWrittenResources } = runMethod(
    model.methods.locateBiome.execute,
    {
      biome: "cherry_grove",
      x: 0,
      z: 0,
      y,
      radius: 6400,
      dimension: "overworld",
    },
    { stdout, code: 0 },
  );
  await mock;
  return getWrittenResources()[0];
}

Deno.test("locateBiome writes the search outcome and its parameters", async () => {
  const written = await runLocate(63);
  assertEquals(written.specName, "biomeSearch");
  assertEquals(written.name, "biomesearch_cherry_grove_overworld_0_63_0_r6400");
  const data = written.data as Record<string, unknown>;
  assertEquals(data.found, true);
  assertEquals(data.biomeId, 185);
  assertEquals(data.x, -1572);
  assertEquals(data.z, -3368);
  assertEquals(
    [data.centerX, data.centerZ, data.y, data.radius],
    [0, 0, 63, 6400],
  );
});

Deno.test("locateBiome searches at different heights do not collide", async () => {
  // Cave biomes (e.g. sulfur_caves) only exist deep down, so the same biome is
  // routinely searched at several y levels from one center.
  const surface = await runLocate(63);
  const deep = await runLocate(0);
  assert(surface.name !== deep.name, `both wrote ${surface.name}`);
});

Deno.test("biomeMap passes legend and cells through", async () => {
  const stdout = JSON.stringify({
    legend: { "0": "ocean", "25": "stony_shore" },
    cells: [0, 0, 25, 25],
  });
  const { mock, getWrittenResources } = runMethod(
    model.methods.biomeMap.execute,
    {
      x: 0,
      z: 0,
      width: 2,
      height: 2,
      y: 63,
      scale: 4,
      dimension: "overworld",
    },
    { stdout, code: 0 },
  );
  await mock;
  const written = getWrittenResources();
  assertEquals(written[0].specName, "biomeMap");
  assertEquals(written[0].name, "biomemap_overworld_0_0_2x2_s4");
  const data = written[0].data as { legend: unknown; cells: number[] };
  assertEquals(data.cells, [0, 0, 25, 25]);
  assertEquals(data.legend, { "0": "ocean", "25": "stony_shore" });
});

// ---------------------------------------------------------------------------
// Seed fidelity across the argv boundary
// ---------------------------------------------------------------------------

Deno.test("the seed reaches the CLI argv as an exact decimal string", async () => {
  const args = await runMethodCaptureArgv(
    model.methods.spawn.execute,
    {},
    { stdout: JSON.stringify({ x: 0, z: 0 }), code: 0 },
  );
  const seedIdx = args.indexOf("--seed");
  assert(seedIdx >= 0);
  // 134344508856247344 > 2^53: any float round-trip would corrupt this.
  assertEquals(args[seedIdx + 1], "134344508856247344");
});

// ---------------------------------------------------------------------------
// Failure paths
// ---------------------------------------------------------------------------

Deno.test("a CLI error rejects and writes nothing", async () => {
  const { mock, getWrittenResources } = runMethod(
    model.methods.findStructures.execute,
    {
      structure: "village",
      dimension: "nether",
      centerX: 0,
      centerZ: 0,
      radiusRegions: 1,
    },
    {
      stdout: "",
      stderr: "error: structure 'village' generates in a different " +
        "dimension than 'nether'\n",
      code: 1,
    },
  );
  const err = await assertRejects(() => mock, Error, "cubiomes-cli exited 1");
  assertStringIncludes(err.message, "different dimension");
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("invalid CLI JSON rejects and writes nothing", async () => {
  const { mock, getWrittenResources, getLogsByLevel } = runMethod(
    model.methods.spawn.execute,
    {},
    { stdout: "this is not json", code: 0 },
  );
  await assertRejects(() => mock, Error, "invalid JSON");
  assertEquals(getWrittenResources().length, 0);
  // The entry log is emitted before the CLI runs, so it survives the failure.
  assertEquals(getLogsByLevel("info").length, 1);
});

Deno.test("CLI output failing schema validation rejects and writes nothing", async () => {
  // Valid JSON, wrong shape: biomeId is a string.
  const { mock, getWrittenResources } = runMethod(
    model.methods.biomeAt.execute,
    { x: 0, z: 0, y: 63, scale: 1, dimension: "overworld" },
    {
      stdout: JSON.stringify({ biomeId: "plains", biomeName: "plains" }),
      code: 0,
    },
  );
  await assertRejects(() => mock, Error);
  assertEquals(getWrittenResources().length, 0);
});
