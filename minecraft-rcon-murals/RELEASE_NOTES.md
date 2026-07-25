## 2026.07.26.1

Hardening release driven by an adversarial external review (11 findings, all
addressed). Fully backwards-compatible: all new global arguments and
resource fields have schema defaults, so existing models, queues, and
progress resources work unchanged.

**Fixed — RCON protocol layer:**

- `conn.write()` partial writes are now looped to completion — a truncated
  packet previously corrupted the protocol stream.
- Inbound packets are validated: length must be in [10, 4110], and response
  ids are matched against request ids (mismatches fail loudly as desync).
- Multi-packet command responses are now handled via the standard
  trailing-sentinel pattern; previously a split response desynced the
  stream and corrupted failure accounting.
- `rconAuth` skips empty response-value packets and waits for the actual
  auth response — servers that send one no longer break auth detection.

**Fixed — robustness:**

- New `timeoutMs` global arg (default 10s): connect, auth, and every
  command now have a deadline, so a hung server can't stall a scheduled run
  while holding the model lock. A late-succeeding connect after a timeout
  is closed rather than leaked.
- New `maxBlockAttempts` global arg (default 3) with dead-lettering: a
  block the server actively refuses is retried at the queue tail and
  dropped after N attempts, so a deterministic refusal can't stall the
  mural forever. Transport failures requeue at the head *without*
  consuming attempts, so a server outage can't silently shrink the mural.
- `progress` now carries cumulative `totalFailures` and `deadLettered`
  counters (preserved across runs, including empty-queue runs); the queue
  itself records `deadLettered` so counts survive a missing summary, and
  `progress.deadLetteredBlocks` keeps the coordinates of the last 50
  dead-lettered blocks so permanent gaps can be located and filled.
- `delayMs` is now capped at 60,000ms.

**Fixed — input validation:**

- Corner coordinates bounded to Minecraft world limits; grids over 250,000
  blocks are rejected before any allocation (previously a typo could OOM
  the runtime).
- Decoded JPEGs are validated before use (dimensions, data length) and
  decode failures surface a clean error.
- `zod` pinned to an exact version (`npm:zod@4.1.8`).

**Tests:** coverage grew from 10 to 24 tests — the fake RCON server now
asserts the exact `/setblock` commands sent, and new cases cover
multi-packet responses, pre-auth empty packets, id-mismatch desync,
transport vs refusal classification, dead-lettering, timeouts, counter
persistence, negative-direction corners, palette restriction, RGB→block
mapping, the grid cap, and corrupt JPEGs.

## 2026.07.23.2

**Added:** Initial release, extracted from a private repo. Decodes a JPG to
the nearest-allowed Minecraft concrete colour per pixel, fits it to a
start/end corner grid (`ingest`), and places the resulting block queue onto a
live server over RCON in small delayed batches (`placeBatch`) so a scheduled
workflow can build a mural gradually.
