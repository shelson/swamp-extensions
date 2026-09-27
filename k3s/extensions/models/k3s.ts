/**
 * k3s installation and lifecycle model.
 *
 * Installs the official lightweight Kubernetes distribution (k3s) on a target
 * host using the upstream `get.k3s.io` installer, then blocks until the node
 * registers and reports `Ready`. The target is either the swamp runner itself
 * (`host: local`) or any host reachable over SSH — the transport is chosen from
 * the `host` global argument.
 *
 * Methods:
 *   install     — run the official curlbash installer and wait for Ready
 *   status      — report service/node state (equiv. `k3s kubectl get node`)
 *   kubeconfig  — export `/etc/rancher/k3s/k3s.yaml`, rewritten for remote use
 *   uninstall   — remove k3s from the target (destructive, requires confirm)
 *
 * @module
 */

import { z } from "npm:zod@4";

const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(["", "local", "localhost", "127.0.0.1", "::1"]);

/** A single process/SSH command outcome. */
interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Options accepted by a runner command. */
interface ExecOptions {
  allowFailure?: boolean;
  signal?: AbortSignal;
}

/** Minimal logger surface used by the methods. */
interface Logger {
  info: (message: string, props?: Record<string, unknown>) => void;
  warning: (message: string, props?: Record<string, unknown>) => void;
}

/** Execution transport for a target host. */
interface Runner {
  transport: "local" | "ssh";
  target: string;
  exec: (command: string, opts?: ExecOptions) => Promise<ExecResult>;
  execRoot: (command: string, opts?: ExecOptions) => Promise<ExecResult>;
}

/** POSIX single-quote a string for safe embedding in `sh -c`. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Expand a leading `~` to the current user's home directory. */
function expandTilde(path: string): string {
  if (path === "~") return Deno.env.get("HOME") ?? path;
  if (path.startsWith("~/")) {
    return `${Deno.env.get("HOME") ?? ""}${path.slice(1)}`;
  }
  return path;
}

/** True when the host argument selects the local runner rather than SSH. */
export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host.trim().toLowerCase());
}

/** Sleep, rejecting promptly if the surrounding signal aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Build the local/SSH runner described by the global arguments. */
function buildRunner(g: GlobalArgs, signal?: AbortSignal): Runner {
  const local = isLocalHost(g.host);
  const target = local ? "local" : g.user ? `${g.user}@${g.host}` : g.host;

  const exec = async (
    command: string,
    opts?: ExecOptions,
  ): Promise<ExecResult> => {
    const effectiveSignal = opts?.signal ?? signal;
    let process: Deno.Command;
    if (local) {
      process = new Deno.Command("sh", {
        args: ["-c", command],
        stdout: "piped",
        stderr: "piped",
        signal: effectiveSignal,
      });
    } else {
      const args = [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=40",
      ];
      if (g.port) args.push("-p", String(g.port));
      if (g.identityFile) {
        args.push(
          "-i",
          expandTilde(g.identityFile),
          "-o",
          "IdentitiesOnly=yes",
        );
      }
      for (const option of g.sshOptions) args.push("-o", option);
      args.push(target, command);
      process = new Deno.Command("ssh", {
        args,
        stdout: "piped",
        stderr: "piped",
        signal: effectiveSignal,
      });
    }
    const result = await process.output();
    const stdout = decoder.decode(result.stdout).trim();
    const stderr = decoder.decode(result.stderr).trim();
    if (!opts?.allowFailure && result.code !== 0) {
      throw new Error(
        `command failed (exit ${result.code}) on ${target}:\n$ ${command}\n${
          stderr || stdout
        }`,
      );
    }
    return { code: result.code, stdout, stderr };
  };

  let rootProbe: Promise<boolean> | null = null;
  const isRoot = (): Promise<boolean> => {
    rootProbe ??= exec("id -u", { allowFailure: true }).then((r) =>
      r.code === 0 && r.stdout === "0"
    ).catch(() => false);
    return rootProbe;
  };

  const execRoot = async (
    command: string,
    opts?: ExecOptions,
  ): Promise<ExecResult> => {
    if (await isRoot()) return exec(command, opts);
    // Run the whole command (pipelines included) as root.
    return exec(`sudo -n sh -c ${shellQuote(command)}`, opts);
  };

  return { transport: local ? "local" : "ssh", target, exec, execRoot };
}

// ---------------------------------------------------------------------------
// k3s helpers
// ---------------------------------------------------------------------------

/** One node as reported by `kubectl get node -o json`. */
export interface NodeInfo {
  name: string;
  ready: boolean;
  roles: string[];
  version: string;
  internalIP: string;
}

