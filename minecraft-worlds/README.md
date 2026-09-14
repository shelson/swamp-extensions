# @shelson/minecraft-worlds

Minecraft: Java Edition world seed analysis for [swamp](https://github.com/swamp-club/swamp), powered by the [cubiomes](https://github.com/Cubitect/cubiomes) C library.

One model instance represents one world (a seed plus a game version). Methods answer questions about that world — where structures generate, what biome is at a position, where you spawn, where the strongholds and slime chunks are — and store the answers as versioned, queryable data resources.

## How it works

All world generation math is done by a small helper binary, `cubiomes-cli`, which wraps cubiomes and emits JSON. The TypeScript model validates arguments, runs the binary, and records the results. Seeds are passed as decimal strings end-to-end, so the full 64-bit seed range (including negative Java seeds) works without floating-point precision loss.

## Building the helper binary

```bash
make -C cubiomes-master   # only if libcubiomes.a is missing
cc -O3 -fwrapv -Wall -Wextra -o bin/cubiomes-cli \
  cubiomes-master/cubiomes_cli.c cubiomes-master/libcubiomes.a -lm -pthread
```

No other dependencies — cubiomes is self-contained C99.

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

Supported structure types include `village`, `monument`, `mansion`, `ancient_city`, `outpost`, `fortress`, `bastion`, `end_city`, `trail_ruins`, `trial_chambers` and more (`bin/cubiomes-cli enums` for the full list). Structure positions are biome-checked, so only locations where the structure actually generates are reported.

## Development

```bash
~/.swamp/deno/deno check extensions/models/mc_world.ts
~/.swamp/deno/deno test --allow-run --allow-read extensions/models/mc_world_test.ts
```

New question types are added as subcommands in `cubiomes-master/cubiomes_cli.c` (emitting JSON) plus a thin method in `extensions/models/mc_world.ts`.

## Platforms

The shipped binary is built for `darwin-aarch64`. For other platforms, rebuild with the command above on the target host — the source has no platform-specific dependencies.