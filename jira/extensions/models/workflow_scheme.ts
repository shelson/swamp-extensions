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

// Auto-generated extension model for @shelson/jira/workflow-scheme
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira workflow scheme.
 *
 * Wraps the `/rest/api/3/workflowscheme` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import { create, read, remove, tryRead, update } from "./_lib/jira.ts";

const GlobalArgsSchema = z.object({
  defaultWorkflow: z.string().describe(
    "The name of the default workflow for the workflow scheme. The default workflow has *All Unassigned Issue Types* assigned to it in Jira. If `defaultWorkflow` is not specified when creating a workflow scheme, it is set to *Jira Workflow (jira)*.",
  ).optional(),
  description: z.string().describe("The description of the workflow scheme.")
    .optional(),
  issueTypeMappings: z.record(z.string(), z.unknown()).describe(
    "The issue type to workflow mappings, where each mapping is an issue type ID and workflow name pair. Note that an issue type can only be mapped to one workflow in a workflow scheme.",
  ).optional(),
  name: z.string().describe(
    "The name of the workflow scheme. The name must be unique. The maximum length is 255 characters. Required when creating a workflow scheme.",
  ).optional(),
  updateDraftIfNeeded: z.boolean().describe(
    "Whether to create or update a draft workflow scheme when updating an active workflow scheme. An active workflow scheme is a workflow scheme that is used by at least one project. The following examples show how this property works:\n\n *  Update an active workflow scheme with `updateDraftIfNeeded` set to `true`: If a draft workflow scheme exists, it is updated. Otherwise, a draft workflow scheme is created.\n *  Update an active workflow scheme with `updateDraftIfNeeded` set to `false`: An error is returned, as active workflow schemes cannot be updated.\n *  Update an inactive workflow scheme with `updateDraftIfNeeded` set to `true`: The workflow scheme is updated, as inactive workflow schemes do not require drafts to update.\n\nDefaults to `false`.",
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
  defaultWorkflow: z.string().optional(),
  description: z.string().optional(),
  draft: z.boolean().optional(),
  id: z.number(),
  issueTypeMappings: z.record(z.string(), z.unknown()).optional(),
  issueTypes: z.record(z.string(), z.unknown()).optional(),
  lastModified: z.string().optional(),
  lastModifiedUser: z.object({
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
  name: z.string().optional(),
  originalDefaultWorkflow: z.string().optional(),
  originalIssueTypeMappings: z.record(z.string(), z.unknown()).optional(),
  self: z.string().optional(),
  updateDraftIfNeeded: z.boolean().optional(),
}).passthrough();

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  defaultWorkflow: z.string().optional(),
  description: z.string().optional(),
  issueTypeMappings: z.record(z.string(), z.unknown()).optional(),
  name: z.string().optional(),
  updateDraftIfNeeded: z.boolean().optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira workflow scheme. Registered at `/jira/workflow-scheme`. */
export const model = {
  type: "/jira/workflow-scheme",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Workflow Scheme resource state",
      schema: ResourceSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    create: {
      description: "Create a workflow scheme",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const body: Record<string, unknown> = {};
        if (g.defaultWorkflow !== undefined) {
          body.defaultWorkflow = g.defaultWorkflow;
        }
        if (g.description !== undefined) body.description = g.description;
        if (g.issueTypeMappings !== undefined) {
          body.issueTypeMappings = g.issueTypeMappings;
        }
        if (g.name !== undefined) body.name = g.name;
        if (g.updateDraftIfNeeded !== undefined) {
          body.updateDraftIfNeeded = g.updateDraftIfNeeded;
        }
        const result = await create("/rest/api/3/workflowscheme", body, {
          site: g.site,
          email: g.email,
          token: g.token,
        }) as ResourceData;
        const handle = await context.writeResource(
          "state",
          instanceName,
          result,
        );
        return { dataHandles: [handle] };
      },
    },
    get: {
      description: "Get a workflow scheme",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the workflow scheme",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        const result = await read("/rest/api/3/workflowscheme", args.id, {
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
        return { dataHandles: [handle] };
      },
    },
    update: {
      description: "Update workflow scheme attributes",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const content = await context.dataRepository.getContent(
          context.modelType,
          context.modelId,
          instanceName,
        );
        if (!content) throw new Error("No data found - run create first");
        const existing = JSON.parse(new TextDecoder().decode(content));
        const body: Record<string, unknown> = {};
        if (g.defaultWorkflow !== undefined) {
          body.defaultWorkflow = g.defaultWorkflow;
        }
        if (g.description !== undefined) body.description = g.description;
        if (g.issueTypeMappings !== undefined) {
          body.issueTypeMappings = g.issueTypeMappings;
        }
        if (g.name !== undefined) body.name = g.name;
        if (g.updateDraftIfNeeded !== undefined) {
          body.updateDraftIfNeeded = g.updateDraftIfNeeded;
        }
        const result = await update(
          "/rest/api/3/workflowscheme",
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
        return { dataHandles: [handle] };
      },
    },
    delete: {
      description: "Delete the workflow scheme",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the workflow scheme",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        const { existed } = await remove(
          "/rest/api/3/workflowscheme",
          args.id,
          { site: g.site, email: g.email, token: g.token },
        );
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
        return { dataHandles: [handle] };
      },
    },
    sync: {
      description: "Sync workflow scheme state from Jira",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const content = await context.dataRepository.getContent(
          context.modelType,
          context.modelId,
          instanceName,
        );
        if (!content) {
          throw new Error("No data found - run create or get first");
        }
        const existing = JSON.parse(new TextDecoder().decode(content));
        const result = await tryRead(
          "/rest/api/3/workflowscheme",
          existing.id ?? existing.id,
          { site: g.site, email: g.email, token: g.token },
        ) as ResourceData | null;
        if (result) {
          const handle = await context.writeResource(
            "state",
            instanceName,
            result,
          );
          return { dataHandles: [handle] };
        }
        const handle = await context.writeResource("state", instanceName, {
          id: existing.id ?? existing.id,
          status: "not_found",
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
