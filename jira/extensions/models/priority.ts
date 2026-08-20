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

// Auto-generated extension model for @shelson/jira/priority
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira priority.
 *
 * Wraps the `/rest/api/3/priority` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import {
  checkCredentials,
  createOrAdopt,
  read,
  remove,
  tryRead,
  update,
} from "./_lib/jira.ts";

const GlobalArgsSchema = z.object({
  avatarId: z.number().int().describe(
    "The ID for the avatar for the priority. Either the iconUrl or avatarId must be defined, but not both. This parameter is nullable and will become mandatory once the iconUrl parameter is deprecated.",
  ).optional(),
  description: z.string().max(255).describe("The description of the priority.")
    .optional(),
  iconUrl: z.enum([
    "/images/icons/priorities/blocker.png",
    "/images/icons/priorities/critical.png",
    "/images/icons/priorities/high.png",
    "/images/icons/priorities/highest.png",
    "/images/icons/priorities/low.png",
    "/images/icons/priorities/lowest.png",
    "/images/icons/priorities/major.png",
    "/images/icons/priorities/medium.png",
    "/images/icons/priorities/minor.png",
    "/images/icons/priorities/trivial.png",
    "/images/icons/priorities/blocker_new.png",
    "/images/icons/priorities/critical_new.png",
    "/images/icons/priorities/high_new.png",
    "/images/icons/priorities/highest_new.png",
    "/images/icons/priorities/low_new.png",
    "/images/icons/priorities/lowest_new.png",
    "/images/icons/priorities/major_new.png",
    "/images/icons/priorities/medium_new.png",
    "/images/icons/priorities/minor_new.png",
    "/images/icons/priorities/trivial_new.png",
  ]).describe(
    "The URL of an icon for the priority. Accepted protocols are HTTP and HTTPS. Built in icons can also be used. Either the iconUrl or avatarId must be defined, but not both.",
  ).optional(),
  name: z.string().max(60).describe(
    "The name of the priority. Must be unique.",
  ),
  statusColor: z.string().describe(
    "The status color of the priority in 3-digit or 6-digit hexadecimal format.",
  ),
  site: z.string().describe(
    "Jira Cloud site hostname (e.g. acme.atlassian.net); overrides the JIRA_SITE environment variable",
  ).optional(),
  email: z.string().describe(
    "Atlassian account email for API authentication; overrides the JIRA_EMAIL environment variable",
  ).optional(),
  token: z.string().meta({ sensitive: true }).describe(
    "Jira API token; overrides the JIRA_API_TOKEN environment variable. Wire with a vault.get(...) expression to source it from a vault.",
  ).optional(),
});

