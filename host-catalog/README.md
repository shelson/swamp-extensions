# @shelson/catalog

A single swamp model type that holds a catalogue of hosts and groups, with
`key=value` metadata layered at three scopes — **global** (applies to
everything), **group** (applies to members), and **host** (applies to one
host). A host can belong to any number of groups. Every mutating method
recomputes and stores each affected host's **resolved** (effective) metadata
as part of the same call, so resolution is a side effect of writing, never a
separate step you have to remember to run.

Metadata values are strings, numbers, booleans, or lists of those, kept as
their native JSON type so they flow straight into typed workflow arguments
(e.g. a numeric `sshPort`) with no CEL cast at the call site.

## Merge rules

- **Scalars override**: host beats group beats global. Among conflicting
  groups, whichever group is listed earliest in the host's `groups` array
  wins.
- **Lists union**: every list found for a key across global, the host's
  groups, and the host itself is combined and deduplicated — nothing is
  discarded. A key that's a scalar at one scope and a list at another falls
  back to override (last write wins), since a set union isn't well-defined
  against a scalar.

This lets a key like `workflows: [...]` accumulate across every level a host
belongs to, while a key like `sshPort: 22` picks the most specific value —
with no per-key configuration required.

## Quick start

```bash
swamp model create @shelson/catalog homelab --json

swamp model method run homelab addHost --input name=web-01
swamp model method run homelab addGroup --input name=prod
swamp model method run homelab addHostToGroup --input host=web-01 --input group=prod

swamp model method run homelab setMetadata \
  --input '{"scope":"global","key":"sshUser","value":"deploy"}'
swamp model method run homelab setMetadata \
  --input '{"scope":"host","target":"web-01","key":"sshPort","value":2222}'
```

Read back a host's effective metadata:

```bash
swamp data query homelab 'spec == "resolved" && attributes.host == "web-01"'
```

**CLI gotcha**: the `--input key=value` shorthand always produces a string.
To set a number, boolean, or list value, pass the whole method input as one
JSON object instead (as shown above) — `--input value=22` sets the string
`"22"`, not the number `22`.

## Methods

| Method                | Purpose                                                  |
| ---------------------- | --------------------------------------------------------- |
| `addHost`               | Add a host                                                |
| `removeHost`            | Remove a host (and its resolved metadata)                 |
| `addGroup`              | Add a group                                                |
| `removeGroup`           | Remove a group (scrubs membership, re-resolves affected)  |
| `addHostToGroup`        | Add a host to a group                                      |
| `removeHostFromGroup`   | Remove a host from a group                                  |
| `setMetadata`           | Set/overwrite a metadata key at a scope                    |
| `removeMetadata`        | Remove a metadata key at a scope                            |
| `resolveMetadata`       | Force-recompute resolved metadata for one or all hosts       |

Every add/remove method accepts an `idempotent: true` flag to no-op instead
of throwing on "already exists" / "not found" — useful for safe re-runs.

## Driving a workflow from the catalog

Fan out over hosts that opt in, via a `.filter(...)` on the catalog's
`resolved` spec, and target a per-host model instance with direct type
execution:

```yaml
steps:
  - name: gather-${{ self.host.attributes.host }}
    forEach:
      item: host
      in: >-
        ${{ data.findBySpec("homelab", "resolved").filter(h,
          has(h.attributes.metadata.workflows) &&
          "node-gather" in h.attributes.metadata.workflows) }}
    task:
      type: model_method
      modelType: "@example/cfgmgmt/node"
      modelName: "${{ self.host.attributes.host }}-node-gather"
      methodName: gather
      globalArgs:
        hostname: ${{ self.host.attributes.host }}
        sshUser: >-
          ${{ has(self.host.attributes.metadata.sshUser) ?
            self.host.attributes.metadata.sshUser : "root" }}
```

The bundled skill (`host-catalog`) has the full method reference, precedence
worked examples, and the complete workflow fan-out pattern including the
opt-in filtering pitfall (declare list-valued opt-in keys at group/host
scope, never global).

## License

MIT — see [LICENSE.txt](LICENSE.txt).
