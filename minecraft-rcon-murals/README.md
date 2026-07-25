# @shelson/minecraft-rcon-murals

Turn a JPG into a pixel-art mural built out of Minecraft concrete blocks, one
`/setblock` at a time over RCON.

This is a single model, `@shelson/pixel-mural`, with two methods:

- **`ingest`** — decodes the image, resamples it to exactly fit the
  start-to-end corner grid (per-axis direction is inferred from which corner
  is larger, so either corner can be "before" or "after" the other on X and
  Y), maps every pixel to the nearest allowed concrete colour, and writes the
  full ordered block list as the `blocks` to-do queue plus a `progress`
  summary.
- **`placeBatch`** — pops the next N blocks off the queue, places them over
  RCON with a fixed delay between each `/setblock`, and persists whatever is
  left. Designed to be called repeatedly (e.g. from a scheduled workflow) so
  a large mural is built up slowly without hammering the server.

## Global arguments

| Argument        | Default | Description                                                                 |
| --------------- | ------- | ---------------------------------------------------------------------------- |
| `rconHost`      | _(required)_ | RCON host/IP of the running Minecraft server                            |
| `rconPort`      | `25575` | RCON port                                                                     |
| `rconPassword`  | _(required)_ | RCON password — pass via a vault expression, not a literal            |
| `startX/Y/Z`    | _(required)_ | One corner of the build (row 0, col 0)                                  |
| `endX/Y`        | _(required)_ | The opposite corner. Per-axis step direction is inferred from which corner is larger, so either corner may come "before" or "after" the other |
| `paletteBlocks` | full 16-colour palette | Restrict colour matching to this subset (e.g. an image known to use only 4 colours) |
| `delayMs`       | `300`   | Delay between each `/setblock` during `placeBatch` (max 60,000)             |
| `timeoutMs`     | `10000` | Per-operation RCON deadline (connect, auth, each command; min 1,000) so a hung server can't stall a run |
| `maxBlockAttempts` | `3`  | A block the server refuses this many times is dead-lettered (dropped from the queue and counted in `progress.deadLettered`) instead of retried forever |

Coordinates are validated against Minecraft world limits (X/Z ±30,000,000,
Y −64..320), and `ingest` rejects grids larger than 250,000 blocks before
allocating anything.

## Method: `ingest`

| Argument    | Description                  |
| ----------- | ----------------------------- |
| `imagePath` | Path to the source JPG. Read with the model runtime's own filesystem permissions — treat model configuration (and anyone allowed to invoke the method) as trusted with local file reads |

Writes the `blocks` (remaining to-do queue) and `progress` (counts, done flag,
last failures) resources.

## Method: `placeBatch`

| Argument    | Default | Description                              |
| ----------- | ------- | ----------------------------------------- |
| `batchSize` | `30`    | Max blocks to place in this run (1–200)   |

Reads the `blocks` queue, places up to `batchSize` blocks over a single RCON
connection, and writes back the updated queue and progress.

Failure handling distinguishes two cases:

- **The server refuses a block** (error text in the `/setblock` response,
  e.g. "Cannot place block outside of the world") — the block's `attempts`
  counter is incremented and it's retried at the *tail* of the queue; once
  it exhausts `maxBlockAttempts` it's dead-lettered (dropped, counted in
  `progress.deadLettered`) so a persistently unplaceable block can't stall
  the mural.
- **A transport failure** (timeout, connection drop, protocol desync) — the
  batch stops (the connection is likely broken) and the block is requeued
  at the *head* with `attempts` unchanged, so a server outage never burns a
  block's dead-letter budget.

`progress.totalFailures` and `progress.deadLettered` are cumulative across
runs; `progress.failures` shows only the last run. The coordinates of the
most recent dead-lettered blocks (up to 50) are kept in
`progress.deadLetteredBlocks` so permanent gaps can be located and filled
manually.

## Example

```bash
swamp model create @shelson/pixel-mural mural \
  --input rconHost=127.0.0.1 \
  --input rconPassword="\${{ vault.get('my-vault', 'RCON_PASSWORD') }}" \
  --input startX=0 --input startY=100 --input startZ=0 \
  --input endX=200 --input endY=0

swamp model @shelson/pixel-mural method run ingest mural \
  --input imagePath=/path/to/image.jpg

swamp model @shelson/pixel-mural method run placeBatch mural \
  --input batchSize=100
```

Then wire `placeBatch` into a scheduled workflow to build the mural
gradually over time.

## Example progress output

After a few `placeBatch` runs, `swamp data get progress` returns something
like:

```json
{
  "total": 20200,
  "placed": 400,
  "remaining": 19800,
  "done": false,
  "lastBatchPlaced": 100,
  "lastRunAt": "2026-07-23T08:41:00.000Z",
  "totalFailures": 0,
  "deadLettered": 0,
  "deadLetteredBlocks": [],
  "failures": []
}
```

## Palette

The 16 standard Minecraft concrete colours (`white_concrete` … 
`black_concrete`), matched by nearest squared Euclidean distance in RGB
space to each decoded pixel.

## Notes

- RCON reachability can't be checked as a pre-flight `check` — vault
  expressions in `globalArguments` aren't resolved yet at check time, so the
  password isn't visible. `placeBatch` itself throws before writing any data
  if connect/auth fails, which is the earliest point a real credential value
  is available. The `rcon-configured` check only validates that `rconHost`
  is set and `rconPort` is in range.

## License

MIT — see [LICENSE](./LICENSE.txt).
