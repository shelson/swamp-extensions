/**
 * `@simon/compose-refresher` — keep `:latest`-tagged services in local (or
 * SSH-reachable) docker compose projects up to date.
 *
 * One fan-out method, `refresh`, which:
 *   1. For each configured host: `docker compose ls` to discover every running
 *      compose project (Name, ConfigFiles, WorkingDir).
 *   2. For each project: `docker compose ... config --format json` to resolve
 *      every service's image ref.
 *   3. Keeps only services whose image tag is in `matchTags` (default
 *      `["latest"]`), plus untagged refs when `alsoRefreshUntagged` (docker
 *      treats a missing tag as `:latest`).
 *   4. Applies deny-list / per-run skip / per-run cap filters.
 *   5. In `apply` mode: `docker compose pull <svc>` then `docker compose up -d
 *      <svc>` (compose recreates only when the pulled digest differs from the
 *      running container's, so unchanged images are not needlessly restarted),
 *      then health-gates the recreated container.
 *
 * Transport: a `local` host runs `docker` directly via `Deno.Command`; an `ssh`
 * host runs the identical `docker` invocation on the remote over SSH, with the
 * command base64-encoded so the remote login shell never touches its
 * metacharacters. Adding a remote host later is a config change, not a code
 * change.
 *
 * @module
 */
import { z } from "npm:zod@4";

const HostSchema = z.object({
  name: z.string().describe(
    "Friendly name for the host (referenced by onlyHosts)",
  ),
  transport: z.enum(["local", "ssh"]).default("local"),
  sshHost: z.string().optional().describe("Required when transport=ssh"),
  sshUser: z.string().default("root"),
  identityFile: z.string().optional().describe("SSH private key path"),
  sudo: z.boolean().default(false)
    .describe("Prefix docker commands with (passwordless) sudo on the host"),
  port: z.number().optional().describe(
    "SSH port; omit to let ~/.ssh/config (or the default 22) apply",
  ),
}).superRefine((h, ctx) => {
  if (h.transport === "ssh" && !h.sshHost) {
    ctx.addIssue({
      code: "custom",
      message: "sshHost is required when transport=ssh",
      path: ["sshHost"],
    });
  }
});

