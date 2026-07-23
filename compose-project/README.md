# @shelson/compose-project

A [swamp](https://github.com/swamp-club/swamp) extension model that tracks a
Docker Compose project's structure — services, volumes, networks, and
flexible key/value configuration — as swamp-managed data.

This model is **data-only**: it does not run `docker compose` itself. Pair it
with `@keeb/docker/compose` for actual lifecycle execution once a project's
structure is defined here.

Every parameter, service field, and volume/network option is validated
against the official [compose-spec JSON
Schema](https://github.com/compose-spec/compose-go/blob/main/schema/compose-spec.json)
before it's written, so a typo or malformed value (wrong type, misspelled
field) is rejected at write time instead of surfacing later as a broken
`docker compose` run.

- A snapshot of the schema ships **bundled** with this extension, so
  validation works fully offline the moment you install it — no setup step,
  no first-run network call.
- Run the `updateSchema` method on an instance to refresh the cached schema
  from the canonical compose-go repository when you need a field the bundled
  snapshot doesn't know about yet. The refreshed copy is versioned instance
  data (`swamp data versions <instance> active`), so you can inspect or roll
  back to a previous schema version at any time.
- Vendor extension fields (the compose-spec `x-` prefix) are always passed
  through unvalidated. Any other field the active schema doesn't recognize —
  including one that's newer than the bundled/cached snapshot — is rejected
  at write time; run `updateSchema` and retry to pick up fields the canonical
  compose-spec has added since the snapshot was taken.

A rendered `compose.yaml` is always kept current as the `composeFile` data
attribute: every method that changes project structure (`importFromFile` and
every create/update/delete method) re-renders it as part of the same call.
You never need to call a separate render step before other code reads
`composeFile` — it's never stale.

- `renderComposeFile` still exists for forcing a fresh render with no other
  side effect (e.g. after `updateSchema`, to re-validate the current
  structure against a refreshed schema), but you shouldn't need it in normal
  use.

## Setup

**1. Pull the extension:**

```bash
swamp extension pull @shelson/compose-project
```

**2. Create a project instance:**

```bash
swamp model create @shelson/compose/project my-stack --global-arg projectName=my-stack
```

## Usage

```bash
# Populate from an existing compose file — services, volumes, networks, and
# any other top-level keys become project parameters. Rejected atomically
# (no partial writes) if the file fails schema validation.
swamp model method run my-stack importFromFile --input path=./docker-compose.yml

# Manage services (create/delete only — every field lives as a parameter,
# see below, so there's nothing else to "update" on the link itself)
swamp model method run my-stack createService --input name=web

# Per-service configuration (validated against the compose-spec service schema)
echo '{"serviceName":"web","key":"ports","value":["8080:80"]}' \
  | swamp model method run my-stack createServiceParameter --stdin

# Volumes and networks follow the identical create/delete + parameter
# pattern as services
swamp model method run my-stack createVolume --input name=db-data
echo '{"volumeName":"db-data","key":"driver","value":"local"}' \
  | swamp model method run my-stack createVolumeParameter --stdin

swamp model method run my-stack createNetwork --input name=backend
echo '{"networkName":"backend","key":"driver","value":"bridge"}' \
  | swamp model method run my-stack createNetworkParameter --stdin

# Project-level parameters (version, configs, secrets, x-* extensions, ...)
echo '{"key":"version","value":"3.9"}' \
  | swamp model method run my-stack createProjectParameter --stdin

# Refresh the compose-spec schema from upstream when you need a newer field
swamp model method run my-stack updateSchema --verbose

# composeFile is already current after any of the calls above — read it directly
swamp data get my-stack composeFile --json

# Force a fresh render with no other side effect (e.g. right after updateSchema)
swamp model method run my-stack renderComposeFile

# No dedicated get/list methods — read model data directly
swamp data get my-stack service-web --json
swamp data list my-stack
```

## Methods

Services, volumes, and networks all follow the same pattern: create/delete
the link, then create/update/delete its fields one key at a time as
parameters (validated against the compose-spec definition for that kind).
There are no `get`/`list` methods — use `swamp data get` / `swamp data list`
to read model data directly.

| Method                                                                 | Description                                                                    |
| ----------------------------------------------------------------------| ------------------------------------------------------------------------------|
| `updateSchema`                                                        | Fetch and cache the latest compose-spec schema from compose-go                |
| `importFromFile`                                                      | Bulk import services/volumes/networks/parameters from a compose file, validated against the active schema before any write |
| `renderComposeFile`                                                   | Force a fresh compose.yaml render with no other side effect — every mutating method already does this automatically |
| `createService` / `deleteService`                                     | Link/unlink a service                                                          |
| `createServiceParameter` / `updateServiceParameter` / `deleteServiceParameter` | Per-service key/value configuration                                  |
| `createVolume` / `deleteVolume`                                       | Link/unlink a volume definition                                                |
| `createVolumeParameter` / `updateVolumeParameter` / `deleteVolumeParameter` | Per-volume key/value configuration                                        |
| `createNetwork` / `deleteNetwork`                                     | Link/unlink a network definition                                               |
| `createNetworkParameter` / `updateNetworkParameter` / `deleteNetworkParameter` | Per-network key/value configuration                                  |
| `createProjectParameter` / `updateProjectParameter` / `deleteProjectParameter` | Project-level (top-of-document) key/value configuration              |

## Global Arguments

| Argument      | Required | Description                                     |
| ------------- | :------: | ------------------------------------------------ |
| `projectName` |   yes    | Compose project name (`COMPOSE_PROJECT_NAME`)     |

## Stored Resources

| Resource                              | Description                                             |
| ---------------------------------------| ---------------------------------------------------------|
| `services` / `service`                 | Linked services (list + per-service record)             |
| `serviceParameters` / `serviceParameter`| Per-service key/value configuration                      |
| `volumes` / `volume`                   | Linked volumes (list + per-volume record)                |
| `volumeParameters` / `volumeParameter`  | Per-volume key/value configuration                       |
| `networks` / `network`                 | Linked networks (list + per-network record)              |
| `networkParameters` / `networkParameter`| Per-network key/value configuration                      |
| `parameters` / `parameter`             | Project-level key/value configuration                    |
| `composeSchema`                        | Active compose-spec schema cache (written by updateSchema)|
| `composeFile`                           | Rendered compose.yaml document — kept current automatically by every mutating method|

## License

MIT
