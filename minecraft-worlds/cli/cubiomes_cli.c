/* cubiomes_cli.c
 *
 * Thin JSON-emitting CLI wrapper around the cubiomes library, intended to be
 * driven by the swamp mc-world extension model (but usable standalone).
 *
 * Usage:
 *   cubiomes-cli find-structures --seed S --mc V --structure T
 *       [--dim D] [--center-x X] [--center-z Z] [--radius-regions R]
 *   cubiomes-cli biome-at --seed S --mc V --x X --z Z
 *       [--dim D] [--y Y] [--scale SC]
 *   cubiomes-cli spawn --seed S --mc V
 *   cubiomes-cli strongholds --seed S --mc V [--count N]
 *   cubiomes-cli slime-chunks --seed S [--center-x X] [--center-z Z] [--radius R]
 *   cubiomes-cli locate-biome --seed S --mc V --biome B [--dim D]
 *       [--x X] [--z Z] [--y Y] [--radius R]
 *   cubiomes-cli biome-map --seed S --mc V [--dim D]
 *       [--x X] [--z Z] [--w W] [--h H] [--y Y] [--scale SC]
 *   cubiomes-cli enums
 *
 * All output is a single JSON object on stdout. Errors go to stderr with a
 * non-zero exit code. Seeds are passed and echoed as decimal strings so no
 * 64-bit precision is lost across the JSON boundary.
 */
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "finders.h"
#include "generator.h"
#include "util.h"

/* Version names accepted for --mc (also used by the 'enums' listing).
 * Parsing itself uses the library's str2mc() from util.h. */
static const char *MC_NAMES[] = {
    "Beta 1.7", "Beta 1.8",
    "1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8",
    "1.9", "1.10", "1.11", "1.12", "1.13", "1.14", "1.15", "1.16",
    "1.16.1", "1.17", "1.18", "1.19", "1.19.2", "1.20", "1.21",
    "1.21.1", "1.21.3",
};

static const struct { const char *name; int stype; } STRUCT_TAB[] = {
    {"feature", Feature},
    {"desert_pyramid", Desert_Pyramid},
    {"jungle_temple", Jungle_Temple},
    {"swamp_hut", Swamp_Hut},
    {"igloo", Igloo},
    {"village", Village},
    {"ocean_ruin", Ocean_Ruin},
    {"shipwreck", Shipwreck},
    {"monument", Monument},
    {"mansion", Mansion},
    {"outpost", Outpost},
    {"ruined_portal", Ruined_Portal},
    {"ruined_portal_n", Ruined_Portal_N},
    {"ancient_city", Ancient_City},
    {"treasure", Treasure},
    {"mineshaft", Mineshaft},
    {"desert_well", Desert_Well},
    {"geode", Geode},
    {"fortress", Fortress},
    {"bastion", Bastion},
    {"end_city", End_City},
    {"trail_ruins", Trail_Ruins},
    {"trial_chambers", Trial_Chambers},
};

static const struct { const char *name; int dim; } DIM_TAB[] = {
    {"nether", DIM_NETHER}, {"overworld", DIM_OVERWORLD}, {"end", DIM_END},
};

static int lookup(const char *flag, const char *val,
                  const char *names[], const int ids[], int n)
{
    for (int i = 0; i < n; i++)
        if (!strcmp(val, names[i])) return ids[i];
    fprintf(stderr, "error: unknown %s '%s' (valid:", flag, val);
    for (int i = 0; i < n; i++) fprintf(stderr, "%s%s", i ? ", " : " ", names[i]);
    fprintf(stderr, ")\n");
    exit(2);
}

static int parse_mc(const char *s)
{
    int mc = str2mc(s);
    if (mc == MC_UNDEF) {
        fprintf(stderr, "error: unknown --mc '%s' (valid:", s);
        for (size_t i = 0; i < sizeof(MC_NAMES)/sizeof(*MC_NAMES); i++)
            fprintf(stderr, "%s%s", i ? ", " : " ", MC_NAMES[i]);
        fprintf(stderr, ")\n");
        exit(2);
    }
    return mc;
}

static int str2struct(const char *s)
{
    const char *names[64]; int ids[64]; int n = 0;
    for (size_t i = 0; i < sizeof(STRUCT_TAB)/sizeof(*STRUCT_TAB); i++)
        { names[n] = STRUCT_TAB[i].name; ids[n] = STRUCT_TAB[i].stype; n++; }
    return lookup("--structure", s, names, ids, n);
}

static int str2dim(const char *s)
{
    const char *names[8]; int ids[8]; int n = 0;
    for (size_t i = 0; i < sizeof(DIM_TAB)/sizeof(*DIM_TAB); i++)
        { names[n] = DIM_TAB[i].name; ids[n] = DIM_TAB[i].dim; n++; }
    return lookup("--dim", s, names, ids, n);
}

