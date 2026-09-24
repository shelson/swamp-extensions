/**
 * Shared NerdGraph client and model factory for the `@shelson/newrelic` model types.
 *
 * Every New Relic model type is the same shape: authenticate with a USER API
 * key, run one GraphQL mutation/query, store the resulting entity attributes as
 * a single `state` resource instance named `current`. This module holds that
 * plumbing so each model file only declares its queries.
 *
 * @module
 */
import { z } from "npm:zod@4";

/** Global arguments shared by every New Relic model type. */
export const GlobalArgsSchema = z.object({
  /** New Relic account ID the resource lives in. */
  accountId: z.number().int(),
  /** New Relic USER API key (NRAK-…). Supply via a vault expression. */
  apiKey: z.string().meta({ sensitive: true }),
  /** NerdGraph endpoint. Use the EU endpoint for EU-region accounts. */
  endpoint: z.string().url().default("https://api.newrelic.com/graphql"),
});

/** Parsed global arguments. */
export type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/**
 * Thrown by `lookup` when no matching entity exists. `sync` distinguishes this
 * from a real failure so a deleted entity can be marked `not_found` rather than
 * failing the run.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * True when an error means the target entity no longer exists. Accepts a
 * `NotFoundError` or a NerdGraph message that reads like a 404.
 */
export function isNotFoundError(e: unknown): boolean {
  if (e instanceof NotFoundError) return true;
  const message = e instanceof Error ? e.message : String(e);
  // ponytail: string match on NerdGraph wording; widen if New Relic rephrases.
  return /not found|does not exist|no such|\b404\b/i.test(message);
}

/** True when a create hit a uniqueness constraint. */
export function isConflictError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /already exists|duplicate|must be unique|conflict/i.test(message);
}

/** Bound NerdGraph client handed to each method implementation. */
export interface NerdGraph {
  /** Account ID from global arguments. */
  accountId: number;
  /** Run a GraphQL document and return the `data` payload. */
  query<T = Record<string, unknown>>(
    document: string,
    variables?: Record<string, unknown>,
  ): Promise<T>;
}

/** Execution context supplied by swamp. */
interface Context {
  globalArgs: GlobalArgs;
  logger: { info(msg: string, ...args: unknown[]): void };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  deleteResource: (name: string) => Promise<unknown>;
}

/** Context supplied to a pre-flight check. */
interface CheckContext {
  globalArgs: GlobalArgs;
  logger: { info(msg: string, ...args: unknown[]): void };
}

/** A pre-flight check that runs before mutating methods. */
interface CheckDefinition {
  description: string;
  labels?: string[];
  appliesTo?: string[];
  execute: (
    context: CheckContext,
  ) => Promise<{ pass: boolean; errors?: string[] }>;
}

/** One method on a New Relic model type. */
export interface NrMethod {
  /** Human-readable method description. */
  description: string;
  /** Zod schema for the method's arguments. */
  // deno-lint-ignore no-explicit-any
  arguments: z.ZodType<any>;
  /** Resource spec the result is written to. Defaults to `state`. */
  resource?: string;
  /** Resource instance name for the result. Defaults to `current`. */
  // deno-lint-ignore no-explicit-any
  resourceName?: (args: any) => string;
  /**
   * Do the work. Return the attributes to store, or `null` to drop the stored
   * state (delete).
   */
  // deno-lint-ignore no-explicit-any
  run: (args: any, nr: NerdGraph) => Promise<Record<string, unknown> | null>;
}

/** HTTP statuses worth retrying. 429 is safe for mutations (not processed). */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** Max retry attempts after the first try. */
const MAX_RETRIES = 3;

/**
 * How long to wait before a retry, honouring `Retry-After` when present and
 * falling back to bounded exponential backoff.
 */
function retryDelayMs(resp: Response, attempt: number): number {
  const header = resp.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10_000);
    const when = Date.parse(header);
    if (!Number.isNaN(when)) {
      return Math.min(Math.max(when - Date.now(), 0), 10_000);
    }
  }
  return Math.min(250 * 2 ** attempt, 2_000);
}

/**
 * Create a NerdGraph client bound to the model's global arguments.
 *
 * Retries rate limits (429) and, for read-only queries, transient 5xx — never a
 * mutation on 5xx, since the server may already have applied it.
 */
