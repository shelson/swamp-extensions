# @shelson/compose-refresher

Keep `:latest`-tagged (and untagged) services in local or SSH-reachable Docker
Compose projects up to date.

This is a single fan-out model, `@shelson/compose-refresher`, with one method,
`refresh`. For each configured host it discovers every running compose project,
resolves each service's image ref, keeps only those whose tag is in `matchTags`
(default `["latest"]`, plus untagged refs since Docker treats those as
`:latest`), and — in apply mode — pulls the image and recreates the service only
when the running container is actually stale.

## What makes it accurate

Rather than blindly pulling every `:latest` service, `refresh` compares each
**running container's** image digest against the registry's current manifest
digest:

- **Container side:** `docker container inspect <c> --format '{{.Image}}'` →
  `docker image inspect <id> --format '{{index .RepoDigests 0}}'`
- **Registry side:**
  `docker buildx imagetools inspect <img> --format '{{json .Manifest.Digest}}'`

Comparing the _running container's_ image (not the locally cached `:latest` tag)
means a stale container — e.g. one whose recreate failed after a pull refreshed
the cache — is correctly reported as needing an update, not masked as "up to
date".

In dry-run mode this yields an accurate preview of what _would_ change. In apply
mode, `docker compose up -d` (no `--force-recreate`) is used so compose only
restarts a service when the pulled digest actually differs from the running
container's — already-current services are left untouched.

## Transport

- `local` — runs `docker` directly via `Deno.Command` (zero setup).
- `ssh` — runs the identical `docker` invocation on the remote over SSH, with
  the command base64-encoded so the remote login shell never touches
  metacharacters. Adding a remote host is a config change, not a code change.
  SSH port is optional; omitting it lets `~/.ssh/config` (e.g. a `Port` entry)
  apply, matching what a plain `ssh user@host` would do.

`sudo: true` on a host prefixes every docker command with passwordless `sudo`
(e.g. for Synology DSM, where docker lives under `/usr/local/bin` and needs
root).

## Global arguments

| Argument                | Default      | Description                                                                     |
| ----------------------- | ------------ | ------------------------------------------------------------------------------- |
| `hosts`                 | _(required)_ | Array of `{ name, transport, sshHost?, sshUser, identityFile?, sudo?, port? }`  |
| `matchTags`             | `["latest"]` | Image tags (after the colon) that trigger a refresh                             |
| `alsoRefreshUntagged`   | `true`       | Also refresh image refs with no explicit tag                                    |
| `denyImagePatterns`     | `[]`         | Case-insensitive substrings; matching images are never refreshed                |
| `maxPerRun`             | `0`          | Hard cap on refreshes per run. `0` = unlimited                                  |
| `healthCheckTimeoutSec` | `60`         | Seconds to wait for a recreated container to reach running/healthy              |
| `dockerBin`             | `"docker"`   | Docker binary name/path on each host (pin to an absolute path when not in PATH) |

## Method: `refresh`

| Argument       | Default | Description                                            |
| -------------- | ------- | ------------------------------------------------------ |
| `apply`        | `false` | If true, pull + recreate. If false, dry-run.           |
| `skipImages`   | `[]`    | Image refs to spare this run (exact match).            |
| `onlyProjects` | `[]`    | Restrict to these compose project names (empty = all). |
| `onlyHosts`    | `[]`    | Restrict to these host names (empty = all).            |

## Output: `update_log`

Per-run log (dry-run or applied) with rollup counts and a per-service `actions`
array. Each action records `decision`, `digestLocal`, `digestRegistry`,
`recreated`, and durations. Possible decisions:

| Decision                                                   | Meaning                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `up_to_date`                                               | Running container's digest matches the registry — nothing to do      |
| `would_update`                                             | Digests differ; would pull + recreate (dry-run)                      |
| `updated`                                                  | Pulled and recreated (digest changed)                                |
| `updated_no_change`                                        | Pulled; compose did not recreate (digest unchanged)                  |
| `digest_check_failed`                                      | Could not determine local and/or registry digest (e.g. rate-limited) |
| `failed_pull`/`failed_up`                                  | Pull or `up -d` failed                                               |
| `unhealthy_after`                                          | Recreated but did not reach running/healthy within the timeout       |
| `skipped_by_user`/`skipped_by_denylist`/`skipped_over_cap` | Filtered out                                                         |
| `error`                                                    | Unexpected error (e.g. no container name, no node IP)                |

`projectErrors` records per-project failures (e.g. a `.env` file the SSH user
can't read) without aborting the rest of the run.

## Example

```bash
# Dry-run a local host
swamp model @shelson/compose-refresher method run refresh my-host \
  --input 'hosts:json=[{"name":"localhost","transport":"local"}]'

# Apply on a remote host that needs sudo and a pinned docker path
swamp model @shelson/compose-refresher method run refresh my-nas \
  --input 'hosts:json=[{"name":"nas","transport":"ssh","sshHost":"nas","sshUser":"admin","sudo":true}]' \
  --input dockerBin=/usr/local/bin/docker \
  --input apply=true
```

## Auth

No registry credentials are needed — `docker compose pull` and
`buildx imagetools inspect` use whatever auth the docker host already has
configured. SSH uses the invoking user's default key/agent (or an explicit
`identityFile`).

## License

MIT — see [LICENSE](./LICENSE).