static const char *argstr(int argc, char **argv, const char *flag,
                          const char *dflt)
{
    for (int i = 2; i < argc - 1; i++)
        if (!strcmp(argv[i], flag)) return argv[i + 1];
    return dflt;
}

static int argint(int argc, char **argv, const char *flag, int dflt)
{
    const char *v = argstr(argc, argv, flag, NULL);
    return v ? atoi(v) : dflt;
}

static const char *require(int argc, char **argv, const char *flag)
{
    const char *v = argstr(argc, argv, flag, NULL);
    if (!v) { fprintf(stderr, "error: missing required %s\n", flag); exit(2); }
    return v;
}

/* floordiv() is provided by rng.h */

static void setup_gen(Generator *g, int mc, int dim, uint64_t seed)
{
    setupGenerator(g, mc, 0);
    applySeed(g, dim, seed);
}

static int cmd_find_structures(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);
    const char *stypestr = require(argc, argv, "--structure");
    int stype = str2struct(stypestr);
    const char *dimstr = argstr(argc, argv, "--dim", "overworld");
    int dim = str2dim(dimstr);
    int cx = argint(argc, argv, "--center-x", 0);
    int cz = argint(argc, argv, "--center-z", 0);
    int radius = argint(argc, argv, "--radius-regions", 10);
    if (radius < 0 || radius > 200) {
        fprintf(stderr, "error: --radius-regions out of range (0..200)\n");
        return 2;
    }

    StructureConfig sconf;
    if (!getStructureConfig(stype, mc, &sconf)) {
        fprintf(stderr, "error: structure '%s' is not valid for MC version %s\n",
                stypestr, mcstr);
        return 1;
    }
    if (sconf.dim != dim) {
        fprintf(stderr, "error: structure '%s' generates in a different "
                "dimension than '%s'\n", stypestr, dimstr);
        return 1;
    }

    Generator g;
    setup_gen(&g, mc, dim, seed);

    int regionBlocks = sconf.regionSize * 16;
    int rcx = floordiv(cx, regionBlocks);
    int rcz = floordiv(cz, regionBlocks);

    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"structure\":\"%s\",\"dim\":\"%s\","
           "\"centerX\":%d,\"centerZ\":%d,\"radiusRegions\":%d,\"results\":[",
           seedstr, mcstr, stypestr, dimstr, cx, cz, radius);

    int count = 0;
    for (int rz = rcz - radius; rz <= rcz + radius; rz++) {
        for (int rx = rcx - radius; rx <= rcx + radius; rx++) {
            Pos p;
            if (!getStructurePos(stype, mc, seed, rx, rz, &p))
                continue;
            if (!isViableStructurePos(stype, &g, p.x, p.z, 0))
                continue;
            printf("%s{\"x\":%d,\"z\":%d,\"regionX\":%d,\"regionZ\":%d}",
                   count ? "," : "", p.x, p.z, rx, rz);
            count++;
        }
    }
    printf("],\"count\":%d}\n", count);
    return 0;
}

static int cmd_biome_at(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);
    const char *dimstr = argstr(argc, argv, "--dim", "overworld");
    int dim = str2dim(dimstr);
    int x = argint(argc, argv, "--x", 0);
    int z = argint(argc, argv, "--z", 0);
    int y = argint(argc, argv, "--y", 63);
    int scale = argint(argc, argv, "--scale", 1);
    if (scale != 1 && scale != 4 && scale != 16 && scale != 64 && scale != 256) {
        fprintf(stderr, "error: --scale must be one of 1, 4, 16, 64, 256\n");
        return 2;
    }

    Generator g;
    setup_gen(&g, mc, dim, seed);

    int id = getBiomeAt(&g, scale, x, y, z);
    const char *name = biome2str(mc, id);
    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"dim\":\"%s\","
           "\"x\":%d,\"y\":%d,\"z\":%d,\"scale\":%d,"
           "\"biomeId\":%d,\"biomeName\":\"%s\"}\n",
           seedstr, mcstr, dimstr, x, y, z, scale, id,
           name ? name : "unknown");
    return 0;
}

static int cmd_spawn(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);

    Generator g;
    setup_gen(&g, mc, DIM_OVERWORLD, seed);

    Pos p = getSpawn(&g);
    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"x\":%d,\"z\":%d}\n",
           seedstr, mcstr, p.x, p.z);
    return 0;
}

