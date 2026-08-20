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

// Auto-generated shared helper for Jira extension models.
// Do not edit manually. Re-generate with: deno task generate:jira

/**
 * Optional explicit credentials. When provided, each field takes precedence
 * over the corresponding environment variable (JIRA_SITE, JIRA_EMAIL,
 * JIRA_API_TOKEN). A model wires these from its site/email/token global
 * arguments — the token may come from a vault.get(...) expression.
 */
export interface JiraCredentials {
  site?: string;
  email?: string;
  token?: string;
}

interface ResolvedCredentials {
  site: string;
  email: string;
  apiToken: string;
}

// Credential sets validated against GET /rest/api/3/myself are cached here so
// each distinct site|email|token triple is validated exactly once.
const validatedCredentials = new Set<string>();

/**
 * Resolves the Jira Cloud site, account email, and API token. Explicit values
 * (e.g. from a model's site/email/token global arguments) take precedence
 * over the JIRA_SITE, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.
 */
async function resolveCredentials(
  explicit?: JiraCredentials,
): Promise<ResolvedCredentials> {
  const site = explicit?.site ?? Deno.env.get("JIRA_SITE");
  if (!site) {
    throw new Error(
      "No Jira site found. Provide one via the model's 'site' global argument " +
        "(e.g. acme.atlassian.net) or set the JIRA_SITE environment variable.",
    );
  }
  const email = explicit?.email ?? Deno.env.get("JIRA_EMAIL");
  if (!email) {
    throw new Error(
      "No Jira account email found. Provide one via the model's 'email' " +
        "global argument or set the JIRA_EMAIL environment variable.",
    );
  }
  const apiToken = explicit?.token ?? Deno.env.get("JIRA_API_TOKEN");
  if (!apiToken) {
    throw new Error(
      "No Jira API token found. Provide one via the model's 'token' global " +
        "argument (wired with a vault.get(...) expression) or set the " +
        "JIRA_API_TOKEN environment variable.",
    );
  }

  const cacheKey = `${site}|${email}|${apiToken}`;
  if (validatedCredentials.has(cacheKey)) {
    return { site, email, apiToken };
  }

  // Validate the credentials by hitting /rest/api/3/myself
  const resp = await fetch(
    `https://${site}/rest/api/3/myself`,
    { headers: authHeaders(email, apiToken) },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `Jira credentials are invalid (GET /rest/api/3/myself returned ${resp.status}): ${text}`,
    );
  }
  // Drain the response body
  await resp.text();

  validatedCredentials.add(cacheKey);
  return { site, email, apiToken };
}

function authHeaders(
  email: string,
  apiToken: string,
): Record<string, string> {
  return {
    "Authorization": `Basic ${btoa(`${email}:${apiToken}`)}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  credentials?: JiraCredentials,
): Promise<Response> {
  const creds = await resolveCredentials(credentials);
  const url = `https://${creds.site}${path}`;

  const resp = await fetch(url, {
    method,
    headers: authHeaders(creds.email, creds.apiToken),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    // 404 is handled by callers — not an exception
    if (resp.status === 404) {
      return resp;
    }
    const text = await resp.text();
    throw new Error(
      `Jira API error: ${method} ${path} returned ${resp.status}: ${text}`,
    );
  }

  return resp;
}

export async function create(
  endpoint: string,
  body: Record<string, unknown>,
  credentials?: JiraCredentials,
): Promise<Record<string, unknown>> {
  const resp = await request("POST", endpoint, body, credentials);
  const text = await resp.text();
  if (!text) return {};
  return JSON.parse(text);
}

export async function read(
  endpoint: string,
  id: number | string,
  credentials?: JiraCredentials,
): Promise<Record<string, unknown>> {
  const resp = await request(
    "GET",
    `${endpoint}/${id}`,
    undefined,
    credentials,
  );
  if (resp.status === 404) {
    const text = await resp.text();
    throw new Error(
      `Resource not found: GET ${endpoint}/${id} returned 404: ${text}`,
    );
  }
  return await resp.json();
}

export async function tryRead(
  endpoint: string,
  id: number | string,
  credentials?: JiraCredentials,
): Promise<Record<string, unknown> | null> {
  const resp = await request(
    "GET",
    `${endpoint}/${id}`,
    undefined,
    credentials,
  );
  if (resp.status === 404) {
    await resp.text();
    return null;
  }
  return await resp.json();
}

/**
 * Updates a resource via PUT (or PATCH). Some Jira endpoints return the
 * updated entity, others return an empty body — in the latter case the
 * resource is re-read so callers always get complete state.
 */
export async function update(
  endpoint: string,
  id: number | string,
  body: Record<string, unknown>,
  method: "PUT" | "PATCH" = "PUT",
  credentials?: JiraCredentials,
): Promise<Record<string, unknown>> {
  const resp = await request(method, `${endpoint}/${id}`, body, credentials);
  if (resp.status === 404) {
    const text = await resp.text();
    throw new Error(
      `Resource not found: ${method} ${endpoint}/${id} returned 404: ${text}`,
    );
  }
  const text = await resp.text();
  if (!text) {
    // Empty body after update — re-read the resource
    return await read(endpoint, id, credentials);
  }
  return JSON.parse(text);
}

export async function remove(
  endpoint: string,
  id: number | string,
  credentials?: JiraCredentials,
): Promise<{ existed: boolean }> {
  const resp = await request(
    "DELETE",
    `${endpoint}/${id}`,
    undefined,
    credentials,
  );
  await resp.text();
  return { existed: resp.status !== 404 };
}
