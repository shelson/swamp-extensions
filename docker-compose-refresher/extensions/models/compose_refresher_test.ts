/**
 * Unit tests for compose_refresher pure functions.
 *
 * @module
 */
import { assertEquals, assertMatch } from "@std/assert";
import {
  compareDigests,
  isCandidate,
  model,
  utf8ToBase64,
  parseLsJson,
  splitImageTag,
} from "./compose_refresher.ts";

// ---------------------------------------------------------------------------
// withMockedCommand helper — intercepts new Deno.Command so docker calls can
// be tested without a real docker daemon.
// ---------------------------------------------------------------------------

type CommandHandler = (
  cmd: string,
  args: string[],
) => { stdout: string; stderr?: string; success: boolean; code?: number };

function withMockedCommand<T>(
  handler: CommandHandler,
  fn: () => Promise<T>,
): Promise<T> {
  const OriginalCommand = Deno.Command;
  // deno-lint-ignore no-explicit-any
  (Deno as any).Command = class MockCommand {
    #cmd: string;
    #args: string[];
    constructor(
      cmd: string,
      options: { args?: string[]; stdout?: string; stderr?: string },
    ) {
      this.#cmd = cmd;
      this.#args = options?.args ?? [];
    }
    output(): Promise<{
      success: boolean;
      code: number;
      stdout: Uint8Array;
      stderr: Uint8Array;
    }> {
      const result = handler(this.#cmd, this.#args);
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
    (Deno as any).Command = OriginalCommand;
  });
}

// Minimal local host fixture used by compareDigests tests.
const localHost = {
  name: "test-local",
  transport: "local" as const,
  sudo: false,
  sshUser: "root",
};

// ---------------------------------------------------------------------------
// model metadata
// ---------------------------------------------------------------------------

Deno.test("model export has correct type", () => {
  assertEquals(model.type, "@shelson/docker-compose-refresher");
});

Deno.test("model version matches CalVer format", () => {
  assertMatch(model.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
});

Deno.test("model has refresh method", () => {
  assertEquals(typeof model.methods.refresh.execute, "function");
});

Deno.test("model has host-reachable check", () => {
  assertEquals(typeof model.checks["host-reachable"].execute, "function");
});

// ---------------------------------------------------------------------------
// utf8ToBase64
// ---------------------------------------------------------------------------

Deno.test("utf8ToBase64: converts utf8 safely", () => {
    const original = "this-is-a-test";
    const encoded = utf8ToBase64(original);
    assertEquals(encoded, "dGhpcy1pcy1hLXRlc3Q=");
});

Deno.test("utf8ToBase64: converts utf8 with emoji safely and decode", () => {
    const original = "🎉-this-is-a-test";
    const encoded = utf8ToBase64(original);
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    );
    assertEquals(decoded, original);
});

Deno.test("utf8ToBase64: converts utf8 with emoji, accents, kanji safely", () => {
    const original = "🎉 café 你好 is-a-test";
    const encoded = utf8ToBase64(original);
    assertEquals(encoded, "8J+OiSBjYWbDqSDkvaDlpb0gaXMtYS10ZXN0");
});

Deno.test("utf8ToBase64: converts utf8 with emoji, accents, kanji safely and decode", () => {
    const original = "🎉 café 你好 is-a-test";
    const encoded = utf8ToBase64(original);
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    );
    assertEquals(decoded, original);
});

// ---------------------------------------------------------------------------
// parseLsJson
// ---------------------------------------------------------------------------

Deno.test("parseLsJson: parses JSON array", () => {
  const input = JSON.stringify([
    {
      Name: "myapp",
      ConfigFiles: "/opt/myapp/docker-compose.yml",
      WorkingDir: "/opt/myapp",
    },
    { Name: "db", ConfigFiles: "/opt/db/compose.yaml", WorkingDir: "/opt/db" },
  ]);
  const result = parseLsJson(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].Name, "myapp");
  assertEquals(result[1].WorkingDir, "/opt/db");
});

Deno.test("parseLsJson: parses NDJSON", () => {
  const input = [
    JSON.stringify({
      Name: "svc1",
      ConfigFiles: "/a/docker-compose.yml",
      WorkingDir: "/a",
    }),
    JSON.stringify({
      Name: "svc2",
      ConfigFiles: "/b/compose.yaml",
      WorkingDir: "/b",
    }),
  ].join("\n");
  const result = parseLsJson(input);
  assertEquals(result.length, 2);
  assertEquals(result[0].Name, "svc1");
  assertEquals(result[1].Name, "svc2");
});

