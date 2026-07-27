---
name: host-catalog
description: >
  Manage a @shelson/catalog host/group/metadata inventory — initialize a new
  catalog, add/remove hosts and groups, manage group membership, and set
  key=value metadata at global/group/host scope — and build swamp workflows
  that fan out over the catalog's resolved per-host metadata (e.g. SSH
  connection details for cfgmgmt steps). Triggers on "host catalog",
  "inventory", "@shelson/catalog", "add host", "add group", "catalog
  metadata", "resolved metadata", "resolveMetadata", or building a workflow
  that needs per-host config (sshUser, sshPort, sshIdentityFile, etc.) driven
  by a catalog.
---

# Host Catalog (`@shelson/catalog`)

A single model type that holds a catalogue of hosts and groups, with
key=value metadata layered at three scopes: **global** (applies to
everything), **group** (applies to members), and **host** (applies to one
host). A host can belong to any number of groups.

Every mutating method keeps a `resolved` resource per host up to date
automatically — resolution is a side effect of writing, not a separate step
you have to remember to run.

## Metadata Value Types and Merge Rules

A metadata value is a **string, number, boolean, or a list of those** —
stored as its native JSON type, so it flows straight into typed method
arguments in a workflow (e.g. a numeric `sshPort`) without a CEL cast.

- **Scalars override**: host beats group beats global. Among conflicting
  groups, whichever group is listed earliest in the host's `groups` array
  wins.
- **Lists union**: every list found for a key across global, the host's
  groups, and the host itself is combined and deduplicated (nothing is
  discarded). A key that's a scalar at one scope and a list at another falls
  back to override (last-write-wins) — union isn't well-defined against a
  scalar.

This means a key like `workflows: [...]` naturally accumulates across every
level a host belongs to, while a key like `sshPort: 22` naturally picks the
most specific value — with no per-key configuration needed. See
[references/managing-catalog.md](references/managing-catalog.md#precedence-and-merging)
for worked examples.

## Quick Start: Set Up a Catalog

```bash
swamp model create @shelson/catalog homelab --json

swamp model method run homelab addHost --input name=web-01
swamp model method run homelab addGroup --input name=prod
swamp model method run homelab addHostToGroup --input host=web-01 --input group=prod

swamp model method run homelab setMetadata \
  --input '{"scope":"global","key":"sshUser","value":"deploy"}'
swamp model method run homelab setMetadata \
  --input '{"scope":"host","target":"web-01","key":"sshIdentityFile","value":"/home/deploy/.ssh/id_ed25519"}'
```

**CLI gotcha:** `--input key=value` shorthand always produces a string. To set
a number, boolean, or list value, pass the whole method input as one JSON
object instead — as shown above. `--input value=22` sets the string `"22"`,
not the number `22`.

Every add/remove method (`addHost`, `removeHost`, `addGroup`, `removeGroup`,
`addHostToGroup`, `removeHostFromGroup`, `removeMetadata`) takes an
`idempotent: true` flag to no-op instead of throwing on "already
exists"/"not found" — useful for safe re-runs. Full method reference,
precedence details, and the resource shapes are in
[references/managing-catalog.md](references/managing-catalog.md).

## Quick Start: Drive a Workflow from the Catalog

Fan out over the hosts that opt in, via a `.filter(...)` on the catalog's
`resolved` spec, and target a per-host model instance via direct type
execution (`modelType` + `modelName`) rather than a pre-created definition:

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
      modelType: "@adam/cfgmgmt/node"
      modelName: "${{ self.host.attributes.host }}-node-gather"
      methodName: gather
      globalArgs:
        hostname: ${{ self.host.attributes.host }}
        sshUser: >-
          ${{ has(self.host.attributes.metadata.sshUser) ?
            self.host.attributes.metadata.sshUser : "root" }}
        sshPort: >-
          ${{ has(self.host.attributes.metadata.sshPort) ?
            self.host.attributes.metadata.sshPort : 22 }}
```

Guard every optional metadata field with `has(...)` and a fallback — a
`forEach` template can't conditionally omit a YAML key per iteration, so an
unguarded reference to a key some hosts don't set throws for those hosts.

**Declare the opt-in key (`workflows` above) at group or host scope, never
global** — list-valued metadata unions across scope, so a global entry
reaches every host and no host-level override can remove it, silently
turning the filter into a no-op. Full pattern, worked example, and pitfalls
in [references/building-workflows.md](references/building-workflows.md).

## When to Use `resolveMetadata` Directly

Normally never — every mutating method resolves the hosts it affects as a
side effect. Call `resolveMetadata` explicitly only to force a refresh with
no other change, or to backfill hosts that predate a catalog schema change.
