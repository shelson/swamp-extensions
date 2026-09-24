/**
 * Minecraft: Java Edition world seed analysis powered by the cubiomes C
 * library. One model instance represents one world (seed + game version);
 * methods answer questions about that world: where structures generate, what
 * biome is at a position, and where the player spawns.
 *
 * Computation is delegated to the bundled `cubiomes-cli` helper binary, which
 * wraps cubiomes and emits JSON on stdout. The seed is threaded as a decimal
 * string end-to-end so full 64-bit seed precision is preserved (JSON numbers
 * lose precision past 2^53; many Minecraft seeds exceed that).
 *
 * @module
 */
import { z } from "npm:zod@4";

/** Minecraft versions supported by the bundled cubiomes build. */
const MC_VERSIONS = [
  "Beta 1.7",
  "Beta 1.8",
  "1.0",
  "1.1",
  "1.2",
  "1.3",
  "1.4",
  "1.5",
  "1.6",
  "1.7",
  "1.8",
  "1.9",
  "1.10",
  "1.11",
  "1.12",
  "1.13",
  "1.14",
  "1.15",
  "1.16",
  "1.16.1",
  "1.17",
  "1.18",
  "1.19",
  "1.19.2",
  "1.20",
  "1.21",
  "1.21.1",
  "1.21.3",
  "1.21.4",
  "1.21.5",
  "1.21.6",
  "1.21.9",
  "1.21.11",
  "26.1",
  "26.2",
  "26.3",
] as const;

/** Structure types supported by cubiomes finders. */
const STRUCTURE_TYPES = [
  "feature",
  "desert_pyramid",
  "jungle_temple",
  "swamp_hut",
  "igloo",
  "village",
  "ocean_ruin",
  "shipwreck",
  "monument",
  "mansion",
  "outpost",
  "ruined_portal",
  "ruined_portal_n",
  "ancient_city",
  "treasure",
  "mineshaft",
  "desert_well",
  "geode",
  "fortress",
  "bastion",
  "end_city",
  "trail_ruins",
  "trial_chambers",
  "abandoned_camp",
] as const;

const DIMENSIONS = ["overworld", "nether", "end"] as const;

const VALID_SCALES = [1, 4, 16, 64, 256] as const;

/**
 * Biome sampling scale. Note: a z.union of z.literal()s breaks swamp's
 * method-argument coercion (string inputs are converted for z.number() but
 * not for literal unions), so express the constraint as a refine instead.
 */
function scaleSchema(dflt: 1 | 4) {
  return z.number().int()
    .refine(
      (v): v is 1 | 4 | 16 | 64 | 256 =>
        (VALID_SCALES as readonly number[]).includes(v),
      {
        message: "scale must be one of 1, 4, 16, 64, 256",
      },
    )
    .default(dflt);
}

const GlobalArgsSchema = z.object({
  /** World seed as a decimal string (may be negative; full int64 range). */
  seed: z.string().regex(/^-?\d{1,20}$/, {
    message: "seed must be a decimal integer string (int64 range)",
  }),
  /** Minecraft Java Edition version the world was/is generated with. */
  mcVersion: z.enum(MC_VERSIONS),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const StructureHitSchema = z.object({
  x: z.number().int(),
  z: z.number().int(),
  regionX: z.number().int(),
  regionZ: z.number().int(),
});

const StructuresOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  structure: z.string(),
  dimension: z.string(),
  centerX: z.number().int(),
  centerZ: z.number().int(),
  radiusRegions: z.number().int(),
  count: z.number().int(),
  results: z.array(StructureHitSchema),
});

const BiomeOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  dimension: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
  scale: z.number().int(),
  biomeId: z.number().int(),
  biomeName: z.string(),
});

const SpawnOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  x: z.number().int(),
  z: z.number().int(),
});

const StrongholdsOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  count: z.number().int(),
  results: z.array(
    z.object({
      index: z.number().int(),
      x: z.number().int(),
      z: z.number().int(),
    }),
  ),
});

const SlimeChunksOutputSchema = z.object({
  seed: z.string(),
  centerX: z.number().int(),
  centerZ: z.number().int(),
  radiusChunks: z.number().int(),
  count: z.number().int(),
  results: z.array(
    z.object({
      chunkX: z.number().int(),
      chunkZ: z.number().int(),
      x: z.number().int(),
      z: z.number().int(),
    }),
  ),
});

const BiomeSearchOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  dimension: z.string(),
  biome: z.string(),
  biomeId: z.number().int(),
  /** Search parameters: center, height sampled, and radius in blocks. */
  centerX: z.number().int(),
  centerZ: z.number().int(),
  y: z.number().int(),
  radius: z.number().int(),
  found: z.boolean(),
  /** Position of the nearest match (meaningful only when found). */
  x: z.number().int(),
  z: z.number().int(),
});

const BiomeMapOutputSchema = z.object({
  seed: z.string(),
  mcVersion: z.string(),
  dimension: z.string(),
  x: z.number().int(),
  z: z.number().int(),
  y: z.number().int(),
  scale: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  /** Map of biome id (as string) to biome name, only for ids present. */
  legend: z.record(z.string(), z.string()),
  /** Row-major (z-then-x) grid of biome ids, width * height entries. */
  cells: z.array(z.number().int()),
});

/** Raw JSON envelope emitted by `cubiomes-cli find-structures`. */
const CliStructuresSchema = z.object({
  results: z.array(StructureHitSchema),
  count: z.number().int(),
});

/** Raw JSON envelope emitted by `cubiomes-cli biome-at`. */
const CliBiomeSchema = z.object({
  biomeId: z.number().int(),
  biomeName: z.string(),
});

/** Raw JSON envelope emitted by `cubiomes-cli spawn`. */
const CliSpawnSchema = z.object({
  x: z.number().int(),
  z: z.number().int(),
});

/** Raw JSON envelope emitted by `cubiomes-cli strongholds`. */
const CliStrongholdsSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      x: z.number().int(),
      z: z.number().int(),
    }),
  ),
  count: z.number().int(),
});

/** Raw JSON envelope emitted by `cubiomes-cli slime-chunks`. */
const CliSlimeChunksSchema = z.object({
  results: z.array(
    z.object({
      chunkX: z.number().int(),
      chunkZ: z.number().int(),
      x: z.number().int(),
      z: z.number().int(),
    }),
  ),
  count: z.number().int(),
});

/** Raw JSON envelope emitted by `cubiomes-cli locate-biome`. */
const CliLocateBiomeSchema = z.object({
  biomeId: z.number().int(),
  x: z.number().int(),
  z: z.number().int(),
  found: z.boolean(),
});

/** Raw JSON envelope emitted by `cubiomes-cli biome-map`. */
const CliBiomeMapSchema = z.object({
  legend: z.record(z.string(), z.string()),
  cells: z.array(z.number().int()),
});

/** Minimal subset of the LogTape logger provided on the method context. */
interface MethodLogger {
  info: (message: string, properties?: Record<string, unknown>) => void;
  warning: (message: string, properties?: Record<string, unknown>) => void;
  error: (message: string, properties?: Record<string, unknown>) => void;
}

interface MethodContext {
  globalArgs: GlobalArgs;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  extensionFile?: (path: string) => string;
  logger: MethodLogger;
}

/** Map Deno platform to the matching prebuilt cubiomes-cli binary name. */
function platformBinary(): string | null {
  const { os, arch } = Deno.build;
  if (os === "linux" && arch === "x86_64") return "cubiomes-cli-linux-x86_64";
  if (os === "darwin" && arch === "aarch64") return "cubiomes-cli-darwin-arm64";
  return null;
}

