## 2026.06.28.2

**Added:** Completion summary log line (`Refresh complete`) at info level after
each run — reports mode, project count, candidates,
would-update/updated/up-to-date/failed/error counts in one structured entry.

**Added:** `host-reachable` pre-flight check (label: `live`) runs `docker info`
on every configured host before the `refresh` method executes. Unreachable hosts
fail the check with a descriptive error so the apply path never starts against a
host that can't be reached. Skip with `--skip-check-label live` for
offline/dry-run scenarios.

**Added:** Unit tests (`compose_refresher_test.ts`) covering the four pure
functions: `parseLsJson` (JSON array, NDJSON, single object, missing WorkingDir
derivation), `splitImageTag` (tagged, untagged, digest-pinned, host:port
prefix), `isCandidate` (tag match, untagged branch, non-candidate),
`compareDigests` (match, differ, container-inspect fallback to cache,
both-unavailable error path).
