/**
 * Pixel mural — decodes a JPG into a to-do list of Minecraft concrete blocks
 * sized to fit a start/end corner bounding box, then places them into a
 * running server over RCON in small batches so a scheduled workflow can
 * build the mural slowly, one `/setblock` at a time, without hammering the
 * server.
 *
 * - `ingest`     — decode the image, resample it to exactly fit the
 *                  start-to-end corner grid (per-axis direction inferred
 *                  from which corner is larger, so "switched" axes on either
 *                  corner are handled automatically), map every pixel to the
 *                  nearest allowed concrete colour, write the full ordered
 *                  block list as the `blocks` to-do queue plus a `progress`
 *                  summary.
 * - `placeBatch` — pop the next N blocks off the queue, place them over RCON
 *                  with a fixed delay between each `/setblock`, and persist
 *                  whatever is left.
 *
 * @module
 */
import { z } from "npm:zod@4.1.8";
import jpeg from "npm:jpeg-js@0.4.4";

/**
 * Reference RGB for each concrete block's average texture colour (the
 * standard Minecraft concrete palette). Used only to pick the nearest match
 * for a decoded pixel — not derived from the live texture.
 */
const PALETTE = [
  { block: "white_concrete", rgb: [207, 213, 214] },
  { block: "orange_concrete", rgb: [224, 97, 1] },
  { block: "magenta_concrete", rgb: [169, 48, 159] },
  { block: "light_blue_concrete", rgb: [36, 137, 199] },
  { block: "yellow_concrete", rgb: [241, 175, 21] },
  { block: "lime_concrete", rgb: [94, 168, 24] },
  { block: "pink_concrete", rgb: [214, 101, 143] },
  { block: "gray_concrete", rgb: [55, 58, 62] },
  { block: "light_gray_concrete", rgb: [125, 125, 115] },
  { block: "cyan_concrete", rgb: [21, 119, 136] },
  { block: "blue_concrete", rgb: [44, 46, 143] },
  { block: "purple_concrete", rgb: [100, 32, 156] },
  { block: "brown_concrete", rgb: [96, 60, 32] },
  { block: "green_concrete", rgb: [73, 91, 36] },
  { block: "red_concrete", rgb: [142, 32, 32] },
  { block: "black_concrete", rgb: [8, 10, 15] },
] as const satisfies ReadonlyArray<
  { block: string; rgb: [number, number, number] }
>;

const BLOCK_IDS = PALETTE.map((p) => p.block) as [string, ...string[]];
type PaletteEntry = (typeof PALETTE)[number];

/** Nearest entry (within the active palette subset) to an RGB triple by squared Euclidean distance. */
function nearestBlock(
  r: number,
  g: number,
  b: number,
  activePalette: readonly PaletteEntry[],
): string {
  let best: PaletteEntry = activePalette[0];
  let bestDist = Infinity;
  for (const entry of activePalette) {
    const [pr, pg, pb] = entry.rgb;
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best.block;
}

const GlobalArgsSchema = z.object({
  rconHost: z.string(),
  rconPort: z.number().int().min(1).max(65535).default(25575),
  rconPassword: z.string().meta({ sensitive: true }),
  // Top-left (row 0, col 0) and bottom-right corner of the build. Per-axis
  // step direction is inferred from which corner is larger on that axis, so
  // either corner can be "before" or "after" the other on X and Y. Bounds
  // are the Minecraft world limits (X/Z ±30,000,000; Y -64..320 in recent
  // versions) so a typo can't produce an absurd grid.
  startX: z.number().int().min(-30000000).max(30000000),
  startY: z.number().int().min(-64).max(320),
  startZ: z.number().int().min(-30000000).max(30000000),
  endX: z.number().int().min(-30000000).max(30000000),
  endY: z.number().int().min(-64).max(320),
  // Restrict colour matching to this subset of the palette (e.g. an image
  // known to only use 4 colours). Defaults to the full 16-colour palette.
  paletteBlocks: z.array(z.enum(BLOCK_IDS)).min(1).optional(),
  delayMs: z.number().int().min(0).max(60000).default(300),
  // Per-operation RCON deadline (connect, auth, and each command). Without
  // it a hung server stalls placeBatch forever while holding the model lock.
  timeoutMs: z.number().int().min(1000).default(10000),
  // A block that fails this many placement attempts is dead-lettered
  // (dropped from the queue and counted in progress) instead of retried at
  // the head of the queue forever.
  maxBlockAttempts: z.number().int().min(1).default(3),
});
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const BlockSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
  block: z.enum(BLOCK_IDS),
  row: z.number().int(),
  col: z.number().int(),
  // Number of failed placement attempts so far (drives dead-lettering).
  attempts: z.number().int().min(0).default(0),
});
type Block = z.infer<typeof BlockSchema>;