Deno.test("parseLsJson: parses single JSON object", () => {
  const input = JSON.stringify({
    Name: "solo",
    ConfigFiles: "/solo/docker-compose.yml",
    WorkingDir: "/solo",
  });
  const result = parseLsJson(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].Name, "solo");
});

Deno.test("parseLsJson: derives WorkingDir from ConfigFiles when absent", () => {
  const input = JSON.stringify([
    { Name: "nodir", ConfigFiles: "/some/path/docker-compose.yml" },
  ]);
  const result = parseLsJson(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].WorkingDir, "/some/path");
});

Deno.test("parseLsJson: handles Config_files field variant", () => {
  const input = JSON.stringify([
    { Name: "variant", Config_files: "/x/compose.yml", WorkingDir: "/x" },
  ]);
  const result = parseLsJson(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].ConfigFiles, "/x/compose.yml");
});

Deno.test("parseLsJson: returns empty array for empty input", () => {
  assertEquals(parseLsJson(""), []);
  assertEquals(parseLsJson("  \n  "), []);
});

Deno.test("parseLsJson: skips entries missing Name", () => {
  const input = JSON.stringify([
    { ConfigFiles: "/a/compose.yml", WorkingDir: "/a" },
    { Name: "ok", ConfigFiles: "/b/compose.yml", WorkingDir: "/b" },
  ]);
  const result = parseLsJson(input);
  assertEquals(result.length, 1);
  assertEquals(result[0].Name, "ok");
});

// ---------------------------------------------------------------------------
// splitImageTag
// ---------------------------------------------------------------------------

Deno.test("splitImageTag: bare name is untagged", () => {
  const { repo, tag } = splitImageTag("nginx");
  assertEquals(repo, "nginx");
  assertEquals(tag, null);
});

Deno.test("splitImageTag: name:tag", () => {
  const { repo, tag } = splitImageTag("nginx:latest");
  assertEquals(repo, "nginx");
  assertEquals(tag, "latest");
});

Deno.test("splitImageTag: name:version tag", () => {
  const { repo, tag } = splitImageTag("redis:7.2");
  assertEquals(repo, "redis");
  assertEquals(tag, "7.2");
});

Deno.test("splitImageTag: digest-pinned image has null tag", () => {
  const { tag } = splitImageTag("nginx@sha256:abc123def456");
  assertEquals(tag, null);
});

Deno.test("splitImageTag: host:port/name is untagged", () => {
  const { repo, tag } = splitImageTag("registry.example.com:5000/myapp");
  assertEquals(repo, "registry.example.com:5000/myapp");
  assertEquals(tag, null);
});

Deno.test("splitImageTag: host:port/name:tag", () => {
  const { repo: _repo, tag } = splitImageTag(
    "registry.example.com:5000/myapp:v1.2",
  );
  assertEquals(tag, "v1.2");
});

Deno.test("splitImageTag: org/name:tag", () => {
  const { repo, tag } = splitImageTag("myorg/myapp:stable");
  assertEquals(repo, "myorg/myapp");
  assertEquals(tag, "stable");
});

// ---------------------------------------------------------------------------
// isCandidate
// ---------------------------------------------------------------------------

Deno.test("isCandidate: :latest tag matches default matchTags", () => {
  const result = isCandidate("nginx:latest", ["latest"], false);
  assertEquals(result?.matchedTag, "latest");
});

Deno.test("isCandidate: non-matching tag returns null", () => {
  assertEquals(isCandidate("nginx:1.25", ["latest"], false), null);
});

Deno.test("isCandidate: untagged with alsoRefreshUntagged=true returns match", () => {
  const result = isCandidate("nginx", ["latest"], true);
  assertEquals(result?.matchedTag, "untagged");
});

Deno.test("isCandidate: untagged with alsoRefreshUntagged=false returns null", () => {
  assertEquals(isCandidate("nginx", ["latest"], false), null);
});

Deno.test("isCandidate: empty image returns null", () => {
  assertEquals(isCandidate("", ["latest"], true), null);
});

