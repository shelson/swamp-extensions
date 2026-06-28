/**
 * Shared schema, enums, and state-reading helper for the homelab-project model.
 *
 * @module
 */
import { z } from "npm:zod@4";

export const LifecycleStateSchema = z.enum([
  "wild-idea",
  "shelved",
  "committed",
  "in-development",
  "lost-momentum",
  "being-useful",
  "old-and-boring",
]);
export type LifecycleState = z.infer<typeof LifecycleStateSchema>;

export const DeployStateSchema = z.enum([
  "idle",
  "ready-for-placement",
  "placed-stopped",
  "placed-starting",
  "placed-running",
  "placed-errored",
]);
export type DeployState = z.infer<typeof DeployStateSchema>;

/** Lifecycle states that accept no further transitions. */
export const TERMINAL_LIFECYCLE_STATES: LifecycleState[] = [
  "shelved",
  "old-and-boring",
];

/**
 * Legal deploy-state targets reachable from each deploy state via
 * `setDeployState`. `idle` has no outgoing edges here because the only path
 * out of `idle` is `deploy()`, which also assigns `host` — `setDeployState`
 * never sets `host`, so it must not perform that transition.
 */
export const LEGAL_DEPLOY_TRANSITIONS: Record<DeployState, DeployState[]> = {
  "idle": [],
  "ready-for-placement": ["placed-stopped"],
  "placed-stopped": ["placed-starting", "idle"],
  "placed-starting": ["placed-running", "placed-errored"],
  "placed-running": ["placed-errored", "placed-stopped"],
  "placed-errored": ["placed-stopped"],
};

export const RepositorySchema = z.object({
  url: z.string(),
  branch: z.string(),
});

export const ProjectStateSchema = z.object({
  title: z.string(),
  researchNotes: z.string().nullable(),
  transitionNote: z.string().nullable(),
  lifecycleState: LifecycleStateSchema,
  lifecycleEnteredAt: z.string(),
  deployState: DeployStateSchema,
  deployStateEnteredAt: z.string(),
  deployErrorReason: z.string().nullable(),
  repository: RepositorySchema.nullable(),
  composePath: z.string().nullable(),
  host: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectState = z.infer<typeof ProjectStateSchema>;

/**
 * Read the project's current state for use inside a pre-flight check, where
 * `context.readResource` is unavailable (checks only get `dataRepository`).
 * Returns `null` if `create` has not yet been run.
 */
export async function readStateForCheck(
  context: {
    dataRepository: {
      getContent: (
        modelType: string,
        modelId: string,
        dataName: string,
      ) => Promise<Uint8Array | null>;
    };
    modelType: string;
    modelId: string;
  },
): Promise<ProjectState | null> {
  const raw = await context.dataRepository.getContent(
    context.modelType,
    context.modelId,
    "current",
  );
  if (!raw) return null;
  return JSON.parse(new TextDecoder().decode(raw)) as ProjectState;
}
