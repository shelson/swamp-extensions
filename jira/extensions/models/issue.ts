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

// Auto-generated extension model for @shelson/jira/issue
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira issue.
 *
 * Wraps the `/rest/api/3/issue` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import { create, read, remove, tryRead, update } from "./_lib/jira.ts";

const GlobalArgsSchema = z.object({
  name: z.string().describe(
    "Instance name for this resource (used as the unique identifier in the factory pattern)",
  ),
  fields: z.record(z.string(), z.unknown()).describe(
    "List of issue screen fields to update, specifying the sub-field to update and its value for each field. This field provides a straightforward option when setting a sub-field. When multiple sub-fields or other operations are required, use `update`. Fields included in here cannot be included in `update`.",
  ).optional(),
  historyMetadata: z.object({
    activityDescription: z.string().optional(),
    activityDescriptionKey: z.string().optional(),
    actor: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    cause: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    description: z.string().optional(),
    descriptionKey: z.string().optional(),
    emailDescription: z.string().optional(),
    emailDescriptionKey: z.string().optional(),
    extraData: z.record(z.string(), z.unknown()).optional(),
    generator: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    type: z.string().optional(),
  }).describe("Additional issue history details.").optional(),
  properties: z.array(z.object({
    key: z.string().optional(),
    value: z.string().optional(),
  })).describe("Details of issue properties to be add or update.").optional(),
  transition: z.object({
    expand: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    hasScreen: z.boolean().optional(),
    id: z.string().optional(),
    isAvailable: z.boolean().optional(),
    isConditional: z.boolean().optional(),
    isGlobal: z.boolean().optional(),
    isInitial: z.boolean().optional(),
    looped: z.boolean().optional(),
    name: z.string().optional(),
    to: z.object({
      description: z.string().optional(),
      iconUrl: z.string().optional(),
      id: z.string().optional(),
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
          projectTypeKey: z.enum(["software", "service_desk", "business"])
            .optional(),
          self: z.string().optional(),
          simplified: z.boolean().optional(),
        }).optional(),
        type: z.enum(["PROJECT", "TEMPLATE"]).optional(),
      }).optional(),
      self: z.string().optional(),
      statusCategory: z.object({
        colorName: z.string().optional(),
        id: z.number().int().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
    }).optional(),
  }).describe(
    "Details of a transition. Required when performing a transition, optional when creating or editing an issue.",
  ).optional(),
  update: z.record(z.string(), z.unknown()).describe(
    "A Map containing the field field name and a list of operations to perform on the issue screen field. Note that fields included in here cannot be included in `fields`.",
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
  changelog: z.object({
    histories: z.array(z.object({
      author: z.object({
        accountId: z.string().optional(),
        accountType: z.string().optional(),
        active: z.boolean().optional(),
        avatarUrls: z.object({
          "16x16": z.string().optional(),
          "24x24": z.string().optional(),
          "32x32": z.string().optional(),
          "48x48": z.string().optional(),
        }).optional(),
        displayName: z.string().optional(),
        emailAddress: z.string().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
        timeZone: z.string().optional(),
      }).optional(),
      created: z.string().optional(),
      historyMetadata: z.object({
        activityDescription: z.string().optional(),
        activityDescriptionKey: z.string().optional(),
        actor: z.object({
          avatarUrl: z.string().optional(),
          displayName: z.string().optional(),
          displayNameKey: z.string().optional(),
          id: z.string().optional(),
          type: z.string().optional(),
          url: z.string().optional(),
        }).optional(),
        cause: z.object({
          avatarUrl: z.string().optional(),
          displayName: z.string().optional(),
          displayNameKey: z.string().optional(),
          id: z.string().optional(),
          type: z.string().optional(),
          url: z.string().optional(),
        }).optional(),
        description: z.string().optional(),
        descriptionKey: z.string().optional(),
        emailDescription: z.string().optional(),
        emailDescriptionKey: z.string().optional(),
        extraData: z.record(z.string(), z.unknown()).optional(),
        generator: z.object({
          avatarUrl: z.string().optional(),
          displayName: z.string().optional(),
          displayNameKey: z.string().optional(),
          id: z.string().optional(),
          type: z.string().optional(),
          url: z.string().optional(),
        }).optional(),
        type: z.string().optional(),
      }).optional(),
      id: z.string().optional(),
      items: z.array(z.object({
        field: z.string().optional(),
        fieldId: z.string().optional(),
        fieldtype: z.string().optional(),
        from: z.string().optional(),
        fromString: z.string().optional(),
        to: z.string().optional(),
        toString: z.string().optional(),
      })).optional(),
    })).optional(),
    maxResults: z.number().optional(),
    startAt: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
  editmeta: z.object({
    fields: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  expand: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  fieldsToInclude: z.object({
    actuallyIncluded: z.array(z.string()).optional(),
    excluded: z.array(z.string()).optional(),
    included: z.array(z.string()).optional(),
  }).optional(),
  id: z.string(),
  key: z.string(),
  names: z.record(z.string(), z.unknown()).optional(),
  operations: z.object({
    linkGroups: z.array(z.object({
      groups: z.array(z.record(z.string(), z.unknown())).optional(),
      header: z.object({
        href: z.string().optional(),
        iconClass: z.string().optional(),
        id: z.string().optional(),
        label: z.string().optional(),
        styleClass: z.string().optional(),
        title: z.string().optional(),
        weight: z.number().optional(),
      }).optional(),
      id: z.string().optional(),
      links: z.array(z.object({
        href: z.string().optional(),
        iconClass: z.string().optional(),
        id: z.string().optional(),
        label: z.string().optional(),
        styleClass: z.string().optional(),
        title: z.string().optional(),
        weight: z.number().optional(),
      })).optional(),
      styleClass: z.string().optional(),
      weight: z.number().optional(),
    })).optional(),
  }).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  renderedFields: z.record(z.string(), z.unknown()).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  self: z.string().optional(),
  transitions: z.array(z.object({
    expand: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    hasScreen: z.boolean().optional(),
    id: z.string().optional(),
    isAvailable: z.boolean().optional(),
    isConditional: z.boolean().optional(),
    isGlobal: z.boolean().optional(),
    isInitial: z.boolean().optional(),
    looped: z.boolean().optional(),
    name: z.string().optional(),
    to: z.object({
      description: z.string().optional(),
      iconUrl: z.string().optional(),
      id: z.string().optional(),
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
      statusCategory: z.object({
        colorName: z.string().optional(),
        id: z.number().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
    }).optional(),
  })).optional(),
  versionedRepresentations: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  name: z.string().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
  historyMetadata: z.object({
    activityDescription: z.string().optional(),
    activityDescriptionKey: z.string().optional(),
    actor: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    cause: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    description: z.string().optional(),
    descriptionKey: z.string().optional(),
    emailDescription: z.string().optional(),
    emailDescriptionKey: z.string().optional(),
    extraData: z.record(z.string(), z.unknown()).optional(),
    generator: z.object({
      avatarUrl: z.string().optional(),
      displayName: z.string().optional(),
      displayNameKey: z.string().optional(),
      id: z.string().optional(),
      type: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
    type: z.string().optional(),
  }).optional(),
  properties: z.array(z.object({
    key: z.string().optional(),
    value: z.string().optional(),
  })).optional(),
  transition: z.object({
    expand: z.string().optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    hasScreen: z.boolean().optional(),
    id: z.string().optional(),
    isAvailable: z.boolean().optional(),
    isConditional: z.boolean().optional(),
    isGlobal: z.boolean().optional(),
    isInitial: z.boolean().optional(),
    looped: z.boolean().optional(),
    name: z.string().optional(),
    to: z.object({
      description: z.string().optional(),
      iconUrl: z.string().optional(),
      id: z.string().optional(),
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
          projectTypeKey: z.enum(["software", "service_desk", "business"])
            .optional(),
          self: z.string().optional(),
          simplified: z.boolean().optional(),
        }).optional(),
        type: z.enum(["PROJECT", "TEMPLATE"]).optional(),
      }).optional(),
      self: z.string().optional(),
      statusCategory: z.object({
        colorName: z.string().optional(),
        id: z.number().int().optional(),
        key: z.string().optional(),
        name: z.string().optional(),
        self: z.string().optional(),
      }).optional(),
    }).optional(),
  }).optional(),
  update: z.record(z.string(), z.unknown()).optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira issue. Registered at `/jira/issue`. */
export const model = {
  type: "/jira/issue",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Issue resource state",
      schema: ResourceSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    create: {
      description: "Create a issue",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const body: Record<string, unknown> = {};
        if (g.fields !== undefined) body.fields = g.fields;
        if (g.historyMetadata !== undefined) {
          body.historyMetadata = g.historyMetadata;
        }
        if (g.properties !== undefined) body.properties = g.properties;
        if (g.transition !== undefined) body.transition = g.transition;
        if (g.update !== undefined) body.update = g.update;
        const result = await create("/rest/api/3/issue", body, {
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
      description: "Get a issue",
      arguments: z.object({
        idOrKey: z.string().describe("The ID or key of the issue"),
      }),
      execute: async (args: { idOrKey: string }, context: any) => {
        const g = context.globalArgs;
        const result = await read("/rest/api/3/issue", args.idOrKey, {
          site: g.site,
          email: g.email,
          token: g.token,
        }) as ResourceData;
        const instanceName = (g.name?.toString() ?? args.idOrKey.toString())
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
      description: "Update issue attributes",
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
        if (g.fields !== undefined) body.fields = g.fields;
        if (g.historyMetadata !== undefined) {
          body.historyMetadata = g.historyMetadata;
        }
        if (g.properties !== undefined) body.properties = g.properties;
        if (g.transition !== undefined) body.transition = g.transition;
        if (g.update !== undefined) body.update = g.update;
        const result = await update(
          "/rest/api/3/issue",
          existing.key ?? existing.id,
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
      description: "Delete the issue",
      arguments: z.object({
        idOrKey: z.string().describe("The ID or key of the issue"),
      }),
      execute: async (args: { idOrKey: string }, context: any) => {
        const g = context.globalArgs;
        const { existed } = await remove("/rest/api/3/issue", args.idOrKey, {
          site: g.site,
          email: g.email,
          token: g.token,
        });
        const instanceName = (g.name?.toString() ?? args.idOrKey.toString())
          .replace(/[\/\\]/g, "_").replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource("state", instanceName, {
          idOrKey: args.idOrKey,
          existed,
          status: existed ? "deleted" : "not_found",
          deletedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
    sync: {
      description: "Sync issue state from Jira",
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
          "/rest/api/3/issue",
          existing.key ?? existing.id,
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
          key: existing.key ?? existing.id,
          status: "not_found",
          syncedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
