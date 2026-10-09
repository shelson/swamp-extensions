/**
 * Pi coding agent — drive a pi coding agent session from swamp.
 *
 * Embeds `@earendil-works/pi-coding-agent` in the swamp process via its
 * TypeScript SDK, so a model method can launch a coding-agent session, send a
 * prompt, and capture the agent's text, tool calls, token usage, and cost as
 * structured swamp data. No subprocess and no terminal scraping.
 *
 * Sessions are pi's persistent JSONL sessions: successive `run` calls with the
 * same `sessionKey` continue the same conversation. Give each concurrent work
 * item its own `sessionKey` so they don't share context. The session file is
 * recorded on the `session-<key>` data record, so a later workflow step can
 * continue it by key alone.
 *
 * The agent is hermetic: `provider`, `model`, and an explicit `apiKey` (usually
 * sourced from a vault with `vault.get(...)`) are required, and the user's
 * `~/.pi` is never read or written. Credentials, global resources, and sessions
 * live in an isolated, repo-local `agentDir`; the agent starts clean and loads
 * only project resources from `cwd`.
 *
 * Working directory, thinking level, tool allow/deny lists, resource-discovery
 * switches, and the system prompt are model configuration — set them once in
 * `globalArguments` and override per `run`.
 *
 * @module
 */

import { PI_AGENT_ROOT } from "./isolation.ts";
import { z } from "npm:zod@4";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "npm:@earendil-works/pi-coding-agent@0.87.1";
import {
  assistantError,
  defaultAgentDir,
  isDirectChild,
  nonNegative,
  resolveCwd,
  type StatsLike,
  tokenDelta,
} from "./helpers.ts";

/** Reasoning effort levels understood by pi. */
const ThinkingLevelSchema = z.enum(["off", "low", "medium", "high"]);

/** Token accounting for a session or a single run. */
const TokensSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  total: z.number(),
});

