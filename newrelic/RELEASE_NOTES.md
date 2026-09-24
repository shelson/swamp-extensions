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
