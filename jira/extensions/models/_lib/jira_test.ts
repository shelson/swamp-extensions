/**
 * Unit tests for the _lib/jira.ts shared helpers.
 */

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { checkCredentials, list } from "./jira.ts";

// Mock fetch for all tests in this module.
// resolveCredentials calls GET /rest/api/3/myself for validation;
// request() calls the target endpoint. Both route through globalThis.fetch.

let fetchCalls: Array<{ url: string; method: string; body?: string }> = [];

function mockFetch(
  responses: Array<{ status: number; body: unknown }>,
): void {
  let idx = 0;
  fetchCalls = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body?.toString();
    fetchCalls.push({ url, method, body });

    const r = responses[idx] ?? {
      status: 200,
      body: {},
    };
    idx++;
    return Promise.resolve(
      new Response(JSON.stringify(r.body), { status: r.status }),
    );
  }) as typeof globalThis.fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

const originalFetch = globalThis.fetch;

// --------------- checkCredentials ---------------

Deno.test("checkCredentials: returns pass when credentials are valid", async () => {
  mockFetch([{ status: 200, body: { accountId: "user-1" } }]);

  try {
    const result = await checkCredentials({
      site: "a.example.com",
      email: "a@example.com",
      token: "tok-a",
    });
    assertEquals(result.pass, true);
    assertEquals(result.errors, undefined);
    assertEquals(fetchCalls.length, 1);
    assertEquals(fetchCalls[0].url, "https://a.example.com/rest/api/3/myself");
  } finally {
    restoreFetch();
  }
});

Deno.test("checkCredentials: returns fail when credentials are invalid", async () => {
  mockFetch([{ status: 401, body: { errorMessages: ["Unauthorized"] } }]);

  try {
    const result = await checkCredentials({
      site: "b.example.com",
      email: "b@example.com",
      token: "tok-b",
    });
    assertEquals(result.pass, false);
    assertEquals(result.errors?.length, 1);
    assertStringIncludes(result.errors![0], "401");
  } finally {
    restoreFetch();
  }
});

// --------------- list ---------------

Deno.test("list: returns array response directly", async () => {
  mockFetch([
    { status: 200, body: { accountId: "user-1" } }, // credential check
    { status: 200, body: [{ id: 1, name: "alpha" }, { id: 2, name: "beta" }] },
  ]);

  try {
    const result = await list("/rest/api/3/test-array", {
      site: "d.example.com",
      email: "d@example.com",
      token: "tok-d",
    });
    assertEquals(result.length, 2);
    assertEquals(result[0].name, "alpha");
    assertEquals(result[1].name, "beta");
    assertEquals(fetchCalls.length, 2);
    assertEquals(
      fetchCalls[1].url,
      "https://d.example.com/rest/api/3/test-array",
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("list: extracts values array from paging envelope", async () => {
  mockFetch([
    { status: 200, body: { accountId: "user-1" } },
    {
      status: 200,
      body: { values: [{ id: 3 }, { id: 4 }], total: 42, startAt: 0 },
    },
  ]);

  try {
    const result = await list("/rest/api/3/test-envelope", {
      site: "e.example.com",
      email: "e@example.com",
      token: "tok-e",
    });
    assertEquals(result.length, 2);
    assertEquals(result[0].id, 3);
    assertEquals(result[1].id, 4);
  } finally {
    restoreFetch();
  }
});

Deno.test("list: returns empty array for empty response object", async () => {
  mockFetch([
    { status: 200, body: { accountId: "user-1" } },
    { status: 200, body: {} },
  ]);

  try {
    const result = await list("/rest/api/3/test-empty", {
      site: "f.example.com",
      email: "f@example.com",
      token: "tok-f",
    });
    assertEquals(result, []);
  } finally {
    restoreFetch();
  }
});

Deno.test("list: picks first array-valued key from non-standard envelope", async () => {
  mockFetch([
    { status: 200, body: { accountId: "user-1" } },
    {
      status: 200,
      body: {
        self: "https://...",
        issues: [{ key: "PROJ-1" }, { key: "PROJ-2" }],
      },
    },
  ]);

  try {
    const result = await list("/rest/api/3/test-nonstandard", {
      site: "g.example.com",
      email: "g@example.com",
      token: "tok-g",
    });
    assertEquals(result.length, 2);
    assertEquals(result[0].key, "PROJ-1");
  } finally {
    restoreFetch();
  }
});

Deno.test("list: throws on non-200/404 HTTP error", async () => {
  mockFetch([
    { status: 200, body: { accountId: "user-1" } },
    { status: 500, body: { errorMessages: ["Internal error"] } },
  ]);

  try {
    await assertRejects(
      () =>
        list("/rest/api/3/test-error", {
          site: "h.example.com",
          email: "h@example.com",
          token: "tok-h",
        }),
      Error,
      "500",
    );
  } finally {
    restoreFetch();
  }
});
