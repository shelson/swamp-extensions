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

// Auto-generated extension model for @shelson/jira/version
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira version.
 *
 * Wraps the `/rest/api/3/version` API as a swamp model so create, get, update,
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
  archived: z.boolean().describe(
    "Indicates that the version is archived. Optional when creating or updating a version.",
  ).optional(),
  description: z.string().describe(
    "The description of the version. Optional when creating or updating a version. The maximum size is 16,384 bytes.",
  ).optional(),
  driver: z.string().describe(
    "The Atlassian account ID of the version driver. Optional when creating or updating a version. If the expand option `driver` is used, returns the Atlassian account ID of the driver.",
  ).optional(),
  expand: z.string().describe(
    "Use [expand](em>#expansion) to include additional information about version in the response. This parameter accepts a comma-separated list. Expand options include:\n\n *  `operations` Returns the list of operations available for this version.\n *  `issuesstatus` Returns the count of issues in this version for each of the status categories *to do*, *in progress*, *done*, and *unmapped*. The *unmapped* property contains a count of issues with a status other than *to do*, *in progress*, and *done*.\n *  `driver` Returns the Atlassian account ID of the version driver.\n *  `approvers` Returns a list containing approvers for this version.\n\nOptional for create and update.",
  ).optional(),
  moveUnfixedIssuesTo: z.string().describe(
    "The URL of the self link to the version to which all unfixed issues are moved when a version is released. Not applicable when creating a version. Optional when updating a version.",
  ).optional(),
  name: z.string().describe(
    "The unique name of the version. Required when creating a version. Optional when updating a version. The maximum length is 255 characters.",
  ).optional(),
  project: z.string().describe("Deprecated. Use `projectId`.").optional(),
  projectId: z.number().int().describe(
    "The ID of the project to which this version is attached. Required when creating a version. Not applicable when updating a version.",
  ).optional(),
  releaseDate: z.string().describe(
    "The release date of the version. Expressed in ISO 8601 format (yyyy-mm-dd). Optional when creating or updating a version.",
  ).optional(),
  released: z.boolean().describe(
    "Indicates that the version is released. If the version is released a request to release again is ignored. Not applicable when creating a version. Optional when updating a version.",
  ).optional(),
  startDate: z.string().describe(
    "The start date of the version. Expressed in ISO 8601 format (yyyy-mm-dd). Optional when creating or updating a version.",
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
  approvers: z.array(z.object({
    accountId: z.string().optional(),
    declineReason: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
  })).optional(),
  archived: z.boolean().optional(),
  description: z.string().optional(),
  driver: z.string().optional(),
  expand: z.string().optional(),
  id: z.string(),
  issuesStatusForFixVersion: z.object({
    done: z.number().optional(),
    inProgress: z.number().optional(),
    toDo: z.number().optional(),
    unmapped: z.number().optional(),
  }).optional(),
  moveUnfixedIssuesTo: z.string().optional(),
  name: z.string().optional(),
  operations: z.array(z.object({
    href: z.string().optional(),
    iconClass: z.string().optional(),
    id: z.string().optional(),
    label: z.string().optional(),
    styleClass: z.string().optional(),
    title: z.string().optional(),
    weight: z.number().optional(),
  })).optional(),
  overdue: z.boolean().optional(),
  project: z.string().optional(),
  projectId: z.number().optional(),
  releaseDate: z.string().optional(),
  released: z.boolean().optional(),
  self: z.string().optional(),
  startDate: z.string().optional(),
  userReleaseDate: z.string().optional(),
  userStartDate: z.string().optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  archived: z.boolean().optional(),
  description: z.string().optional(),
  driver: z.string().optional(),
  expand: z.string().optional(),
  moveUnfixedIssuesTo: z.string().optional(),
  name: z.string().optional(),
  project: z.string().optional(),
  projectId: z.number().int().optional(),
  releaseDate: z.string().optional(),
  released: z.boolean().optional(),
  startDate: z.string().optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira version. Registered at `/jira/version`. */
export const model = {
  type: "@shelson/jira/version",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Version resource state",
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
      description: "Create a version",
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
        if (g.archived !== undefined) body.archived = g.archived;
        if (g.description !== undefined) body.description = g.description;
        if (g.driver !== undefined) body.driver = g.driver;
        if (g.expand !== undefined) body.expand = g.expand;
        if (g.moveUnfixedIssuesTo !== undefined) {
          body.moveUnfixedIssuesTo = g.moveUnfixedIssuesTo;
        }
        if (g.name !== undefined) body.name = g.name;
        if (g.project !== undefined) body.project = g.project;
        if (g.projectId !== undefined) body.projectId = g.projectId;
        if (g.releaseDate !== undefined) body.releaseDate = g.releaseDate;
        if (g.released !== undefined) body.released = g.released;
        if (g.startDate !== undefined) body.startDate = g.startDate;
        const result = await createOrAdopt(
          "/rest/api/3/version",
          body,
          `/rest/api/3/project/${body.project}/versions`,
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
      description: "Get a version",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe("The ID of the version"),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/version", args.id, {
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
      description: "Update version attributes",
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
        if (g.archived !== undefined) body.archived = g.archived;
        if (g.description !== undefined) body.description = g.description;
        if (g.driver !== undefined) body.driver = g.driver;
        if (g.expand !== undefined) body.expand = g.expand;
        if (g.moveUnfixedIssuesTo !== undefined) {
          body.moveUnfixedIssuesTo = g.moveUnfixedIssuesTo;
        }
        if (g.name !== undefined) body.name = g.name;
        if (g.project !== undefined) body.project = g.project;
        if (g.projectId !== undefined) body.projectId = g.projectId;
        if (g.releaseDate !== undefined) body.releaseDate = g.releaseDate;
        if (g.released !== undefined) body.released = g.released;
        if (g.startDate !== undefined) body.startDate = g.startDate;
        const result = await update(
          "/rest/api/3/version",
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
      description: "Delete the version",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe("The ID of the version"),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const { existed } = await remove("/rest/api/3/version", args.id, {
          site: g.site,
          email: g.email,
          token: g.token,
        });
        const instanceName = (g.name?.toString() ?? args.id.toString()).replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource("state", instanceName, {
          id: String(args.id),
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
      description: "Sync version state from Jira",
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
          "/rest/api/3/version",
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
