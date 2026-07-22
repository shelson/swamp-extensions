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
- Vendor extension fields (the compose-spec `x-` prefix) and any field the
  active schema doesn't yet recognize are always passed through unvalidated —
  a stale or incomplete schema should never silently corrupt data, only
  decline to check it.

## Setup

1. Pull the extension:

   ```bash
   swamp extension pull @shelson/compose-project
   ```

2. Create a project instance:

   ```bash
   swamp model create @shelson/compose/project my-stack --global-arg projectName=my-stack
   ```

## Usage

```bash
# Populate from an existing compose file — services, volumes, networks, and
# any other top-level keys become project parameters. Rejected atomically
# (no partial writes) if the file fails schema validation.
swamp model method run my-stack importFromFile --input path=./docker-compose.yml

# Manage services
swamp model method run my-stack createService --input name=web
swamp model method run my-stack listServices

# Per-service configuration (validated against the compose-spec service schema)
echo '{"serviceName":"web","key":"ports","value":["8080:80"]}' \
  | swamp model method run my-stack createServiceParameter --stdin

# Volumes and networks
echo '{"name":"db-data","options":{"driver":"local"}}' \
  | swamp model method run my-stack createVolume --stdin

# Project-level parameters (version, configs, secrets, x-* extensions, ...)
echo '{"key":"version","value":"3.9"}' \
  | swamp model method run my-stack createParameter --stdin

# Refresh the compose-spec schema from upstream when you need a newer field
swamp model method run my-stack updateSchema --verbose
```

## Methods

| Method                                                                 | Description                                                                    |
| ----------------------------------------------------------------------| ------------------------------------------------------------------------------|
| `updateSchema`                                                        | Fetch and cache the latest compose-spec schema from compose-go                |
| `importFromFile`                                                      | Bulk import services/volumes/networks/parameters from a compose file          |
| `createService` / `listServices` / `getService` / `updateService` / `deleteService` | Manage services linked to the project                           |
| `createServiceParameter` / `listServiceParameters` / `getServiceParameter` / `updateServiceParameter` / `deleteServiceParameter` | Per-service key/value configuration |
| `createVolume` / `listVolumes` / `getVolume` / `updateVolume` / `deleteVolume` | Volume definitions                                              |
| `createNetwork` / `listNetworks` / `getNetwork` / `updateNetwork` / `deleteNetwork` | Network definitions                                         |
| `createParameter` / `listParameters` / `getParameter` / `updateParameter` / `deleteParameter` | Project-level key/value configuration              |

## Global Arguments

| Argument      | Required | Description                                     |
| ------------- | :------: | ------------------------------------------------ |
| `projectName` |   yes    | Compose project name (`COMPOSE_PROJECT_NAME`)     |

## Stored Resources

| Resource                              | Description                                             |
| ---------------------------------------| ---------------------------------------------------------|
| `services` / `service`                 | Linked services (list + per-service record)             |
| `serviceParameters` / `serviceParameter`| Per-service key/value configuration                      |
| `volumes` / `volume`                   | Volume definitions                                       |
| `networks` / `network`                 | Network definitions                                      |
| `parameters` / `parameter`             | Project-level key/value configuration                    |
| `composeSchema`                        | Active compose-spec schema cache (written by updateSchema)|

## License

MIT
