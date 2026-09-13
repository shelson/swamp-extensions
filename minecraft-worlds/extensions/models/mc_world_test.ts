/**
 * Tests for the mc-world model's cubiomes-cli helper binary.
 *
 * Run with the swamp-bundled deno from the repo root:
 *   ~/.swamp/deno/deno test --allow-run --allow-read extensions/models/mc_world_test.ts
 *
 * @module
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const BIN = "bin/cubiomes-cli";
/** Fixture: seed/mc/radius matching cubiomes-master/findvillages.c. */
const FIXTURE = {
  seed: "134344508856247344",
  mc: "1.20",
  radiusRegions: "10",
  villageCount: 115,
};

function binExists(): boolean {
  try {
    return Deno.statSync(BIN).isFile;
  } catch {
    return false;
  }
}

async function runCli(args: string[]): Promise<Record<string, unknown>> {
  const out = await new Deno.Command(BIN, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(
    out.code,
    0,
    `cubiomes-cli failed: ${new TextDecoder().decode(out.stderr)}`,
  );
  return JSON.parse(new TextDecoder().decode(out.stdout));
}

Deno.test({
  name: "find-structures reproduces the findvillages.c fixture exactly",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli([
      "find-structures",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--structure",
      "village",
      "--radius-regions",
      FIXTURE.radiusRegions,
    ]);
    assertEquals(d.count, FIXTURE.villageCount);
    const results = d.results as { x: number; z: number }[];
    assertEquals(results.length, FIXTURE.villageCount);
    // First and last hits of the reference implementation (sorted order
    // differs; the reference prints region-scan order, as do we).
    assert(results.some((r) => r.x === -3184 && r.z === -5328));
    assert(results.some((r) => r.x === 5248 && r.z === 5072));
  },
});

Deno.test({
  name:
    "biome-at returns a named biome and echoes the seed without precision loss",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli([
      "biome-at",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--x",
      "-3184",
      "--z",
      "-5328",
    ]);
    assertEquals(d.seed, FIXTURE.seed); // string round-trip, no 2^53 loss
    assertEquals(d.biomeName, "plains");
    assertEquals(typeof d.biomeId, "number");
  },
});

Deno.test({
  name: "negative seeds wrap to uint64 like Java's signed long",
  ignore: !binExists(),
  fn: async () => {
    const neg = await runCli([
      "biome-at",
      "--seed",
      "-1",
      "--mc",
      "1.21",
      "--x",
      "0",
      "--z",
      "0",
    ]);
    const max = await runCli([
      "biome-at",
      "--seed",
      "18446744073709551615",
      "--mc",
      "1.21",
      "--x",
      "0",
      "--z",
      "0",
    ]);
    assertEquals(neg.biomeId, max.biomeId);
  },
});

Deno.test({
  name: "spawn returns coordinates for the fixture world",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli([
      "spawn",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
    ]);
    assertEquals(typeof d.x, "number");
    assertEquals(typeof d.z, "number");
  },
});

Deno.test({
  name: "strongholds returns positions in generation order",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli([
      "strongholds",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--count",
      "3",
    ]);
    assertEquals(d.count, 3);
    const results = d.results as { index: number; x: number; z: number }[];
    assertEquals(results.map((r) => r.index), [0, 1, 2]);
    // First stronghold: 1.9+ generation starts at 128+ chunks from origin.
    const dist = Math.hypot(results[0].x, results[0].z);
    assert(dist > 128 * 16 - 112, `first stronghold too close: ${dist}`);
  },
});

Deno.test({
  name: "slime-chunks emits chunk coords aligned to 16-block corners",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli(["slime-chunks", "--seed", FIXTURE.seed]);
    const results = d.results as { chunkX: number; x: number; z: number }[];
    assert((d.count as number) > 0);
    for (const r of results) {
      assertEquals(r.x, r.chunkX * 16);
      assertEquals(r.x % 16, 0);
    }
  },
});

Deno.test({
  name: "locate-biome result is consistent with biome-at at that position",
  ignore: !binExists(),
  fn: async () => {
    const loc = await runCli([
      "locate-biome",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--biome",
      "cherry_grove",
    ]);
    assertEquals(loc.found, true);
    const at = await runCli([
      "biome-at",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--x",
      String(loc.x),
      "--z",
      String(loc.z),
    ]);
    assertEquals(at.biomeName, "cherry_grove");
  },
});

Deno.test({
  name: "biome-map cell matches a point sample at the same scale",
  ignore: !binExists(),
  fn: async () => {
    const map = await runCli([
      "biome-map",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--x",
      "-100",
      "--z",
      "-100",
      "--w",
      "4",
      "--h",
      "2",
      "--scale",
      "4",
    ]);
    const cells = map.cells as number[];
    assertEquals(cells.length, 8);
    const at = await runCli([
      "biome-at",
      "--seed",
      FIXTURE.seed,
      "--mc",
      FIXTURE.mc,
      "--x",
      "-100",
      "--z",
      "-100",
      "--scale",
      "4",
    ]);
    assertEquals(cells[0], at.biomeId);
    const legend = map.legend as Record<string, string>;
    assertEquals(legend[String(cells[0])], at.biomeName);
  },
});

Deno.test({
  name: "enums lists the supported versions and structures",
  ignore: !binExists(),
  fn: async () => {
    const d = await runCli(["enums"]);
    assert((d.mcVersions as string[]).includes("1.20"));
    assert((d.structures as string[]).includes("village"));
    assert((d.dimensions as string[]).includes("overworld"));
  },
});
