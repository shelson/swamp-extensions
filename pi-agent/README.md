# @shelson/pi-agent

Run the [pi coding agent](https://github.com/badlogic/pi-mono) from swamp
workflows via its in-process TypeScript SDK. No subprocess, no terminal
scraping: the agent runs inside the swamp process, and its response, tool calls,
token usage, and cost land as structured swamp data.

Sessions are pi's persistent JSONL sessions, so successive runs with the same
`sessionKey` continue the same conversation. Give each concurrent work item its
own key so they don't share context.

The agent is **hermetic**: it takes an explicit provider/model/key and never
reads the running user's `~/.pi` (credentials, skills, extensions, sessions).
See [Isolation](#isolation).

## Install

```bash
swamp extension pull @shelson/pi-agent
```

Or, for local development, the source already lives under
`extensions/models/pi-agent/` and loads automatically.

## Quick start

```bash
# Store the provider key in a vault once
swamp vault create local_encryption my-vault --json
swamp vault put my-vault OPENROUTER_API_KEY   # prompts for the value

swamp model create @shelson/pi-agent my-agent \
  --global-arg cwd=/path/to/repo \
  --global-arg provider=openrouter \
  --global-arg model=deepseek/deepseek-v4.1-flash \
  --global-arg 'apiKey=${{ vault.get("my-vault", "OPENROUTER_API_KEY") }}' \
  --json

swamp model method run @shelson/pi-agent run my-agent \
  --input 'prompt=Summarize what this repository does.' \
  --json
```

Read the result back:

```bash
swamp data get my-agent run-default --json
swamp data get my-agent session-default --json
```

## Configuration (`globalArguments`)

| Argument                                                          | Default                              | Purpose                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `provider`                                                        | required                             | Provider id, e.g. `openrouter`.                                                                                    |
| `model`                                                           | required                             | Model id within the provider, e.g. `deepseek/deepseek-v4.1-flash`.                                                 |
| `apiKey`                                                          | required                             | Provider API key (sensitive). Wire from a vault with `${{ vault.get("vault", "KEY") }}`.                            |
| `cwd`                                                             | `.`                                  | Working directory for tools and project resource discovery. Relative paths resolve against the swamp repo dir.     |
| `thinkingLevel`                                                   | `medium`                             | `off`, `low`, `medium`, or `high`.                                                                                 |
| `agentDir`                                                        | `<repo>/.swamp/pi-agent/<instance>`  | Isolated config dir (auth, models store, global resources). The user's `~/.pi` is never read or written.           |
| `modelsPath`                                                      | disabled                             | Optional explicit `models.json` for custom model definitions.                                                      |
| `tools` / `excludeTools` / `noTools`                              | pi defaults                          | Control the active tool set.                                                                                       |
| `noExtensions`, `noSkills`, `noPromptTemplates`                   | `false`                              | Skip cwd resource discovery to start completely clean.                                                             |
| `contextFiles`                                                    | `cwd`                                | `cwd` (working dir only), `ancestors` (walk parent dirs like pi), or `off`.                                        |
| `skills`                                                          | `[]`                                 | Extra skill paths (a dir with `SKILL.md`, or a single `.md` file), added even in clean mode.                        |
| `systemPrompt` / `appendSystemPrompt`                             | —                                    | Replace or extend the system prompt.                                                                               |
| `sessionDir`                                                      | `<agentDir>/sessions`                | Where persistent session files live.                                                                               |
| `persistSessions`                                                 | `true`                               | Set `false` for throwaway in-memory conversations.                                                                 |
| `defaultTimeoutMs`                                                | `600000`                             | Abort a run that exceeds this wall-clock budget.                                                                   |

## Isolation

The agent never reads the running user's `~/.pi`:

- **Credentials** are the instance's explicit `apiKey`, applied as a runtime
  provider key. The SDK's credential store points at `<agentDir>/auth.json`
  (kept empty), so it never falls back to pi's auth store or another provider's
  ambient environment credentials.
- **Custom models** are disabled unless you pass `modelsPath`.
- **Global resources** come only from `<agentDir>` (empty by default). The SDK's
  process-wide default config dir is redirected off `~/.pi` before import, so
  even its tool-binary cache stays in-repo.
- **Sessions** live in `<agentDir>/sessions`.

Resource discovery is therefore deterministic: the agent starts clean and loads
only project resources from `cwd` — `cwd/.pi/{skills,prompts,themes,extensions}`
and `AGENTS.md` / `CLAUDE.md` context files. Set `noSkills` / `noExtensions` /
`noPromptTemplates` and `contextFiles: off` to start with nothing at all.

### Giving an agent a specific set of skills

The `skills` argument points the agent at explicit skill paths — each is either
a directory containing `SKILL.md` or a single `.md` skill file:

```bash
swamp model create @shelson/pi-agent reviewer \
  --global-arg 'skills=["skills/adversarial-review", "skills/security-review.md"]' \
  --global-arg noSkills=true \
  ...
```

With `noSkills: true` the agent gets *only* the listed skills (no cwd `.pi/skills`
discovery); leave it `false` to add them on top of project skills. Paths resolve
against the swamp repo dir, so they travel with the checkout. Everything else
still lives in the isolated `agentDir`, so this never touches the operator's
`~/.pi`.

The default `agentDir` is repo-local, so a moved or shared checkout carries its
own agent state rather than silently inheriting the operator's setup.

## Methods

### `run`

Launch or continue a session, send one prompt, and capture the turn.

| Argument                                                                              | Default     | Purpose                                                          |
| ------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `prompt`                                                                              | required    | Message to send.                                                 |
| `sessionKey`                                                                          | `default`   | Conversation identity; same key continues the same session.      |
| `sessionFile`                                                                         | stored      | Explicit pi session file to continue, overriding the stored one. |
| `newSession`                                                                          | `false`     | Ignore the stored session and start fresh.                       |
| `model`, `thinkingLevel`, `systemPrompt`, `cwd`, `tools`, `excludeTools`, `timeoutMs` | from config | Per-run overrides.                                               |

Produces two resources:

- `session-<key>` — conversation summary: `sessionId`, `sessionFile`, `model`,
  `status`, `turns`, `lastText`, cumulative `tokens` and `cost`.
- `run-<key>` — the turn: `prompt`, `text`, `toolCalls`, per-run `tokens` and
  `cost`, `durationMs`, `success`, `timedOut`, `error`.

### `models`

Writes a `catalog` resource listing every model available with the configured
credentials (`provider`, `id`, `name`).

### `sessions`

Writes a `sessionList` resource of persisted pi sessions for a working
directory. Arguments: `cwd`, `limit` (default 50).

## Multi-turn workflow

Because a run records its session file on `session-<key>`, a later step can
continue the conversation by key alone — no need to thread the file through:

```yaml
steps:
  - name: ask
    model: my-agent
    method: run
    inputs:
      sessionKey: issue-42
      prompt: Read the failing test and propose a fix.
  - name: refine
    model: my-agent
    method: run
    inputs:
      sessionKey: issue-42
      prompt: Now apply the smallest change that makes it pass.
```

Downstream steps can read the result with CEL:

```cel
data.latest("my-agent", "run-default").attributes.text
```

## Development

```bash
~/.swamp/deno/deno check extensions/models/pi-agent/pi_agent.ts
~/.swamp/deno/deno lint  extensions/models/pi-agent/*.ts

# Pure helpers — no permissions needed
~/.swamp/deno/deno test  extensions/models/pi-agent/pi_agent_test.ts

# run orchestration/failure path (imports the SDK, needs process access)
~/.swamp/deno/deno test --allow-env --allow-read --allow-write --allow-sys \
  extensions/models/pi-agent/pi_agent_run_test.ts
```

The pi SDK is pinned to `@earendil-works/pi-coding-agent@0.87.1`; bump the
inline `npm:` specifier deliberately when upgrading.
