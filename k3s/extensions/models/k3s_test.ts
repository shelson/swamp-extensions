/**
 * Unit tests for the @shelson/k3s model.
 *
 * Pure helpers are tested directly. Model methods run against a mocked
 * `Deno.Command` so the SSH/local transport, installer flow, kubeconfig
 * rewriting, uninstall, and failure paths are all exercised without touching a
 * real host.
 *
 * @module
 */
import {
  assert,
  assertEquals,
  assertMatch,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { isLocalHost, model, parseNodes, shellQuote } from "./k3s.ts";

// ---------------------------------------------------------------------------
// Deno.Command mock
// ---------------------------------------------------------------------------

interface MockResult {
  stdout: string;
  stderr?: string;
  success: boolean;
  code?: number;
}

type MockHandler = (
  cmd: string,
  args: string[],
  command: string,
) => MockResult;

/** The logical shell command a `Deno.Command` invocation carries. */
function logicalCommand(cmd: string, args: string[]): string {
  return cmd === "sh" ? (args[1] ?? "") : (args[args.length - 1] ?? "");
}

/** Replace `Deno.Command` for the duration of `fn`, restoring it afterwards. */
function withMockedCommand<T>(
  handler: MockHandler,
  fn: () => Promise<T>,
): Promise<T> {
  const original = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (Deno as any).Command = class MockCommand {
    #cmd: string;
    #args: string[];
    constructor(cmd: string, options: { args?: string[] }) {
      this.#cmd = cmd;
      this.#args = options?.args ?? [];
    }
    output(): Promise<{
      success: boolean;
      code: number;
      stdout: Uint8Array;
      stderr: Uint8Array;
    }> {
      const result = handler(
        this.#cmd,
        this.#args,
        logicalCommand(this.#cmd, this.#args),
      );
      const enc = new TextEncoder();
      return Promise.resolve({
        success: result.success,
        code: result.code ?? (result.success ? 0 : 1),
        stdout: enc.encode(result.stdout),
        stderr: enc.encode(
          result.stderr ?? (result.success ? "" : "command failed"),
        ),
      });
    }
  };
  return fn().finally(() => {
    // deno-lint-ignore no-explicit-any
    (Deno as any).Command = original;
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NODE_JSON = JSON.stringify({
  items: [
    {
      metadata: {
        name: "node-1",
        labels: { "node-role.kubernetes.io/control-plane": "true" },
      },
      status: {
        conditions: [{ type: "Ready", status: "True" }],
        addresses: [{ type: "InternalIP", address: "192.0.2.10" }],
        nodeInfo: { kubeletVersion: "v1.36.4+k3s1" },
      },
    },
  ],
});

const NODE_TABLE = "NAME     STATUS   ROLES           AGE   VERSION\n" +
  "node-1   Ready    control-plane   1m    v1.36.4+k3s1\n";

const KUBECONFIG_YAML = `apiVersion: v1
clusters:
- cluster:
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
`;

interface FakeK3sOptions {
  installed?: boolean;
  active?: boolean;
  nodeCount?: number;
  kubeconfig?: string;
}

/** A stateful fake for the k3s CLI/installer invoked over sh/ssh. */
function fakeK3s(options: FakeK3sOptions = {}) {
  const { nodeCount = 1, kubeconfig = KUBECONFIG_YAML } = options;
  let installedNow = options.installed ?? true;
  const activeNow = options.active ?? installedNow;
  let installerRan = false;
  const calls: Array<{ cmd: string; args: string[] }> = [];

  const handler: MockHandler = (cmd, args, command) => {
    calls.push({ cmd, args });
    if (command === "id -u") return { stdout: "0\n", success: true };
    if (command.includes("command -v k3s")) {
      return { stdout: "", success: installedNow };
    }
    if (command.includes("systemctl is-active k3s")) {
      return { stdout: activeNow ? "active\n" : "inactive\n", success: true };
    }
    if (command.includes("curl -sfL https://get.k3s.io")) {
      installerRan = true;
      installedNow = true;
      return { stdout: "", success: true };
    }
    if (command.includes("k3s --version")) {
      return {
        stdout: installedNow ? "k3s version v1.36.4+k3s1 (abc123)\n" : "",
        success: installedNow,
      };
    }
    if (command.includes("kubectl get nodes --no-headers")) {
      return {
        stdout: installedNow ? `${nodeCount}\n` : "0\n",
        success: installedNow,
      };
    }
    if (command.includes("kubectl wait")) {
      return { stdout: "", success: installedNow && nodeCount > 0 };
    }
    if (command.includes("kubectl get node -o json")) {
      return { stdout: installedNow ? NODE_JSON : "", success: installedNow };
    }
    if (command.includes("kubectl get node")) {
      return { stdout: installedNow ? NODE_TABLE : "", success: installedNow };
    }
    if (command.includes("cat /etc/rancher/k3s/k3s.yaml")) {
      return { stdout: installedNow ? kubeconfig : "", success: installedNow };
    }
    if (command.includes("k3s-uninstall.sh")) {
      return { stdout: "", success: true };
    }
    return { stdout: "", stderr: `unhandled: ${command}`, success: false };
  };

  return { handler, calls, installerRan: () => installerRan };
}

type GlobalArgs = ReturnType<typeof model.globalArguments.parse>;

interface Written {
  specName: string;
  name: string;
  data: Record<string, unknown>;
}

interface WrittenFile {
  specName: string;
  name: string;
  text: string;
}

/** Minimal method context capturing writes, files, deletions and logs. */
function createContext(globalArgs: GlobalArgs) {
  const written: Written[] = [];
  const files: WrittenFile[] = [];
  const deleted: string[] = [];
  const logs: string[] = [];
  const context = {
    globalArgs,
    logger: {
      info: (message: string) => {
        logs.push(message);
      },
      warning: (message: string) => {
        logs.push(message);
      },
    },
    writeResource: (
      specName: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
      written.push({ specName, name, data });
      return Promise.resolve({ name });
    },
    createFileWriter: (specName: string, name: string) => {
      const entry: WrittenFile = { specName, name, text: "" };
      files.push(entry);
      return {
        writeText: (text: string) => {
          entry.text = text;
          return Promise.resolve({ name });
        },
      };
    },
    deleteResource: (name: string) => {
      deleted.push(name);
      return Promise.resolve();
    },
  };
  return { context, written, files, deleted, logs };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

Deno.test("shellQuote safely wraps values containing single quotes", () => {
  assertEquals(shellQuote("plain"), "'plain'");
  assertEquals(shellQuote("it's"), "'it'\\''s'");
  assertEquals(shellQuote("--disable traefik"), "'--disable traefik'");
});

Deno.test("isLocalHost recognises local aliases only", () => {
  for (const host of ["", "local", "localhost", "127.0.0.1", "::1"]) {
    assertEquals(isLocalHost(host), true, `expected ${JSON.stringify(host)}`);
  }
  for (const host of ["edge-1.example.com", "192.0.2.10", "k3s.example.net"]) {
    assertEquals(isLocalHost(host), false, `expected ${host}`);
  }
});

Deno.test("parseNodes summarises conditions, roles, IP and version", () => {
  const nodes = parseNodes(NODE_JSON);
  assertEquals(nodes.length, 1);
  assertEquals(nodes[0], {
    name: "node-1",
    ready: true,
    roles: ["control-plane"],
    version: "v1.36.4+k3s1",
    internalIP: "192.0.2.10",
  });
});

Deno.test("parseNodes tolerates empty and malformed input", () => {
  assertEquals(parseNodes(""), []);
  assertEquals(parseNodes("not json"), []);
  assertEquals(parseNodes("{}"), []);
});

// ---------------------------------------------------------------------------
// Model metadata
// ---------------------------------------------------------------------------

Deno.test("model exports the expected type, methods and check", () => {
  assertEquals(model.type, "@shelson/k3s");
  assertMatch(model.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
  for (const method of ["install", "status", "kubeconfig", "uninstall"]) {
    assertEquals(
      typeof model.methods[method as keyof typeof model.methods].execute,
      "function",
      method,
    );
  }
  assertEquals(typeof model.checks.reachable.execute, "function");
  assert(model.checks.reachable.labels?.includes("live"));
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

Deno.test("status reports a Ready node", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, written } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true, active: true });

  const result = await withMockedCommand(
    fake.handler,
    () => model.methods.status.execute({}, context),
  );

  assertEquals(result.dataHandles.length, 1);
  const status = written.find((w) => w.specName === "status")!.data;
  assertEquals(status.installed, true);
  assertEquals(status.serviceActive, true);
  assertEquals(status.ready, true);
  assertEquals(status.nodeCount, 1);
  assertEquals(status.k3sVersion, "v1.36.4+k3s1");
  assertStringIncludes(String(status.getNodeOutput), "Ready");
});

Deno.test("status reports a host without k3s", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, written } = createContext(globalArgs);
  const fake = fakeK3s({ installed: false, active: false });

  await withMockedCommand(
    fake.handler,
    () => model.methods.status.execute({}, context),
  );

  const status = written.find((w) => w.specName === "status")!.data;
  assertEquals(status.installed, false);
  assertEquals(status.serviceActive, false);
  assertEquals(status.ready, false);
  assertEquals(status.nodeCount, 0);
  assertEquals(status.k3sVersion, "not-installed");
});

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

Deno.test("install skips the installer when k3s is already active", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, written, files } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true, active: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.install.execute({ force: false }, context),
  );

  assertEquals(fake.installerRan(), false);
  const installation = written.find((w) => w.specName === "installation")!
    .data;
  assertEquals(installation.ready, true);
  assertEquals(installation.nodeCount, 1);
  assertEquals(files.length, 1);
  assertStringIncludes(files[0].text, "server: https://127.0.0.1:6443");
});