export function client(g: GlobalArgs): NerdGraph {
  return {
    accountId: g.accountId,
    query: async <T>(
      document: string,
      variables: Record<string, unknown> = {},
    ): Promise<T> => {
      const isMutation = /^\s*mutation\b/.test(document);
      for (let attempt = 0;; attempt++) {
        const resp = await fetch(g.endpoint, {
          method: "POST",
          headers: { "API-Key": g.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query: document, variables }),
        });
        if (!resp.ok) {
          const retryable = RETRYABLE_STATUS.has(resp.status) &&
            (resp.status === 429 || !isMutation);
          if (retryable && attempt < MAX_RETRIES) {
            await new Promise((r) =>
              setTimeout(r, retryDelayMs(resp, attempt))
            );
            continue;
          }
          throw new Error(
            `NerdGraph HTTP ${resp.status}: ${await resp.text()}`,
          );
        }
        const body = await resp.json() as {
          data?: T;
          errors?: { message: string }[];
        };
        if (body.errors?.length) {
          throw new Error(
            `NerdGraph error: ${body.errors.map((e) => e.message).join("; ")}`,
          );
        }
        if (!body.data) throw new Error("NerdGraph returned no data");
        return body.data;
      }
    },
  };
}

/**
 * Throw if a NerdGraph mutation payload carries a non-empty `errors` array.
 * New Relic returns HTTP 200 with per-mutation errors, so this must be checked
 * explicitly or failures look like successes.
 */
export function assertNoErrors(payload: unknown, what: string): void {
  const errors = (payload as { errors?: unknown[] } | null)?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(`${what} failed: ${JSON.stringify(errors)}`);
  }
}

/**
 * Pre-flight check shared by every model type: refuse to send the USER API key
 * over a non-HTTPS endpoint. Offline-safe (no network call) so `swamp model
 * validate` passes without credentials; labelled `policy`.
 */
function credentialCheck(): CheckDefinition {
  return {
    description:
      "Ensure NerdGraph is reached over HTTPS so the API key is never sent in clear text",
    labels: ["policy"],
    execute: (context) => {
      const endpoint = context.globalArgs.endpoint ??
        "https://api.newrelic.com/graphql";
      if (!endpoint.startsWith("https://")) {
        return Promise.resolve({
          pass: false,
          errors: [`endpoint must use https:// (got "${endpoint}")`],
        });
      }
      return Promise.resolve({ pass: true });
    },
  };
}

