/**
 * Repo-local base for all pi-agent isolation state.
 *
 * Importing this module redirects pi's process-wide config dir away from the
 * running user's `~/.pi`. The SDK's tools-manager captures `getAgentDir()/bin`
 * at module load, so this must evaluate before the SDK import — and the export
 * is imported for value by `pi_agent.ts` so the publisher ships this file
 * (side-effect-only imports are not packaged).
 *
 * @module
 */

/** Repo-local root for all pi-agent state: `<repo>/.swamp/pi-agent`. */
export const PI_AGENT_ROOT = `${Deno.cwd()}/.swamp/pi-agent`;

try {
  if (!Deno.env.get("PI_CODING_AGENT_DIR")) {
    Deno.env.set("PI_CODING_AGENT_DIR", `${PI_AGENT_ROOT}/_home`);
  }
} catch {
  // No env permission (e.g. `deno doc`/`deno check`). The SDK needs env anyway,
  // so any caller that actually runs a session will grant it.
}