Deno.test("install runs the installer when k3s is absent", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, written } = createContext(globalArgs);
  const fake = fakeK3s({ installed: false, active: false, nodeCount: 1 });

  await withMockedCommand(
    fake.handler,
    () => model.methods.install.execute({ force: false }, context),
  );

  assertEquals(fake.installerRan(), true);
  const installation = written.find((w) => w.specName === "installation")!
    .data;
  assertEquals(installation.ready, true);
  assertEquals(installation.k3sVersion, "v1.36.4+k3s1");
});

Deno.test("install re-runs the installer when forced", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true, active: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.install.execute({ force: true }, context),
  );

  assertEquals(fake.installerRan(), true);
});

Deno.test("install fails when the node never registers", async () => {
  const globalArgs = model.globalArguments.parse({
    host: "local",
    waitTimeoutSeconds: 1,
  });
  const { context, written } = createContext(globalArgs);
  const fake = fakeK3s({ installed: false, active: false, nodeCount: 0 });

  await assertRejects(
    () =>
      withMockedCommand(
        fake.handler,
        () => model.methods.install.execute({ force: false }, context),
      ),
    Error,
    "did not register",
  );
  // Nothing is written when the install does not complete.
  assertEquals(written.length, 0);
});

// ---------------------------------------------------------------------------
// kubeconfig
// ---------------------------------------------------------------------------