const QueueSchema = z.object({
  total: z.number().int(),
  imageWidth: z.number().int(),
  imageHeight: z.number().int(),
  sourcePath: z.string(),
  remaining: z.array(BlockSchema),
  // Blocks permanently dropped after exhausting their placement attempts.
  // Kept on the queue (not just progress) so `placed` can be reconstructed
  // correctly even if the progress summary resource is ever missing.
  deadLettered: z.number().int().min(0).default(0),
  createdAt: z.iso.datetime(),
});
type Queue = z.infer<typeof QueueSchema>;

const ProgressSchema = z.object({
  total: z.number().int(),
  placed: z.number().int(),
  remaining: z.number().int(),
  done: z.boolean(),
  lastBatchPlaced: z.number().int(),
  lastRunAt: z.iso.datetime(),
  // Cumulative counters across all runs — never reset, so a persistently
  // failing block is visible even though `failures` only shows the last run.
  totalFailures: z.number().int().min(0).default(0),
  deadLettered: z.number().int().min(0).default(0),
  // Most recent dead-lettered blocks (bounded), so users can locate and
  // manually fill permanent gaps in the mural.
  deadLetteredBlocks: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      error: z.string(),
    }),
  ).default([]),
  failures: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      error: z.string(),
    }),
  ),
});

// Cap on persisted dead-lettered block coordinates.
const MAX_DEAD_LETTER_RECORDS = 50;

// Hard cap on grid area (width x height in blocks). The queue is held in
// memory as one object per block and written as a single resource, so an
// unbounded grid can OOM the runtime or produce an enormous document.
const MAX_GRID_BLOCKS = 250_000;

const IngestArgsSchema = z.object({
  // Local path to the source JPG. The model runtime reads this path with
  // its own filesystem permissions — treat model configuration (and anyone
  // allowed to invoke the method) as trusted with local file reads.
  imagePath: z.string().min(1),
});

const PlaceBatchArgsSchema = z.object({
  batchSize: z.number().int().min(1).max(200).default(30),
});

// --- Minecraft RCON (Source RCON protocol) over a raw TCP socket ---------

const RCON_AUTH = 3;
const RCON_EXEC = 2;
const RCON_RESPONSE = 0;
const RCON_AUTH_RESPONSE = 2;

// RCON packet length field covers id(4) + type(4) + body + 2 null bytes, so
// the smallest legal packet is 10; the protocol caps bodies at 4096 bytes,
// making 4110 the largest legal value.
const RCON_MIN_PACKET_LENGTH = 10;
const RCON_MAX_PACKET_LENGTH = 4110;
// Upper bound on packets consumed while searching for an expected response,
// so a misbehaving server can't spin the read loop forever.
const RCON_MAX_RESPONSE_PACKETS = 64;
// Request id used for the trailing sentinel packet that delimits a
// (potentially multi-packet) command response.
const RCON_SENTINEL_ID_OFFSET = 1_000_000;

async function readExactly(conn: Deno.Conn, n: number): Promise<Uint8Array> {
  const buf = new Uint8Array(n);
  let offset = 0;
  while (offset < n) {
    const read = await conn.read(buf.subarray(offset));
    if (read === null) throw new Error("RCON connection closed unexpectedly");
    offset += read;
  }
  return buf;
}

async function readRconPacket(
  conn: Deno.Conn,
): Promise<{ id: number; type: number; body: string }> {
  const lenBuf = await readExactly(conn, 4);
  const length = new DataView(lenBuf.buffer, lenBuf.byteOffset).getInt32(
    0,
    true,
  );
  if (length < RCON_MIN_PACKET_LENGTH || length > RCON_MAX_PACKET_LENGTH) {
    throw new Error(
      `RCON packet length ${length} out of range ` +
        `[${RCON_MIN_PACKET_LENGTH}, ${RCON_MAX_PACKET_LENGTH}] — stream is likely desynced`,
    );
  }
  const rest = await readExactly(conn, length);
  const view = new DataView(rest.buffer, rest.byteOffset);
  const id = view.getInt32(0, true);
  const type = view.getInt32(4, true);
  const body = new TextDecoder().decode(rest.subarray(8, rest.length - 2));
  return { id, type, body };
}

