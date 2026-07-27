# Building Workflows from a Host Catalog

How to drive a swamp workflow's `forEach` fan-out from a `@shelson/catalog`
instance's resolved metadata. Read [../SKILL.md](../SKILL.md) first for the
quick-start version. This assumes familiarity with the `swamp` skill's
workflow guide (`forEach`, `data.*` helpers, direct type execution) — load
that skill for the general mechanics; this doc covers the catalog-specific
pattern on top of it.

## The Core Pattern

```yaml
steps:
  - name: <verb>-${{ self.host.attributes.host }}
    forEach:
      item: host
      in: ${{ data.findBySpec("<catalog>", "resolved") }}
    task:
      type: model_method
      modelType: "<target-type>"
      modelName: "${{ self.host.attributes.host }}-<suffix>"
      methodName: <method>
      globalArgs:
        <field>: ${{ self.host.attributes.metadata.<key> }}
```

- **`data.findBySpec("<catalog>", "resolved")`** returns every host's
  already-merged metadata — no need for a separate lookup step or job;
  `forEach.in` awaits async CEL data helpers directly.
- Each item's shape is `{ attributes: { host, metadata, resolvedAt } }` —
  reference the host name as `self.host.attributes.host` and a metadata key
  as `self.host.attributes.metadata.<key>`.
- Use **`data.findBySpec("<catalog>", "host")`** instead only if you
  specifically need the raw per-host record (`name`, `groups`, unmerged
  `metadata`) rather than the resolved view — e.g. to branch workflow logic
  on group membership itself. For anything that ends up as a method
  argument (connection details, config values), use `resolved`.
- **`modelType` + `modelName`** (direct type execution) auto-creates one
  model instance per iteration — no need to pre-create a definition per
  host. Use a `modelName` template like `${{ self.host.attributes.host
  }}-<suffix>` so each host gets its own instance and its own data history.
  Only switch to `modelIdOrName` if the target needs persistent, hand-edited
  configuration that isn't just "one field per catalog value".
- Most workflows shouldn't run on *every* catalogued host — chain `.filter(...)`
  onto `data.findBySpec(...)` to select only opted-in hosts. See
  [Opt-In Filtering](#opt-in-filtering-run-only-on-selected-hosts) below.

## Opt-In Filtering (Run Only on Selected Hosts)

Don't assume every host in the catalog should be a `forEach` target. The
standard pattern is a `workflows` (or similarly-named) list-valued metadata
key that a host must include this workflow's name in to be selected:

```yaml
forEach:
  item: host
  in: >-
    ${{ data.findBySpec("<catalog>", "resolved").filter(h,
      has(h.attributes.metadata.workflows) &&
      "<this-workflow-name>" in h.attributes.metadata.workflows) }}
```

`.filter(h, predicate)` is a standard CEL macro — it runs during `forEach`
expansion just like the unfiltered form, so `swamp workflow evaluate` still
shows you the exact selected set with no workflow execution. Guard with
`has()` first: a host with no `workflows` key at all would otherwise throw
evaluating the `in` check, not just get excluded.

**Scope placement matters — this is the pitfall that actually bites.**
Because list-valued metadata *unions* across scope (see
[managing-catalog.md § Precedence and Merging](managing-catalog.md#precedence-and-merging)),
declaring the opt-in key at **global** scope means every host inherits it
unconditionally — a host-level override can only *add* entries, never
remove ones contributed by global or a group. The filter will silently
pass every host through, looking like it isn't filtering at all. Declare
the opt-in key at **group or host** scope instead — e.g. create a group
(`linux`, `backup-targets`, whatever the selection criterion actually is),
set `workflows: ["<workflow-name>"]` on the group, and add only the hosts
that should run it:

```bash
swamp model method run <catalog> addGroup --input name=linux
swamp model method run <catalog> setMetadata \
  --input '{"scope":"group","target":"linux","key":"workflows","value":["node-gather"]}'
swamp model method run <catalog> addHostToGroup --input host=web-01 --input group=linux
```

Any host outside the group (and without its own host-level opt-in) is
excluded automatically — verify with `swamp workflow evaluate <name> --json`
before trusting it with `swamp workflow run`.

## Guarding Optional Metadata

Not every host sets every metadata key. A `forEach` template is static YAML
— you can't conditionally omit a `globalArgs` key per iteration — so an
unguarded reference to a key that's absent for some host throws for that
host's step. Guard with `has()` and fall back to a sensible default,
ideally matching the target model's own default:

```yaml
sshUser: >-
  ${{ has(self.host.attributes.metadata.sshUser) ?
    self.host.attributes.metadata.sshUser : "root" }}
```

If the target field has no sensible default (e.g. an optional path like
`sshIdentityFile`), fall back to `""` — falsy, so most models treat it the
same as "not provided".

## Typed Values Need No Casting

Catalog metadata values are stored as their real JSON type — string,
number, boolean, or a list of those — so a value set as `{"key":
"sshPort", "value": 22}` resolves in the workflow as the CEL/JSON number
`22`, not the string `"22"`. Pass it straight through to a numeric or
boolean model argument with no `int()`/`bool()` cast:

```yaml
sshPort: >-
  ${{ has(self.host.attributes.metadata.sshPort) ?
    self.host.attributes.metadata.sshPort : 22 }}
```

This only works if the value was *set* as the right type in the first
place. When setting catalog metadata from the CLI, remember the `--input
key=value` shorthand always produces a string — use the full-JSON `--input`
form to set a real number or boolean (see
[managing-catalog.md](managing-catalog.md#setting-and-removing-metadata)).

## Worked Example

Gather system facts from every `linux`-group host in a catalog named
`homelab` that has opted in via `"node-gather"` in its resolved
`workflows`, over SSH, using each host's resolved connection metadata:

```yaml
jobs:
  - name: main
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
            sshIdentityFile: >-
              ${{ has(self.host.attributes.metadata.sshIdentityFile) ?
                self.host.attributes.metadata.sshIdentityFile : "" }}
```

Always run `swamp workflow validate <name>` then `swamp workflow evaluate
<name> --json` before `swamp workflow run` — `evaluate` expands the
`forEach` against real catalog data and shows you the exact resolved
`modelName`/`globalArgs` per host without executing anything, which is the
fastest way to catch a missing `has()` guard or a bad key name before it
fails mid-run.

## Fan-Out Concurrency

All `forEach` iterations run in parallel by default. If the target method
is rate-limited or the hosts are resource-constrained (e.g. many
simultaneous SSH sessions to a small box), cap it:

```yaml
- name: gather-${{ self.host.attributes.host }}
  forEach:
    item: host
    in: ${{ data.findBySpec("homelab", "resolved") }}
  concurrency: 3
  task: { ... }
```

## Common Pitfalls

- **Forgetting a `has()` guard** — fails only for hosts that don't set that
  key, which can look like an intermittent failure if you're testing with a
  host that happens to have every key set.
- **Referencing `host` spec instead of `resolved`** — gets you the raw,
  unmerged per-host record; group and global metadata won't be there.
- **Setting catalog metadata with the CLI shorthand** while iterating on a
  workflow — silently stores strings, which then need casting downstream
  again. Use the full-JSON `--input` form.
- **Declaring an opt-in list key at global scope** — looks like it should
  exclude hosts but doesn't; union semantics mean a global entry reaches
  every host and no per-host override can remove it. Declare it at group or
  host scope (see [Opt-In Filtering](#opt-in-filtering-run-only-on-selected-hosts)).
  If `swamp workflow evaluate` shows every host matching a filter you
  expected to be selective, this is almost always why.
