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

// Auto-generated extension model for @shelson/jira/issue-link
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira issue link.
 *
 * Wraps the `/rest/api/3/issueLink` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import {
  checkCredentials,
  create,
  read,
  remove,
  tryRead,
} from "./_lib/jira.ts";

/** Extracts the issue key (or id) from an issue reference object. */
function issueKeyOf(ref: unknown): string | undefined {
  if (!ref || typeof ref !== "object") return undefined;
  const o = ref as Record<string, unknown>;
  return (o.key ?? o.id)?.toString();
}

/** Finds the link between two issues (optionally of a given type). */
async function findLinkBetween(
  issueA: string,
  issueB: string,
  typeName: string | undefined,
  credentials: { site?: string; email?: string; token?: string },
): Promise<string | undefined> {
  const issue = await tryRead("/rest/api/3/issue", issueA, credentials);
  const links = (issue?.fields as Record<string, unknown> | undefined)
    ?.issuelinks;
  if (!Array.isArray(links)) return undefined;
  for (const link of links as Array<Record<string, unknown>>) {
    const inward = issueKeyOf(link.inwardIssue);
    const outward = issueKeyOf(link.outwardIssue);
    const type = (link.type as Record<string, unknown> | undefined)?.name
      ?.toString();
    const touches = inward === issueB || outward === issueB;
    const typeMatches = typeName === undefined || type === typeName;
    if (touches && typeMatches && link.id !== undefined && link.id !== null) {
      return link.id.toString();
    }
  }
  return undefined;
}

