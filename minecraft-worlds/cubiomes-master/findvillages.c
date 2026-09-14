#include "finders.h"
#include "generator.h"
#include <stdio.h>

int main(void) {
    uint64_t seed = 134344508856247344ULL;
    int mc = MC_1_20; // adjust to match your world's version

    Generator g;
    setupGenerator(&g, mc, 0);
    applySeed(&g, DIM_OVERWORLD, seed);

    // Search a region of regions around spawn for villages
    // Village regions are roughly 32x32 chunks (512x512 blocks) each
    int regionRadius = 10; // ~10 regions out from 0,0 in each direction

    for (int rz = -regionRadius; rz <= regionRadius; rz++) {
        for (int rx = -regionRadius; rx <= regionRadius; rx++) {
            Pos p;
            if (getStructurePos(Village, mc, seed, rx, rz, &p)) {
                if (isViableStructurePos(Village, &g, p.x, p.z, 0)) {
                    printf("Village at x=%d, z=%d\n", p.x, p.z);
                }
            }
        }
    }

    return 0;
}
