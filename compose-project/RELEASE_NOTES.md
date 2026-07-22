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
