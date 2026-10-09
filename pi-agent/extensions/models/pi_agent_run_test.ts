/**
 * Orchestration/failure-path test for @shelson/pi-agent's `run` method.
 *
 * This file imports the model, which statically imports the pi SDK; the SDK's
 * dependency chalk reads `process.env` at module load, so this test requires
 * Deno permissions:
 *
 *   ~/.swamp/deno/deno test --allow-env --allow-read --allow-write --allow-sys \
 *     extensions/models/pi-agent/pi_agent_run_test.ts
 *
 * The pure-helper suite (`pi_agent_test.ts`) runs with no permissions.
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { model } from "./pi_agent.ts";

/** Captures writes so tests can assert nothing was persisted on failure. */
function stubContext(globalArgs: Record<string, unknown>) {
  const writes: Array<{ spec: string; name: string }> = [];
  const noop = () => {};
  return {
    writes,
    globalArgs,
    logger: { debug: noop, info: noop, warning: noop, error: noop },
    readResource: () => Promise.resolve(null),
    writeResource: (
      spec: string,
      name: string,
      _data: Record<string, unknown>,
    ) => {
      writes.push({ spec, name });
      return Promise.resolve({ name });
    },
  };
}

Deno.test("run rejects an unknown model before creating a session", async () => {
  const dir = Deno.makeTempDirSync({ prefix: "pi-agent-test-" });
  try {
    const globalArgs = {
      cwd: dir,
      agentDir: dir,
      provider: "openrouter",
      model: "does-not-exist",
      apiKey: "dummy-key-never-used",
      thinkingLevel: "off",
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      contextFiles: "off",
      skills: [],
      appendSystemPrompt: [],
      persistSessions: false,
      defaultTimeoutMs: 5_000,
    };
    const ctx = stubContext(globalArgs);
    await assertRejects(
      () =>
        model.methods.run.execute(
          { prompt: "hi", sessionKey: "failure", newSession: true },
          ctx as unknown as Parameters<typeof model.methods.run.execute>[1],
        ),
      Error,
      "not found",
    );
    assertEquals(ctx.writes, []);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
});