/** Build a swamp model definition from a set of NerdGraph-backed methods. */
export function nrModel(def: {
  /** Model type name, e.g. `@shelson/newrelic-dashboard`. */
  type: string;
  /** Description of the stored resource. */
  description: string;
  /** Zod schema for the stored attributes. */
  // deno-lint-ignore no-explicit-any
  schema: z.ZodType<any>;
  /** Method implementations. */
  methods: Record<string, NrMethod>;
  /** Additional resource specs a method can write to, keyed by spec name. */
  resources?: Record<
    string,
    { description: string; schema: z.ZodType<unknown> }
  >;
  /**
   * Stored attribute holding the entity id (`id` or `guid`). When set, a
   * zero-argument `sync` method is generated that refreshes state by that id.
   */
  syncKey?: "id" | "guid";
  /** Argument name the `lookup` method expects for `syncKey` (defaults to it). */
  syncLookupArg?: string;
  /**
   * When true, a `create` that hits a uniqueness constraint returns the
   * existing entity (resolved by `nameFromArgs`) instead of throwing.
   */
  idempotentCreate?: boolean;
  /** Extracts the entity name from create arguments, for idempotent create. */
  // deno-lint-ignore no-explicit-any
  nameFromArgs?: (args: any) => string | undefined;
  // deno-lint-ignore no-explicit-any
}): any {
  const methods: Record<string, unknown> = {};
  for (const [name, m] of Object.entries(def.methods)) {
    methods[name] = {
      description: m.description,
      arguments: m.arguments,
      execute: async (args: unknown, context: Context) => {
        const spec = m.resource ?? "state";
        const instance = m.resourceName?.(args) ?? "current";
        context.logger.info("{type}.{method}: running", {
          type: def.type,
          method: name,
        });
        let attributes: Record<string, unknown> | null;
        try {
          attributes = await m.run(args, client(context.globalArgs));
        } catch (e) {
          if (name === "delete" && isNotFoundError(e)) {
            // Already gone — treat the delete as a success and clear state.
            context.logger.info("{type}.{method}: entity already gone", {
              type: def.type,
              method: name,
            });
            attributes = null;
          } else if (
            name === "create" && def.idempotentCreate && def.nameFromArgs &&
            def.methods.lookup && isConflictError(e)
          ) {
            const existing = await adoptedExisting(def, args, context);
            if (existing === undefined) throw e;
            attributes = existing;
          } else {
            throw e;
          }
        }
        if (attributes === null) {
          await context.deleteResource(instance);
          context.logger.info("{type}.{method}: state deleted", {
            type: def.type,
            method: name,
            resource: instance,
          });
          return { dataHandles: [] };
        }
        const handle = await context.writeResource(spec, instance, attributes);
        context.logger.info("{type}.{method}: state written", {
          type: def.type,
          method: name,
          resource: instance,
        });
        return { dataHandles: [handle] };
      },
    };
  }
  if (def.syncKey && def.methods.lookup) {
    methods.sync = buildSync(
      def,
      def.syncKey,
      def.syncLookupArg ?? def.syncKey,
    );
  }
  const resources: Record<string, unknown> = {
    state: {
      description: def.description,
      schema: def.schema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  };
  for (const [name, spec] of Object.entries(def.resources ?? {})) {
    resources[name] = {
      ...spec,
      lifetime: "infinite",
      garbageCollection: 10,
    };
  }
  return {
    type: def.type,
    version: "2026.09.25.1",
    upgrades: [
      {
        toVersion: "2026.09.24.1",
        description: "Version bump, no schema changes",
        upgradeAttributes: (old: Record<string, unknown>) => old,
      },
      {
        toVersion: "2026.09.24.2",
        description: "Version bump, no schema changes",
        upgradeAttributes: (old: Record<string, unknown>) => old,
      },
      {
        toVersion: "2026.09.25.1",
        description: "Version bump, no schema changes",
        upgradeAttributes: (old: Record<string, unknown>) => old,
      },
    ],
    globalArguments: GlobalArgsSchema,
    resources,
    checks: { credentials: credentialCheck() },
    methods,
  };
}

/**
 * Resolve the entity a failed `create` collided with. Returns `undefined` when
 * the name cannot be resolved, so the caller rethrows the original conflict.
 */
async function adoptedExisting(
  def: {
    // deno-lint-ignore no-explicit-any
    nameFromArgs?: (args: any) => string | undefined;
    methods: Record<string, NrMethod>;
  },
  args: unknown,
  context: Context,
): Promise<Record<string, unknown> | undefined> {
  const name = def.nameFromArgs?.(args);
  if (name === undefined) return undefined;
  try {
    const found = await def.methods.lookup.run(
      { name },
      client(context.globalArgs),
    );
    return found ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the zero-argument `sync` method: read the stored id, refresh the entity
 * from New Relic, and fall back to a `not_found` marker when it has been
 * deleted out of band.
 */
function buildSync(
  def: { type: string; methods: Record<string, NrMethod> },
  syncKey: string,
  lookupArg: string,
): Record<string, unknown> {
  const lookup = def.methods.lookup;
  return {
    description:
      "Refresh stored state from New Relic, or mark it not_found if deleted",
    arguments: z.object({}),
    execute: async (_args: unknown, context: Context) => {
      const instance = "current";
      context.logger.info("{type}.{method}: running", {
        type: def.type,
        method: "sync",
      });
      const stored = await context.readResource(instance);
      if (!stored) {
        throw new Error(
          `${def.type}: no stored state — run create or lookup first`,
        );
      }
      const id = stored[syncKey];
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(`${def.type}: stored state has no ${syncKey}`);
      }
      try {
        const fresh = await lookup.run(
          { [lookupArg]: id },
          client(context.globalArgs),
        );
        // Merge so fields a sparse lookup does not return (e.g. a private
        // location's sensitive key) survive the refresh.
        const handle = await context.writeResource("state", instance, {
          ...stored,
          ...fresh,
        });
        context.logger.info("{type}.{method}: state refreshed", {
          type: def.type,
          method: "sync",
          resource: id,
        });
        return { dataHandles: [handle] };
      } catch (e) {
        if (!isNotFoundError(e)) throw e;
        const handle = await context.writeResource("state", instance, {
          ...stored,
          status: "not_found",
          syncedAt: new Date().toISOString(),
        });
        context.logger.info("{type}.{method}: entity gone, marked not_found", {
          type: def.type,
          method: "sync",
          resource: id,
        });
        return { dataHandles: [handle] };
      }
    },
  };
}
