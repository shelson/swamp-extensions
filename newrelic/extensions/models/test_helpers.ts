/**
 * Shared test helpers for `@shelson/newrelic` model tests.
 *
 * Stubs `globalThis.fetch` and provides a mock swamp execution context so
 * each model's `execute` can be driven without a real NerdGraph endpoint.
 *
 * @module
 */

/** Stub `globalThis.fetch` to return a 200 JSON response. */
export function stubFetch(body: unknown): void {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ data: body }), { status: 200 }),
    );
}

/** Stub `globalThis.fetch` to return a 200 with GraphQL-level errors. */
export function stubFetchErrors(errors: { message: string }[]): void {
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ errors }), { status: 200 }));
}

/** Stub `globalThis.fetch` to return a non-200 HTTP status. */
export function stubFetchHttp(status: number, text: string): void {
  globalThis.fetch = () => Promise.resolve(new Response(text, { status }));
}

/**
 * Stub `globalThis.fetch` to replay a sequence of responses, standing in for
 * the same factory once exhausted. Returns a call counter for retry assertions.
 */
export function stubFetchQueue(
  responses: (() => Response)[],
): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = () =>
    Promise.resolve(
      responses[Math.min(counter.calls++, responses.length - 1)](),
    );
  return counter;
}

/**
 * Create a mock swamp execution context. Optionally seed stored resources so
 * `sync`/idempotent methods can read back prior state.
 *
 * Returns the context plus spies for written and deleted resources.
 */
export function mockContext(
  seed: Record<string, Record<string, unknown>> = {},
) {
  const written: {
    spec: string;
    name: string;
    data: Record<string, unknown>;
  }[] = [];
  const deleted: string[] = [];
  const stored: Record<string, Record<string, unknown>> = { ...seed };
  const ctx = {
    globalArgs: {
      accountId: 1,
      apiKey: "NRAK-test",
      endpoint: "https://test.invalid/graphql",
    },
    logger: { info: () => {} },
    readResource: (name: string) => Promise.resolve(stored[name] ?? null),
    writeResource: (
      spec: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
      written.push({ spec, name, data });
      stored[name] = data;
      return Promise.resolve({ name });
    },
    deleteResource: (name: string) => {
      deleted.push(name);
      delete stored[name];
      return Promise.resolve(undefined);
    },
  };
  return { ctx, written, deleted };
}

/** Save and restore `globalThis.fetch` around a test. */
export function withFetchRestore(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const original = globalThis.fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = original;
    }
  };
}