const ResourceSchema = z.object({
  avatarId: z.number().optional(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  id: z.string(),
  isDefault: z.boolean().optional(),
  name: z.string().optional(),
  schemes: z.object({
    maxResults: z.number().optional(),
    startAt: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
  self: z.string().optional(),
  statusColor: z.string().optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  avatarId: z.number().int().optional(),
  description: z.string().max(255).optional(),
  iconUrl: z.enum([
    "/images/icons/priorities/blocker.png",
    "/images/icons/priorities/critical.png",
    "/images/icons/priorities/high.png",
    "/images/icons/priorities/highest.png",
    "/images/icons/priorities/low.png",
    "/images/icons/priorities/lowest.png",
    "/images/icons/priorities/major.png",
    "/images/icons/priorities/medium.png",
    "/images/icons/priorities/minor.png",
    "/images/icons/priorities/trivial.png",
    "/images/icons/priorities/blocker_new.png",
    "/images/icons/priorities/critical_new.png",
    "/images/icons/priorities/high_new.png",
    "/images/icons/priorities/highest_new.png",
    "/images/icons/priorities/low_new.png",
    "/images/icons/priorities/lowest_new.png",
    "/images/icons/priorities/major_new.png",
    "/images/icons/priorities/medium_new.png",
    "/images/icons/priorities/minor_new.png",
    "/images/icons/priorities/trivial_new.png",
  ]).optional(),
  name: z.string().max(60).optional(),
  statusColor: z.string().optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira priority. Registered at `/jira/priority`. */
export const model = {
  type: "@shelson/jira/priority",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Priority resource state",
      schema: ResourceSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  checks: {
    credentials: {
      description:
        "Validates the Jira site, email, and API token resolve and authenticate",
      labels: ["live"],
      execute: async (context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return await checkCredentials({
          site: g.site,
          email: g.email,
          token: g.token,
        });
      },
    },
  },
  methods: {
    create: {
      description: "Create a priority",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const body: Record<string, unknown> = {};
        if (g.avatarId !== undefined) body.avatarId = g.avatarId;
        if (g.description !== undefined) body.description = g.description;
        if (g.iconUrl !== undefined) body.iconUrl = g.iconUrl;
        if (g.name !== undefined) body.name = g.name;
        if (g.statusColor !== undefined) body.statusColor = g.statusColor;
        const result = await createOrAdopt(
          "/rest/api/3/priority",
          body,
          "/rest/api/3/priority",
          {
            site: g.site,
            email: g.email,
            token: g.token,
          },
        ) as ResourceData;
        const handle = await context.writeResource(
          "state",
          instanceName,
          result,
        );
        context.logger.info("Completed {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return { dataHandles: [handle] };
      },
    },
    get: {
      description: "Get a priority",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the priority",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/priority", args.id, {
          site: g.site,
          email: g.email,
          token: g.token,
        }) as ResourceData;
        const instanceName = (result.name?.toString() ?? args.id.toString())
          .replace(/[\/\\]/g, "_").replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource(
          "state",
          instanceName,
          result,
        );
        context.logger.info("Completed {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return { dataHandles: [handle] };
      },
    },
    update: {
      description: "Update priority attributes",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const existing = await context.readResource(instanceName);
        if (!existing) throw new Error("No data found - run create first");
        const body: Record<string, unknown> = {};
        if (g.avatarId !== undefined) body.avatarId = g.avatarId;
        if (g.description !== undefined) body.description = g.description;
        if (g.iconUrl !== undefined) body.iconUrl = g.iconUrl;
        if (g.name !== undefined) body.name = g.name;
        if (g.statusColor !== undefined) body.statusColor = g.statusColor;
        const result = await update(
          "/rest/api/3/priority",
          existing.id ?? existing.id,
          body,
          "PUT",
          { site: g.site, email: g.email, token: g.token },
        ) as ResourceData;
        const handle = await context.writeResource(
          "state",
          instanceName,
          result,
        );
        context.logger.info("Completed {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return { dataHandles: [handle] };
      },
    },
    delete: {
      description: "Delete the priority",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the priority",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const { existed } = await remove("/rest/api/3/priority", args.id, {
          site: g.site,
          email: g.email,
          token: g.token,
        });
        const instanceName = (g.name?.toString() ?? args.id.toString()).replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource("state", instanceName, {
          id: args.id,
          existed,
          status: existed ? "deleted" : "not_found",
          deletedAt: new Date().toISOString(),
        });
        context.logger.info("Completed {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return { dataHandles: [handle] };
      },
    },
    sync: {
      description: "Sync priority state from Jira",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const existing = await context.readResource(instanceName);
        if (!existing) {
          throw new Error("No data found - run create or get first");
        }
        const result = await tryRead(
          "/rest/api/3/priority",
          existing.id ?? existing.id,
          { site: g.site, email: g.email, token: g.token },
        ) as ResourceData | null;
        if (result) {
          const handle = await context.writeResource(
            "state",
            instanceName,
            result,
          );
          context.logger.info("Completed {method} on {type}", {
            method: context.methodName,
            type: context.modelType,
          });
          return { dataHandles: [handle] };
        }
        const handle = await context.writeResource("state", instanceName, {
          id: existing.id ?? existing.id,
          status: "not_found",
          syncedAt: new Date().toISOString(),
        });
        context.logger.info("Completed {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
