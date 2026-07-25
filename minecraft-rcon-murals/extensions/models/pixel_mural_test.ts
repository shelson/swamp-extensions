/**
 * Unit tests for the pixel_mural model.
 *
 * @module
 */
import { assertEquals, assertRejects } from "@std/assert";
import { createModelTestContext } from "@systeminit/swamp-testing";
import jpeg from "npm:jpeg-js@0.4.4";
import { model } from "./pixel_mural.ts";

// createModelTestContext returns a generic MethodContext<Record<string,
// unknown>> — the model's execute functions narrow `globalArgs` to the
// schema-specific GlobalArgs shape via inline type annotations (see
// typing.md), so the two don't structurally unify. These thin wrappers
// localize the cast instead of repeating it at every call site.
//
// They also alias `logger.warning` to the mock's `logger.warn` — the real
// swamp runtime's logger exposes `warning` (see typing.md's context field
// table, and placeBatch's own type annotation), but this pinned version of
// the swamp-testing mock only implements `warn`. Both record under the
// "warning" log level internally, so the alias is a faithful bridge, not a
// behavior change.
type TestContext = ReturnType<typeof createModelTestContext>["context"];

function withWarningAlias(context: TestContext): TestContext {
  const logger = context.logger as unknown as {
    warn(message: string, ...args: unknown[]): void;
  };
  return {
    ...context,
    logger: { ...context.logger, warning: logger.warn.bind(logger) },
  } as TestContext;
}

function ingest(
  args: Parameters<typeof model.methods.ingest.execute>[0],
  context: TestContext,
) {
  return model.methods.ingest.execute(
    args,
    context as unknown as Parameters<typeof model.methods.ingest.execute>[1],
  );
}

function placeBatch(
  args: Parameters<typeof model.methods.placeBatch.execute>[0],
  context: TestContext,
) {
  return model.methods.placeBatch.execute(
    args,
    withWarningAlias(context) as unknown as Parameters<
      typeof model.methods.placeBatch.execute
    >[1],
  );
}

const GLOBAL_ARGS = {
  rconHost: "127.0.0.1",
  rconPort: 25575, // overridden per-test with the fake server's actual port
  rconPassword: "test-password",
  startX: 0,
  startY: 2,
  startZ: 0,
  endX: 2,
  endY: 0,
  delayMs: 0,
  timeoutMs: 5000,
  maxBlockAttempts: 3,
};

/** Encode a tiny 2x2 RGBA bitmap as real JPEG bytes and write it to a temp file. */
async function writeTestImage(): Promise<string> {
  const width = 2, height = 2;
  const data = new Uint8Array(width * height * 4);
  const colors: Array<[number, number, number]> = [
    [255, 255, 255], // -> white_concrete
    [8, 10, 15], // -> black_concrete
    [255, 255, 255],
    [8, 10, 15],
  ];
  for (let i = 0; i < colors.length; i++) {
    data[i * 4] = colors[i][0];
    data[i * 4 + 1] = colors[i][1];
    data[i * 4 + 2] = colors[i][2];
    data[i * 4 + 3] = 255;
  }
  const encoded = jpeg.encode({ data, width, height }, 100);
  const path = await Deno.makeTempFile({ suffix: ".jpg" });
  await Deno.writeFile(path, encoded.data);
  return path;
}

// --- Fake RCON server ------------------------------------------------------
//
// The model talks raw Source RCON over Deno.connect, so instead of mocking
// the socket layer we run a real (loopback) RCON-shaped TCP server and point
// the model at it. `behavior` controls how it responds to each exec command
// so tests can exercise both the happy path and a mid-batch failure.

const RCON_AUTH = 3;
const RCON_EXEC = 2;
const RCON_RESPONSE = 0;

