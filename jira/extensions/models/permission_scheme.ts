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

// Auto-generated extension model for @shelson/jira/permission-scheme
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira permission scheme.
 *
 * Wraps the `/rest/api/3/permissionscheme` API as a swamp model so create, get, update,
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
  description: z.string().describe("A description for the permission scheme.")
    .optional(),
  name: z.string().describe(
    "The name of the permission scheme. Must be unique.",
  ),
  permissions: z.array(z.object({
    holder: z.object({
      expand: z.string().optional(),
      parameter: z.string().optional(),
      type: z.string(),
      value: z.string().optional(),
    }).optional(),
    id: z.number().int().optional(),
    permission: z.string().optional(),
    self: z.string().optional(),
  })).describe(
    "The permission scheme to create or update. See [About permission schemes and grants](../api-group-permission-schemes/#about-permission-schemes-and-grants) for more information.",
  ).optional(),
  scope: z.object({
    project: z.object({
      avatarUrls: z.object({
        "16x16": z.string().optional(),
        "24x24": z.string().optional(),
        "32x32": z.string().optional(),
        "48x48": z.string().optional(),
      }).optional(),
      id: z.string().optional(),
      key: z.string().optional(),
      name: z.string().optional(),
      projectCategory: z.object({
        description: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
      projectTypeKey: z.enum(["software", "service_desk", "business"])
        .optional(),
      self: z.string().optional(),
      simplified: z.boolean().optional(),
    }).optional(),
    type: z.enum(["PROJECT", "TEMPLATE"]).optional(),
  }).describe("The scope of the permission scheme.").optional(),
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
  description: z.string().optional(),
  expand: z.string().optional(),
  id: z.number(),
  name: z.string().optional(),
  permissions: z.array(z.object({
    holder: z.object({
      expand: z.string().optional(),
      parameter: z.string().optional(),
      type: z.string().optional(),
      value: z.string().optional(),
    }).optional(),
    id: z.number().optional(),
    permission: z.string().optional(),
    self: z.string().optional(),
  })).optional(),
  scope: z.object({
    project: z.object({
      avatarUrls: z.object({
        "16x16": z.string().optional(),
        "24x24": z.string().optional(),
        "32x32": z.string().optional(),
        "48x48": z.string().optional(),
      }).optional(),
      id: z.string().optional(),
      key: z.string().optional(),
      name: z.string().optional(),
      projectCategory: z.object({
        description: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
      projectTypeKey: z.string().optional(),
      self: z.string().optional(),
      simplified: z.boolean().optional(),
    }).optional(),
    type: z.string().optional(),
  }).optional(),
  self: z.string().optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  description: z.string().optional(),
  name: z.string().optional(),
  permissions: z.array(z.object({
    holder: z.object({
      expand: z.string().optional(),
      parameter: z.string().optional(),
      type: z.string(),
      value: z.string().optional(),
    }).optional(),
    id: z.number().int().optional(),
    permission: z.string().optional(),
    self: z.string().optional(),
  })).optional(),
  scope: z.object({
    project: z.object({
      avatarUrls: z.object({
        "16x16": z.string().optional(),
        "24x24": z.string().optional(),
        "32x32": z.string().optional(),
        "48x48": z.string().optional(),
      }).optional(),
      id: z.string().optional(),
      key: z.string().optional(),
      name: z.string().optional(),
      projectCategory: z.object({
        description: z.string().optional(),
        id: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
      projectTypeKey: z.enum(["software", "service_desk", "business"])
        .optional(),
      self: z.string().optional(),
      simplified: z.boolean().optional(),
    }).optional(),
    type: z.enum(["PROJECT", "TEMPLATE"]).optional(),
  }).optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira permission scheme. Registered at `/jira/permission-scheme`. */
export const model = {
  type: "@shelson/jira/permission-scheme",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Permission Scheme resource state",
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
      description: "Create a permission scheme",
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
        if (g.description !== undefined) body.description = g.description;
        if (g.name !== undefined) body.name = g.name;
        if (g.permissions !== undefined) body.permissions = g.permissions;
        if (g.scope !== undefined) body.scope = g.scope;
        const result = await createOrAdopt(
          "/rest/api/3/permissionscheme",
          body,
          "/rest/api/3/permissionscheme",
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
      description: "Get a permission scheme",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the permission scheme",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/permissionscheme", args.id, {
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
      description: "Update permission scheme attributes",
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
        if (g.description !== undefined) body.description = g.description;
        if (g.name !== undefined) body.name = g.name;
        if (g.permissions !== undefined) body.permissions = g.permissions;
        if (g.scope !== undefined) body.scope = g.scope;
        const result = await update(
          "/rest/api/3/permissionscheme",
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
      description: "Delete the permission scheme",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the permission scheme",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const { existed } = await remove(
          "/rest/api/3/permissionscheme",
          args.id,
          { site: g.site, email: g.email, token: g.token },
        );
        const instanceName = (g.name?.toString() ?? args.id.toString()).replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource("state", instanceName, {
          id: Number(args.id),
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
      description: "Sync permission scheme state from Jira",
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
          "/rest/api/3/permissionscheme",
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
