# @shelson/minecraft-worlds

Minecraft: Java Edition world seed analysis for [swamp](https://github.com/swamp-club/swamp), powered by the [cubiomes](https://github.com/Cubitect/cubiomes) C library (vendored from the maintained [xpple/cubiomes](https://github.com/xpple/cubiomes) fork, which supports versions up to 26.3).

One model instance represents one world (a seed plus a game version). Methods answer questions about that world — where structures generate, what biome is at a position, where you spawn, where the strongholds and slime chunks are — and store the answers as versioned, queryable data resources.

## How it works

All world generation math is done by a small helper binary, `cubiomes-cli`, which wraps cubiomes and emits JSON. The TypeScript model validates arguments, runs the binary, and records the results. Seeds are passed as decimal strings end-to-end, so the full 64-bit seed range (including negative Java seeds) works without floating-point precision loss.

## Building the helper binary

```bash
cli/build.sh                 # all platforms
cli/build.sh linux-x86_64    # just one
```

This needs [zig](https://ziglang.org), which is used as a cross-compiling C compiler. The layout is:

- `cubiomes/`: an unmodified vendored copy of the library. `cubiomes/VENDORED.md` records the pinned commit and how to update it.
- `cli/cubiomes_cli.c`: the JSON wrapper that the model calls.

## Usage

```bash
# One instance per world
swamp model create @shelson/minecraft-worlds myworld \
  --global-arg seed=12345 --global-arg mcVersion=1.21

# Where are the villages within ~5k blocks of origin?
swamp model method run myworld findStructures \
  --input structure=village --input radiusRegions=10

# What biome am I standing in? Where do I spawn?
swamp model method run myworld biomeAt --input x=120 --input z=-340
swamp model method run myworld spawn

# Strongholds (accurate, biome-checked), slime chunks, biome search, biome grids
swamp model method run myworld strongholds --input count=3
swamp model method run myworld slimeChunks --input radiusChunks=8
swamp model method run myworld locateBiome --input biome=cherry_grove
swamp model method run myworld biomeMap --input width=128 --input height=128
```

Results are stored as data resources — query them without re-running world generation:

```bash
swamp data list myworld
swamp data query 'modelName == "myworld" && specName == "structures"' \
  --select 'content.results.filter(r, r.x > 2000.0)'
```

Supported structure types include `village`, `monument`, `mansion`, `ancient_city`, `outpost`, `fortress`, `bastion`, `end_city`, `trail_ruins`, `trial_chambers`, `abandoned_camp` (26.3+) and more (`bin/cubiomes-cli enums` for the full list). Structure positions are biome-checked, so only locations where the structure actually generates are reported.

Versions run from Beta 1.7 up to `26.3`. New biomes such as `sulfur_caves` (26.2) and `dappled_forest` (26.3) work with `biomeAt`, `locateBiome` and `biomeMap`. A bare minor version like `1.21` means the latest release in that line, which is currently `1.21.11`.

## Development

```bash
~/.swamp/deno/deno check extensions/models/mc_world.ts
~/.swamp/deno/deno test --allow-run --allow-read extensions/models/mc_world_test.ts
```

New question types are added as subcommands in `cli/cubiomes_cli.c` (emitting JSON) plus a thin method in `extensions/models/mc_world.ts`.

## Platforms

Binaries ship for `linux-x86_64` (glibc 2.17+) and `darwin-aarch64`. For another platform, add a zig target triple to `cli/build.sh`. The C source has no platform-specific dependencies.