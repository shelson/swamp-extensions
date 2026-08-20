// Swamp, an Automation Framework
// Copyright (C) 2026 Elder Swamp Club, Inc.
//
// This file is part of Swamp.
//
// Swamp is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation, with the Swamp
// Extension and Definition Exception (found in the "COPYING-EXCEPTION"
// file).
//
// Swamp is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with Swamp.  If not, see <https://www.gnu.org/licenses/>.

// Hand-authored extension of @shelson/jira/issue. NOT generated —
// `deno task generate:jira` only owns issue.ts; this file adds a
// convenience method on top and is safe across regeneration.

/**
 * Adds `transitionByName` to `@shelson/jira/issue`: transitions an issue to
 * a target status by name in one call, resolving the transition id from the
 * issue's live available transitions instead of requiring the caller to
 * already know Jira's internal transition id.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import { checkCredentials, list, read, transitionIssue } from "./_lib/jira.ts";

const ArgsSchema = z.object({
  idOrKey: z.string().describe("The ID or key of the issue to transition"),
  statusName: z.string().describe(
    "Target status name (e.g. 'In Progress', 'Done'). Matched case-" +
      "insensitively against the issue's currently available transitions.",
  ),
});

const ResultSchema = z.object({
  idOrKey: z.string(),
  toStatus: z.string(),
  transitionId: z.string(),
  transitionedAt: z.string(),
});

interface JiraTransition {
  id?: string;
  name?: string;
  to?: { name?: string };
}

const FetchArgsSchema = z.object({
  idOrKey: z.string().describe("The ID or key of the issue to fetch"),
});

const SnapshotSchema = z.object({
  idOrKey: z.string(),
  key: z.string(),
  summary: z.string().optional(),
  description: z.unknown().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  fetchedAt: z.string(),
});

/** Extends @shelson/jira/issue with a transition-by-name convenience method. */
export const extension = {
  type: "@shelson/jira/issue",
  resources: {
    transitionResult: {
      description: "Result of a transitionByName status change",
      schema: ResultSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    snapshot: {
      description:
        "A read-only snapshot fetched via fetchByKey, keyed by issue id/key " +
        "rather than the model's `name` global argument — safe to call " +
        "against many issues from a single shared model instance.",
      schema: SnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 5,
    },
  },
  checks: [{
    "transition-credentials": {
      description:
        "Validates the Jira site, email, and API token resolve and authenticate before transitioning an issue",
      labels: ["live"],
      appliesTo: ["transitionByName"],
      execute: async (
        context: {
          globalArgs: { site?: string; email?: string; token?: string };
        },
      ) => {
        const g = context.globalArgs;
        return await checkCredentials({
          site: g.site,
          email: g.email,
          token: g.token,
        });
      },
    },
  }],
  methods: [
    {
      fetchByKey: {
        description:
          "Fetch an issue's current summary/description/status/priority by " +
          "id or key, independent of the model's `name` global argument — " +
          "so one shared model instance can read many issues without " +
          "collisions (unlike `get`, whose stored resource is keyed by `name`).",
        arguments: FetchArgsSchema,
        execute: async (
          args: z.infer<typeof FetchArgsSchema>,
          context: {
            globalArgs: { site?: string; email?: string; token?: string };
            methodName: string;
            logger: {
              info: (msg: string, props?: Record<string, unknown>) => void;
            };
            writeResource: (
              specName: string,
              name: string,
              data: Record<string, unknown>,
            ) => Promise<{ name: string }>;
          },
        ) => {
          const g = context.globalArgs;
          context.logger.info("Running {method} on {idOrKey}", {
            method: context.methodName,
            idOrKey: args.idOrKey,
          });
          const credentials = { site: g.site, email: g.email, token: g.token };
          const issue = await read(
            "/rest/api/3/issue",
            args.idOrKey,
            credentials,
          ) as {
            key?: string;
            fields?: {
              summary?: string;
              description?: unknown;
              status?: { name?: string };
              priority?: { name?: string };
            };
          };
          const instanceName = `snapshot-${args.idOrKey}`
            .replace(/[\/\\]/g, "_")
            .replace(/\.\./g, "_")
            .replace(/\0/g, "");
          const handle = await context.writeResource("snapshot", instanceName, {
            idOrKey: args.idOrKey,
            key: issue.key ?? args.idOrKey,
            summary: issue.fields?.summary,
            description: issue.fields?.description,
            status: issue.fields?.status?.name,
            priority: issue.fields?.priority?.name,
            fetchedAt: new Date().toISOString(),
          });
          context.logger.info("Completed {method} on {idOrKey}", {
            method: context.methodName,
            idOrKey: args.idOrKey,
          });
          return { dataHandles: [handle] };
        },
      },
    },
    {
      transitionByName: {
        description:
          "Transition an issue to a target status by name — looks up the " +
          "matching transition id from the issue's live available " +
          "transitions and applies it, in one call.",
        arguments: ArgsSchema,
        execute: async (
          args: z.infer<typeof ArgsSchema>,
          context: {
            globalArgs: { site?: string; email?: string; token?: string };
            methodName: string;
            logger: {
              info: (msg: string, props?: Record<string, unknown>) => void;
            };
            writeResource: (
              specName: string,
              name: string,
              data: Record<string, unknown>,
            ) => Promise<{ name: string }>;
          },
        ) => {
          const g = context.globalArgs;
          context.logger.info("Running {method} on {idOrKey}", {
            method: context.methodName,
            idOrKey: args.idOrKey,
          });
          const credentials = { site: g.site, email: g.email, token: g.token };

          const transitions = await list(
            `/rest/api/3/issue/${encodeURIComponent(args.idOrKey)}/transitions`,
            credentials,
          ) as JiraTransition[];

          const wanted = args.statusName.toLowerCase();
          const match = transitions.find(
            (t) =>
              t.name?.toLowerCase() === wanted ||
              t.to?.name?.toLowerCase() === wanted,
          );
          if (!match?.id) {
            const available = transitions
              .map((t) => t.name ?? t.to?.name)
              .filter(Boolean)
              .join(", ");
            throw new Error(
              `No transition to status "${args.statusName}" is available ` +
                `for ${args.idOrKey}. Available: ${
                  available ||
                  "(none — check the issue exists and credentials are valid)"
                }`,
            );
          }

          const after = await transitionIssue(
            args.idOrKey,
            { id: match.id },
            {},
            credentials,
          ) as { fields?: { status?: { name?: string } } };

          const instanceName = `transition-${args.idOrKey}`
            .replace(/[\/\\]/g, "_")
            .replace(/\.\./g, "_")
            .replace(/\0/g, "");
          const handle = await context.writeResource(
            "transitionResult",
            instanceName,
            {
              idOrKey: args.idOrKey,
              toStatus: after.fields?.status?.name ?? match.to?.name ??
                args.statusName,
              transitionId: match.id,
              transitionedAt: new Date().toISOString(),
            },
          );
          context.logger.info("Completed {method} on {idOrKey}", {
            method: context.methodName,
            idOrKey: args.idOrKey,
          });
          return { dataHandles: [handle] };
        },
      },
    },
  ],
};