type RconBehavior = {
  rejectAuth?: boolean;
  /** 1-indexed exec command number (excluding auth) to fail on, if any. */
  failOnCommand?: number;
  /** Respond to the Nth exec with a refusal body instead of success. */
  refuseOnCommand?: number;
  /** Respond to the Nth exec with a foreign packet id (desync injection). */
  foreignIdOnCommand?: number;
  /** Send an empty response-value packet before the auth response. */
  preAuthEmpty?: boolean;
  /** Echo the auth response with a mismatched id. */
  wrongAuthId?: boolean;
  /** Split every exec response into two packets before the sentinel echo. */
  splitResponses?: boolean;
  /** Accept packets but never respond (timeout testing). */
  neverRespond?: boolean;
};

function readPacket(
  buf: Uint8Array,
): { id: number; type: number; body: string; consumed: number } | null {
  if (buf.length < 4) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const length = view.getInt32(0, true);
  if (buf.length < 4 + length) return null;
  const id = view.getInt32(4, true);
  const type = view.getInt32(8, true);
  const body = new TextDecoder().decode(buf.subarray(12, 4 + length - 2));
  return { id, type, body, consumed: 4 + length };
}

function encodePacket(id: number, type: number, body: string): Uint8Array {
  const bodyBytes = new TextEncoder().encode(body);
  const length = 4 + 4 + bodyBytes.length + 2;
  const packet = new Uint8Array(4 + length);
  const view = new DataView(packet.buffer);
  view.setInt32(0, length, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  packet.set(bodyBytes, 12);
  return packet;
}

async function withFakeRconServer<T>(
  behavior: RconBehavior,
  fn: (port: number, receivedExecs: string[]) => Promise<T>,
): Promise<T> {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  const receivedExecs: string[] = [];

  const serve = (async () => {
    const conn = await listener.accept();
    let execCount = 0;
    let leftover = new Uint8Array(0);
    try {
      for await (const chunk of conn.readable) {
        const combined = new Uint8Array(leftover.length + chunk.length);
        combined.set(leftover);
        combined.set(chunk, leftover.length);
        leftover = combined;

        while (true) {
          const pkt = readPacket(leftover);
          if (!pkt) break;
          leftover = leftover.subarray(pkt.consumed);
          if (behavior.neverRespond) continue;

          if (pkt.type === RCON_AUTH) {
            if (behavior.preAuthEmpty) {
              await conn.write(encodePacket(pkt.id, RCON_RESPONSE, ""));
            }
            const respId = behavior.rejectAuth
              ? -1
              : behavior.wrongAuthId
              ? pkt.id + 999
              : pkt.id;
            await conn.write(encodePacket(respId, 2, ""));
          } else if (pkt.type === RCON_EXEC) {
            execCount++;
            receivedExecs.push(pkt.body);
            if (behavior.failOnCommand === execCount) {
              // Simulate a broken connection: close without responding.
              conn.close();
              return;
            }
            if (behavior.foreignIdOnCommand === execCount) {
              // Desync injection: a packet with an unrelated id.
              await conn.write(encodePacket(pkt.id + 777, RCON_RESPONSE, ""));
            } else if (behavior.refuseOnCommand === execCount) {
              await conn.write(
                encodePacket(
                  pkt.id,
                  RCON_RESPONSE,
                  "Cannot place block outside of the world",
                ),
              );
            } else if (behavior.splitResponses) {
              // Multi-packet response: the client must concatenate both
              // parts (in order) before the sentinel echo arrives.
              await conn.write(
                encodePacket(pkt.id, RCON_RESPONSE, "Changed the"),
              );
              await conn.write(
                encodePacket(pkt.id, RCON_RESPONSE, ` block (${pkt.body})`),
              );
            } else {
              // Mirror a real server's setblock success response body — the
              // model treats anything not starting with "Changed the block"
              // as a refusal.
              await conn.write(
                encodePacket(
                  pkt.id,
                  RCON_RESPONSE,
                  `Changed the block (${pkt.body})`,
                ),
              );
            }
          } else if (pkt.type === RCON_RESPONSE) {
            // Client's trailing sentinel packet — echo it so the client
            // knows the preceding command's response is complete.
            await conn.write(encodePacket(pkt.id, RCON_RESPONSE, ""));
          }
        }
      }
    } catch {
      // Connection closed by client (e.g. after the batch completes) — fine.
    }
  })();

  try {
    return await fn(port, receivedExecs);
  } finally {
    listener.close();
    await serve.catch(() => {});
  }
}

// --- ingest -----------------------------------------------------------------

Deno.test("ingest: decodes an image into a block queue and progress summary", async () => {
  const imagePath = await writeTestImage();
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: GLOBAL_ARGS,
    });

    const result = await ingest({ imagePath }, context);

    assertEquals(result.dataHandles.length, 2);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;

    assertEquals(queue.data.total, 4);
    assertEquals(queue.data.imageWidth, 2);
    assertEquals(queue.data.imageHeight, 2);
    assertEquals((queue.data.remaining as unknown[]).length, 4);

    assertEquals(progress.data.total, 4);
    assertEquals(progress.data.placed, 0);
    assertEquals(progress.data.remaining, 4);
    assertEquals(progress.data.done, false);
  } finally {
    await Deno.remove(imagePath);
  }
});

