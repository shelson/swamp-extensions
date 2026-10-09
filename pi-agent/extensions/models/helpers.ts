/**
 * Pure helpers for @shelson/pi-agent.
 *
 * Kept free of the pi SDK import so unit tests can exercise them without
 * granting Deno env/process permissions (chalk touches `process.env` at module
 * load).
 *
 * @module
 */

/** Token accounting shape shared with pi's `SessionStats.tokens`. */
export type Tokens = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

/** Structural view of pi's `SessionStats` (avoids a cross-package type import). */
export type StatsLike = {
  userMessages: number;
  tokens: Tokens;
  cost: number;
};

/** Clamp a possibly-negative counter (session reset) to zero. */
export function nonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

/** Subtract a token snapshot pair into a per-run delta. */
export function tokenDelta(before: StatsLike, after: StatsLike): Tokens {
  return {
    input: nonNegative(after.tokens.input - before.tokens.input),
    output: nonNegative(after.tokens.output - before.tokens.output),
    cacheRead: nonNegative(after.tokens.cacheRead - before.tokens.cacheRead),
    cacheWrite: nonNegative(after.tokens.cacheWrite - before.tokens.cacheWrite),
    total: nonNegative(after.tokens.total - before.tokens.total),
  };
}

/**
 * Extract the error from a failed final assistant turn.
 *
 * pi resolves `prompt()` normally on API/LLM failures and instead records an
 * assistant message with `stopReason: "error"` and an `errorMessage`. Callers
 * must inspect the transcript, or an empty failed turn looks like success.
 */
export function assistantError(
  messages: readonly unknown[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as {
      role?: string;
      stopReason?: string;
      errorMessage?: string;
    };
    if (message?.role !== "assistant") continue;
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      return message.errorMessage ??
        `assistant turn ended with stopReason "${message.stopReason}"`;
    }
    return undefined;
  }
  return undefined;
}

/** Resolve a possibly-relative working directory against the swamp repo dir. */
export function resolveCwd(cwd: string): string {
  if (cwd.startsWith("/")) return cwd;
  const segments: string[] = [];
  for (const segment of `${Deno.cwd()}/${cwd}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

/** True when `filePath` sits directly in `dir` (not in a subdirectory). */
export function isDirectChild(filePath: string, dir: string): boolean {
  const base = dir.endsWith("/") ? dir.slice(0, -1) : dir;
  if (!filePath.startsWith(`${base}/`)) return false;
  return !filePath.slice(base.length + 1).includes("/");
}

/** Reduce an arbitrary instance name to a safe single path segment. */
export function sanitizeName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\-]+/, "") // strip leading dots/dashes so "."/".."/".x" can't traverse
    .replace(/[.\-]+$/, "");
  return cleaned || "default";
}

/**
 * Deterministic, repo-local config home for one pi-agent instance.
 *
 * Deliberately under the swamp repo (`.swamp/pi-agent/…`) so a moved or shared
 * repo carries its own agent state, and the running user's `~/.pi` is never
 * consulted or written.
 */
export function defaultAgentDir(
  instanceName: string,
  root: string = resolveCwd(".swamp/pi-agent"),
): string {
  return resolveCwd(`${root}/${sanitizeName(instanceName)}`);
}