/** Parse `kubectl get node -o json` into a compact node summary. */
export function parseNodes(jsonText: string): NodeInfo[] {
  if (!jsonText) return [];
  let doc: { items?: unknown[] };
  try {
    doc = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const items = Array.isArray(doc.items) ? doc.items : [];
  return items.map((raw) => {
    const item = raw as {
      metadata?: { name?: string; labels?: Record<string, string> };
      status?: {
        conditions?: Array<{ type?: string; status?: string }>;
        addresses?: Array<{ type?: string; address?: string }>;
        nodeInfo?: { kubeletVersion?: string };
      };
    };
    const conditions = item.status?.conditions ?? [];
    const labels = item.metadata?.labels ?? {};
    const addresses = item.status?.addresses ?? [];
    return {
      name: item.metadata?.name ?? "",
      ready: conditions.some((c) => c.type === "Ready" && c.status === "True"),
      roles: Object.keys(labels)
        .filter((key) => key.startsWith("node-role.kubernetes.io/"))
        .map((key) => key.slice("node-role.kubernetes.io/".length))
        .filter((role) => role.length > 0),
      version: item.status?.nodeInfo?.kubeletVersion ?? "",
      internalIP: addresses.find((a) => a.type === "InternalIP")?.address ?? "",
    };
  });
}

/** Read the installed k3s server version. */
async function k3sVersion(
  runner: Runner,
  signal?: AbortSignal,
): Promise<string> {
  const result = await runner.execRoot("k3s --version | head -1", {
    allowFailure: true,
    signal,
  });
  return result.stdout.replace(/^k3s version\s+/, "").split(/\s+/)[0] ||
    "unknown";
}

/** Fetch the server kubeconfig and locate its server URL. */
async function readKubeconfig(
  runner: Runner,
  signal?: AbortSignal,
): Promise<{ yaml: string; server: string }> {
  const yaml = (await runner.execRoot("cat /etc/rancher/k3s/k3s.yaml", {
    signal,
  })).stdout;
  const server = yaml.match(/server:\s*(\S+)/)?.[1] ?? "https://127.0.0.1:6443";
  return { yaml, server };
}

/** Rewrite the localhost kubeconfig server so it is usable off-host. */
function rewriteServer(
  yaml: string,
  host: string,
): string {
  const bareHost = host.replace(/:\d+$/, "");
  return yaml.replace(/https:\/\/127\.0\.0\.1:/g, `https://${bareHost}:`);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const GlobalArgsSchema = z.object({
  host: z.string().default("local").describe(
    "Target host. 'local' installs on the swamp runner; anything else is an SSH host (e.g. 'edge-1.example.com').",
  ),
  user: z.string().optional().describe(
    "SSH user. Omit to let ssh resolve it from config or the local user.",
  ),
  port: z.number().int().min(1).max(65535).optional().describe("SSH port."),
  identityFile: z.string().optional().describe(
    "SSH private key path (supports ~). Adds IdentitiesOnly=yes.",
  ),
  sshOptions: z.array(z.string()).default([]).describe(
    "Extra `-o` options passed to ssh.",
  ),
  installExec: z.string().default("").describe(
    "Value for INSTALL_K3S_EXEC, e.g. '--disable servicelb --disable traefik'.",
  ),
  fetchKubeconfig: z.boolean().default(true).describe(
    "Also fetch /etc/rancher/k3s/k3s.yaml into the kubeconfig resource.",
  ),
  kubeconfigHost: z.string().optional().describe(
    "Host/IP to advertise in the fetched kubeconfig. Defaults to the node InternalIP.",
  ),
  waitTimeoutSeconds: z.number().int().positive().default(600).describe(
    "Max seconds to wait for the node to register and become Ready.",
  ),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Context fields used by the methods. */
interface FileWriter {
  writeText: (text: string) => Promise<{ name: string }>;
}

interface Context {
  globalArgs: GlobalArgs;
  signal?: AbortSignal;
  logger?: Logger;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  createFileWriter: (specName: string, name: string) => FileWriter;
  deleteResource?: (instanceName: string) => Promise<void>;
}

const InstallationSchema = z.object({
  host: z.string(),
  transport: z.enum(["local", "ssh"]),
  target: z.string(),
  k3sVersion: z.string(),
  installExec: z.string(),
  nodeCount: z.number().int(),
  ready: z.boolean(),
  installedAt: z.string(),
});

const NodeSchema = z.object({
  name: z.string(),
  ready: z.boolean(),
  roles: z.array(z.string()),
  version: z.string(),
  internalIP: z.string(),
});

const StatusSchema = z.object({
  host: z.string(),
  transport: z.enum(["local", "ssh"]),
  target: z.string(),
  installed: z.boolean(),
  serviceActive: z.boolean(),
  k3sVersion: z.string(),
  nodeCount: z.number().int(),
  ready: z.boolean(),
  nodes: z.array(NodeSchema),
  getNodeOutput: z.string(),
  checkedAt: z.string(),
});

const KubeconfigSchema = z.object({
  host: z.string(),
  transport: z.enum(["local", "ssh"]),
  server: z.string(),
  kubeconfig: z.string().meta({ sensitive: true }).describe(
    "k3s kubeconfig YAML with the server address rewritten for remote access",
  ),
});

/**
 * Write the kubeconfig as both a file (for tools that need a path) and a
 * sensitive resource, rewriting the server for off-host access.
 */
async function writeKubeconfig(
  runner: Runner,
  context: Context,
): Promise<Array<{ name: string }>> {
  const g = context.globalArgs;
  const { yaml, server: localServer } = await readKubeconfig(
    runner,
    context.signal,
  );

  let server = localServer;
  let content = yaml;
  if (runner.transport === "ssh") {
    const nodes = parseNodes(
      (await runner.execRoot("k3s kubectl get node -o json", {
        allowFailure: true,
        signal: context.signal,
      })).stdout,
    );
    const advertise = g.kubeconfigHost || nodes.find((n) => n.internalIP)
      ?.internalIP ||
      g.host;
    content = rewriteServer(yaml, advertise);
    server = content.match(/server:\s*(\S+)/)?.[1] ?? localServer;
  }

  // Consumers read the path from the file data, e.g.
  // `${{ data.latest("k3s-node", "kubeconfig-file").path }}`.
  const handles: Array<{ name: string }> = [];
  const writer = context.createFileWriter("kubeconfigFile", "kubeconfig-file");
  handles.push(await writer.writeText(content));
  handles.push(
    await context.writeResource("kubeconfig", "kubeconfig", {
      host: g.host,
      transport: runner.transport,
      server,
      kubeconfig: content,
    }),
  );
  return handles;
}

/** k3s installation and lifecycle model definition. */
export const model = {
  type: "@shelson/k3s",
  version: "2026.09.28.1",
  description:
    "Install and operate k3s on a local or SSH-reachable host using the official installer.",
  globalArguments: GlobalArgsSchema,
  resources: {
    installation: {
      description: "Outcome of the most recent install run",
      schema: InstallationSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    status: {
      description: "Latest observed k3s service and node status",
      schema: StatusSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
    kubeconfig: {
      description: "k3s kubeconfig for reaching the cluster from the runner",
      schema: KubeconfigSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },
  files: {
    kubeconfigFile: {
      description:
        "kubeconfig YAML on disk, for tooling (e.g. @swamp/kubernetes) that needs a file path",
      contentType: "text/plain",
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },
  checks: {
    reachable: {
      description:
        "Verify the target is reachable before running a mutating method.",
      labels: ["live"],
      execute: async (ctx: { globalArgs: GlobalArgs }) => {
        const runner = buildRunner(ctx.globalArgs);
        const probe = await runner.exec("id -u", { allowFailure: true });
        if (probe.code !== 0) {
          return {
            pass: false,
            errors: [
              `cannot reach ${runner.target}: ${
                probe.stderr || `exit ${probe.code}`
              }`,
            ],
          };
        }
        return { pass: true };
      },
    },
  },
  methods: {
    install: {
      description:
        "Install k3s with the official installer and wait for the node to become Ready.",
      arguments: z.object({
        force: z.boolean().default(false).describe(
          "Re-run the installer even if k3s is already active (default: skip).",
        ),
      }),
      execute: async (args: { force: boolean }, context: Context) => {
        const g = context.globalArgs;
        const log = context.logger;
        const runner = buildRunner(g, context.signal);
        log?.info("Installing k3s on {target} ({transport})", {
          target: runner.target,
          transport: runner.transport,
        });

        const installed =
          (await runner.exec("command -v k3s", { allowFailure: true })).code ===
            0;
        const active =
          (await runner.exec("systemctl is-active k3s", { allowFailure: true }))
            .stdout === "active";
        log?.info("Pre-install state: installed={installed} active={active}", {
          installed,
          active,
        });

        if (installed && active && !args.force) {
          log?.info("k3s already installed and active; skipping installer.");
        } else {
          const env = g.installExec
            ? `INSTALL_K3S_EXEC=${shellQuote(g.installExec)} `
            : "";
          log?.info("Running official installer (get.k3s.io)...");
          await runner.execRoot(`curl -sfL https://get.k3s.io | ${env}sh -`, {
            signal: context.signal,
          });
        }

        const waitMs = g.waitTimeoutSeconds * 1000;
        const deadline = Date.now() + waitMs;
        let nodeCount = 0;
        while (Date.now() < deadline) {
          const result = await runner.execRoot(
            "k3s kubectl get nodes --no-headers 2>/dev/null | wc -l",
            { allowFailure: true, signal: context.signal },
          );
          nodeCount = Number.parseInt(result.stdout, 10) || 0;
          if (nodeCount > 0) break;
          log?.info("No node registered yet; retrying in 5s...");
          await sleep(5000, context.signal);
        }
        if (nodeCount === 0) {
          throw new Error(
            `k3s node did not register within ${g.waitTimeoutSeconds}s on ${runner.target}`,
          );
        }

        const remaining = Math.max(
          10,
          Math.ceil((deadline - Date.now()) / 1000),
        );
        log?.info("Node registered; waiting for Ready condition...");
        await runner.execRoot(
          `k3s kubectl wait --for=condition=ready node --all --timeout=${remaining}s`,
          { signal: context.signal },
        );

        const version = await k3sVersion(runner, context.signal);
        const nodes = parseNodes(
          (await runner.execRoot("k3s kubectl get node -o json", {
            allowFailure: true,
            signal: context.signal,
          })).stdout,
        );
        const ready = nodes.length > 0 && nodes.every((n) => n.ready);
        log?.info("k3s {version} ready on {target}", {
          version,
          target: runner.target,
        });

        const handles: Array<{ name: string }> = [];
        handles.push(
          await context.writeResource("installation", "installation", {
            host: g.host,
            transport: runner.transport,
            target: runner.target,
            k3sVersion: version,
            installExec: g.installExec,
            nodeCount: nodes.length,
            ready,
            installedAt: new Date().toISOString(),
          }),
        );
        if (g.fetchKubeconfig) {
          handles.push(...await writeKubeconfig(runner, context));
        }
        return { dataHandles: handles };
      },
    },

    status: {
      description:
        "Report k3s service and node status (equivalent to `k3s kubectl get node`).",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Context) => {
        const g = context.globalArgs;
        const log = context.logger;
        const runner = buildRunner(g, context.signal);
        log?.info("Checking k3s status on {target}", { target: runner.target });

        const installed =
          (await runner.exec("command -v k3s", { allowFailure: true })).code ===
            0;
        const serviceActive = (await runner.exec("systemctl is-active k3s", {
          allowFailure: true,
        })).stdout === "active";
        const version = installed
          ? await k3sVersion(runner, context.signal)
          : "not-installed";
        const nodes = parseNodes(
          (await runner.execRoot("k3s kubectl get node -o json", {
            allowFailure: true,
            signal: context.signal,
          })).stdout,
        );
        const getNodeOutput = (await runner.execRoot("k3s kubectl get node", {
          allowFailure: true,
          signal: context.signal,
        })).stdout;

        const ready = nodes.length > 0 && nodes.every((n) => n.ready);
        log?.info(
          "k3s status on {target}: installed={installed} ready={ready}",
          {
            target: runner.target,
            installed,
            ready,
          },
        );

        const handle = await context.writeResource("status", "status", {
          host: g.host,
          transport: runner.transport,
          target: runner.target,
          installed,
          serviceActive,
          k3sVersion: version,
          nodeCount: nodes.length,
          ready,
          nodes,
          getNodeOutput,
          checkedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    kubeconfig: {
      description:
        "Fetch the k3s kubeconfig, rewriting the server address for remote use.",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Context) => {
        const runner = buildRunner(context.globalArgs, context.signal);
        context.logger?.info("Fetching k3s kubeconfig from {target}", {
          target: runner.target,
        });
        const handles = await writeKubeconfig(runner, context);
        context.logger?.info("k3s kubeconfig written for {target}", {
          target: runner.target,
        });
        return { dataHandles: handles };
      },
    },

    uninstall: {
      description:
        "Remove k3s from the target. Destructive — requires confirm=true.",
      arguments: z.object({
        confirm: z.boolean().describe(
          "Must be true; uninstalls k3s and deletes cluster data on the target.",
        ),
      }),
      execute: async (args: { confirm: boolean }, context: Context) => {
        if (!args.confirm) {
          throw new Error("uninstall requires confirm=true");
        }
        const runner = buildRunner(context.globalArgs, context.signal);
        context.logger?.info("Uninstalling k3s from {target}", {
          target: runner.target,
        });
        const result = await runner.execRoot(
          "if [ -x /usr/local/bin/k3s-uninstall.sh ]; then /usr/local/bin/k3s-uninstall.sh; else echo 'k3s-uninstall.sh not found (already uninstalled?)'; fi",
          { allowFailure: true, signal: context.signal },
        );
        if (result.code !== 0) {
          throw new Error(
            `k3s-uninstall.sh failed (exit ${result.code}): ${
              result.stderr || result.stdout
            }`,
          );
        }
        for (const name of ["installation", "status", "kubeconfig"]) {
          await context.deleteResource?.(name).catch(() => {});
        }
        return { dataHandles: [] };
      },
    },
  },
};
