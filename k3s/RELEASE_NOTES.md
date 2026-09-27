## 2026.09.28.1

**Added:** Initial release of `@shelson/k3s` — install and operate k3s on a
local or SSH-reachable host using the official `get.k3s.io` installer.

- `install` — run the official installer, then wait for the node to register and
  report `Ready`. Idempotent: skips the installer when k3s is already active
  unless `force=true`.
- `status` — report k3s service state and node conditions.
- `kubeconfig` — export `/etc/rancher/k3s/k3s.yaml`, rewriting the server
  address so it is usable from the runner. Stored as a sensitive resource and
  also written to a file for tools that need a path.
- `uninstall` — remove k3s from the target (requires `confirm=true`).

A `live` pre-flight check verifies the target is reachable before mutating it.

**Added:** Bundled workflow `@shelson/k3s/k3s-install-and-verify` — installs k3s,
asserts the node is `Ready` and the service is active, and optionally syncs
nodes through `@swamp/kubernetes/node` to confirm the exported kubeconfig
reaches the cluster.