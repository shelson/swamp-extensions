## 2026.10.10.1

**Added:** Discovery and read-back methods that wrap NerdGraph listings in a
single lock acquisition (factory pattern), instead of one `lookup` call per
entity:

- `discoverAll` on every entity type (account, dashboard, alert policy, alert
  condition, muting rule, workflow, notification destination, notification
  channel, synthetic monitor, private location) — pages the listing and writes
  every item as its own resource instance, capped (default 2000) with a
  `truncated` marker.
- `getDefinition` / `getDefinitions` on dashboards — fetch full pages/widgets
  and bulk-fetch several dashboards by guid.
- `tag` on dashboards — apply NerdGraph tags to a dashboard and refresh stored
  state.

No `globalArguments` changes; existing instances upgrade via a no-op entry.

**Hardened:**

- The HTTPS endpoint guard now lives in the NerdGraph client, so every method
  (including the new `tag` mutation and read-only lookups) refuses to send the
  API key over plain HTTP — not just `create`/`update`/`delete`.
- `discoverAll` writes a `discovery` / `last-run` summary
  (`{ truncated, count, fetchedAt }`) so a capped listing is visible in data,
  not just in a log line.
- `getDefinitions` now fails the run when every chunk fails instead of reporting
  success; `getDefinition` raises `NotFoundError` for a guid that is not a
  dashboard.
- Factory methods log on entry and completion; `getDefinitions` records chunk
  failures at `warning` level.

## 2026.09.25.1

**Fixed:** Model types now appear in the swamp-club catalog. The registry reads
the model `version` statically from the `export const model` block; it was only
set inside the shared model factory, so every type was skipped and the extension
showed up as skills-only. Each model now declares `type` and `version` directly
in its export block, and a test keeps those literals in sync with
`manifest.yaml`. No runtime behaviour changed.

**Added:** Initial release of `@shelson/newrelic` — ten model types wrapping the
New Relic NerdGraph GraphQL API (`https://api.newrelic.com/graphql`):

- `@shelson/newrelic-dashboard`
- `@shelson/newrelic-alert-policy`
- `@shelson/newrelic-alert-condition` (`STATIC` / `BASELINE` / `OUTLIER`)
- `@shelson/newrelic-muting-rule`
- `@shelson/newrelic-workflow`
- `@shelson/newrelic-notification-destination`
- `@shelson/newrelic-notification-channel`
- `@shelson/newrelic-synthetic-monitor`
- `@shelson/newrelic-private-location`
- `@shelson/newrelic-account` (read-only lookup + ad-hoc NRQL)

Each entity type exposes a `create` / `update` / `delete` / `lookup` lifecycle
plus a zero-argument `sync` for drift detection. Mutating methods run a
`credentials` pre-flight check (labelled `policy`) that refuses a non-HTTPS
endpoint. `delete` is idempotent, a uniqueness conflict on `create` returns the
existing entity, and rate-limited (HTTP 429) requests are retried honouring
`Retry-After`.
