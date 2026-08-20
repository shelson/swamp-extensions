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

// Auto-generated extension model for /jira/plan
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira plan.
 *
 * Wraps the `/rest/api/3/plans/plan` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import { create, read, tryRead, update } from "./_lib/jira.ts";

const GlobalArgsSchema = z.object({
  crossProjectReleases: z.array(z.object({
    name: z.string(),
    releaseIds: z.array(z.number().int()).optional(),
  })).describe("The cross-project releases to include in the plan.").optional(),
  customFields: z.array(z.object({
    customFieldId: z.number().int(),
    filter: z.boolean().optional(),
  })).describe("The custom fields for the plan.").optional(),
  exclusionRules: z.object({
    issueIds: z.array(z.number().int()).optional(),
    issueTypeIds: z.array(z.number().int()).optional(),
    numberOfDaysToShowCompletedIssues: z.number().int().optional(),
    releaseIds: z.array(z.number().int()).optional(),
    workStatusCategoryIds: z.array(z.number().int()).optional(),
    workStatusIds: z.array(z.number().int()).optional(),
  }).describe("The exclusion rules for the plan.").optional(),
  issueSources: z.array(z.object({
    type: z.enum(["Board", "Project", "Filter"]),
    value: z.number().int(),
  })).describe("The issue sources to include in the plan."),
  leadAccountId: z.string().describe("The account ID of the plan lead.")
    .optional(),
  name: z.string().min(1).max(255).describe("The plan name."),
  permissions: z.array(z.object({
    holder: z.object({
      type: z.enum(["Group", "AccountId"]),
      value: z.string(),
    }),
    type: z.enum(["View", "Edit"]),
  })).describe("The permissions for the plan.").optional(),
  scheduling: z.object({
    dependencies: z.enum(["Sequential", "Concurrent"]).optional(),
    endDate: z.object({
      dateCustomFieldId: z.number().int().optional(),
      type: z.enum([
        "DueDate",
        "TargetStartDate",
        "TargetEndDate",
        "DateCustomField",
      ]),
    }).optional(),
    estimation: z.enum(["StoryPoints", "Days", "Hours"]),
    inferredDates: z.enum(["None", "SprintDates", "ReleaseDates"]).optional(),
    startDate: z.object({
      dateCustomFieldId: z.number().int().optional(),
      type: z.enum([
        "DueDate",
        "TargetStartDate",
        "TargetEndDate",
        "DateCustomField",
      ]),
    }).optional(),
  }).describe("The scheduling settings for the plan."),
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
  crossProjectReleases: z.array(z.object({
    name: z.string().optional(),
    releaseIds: z.array(z.number()).optional(),
  })).optional(),
  customFields: z.array(z.object({
    customFieldId: z.number().optional(),
    filter: z.boolean().optional(),
  })).optional(),
  exclusionRules: z.object({
    issueIds: z.array(z.number()).optional(),
    issueTypeIds: z.array(z.number()).optional(),
    numberOfDaysToShowCompletedIssues: z.number().optional(),
    releaseIds: z.array(z.number()).optional(),
    workStatusCategoryIds: z.array(z.number()).optional(),
    workStatusIds: z.array(z.number()).optional(),
  }).optional(),
  id: z.number(),
  issueSources: z.array(z.object({
    type: z.string().optional(),
    value: z.number().optional(),
  })).optional(),
  lastSaved: z.string().optional(),
  leadAccountId: z.string().optional(),
  name: z.string().optional(),
  permissions: z.array(z.object({
    holder: z.object({
      type: z.string().optional(),
      value: z.string().optional(),
    }).optional(),
    type: z.string().optional(),
  })).optional(),
  scheduling: z.object({
    dependencies: z.string().optional(),
    endDate: z.object({
      dateCustomFieldId: z.number().optional(),
      type: z.string().optional(),
    }).optional(),
    estimation: z.string().optional(),
    inferredDates: z.string().optional(),
    startDate: z.object({
      dateCustomFieldId: z.number().optional(),
      type: z.string().optional(),
    }).optional(),
  }).optional(),
  status: z.string().optional(),
}).passthrough();

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  crossProjectReleases: z.array(z.object({
    name: z.string(),
    releaseIds: z.array(z.number().int()).optional(),
  })).optional(),
  customFields: z.array(z.object({
    customFieldId: z.number().int(),
    filter: z.boolean().optional(),
  })).optional(),
  exclusionRules: z.object({
    issueIds: z.array(z.number().int()).optional(),
    issueTypeIds: z.array(z.number().int()).optional(),
    numberOfDaysToShowCompletedIssues: z.number().int().optional(),
    releaseIds: z.array(z.number().int()).optional(),
    workStatusCategoryIds: z.array(z.number().int()).optional(),
    workStatusIds: z.array(z.number().int()).optional(),
  }).optional(),
  issueSources: z.array(z.object({
    type: z.enum(["Board", "Project", "Filter"]),
    value: z.number().int(),
  })).optional(),
  leadAccountId: z.string().optional(),
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.object({
    holder: z.object({
      type: z.enum(["Group", "AccountId"]),
      value: z.string(),
    }),
    type: z.enum(["View", "Edit"]),
  })).optional(),
  scheduling: z.object({
    dependencies: z.enum(["Sequential", "Concurrent"]).optional(),
    endDate: z.object({
      dateCustomFieldId: z.number().int().optional(),
      type: z.enum([
        "DueDate",
        "TargetStartDate",
        "TargetEndDate",
        "DateCustomField",
      ]),
    }).optional(),
    estimation: z.enum(["StoryPoints", "Days", "Hours"]),
    inferredDates: z.enum(["None", "SprintDates", "ReleaseDates"]).optional(),
    startDate: z.object({
      dateCustomFieldId: z.number().int().optional(),
      type: z.enum([
        "DueDate",
        "TargetStartDate",
        "TargetEndDate",
        "DateCustomField",
      ]),
    }).optional(),
  }).optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira plan. Registered at `/jira/plan`. */
export const model = {
  type: "/jira/plan",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Plan resource state",
      schema: ResourceSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    create: {
      description: "Create a plan",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const body: Record<string, unknown> = {};
        if (g.crossProjectReleases !== undefined) {
          body.crossProjectReleases = g.crossProjectReleases;
        }
        if (g.customFields !== undefined) body.customFields = g.customFields;
        if (g.exclusionRules !== undefined) {
          body.exclusionRules = g.exclusionRules;
        }
        if (g.issueSources !== undefined) body.issueSources = g.issueSources;
        if (g.leadAccountId !== undefined) body.leadAccountId = g.leadAccountId;
        if (g.name !== undefined) body.name = g.name;
        if (g.permissions !== undefined) body.permissions = g.permissions;
        if (g.scheduling !== undefined) body.scheduling = g.scheduling;
        const result = await create("/rest/api/3/plans/plan", body, {
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
      description: "Get a plan",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe("The ID of the plan"),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        const result = await read("/rest/api/3/plans/plan", args.id, {
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
      description: "Update plan attributes",
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
        const result = await update(
          "/rest/api/3/plans/plan",
          existing.planId ?? existing.id,
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
    sync: {
      description: "Sync plan state from Jira",
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
          "/rest/api/3/plans/plan",
          existing.planId ?? existing.id,
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
          planId: existing.planId ?? existing.id,
          status: "not_found",
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
