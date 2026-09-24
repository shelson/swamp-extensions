#!/usr/bin/env bash
# Build the cubiomes-cli helper binaries shipped in bin/ from the vendored
# cubiomes library (cubiomes/) and the CLI wrapper (cli/cubiomes_cli.c).
#
# Usage: cli/build.sh [linux-x86_64|darwin-arm64 ...]   (default: all)
# Requires zig (used as a cross-compiling C compiler).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# Library sources: every .c under cubiomes/ except the test programs.
mapfile -t srcs < <(find cubiomes -name '*.c' \
  -not -path 'cubiomes/tests/*' -not -path 'cubiomes/docs/*' \
  -not -name 'tests.c' | sort)

declare -A targets=(
  # glibc (pinned old for portability), not musl: musl's libm makes
  # locate-biome ~45% slower.
  [linux-x86_64]="x86_64-linux-gnu.2.17"
  [darwin-arm64]="aarch64-macos"
)

platforms=("$@")
[ ${#platforms[@]} -eq 0 ] && platforms=(linux-x86_64 darwin-arm64)

for plat in "${platforms[@]}"; do
  triple="${targets[$plat]:?unknown platform $plat}"
  # Drop unused library code (loot tables, ores, ...): the registry caps
  # binaries at ~976KB.
  gc=(-Wl,--gc-sections)
  [[ "$triple" == *macos ]] && gc=(-Wl,-dead_strip)
  out="bin/cubiomes-cli-$plat"
  echo "building $out ($triple, ${#srcs[@]} library sources)"
  zig cc -target "$triple" -O3 -fwrapv -s -w -Icubiomes \
    -ffunction-sections -fdata-sections "${gc[@]}" \
    -o "$out" cli/cubiomes_cli.c "${srcs[@]}" -lm
done