Deno.test("ingest: throws on an empty start/end grid without writing any resource", async () => {
  const imagePath = await writeTestImage();
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, endX: GLOBAL_ARGS.startX },
    });

    await assertRejects(
      () => ingest({ imagePath }, context),
      Error,
      "empty grid",
    );
    assertEquals(getWrittenResources().length, 0);
  } finally {
    await Deno.remove(imagePath);
  }
});

// --- placeBatch --------------------------------------------------------------

Deno.test("placeBatch: throws when no queue has been ingested yet", async () => {
  const { context } = createModelTestContext({ globalArgs: GLOBAL_ARGS });

  await assertRejects(
    () => placeBatch({ batchSize: 10 }, context),
    Error,
    "run `ingest` first",
  );
});

Deno.test("placeBatch: an already-empty queue short-circuits as done without connecting over RCON", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    // rconPort 0 would fail to connect if the code path attempted it —
    // proves the empty-queue branch never opens a socket.
    globalArgs: { ...GLOBAL_ARGS, rconPort: 0 },
    storedResources: {
      queue: {
        total: 4,
        imageWidth: 2,
        imageHeight: 2,
        sourcePath: "irrelevant.jpg",
        remaining: [],
        createdAt: new Date().toISOString(),
      },
    },
  });

  const result = await placeBatch({ batchSize: 10 }, context);

  assertEquals(result.dataHandles.length, 1);
  const progress = getWrittenResources()[0];
  assertEquals(progress.data.placed, 4);
  assertEquals(progress.data.remaining, 0);
  assertEquals(progress.data.done, true);
});

function makeBlock(row: number, col: number) {
  return { x: col, y: -row, z: 0, block: "white_concrete", row, col };
}

Deno.test("placeBatch: places every block in the batch over RCON and drains the queue", async () => {
  await withFakeRconServer({}, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1), makeBlock(0, 2)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: {
        queue: {
          total: 3,
          imageWidth: 3,
          imageHeight: 1,
          sourcePath: "irrelevant.jpg",
          remaining: blocks,
          createdAt: new Date().toISOString(),
        },
      },
    });

    await placeBatch({ batchSize: 10 }, context);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;

    assertEquals((queue.data.remaining as unknown[]).length, 0);
    assertEquals(progress.data.placed, 3);
    assertEquals(progress.data.remaining, 0);
    assertEquals(progress.data.done, true);
    assertEquals(progress.data.failures, []);
  });
});