/** Runtime configuration shared by every method on the model instance. */
const GlobalArgsSchema = z.object({
  cwd: z.string().default(".").describe(
    "Working directory for the agent's tools and project resource discovery. Relative paths resolve against the swamp repo directory.",
  ),
  provider: z.string().min(1).describe(
    'Provider id, e.g. "openrouter" or "anthropic".',
  ),
  model: z.string().min(1).describe(
    'Model id within the provider, e.g. "deepseek/deepseek-v4.1-flash".',
  ),
  apiKey: z.string().min(1).meta({ sensitive: true }).describe(
    'Provider API key (sensitive). Pass it via --global-arg from a vault, e.g. a vault.get("my-vault", "OPENROUTER_API_KEY") expression.',
  ),
  agentDir: z.string().optional().describe(
    "Isolated pi config dir (auth, models store, global resources). Defaults to <repo>/.swamp/pi-agent/<instance>. The user's ~/.pi is never read or written.",
  ),
  modelsPath: z.string().optional().describe(
    "Explicit models.json for custom model definitions. Omit to disable custom models entirely (the global models.json is never read).",
  ),
  thinkingLevel: ThinkingLevelSchema.default("medium"),
  tools: z.array(z.string()).optional().describe(
    "Allowlist of tool names. Omit to use pi's defaults (read, bash, edit, write) plus extension tools.",
  ),
  excludeTools: z.array(z.string()).optional().describe(
    "Tool names to disable after the allowlist applies.",
  ),
  noTools: z.enum(["all", "builtin"]).optional().describe(
    '"all" starts with no tools; "builtin" drops read/bash/edit/write but keeps extension tools.',
  ),
  noExtensions: z.boolean().default(false).describe(
    "Skip discovering pi extensions from the working directory. Global extensions are never loaded.",
  ),
  noSkills: z.boolean().default(false),
  noPromptTemplates: z.boolean().default(false),
  contextFiles: z.enum(["cwd", "ancestors", "off"]).default("cwd").describe(
    'AGENTS.md / CLAUDE.md context files to load: "cwd" (working directory only, default), "ancestors" (walk parent dirs like pi does), or "off".',
  ),
  skills: z.array(z.string()).default([]).describe(
    "Extra skill paths — a directory containing SKILL.md, or a single .md skill file — loaded in addition to cwd discovery. Relative paths resolve against the swamp repo dir.",
  ),
  systemPrompt: z.string().optional().describe(
    "Replace the default system prompt entirely.",
  ),
  appendSystemPrompt: z.array(z.string()).default([]).describe(
    "Extra system-prompt sections appended after the default.",
  ),
  sessionDir: z.string().optional().describe(
    "Directory for persistent session files. Defaults to <agentDir>/sessions.",
  ),
  persistSessions: z.boolean().default(true).describe(
    "Persist sessions to disk. Set false for throwaway in-memory conversations.",
  ),
  defaultTimeoutMs: z.number().int().min(1_000).default(600_000).describe(
    "Abort a run that exceeds this wall-clock budget.",
  ),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Persisted summary of a conversation, keyed on the model by sessionKey. */
const SessionSchema = z.object({
  sessionKey: z.string(),
  sessionId: z.string(),
  sessionFile: z.string().nullable(),
  cwd: z.string(),
  model: z.string(),
  thinkingLevel: z.string(),
  status: z.enum(["active", "error"]),
  turns: z.number().int(),
  lastText: z.string(),
  tokens: TokensSchema,
  cost: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable().optional(),
});

/** One `run` invocation: prompt, response, and usage for that turn. */
const RunSchema = z.object({
  runId: z.string(),
  sessionKey: z.string(),
  sessionId: z.string(),
  sessionFile: z.string().nullable(),
  prompt: z.string(),
  text: z.string(),
  success: z.boolean(),
  timedOut: z.boolean(),
  error: z.string().nullable().optional(),
  errorStack: z.string().nullable().optional(),
  startedAt: z.string(),
  completedAt: z.string(),
  durationMs: z.number(),
  model: z.string(),
  toolCalls: z.array(z.string()),
  tokens: TokensSchema,
  cost: z.number(),
});

/** Models available with the configured credentials. */
const CatalogSchema = z.object({
  models: z.array(z.object({
    provider: z.string(),
    id: z.string(),
    name: z.string(),
  })),
  count: z.number(),
  listedAt: z.string(),
});

/** Persisted session discovery results. */
const SessionListSchema = z.object({
  sessions: z.array(z.object({
    id: z.string(),
    path: z.string(),
    cwd: z.string(),
    name: z.string().nullable(),
    created: z.string(),
    modified: z.string(),
    messageCount: z.number(),
    firstMessage: z.string(),
  })),
  count: z.number(),
  truncated: z.boolean(),
  listedAt: z.string(),
});

/** Structured logger surface provided by swamp. */
type Logger = {
  debug(message: string, properties?: Record<string, unknown>): void;
  info(message: string, properties?: Record<string, unknown>): void;
  warning(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
};

/** Minimal context surface the model relies on. */
type MethodContext = {
  globalArgs: GlobalArgs;
  definition?: { id?: string; name?: string };
  modelId?: string;
  logger: Logger;
  writeResource: (
    specName: string,
    instanceName: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  readResource: (
    instanceName: string,
  ) => Promise<Record<string, unknown> | null>;
};

/** Resolve the isolated agent dir for a call; never the user's ~/.pi. */
function resolveAgentDir(
  globalArgs: GlobalArgs,
  context: MethodContext,
): string {
  if (globalArgs.agentDir) return resolveCwd(globalArgs.agentDir);
  return defaultAgentDir(
    context.definition?.name ?? context.modelId ?? "default",
    PI_AGENT_ROOT,
  );
}

/** Resolve the session dir, defaulting under the isolated agent dir. */
function resolveSessionDir(globalArgs: GlobalArgs, agentDir: string): string {
  return globalArgs.sessionDir
    ? resolveCwd(globalArgs.sessionDir)
    : `${agentDir}/sessions`;
}

/**
 * Build a credential-isolated model runtime for one explicit provider/key.
 *
 * Explicit `authPath`/`modelsPath` mean the SDK never falls back to the running
 * user's `~/.pi` credentials or custom models.
 */
async function buildRuntime(
  agentDir: string,
  provider: string,
  apiKey: string,
  modelsPath: string | null,
): Promise<ModelRuntime> {
  await Deno.mkdir(agentDir, { recursive: true });
  const runtime = await ModelRuntime.create({
    authPath: `${agentDir}/auth.json`,
    modelsPath,
  });
  await runtime.setRuntimeApiKey(provider, apiKey);
  return runtime;
}

/** Pick a session manager; sessionDir is always explicit (never ~/.pi). */
function sessionManagerFor(
  persist: boolean,
  cwd: string,
  sessionDir: string,
  existingFile: string | null,
): SessionManager {
  if (existingFile) return SessionManager.open(existingFile, sessionDir, cwd);
  if (!persist) return SessionManager.inMemory(cwd);
  return SessionManager.create(cwd, sessionDir);
}

/** Build the resource loader applying the discovery/exposure switches. */
async function buildResourceLoader(
  globalArgs: GlobalArgs,
  cwd: string,
  agentDir: string,
  settingsManager: SettingsManager,
): Promise<DefaultResourceLoader> {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: globalArgs.noExtensions,
    noSkills: globalArgs.noSkills,
    noPromptTemplates: globalArgs.noPromptTemplates,
    noContextFiles: globalArgs.contextFiles === "off",
    additionalSkillPaths: globalArgs.skills.map((skill) => resolveCwd(skill)),
    ...(globalArgs.contextFiles === "cwd"
      ? {
        agentsFilesOverride: (
          base: { agentsFiles: Array<{ path: string; content: string }> },
        ) => ({
          agentsFiles: base.agentsFiles.filter((file) =>
            isDirectChild(file.path, cwd)
          ),
        }),
      }
      : {}),
    ...(globalArgs.systemPrompt !== undefined
      ? { systemPrompt: globalArgs.systemPrompt }
      : {}),
    appendSystemPrompt: globalArgs.appendSystemPrompt,
  });
  await loader.reload();
  return loader;
}

/** Arguments for the `run` method. */
const RunArgsSchema = z.object({
  prompt: z.string().describe("The message to send to the agent"),
  sessionKey: z.string().default("default").describe(
    "Conversation identity; the same key continues the same session. Use one key per work item to isolate context.",
  ),
  sessionFile: z.string().optional().describe(
    "Explicit pi session file to continue, overriding the stored session for this key.",
  ),
  newSession: z.boolean().default(false).describe(
    "Ignore any stored session and start a fresh conversation.",
  ),
  cwd: z.string().optional().describe(
    "Working directory override for this run.",
  ),
  model: z.string().optional().describe(
    "Model id override within the instance's provider.",
  ),
  thinkingLevel: ThinkingLevelSchema.optional(),
  tools: z.array(z.string()).optional(),
  excludeTools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional().describe(
    "System prompt override for this run.",
  ),
  timeoutMs: z.number().int().min(1_000).optional().describe(
    "Abort the run after this many milliseconds.",
  ),
});

type RunArgs = z.infer<typeof RunArgsSchema>;

/** Pi coding agent model: run/models/sessions methods over embedded SDK sessions. */
export const model = {
  type: "@shelson/pi-agent",
  version: "2026.09.26.2",
  globalArguments: GlobalArgsSchema,
  upgrades: [
    {
      toVersion: "2026.09.26.2",
      description:
        "Version bump: ship isolation.ts with the model so re-bundling from source keeps the hermetic ~/.pi redirect",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
  resources: {
    session: {
      description: "Persisted conversation summary for one session key",
      schema: SessionSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    run: {
      description: "One prompt/response turn with its usage",
      schema: RunSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    catalog: {
      description: "Models available with the configured credentials",
      schema: CatalogSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
    sessionList: {
      description: "Discovered pi sessions for a working directory",
      schema: SessionListSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
  },
  methods: {
    run: {
      description:
        "Launch or continue a pi agent session, send one prompt, and capture the response, tool calls, tokens, and cost",
      arguments: RunArgsSchema,
      execute: async (
        args: RunArgs,
        context: MethodContext,
      ) => {
        const globalArgs = context.globalArgs;
        const logger = context.logger;
        const cwd = resolveCwd(args.cwd ?? globalArgs.cwd);
        const effective: GlobalArgs = {
          ...globalArgs,
          cwd,
          ...(args.model !== undefined ? { model: args.model } : {}),
          ...(args.thinkingLevel !== undefined
            ? { thinkingLevel: args.thinkingLevel }
            : {}),
          ...(args.tools !== undefined ? { tools: args.tools } : {}),
          ...(args.excludeTools !== undefined
            ? { excludeTools: args.excludeTools }
            : {}),
          ...(args.systemPrompt !== undefined
            ? { systemPrompt: args.systemPrompt }
            : {}),
        };

        // Resolve which session file to continue, if any.
        const stored = args.newSession
          ? null
          : await context.readResource(`session-${args.sessionKey}`);
        const sessionFile = args.sessionFile ??
          (typeof stored?.sessionFile === "string" ? stored.sessionFile : null);
        logger.debug("pi session resolved: {*}", {
          sessionKey: args.sessionKey,
          sessionFile: sessionFile ?? "(new)",
          newSession: args.newSession,
        });

        const agentDir = resolveAgentDir(effective, context);
        const sessionDir = resolveSessionDir(effective, agentDir);
        const runtime = await buildRuntime(
          agentDir,
          effective.provider,
          effective.apiKey,
          effective.modelsPath ?? null,
        );
        const settingsManager = SettingsManager.create(cwd, agentDir);
        const resourceLoader = await buildResourceLoader(
          effective,
          cwd,
          agentDir,
          settingsManager,
        );
        logger.debug("pi resources loaded: {*}", {
          cwd,
          agentDir,
          noExtensions: effective.noExtensions,
          noSkills: effective.noSkills,
        });

        // Resolve the requested model up front so a typo fails loudly.
        const model = runtime.getModel(effective.provider, effective.model);
        if (!model) {
          let sample = "";
          try {
            const available = await runtime.getAvailable();
            sample = available.slice(0, 10)
              .map((m) => `  ${m.provider}/${m.id}`).join("\n");
          } catch (cause) {
            logger.warning("could not list available models: {error}", {
              error: cause instanceof Error ? cause.message : String(cause),
            });
          }
          throw new Error(
            `model "${effective.provider}/${effective.model}" not found.${
              sample ? ` Available:\n${sample}` : ""
            }`,
          );
        }
        logger.debug("pi model resolved: {*}", {
          provider: effective.provider,
          model: effective.model,
        });

        const sessionManager = sessionManagerFor(
          effective.persistSessions,
          cwd,
          sessionDir,
          sessionFile,
        );
        const { session } = await createAgentSession({
          cwd,
          agentDir,
          model,
          thinkingLevel: effective.thinkingLevel,
          ...(effective.tools ? { tools: effective.tools } : {}),
          ...(effective.excludeTools
            ? { excludeTools: effective.excludeTools }
            : {}),
          ...(effective.noTools ? { noTools: effective.noTools } : {}),
          modelRuntime: runtime,
          resourceLoader,
          sessionManager,
        });

        logger.info("pi run started: {*}", {
          sessionKey: args.sessionKey,
          provider: effective.provider,
          model: effective.model,
          cwd,
          agentDir,
          continued: sessionFile !== null,
        });

        const startedAt = new Date();
        const toolCalls: string[] = [];
        const unsubscribe = session.subscribe((event) => {
          if (event.type === "tool_execution_start") {
            toolCalls.push(event.toolName);
          }
        });

        const timeoutMs = args.timeoutMs ?? globalArgs.defaultTimeoutMs;
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          logger.warning("pi run timeout reached, aborting: {*}", {
            sessionKey: args.sessionKey,
            timeoutMs,
          });
          session.abort().catch((cause) => {
            logger.warning("pi run abort failed: {error}", {
              error: cause instanceof Error ? cause.message : String(cause),
            });
          });
        }, timeoutMs);

        const before = session.getSessionStats() as StatsLike;
        let error: string | undefined;
        let errorStack: string | undefined;
        let after = before;
        let text = "";
        let sessionId = "";
        let resolvedSessionFile: string | null = null;
        let modelLabel = "unknown";
        let assistantFailure: string | undefined;
        try {
          await session.prompt(args.prompt);
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
          errorStack = cause instanceof Error ? cause.stack : undefined;
        } finally {
          clearTimeout(timer);
          unsubscribe();
          try {
            after = session.getSessionStats() as StatsLike;
            text = session.getLastAssistantText() ?? "";
            assistantFailure = assistantError(session.messages);
            sessionId = session.sessionId;
            resolvedSessionFile = session.sessionFile ?? null;
            modelLabel = session.model
              ? `${session.model.provider}/${session.model.id}`
              : "unknown";
          } catch (cause) {
            if (!error) {
              error = cause instanceof Error ? cause.message : String(cause);
            }
          } finally {
            session.dispose();
          }
        }

        if (!error && assistantFailure) error = assistantFailure;
        if (timedOut) error = `timed out after ${timeoutMs}ms`;
        const finishedAt = new Date();
        if (error) {
          logger.error("pi run failed: {error}", {
            sessionKey: args.sessionKey,
            error,
            stack: errorStack,
          });
        } else {
          logger.info("pi run finished: {*}", {
            sessionKey: args.sessionKey,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            toolCalls: toolCalls.length,
            tokens: after.tokens.total - before.tokens.total,
          });
        }

        const createdAt = typeof stored?.createdAt === "string"
          ? stored.createdAt
          : startedAt.toISOString();
        const sessionHandle = await context.writeResource(
          "session",
          `session-${args.sessionKey}`,
          {
            sessionKey: args.sessionKey,
            sessionId,
            sessionFile: resolvedSessionFile,
            cwd,
            model: modelLabel,
            thinkingLevel: effective.thinkingLevel,
            status: error ? "error" : "active",
            turns: after.userMessages,
            lastText: text,
            tokens: after.tokens,
            cost: after.cost,
            createdAt,
            updatedAt: finishedAt.toISOString(),
            error: error ?? null,
          },
        );
        const runHandle = await context.writeResource(
          "run",
          `run-${args.sessionKey}`,
          {
            runId: crypto.randomUUID(),
            sessionKey: args.sessionKey,
            sessionId,
            sessionFile: resolvedSessionFile,
            prompt: args.prompt,
            text,
            success: !error,
            timedOut,
            error: error ?? null,
            errorStack: errorStack ?? null,
            startedAt: startedAt.toISOString(),
            completedAt: finishedAt.toISOString(),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            model: modelLabel,
            toolCalls,
            tokens: tokenDelta(before, after),
            cost: nonNegative(after.cost - before.cost),
          },
        );

        if (error) {
          throw new Error(`pi agent run failed: ${error}`);
        }
        return {
          dataHandles: [sessionHandle, runHandle],
          output: {
            text,
            sessionId,
            sessionFile: resolvedSessionFile,
            model: modelLabel,
            toolCalls,
            tokens: tokenDelta(before, after),
            cost: nonNegative(after.cost - before.cost),
          },
        };
      },
    },

    models: {
      description:
        "List models available with the configured credentials (aids model selection)",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: MethodContext,
      ) => {
        const agentDir = resolveAgentDir(context.globalArgs, context);
        const runtime = await buildRuntime(
          agentDir,
          context.globalArgs.provider,
          context.globalArgs.apiKey,
          context.globalArgs.modelsPath ?? null,
        );
        const available = await runtime.getAvailable();
        const models = available.map((m) => ({
          provider: m.provider,
          id: m.id,
          name: m.name ?? m.id,
        }));
        context.logger.info("pi models listed: {count}", {
          count: models.length,
        });
        const handle = await context.writeResource("catalog", "models", {
          models,
          count: models.length,
          listedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle], output: { count: models.length } };
      },
    },

    sessions: {
      description: "List persisted pi sessions for a working directory",
      arguments: z.object({
        cwd: z.string().optional(),
        limit: z.number().int().min(1).default(50),
      }),
      execute: async (
        args: { cwd?: string; limit: number },
        context: MethodContext,
      ) => {
        const cwd = resolveCwd(args.cwd ?? context.globalArgs.cwd);
        const agentDir = resolveAgentDir(context.globalArgs, context);
        const infos = await SessionManager.list(
          cwd,
          resolveSessionDir(context.globalArgs, agentDir),
        );
        const sessions = infos.slice(0, args.limit).map((info) => ({
          id: info.id,
          path: info.path,
          cwd: info.cwd,
          name: info.name ?? null,
          created: info.created.toISOString(),
          modified: info.modified.toISOString(),
          messageCount: info.messageCount,
          firstMessage: info.firstMessage,
        }));
        context.logger.info("pi sessions listed: {count}", {
          count: sessions.length,
        });
        const handle = await context.writeResource("sessionList", "sessions", {
          sessions,
          count: sessions.length,
          truncated: infos.length > args.limit,
          listedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle], output: { count: sessions.length } };
      },
    },
  },
};