/* Reverse biome2str(): resolve a biome name to its id for a given version. */
static int name2biome(int mc, const char *name)
{
    for (int id = 0; id < 256; id++) {
        if (!biomeExists(mc, id)) continue;
        const char *s = biome2str(mc, id);
        if (s && !strcmp(s, name)) return id;
    }
    fprintf(stderr, "error: unknown biome '%s' for this MC version (valid:",
            name);
    for (int id = 0; id < 256; id++) {
        if (!biomeExists(mc, id)) continue;
        const char *s = biome2str(mc, id);
        if (s) fprintf(stderr, " %s", s);
    }
    fprintf(stderr, ")\n");
    exit(2);
}

static int cmd_strongholds(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);
    int count = argint(argc, argv, "--count", 16);
    if (count < 1 || count > 128) {
        fprintf(stderr, "error: --count out of range (1..128)\n");
        return 2;
    }

    Generator g;
    setup_gen(&g, mc, DIM_OVERWORLD, seed);

    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"results\":[", seedstr, mcstr);
    StrongholdIter sh;
    initFirstStronghold(&sh, mc, seed);
    int remain = nextStronghold(&sh, &g);
    int idx = 0;
    for (;;) {
        printf("%s{\"index\":%d,\"x\":%d,\"z\":%d}",
               idx ? "," : "", idx, sh.pos.x, sh.pos.z);
        idx++;
        if (remain <= 0 || idx >= count) break;
        remain = nextStronghold(&sh, &g);
    }
    printf("],\"count\":%d}\n", idx);
    return 0;
}

static int cmd_slime_chunks(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    int cx = argint(argc, argv, "--center-x", 0);
    int cz = argint(argc, argv, "--center-z", 0);
    int radius = argint(argc, argv, "--radius", 8);
    if (radius < 0 || radius > 64) {
        fprintf(stderr, "error: --radius out of range (0..64 chunks)\n");
        return 2;
    }

    int ccx = floordiv(cx, 16), ccz = floordiv(cz, 16);
    printf("{\"seed\":\"%s\",\"centerX\":%d,\"centerZ\":%d,"
           "\"radiusChunks\":%d,\"results\":[", seedstr, cx, cz, radius);
    int count = 0;
    for (int z = ccz - radius; z <= ccz + radius; z++) {
        for (int x = ccx - radius; x <= ccx + radius; x++) {
            if (!isSlimeChunk(seed, x, z)) continue;
            printf("%s{\"chunkX\":%d,\"chunkZ\":%d,\"x\":%d,\"z\":%d}",
                   count ? "," : "", x, z, x * 16, z * 16);
            count++;
        }
    }
    printf("],\"count\":%d}\n", count);
    return 0;
}

static int cmd_locate_biome(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);
    const char *bname = require(argc, argv, "--biome");
    const char *dimstr = argstr(argc, argv, "--dim", "overworld");
    int dim = str2dim(dimstr);
    int x = argint(argc, argv, "--x", 0);
    int z = argint(argc, argv, "--z", 0);
    int y = argint(argc, argv, "--y", 63);
    int radius = argint(argc, argv, "--radius", 6400);
    if (radius < 1 || radius > 32768) {
        fprintf(stderr, "error: --radius out of range (1..32768)\n");
        return 2;
    }

    int id = name2biome(mc, bname);
    uint64_t validB = 0, validM = 0;
    if (id < 64) validB = 1ULL << id;
    else if (id >= 128 && id < 192) validM = 1ULL << (id - 128);
    else {
        fprintf(stderr, "error: biome '%s' (id %d) cannot be located with "
                "locateBiome bitsets\n", bname, id);
        return 1;
    }

    Generator g;
    setup_gen(&g, mc, dim, seed);

    uint64_t rnd;
    setSeed(&rnd, seed);
    int passes = 0;
    Pos p = locateBiome(&g, x, y, z, radius, validB, validM, &rnd, &passes);
    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"dim\":\"%s\","
           "\"biome\":\"%s\",\"biomeId\":%d,\"x\":%d,\"z\":%d,"
           "\"passes\":%d,\"found\":%s}\n",
           seedstr, mcstr, dimstr, bname, id, p.x, p.z, passes,
           passes > 0 ? "true" : "false");
    return 0;
}