Deno.test("placeBatch: a mid-batch RCON failure records the failure and requeues the rest", async () => {
  await withFakeRconServer({ failOnCommand: 2 }, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1), makeBlock(0, 2)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: {
        queue: {
          total: 3,
          imageWidth: 3,
          imageHeight: 1,
          sourcePath: "irrelevant.jpg",
          remaining: blocks,
          createdAt: new Date().toISOString(),
        },
      },
    });

    await placeBatch({ batchSize: 10 }, context);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;

    // First block placed, second failed (connection dropped), third
    // never attempted — both the failed and untried blocks are requeued.
    assertEquals((queue.data.remaining as unknown[]).length, 2);
    assertEquals(progress.data.placed, 1);
    assertEquals(progress.data.remaining, 2);
    assertEquals(progress.data.done, false);
    assertEquals((progress.data.failures as unknown[]).length, 1);
  });
});

Deno.test("placeBatch: rejected RCON auth surfaces as a thrown error", async () => {
  await withFakeRconServer({ rejectAuth: true }, async (port) => {
    const { context } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: {
        queue: {
          total: 1,
          imageWidth: 1,
          imageHeight: 1,
          sourcePath: "irrelevant.jpg",
          remaining: [makeBlock(0, 0)],
          createdAt: new Date().toISOString(),
        },
      },
    });

    await assertRejects(
      () => placeBatch({ batchSize: 10 }, context),
      Error,
      "RCON authentication rejected",
    );
  });
});

// --- checks ------------------------------------------------------------------

Deno.test("rcon-configured check: passes with valid host/port/password", () => {
  const result = model.checks["rcon-configured"].execute({
    globalArgs: GLOBAL_ARGS,
  });
  assertEquals(result, { pass: true });
});

Deno.test("rcon-configured check: fails when rconHost is empty", () => {
  const result = model.checks["rcon-configured"].execute({
    globalArgs: { ...GLOBAL_ARGS, rconHost: "" },
  }) as { pass: boolean; errors?: string[] };
  assertEquals(result.pass, false);
  assertEquals(result.errors?.some((e) => e.includes("rconHost")), true);
});

Deno.test("rcon-configured check: fails when rconPort is out of range", () => {
  const result = model.checks["rcon-configured"].execute({
    globalArgs: { ...GLOBAL_ARGS, rconPort: 70000 },
  }) as { pass: boolean; errors?: string[] };
  assertEquals(result.pass, false);
  assertEquals(result.errors?.some((e) => e.includes("rconPort")), true);
});

// --- Group 4: protocol paths, command assertions, ingest coverage -----------

function storedQueue(blocks: Array<Record<string, unknown>>) {
  return {
    total: blocks.length,
    imageWidth: blocks.length,
    imageHeight: 1,
    sourcePath: "irrelevant.jpg",
    remaining: blocks,
    createdAt: new Date().toISOString(),
  };
}

Deno.test("placeBatch: sends the exact setblock command for each block", async () => {
  await withFakeRconServer({}, async (port, receivedExecs) => {
    const blocks = [
      {
        x: 10,
        y: 64,
        z: -3,
        block: "red_concrete",
        row: 0,
        col: 0,
        attempts: 0,
      },
      {
        x: 11,
        y: 64,
        z: -3,
        block: "blue_concrete",
        row: 0,
        col: 1,
        attempts: 0,
      },
    ];
    const { context } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue(blocks) },
    });

    await placeBatch({ batchSize: 10 }, context);

    assertEquals(receivedExecs, [
      "setblock 10 64 -3 minecraft:red_concrete replace",
      "setblock 11 64 -3 minecraft:blue_concrete replace",
    ]);
  });
});

Deno.test("placeBatch: concatenates multi-packet command responses in order", async () => {
  await withFakeRconServer({ splitResponses: true }, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue(blocks) },
    });

    await placeBatch({ batchSize: 10 }, context);

    const progress = getWrittenResources().find((w) =>
      w.specName === "progress"
    )!;
    assertEquals(progress.data.placed, 2);
    assertEquals(progress.data.done, true);
  });
});

