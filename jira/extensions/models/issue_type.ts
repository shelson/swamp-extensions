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

// Auto-generated extension model for @shelson/jira/issue-type
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira issue type.
 *
 * Wraps the `/rest/api/3/issuetype` API as a swamp model so create, get, update,
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
    "The ID of an issue type avatar. This can be obtained be obtained from the following endpoints:\n\n *  [System issue type avatar IDs only](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-avatars/#api-rest-api-3-avatar-type-system-get)\n *  [System and custom issue type avatar IDs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-avatars/#api-rest-api-3-universal-avatar-type-type-owner-entityid-get)",
  ).optional(),
  description: z.string().describe("The description of the issue type.")
    .optional(),
  name: z.string().describe(
    "The unique name for the issue type. The maximum length is 60 characters.",
  ),
  hierarchyLevel: z.number().int().describe(
    "The hierarchy level of the issue type. Use:\n\n *  `-1` for Subtask.\n *  `0` for Base.\n\nDefaults to `0`.",
  ).optional(),
  type: z.enum(["subtask", "standard"]).describe(
    "Deprecated. Use `hierarchyLevel` instead. See the [deprecation notice](https://community.developer.atlassian.com/t/deprecation-of-the-epic-link-parent-link-and-other-related-fields-in-rest-apis-and-webhooks/54048) for details.\n\nWhether the issue type is `subtype` or `standard`. Defaults to `standard`.",
  ).optional(),
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
  entityId: z.string().optional(),
  hierarchyLevel: z.number().optional(),
  iconUrl: z.string().optional(),
  id: z.string(),
  name: z.string().optional(),
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
  subtask: z.boolean().optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  avatarId: z.number().int().optional(),
  description: z.string().optional(),
  name: z.string().optional(),
  hierarchyLevel: z.number().int().optional(),
  type: z.enum(["subtask", "standard"]).optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira issue type. Registered at `/jira/issue-type`. */
export const model = {
  type: "@shelson/jira/issue-type",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Issue Type resource state",
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
      description: "Create a issue type",
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
        if (g.hierarchyLevel !== undefined) {
          body.hierarchyLevel = g.hierarchyLevel;
        }
        if (g.name !== undefined) body.name = g.name;
        if (g.type !== undefined) body.type = g.type;
        const result = await createOrAdopt(
          "/rest/api/3/issuetype",
          body,
          "/rest/api/3/issuetype",
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
      description: "Get a issue type",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the issue type",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/issuetype", args.id, {
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
      description: "Update issue type attributes",
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
        if (g.name !== undefined) body.name = g.name;
        const result = await update(
          "/rest/api/3/issuetype",
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
      description: "Delete the issue type",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the issue type",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const { existed } = await remove("/rest/api/3/issuetype", args.id, {
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
      description: "Sync issue type state from Jira",
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
          "/rest/api/3/issuetype",
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
