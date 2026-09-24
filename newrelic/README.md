# @shelson/newrelic

New Relic entity model types backed by NerdGraph (`https://api.newrelic.com/graphql`).
The introspected schema used to build these lives in `swamp/schemafiles/`.

## Quick start

```bash
# Install the extension
swamp extension pull @shelson/newrelic

# Create a dashboard model and look up an existing dashboard
swamp model create @shelson/newrelic-dashboard my-dashboard \
  --global-arg accountId=12345678 \
  --global-arg 'apiKey=${{ vault.get("nr", "apiKey") }}'
swamp model method run my-dashboard lookup --input name="My Dashboard"

# Create an alert policy
swamp model create @shelson/newrelic-alert-policy cpu-alerts
swamp model method run cpu-alerts create \
  --input name="CPU Alerts" --input incidentPreference="PER_CONDITION"

# Refresh stored state from New Relic (or mark it not_found if deleted)
swamp model method run my-dashboard sync
```

## Global arguments (all types)

| Arg | Notes |
| --- | --- |
| `accountId` | New Relic account ID (int) |
| `apiKey` | USER API key (`NRAK-…`), sensitive — supply via vault expression |
| `endpoint` | Defaults to `https://api.newrelic.com/graphql`; use the EU endpoint for EU accounts |

State is stored as a single `state` resource instance named `current`, so CEL
references read `data.latest("<model>", "current").attributes.<field>`.

## Model types

| Type | Methods |
| --- | --- |
| `@shelson/newrelic-account` | `lookup` (read-only: account, org, auth domains, groups, users), `nrql` (ad-hoc NRQL query) |
| `@shelson/newrelic-dashboard` | `create`, `update`, `delete`, `lookup` (by guid or exact name), `sync` |
| `@shelson/newrelic-alert-policy` | `create`, `update`, `delete`, `lookup` (by id or exact name), `sync` |
| `@shelson/newrelic-alert-condition` | `create`, `update`, `delete`, `lookup`, `sync`; `conditionType` = `STATIC` \| `BASELINE` \| `OUTLIER` |
| `@shelson/newrelic-muting-rule` | `create`, `update`, `delete`, `lookup` (name match is client-side), `sync` |
| `@shelson/newrelic-notification-channel` | `create`, `update`, `delete`, `lookup` (by id, or name ± `destinationId`), `sync` — source of the `channelId` workflows need |
| `@shelson/newrelic-notification-destination` | `create`, `update`, `delete`, `lookup` (by id or exact name), `sync` |
| `@shelson/newrelic-private-location` | `create`, `update`, `delete`, `lookup` (via entity search), `sync`; `key` is stored vaulted |
| `@shelson/newrelic-workflow` | `create`, `update`, `delete`, `lookup`, `sync` |
| `@shelson/newrelic-synthetic-monitor` | `create`, `update`, `delete`, `lookup`, `sync`; `monitorType` = `SIMPLE` \| `SIMPLE_BROWSER` \| `SCRIPT_API` \| `SCRIPT_BROWSER` \| `CERT_CHECK` \| `BROKEN_LINKS` \| `STEP` |

Nested inputs (dashboard pages/widgets, condition terms, monitor options,
workflow filters) are passed through to the matching NerdGraph `*Input` type
unchanged — the GraphQL schema is the contract.

## Refresh and resilience

Every entity type exposes a zero-argument `sync` for drift detection: it reads
the stored id/guid, re-fetches the entity from New Relic, and writes refreshed
state — or a `status: "not_found"` marker if the entity was deleted out of band.
Because it reads the stored id, a workflow can sync every instance without
knowing resource IDs up front.

Mutating methods (`create`/`update`/`delete`) run a `credentials` pre-flight
check that refuses a non-HTTPS `endpoint`, so the API key is never sent in clear
text. It is labelled `policy`, so skip it with `--skip-check-label policy`.

`delete` is idempotent — deleting an entity that is already gone clears state
and succeeds. A `create` that hits a uniqueness conflict returns the existing
entity rather than throwing. Rate-limited requests (HTTP 429) are retried
honouring `Retry-After`; read-only queries also retry transient 5xx.

NRQL note: `SyntheticCheck.duration` for ping (`SIMPLE`) monitors is reported in
**milliseconds**, unlike browser/scripted monitors where it is seconds — label
dashboard widgets accordingly.

## Ad-hoc NRQL

`@shelson/newrelic-account` carries an `nrql` method so you can query the account
without hand-rolling a NerdGraph request. Each result is stored as a `query`
resource instance named by `name` (default `result`), so several queries can be
kept side by side:

```bash
swamp model method run my-account nrql \
  --input query="SELECT count(*) FROM Transaction SINCE 1 hour ago" --input name=tx
swamp data get my-account tx
```

Reference the results with
`data.latest("my-account", "tx").attributes.results`.

## CEL expression reference

```cel
# Read the latest dashboard state
data.latest("my-dashboard", "current").attributes.guid

# Chain alert condition onto a policy
data.latest("cpu-alerts", "current").attributes.id
```

## Not included

Secure credentials and user/group writes.

## Smoke tested

Live against a dedicated non-production account: `lookup` for all ten types, plus full
`create`/`update`/`delete` round-trips for dashboard, notification destination,
notification channel, muting rule and private location. Alert policy/condition, workflow and
synthetic monitor writes are schema-checked against the introspected schema but
not yet run live.