Deno.test("placeBatch: tolerates an empty response-value packet before the auth response", async () => {
  await withFakeRconServer({ preAuthEmpty: true }, async (port) => {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue([makeBlock(0, 0)]) },
    });

    await placeBatch({ batchSize: 10 }, context);

    const progress = getWrittenResources().find((w) =>
      w.specName === "progress"
    )!;
    assertEquals(progress.data.placed, 1);
  });
});

Deno.test("placeBatch: an auth response with a mismatched id fails loudly as desync", async () => {
  await withFakeRconServer({ wrongAuthId: true }, async (port) => {
    const { context } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue([makeBlock(0, 0)]) },
    });

    await assertRejects(
      () => placeBatch({ batchSize: 10 }, context),
      Error,
      "desynced",
    );
  });
});

Deno.test("placeBatch: a foreign-id packet mid-response is a transport failure — requeued at head, attempts unchanged", async () => {
  await withFakeRconServer({ foreignIdOnCommand: 1 }, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue(blocks) },
    });

    await placeBatch({ batchSize: 10 }, context);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;

    // Nothing placed; the head block is requeued first, attempts unchanged.
    assertEquals(remaining.length, 2);
    assertEquals(remaining[0].row, 0);
    assertEquals(remaining[0].attempts ?? 0, 0);
    assertEquals(progress.data.placed, 0);
    assertEquals((progress.data.failures as unknown[]).length, 1);
    assertEquals(progress.data.totalFailures, 1);
    assertEquals(progress.data.deadLettered, 0);
  });
});

Deno.test("placeBatch: a refused block is retried at the tail with attempts incremented", async () => {
  await withFakeRconServer({ refuseOnCommand: 1 }, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1), makeBlock(0, 2)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port },
      storedResources: { queue: storedQueue(blocks) },
    });

    await placeBatch({ batchSize: 10 }, context);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;

    // Failed head block moved to the tail with attempts = 1; the other two
    // keep their original relative order.
    assertEquals(remaining.length, 3);
    assertEquals(remaining.map((b) => b.col), [1, 2, 0]);
    assertEquals(remaining[2].attempts, 1);
    assertEquals(progress.data.placed, 0);
    assertEquals(progress.data.totalFailures, 1);
    assertEquals(progress.data.deadLettered, 0);
  });
});

Deno.test("placeBatch: a block that exhausts maxBlockAttempts is dead-lettered", async () => {
  await withFakeRconServer({ refuseOnCommand: 1 }, async (port) => {
    const blocks = [makeBlock(0, 0), makeBlock(0, 1)];
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port, maxBlockAttempts: 1 },
      storedResources: { queue: storedQueue(blocks) },
    });

    await placeBatch({ batchSize: 10 }, context);

    const written = getWrittenResources();
    const queue = written.find((w) => w.specName === "blocks")!;
    const progress = written.find((w) => w.specName === "progress")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;

    assertEquals(remaining.length, 1);
    assertEquals(remaining[0].col, 1);
    assertEquals(progress.data.deadLettered, 1);
    assertEquals(progress.data.totalFailures, 1);
    assertEquals(progress.data.placed, 0);
    // The dropped block's coordinates are persisted so the gap can be found.
    assertEquals(progress.data.deadLetteredBlocks, [
      { x: 0, y: 0, z: 0, error: "Cannot place block outside of the world" },
    ]);
  });
});

Deno.test("placeBatch: cumulative failure counters survive an empty-queue run", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: GLOBAL_ARGS,
    storedResources: {
      queue: storedQueue([]),
      summary: {
        total: 5,
        placed: 4,
        remaining: 0,
        done: true,
        lastBatchPlaced: 0,
        lastRunAt: new Date().toISOString(),
        totalFailures: 2,
        deadLettered: 1,
        failures: [{ x: 1, y: 2, z: 3, error: "old" }],
      },
    },
  });

  await placeBatch({ batchSize: 10 }, context);

  const progress = getWrittenResources()[0];
  assertEquals(progress.data.placed, 4);
  assertEquals(progress.data.totalFailures, 2);
  assertEquals(progress.data.deadLettered, 1);
  assertEquals(progress.data.failures, []);
});