Deno.test("kubeconfig keeps localhost for local targets", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, written, files } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.kubeconfig.execute({}, context),
  );

  const kubeconfig = written.find((w) => w.specName === "kubeconfig")!.data;
  assertEquals(kubeconfig.server, "https://127.0.0.1:6443");
  assertStringIncludes(String(kubeconfig.kubeconfig), "127.0.0.1:6443");
  assertStringIncludes(files[0].text, "127.0.0.1:6443");
});

Deno.test("kubeconfig rewrites the server for SSH targets", async () => {
  const globalArgs = model.globalArguments.parse({
    host: "edge-1.example.com",
    user: "deploy",
    kubeconfigHost: "k3s.example.com",
  });
  const { context, written, files } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.kubeconfig.execute({}, context),
  );

  const kubeconfig = written.find((w) => w.specName === "kubeconfig")!.data;
  assertEquals(kubeconfig.server, "https://k3s.example.com:6443");
  assertStringIncludes(String(kubeconfig.kubeconfig), "k3s.example.com:6443");
  assertStringIncludes(files[0].text, "k3s.example.com:6443");
});

// ---------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------

Deno.test("ssh runner passes user, port and identity to ssh", async () => {
  const globalArgs = model.globalArguments.parse({
    host: "edge-1.example.com",
    user: "deploy",
    port: 2222,
    identityFile: "~/.ssh/id_ed25519",
  });
  const { context } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.status.execute({}, context),
  );

  const sshCall = fake.calls.find((c) => c.cmd === "ssh");
  assert(sshCall, "expected an ssh invocation");
  assertEquals(sshCall.args.includes("-p"), true);
  assertEquals(sshCall.args.includes("2222"), true);
  assertEquals(sshCall.args.includes("-o"), true);
  assertEquals(sshCall.args.includes("IdentitiesOnly=yes"), true);
  assert(sshCall.args.some((a) => a.endsWith("/.ssh/id_ed25519")));
  assertEquals(sshCall.args.includes("deploy@edge-1.example.com"), true);
});

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

Deno.test("uninstall requires confirm=true", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context } = createContext(globalArgs);
  await assertRejects(
    () => model.methods.uninstall.execute({ confirm: false }, context),
    Error,
    "confirm=true",
  );
});

Deno.test("uninstall runs the script and clears stored resources", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const { context, deleted } = createContext(globalArgs);
  const fake = fakeK3s({ installed: true });

  await withMockedCommand(
    fake.handler,
    () => model.methods.uninstall.execute({ confirm: true }, context),
  );

  assertEquals(deleted, ["installation", "status", "kubeconfig"]);
});

// ---------------------------------------------------------------------------
// pre-flight check
// ---------------------------------------------------------------------------

Deno.test("reachable check passes when the target responds", async () => {
  const globalArgs = model.globalArguments.parse({ host: "local" });
  const result = await withMockedCommand(
    () => ({ stdout: "0\n", success: true }),
    () => model.checks.reachable.execute({ globalArgs }),
  );
  assertEquals(result.pass, true);
});

Deno.test("reachable check fails when the target is unreachable", async () => {
  const globalArgs = model.globalArguments.parse({
    host: "edge-1.example.com",
    user: "deploy",
  });
  const result = await withMockedCommand(
    () => ({ stdout: "", stderr: "ssh: connect refused", success: false }),
    () => model.checks.reachable.execute({ globalArgs }),
  );
  assertEquals(result.pass, false);
  assert(result.errors && result.errors.length > 0);
});
