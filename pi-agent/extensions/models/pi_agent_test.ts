/**
 * Unit tests for the pure helpers behind @shelson/pi-agent.
 *
 * The `run` method itself is exercised by smoke tests against a live model;
 * these cover the parsing/aggregation logic that can silently corrupt a run
 * record.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assistantError,
  defaultAgentDir,
  isDirectChild,
  resolveCwd,
  sanitizeName,
  tokenDelta,
} from "./helpers.ts";

Deno.test("sanitizeName reduces unsafe characters to one path segment", () => {
  assertEquals(sanitizeName("my agent/one"), "my-agent-one");
  assertEquals(sanitizeName("../../../etc/passwd"), "etc-passwd");
  assertEquals(sanitizeName(".."), "default");
  assertEquals(sanitizeName("!!!"), "default");
});

Deno.test("defaultAgentDir is repo-local, not a home dir", () => {
  const dir = defaultAgentDir("team-factory");
  assertEquals(dir, `${Deno.cwd()}/.swamp/pi-agent/team-factory`);
});

Deno.test("assistantError surfaces an error assistant turn", () => {
  assertEquals(
    assistantError([
      { role: "user" },
      { role: "assistant", stopReason: "stop" },
      {
        role: "assistant",
        stopReason: "error",
        errorMessage: "401: Missing Authentication header",
      },
    ]),
    "401: Missing Authentication header",
  );
});

Deno.test("assistantError ignores a clean final turn", () => {
  assertEquals(
    assistantError([
      { role: "assistant", stopReason: "stop" },
      { role: "toolResult" },
    ]),
    undefined,
  );
  assertEquals(assistantError([]), undefined);
});

Deno.test("isDirectChild distinguishes cwd from ancestor files", () => {
  assertEquals(isDirectChild("/repo/AGENTS.md", "/repo"), true);
  assertEquals(isDirectChild("/repo/sub/AGENTS.md", "/repo"), false);
  assertEquals(isDirectChild("/AGENTS.md", "/repo"), false);
  assertEquals(isDirectChild("/repo/AGENTS.md", "/repo/"), true);
});

Deno.test("resolveCwd passes absolute paths through", () => {
  assertEquals(resolveCwd("/var/tmp/x"), "/var/tmp/x");
});

Deno.test("resolveCwd normalizes relative paths against the repo dir", () => {
  const base = Deno.cwd();
  assertEquals(resolveCwd("."), base);
  assertEquals(resolveCwd("sub/../sub2"), `${base}/sub2`);
});

Deno.test("tokenDelta subtracts cumulative snapshots", () => {
  const before = {
    userMessages: 1,
    tokens: { input: 100, output: 10, cacheRead: 5, cacheWrite: 2, total: 117 },
    cost: 1,
  };
  const after = {
    userMessages: 2,
    tokens: { input: 160, output: 25, cacheRead: 7, cacheWrite: 2, total: 194 },
    cost: 1.5,
  };
  assertEquals(tokenDelta(before, after), {
    input: 60,
    output: 15,
    cacheRead: 2,
    cacheWrite: 0,
    total: 77,
  });
});

Deno.test("tokenDelta clamps a session reset to zero", () => {
  const before = {
    userMessages: 5,
    tokens: { input: 900, output: 90, cacheRead: 0, cacheWrite: 0, total: 990 },
    cost: 9,
  };
  const after = {
    userMessages: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
  };
  assertEquals(tokenDelta(before, after), {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  });
});