const GlobalArgsSchema = z.object({
  name: z.string().describe(
    "Instance name for this resource (used as the unique identifier in the factory pattern)",
  ),
  comment: z.object({
    author: z.object({
      accountId: z.string().max(128).optional(),
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
    body: z.string().optional(),
    created: z.string().optional(),
    id: z.string().optional(),
    jsdAuthorCanSeeRequest: z.boolean().optional(),
    jsdPublic: z.boolean().optional(),
    properties: z.array(z.object({
      key: z.string().optional(),
      value: z.string().optional(),
    })).optional(),
    renderedBody: z.string().optional(),
    self: z.string().optional(),
    updateAuthor: z.object({
      accountId: z.string().max(128).optional(),
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
    updated: z.string().optional(),
    visibility: z.object({
      identifier: z.string().optional(),
      type: z.enum(["group", "role"]).optional(),
      value: z.string().optional(),
    }).optional(),
  }).describe("A comment.").optional(),
  inwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
        accountId: z.string().max(128).optional(),
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
      issueType: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().int().optional(),
          startAt: z.number().int().optional(),
          total: z.number().int().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().int().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().int().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().int().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).describe("The ID or key of a linked issue."),
  outwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
        accountId: z.string().max(128).optional(),
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
      issueType: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().int().optional(),
          startAt: z.number().int().optional(),
          total: z.number().int().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().int().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().int().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().int().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).describe("The ID or key of a linked issue."),
  type: z.object({
    id: z.string().optional(),
    inward: z.string().optional(),
    name: z.string().optional(),
    outward: z.string().optional(),
    self: z.string().optional(),
  }).describe(
    "This object is used as follows:\n\n *  In the [ issueLink](#api-rest-api-3-issueLink-post) resource it defines and reports on the type of link between the issues. Find a list of issue link types with [Get issue link types](#api-rest-api-3-issueLinkType-get).\n *  In the [ issueLinkType](#api-rest-api-3-issueLinkType-post) resource it defines and reports on issue link types.",
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
  id: z.string(),
  inwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
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
      issueType: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().optional(),
          startAt: z.number().optional(),
          total: z.number().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  outwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
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
      issueType: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().optional(),
          startAt: z.number().optional(),
          total: z.number().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  self: z.string().optional(),
  type: z.object({
    id: z.string().optional(),
    inward: z.string().optional(),
    name: z.string().optional(),
    outward: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
});

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  name: z.string().optional(),
  comment: z.object({
    author: z.object({
      accountId: z.string().max(128).optional(),
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
    body: z.string().optional(),
    created: z.string().optional(),
    id: z.string().optional(),
    jsdAuthorCanSeeRequest: z.boolean().optional(),
    jsdPublic: z.boolean().optional(),
    properties: z.array(z.object({
      key: z.string().optional(),
      value: z.string().optional(),
    })).optional(),
    renderedBody: z.string().optional(),
    self: z.string().optional(),
    updateAuthor: z.object({
      accountId: z.string().max(128).optional(),
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
    updated: z.string().optional(),
    visibility: z.object({
      identifier: z.string().optional(),
      type: z.enum(["group", "role"]).optional(),
      value: z.string().optional(),
    }).optional(),
  }).optional(),
  inwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
        accountId: z.string().max(128).optional(),
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
      issueType: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().int().optional(),
          startAt: z.number().int().optional(),
          total: z.number().int().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().int().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().int().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().int().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  outwardIssue: z.object({
    fields: z.object({
      assignee: z.object({
        accountId: z.string().max(128).optional(),
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
      issueType: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      issuetype: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        entityId: z.string().optional(),
        hierarchyLevel: z.number().int().optional(),
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
        subtask: z.boolean().optional(),
      }).optional(),
      priority: z.object({
        avatarId: z.number().int().optional(),
        description: z.string().optional(),
        iconUrl: z.string().optional(),
        id: z.string().optional(),
        isDefault: z.boolean().optional(),
        name: z.string().optional(),
        schemes: z.object({
          maxResults: z.number().int().optional(),
          startAt: z.number().int().optional(),
          total: z.number().int().optional(),
        }).optional(),
        self: z.string().optional(),
        statusColor: z.string().optional(),
      }).optional(),
      status: z.object({
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
      summary: z.string().optional(),
      timetracking: z.object({
        originalEstimate: z.string().optional(),
        originalEstimateSeconds: z.number().int().optional(),
        remainingEstimate: z.string().optional(),
        remainingEstimateSeconds: z.number().int().optional(),
        timeSpent: z.string().optional(),
        timeSpentSeconds: z.number().int().optional(),
      }).optional(),
    }).optional(),
    id: z.string().optional(),
    key: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  type: z.object({
    id: z.string().optional(),
    inward: z.string().optional(),
    name: z.string().optional(),
    outward: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira issue link. Registered at `/jira/issue-link`. */
export const model = {
  type: "@shelson/jira/issue-link",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Issue Link resource state",
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
      description: "Create a issue link",
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
        if (g.comment !== undefined) body.comment = g.comment;
        if (g.inwardIssue !== undefined) body.inwardIssue = g.inwardIssue;
        if (g.outwardIssue !== undefined) body.outwardIssue = g.outwardIssue;
        if (g.type !== undefined) body.type = g.type;
        const credentials = { site: g.site, email: g.email, token: g.token };
        const result = await create(
          "/rest/api/3/issueLink",
          body,
          credentials,
        ) as ResourceData;
        // Jira returns 201 with an empty body on success — resolve the link id
        // by reading back the inward issue so the resource is addressable.
        if (result.id === undefined) {
          const a = issueKeyOf(g.inwardIssue);
          const b = issueKeyOf(g.outwardIssue);
          const typeName = g.type?.name;
          if (a && b) {
            const id = await findLinkBetween(a, b, typeName, credentials) ??
              await findLinkBetween(b, a, typeName, credentials);
            if (id !== undefined) {
              result.id = id;
              result.inwardIssue = { key: a };
              result.outwardIssue = { key: b };
            }
          }
        }
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
      description: "Get a issue link",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).describe(
          "The ID of the issue link",
        ),
      }),
      execute: async (args: { id: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const result = await read("/rest/api/3/issueLink", args.id, {
          site: g.site,
          email: g.email,
          token: g.token,
        }) as ResourceData;
        const instanceName = (g.name?.toString() ?? args.id.toString()).replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
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
      description: "Delete the issue link",
      arguments: z.object({
        id: z.union([z.string(), z.number()]).optional().describe(
          "The ID of the issue link (resolved from inwardIssue/outwardIssue when omitted)",
        ),
      }),
      execute: async (args: { id?: string | number }, context: any) => {
        const g = context.globalArgs;
        context.logger.info("Running {method} on {type}", {
          method: context.methodName,
          type: context.modelType,
        });
        const credentials = { site: g.site, email: g.email, token: g.token };
        let resolvedId: string | number | undefined = args.id;
        if (resolvedId === undefined || String(resolvedId) === "") {
          const a = issueKeyOf(g.inwardIssue);
          const b = issueKeyOf(g.outwardIssue);
          const typeName = g.type?.name;
          if (a && b) {
            resolvedId = await findLinkBetween(a, b, typeName, credentials) ??
              await findLinkBetween(b, a, typeName, credentials);
          }
        }
        if (resolvedId === undefined) {
          throw new Error(
            "Cannot delete issue link: no id provided and no link could be " +
              "resolved from inwardIssue/outwardIssue global arguments",
          );
        }
        const { existed } = await remove(
          "/rest/api/3/issueLink",
          resolvedId,
          credentials,
        );
        const instanceName = (g.name?.toString() ?? resolvedId.toString())
          .replace(
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
      description: "Sync issue link state from Jira",
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
        const credentials = { site: g.site, email: g.email, token: g.token };
        let linkId = existing.id?.toString();
        if (!linkId) {
          // Fall back to locating the link via its endpoints (e.g. data from a
          // create run before id resolution was added).
          const a = issueKeyOf(g.inwardIssue);
          const b = issueKeyOf(g.outwardIssue);
          const typeName = g.type?.name;
          if (a && b) {
            linkId = await findLinkBetween(a, b, typeName, credentials) ??
              await findLinkBetween(b, a, typeName, credentials);
          }
        }
        const result = linkId
          ? await tryRead("/rest/api/3/issueLink", linkId, credentials) as
            | ResourceData
            | null
          : null;
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
          id: linkId ?? existing.id,
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