Deno.test("isCandidate: tag match is case-insensitive", () => {
  const result = isCandidate("nginx:LATEST", ["latest"], false);
  assertEquals(result?.matchedTag, "latest");
});

Deno.test("isCandidate: custom tag in matchTags", () => {
  const result = isCandidate("myapp:edge", ["edge", "nightly"], false);
  assertEquals(result?.matchedTag, "edge");
});

// ---------------------------------------------------------------------------
// compareDigests
// ---------------------------------------------------------------------------

Deno.test("compareDigests: digests match (container path)", async () => {
  const result = await withMockedCommand((_cmd, args) => {
    // container inspect → image sha256
    if (args[0] === "container" && args[1] === "inspect") {
      return { stdout: "sha256:imgid111\n", success: true };
    }
    // image inspect for container's imageId → RepoDigest
    if (
      args[0] === "image" && args[1] === "inspect" &&
      args[2] === "sha256:imgid111"
    ) {
      return { stdout: "myrepo@sha256:abc123\n", success: true };
    }
    // buildx imagetools
    if (args[0] === "buildx") {
      return { stdout: '"sha256:abc123"\n', success: true };
    }
    return { stdout: "", success: false };
  }, () => compareDigests(localHost, "docker", "myrepo:latest", "cid001"));

  assertEquals(result.match, true);
  assertEquals(result.local, "sha256:abc123");
  assertEquals(result.registry, "sha256:abc123");
  assertEquals(result.source, "container");
});

Deno.test("compareDigests: digests differ (needs update)", async () => {
  const result = await withMockedCommand((_cmd, args) => {
    if (args[0] === "container" && args[1] === "inspect") {
      return { stdout: "sha256:oldid\n", success: true };
    }
    if (
      args[0] === "image" && args[1] === "inspect" && args[2] === "sha256:oldid"
    ) {
      return { stdout: "myrepo@sha256:old111\n", success: true };
    }
    if (args[0] === "buildx") {
      return { stdout: '"sha256:new999"\n', success: true };
    }
    return { stdout: "", success: false };
  }, () => compareDigests(localHost, "docker", "myrepo:latest", "cid002"));

  assertEquals(result.match, false);
  assertEquals(result.local, "sha256:old111");
  assertEquals(result.registry, "sha256:new999");
  assertEquals(result.source, "container");
});

Deno.test("compareDigests: container inspect fails → falls back to cache", async () => {
  const result = await withMockedCommand((_cmd, args) => {
    if (args[0] === "container" && args[1] === "inspect") {
      return { stdout: "", success: false };
    }
    // image inspect of the original tag (cache path)
    if (args[0] === "image" && args[1] === "inspect") {
      return { stdout: "myrepo@sha256:cache111\n", success: true };
    }
    if (args[0] === "buildx") {
      return { stdout: '"sha256:cache111"\n', success: true };
    }
    return { stdout: "", success: false };
  }, () => compareDigests(localHost, "docker", "myrepo:latest", "cid_fail"));

  // container inspect failed → localRef stays as image → source=cache
  assertEquals(result.source, "cache");
  assertEquals(result.local, "sha256:cache111");
  assertEquals(result.registry, "sha256:cache111");
  assertEquals(result.match, true);
});

Deno.test("compareDigests: both sides unavailable returns error", async () => {
  const result = await withMockedCommand((_cmd, _args) => {
    return { stdout: "", success: false };
  }, () => compareDigests(localHost, "docker", "myrepo:latest", undefined));

  assertEquals(result.match, false);
  assertEquals(result.local, undefined);
  assertEquals(result.registry, undefined);
  assertEquals(typeof result.error, "string");
});

Deno.test("compareDigests: no containerId uses cache path directly", async () => {
  const result = await withMockedCommand((_cmd, args) => {
    if (args[0] === "image" && args[1] === "inspect") {
      return { stdout: "myrepo@sha256:cacheid\n", success: true };
    }
    if (args[0] === "buildx") {
      return { stdout: '"sha256:cacheid"\n', success: true };
    }
    return { stdout: "", success: false };
  }, () => compareDigests(localHost, "docker", "myrepo:latest", undefined));

  assertEquals(result.source, "cache");
  assertEquals(result.match, true);
  assertEquals(result.local, "sha256:cacheid");
});