const GlobalArgsSchema = z.object({
  hosts: z.array(HostSchema).min(1).describe(
    "Hosts to scan for compose projects",
  ),
  matchTags: z.array(z.string()).default(["latest"])
    .describe("Image tags (after the colon) that trigger a refresh"),
  alsoRefreshUntagged: z.boolean().default(true)
    .describe(
      "Also refresh image refs with no explicit tag (docker treats these as :latest)",
    ),
  denyImagePatterns: z.array(z.string()).default([])
    .describe(
      "Substring patterns (case-insensitive); matching images are never refreshed",
    ),
  maxPerRun: z.number().default(0)
    .describe("Hard cap on refreshes per run. 0 = unlimited."),
  healthCheckTimeoutSec: z.number().default(60)
    .describe(
      "Seconds to wait for a recreated container to reach running/healthy before flagging unhealthy",
    ),
  dockerBin: z.string().default("docker")
    .describe("Docker binary name/path on each host"),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const ActionSchema = z.object({
  host: z.string(),
  project: z.string(),
  workingDir: z.string(),
  service: z.string(),
  image: z.string(),
  matchedTag: z.string().describe(
    "The tag that matched (e.g. 'latest') or 'untagged'",
  ),
  digestLocal: z.string().optional().describe(
    "Local image digest (sha256:…) from `docker image inspect`, when determined",
  ),
  digestRegistry: z.string().optional().describe(
    "Registry manifest digest (sha256:…) from `docker buildx imagetools inspect`, when determined",
  ),
  decision: z.enum([
    "skipped_by_user",
    "skipped_by_denylist",
    "skipped_over_cap",
    "up_to_date",
    "digest_check_failed",
    "would_update",
    "updated",
    "updated_no_change",
    "failed_pull",
    "failed_up",
    "unhealthy_after",
    "error",
  ]),
  errorMessage: z.string().optional(),
  recreated: z.boolean().optional(),
  pullDurationMs: z.number().optional(),
  upDurationMs: z.number().optional(),
});

const ProjectErrorSchema = z.object({
  host: z.string(),
  project: z.string(),
  error: z.string(),
});

const UpdateLogSchema = z.object({
  ranAt: z.iso.datetime(),
  mode: z.enum(["dry_run", "applied"]),
  totalProjects: z.number(),
  totalCandidates: z.number(),
  skippedByUserCount: z.number(),
  skippedByDenylistCount: z.number(),
  skippedOverCapCount: z.number(),
  wouldUpdateCount: z.number(),
  upToDateCount: z.number(),
  digestCheckFailedCount: z.number(),
  updatedCount: z.number(),
  updatedNoChangeCount: z.number(),
  failedCount: z.number(),
  unhealthyCount: z.number(),
  errorCount: z.number(),
  actions: z.array(ActionSchema),
  projectErrors: z.array(ProjectErrorSchema),
});

interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/** POSIX-shell-quote a single argument. */
function shQuote(s: string): string {
  if (s === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, `'"'"'`) + "'";
}

/**
 * Run `docker <args>` on the given host. Local hosts spawn docker directly;
 * ssh hosts run the assembled command on the remote via a base64 payload so
 * the remote login shell cannot reinterpret metacharacters.
 */
async function runDocker(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  args: string[],
  opts: { timeoutSec?: number; signal?: AbortSignal } = {},
): Promise<ExecResult> {
  const timeoutSec = opts.timeoutSec ?? 120;
  const fullCmd: string[] = host.sudo
    ? ["sudo", dockerBin, ...args]
    : [dockerBin, ...args];

  if (host.transport === "local") {
    const proc = new Deno.Command(fullCmd[0], {
      args: fullCmd.slice(1),
      stdout: "piped",
      stderr: "piped",
      signal: opts.signal,
    });
    const { code, stdout, stderr } = await proc.output();
    return {
      ok: code === 0,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
      code,
    };
  }

  // ssh transport: assemble the docker command string, base64-encode it, and
  // pipe through `sh` on the remote so no host-shell expansion happens.
  const remoteCmd = fullCmd.map(shQuote).join(" ");
  const b64 = btoa(remoteCmd);
  const sshArgs = [
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${timeoutSec}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
  ];
  // Only pin the port when explicitly configured — otherwise let ~/.ssh/config
  // (e.g. a `Host thestuffstash / Port 2232` block) or the default 22 apply,
  // matching what a plain `ssh simon@thestuffstash` would do.
  if (host.port) {
    sshArgs.push("-p", String(host.port));
  }
  if (host.identityFile) {
    sshArgs.push("-i", host.identityFile);
  }
  sshArgs.push(`${host.sshUser}@${host.sshHost}`);
  sshArgs.push(`echo ${b64} | base64 -d | sh`);
  const proc = new Deno.Command("ssh", {
    args: sshArgs,
    stdout: "piped",
    stderr: "piped",
    signal: opts.signal,
  });
  const { code, stdout, stderr } = await proc.output();
  return {
    ok: code === 0,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    code,
  };
}

/**
 * Base compose args for a project. We pass -f and --project-directory
 * explicitly so cwd is irrelevant (works the same locally and over ssh).
 */
function composeBaseArgs(configFiles: string, workingDir: string): string[] {
  return [
    "compose",
    "-f",
    configFiles,
    "--project-directory",
    workingDir,
  ];
}

/** Parse the possibly-NDJSON, possibly-array output of `docker compose ls`. */
export function parseLsJson(stdout: string): Array<{
  Name: string;
  ConfigFiles: string;
  WorkingDir: string;
}> {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const normalize = (raw: Record<string, unknown>) => {
    const Name = raw.Name as string | undefined;
    const ConfigFiles =
      (raw.ConfigFiles ?? raw.Config_files ?? raw.configFiles) as
        | string
        | undefined;
    let WorkingDir = (raw.WorkingDir ?? raw.Working_dir ?? raw.workingDir) as
      | string
      | undefined;
    if (!Name || !ConfigFiles) return null;
    // ConfigFiles can be a comma-separated list; take the first file.
    const firstFile = String(ConfigFiles).split(",")[0].trim();
    if (!WorkingDir) {
      // `docker compose ls` does not always include WorkingDir — derive it
      // from the first config file's directory.
      const slash = firstFile.lastIndexOf("/");
      WorkingDir = slash >= 0 ? firstFile.slice(0, slash) : ".";
    }
    return { Name, ConfigFiles: String(ConfigFiles), WorkingDir };
  };
  // Try a single JSON array first.
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr)) {
      return arr.map((x) => normalize(x)).filter((x): x is {
        Name: string;
        ConfigFiles: string;
        WorkingDir: string;
      } => x !== null);
    }
    if (arr && typeof arr === "object") {
      const n = normalize(arr as Record<string, unknown>);
      return n ? [n] : [];
    }
  } catch { /* fall through to NDJSON */ }
  // NDJSON: one object per line.
  return trimmed.split("\n").filter(Boolean).map((line) => {
    try {
      return normalize(JSON.parse(line));
    } catch {
      return null;
    }
  }).filter((
    x,
  ): x is { Name: string; ConfigFiles: string; WorkingDir: string } =>
    x !== null
  );
}

