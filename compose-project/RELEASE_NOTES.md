## 2026.07.23.6

**Changed:** `createServiceParameter`/`updateServiceParameter` (and the
volume/network/project equivalents) are collapsed into a single
`setServiceParameter`/`setVolumeParameter`/`setNetworkParameter`/`setProjectParameter`
upsert each — same schema validation, but no more picking the right verb for
whether the key already exists. `importFromFile` now calls the same upsert
primitive internally instead of a separate hand-rolled copy of the same
logic. Every `delete*` method (services, volumes, networks, and their
parameters) now succeeds as a no-op when the target is already gone instead
of throwing — safe to retry after a partial failure.
`createService`/`createVolume`/`createNetwork` are unchanged: still reject a
duplicate name.

**Fixed:** Service/volume/network names containing `::` could collide with
the internal parameter-instance storage path for a same-prefixed entity
(e.g. a service literally named `web::__params__` would silently overwrite
the parameter list of a service named `web`). Names containing `::` are now
rejected on `createService`/`createVolume`/`createNetwork` and up front in
`importFromFile`.

**Added:** Every method now logs on entry and on completion (previously only
4 of the methods logged anything, and only on completion). Two pre-flight
checks: `valid-project-name` (policy) rejects an invalid
`COMPOSE_PROJECT_NAME` before any data is written under it, and
`compose-spec-reachable` (live, `updateSchema` only) verifies the
compose-spec repository is reachable before attempting a schema refresh —
skip it in offline/CI environments with `--skip-check-label live`. Unit
test coverage via `@systeminit/swamp-testing` (previously none).

**Upgrade note:** No `upgrades` entry — `globalArguments` hasn't changed,
and this extension has never been published, so there are no existing
instances at an older `typeVersion` to migrate.

## 2026.07.23.5

**Changed:** Collapsed the method surface from 28 methods to 21.
`get`/`list` methods (`getService`, `listServices`, ...) are removed across
the board — read that data with `swamp data get`/`swamp data list` instead.
Volumes and networks no longer carry a whole-object `options` field with a
bespoke `updateVolume`/`updateNetwork`; they now follow the same
create/delete-the-link + per-key-parameter pattern as services, via new
`createVolumeParameter`/`updateVolumeParameter`/`deleteVolumeParameter` and
`createNetworkParameter`/`updateNetworkParameter`/`deleteNetworkParameter`
methods, each validated against the compose-spec definition for that kind.
`updateService` is removed along with the `description` field it used to
manage: it wasn't a real compose-spec field, nothing rendered it into
compose.yaml, and nothing in this repo consumed it, so it's dropped rather
than carried forward as a parameter special-case. Project-level parameter
methods are renamed `createParameter`/`updateParameter`/`deleteParameter` →
`createProjectParameter`/`updateProjectParameter`/`deleteProjectParameter`
for clarity now that "parameter" methods exist at four different scopes.

This is a breaking change: existing `service`/`volume`/`network` resource
data written under the old schema (with `description`/`options` fields) is
incompatible with the new shape, and any workflow or CEL expression calling
a removed method needs updating.

## 2026.07.23.4

**Added:** `composeFile` data attribute — a rendered compose.yaml document
assembled from the project's current services (with per-service
parameters), volumes, networks, and project-level parameters, validated
against the active compose-spec schema. It's the inverse of
`importFromFile`, and it's always current: every method that mutates
project structure (`importFromFile` and every create/update/delete method)
re-renders it as part of the same call, so any other code reading this
model's data never sees a stale compose.yaml. The `renderComposeFile`
method still exists for forcing a fresh render with no other side effect
(e.g. after `updateSchema`), but callers should not need to invoke it as a
separate step in normal use.

## 2026.07.23.2

**Added:** Initial release. Tracks a Docker Compose project's structure
(services, volumes, networks) and flexible key/value configuration as
swamp-managed data. Every parameter, service field, and volume/network
option is validated against the official compose-spec JSON Schema before
it's written. A schema snapshot ships bundled with the extension so
validation works fully offline out of the box; the `updateSchema` method
refreshes it from the canonical compose-go repository and caches the result
as versioned instance data. Data-only — pair with `@keeb/docker/compose` for
actual lifecycle execution.
