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

// Auto-generated extension model for @shelson/jira/component
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira component.
 *
 * Wraps the `/rest/api/3/component` API as a swamp model so create, get, update,
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
  assigneeType: z.enum([
    "PROJECT_DEFAULT",
    "COMPONENT_LEAD",
    "PROJECT_LEAD",
    "UNASSIGNED",
  ]).describe(
    "The nominal user type used to determine the assignee for issues created with this component. See `realAssigneeType` for details on how the type of the user, and hence the user, assigned to issues is determined. Can take the following values:\n\n *  `PROJECT_LEAD` the assignee to any issues created with this component is nominally the lead for the project the component is in.\n *  `COMPONENT_LEAD` the assignee to any issues created with this component is nominally the lead for the component.\n *  `UNASSIGNED` an assignee is not set for issues created with this component.\n *  `PROJECT_DEFAULT` the assignee to any issues created with this component is nominally the default assignee for the project that the component is in.\n\nDefault value: `PROJECT_DEFAULT`.  \nOptional when creating or updating a component.",
  ).optional(),
  description: z.string().describe(
    "The description for the component. Optional when creating or updating a component.",
  ).optional(),
  leadAccountId: z.string().max(128).describe(
    "The accountId of the component's lead user. The accountId uniquely identifies the user across all Atlassian products. For example, *5b10ac8d82e05b22cc7d4ef5*.",
  ).optional(),
  leadUserName: z.string().describe(
    "This property is no longer available and will be removed from the documentation soon. See the [deprecation notice](https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-user-privacy-api-migration-guide/) for details.",
  ).optional(),
  name: z.string().describe(
    "The unique name for the component in the project. Required when creating a component. Optional when updating a component. The maximum length is 255 characters.",
  ).optional(),
  project: z.string().describe(
    "The key of the project the component is assigned to. Required when creating a component. Can't be updated.",
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
  ari: z.string().optional(),
  assignee: z.object({
    accountId: z.string().optional(),
    accountType: z.string().optional(),
    active: z.boolean().optional(),
    appType: z.string().optional(),
    applicationRoles: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        defaultGroups: z.array(z.string()).optional(),
        defaultGroupsDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        defined: z.boolean().optional(),
        groupDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        groups: z.array(z.string()).optional(),
        hasUnlimitedSeats: z.boolean().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        numberOfSeats: z.number().optional(),
        platform: z.boolean().optional(),
        remainingSeats: z.number().optional(),
        selectedByDefault: z.boolean().optional(),
        userCount: z.number().optional(),
        userCountDescription: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    avatarUrls: z.object({
      "16x16": z.string().optional(),
      "24x24": z.string().optional(),
      "32x32": z.string().optional(),
      "48x48": z.string().optional(),
    }).optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    expand: z.string().optional(),
    groups: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        groupId: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    guest: z.boolean().optional(),
    key: z.string().optional(),
    locale: z.string().optional(),
    name: z.string().optional(),
    self: z.string().optional(),
    timeZone: z.string().optional(),
  }).optional(),
  assigneeType: z.string().optional(),
  description: z.string().optional(),
  id: z.string(),
  isAssigneeTypeValid: z.boolean().optional(),
  lead: z.object({
    accountId: z.string().optional(),
    accountType: z.string().optional(),
    active: z.boolean().optional(),
    appType: z.string().optional(),
    applicationRoles: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        defaultGroups: z.array(z.string()).optional(),
        defaultGroupsDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        defined: z.boolean().optional(),
        groupDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        groups: z.array(z.string()).optional(),
        hasUnlimitedSeats: z.boolean().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        numberOfSeats: z.number().optional(),
        platform: z.boolean().optional(),
        remainingSeats: z.number().optional(),
        selectedByDefault: z.boolean().optional(),
        userCount: z.number().optional(),
        userCountDescription: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    avatarUrls: z.object({
      "16x16": z.string().optional(),
      "24x24": z.string().optional(),
      "32x32": z.string().optional(),
      "48x48": z.string().optional(),
    }).optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    expand: z.string().optional(),
    groups: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        groupId: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    guest: z.boolean().optional(),
    key: z.string().optional(),
    locale: z.string().optional(),
    name: z.string().optional(),
    self: z.string().optional(),
    timeZone: z.string().optional(),
  }).optional(),
  leadAccountId: z.string().optional(),
  leadUserName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  project: z.string().optional(),
  projectId: z.number().optional(),
  realAssignee: z.object({
    accountId: z.string().optional(),
    accountType: z.string().optional(),
    active: z.boolean().optional(),
    appType: z.string().optional(),
    applicationRoles: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        defaultGroups: z.array(z.string()).optional(),
        defaultGroupsDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        defined: z.boolean().optional(),
        groupDetails: z.array(z.object({
          groupId: z.string().optional(),
          name: z.string().optional(),
          self: z.string().optional(),
        })).optional(),
        groups: z.array(z.string()).optional(),
        hasUnlimitedSeats: z.boolean().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        numberOfSeats: z.number().optional(),
        platform: z.boolean().optional(),
        remainingSeats: z.number().optional(),
        selectedByDefault: z.boolean().optional(),
        userCount: z.number().optional(),
        userCountDescription: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    avatarUrls: z.object({
      "16x16": z.string().optional(),
      "24x24": z.string().optional(),
      "32x32": z.string().optional(),
      "48x48": z.string().optional(),
    }).optional(),
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
    expand: z.string().optional(),
    groups: z.object({
      callback: z.record(z.string(), z.unknown()).optional(),
      items: z.array(z.object({
        groupId: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      })).optional(),
      "max-results": z.number().optional(),
      pagingCallback: z.record(z.string(), z.unknown()).optional(),
      size: z.number().optional(),
    }).optional(),
    guest: z.boolean().optional(),
    key: z.string().optional(),
    locale: z.string().optional(),
    name: z.string().optional(),
    self: z.string().optional(),
    timeZone: z.string().optional(),
  }).optional(),
  realAssigneeType: z.string().optional(),
  self: z.string().optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  assigneeType: z.enum([
    "PROJECT_DEFAULT",
    "COMPONENT_LEAD",
    "PROJECT_LEAD",
    "UNASSIGNED",
  ]).optional(),
  description: z.string().optional(),
  leadAccountId: z.string().max(128).optional(),
  leadUserName: z.string().optional(),
  name: z.string().optional(),
  project: z.string().optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira component. Registered at `/jira/component`. */
export const model = {
  type: "@shelson/jira/component",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Component resource state",
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
      description: "Create a component",
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
        if (g.assigneeType !== undefined) body.assigneeType = g.assigneeType;
        if (g.description !== undefined) body.description = g.description;
        if (g.leadAccountId !== undefined) body.leadAccountId = g.leadAccountId;
        if (g.leadUserName !== undefined) body.leadUserName = g.leadUserName;
        if (g.name !== undefined) body.name = g.name;
        if (g.project !== undefined) body.project = g.project;
        const result = await createOrAdopt(
          "/rest/api/3/component",
          body,
          "/rest/api/3/component",
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
      description: "Get a component",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the component",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/component", args.id, {
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
      description: "Update component attributes",
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
        if (g.assigneeType !== undefined) body.assigneeType = g.assigneeType;
        if (g.description !== undefined) body.description = g.description;
        if (g.leadAccountId !== undefined) body.leadAccountId = g.leadAccountId;
        if (g.leadUserName !== undefined) body.leadUserName = g.leadUserName;
        if (g.name !== undefined) body.name = g.name;
        if (g.project !== undefined) body.project = g.project;
        const result = await update(
          "/rest/api/3/component",
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
      description: "Delete the component",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the component",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const { existed } = await remove("/rest/api/3/component", args.id, {
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
      description: "Sync component state from Jira",
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
          "/rest/api/3/component",
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