interface ServiceConfig {
  image?: string;
  build?: unknown;
}

/** Parse `docker compose config --format json` into a services map. */
function parseConfigJson(stdout: string): Record<string, ServiceConfig> {
  const obj = JSON.parse(stdout.trim());
  const services = (obj.services ?? {}) as Record<string, ServiceConfig>;
  return services;
}

/**
 * Split an image ref into (repo, tag). tag is null when no explicit tag is
 * present (docker then pulls `:latest`).
 */
export function splitImageTag(
  image: string,
): { repo: string; tag: string | null } {
  // Strip digest suffix (@sha256:...) — a digest-pinned image is never :latest.
  const atIdx = image.lastIndexOf("@");
  const ref = atIdx >= 0 ? image.slice(0, atIdx) : image;
  const slashIdx = ref.lastIndexOf("/");
  const lastSegment = slashIdx >= 0 ? ref.slice(slashIdx + 1) : ref;
  const colonIdx = lastSegment.indexOf(":");
  if (colonIdx < 0) {
    // No tag at all in the last segment → untagged.
    return { repo: ref, tag: null };
  }
  // Make sure the colon isn't from a host:port (only treat the colon in the
  // last path segment as a tag separator).
  const tag = lastSegment.slice(colonIdx + 1);
  const repo = ref.slice(0, slashIdx >= 0 ? slashIdx + 1 + colonIdx : colonIdx);
  return { repo, tag };
}

interface Candidate {
  service: string;
  image: string;
  matchedTag: string;
}

export function isCandidate(
  image: string,
  matchTags: string[],
  alsoRefreshUntagged: boolean,
): Candidate | null {
  if (!image) return null;
  const { tag } = splitImageTag(image);
  if (tag === null) {
    return alsoRefreshUntagged
      ? { service: "", image, matchedTag: "untagged" }
      : null;
  }
  const hit = matchTags.find((t) => t.toLowerCase() === tag.toLowerCase());
  return hit ? { service: "", image, matchedTag: hit } : null;
}

interface ComposeProject {
  Name: string;
  ConfigFiles: string;
  WorkingDir: string;
}

async function discoverProjects(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  logger: {
    info: (m: string, p?: Record<string, unknown>) => void;
    warning: (m: string, p?: Record<string, unknown>) => void;
  },
): Promise<{ projects: ComposeProject[]; error?: string }> {
  const res = await runDocker(host, dockerBin, [
    "compose",
    "ls",
    "--format",
    "json",
  ], { timeoutSec: 60 });
  if (!res.ok) {
    return {
      projects: [],
      error: (res.stderr || res.stdout || `exit ${res.code}`).trim(),
    };
  }
  const projects = parseLsJson(res.stdout);
  logger.info("Discovered {n} compose project(s) on {host}", {
    n: projects.length,
    host: host.name,
  });
  return { projects };
}

async function discoverServices(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  project: ComposeProject,
): Promise<{ services: Record<string, ServiceConfig>; error?: string }> {
  const res = await runDocker(host, dockerBin, [
    ...composeBaseArgs(project.ConfigFiles, project.WorkingDir),
    "config",
    "--format",
    "json",
  ], { timeoutSec: 60 });
  if (!res.ok) {
    return {
      services: {},
      error: (res.stderr || res.stdout || `exit ${res.code}`).trim().slice(
        0,
        400,
      ),
    };
  }
  try {
    return { services: parseConfigJson(res.stdout) };
  } catch (e) {
    return {
      services: {},
      error: `failed to parse compose config: ${(e as Error).message}`,
    };
  }
}

