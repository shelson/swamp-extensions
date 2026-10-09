# @shelson/pi-agent

## 2026.09.26.2

- Packaging fix: `isolation.ts` is imported for value so it ships with the
  published source. Previously the side-effect-only import was dropped from the
  package, leaving the pulled source with a dangling import (the prebuilt bundle
  masked it until a re-bundle). No schema change.

## 2026.09.26.1 — initial release

Run the pi coding agent from swamp workflows via its in-process TypeScript SDK.

- `run` — launch or continue a session, send one prompt, capture response text,
  tool calls, token usage, and cost as structured swamp data.
- `models` — list models reachable with the configured credentials.
- `sessions` — list persisted pi sessions for a working directory.
- `skills` — give an agent an explicit skill set (paths to `SKILL.md` dirs or
  `.md` files), independent of cwd discovery.
- `contextFiles` — `cwd` | `ancestors` | `off`.

Hermetic by design: `provider`, `model`, and a vault-sourced `apiKey` are
required, and the running user's `~/.pi` is never read or written.