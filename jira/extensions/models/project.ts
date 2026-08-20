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

// Auto-generated extension model for /jira/project
// Do not edit manually. Re-generate with: deno task generate:jira

// deno-lint-ignore-file no-explicit-any

/**
 * Swamp extension model for a Jira project.
 *
 * Wraps the `/rest/api/3/project` API as a swamp model so create, get, update,
 * delete, and sync can be driven through `swamp model`.
 *
 * @module
 */

import { z } from "npm:zod@4.3.6";
import { create, read, remove, tryRead, update } from "./_lib/jira.ts";

const GlobalArgsSchema = z.object({
  assigneeType: z.enum(["PROJECT_LEAD", "UNASSIGNED"]).describe(
    "The default assignee when creating issues for this project.",
  ).optional(),
  avatarId: z.number().int().describe(
    "An integer value for the project's avatar.",
  ).optional(),
  categoryId: z.number().int().describe(
    "The ID of the project's category. A complete list of category IDs is found using the [Get all project categories](#api-rest-api-3-projectCategory-get) operation.",
  ).optional(),
  description: z.string().describe("A brief description of the project.")
    .optional(),
  issueSecurityScheme: z.number().int().describe(
    "The ID of the issue security scheme for the project, which enables you to control who can and cannot view issues. Use the [Get issue security schemes](#api-rest-api-3-issuesecurityschemes-get) resource to get all issue security scheme IDs.",
  ).optional(),
  key: z.string().describe(
    "Project keys must be unique and start with an uppercase letter followed by one or more uppercase alphanumeric characters. The maximum length is 10 characters.",
  ),
  lead: z.string().describe(
    "This parameter is deprecated because of privacy changes. Use `leadAccountId` instead. See the [migration guide](https://developer.atlassian.com/cloud/jira/platform/deprecation-notice-user-privacy-api-migration-guide/) for details. The user name of the project lead. Either `lead` or `leadAccountId` must be set when creating a project. Cannot be provided with `leadAccountId`.",
  ).optional(),
  leadAccountId: z.string().max(128).describe(
    "The account ID of the project lead. Either `lead` or `leadAccountId` must be set when creating a project. Cannot be provided with `lead`.",
  ).optional(),
  name: z.string().describe("The name of the project."),
  notificationScheme: z.number().int().describe(
    "The ID of the notification scheme for the project. Use the [Get notification schemes](#api-rest-api-3-notificationscheme-get) resource to get a list of notification scheme IDs.",
  ).optional(),
  permissionScheme: z.number().int().describe(
    "The ID of the permission scheme for the project. Use the [Get all permission schemes](#api-rest-api-3-permissionscheme-get) resource to see a list of all permission scheme IDs.",
  ).optional(),
  releasedProjectKeys: z.array(z.string()).describe(
    "Previous project keys to be released from the current project. Released keys must belong to the current project and not contain the current project key",
  ).optional(),
  url: z.string().describe(
    "A link to information about this project, such as project documentation",
  ).optional(),
  fieldConfigurationScheme: z.number().int().describe(
    "Deprecated use [fieldScheme](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-field-schemes/#api-group-field-schemes) instead. The ID of the field configuration scheme for the project. Use the [Get all field configuration schemes](#api-rest-api-3-fieldconfigurationscheme-get) operation to get a list of field configuration scheme IDs. If you specify the field configuration scheme you cannot specify the project template key.",
  ).optional(),
  fieldScheme: z.number().int().describe(
    "The ID of the field scheme for the project. Use the [Get field schemes](#api-rest-api-3-config-fieldschemes-get) operation to get a list of field scheme IDs. If you specify the field scheme you cannot specify the project template key.",
  ).optional(),
  issueTypeScheme: z.number().int().describe(
    "The ID of the issue type scheme for the project. Use the [Get all issue type schemes](#api-rest-api-3-issuetypescheme-get) operation to get a list of issue type scheme IDs. If you specify the issue type scheme you cannot specify the project template key.",
  ).optional(),
  issueTypeScreenScheme: z.number().int().describe(
    "The ID of the issue type screen scheme for the project. Use the [Get all issue type screen schemes](#api-rest-api-3-issuetypescreenscheme-get) operation to get a list of issue type screen scheme IDs. If you specify the issue type screen scheme you cannot specify the project template key.",
  ).optional(),
  projectTemplateKey: z.enum([
    "com.pyxis.greenhopper.jira:gh-simplified-agility-kanban",
    "com.pyxis.greenhopper.jira:gh-simplified-agility-scrum",
    "com.pyxis.greenhopper.jira:gh-simplified-basic",
    "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic",
    "com.pyxis.greenhopper.jira:gh-simplified-scrum-classic",
    "com.pyxis.greenhopper.jira:gh-cross-team-template",
    "com.pyxis.greenhopper.jira:gh-cross-team-planning-template",
    "com.atlassian.servicedesk:simplified-it-service-management",
    "com.atlassian.servicedesk:simplified-it-service-management-basic",
    "com.atlassian.servicedesk:simplified-it-service-management-operations",
    "com.atlassian.servicedesk:simplified-internal-service-desk",
    "com.atlassian.servicedesk:simplified-external-service-desk",
    "com.atlassian.servicedesk:simplified-hr-service-desk",
    "com.atlassian.servicedesk:simplified-facilities-service-desk",
    "com.atlassian.servicedesk:simplified-legal-service-desk",
    "com.atlassian.servicedesk:simplified-marketing-service-desk",
    "com.atlassian.servicedesk:simplified-finance-service-desk",
    "com.atlassian.servicedesk:simplified-analytics-service-desk",
    "com.atlassian.servicedesk:simplified-design-service-desk",
    "com.atlassian.servicedesk:simplified-sales-service-desk",
    "com.atlassian.servicedesk:simplified-halp-service-desk",
    "com.atlassian.servicedesk:next-gen-it-service-desk",
    "com.atlassian.servicedesk:next-gen-hr-service-desk",
    "com.atlassian.servicedesk:next-gen-legal-service-desk",
    "com.atlassian.servicedesk:next-gen-marketing-service-desk",
    "com.atlassian.servicedesk:next-gen-facilities-service-desk",
    "com.atlassian.servicedesk:next-gen-analytics-service-desk",
    "com.atlassian.servicedesk:next-gen-finance-service-desk",
    "com.atlassian.servicedesk:next-gen-design-service-desk",
    "com.atlassian.servicedesk:next-gen-sales-service-desk",
    "com.atlassian.servicedesk:company-managed-blank-service-project",
    "com.atlassian.servicedesk:company-managed-general-service-project",
    "com.atlassian.servicedesk:team-managed-general-service-project",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-content-management",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-document-approval",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-lead-tracking",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-process-control",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-procurement",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-project-management",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-recruitment",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-task-",
    "com.atlassian.jcs:customer-service-management",
  ]).describe(
    "A predefined configuration for a project. The type of the `projectTemplateKey` must match with the type of the `projectTypeKey`.",
  ).optional(),
  projectTypeKey: z.enum(["software", "service_desk", "business"]).describe(
    "The [project type](https://confluence.atlassian.com/x/GwiiLQ#Jiraapplicationsoverview-Productfeaturesandprojecttypes), which defines the application-specific feature set. If you don't specify the project template you have to specify the project type.",
  ).optional(),
  workflowScheme: z.number().int().describe(
    "The ID of the workflow scheme for the project. Use the [Get all workflow schemes](#api-rest-api-3-workflowscheme-get) operation to get a list of workflow scheme IDs. If you specify the workflow scheme you cannot specify the project template key.",
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
  archived: z.boolean().optional(),
  archivedBy: z.object({
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
  archivedDate: z.string().optional(),
  assigneeType: z.string().optional(),
  avatarUrls: z.object({
    "16x16": z.string().optional(),
    "24x24": z.string().optional(),
    "32x32": z.string().optional(),
    "48x48": z.string().optional(),
  }).optional(),
  components: z.array(z.object({
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
    id: z.string().optional(),
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
  })).optional(),
  deleted: z.boolean().optional(),
  deletedBy: z.object({
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
  deletedDate: z.string().optional(),
  description: z.string().optional(),
  email: z.string().optional(),
  expand: z.string().optional(),
  favourite: z.boolean().optional(),
  id: z.string(),
  insight: z.object({
    lastIssueUpdateTime: z.string().optional(),
    totalIssueCount: z.number().optional(),
  }).optional(),
  isPrivate: z.boolean().optional(),
  issueTypeHierarchy: z.object({
    baseLevelId: z.number().optional(),
    levels: z.array(z.object({
      aboveLevelId: z.number().optional(),
      belowLevelId: z.number().optional(),
      externalUuid: z.string().optional(),
      hierarchyLevelNumber: z.number().optional(),
      id: z.number().optional(),
      issueTypeIds: z.array(z.number()).optional(),
      level: z.number().optional(),
      name: z.string().optional(),
      projectConfigurationId: z.number().optional(),
    })).optional(),
  }).optional(),
  issueTypes: z.array(z.object({
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
  })).optional(),
  key: z.string(),
  landingPageInfo: z.object({
    attributes: z.record(z.string(), z.unknown()).optional(),
    boardId: z.number().optional(),
    boardName: z.string().optional(),
    projectKey: z.string().optional(),
    projectType: z.string().optional(),
    queueCategory: z.string().optional(),
    queueId: z.number().optional(),
    queueName: z.string().optional(),
    simpleBoard: z.boolean().optional(),
    simplified: z.boolean().optional(),
    url: z.string().optional(),
  }).optional(),
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
  name: z.string().optional(),
  permissions: z.object({
    canEdit: z.boolean().optional(),
  }).optional(),
  projectCategory: z.object({
    description: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    self: z.string().optional(),
  }).optional(),
  projectTypeKey: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  retentionTillDate: z.string().optional(),
  roles: z.record(z.string(), z.unknown()).optional(),
  self: z.string().optional(),
  simplified: z.boolean().optional(),
  style: z.string().optional(),
  url: z.string().optional(),
  uuid: z.string().optional(),
  versions: z.array(z.object({
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
    id: z.string().optional(),
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
  })).optional(),
}).passthrough();

type ResourceData = z.infer<typeof ResourceSchema>;

const InputsSchema = z.object({
  assigneeType: z.enum(["PROJECT_LEAD", "UNASSIGNED"]).optional(),
  avatarId: z.number().int().optional(),
  categoryId: z.number().int().optional(),
  description: z.string().optional(),
  issueSecurityScheme: z.number().int().optional(),
  key: z.string().optional(),
  lead: z.string().optional(),
  leadAccountId: z.string().max(128).optional(),
  name: z.string().optional(),
  notificationScheme: z.number().int().optional(),
  permissionScheme: z.number().int().optional(),
  releasedProjectKeys: z.array(z.string()).optional(),
  url: z.string().optional(),
  fieldConfigurationScheme: z.number().int().optional(),
  fieldScheme: z.number().int().optional(),
  issueTypeScheme: z.number().int().optional(),
  issueTypeScreenScheme: z.number().int().optional(),
  projectTemplateKey: z.enum([
    "com.pyxis.greenhopper.jira:gh-simplified-agility-kanban",
    "com.pyxis.greenhopper.jira:gh-simplified-agility-scrum",
    "com.pyxis.greenhopper.jira:gh-simplified-basic",
    "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic",
    "com.pyxis.greenhopper.jira:gh-simplified-scrum-classic",
    "com.pyxis.greenhopper.jira:gh-cross-team-template",
    "com.pyxis.greenhopper.jira:gh-cross-team-planning-template",
    "com.atlassian.servicedesk:simplified-it-service-management",
    "com.atlassian.servicedesk:simplified-it-service-management-basic",
    "com.atlassian.servicedesk:simplified-it-service-management-operations",
    "com.atlassian.servicedesk:simplified-internal-service-desk",
    "com.atlassian.servicedesk:simplified-external-service-desk",
    "com.atlassian.servicedesk:simplified-hr-service-desk",
    "com.atlassian.servicedesk:simplified-facilities-service-desk",
    "com.atlassian.servicedesk:simplified-legal-service-desk",
    "com.atlassian.servicedesk:simplified-marketing-service-desk",
    "com.atlassian.servicedesk:simplified-finance-service-desk",
    "com.atlassian.servicedesk:simplified-analytics-service-desk",
    "com.atlassian.servicedesk:simplified-design-service-desk",
    "com.atlassian.servicedesk:simplified-sales-service-desk",
    "com.atlassian.servicedesk:simplified-halp-service-desk",
    "com.atlassian.servicedesk:next-gen-it-service-desk",
    "com.atlassian.servicedesk:next-gen-hr-service-desk",
    "com.atlassian.servicedesk:next-gen-legal-service-desk",
    "com.atlassian.servicedesk:next-gen-marketing-service-desk",
    "com.atlassian.servicedesk:next-gen-facilities-service-desk",
    "com.atlassian.servicedesk:next-gen-analytics-service-desk",
    "com.atlassian.servicedesk:next-gen-finance-service-desk",
    "com.atlassian.servicedesk:next-gen-design-service-desk",
    "com.atlassian.servicedesk:next-gen-sales-service-desk",
    "com.atlassian.servicedesk:company-managed-blank-service-project",
    "com.atlassian.servicedesk:company-managed-general-service-project",
    "com.atlassian.servicedesk:team-managed-general-service-project",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-content-management",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-document-approval",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-lead-tracking",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-process-control",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-procurement",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-project-management",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-recruitment",
    "com.atlassian.jira-core-project-templates:jira-core-simplified-task-",
    "com.atlassian.jcs:customer-service-management",
  ]).optional(),
  projectTypeKey: z.enum(["software", "service_desk", "business"]).optional(),
  workflowScheme: z.number().int().optional(),
  site: z.string().optional(),
  email: z.string().optional(),
  token: z.string().meta({ sensitive: true }).optional(),
});

/** Swamp extension model for Jira project. Registered at `/jira/project`. */
export const model = {
  type: "/jira/project",
  version: "2026.08.21.1",
  globalArguments: GlobalArgsSchema,
  inputsSchema: InputsSchema,
  resources: {
    state: {
      description: "Project resource state",
      schema: ResourceSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    create: {
      description: "Create a project",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: any) => {
        const g = context.globalArgs;
        const instanceName = (g.name?.toString() ?? "current").replace(
          /[\/\\]/g,
          "_",
        ).replace(/\.\./g, "_").replace(/\0/g, "");
        const body: Record<string, unknown> = {};
        if (g.assigneeType !== undefined) body.assigneeType = g.assigneeType;
        if (g.avatarId !== undefined) body.avatarId = g.avatarId;
        if (g.categoryId !== undefined) body.categoryId = g.categoryId;
        if (g.description !== undefined) body.description = g.description;
        if (g.fieldConfigurationScheme !== undefined) {
          body.fieldConfigurationScheme = g.fieldConfigurationScheme;
        }
        if (g.fieldScheme !== undefined) body.fieldScheme = g.fieldScheme;
        if (g.issueSecurityScheme !== undefined) {
          body.issueSecurityScheme = g.issueSecurityScheme;
        }
        if (g.issueTypeScheme !== undefined) {
          body.issueTypeScheme = g.issueTypeScheme;
        }
        if (g.issueTypeScreenScheme !== undefined) {
          body.issueTypeScreenScheme = g.issueTypeScreenScheme;
        }
        if (g.key !== undefined) body.key = g.key;
        if (g.lead !== undefined) body.lead = g.lead;
        if (g.leadAccountId !== undefined) body.leadAccountId = g.leadAccountId;
        if (g.name !== undefined) body.name = g.name;
        if (g.notificationScheme !== undefined) {
          body.notificationScheme = g.notificationScheme;
        }
        if (g.permissionScheme !== undefined) {
          body.permissionScheme = g.permissionScheme;
        }
        if (g.projectTemplateKey !== undefined) {
          body.projectTemplateKey = g.projectTemplateKey;
        }
        if (g.projectTypeKey !== undefined) {
          body.projectTypeKey = g.projectTypeKey;
        }
        if (g.url !== undefined) body.url = g.url;
        if (g.workflowScheme !== undefined) {
          body.workflowScheme = g.workflowScheme;
        }
        const result = await create("/rest/api/3/project", body, {
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
      description: "Get a project",
      arguments: z.object({
        idOrKey: z.string().describe("The ID or key of the project"),
      }),
      execute: async (args: { idOrKey: string }, context: any) => {
        const g = context.globalArgs;
        const result = await read("/rest/api/3/project", args.idOrKey, {
          site: g.site,
          email: g.email,
          token: g.token,
        }) as ResourceData;
        const instanceName =
          (result.name?.toString() ?? args.idOrKey.toString()).replace(
            /[\/\\]/g,
            "_",
          ).replace(/\.\./g, "_").replace(/\0/g, "");
        const handle = await context.writeResource(
          "state",
          instanceName,
          result,
        );
        return { dataHandles: [handle] };
      },
    },
    update: {
      description: "Update project attributes",
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
        if (g.assigneeType !== undefined) body.assigneeType = g.assigneeType;
        if (g.avatarId !== undefined) body.avatarId = g.avatarId;
        if (g.categoryId !== undefined) body.categoryId = g.categoryId;
        if (g.description !== undefined) body.description = g.description;
        if (g.issueSecurityScheme !== undefined) {
          body.issueSecurityScheme = g.issueSecurityScheme;
        }
        if (g.key !== undefined) body.key = g.key;
        if (g.lead !== undefined) body.lead = g.lead;
        if (g.leadAccountId !== undefined) body.leadAccountId = g.leadAccountId;
        if (g.name !== undefined) body.name = g.name;
        if (g.notificationScheme !== undefined) {
          body.notificationScheme = g.notificationScheme;
        }
        if (g.permissionScheme !== undefined) {
          body.permissionScheme = g.permissionScheme;
        }
        if (g.releasedProjectKeys !== undefined) {
          body.releasedProjectKeys = g.releasedProjectKeys;
        }
        if (g.url !== undefined) body.url = g.url;
        const result = await update(
          "/rest/api/3/project",
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
      description: "Delete the project",
      arguments: z.object({
        idOrKey: z.string().describe("The ID or key of the project"),
      }),
      execute: async (args: { idOrKey: string }, context: any) => {
        const g = context.globalArgs;
        const { existed } = await remove("/rest/api/3/project", args.idOrKey, {
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
      description: "Sync project state from Jira",
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
          "/rest/api/3/project",
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
