/**
 * Home lab project lifecycle and deploy-state tracking.
 *
 * @module
 */
import { z } from "npm:zod@4";
import {
  DeployStateSchema,
  LEGAL_DEPLOY_TRANSITIONS,
  type ProjectState,
  ProjectStateSchema,
  readStateForCheck,
  TERMINAL_LIFECYCLE_STATES,
} from "./_lib/homelab_project.ts";

const ALL_NON_CREATE_METHODS = [
  "commit",
  "startDevelopment",
  "loseMomentum",
  "markUseful",
  "resumeDevelopment",
  "retire",
  "shelve",
  "addCompose",
  "deploy",
  "recoverFromError",
  "setDeployState",
];

export const model = {
  type: "@shelson/homelab-project",
  version: "2026.06.28.1",
  globalArguments: z.object({}),
  resources: {
    "state": {
      description:
        "Full project record: lifecycle state, deploy state, repo, compose path, host",
      schema: ProjectStateSchema,
      lifetime: "infinite",
      garbageCollection: 200,
    },
  },
  methods: {
    create: {
      description: "Capture a wild idea — no repo yet, just makes the project visible",
      arguments: z.object({
        title: z.string(),
        notes: z.string().optional(),
      }),
      execute: async (
        args: { title: string; notes?: string },
        context: {
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const now = new Date().toISOString();
        const state: ProjectState = {
          title: args.title,
          researchNotes: args.notes ?? null,
          transitionNote: null,
          lifecycleState: "wild-idea",
          lifecycleEnteredAt: now,
          deployState: "idle",
          deployStateEnteredAt: now,
          deployErrorReason: null,
          repository: null,
          composePath: null,
          host: null,
          createdAt: now,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    commit: {
      description: "Let's do it! — attach a repository and move wild-idea to committed",
      arguments: z.object({
        repoUrl: z.string().optional(),
        branch: z.string().default("main"),
        createNewRepo: z.boolean().default(false),
        newRepoName: z.string().optional(),
      }),
      execute: async (
        args: {
          repoUrl?: string;
          branch: string;
          createNewRepo: boolean;
          newRepoName?: string;
        },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        if (args.createNewRepo) {
          throw new Error(
            "GitHub repo auto-creation not yet implemented — pass repoUrl for an existing repository instead",
          );
        }
        if (!args.repoUrl) {
          throw new Error("repoUrl is required unless createNewRepo is true");
        }
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          repository: { url: args.repoUrl, branch: args.branch },
          lifecycleState: "committed",
          lifecycleEnteredAt: now,
          transitionNote: null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    startDevelopment: {
      description: "Move committed to in-development",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          lifecycleState: "in-development",
          lifecycleEnteredAt: now,
          transitionNote: null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    loseMomentum: {
      description: "Move in-development or being-useful to lost-momentum",
      arguments: z.object({ note: z.string().optional() }),
      execute: async (
        args: { note?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          lifecycleState: "lost-momentum",
          lifecycleEnteredAt: now,
          transitionNote: args.note ?? null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    markUseful: {
      description: "Move in-development to being-useful (now a production-ish service)",
      arguments: z.object({ note: z.string().optional() }),
      execute: async (
        args: { note?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          lifecycleState: "being-useful",
          lifecycleEnteredAt: now,
          transitionNote: args.note ?? null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    resumeDevelopment: {
      description: "Revive lost-momentum back to in-development",
      arguments: z.object({ note: z.string().optional() }),
      execute: async (
        args: { note?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          lifecycleState: "in-development",
          lifecycleEnteredAt: now,
          transitionNote: args.note ?? null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    retire: {
      description:
        "Move being-useful or lost-momentum to old-and-boring; un-places if still placed",
      arguments: z.object({ note: z.string().optional() }),
      execute: async (
        args: { note?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const stillPlaced = existing.deployState !== "idle";
        const state: ProjectState = {
          ...existing,
          lifecycleState: "old-and-boring",
          lifecycleEnteredAt: now,
          transitionNote: args.note ?? null,
          deployState: stillPlaced ? "idle" : existing.deployState,
          deployStateEnteredAt: stillPlaced ? now : existing.deployStateEnteredAt,
          deployErrorReason: stillPlaced ? null : existing.deployErrorReason,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    shelve: {
      description: "That's a nope — move wild-idea to shelved",
      arguments: z.object({ reason: z.string().optional() }),
      execute: async (
        args: { reason?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          lifecycleState: "shelved",
          lifecycleEnteredAt: now,
          transitionNote: args.reason ?? null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    addCompose: {
      description: "Record the path to the project's compose.yaml",
      arguments: z.object({ composePath: z.string() }),
      execute: async (
        args: { composePath: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          composePath: args.composePath,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    deploy: {
      description:
        "Target a host for placement; sets deployState to ready-for-placement (no-op beyond state today)",
      arguments: z.object({ host: z.string() }),
      execute: async (
        args: { host: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          host: args.host,
          deployState: "ready-for-placement",
          deployStateEnteredAt: now,
          deployErrorReason: null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    recoverFromError: {
      description:
        "After investigating a placed-errored project, mark it placed-stopped again",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          deployState: "placed-stopped",
          deployStateEnteredAt: now,
          deployErrorReason: null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },

    setDeployState: {
      description:
        "Manual escape hatch: move deployState along a legal edge (test-driver until real placement automation exists)",
      arguments: z.object({
        target: DeployStateSchema,
        reason: z.string().optional(),
      }),
      execute: async (
        args: { target: z.infer<typeof DeployStateSchema>; reason?: string },
        context: {
          readResource: (name: string) => Promise<Record<string, unknown> | null>;
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const existing = await context.readResource!("current") as
          | ProjectState
          | null;
        if (!existing) throw new Error("Project not initialized — run create first");
        const allowed = LEGAL_DEPLOY_TRANSITIONS[existing.deployState] ?? [];
        if (!allowed.includes(args.target)) {
          throw new Error(
            `Illegal deploy-state transition: "${existing.deployState}" -> "${args.target}". ` +
              `Legal targets from "${existing.deployState}": ${
                allowed.join(", ") || "(none)"
              }`,
          );
        }
        const now = new Date().toISOString();
        const state: ProjectState = {
          ...existing,
          deployState: args.target,
          deployStateEnteredAt: now,
          deployErrorReason: args.target === "placed-errored"
            ? (args.reason ?? null)
            : null,
          updatedAt: now,
        };
        const handle = await context.writeResource("state", "current", state);
        return { dataHandles: [handle] };
      },
    },
  },
  checks: {
    "already-initialized": {
      description:
        "create must not run twice — use the other methods to evolve an existing project",
      appliesTo: ["create"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (state) {
          return {
            pass: false,
            errors: [
              "Project already initialized (state exists) — use commit/startDevelopment/etc instead of create",
            ],
          };
        }
        return { pass: true };
      },
    },
    "lifecycle-guard": {
      description:
        "Every non-create method requires an initialized, non-terminal project",
      appliesTo: ALL_NON_CREATE_METHODS,
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state) {
          return {
            pass: false,
            errors: ["Project not initialized — run create first"],
          };
        }
        if (TERMINAL_LIFECYCLE_STATES.includes(state.lifecycleState)) {
          return {
            pass: false,
            errors: [
              `Project is in terminal lifecycle state "${state.lifecycleState}" — no further transitions allowed`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "wild-idea-required": {
      description: "commit and shelve only apply to a wild-idea project",
      appliesTo: ["commit", "shelve"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || state.lifecycleState !== "wild-idea") {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "wild-idea", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "committed-required": {
      description: "startDevelopment only applies to a committed project",
      appliesTo: ["startDevelopment"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || state.lifecycleState !== "committed") {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "committed", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "in-development-or-useful-required": {
      description: "loseMomentum applies from in-development or being-useful",
      appliesTo: ["loseMomentum"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (
          !state ||
          !["in-development", "being-useful"].includes(state.lifecycleState)
        ) {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "in-development" or "being-useful", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "in-development-required": {
      description: "markUseful only applies to an in-development project",
      appliesTo: ["markUseful"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || state.lifecycleState !== "in-development") {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "in-development", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "lost-momentum-required": {
      description: "resumeDevelopment only applies to a lost-momentum project",
      appliesTo: ["resumeDevelopment"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || state.lifecycleState !== "lost-momentum") {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "lost-momentum", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "useful-or-lost-momentum-required": {
      description: "retire applies from being-useful or lost-momentum",
      appliesTo: ["retire"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (
          !state ||
          !["being-useful", "lost-momentum"].includes(state.lifecycleState)
        ) {
          return {
            pass: false,
            errors: [
              `Requires lifecycleState "being-useful" or "lost-momentum", current is "${
                state?.lifecycleState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
    "repository-required": {
      description: "addCompose requires a repository to already be attached",
      appliesTo: ["addCompose"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || !state.repository) {
          return {
            pass: false,
            errors: ["Project has no repository yet — run commit first"],
          };
        }
        return { pass: true };
      },
    },
    "deploy-ready-required": {
      description: "deploy requires both a repository and a compose manifest",
      appliesTo: ["deploy"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || !state.repository || !state.composePath) {
          return {
            pass: false,
            errors: [
              "Project needs both a repository (commit) and a compose manifest (addCompose) before it can be deployed",
            ],
          };
        }
        return { pass: true };
      },
    },
    "errored-required": {
      description: "recoverFromError only applies to a placed-errored project",
      appliesTo: ["recoverFromError"],
      execute: async (context) => {
        const state = await readStateForCheck(context);
        if (!state || state.deployState !== "placed-errored") {
          return {
            pass: false,
            errors: [
              `Requires deployState "placed-errored", current is "${
                state?.deployState ?? "(none)"
              }"`,
            ],
          };
        }
        return { pass: true };
      },
    },
  },
};
