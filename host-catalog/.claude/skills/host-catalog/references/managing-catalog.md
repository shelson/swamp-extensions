# Managing a Host Catalog

Full method reference and merge semantics for `@shelson/catalog`. Read
[../SKILL.md](../SKILL.md) first for the quick-start version.

## Resources

One model instance holds the whole catalog. It stores four kinds of
resource, all scoped to that instance:

| Resource   | Instance name        | Shape                                              |
| ---------- | --------------------- | --------------------------------------------------- |
| `global`   | `global` (singleton)   | `{ metadata }`                                      |
| `host`     | `host-<name>`          | `{ name, groups: string[], metadata }`               |
| `group`    | `group-<name>`         | `{ name, metadata }`                                 |
| `resolved` | `resolved-<host-name>` | `{ host, metadata, resolvedAt }` — effective metadata |

`metadata` is `Record<string, ScalarOrList>` where a scalar is
`string | number | boolean` and a list is an array of scalars of the same
kind conceptually (the schema doesn't enforce homogeneity, but mixed-type
lists aren't a supported use case).

Membership lives only on the host side (`host.groups`) — there's no reverse
`group.members` list. "Which hosts are in group X" is answered by scanning
hosts, which is what `resolveMetadata`/`removeGroup`/etc. do internally via
`data.findBySpec("<catalog>", "host")`.

## Initializing a New Catalog

```bash
swamp model create @shelson/catalog <catalog-name> --json
```

One instance is a complete, independent catalog — create a second instance
(e.g. `swamp model create @shelson/catalog office`) for a separate inventory
that shouldn't share global metadata with the first.

## Managing Hosts

```bash
swamp model method run <catalog> addHost --input name=<host>
swamp model method run <catalog> removeHost --input name=<host>
```

- `addHost` creates the host with empty `groups` and `metadata`, and
  immediately resolves it (so `resolved-<host>` exists from the start, even
  before any metadata is set — it'll just reflect global metadata alone).
- `removeHost` deletes the host **and** its `resolved-<host>` entry.
- Both throw if the target already exists / doesn't exist, unless you pass
  `--input idempotent=true` (or `"idempotent": true` in JSON form) to no-op
  instead.

## Managing Groups and Membership

```bash
swamp model method run <catalog> addGroup --input name=<group>
swamp model method run <catalog> removeGroup --input name=<group>

swamp model method run <catalog> addHostToGroup \
  --input host=<host> --input group=<group>
swamp model method run <catalog> removeHostFromGroup \
  --input host=<host> --input group=<group>
```

- A host can belong to any number of groups. Order matters for tie-breaking
  (see below) — the group listed **earliest** in `addHostToGroup` call order
  is the one that appears first in `host.groups` and wins ties.
- `removeGroup` deletes the group **and** scrubs it out of every host's
  `groups` list, re-resolving each affected host in the same call. You never
  end up with a dangling group reference on a host.
- `addHostToGroup`/`removeHostFromGroup` throw on "already a
  member"/"not a member" unless `idempotent: true`.

## Setting and Removing Metadata

```bash
# Global — applies to every host
swamp model method run <catalog> setMetadata \
  --input '{"scope":"global","key":"sshUser","value":"deploy"}'

# Group — applies to members of that group
swamp model method run <catalog> setMetadata \
  --input '{"scope":"group","target":"prod","key":"tier","value":["prod","critical"]}'

# Host — applies to just that host
swamp model method run <catalog> setMetadata \
  --input '{"scope":"host","target":"web-01","key":"role","value":"nas"}'

# Remove a key
swamp model method run <catalog> removeMetadata \
  --input '{"scope":"host","target":"web-01","key":"role"}'
```

`target` is required for `group`/`host` scope, ignored (omit it) for
`global`. `removeMetadata` throws if the key isn't set, unless
`idempotent: true`.

**Always use the full-JSON `--input` form for non-string values** —
`--input key=value` shorthand parses everything as a string:

```bash
# Wrong — value stored as the string "22", not the number 22
swamp model method run <catalog> setMetadata --input scope=global --input key=sshPort --input value=22

# Right
swamp model method run <catalog> setMetadata \
  --input '{"scope":"global","key":"sshPort","value":22}'
```

Every `setMetadata`/`removeMetadata` call re-resolves exactly the hosts it
could affect: all hosts for `global` scope, the group's members for `group`
scope, just the one host for `host` scope.

## Precedence and Merging

Given:

- global: `{ datacenter: "home", workflows: ["patch-all"] }`
- group `prod` (host is a member, listed first): `{ tier: ["prod","critical"], workflows: ["backup-db","patch-all"] }`
- group `web` (host is also a member, listed second): `{ tier: "web" }`
- host: `{ role: "nas", workflows: ["deploy-nas"] }`

Resolved metadata for this host:

```json
{
  "datacenter": "home",
  "tier": ["prod", "critical"],
  "role": "nas",
  "workflows": ["patch-all", "backup-db", "deploy-nas"]
}
```

- `datacenter` — only defined at global, passes through.
- `tier` — a scalar `"web"` conflicts with a list `["prod","critical"]` for
  the same key across scopes, so it falls back to override: the host's
  effective groups are applied in order with `prod` (listed first) taking
  precedence over `web`, so the list value wins here since it's the last
  one applied among conflicting groups. (If both group values were lists,
  they'd be unioned instead — this example intentionally shows the
  scalar/list conflict fallback.)
- `role` — only at host scope, passes through.
- `workflows` — a list at every scope; unioned and deduplicated. Note `web`
  contributes nothing here since it doesn't define `workflows`.

## Full Method Reference

| Method                | Purpose                                               | Notable args                          |
| ---------------------- | ------------------------------------------------------ | -------------------------------------- |
| `addHost`               | Add a host                                              | `name`, `idempotent`                   |
| `removeHost`            | Remove a host (and its `resolved` entry)                | `name`, `idempotent`                   |
| `addGroup`              | Add a group                                             | `name`, `idempotent`                   |
| `removeGroup`           | Remove a group (scrubs membership, re-resolves affected)| `name`, `idempotent`                   |
| `addHostToGroup`        | Add a host to a group                                   | `host`, `group`, `idempotent`          |
| `removeHostFromGroup`   | Remove a host from a group                              | `host`, `group`, `idempotent`          |
| `setMetadata`           | Set/overwrite a metadata key at a scope                 | `scope`, `target`, `key`, `value`      |
| `removeMetadata`        | Remove a metadata key at a scope                        | `scope`, `target`, `key`, `idempotent` |
| `resolveMetadata`       | Force-recompute resolved metadata                       | `host` (optional — omit for all hosts) |

Inspect the live schema any time with:

```bash
swamp model type describe @shelson/catalog --json
```