async function writeRconPacket(
  conn: Deno.Conn,
  id: number,
  type: number,
  body: string,
): Promise<void> {
  const bodyBytes = new TextEncoder().encode(body);
  const length = 4 + 4 + bodyBytes.length + 2;
  const packet = new Uint8Array(4 + length);
  const view = new DataView(packet.buffer);
  view.setInt32(0, length, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  packet.set(bodyBytes, 12);
  // Deno.Conn.write() may write fewer bytes than requested — loop until the
  // whole packet is on the wire, or a truncated packet corrupts the stream.
  let offset = 0;
  while (offset < packet.length) {
    const written = await conn.write(packet.subarray(offset));
    if (written === 0) {
      throw new Error(
        "RCON connection write returned 0 bytes — connection broken",
      );
    }
    offset += written;
  }
}

async function rconAuth(conn: Deno.Conn, password: string): Promise<void> {
  const authId = 1;
  await writeRconPacket(conn, authId, RCON_AUTH, password);
  // Some servers emit an empty SERVERDATA_RESPONSE_VALUE packet before the
  // auth response — skip response-type packets until the auth response (or
  // an id of -1 signalling rejection) arrives.
  for (let i = 0; i < RCON_MAX_RESPONSE_PACKETS; i++) {
    const resp = await readRconPacket(conn);
    if (resp.id === -1) throw new Error("RCON authentication rejected");
    if (resp.type === RCON_AUTH_RESPONSE) {
      if (resp.id !== authId) {
        throw new Error(
          `RCON auth response id ${resp.id} does not match request id ${authId} — stream desynced`,
        );
      }
      return;
    }
    if (resp.type !== RCON_RESPONSE) {
      throw new Error(
        `unexpected RCON packet (id ${resp.id}, type ${resp.type}) during auth — stream desynced`,
      );
    }
  }
  throw new Error(
    `RCON auth response not received within ${RCON_MAX_RESPONSE_PACKETS} packets`,
  );
}

async function rconCommand(
  conn: Deno.Conn,
  id: number,
  command: string,
): Promise<string> {
  await writeRconPacket(conn, id, RCON_EXEC, command);
  // Servers may split a long response across multiple packets. The standard
  // workaround is a trailing sentinel: an empty SERVERDATA_RESPONSE_VALUE
  // with its own id, sent immediately after the command. The server echoes
  // the sentinel only after the full command response, so we read (and
  // concatenate) response packets for the command id until the sentinel's
  // echo arrives.
  const sentinelId = id + RCON_SENTINEL_ID_OFFSET;
  await writeRconPacket(conn, sentinelId, RCON_RESPONSE, "");
  let body = "";
  for (let i = 0; i < RCON_MAX_RESPONSE_PACKETS; i++) {
    const resp = await readRconPacket(conn);
    // Note: a server that echoes the sentinel before finishing the command
    // response silently truncates the body — inherent to the sentinel
    // pattern, and harmless here since setblock responses are empty.
    if (resp.id === sentinelId && resp.type === RCON_RESPONSE) return body;
    if (resp.id === id && resp.type === RCON_RESPONSE) {
      body += resp.body;
      continue;
    }
    throw new Error(
      `unexpected RCON packet (id ${resp.id}, type ${resp.type}) while awaiting response to command id ${id} — stream desynced`,
    );
  }
  throw new Error(
    `RCON response to command id ${id} not completed within ${RCON_MAX_RESPONSE_PACKETS} packets`,
  );
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Race an operation against a deadline so a hung server can't stall a run. */
function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  what: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${what} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  // Promise.race attaches handlers to both branches, so the losing branch's
  // late settlement is always handled; clearTimeout just lets the event
  // loop quiesce promptly once the race is decided.
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

/**
 * A setblock command the server actively refused (error text in the RCON
 * response body — e.g. "Cannot place block outside of the world"), as
 * opposed to a transport failure (timeout, connection drop, desync). Only
 * block-level failures count against a block's dead-letter attempts; a
 * transport failure requeues the block at the head with attempts unchanged,
 * so a server outage can't slowly shrink the mural via dead-lettering.
 */
class BlockPlacementError extends Error {}

// --- Model -----------------------------------------------------------------

/**
 * Decodes a JPG into a nearest-allowed-colour Minecraft concrete block queue
 * fit to a start/end corner grid, then places it onto a live server over
 * RCON in small delayed batches via the `ingest` and `placeBatch` methods.
 */
export const model = {
  type: "@shelson/pixel-mural",
  // Note: 2026.07.26.1 adds global args and resource fields, all with
  // schema defaults, so pre-existing queues/progress/resources remain valid
  // without an upgrade function.
  version: "2026.07.26.1",
  globalArguments: GlobalArgsSchema,
  upgrades: [
    {
      toVersion: "2026.07.23.2",
      description:
        "Replace originX/Y/Z + width with startX/Y/Z + endX/Y corner points (direction inferred per-axis), and add optional paletteBlocks",
      upgradeAttributes: (old: Record<string, unknown>) => {
        const { originX, originY, originZ, width, ...rest } = old;
        const w = typeof width === "number" ? width : 100;
        return {
          ...rest,
          startX: originX,
          startY: originY,
          startZ: originZ,
          endX: (originX as number) + w,
          endY: (originY as number) - w,
        };
      },
    },
  ],
  resources: {
    blocks: {
      description: "Remaining to-do queue of blocks yet to be placed",
      schema: QueueSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
    progress: {
      description:
        "Placement progress summary (counts, done flag, last failures)",
      schema: ProgressSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  // Checks run against the unevaluated definition, before vault expressions in
  // globalArguments are resolved — so a check can only see the raw
  // `${{ vault.get(...) }}` text, never the real secret. A live RCON
  // reachability check is therefore impossible here; `placeBatch` itself
  // throws before writing any data if connect/auth fails, which is the
  // earliest point a real credential value is actually available.
  checks: {
    "rcon-configured": {
      description:
        "RCON host/port are present and port is in range (password presence only — its value isn't visible pre-resolution)",
      labels: ["policy"],
      appliesTo: ["placeBatch"],
      execute: (context: { globalArgs: GlobalArgs }) => {
        const { rconHost, rconPassword, rconPort } = context.globalArgs;
        const errors: string[] = [];
        if (!rconHost) errors.push("rconHost must be set");
        if (!rconPassword) errors.push("rconPassword must be set");
        if (rconPort < 1 || rconPort > 65535) {
          errors.push(`rconPort ${rconPort} is out of range`);
        }
        return errors.length > 0 ? { pass: false, errors } : { pass: true };
      },
    },
  },
  methods: {
    ingest: {
      description:
        "Decode a JPG into a nearest-allowed-colour block queue fit to the start/end corner grid",
      arguments: IngestArgsSchema,
      execute: async (
        args: z.infer<typeof IngestArgsSchema>,
        context: {
          globalArgs: GlobalArgs;
          logger: { info(msg: string, data?: Record<string, unknown>): void };
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const { startX, startY, startZ, endX, endY, paletteBlocks } =
          context.globalArgs;
        context.logger.info(
          "Ingesting {path} for corners ({sx},{sy}) -> ({ex},{ey})",
          {
            path: args.imagePath,
            sx: startX,
            sy: startY,
            ex: endX,
            ey: endY,
          },
        );
        const activePalette = paletteBlocks && paletteBlocks.length > 0
          ? PALETTE.filter((p) =>
            (paletteBlocks as readonly string[]).includes(p.block)
          )
          : PALETTE;

        const targetWidth = Math.abs(endX - startX);
        const targetHeight = Math.abs(endY - startY);
        const stepX = endX >= startX ? 1 : -1;
        const stepY = endY >= startY ? 1 : -1;
        if (targetWidth < 1 || targetHeight < 1) {
          throw new Error(
            `start/end corners produce an empty grid (${targetWidth}x${targetHeight}) — check startX/startY vs endX/endY`,
          );
        }
        if (targetWidth * targetHeight > MAX_GRID_BLOCKS) {
          throw new Error(
            `start/end corners produce a ${targetWidth}x${targetHeight} grid ` +
              `(${
                targetWidth * targetHeight
              } blocks), over the ${MAX_GRID_BLOCKS} block cap — ` +
              "shrink the corners or split the mural into multiple models",
          );
        }

        const bytes = await Deno.readFile(args.imagePath);
        // Note: jpeg-js allocates width*height*4 bytes internally, so a
        // pathological image can exhaust memory during decode — accepted
        // risk given imagePath is trusted input; the try/catch at least
        // turns corrupt files into a clean error.
        let decoded: { width: number; height: number; data: Uint8Array };
        try {
          decoded = jpeg.decode(bytes, { useTArray: true });
        } catch (err) {
          throw new Error(
            `failed to decode ${args.imagePath} as a JPEG: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        if (
          !decoded || decoded.width < 1 || decoded.height < 1 ||
          decoded.data.length < decoded.width * decoded.height * 4
        ) {
          throw new Error(
            `failed to decode ${args.imagePath} as a usable JPEG ` +
              `(width ${decoded?.width}, height ${decoded?.height}, ` +
              `${decoded?.data?.length ?? 0} data bytes)`,
          );
        }

        const remaining: Block[] = [];
        for (let row = 0; row < targetHeight; row++) {
          const srcY = Math.min(
            decoded.height - 1,
            Math.floor((row * decoded.height) / targetHeight),
          );
          for (let col = 0; col < targetWidth; col++) {
            const srcX = Math.min(
              decoded.width - 1,
              Math.floor((col * decoded.width) / targetWidth),
            );
            const idx = (srcY * decoded.width + srcX) * 4;
            const r = decoded.data[idx];
            const g = decoded.data[idx + 1];
            const b = decoded.data[idx + 2];
            remaining.push({
              x: startX + stepX * col,
              y: startY + stepY * row,
              z: startZ,
              block: nearestBlock(r, g, b, activePalette),
              row,
              col,
              attempts: 0,
            });
          }
        }

        context.logger.info("Decoded {path} into {count} blocks ({w}x{h})", {
          path: args.imagePath,
          count: remaining.length,
          w: targetWidth,
          h: targetHeight,
        });

        const now = new Date().toISOString();
        const queueHandle = await context.writeResource("blocks", "queue", {
          total: remaining.length,
          imageWidth: targetWidth,
          imageHeight: targetHeight,
          sourcePath: args.imagePath,
          remaining,
          deadLettered: 0,
          createdAt: now,
        });
        const progressHandle = await context.writeResource(
          "progress",
          "summary",
          {
            total: remaining.length,
            placed: 0,
            remaining: remaining.length,
            done: remaining.length === 0,
            lastBatchPlaced: 0,
            lastRunAt: now,
            totalFailures: 0,
            deadLettered: 0,
            deadLetteredBlocks: [],
            failures: [],
          },
        );

        return { dataHandles: [queueHandle, progressHandle] };
      },
    },
    placeBatch: {
      description:
        "Place the next batch of queued blocks over RCON, pausing between each",
      arguments: PlaceBatchArgsSchema,
      execute: async (
        args: z.infer<typeof PlaceBatchArgsSchema>,
        context: {
          globalArgs: GlobalArgs;
          logger: {
            info(msg: string, data?: Record<string, unknown>): void;
            warning(msg: string, data?: Record<string, unknown>): void;
          };
          readResource: (
            name: string,
          ) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const queue = await context.readResource("queue") as Queue | null;
        if (!queue) {
          throw new Error("no block queue found — run `ingest` first");
        }
        const prevProgress = await context.readResource("summary") as
          | z.infer<typeof ProgressSchema>
          | null;
        const prevTotalFailures = prevProgress?.totalFailures ?? 0;
        // The queue carries its own dead-letter count so a missing summary
        // can't silently inflate `placed` with dead-lettered blocks.
        const prevDeadLettered = prevProgress?.deadLettered ??
          queue.deadLettered ??
          0;

        const now = new Date().toISOString();

        if (queue.remaining.length === 0) {
          context.logger.info("Queue already empty — nothing to place");
          const progressHandle = await context.writeResource(
            "progress",
            "summary",
            {
              total: queue.total,
              placed: prevProgress?.placed ??
                (queue.total - prevDeadLettered),
              remaining: 0,
              done: true,
              lastBatchPlaced: 0,
              lastRunAt: now,
              totalFailures: prevTotalFailures,
              deadLettered: prevDeadLettered,
              deadLetteredBlocks: prevProgress?.deadLetteredBlocks ?? [],
              failures: [],
            },
          );
          return { dataHandles: [progressHandle] };
        }

        const batch = queue.remaining.slice(0, args.batchSize);
        const {
          rconHost,
          rconPort,
          rconPassword,
          delayMs,
          timeoutMs,
          maxBlockAttempts,
        } = context.globalArgs;

        context.logger.info("Placing {count} blocks via RCON {host}:{port}", {
          count: batch.length,
          host: rconHost,
          port: rconPort,
        });

        // withTimeout races but does not cancel — if the deadline fires,
        // close the underlying connection whenever it eventually succeeds
        // so a late connect can't leak an fd.
        const connectPromise = Deno.connect({
          hostname: rconHost,
          port: rconPort,
        });
        let conn: Deno.Conn;
        try {
          conn = await withTimeout(
            connectPromise,
            timeoutMs,
            `RCON connect to ${rconHost}:${rconPort}`,
          );
        } catch (err) {
          connectPromise.then((c) => c.close(), () => {});
          throw err;
        }
        let placedCount = 0;
        let deadLetteredNow = 0;
        let deadLetteredBlock:
          | { x: number; y: number; z: number; error: string }
          | null = null;
        const failures: Array<
          { x: number; y: number; z: number; error: string }
        > = [];
        // Blocks not yet attempted when the run stops, in original order.
        // The failed block is either dead-lettered or appended to the tail
        // so a deterministic failure can't stall the head of the queue.
        let newRemaining = queue.remaining;
        try {
          await withTimeout(
            rconAuth(conn, rconPassword),
            timeoutMs,
            "RCON auth",
          );
          for (let i = 0; i < batch.length; i++) {
            const b = batch[i];
            try {
              const body = await withTimeout(
                rconCommand(
                  conn,
                  i + 2,
                  `setblock ${b.x} ${b.y} ${b.z} minecraft:${b.block} replace`,
                ),
                timeoutMs,
                `setblock at ${b.x} ${b.y} ${b.z}`,
              );
              // A refused setblock is reported in the response body, not as
              // a protocol error — success reads "Changed the block at ...".
              if (!body.startsWith("Changed the block")) {
                throw new BlockPlacementError(
                  body.trim() || "server returned an empty response",
                );
              }
              placedCount++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              failures.push({ x: b.x, y: b.y, z: b.z, error: message });
              context.logger.warning(
                "setblock failed at {x},{y},{z}: {error}",
                { x: b.x, y: b.y, z: b.z, error: message },
              );
              if (err instanceof BlockPlacementError) {
                // The server refused this specific block — retry at the
                // tail, or dead-letter once it exhausts its attempts.
                const attempts = (b.attempts ?? 0) + 1;
                const rest = queue.remaining.slice(i + 1);
                if (attempts >= maxBlockAttempts) {
                  deadLetteredNow = 1;
                  deadLetteredBlock = {
                    x: b.x,
                    y: b.y,
                    z: b.z,
                    error: message,
                  };
                  newRemaining = rest;
                  context.logger.warning(
                    "dead-lettering block at {x},{y},{z} after {attempts} failed attempts",
                    { x: b.x, y: b.y, z: b.z, attempts },
                  );
                } else {
                  newRemaining = [...rest, { ...b, attempts }];
                }
              } else {
                // Transport failure (timeout/connection/desync) — the
                // connection is likely broken, so stop placing, but requeue
                // the block at the head with attempts unchanged: an outage
                // must not count against the block's dead-letter budget.
                newRemaining = queue.remaining.slice(i);
              }
              break;
            }
            if (i < batch.length - 1) await sleep(delayMs);
          }
          if (failures.length === 0) {
            newRemaining = queue.remaining.slice(placedCount);
          }
        } finally {
          conn.close();
        }

        const queueHandle = await context.writeResource("blocks", "queue", {
          ...queue,
          remaining: newRemaining,
          deadLettered: prevDeadLettered + deadLetteredNow,
        });

        const progressHandle = await context.writeResource(
          "progress",
          "summary",
          {
            total: queue.total,
            placed: (prevProgress?.placed ??
              (queue.total - queue.remaining.length - prevDeadLettered)) +
              placedCount,
            remaining: newRemaining.length,
            done: newRemaining.length === 0,
            lastBatchPlaced: placedCount,
            lastRunAt: now,
            totalFailures: prevTotalFailures + failures.length,
            deadLettered: prevDeadLettered + deadLetteredNow,
            deadLetteredBlocks: [
              ...(prevProgress?.deadLetteredBlocks ?? []),
              ...(deadLetteredBlock ? [deadLetteredBlock] : []),
            ].slice(-MAX_DEAD_LETTER_RECORDS),
            failures,
          },
        );

        context.logger.info(
          "Placed {placed}/{batch} this run — {remaining} left",
          {
            placed: placedCount,
            batch: batch.length,
            remaining: newRemaining.length,
          },
        );

        return { dataHandles: [queueHandle, progressHandle] };
      },
    },
  },
};