/** Locate the bundled cubiomes-cli helper binary. */
async function resolveBin(ctx: MethodContext): Promise<string> {
  const name = platformBinary();
  if (!name) {
    throw new Error(
      `No prebuilt cubiomes-cli for ${Deno.build.os}-${Deno.build.arch}. ` +
        "Add a target to cli/build.sh and build it from source with zig.",
    );
  }
  const candidates: string[] = [];
  if (typeof ctx.extensionFile === "function") {
    try {
      candidates.push(ctx.extensionFile(`bin/${name}`));
    } catch {
      // extensionFile unavailable for this load mode; fall through
    }
  }
  candidates.push(`bin/${name}`); // repo root (cwd) fallback
  for (const path of candidates) {
    try {
      const stat = await Deno.stat(path);
      if (stat.isFile) return path;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `cubiomes-cli binary not found (tried: ${candidates.join(", ")}). ` +
      "Build it with: cli/build.sh",
  );
}

/** Run cubiomes-cli and parse its JSON stdout. */
async function runCli(bin: string, args: string[]): Promise<unknown> {
  const cmd = new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const stdout = new TextDecoder().decode(out.stdout);
  if (out.code !== 0) {
    const stderr = new TextDecoder().decode(out.stderr).trim();
    throw new Error(`cubiomes-cli exited ${out.code}: ${stderr}`);
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(
      `cubiomes-cli produced invalid JSON: ${stdout.slice(0, 200)}`,
    );
  }
}

/** Make a string safe for use as a resource instance name. */
function sanitizeInstance(value: string): string {
  return value.replace(/[^A-Za-z0-9_.]/g, "_");
}

/** Model definition for Minecraft world seed analysis via cubiomes. */
export const model = {
  type: "@shelson/minecraft-worlds",
  version: "2026.09.25.1",
  globalArguments: GlobalArgsSchema,
  upgrades: [
    {
      toVersion: "2026.09.25.1",
      description:
        "Switch to xpple/cubiomes; mcVersion gains 1.21.4-1.21.11 and 26.1-26.3 (additive, no field changes)",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    structures: {
      description:
        "Structure locations found in a region scan of the world (fan-out: one " +
        "resource holds every hit for a structure type within the scanned area)",
      schema: StructuresOutputSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    biome: {
      description: "Biome sampled at a single position in the world",
      schema: BiomeOutputSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    spawn: {
      description: "Estimated world spawn point",
      schema: SpawnOutputSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
    strongholds: {
      description:
        "Accurate stronghold positions (biome-checked), in generation order",
      schema: StrongholdsOutputSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
    slimeChunks: {
      description: "Slime-spawning chunks around a center point",
      schema: SlimeChunksOutputSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    biomeSearch: {
      description: "Result of searching for the nearest occurrence of a biome",
      schema: BiomeSearchOutputSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    biomeMap: {
      description:
        "Grid of biome ids over an area, with an id-to-name legend. " +
        "Cells are row-major (z-then-x); cell (cx, cz) is at index " +
        "cz * width + cx and covers (x + cx * scale, z + cz * scale)",
      schema: BiomeMapOutputSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    findStructures: {
      description:
        "Scan the region grid around a center point for a structure type " +
        "(villages, monuments, ancient cities, fortresses, ...) and record " +
        "every position where the structure actually generates",
      arguments: z.object({
        structure: z.enum(STRUCTURE_TYPES),
        dimension: z.enum(DIMENSIONS).default("overworld"),
        centerX: z.number().int().default(0),
        centerZ: z.number().int().default(0),
        radiusRegions: z.number().int().min(0).max(200).default(10),
      }),
      execute: async (
        args: {
          structure: string;
          dimension: string;
          centerX: number;
          centerZ: number;
          radiusRegions: number;
        },
        ctx: MethodContext,
      ) => {
        ctx.logger.info(
          "Scanning for {structure} in a {radiusRegions}-region radius around ({centerX}, {centerZ})",
          { ...args, seed: ctx.globalArgs.seed },
        );
        const bin = await resolveBin(ctx);
        const raw = CliStructuresSchema.parse(
          await runCli(bin, [
            "find-structures",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
            "--structure",
            args.structure,
            "--dim",
            args.dimension,
            "--center-x",
            String(args.centerX),
            "--center-z",
            String(args.centerZ),
            "--radius-regions",
            String(args.radiusRegions),
          ]),
        );
        const handle = await ctx.writeResource(
          "structures",
          sanitizeInstance(
            `structures-${args.structure}-${args.dimension}-` +
              `${args.centerX}_${args.centerZ}-r${args.radiusRegions}`,
          ),
          {
            seed: ctx.globalArgs.seed,
            mcVersion: ctx.globalArgs.mcVersion,
            structure: args.structure,
            dimension: args.dimension,
            centerX: args.centerX,
            centerZ: args.centerZ,
            radiusRegions: args.radiusRegions,
            count: raw.count,
            results: raw.results,
          },
        );
        ctx.logger.info("Found {count} {structure} locations", {
          count: raw.count,
          structure: args.structure,
        });
        return { dataHandles: [handle] };
      },
    },
    biomeAt: {
      description: "Get the biome at a single position. scale=1 means block " +
        "coordinates (y matters in 1.18+); scale=4 means biome coordinates",
      arguments: z.object({
        x: z.number().int().default(0),
        z: z.number().int().default(0),
        y: z.number().int().default(63),
        scale: scaleSchema(1),
        dimension: z.enum(DIMENSIONS).default("overworld"),
      }),
      execute: async (
        args: {
          x: number;
          z: number;
          y: number;
          scale: number;
          dimension: string;
        },
        ctx: MethodContext,
      ) => {
        ctx.logger.info("Sampling biome at ({x}, {y}, {z}) scale {scale}", {
          ...args,
          seed: ctx.globalArgs.seed,
        });
        const bin = await resolveBin(ctx);
        const raw = CliBiomeSchema.parse(
          await runCli(bin, [
            "biome-at",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
            "--dim",
            args.dimension,
            "--x",
            String(args.x),
            "--z",
            String(args.z),
            "--y",
            String(args.y),
            "--scale",
            String(args.scale),
          ]),
        );
        const handle = await ctx.writeResource(
          "biome",
          sanitizeInstance(
            `biome-${args.dimension}-${args.x}_${args.y}_${args.z}-s${args.scale}`,
          ),
          {
            seed: ctx.globalArgs.seed,
            mcVersion: ctx.globalArgs.mcVersion,
            dimension: args.dimension,
            x: args.x,
            y: args.y,
            z: args.z,
            scale: args.scale,
            biomeId: raw.biomeId,
            biomeName: raw.biomeName,
          },
        );
        ctx.logger.info("Biome is {biomeName}", { biomeName: raw.biomeName });
        return { dataHandles: [handle] };
      },
    },
    spawn: {
      description: "Estimate the world spawn point",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        ctx: MethodContext,
      ) => {
        ctx.logger.info("Estimating spawn point", {
          seed: ctx.globalArgs.seed,
        });
        const bin = await resolveBin(ctx);
        const raw = CliSpawnSchema.parse(
          await runCli(bin, [
            "spawn",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
          ]),
        );
        const handle = await ctx.writeResource("spawn", "spawn-point", {
          seed: ctx.globalArgs.seed,
          mcVersion: ctx.globalArgs.mcVersion,
          x: raw.x,
          z: raw.z,
        });
        ctx.logger.info("Spawn is at ({x}, {z})", { x: raw.x, z: raw.z });
        return { dataHandles: [handle] };
      },
    },
    strongholds: {
      description:
        "List the first N strongholds in generation order, with accurate " +
        "(biome-checked) positions. Modern worlds have 128 strongholds",
      arguments: z.object({
        count: z.number().int().min(1).max(128).default(16),
      }),
      execute: async (
        args: { count: number },
        ctx: MethodContext,
      ) => {
        ctx.logger.info("Locating first {count} strongholds", {
          count: args.count,
          seed: ctx.globalArgs.seed,
        });
        const bin = await resolveBin(ctx);
        const raw = CliStrongholdsSchema.parse(
          await runCli(bin, [
            "strongholds",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
            "--count",
            String(args.count),
          ]),
        );
        const handle = await ctx.writeResource(
          "strongholds",
          `strongholds-first${args.count}`,
          {
            seed: ctx.globalArgs.seed,
            mcVersion: ctx.globalArgs.mcVersion,
            count: raw.count,
            results: raw.results,
          },
        );
        ctx.logger.info("Located {count} strongholds", { count: raw.count });
        return { dataHandles: [handle] };
      },
    },
    slimeChunks: {
      description:
        "Find slime-spawning chunks around a block position. Slime chunks " +
        "depend only on the seed, not the game version",
      arguments: z.object({
        centerX: z.number().int().default(0),
        centerZ: z.number().int().default(0),
        radiusChunks: z.number().int().min(0).max(64).default(8),
      }),
      execute: async (
        args: { centerX: number; centerZ: number; radiusChunks: number },
        ctx: MethodContext,
      ) => {
        ctx.logger.info(
          "Finding slime chunks within {radiusChunks} chunks of ({centerX}, {centerZ})",
          { ...args, seed: ctx.globalArgs.seed },
        );
        const bin = await resolveBin(ctx);
        const raw = CliSlimeChunksSchema.parse(
          await runCli(bin, [
            "slime-chunks",
            "--seed",
            ctx.globalArgs.seed,
            "--center-x",
            String(args.centerX),
            "--center-z",
            String(args.centerZ),
            "--radius",
            String(args.radiusChunks),
          ]),
        );
        const handle = await ctx.writeResource(
          "slimeChunks",
          sanitizeInstance(
            `chunks-slime-${args.centerX}_${args.centerZ}-r${args.radiusChunks}`,
          ),
          {
            seed: ctx.globalArgs.seed,
            centerX: args.centerX,
            centerZ: args.centerZ,
            radiusChunks: args.radiusChunks,
            count: raw.count,
            results: raw.results,
          },
        );
        ctx.logger.info("Found {count} slime chunks", { count: raw.count });
        return { dataHandles: [handle] };
      },
    },
    locateBiome: {
      description:
        "Search for the nearest occurrence of a biome (e.g. cherry_grove, " +
        "mushroom_fields) around a position. Run the CLI 'biome-map' or " +
        "consult the version's biome list for valid names",
      arguments: z.object({
        biome: z.string().regex(/^[a-z_]+$/, {
          message: "biome names are lowercase_with_underscores",
        }),
        x: z.number().int().default(0),
        z: z.number().int().default(0),
        y: z.number().int().default(63),
        radius: z.number().int().min(1).max(32768).default(6400),
        dimension: z.enum(DIMENSIONS).default("overworld"),
      }),
      execute: async (
        args: {
          biome: string;
          x: number;
          z: number;
          y: number;
          radius: number;
          dimension: string;
        },
        ctx: MethodContext,
      ) => {
        ctx.logger.info(
          "Searching for {biome} within {radius} blocks of ({x}, {z})",
          { ...args, seed: ctx.globalArgs.seed },
        );
        const bin = await resolveBin(ctx);
        const raw = CliLocateBiomeSchema.parse(
          await runCli(bin, [
            "locate-biome",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
            "--dim",
            args.dimension,
            "--biome",
            args.biome,
            "--x",
            String(args.x),
            "--z",
            String(args.z),
            "--y",
            String(args.y),
            "--radius",
            String(args.radius),
          ]),
        );
        const handle = await ctx.writeResource(
          "biomeSearch",
          sanitizeInstance(
            `biomesearch-${args.biome}-${args.dimension}-` +
              `${args.x}_${args.y}_${args.z}-r${args.radius}`,
          ),
          {
            seed: ctx.globalArgs.seed,
            mcVersion: ctx.globalArgs.mcVersion,
            dimension: args.dimension,
            biome: args.biome,
            biomeId: raw.biomeId,
            centerX: args.x,
            centerZ: args.z,
            y: args.y,
            radius: args.radius,
            found: raw.found,
            x: raw.x,
            z: raw.z,
          },
        );
        ctx.logger.info("Biome search complete: found={found} at ({x}, {z})", {
          found: raw.found,
          x: raw.x,
          z: raw.z,
        });
        return { dataHandles: [handle] };
      },
    },
    biomeMap: {
      description:
        "Generate a grid of biomes over an area. scale=4 (default) means " +
        "each cell covers 4x4 blocks, so 128x128 cells span 512x512 blocks. " +
        "Capped at 256x256 cells",
      arguments: z.object({
        x: z.number().int().default(0),
        z: z.number().int().default(0),
        width: z.number().int().min(1).max(256).default(128),
        height: z.number().int().min(1).max(256).default(128),
        y: z.number().int().default(63),
        scale: scaleSchema(4),
        dimension: z.enum(DIMENSIONS).default("overworld"),
      }),
      execute: async (
        args: {
          x: number;
          z: number;
          width: number;
          height: number;
          y: number;
          scale: number;
          dimension: string;
        },
        ctx: MethodContext,
      ) => {
        ctx.logger.info(
          "Generating {width}x{height} biome map at scale {scale} from ({x}, {z})",
          { ...args, seed: ctx.globalArgs.seed },
        );
        const bin = await resolveBin(ctx);
        const raw = CliBiomeMapSchema.parse(
          await runCli(bin, [
            "biome-map",
            "--seed",
            ctx.globalArgs.seed,
            "--mc",
            ctx.globalArgs.mcVersion,
            "--dim",
            args.dimension,
            "--x",
            String(args.x),
            "--z",
            String(args.z),
            "--w",
            String(args.width),
            "--h",
            String(args.height),
            "--y",
            String(args.y),
            "--scale",
            String(args.scale),
          ]),
        );
        const handle = await ctx.writeResource(
          "biomeMap",
          sanitizeInstance(
            `biomemap-${args.dimension}-${args.x}_${args.z}-` +
              `${args.width}x${args.height}-s${args.scale}`,
          ),
          {
            seed: ctx.globalArgs.seed,
            mcVersion: ctx.globalArgs.mcVersion,
            dimension: args.dimension,
            x: args.x,
            z: args.z,
            y: args.y,
            scale: args.scale,
            width: args.width,
            height: args.height,
            legend: raw.legend,
            cells: raw.cells,
          },
        );
        ctx.logger.info("Biome map generated with {biomes} distinct biomes", {
          biomes: Object.keys(raw.legend).length,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