static int cmd_biome_map(int argc, char **argv)
{
    const char *seedstr = require(argc, argv, "--seed");
    uint64_t seed = strtoull(seedstr, NULL, 10);
    const char *mcstr = require(argc, argv, "--mc");
    int mc = parse_mc(mcstr);
    const char *dimstr = argstr(argc, argv, "--dim", "overworld");
    int dim = str2dim(dimstr);
    int x = argint(argc, argv, "--x", 0);
    int z = argint(argc, argv, "--z", 0);
    int w = argint(argc, argv, "--w", 128);
    int h = argint(argc, argv, "--h", 128);
    int y = argint(argc, argv, "--y", 63);
    int scale = argint(argc, argv, "--scale", 4);
    if (scale != 1 && scale != 4 && scale != 16 && scale != 64 && scale != 256) {
        fprintf(stderr, "error: --scale must be one of 1, 4, 16, 64, 256\n");
        return 2;
    }
    if (w < 1 || h < 1 || w > 256 || h > 256) {
        fprintf(stderr, "error: --w/--h out of range (1..256)\n");
        return 2;
    }

    Generator g;
    setup_gen(&g, mc, dim, seed);

    Range r;
    r.scale = scale; r.x = x; r.z = z; r.sx = w; r.sz = h;
    r.y = y; r.sy = 1;
    int *cache = allocCache(&g, r);
    if (!cache || genBiomes(&g, cache, r)) {
        fprintf(stderr, "error: biome generation failed\n");
        free(cache);
        return 1;
    }

    /* legend: only the biome ids that actually occur in the grid */
    char used[256] = {0};
    for (int i = 0; i < w * h; i++) used[cache[i] & 0xff] = 1;

    printf("{\"seed\":\"%s\",\"mc\":\"%s\",\"dim\":\"%s\","
           "\"x\":%d,\"z\":%d,\"y\":%d,\"scale\":%d,\"width\":%d,"
           "\"height\":%d,\"legend\":{", seedstr, mcstr, dimstr, x, z, y,
           scale, w, h);
    int first = 1;
    for (int id = 0; id < 256; id++) {
        if (!used[id]) continue;
        const char *name = biome2str(mc, id);
        printf("%s\"%d\":\"%s\"", first ? "" : ",", id,
               name ? name : "unknown");
        first = 0;
    }
    printf("},\"cells\":[");
    for (int i = 0; i < w * h; i++) printf("%s%d", i ? "," : "", cache[i]);
    printf("]}\n");
    free(cache);
    return 0;
}

static int cmd_enums(void)
{
    printf("{\"mcVersions\":[");
    for (size_t i = 0; i < sizeof(MC_NAMES)/sizeof(*MC_NAMES); i++)
        printf("%s\"%s\"", i ? "," : "", MC_NAMES[i]);
    printf("],\"structures\":[");
    for (size_t i = 0; i < sizeof(STRUCT_TAB)/sizeof(*STRUCT_TAB); i++)
        printf("%s\"%s\"", i ? "," : "", STRUCT_TAB[i].name);
    printf("],\"dimensions\":[");
    for (size_t i = 0; i < sizeof(DIM_TAB)/sizeof(*DIM_TAB); i++)
        printf("%s\"%s\"", i ? "," : "", DIM_TAB[i].name);
    printf("]}\n");
    return 0;
}

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr,
            "usage:\n"
            "  cubiomes-cli find-structures --seed S --mc V --structure T "
            "[--dim D] [--center-x X] [--center-z Z] [--radius-regions R]\n"
            "  cubiomes-cli biome-at --seed S --mc V [--dim D] "
            "[--x X] [--z Z] [--y Y] [--scale SC]\n"
            "  cubiomes-cli spawn --seed S --mc V\n"
            "  cubiomes-cli strongholds --seed S --mc V [--count N]\n"
            "  cubiomes-cli slime-chunks --seed S "
            "[--center-x X] [--center-z Z] [--radius R]\n"
            "  cubiomes-cli locate-biome --seed S --mc V --biome B [--dim D] "
            "[--x X] [--z Z] [--y Y] [--radius R]\n"
            "  cubiomes-cli biome-map --seed S --mc V [--dim D] "
            "[--x X] [--z Z] [--w W] [--h H] [--y Y] [--scale SC]\n"
            "  cubiomes-cli enums\n");
        return 2;
    }
    if (!strcmp(argv[1], "find-structures")) return cmd_find_structures(argc, argv);
    if (!strcmp(argv[1], "biome-at")) return cmd_biome_at(argc, argv);
    if (!strcmp(argv[1], "spawn")) return cmd_spawn(argc, argv);
    if (!strcmp(argv[1], "strongholds")) return cmd_strongholds(argc, argv);
    if (!strcmp(argv[1], "slime-chunks")) return cmd_slime_chunks(argc, argv);
    if (!strcmp(argv[1], "locate-biome")) return cmd_locate_biome(argc, argv);
    if (!strcmp(argv[1], "biome-map")) return cmd_biome_map(argc, argv);
    if (!strcmp(argv[1], "enums")) return cmd_enums();
    fprintf(stderr, "error: unknown command '%s'\n", argv[1]);
    return 2;
}
