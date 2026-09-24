---
name: newrelic-models
description: >
  Use when working with the @shelson/newrelic swamp model types — dashboards,
  alert policies, alert conditions, muting rules, workflows, notification
  destinations and channels, synthetic monitors, private locations, and account
  permissions — or when adding a new New Relic model type from the NerdGraph
  schema. Triggers on "new relic model", "@shelson/newrelic", "nerdgraph",
  "add a new relic entity type", "test a new relic model".
---

# @shelson/newrelic model types

Ten model types wrapping the New Relic NerdGraph API
(`https://api.newrelic.com/graphql`). All share global arguments
`accountId`, `apiKey` (USER key, sensitive — supply via vault expression), and
`endpoint`, and the same `create` / `update` / `delete` / `lookup` lifecycle plus
a zero-arg `sync` for drift detection
(`@shelson/newrelic-account` is `lookup` + `nrql`). Mutating methods run a
`credentials` pre-flight check labelled `policy`. State is written to one `state`
resource instance named `current`:
`data.latest("<model>", "current").attributes.<field>`.

Need ad-hoc NRQL? Don't hand-roll HTTP — run `nrql` on the account model. It
stores each result as a `query` resource instance named by the `name` argument
(default `result`), so several queries sit side by side and stay referenceable:
`swamp model method run <account> nrql --input query="SELECT ..." --input name=tx`
then `data.latest("<account>", "tx").attributes.results`.

Run `swamp model type describe @shelson/newrelic-<type> --json` for exact method
arguments before use.

## ALWAYS smoke-test in a dedicated non-production account

Every smoke test, experiment, or first run of a `create` / `update` / `delete`
method MUST target a dedicated, non-production New Relic account. Never
smoke-test against a shared production account — these models create and delete
real alerting, notification and synthetics configuration, and a stray `delete`
in a live account silences production alerts.

Read-only `lookup` calls against other accounts are fine.

Clean up after yourself: delete any test entity you created, then delete the
smoke-test model instance (`swamp model delete <name> --force`) so no API key
is left in `models/`.

## How the model types are built from the schema

The introspected NerdGraph schema lives in `swamp/schemafiles/`
(`newrelic-schema.json` plus trimmed `types-*.graphql` slices and `sdl.jq` to
regenerate a slice). Use it — don't guess field names.

To add a new entity type:

1. Find the mutations and the account query field in the schema slice, e.g.
   `jq -r --arg re '^Alerts' -f sdl.jq newrelic-schema.json`.
2. Add `extensions/models/newrelic/<entity>.ts` using `nrModel()` from
   `nerdgraph.ts`. Each method's `run(args, nr)` issues one `nr.query(...)`
   and returns the attributes to store, or `null` to drop stored state
   (that's what `delete` does).
3. Mirror the NerdGraph `*Input` type in the Zod arguments — use
   `z.looseObject({...})` for nested structures rather than re-modelling
   pages, widgets, terms or filters. The schema is the contract.
4. Collapse variants into one type with a discriminator rather than adding one
   type per variant (see `conditionType` on alert conditions and `monitorType`
   on synthetic monitors, which pick the mutation name).
5. New Relic returns HTTP 200 with per-mutation `errors` arrays — always select
   `errors` and pass the payload to `assertNoErrors()`, or failures look like
   successes. Some payloads type `errors` as a union: select
   `errors { ... on AiNotificationsResponseError { description type } }`.
6. Mark secrets (private location `key`, credentials) with
   `z.meta({ sensitive: true })` so swamp vaults them.
7. Add the file to `manifest.yaml` `models:`, then
   `~/.swamp/deno/deno check`, `swamp extension fmt manifest.yaml`, and smoke
   test in the dedicated non-production account.

## Gotchas found the hard way

- Omit optional filter fields entirely rather than passing `null` —
  `nrqlConditionsSearch` rejects an explicit null `policyId` with
  `must be of type Long but was 'NaN'`.
- Muting rules have no server-side name filter; `lookup` by name lists and
  matches client-side.
- Notification channel `name` filtering is a substring match — prefer the exact
  hit.
- Private locations are not a schema entity type but are searchable via
  `entitySearch` with `domain = 'SYNTH' AND type = 'PRIVATE_LOCATION'`.
- `SyntheticCheck.duration` on ping (`SIMPLE`) monitors is in **milliseconds**,
  not seconds like browser/scripted monitors — label widgets (`ms`) accordingly.