/** Get the container ID for a service (empty string if none running). */
async function serviceContainerId(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  project: ComposeProject,
  service: string,
): Promise<string> {
  const res = await runDocker(host, dockerBin, [
    ...composeBaseArgs(project.ConfigFiles, project.WorkingDir),
    "ps",
    "-q",
    service,
  ], { timeoutSec: 30 });
  if (!res.ok) return "";
  return res.stdout.trim().split("\n")[0]?.trim() ?? "";
}

/** Health-gate: poll container status until running(+healthy|none) or timeout. */
async function waitForHealthy(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  containerId: string,
  timeoutSec: number,
): Promise<{ ok: boolean; detail: string }> {
  if (!containerId) return { ok: false, detail: "no container id after up" };
  const fmt =
    `'{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'`;
  const iters = Math.max(1, Math.floor(timeoutSec / 2));
  for (let i = 0; i < iters; i++) {
    const res = await runDocker(host, dockerBin, [
      "container",
      "inspect",
      containerId,
      "--format",
      fmt,
    ], { timeoutSec: 15 });
    if (res.ok) {
      const [status, health] = res.stdout.trim().split("|");
      if (status === "running" && (health === "healthy" || health === "none")) {
        return { ok: true, detail: res.stdout.trim() };
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const finalRes = await runDocker(host, dockerBin, [
    "container",
    "inspect",
    containerId,
    "--format",
    fmt,
  ], { timeoutSec: 15 });
  // Don't hardcode failure: the container may have only just reached
  // running|healthy/none after the loop's last iteration.
  if (finalRes.ok) {
    const [status, health] = finalRes.stdout.trim().split("|");
    if (status === "running" && (health === "healthy" || health === "none")) {
      return { ok: true, detail: finalRes.stdout.trim() };
    }
  }
  return {
    ok: false,
    detail: finalRes.stdout.trim() || finalRes.stderr.trim(),
  };
}

type Action = z.infer<typeof ActionSchema>;
type ProjectError = z.infer<typeof ProjectErrorSchema>;

/**
 * Determine whether the running container (or, failing that, the locally
 * cached image) matches the registry's current manifest digest.
 *
 * We compare the *running container's* image, not the cached `:latest` tag —
 * a `docker pull` can update the cache without recreating the container (e.g.
 * a previous `compose up` failed on a name conflict), in which case the cache
 * matches the registry but the container is still stale. Reading the
 * container's image ID and then *its* RepoDigest avoids that false
 * "up_to_date".
 *
 *   container image: `docker container inspect <cid> --format '{{.Image}}'
 *                     → "sha256:<config-digest>" (the image ID the container
 *                       is actually running).
 *   local repo digest: `docker image inspect <imgId-or-tag> --format '{{index .RepoDigests 0}}'
 *                     → "<repo>@sha256:<manifest-digest>"; we keep the
 *                       post-@ part.
 *   registry:          `docker buildx imagetools inspect <img> --format '{{json .Manifest.Digest}}'
 *                     → JSON string "sha256:<manifest-digest>".
 *
 * If no container is running, fall back to comparing the cached image's
 * RepoDigest (best available signal for a not-yet-started service). If either
 * side can't be determined (buildx missing, registry unreachable, auth needed,
 * image not pulled), `error` is set and `match` is false — the caller records
 * a `digest_check_failed` decision rather than guessing.
 */
export async function compareDigests(
  host: GlobalArgs["hosts"][number],
  dockerBin: string,
  image: string,
  containerId?: string,
): Promise<
  {
    local?: string;
    registry?: string;
    match: boolean;
    error?: string;
    source: "container" | "cache";
  }
> {
  // Resolve the image ref whose digest we'll treat as "local". Prefer the
  // running container's image ID so we detect stale containers even after a
  // pull refreshed the cache.
  let localRef = image;
  let source: "container" | "cache" = "cache";
  if (containerId) {
    const cidRes = await runDocker(host, dockerBin, [
      "container",
      "inspect",
      containerId,
      "--format",
      "{{.Image}}",
    ], { timeoutSec: 30 });
    const cid = cidRes.ok ? cidRes.stdout.trim() : "";
    if (cid) {
      localRef = cid;
      source = "container";
    }
  }

  const localRes = await runDocker(host, dockerBin, [
    "image",
    "inspect",
    localRef,
    "--format",
    "{{index .RepoDigests 0}}",
  ], { timeoutSec: 30 });
  let local: string | undefined;
  if (localRes.ok) {
    const raw = localRes.stdout.trim();
    if (raw) {
      const at = raw.lastIndexOf("@");
      local = at >= 0 ? raw.slice(at + 1).trim() : raw;
    }
  }
  // If we used the container's image ID but it has no RepoDigest (e.g. a
  // locally-built image with no registry push), fall back to the tag's cached
  // digest so we still compare against something useful.
  if (!local && source === "container" && containerId) {
    const tagRes = await runDocker(host, dockerBin, [
      "image",
      "inspect",
      image,
      "--format",
      "{{index .RepoDigests 0}}",
    ], { timeoutSec: 30 });
    if (tagRes.ok) {
      const raw = tagRes.stdout.trim();
      if (raw) {
        const at = raw.lastIndexOf("@");
        local = at >= 0 ? raw.slice(at + 1).trim() : raw;
        source = "cache";
      }
    }
  }

  const regRes = await runDocker(host, dockerBin, [
    "buildx",
    "imagetools",
    "inspect",
    image,
    "--format",
    "{{json .Manifest.Digest}}",
  ], { timeoutSec: 60 });
  let registry: string | undefined;
  if (regRes.ok) {
    const raw = regRes.stdout.trim();
    if (raw) {
      try {
        registry = JSON.parse(raw) as string;
      } catch {
        registry = raw.replace(/^"|"$/g, "").trim();
      }
    }
  }

  const localErr = localRes.stderr.trim().slice(0, 200) || "no output";
  const regErr = regRes.stderr.trim().slice(0, 200) || "no output";
  if (!local && !registry) {
    return {
      match: false,
      source,
      error:
        `could not determine local or registry digest (local: ${localErr}; registry: ${regErr})`,
    };
  }
  if (!registry) {
    return {
      local,
      match: false,
      source,
      error: `registry digest unavailable: ${regErr}`,
    };
  }
  if (!local) {
    return {
      registry,
      match: false,
      source,
      error: `local digest unavailable: ${localErr}`,
    };
  }
  return { local, registry, source, match: local === registry };
}

interface ExecuteContext {
  globalArgs: GlobalArgs;
  logger: {
    info: (m: string, p?: Record<string, unknown>) => void;
    warning: (m: string, p?: Record<string, unknown>) => void;
    error: (m: string, p?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
}

export const model = {
  type: "@shelson/compose-refresher",
  version: "2026.06.28.2",
  globalArguments: GlobalArgsSchema,
  checks: {
    "host-reachable": {
      description:
        "Verify docker is reachable on each configured host before running",
      labels: ["live"],
      appliesTo: ["refresh"],
      execute: async (
        context: { globalArgs: GlobalArgs; logger: ExecuteContext["logger"] },
      ) => {
        const g = context.globalArgs;
        const errors: string[] = [];
        for (const host of g.hosts) {
          const res = await runDocker(
            host,
            g.dockerBin,
            ["info", "--format", "{{.ServerVersion}}"],
            { timeoutSec: 15 },
          );
          if (!res.ok) {
            errors.push(
              `Host "${host.name}" (${host.transport}): docker unreachable — ${
                (res.stderr || res.stdout || `exit ${res.code}`).trim().slice(
                  0,
                  200,
                )
              }`,
            );
          }
        }
        if (errors.length > 0) {
          return { pass: false, errors };
        }
        return { pass: true };
      },
    },
  },
  resources: {
    "update_log": {
      description: "Per-run log of refresh actions (dry-run or applied)",
      schema: UpdateLogSchema,
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },
  methods: {
    refresh: {
      description:
        "Discover compose projects on every host, find services whose image tag is :latest (or untagged), compare local vs registry digests (buildx imagetools) to confirm an update is actually pending, then pull + recreate. Dry-run by default (apply=false).",
      arguments: z.object({
        apply: z.boolean().default(false)
          .describe(
            "If true, actually pull + recreate. If false (default), dry-run.",
          ),
        skipImages: z.array(z.string()).default([])
          .describe("Image refs to spare this run (exact match)."),
        onlyProjects: z.array(z.string()).default([])
          .describe("Restrict to these compose project names (empty = all)."),
        onlyHosts: z.array(z.string()).default([])
          .describe("Restrict to these host names (empty = all)."),
      }),
      execute: async (
        args: {
          apply: boolean;
          skipImages: string[];
          onlyProjects: string[];
          onlyHosts: string[];
        },
        context: ExecuteContext,
      ) => {
        const g = context.globalArgs;
        const apply = !!args.apply;
        const skipSet = new Set(args.skipImages);
        const onlyProjects = new Set(args.onlyProjects);
        const onlyHosts = new Set(args.onlyHosts);
        const denyLower = g.denyImagePatterns.map((p) => p.toLowerCase());

        const ranAt = new Date().toISOString();
        const actions: Action[] = [];
        const projectErrors: ProjectError[] = [];
        let updateAttempts = 0;
        let totalProjects = 0;

        const hosts = g.hosts.filter((h) =>
          onlyHosts.size === 0 || onlyHosts.has(h.name)
        );

        for (const host of hosts) {
          context.logger.info("Scanning host {host} ({transport})", {
            host: host.name,
            transport: host.transport,
          });
          const disc = await discoverProjects(
            host,
            g.dockerBin,
            context.logger,
          );
          if (disc.error) {
            context.logger.error("Failed to list projects on {host}: {err}", {
              host: host.name,
              err: disc.error,
            });
            // Record as a host-level project error.
            projectErrors.push({
              host: host.name,
              project: "*",
              error: disc.error.slice(0, 400),
            });
            continue;
          }
          totalProjects += disc.projects.length;

          for (const project of disc.projects) {
            if (onlyProjects.size > 0 && !onlyProjects.has(project.Name)) {
              continue;
            }
            const svcRes = await discoverServices(host, g.dockerBin, project);
            if (svcRes.error) {
              projectErrors.push({
                host: host.name,
                project: project.Name,
                error: svcRes.error,
              });
              continue;
            }

            for (const [serviceName, cfg] of Object.entries(svcRes.services)) {
              const image = cfg.image;
              if (!image) continue; // build-only or image-less service
              const cand = isCandidate(
                image,
                g.matchTags,
                g.alsoRefreshUntagged,
              );
              if (!cand) continue;

              const base: Action = {
                host: host.name,
                project: project.Name,
                workingDir: project.WorkingDir,
                service: serviceName,
                image,
                matchedTag: cand.matchedTag,
                decision: "error",
              };

              if (skipSet.has(image)) {
                actions.push({ ...base, decision: "skipped_by_user" });
                continue;
              }
              const lower = image.toLowerCase();
              const denyHit = denyLower.find((p) => p && lower.includes(p));
              if (denyHit) {
                actions.push({
                  ...base,
                  decision: "skipped_by_denylist",
                  errorMessage: `Matches deny pattern "${denyHit}"`,
                });
                continue;
              }
              // Identify the running container (if any) so we can (a) compare
              // its image digest vs the registry for an accurate up-to-date
              // verdict, and (b) detect whether a later `up` recreates it.
              const beforeId = await serviceContainerId(
                host,
                g.dockerBin,
                project,
                serviceName,
              );

              // Compare the *running container's* image digest vs the registry
              // manifest digest, so dry-run reports whether an update is
              // *actually* pending rather than just "tag is :latest" — and so a
              // stale container (recreate failed previously) isn't masked by a
              // freshly-pulled cache. buildx imagetools queries the registry;
              // container/image inspect reads what's actually running.
              const dig = await compareDigests(
                host,
                g.dockerBin,
                image,
                beforeId || undefined,
              );
              if (dig.error) {
                actions.push({
                  ...base,
                  decision: "digest_check_failed",
                  digestLocal: dig.local,
                  digestRegistry: dig.registry,
                  errorMessage: dig.error,
                });
                continue;
              }
              if (dig.match) {
                actions.push({
                  ...base,
                  decision: "up_to_date",
                  digestLocal: dig.local,
                  digestRegistry: dig.registry,
                });
                continue;
              }
              // Differs — record both digests on the base for all downstream
              // decisions, and count this as a real update attempt vs the cap.
              base.digestLocal = dig.local;
              base.digestRegistry = dig.registry;

              if (g.maxPerRun > 0 && updateAttempts >= g.maxPerRun) {
                actions.push({ ...base, decision: "skipped_over_cap" });
                continue;
              }
              updateAttempts += 1;

              if (!apply) {
                actions.push({ ...base, decision: "would_update" });
                continue;
              }

              // beforeId was captured above (before the digest comparison).

              // Pull.
              const pullStart = Date.now();
              const pull = await runDocker(host, g.dockerBin, [
                ...composeBaseArgs(project.ConfigFiles, project.WorkingDir),
                "pull",
                serviceName,
              ], { timeoutSec: 300 });
              const pullMs = Date.now() - pullStart;
              if (!pull.ok) {
                actions.push({
                  ...base,
                  decision: "failed_pull",
                  errorMessage: (pull.stderr || pull.stdout).slice(0, 400),
                  pullDurationMs: pullMs,
                });
                continue;
              }

              // up -d (no --force-recreate): compose recreates only if the image
              // digest changed.
              const upStart = Date.now();
              const up = await runDocker(host, g.dockerBin, [
                ...composeBaseArgs(project.ConfigFiles, project.WorkingDir),
                "up",
                "-d",
                serviceName,
              ], { timeoutSec: 300 });
              const upMs = Date.now() - upStart;
              if (!up.ok) {
                actions.push({
                  ...base,
                  decision: "failed_up",
                  errorMessage: (up.stderr || up.stdout).slice(0, 400),
                  pullDurationMs: pullMs,
                  upDurationMs: upMs,
                });
                continue;
              }

              const afterId = await serviceContainerId(
                host,
                g.dockerBin,
                project,
                serviceName,
              );
              const recreated = !!afterId && afterId !== beforeId;

              if (recreated) {
                // Health-gate the recreated container.
                const health = await waitForHealthy(
                  host,
                  g.dockerBin,
                  afterId,
                  g.healthCheckTimeoutSec,
                );
                if (!health.ok) {
                  actions.push({
                    ...base,
                    decision: "unhealthy_after",
                    errorMessage: health.detail.slice(0, 400),
                    recreated: true,
                    pullDurationMs: pullMs,
                    upDurationMs: upMs,
                  });
                  continue;
                }
              }

              actions.push({
                ...base,
                decision: recreated ? "updated" : "updated_no_change",
                recreated,
                pullDurationMs: pullMs,
                upDurationMs: upMs,
              });
            }
          }
        }

        const log = {
          ranAt,
          mode: apply ? "applied" as const : "dry_run" as const,
          totalProjects,
          totalCandidates: actions.length,
          skippedByUserCount:
            actions.filter((a) => a.decision === "skipped_by_user").length,
          skippedByDenylistCount:
            actions.filter((a) => a.decision === "skipped_by_denylist").length,
          skippedOverCapCount:
            actions.filter((a) => a.decision === "skipped_over_cap").length,
          wouldUpdateCount:
            actions.filter((a) => a.decision === "would_update").length,
          upToDateCount:
            actions.filter((a) => a.decision === "up_to_date").length,
          digestCheckFailedCount:
            actions.filter((a) => a.decision === "digest_check_failed").length,
          updatedCount: actions.filter((a) => a.decision === "updated").length,
          updatedNoChangeCount:
            actions.filter((a) => a.decision === "updated_no_change").length,
          failedCount:
            actions.filter((a) =>
              ["failed_pull", "failed_up", "error"].includes(a.decision)
            ).length,
          unhealthyCount:
            actions.filter((a) => a.decision === "unhealthy_after").length,
          errorCount: projectErrors.length,
          actions,
          projectErrors,
        };

        const handle = await context.writeResource(
          "update_log",
          "update_log",
          log,
        );
        context.logger.info("Refresh complete", {
          mode: log.mode,
          totalProjects: log.totalProjects,
          totalCandidates: log.totalCandidates,
          wouldUpdate: log.wouldUpdateCount,
          updated: log.updatedCount,
          upToDate: log.upToDateCount,
          failed: log.failedCount,
          errors: log.errorCount,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