Deno.test("placeBatch: a server that never responds fails via timeout instead of hanging", async () => {
  await withFakeRconServer({ neverRespond: true }, async (port) => {
    const { context } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, rconPort: port, timeoutMs: 1000 },
      storedResources: { queue: storedQueue([makeBlock(0, 0)]) },
    });

    await assertRejects(
      () => placeBatch({ batchSize: 10 }, context),
      Error,
      "timed out",
    );
  });
});

Deno.test("ingest: negative-direction corners step coordinates backwards", async () => {
  const imagePath = await writeTestImage();
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: {
        ...GLOBAL_ARGS,
        startX: 10,
        startY: 70,
        startZ: 5,
        endX: 8,
        endY: 68,
      },
    });

    await ingest({ imagePath }, context);

    const queue = getWrittenResources().find((w) => w.specName === "blocks")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;
    assertEquals(remaining.length, 4);
    // Row 0 starts at the start corner and steps towards the end corner.
    assertEquals(
      remaining.map((b) => [b.x, b.y, b.z]),
      [[10, 70, 5], [9, 70, 5], [10, 69, 5], [9, 69, 5]],
    );
  } finally {
    await Deno.remove(imagePath);
  }
});

Deno.test("ingest: paletteBlocks restricts colour matching to the given subset", async () => {
  const imagePath = await writeTestImage();
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: { ...GLOBAL_ARGS, paletteBlocks: ["red_concrete"] },
    });

    await ingest({ imagePath }, context);

    const queue = getWrittenResources().find((w) => w.specName === "blocks")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;
    assertEquals(
      new Set(remaining.map((b) => b.block)),
      new Set(["red_concrete"]),
    );
  } finally {
    await Deno.remove(imagePath);
  }
});

Deno.test("ingest: maps known RGB values to the nearest concrete block", async () => {
  const imagePath = await writeTestImage();
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: GLOBAL_ARGS,
    });

    await ingest({ imagePath }, context);

    const queue = getWrittenResources().find((w) => w.specName === "blocks")!;
    const remaining = queue.data.remaining as Array<Record<string, unknown>>;
    // The test image is pure white / near-black pixels (see writeTestImage).
    assertEquals(remaining[0].block, "white_concrete");
    assertEquals(remaining[1].block, "black_concrete");
  } finally {
    await Deno.remove(imagePath);
  }
});

Deno.test("ingest: rejects a grid over the block cap before reading the image", async () => {
  const { context, getWrittenResources } = createModelTestContext({
    globalArgs: {
      ...GLOBAL_ARGS,
      startX: -1000,
      startY: 0,
      endX: 1000,
      endY: 300, // 2000 x 300 = 600,000 > 250,000 cap
    },
  });

  await assertRejects(
    () => ingest({ imagePath: "/nonexistent/never-read.jpg" }, context),
    Error,
    "block cap",
  );
  assertEquals(getWrittenResources().length, 0);
});

Deno.test("ingest: a corrupt JPEG surfaces a clean decode error", async () => {
  const path = await Deno.makeTempFile({ suffix: ".jpg" });
  await Deno.writeFile(path, new TextEncoder().encode("definitely not a jpeg"));
  try {
    const { context, getWrittenResources } = createModelTestContext({
      globalArgs: GLOBAL_ARGS,
    });

    await assertRejects(
      () => ingest({ imagePath: path }, context),
      Error,
      "failed to decode",
    );
    assertEquals(getWrittenResources().length, 0);
  } finally {
    await Deno.remove(path);
  }
});
