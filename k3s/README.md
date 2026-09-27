# @shelson/k3s

Install and operate [k3s](https://k3s.io) on a local or SSH-reachable host using
the official `get.k3s.io` installer. The model waits for the node to register
and report `Ready`, exports a kubeconfig that works from the runner, and reports
service/node status.

## Usage

```bash
swamp model create @shelson/k3s k3s-node \
  --global-arg host=edge-1.example.com \
  --global-arg user=deploy \
  --global-arg identityFile=~/.ssh/id_ed25519

swamp model method run k3s-node install --json
swamp model method run k3s-node status --json
swamp model method run k3s-node kubeconfig --json
```

Omit `host` (or set it to `local`) to install on the swamp runner itself.

## Methods

| Method       | Description                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| `install`    | Run the official installer, then wait for the node to register and be Ready.  |
| `status`     | Report service + node state (equivalent to `k3s kubectl get node`).           |
| `kubeconfig` | Fetch `/etc/rancher/k3s/k3s.yaml`, rewriting the server for remote use.       |
| `uninstall`  | Remove k3s (destructive, requires `confirm=true`).                            |

## Global arguments

| Field                | Default     | Notes                                                              |
| -------------------- | ----------- | ------------------------------------------------------------------ |
| `host`               | `local`     | `local` runs on the runner; anything else is an SSH host.          |
| `user`               | —           | SSH user.                                                          |
| `port`               | —           | SSH port.                                                          |
| `identityFile`       | —           | SSH private key path (`~` supported).                              |
| `sshOptions`         | `[]`        | Extra `-o` options for ssh.                                        |
| `installExec`        | `""`        | Value for `INSTALL_K3S_EXEC`, e.g. `--disable traefik`.            |
| `fetchKubeconfig`    | `true`      | Also export the kubeconfig during `install`.                       |
| `kubeconfigHost`     | internal IP | Host/IP advertised in the exported kubeconfig.                     |
| `waitTimeoutSeconds` | `600`       | Max seconds to wait for the node to become Ready.                  |

> **TLS tip:** k3s signs its serving certificate for the node's internal IP,
> `127.0.0.1`, and the node hostname — not necessarily for a DNS alias such as
> `k3s.example.com`. Leave `kubeconfigHost` unset to use the internal IP and
> avoid `certificate's altnames` errors.

## Resources

- `installation` — version, node count, readiness, timestamp.
- `status` — service state, node conditions, and raw `k3s kubectl get node`.
- `kubeconfig` — sensitive YAML (stored in a vault) plus the advertised server.
- `kubeconfigFile` — the kubeconfig on disk, for tools that need a path.

## Workflow

The extension bundles `@shelson/k3s/k3s-install-and-verify`:

```bash
swamp workflow run @shelson/k3s/k3s-install-and-verify \
  --input k3sModel=k3s-node \
  --input nodeModel=k3s-nodes   # optional
```

It installs k3s, captures status, asserts the node is `Ready` and the service is
active, and — when `nodeModel` is supplied — syncs nodes through
`@swamp/kubernetes/node` to confirm the exported kubeconfig reaches the cluster.

## Using `@swamp/kubernetes` against k3s

`@swamp/kubernetes` models accept a `kubeconfig` **file path**. Point them at the
`kubeconfigFile` the k3s model writes, via CEL and no hardcoded paths:

```bash
swamp model create @swamp/kubernetes/node k3s-nodes \
  --global-arg 'kubeconfig=${{ data.latest("k3s-node", "kubeconfig-file").path }}'

swamp model method run k3s-nodes list --json
```

The same pattern works for `pod`, `namespace`, `event`, `deployment`, and the
rest of the toolkit. k3s ships a metrics-server, so `getMetrics` works too.