import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./account.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

const execute = model.methods.lookup.execute;

Deno.test(
  "lookup returns account with auth domains",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: { id: 1, name: "Test" },
        organization: {
          id: "org1",
          name: "Org",
          userManagement: {
            authenticationDomains: {
              authenticationDomains: [{
                id: "ad1",
                name: "Default",
                provisioningType: "SCIM",
                groups: { groups: [] },
              }],
            },
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await execute({ includeUsers: true }, ctx);
    assertEquals(written.length, 1);
    assertEquals(written[0].data.name, "Test");
    assertEquals(written[0].data.organizationId, "org1");
  }),
);

Deno.test(
  "lookup throws when account not visible",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: null, organization: null } });
    const { ctx } = mockContext();
    await assertRejects(
      () => execute({ includeUsers: false }, ctx),
      Error,
      "not visible",
    );
  }),
);

Deno.test(
  "lookup throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "unauthorized" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => execute({ includeUsers: false }, ctx),
      Error,
      "unauthorized",
    );
  }),
);

const runNrql = model.methods.nrql.execute;

Deno.test(
  "nrql stores query results under the query resource",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: { nrql: { results: [{ count: 3 }] } } } });
    const { ctx, written } = mockContext();
    await runNrql(
      { query: "SELECT count(*) FROM Transaction", name: "tx" },
      ctx,
    );
    assertEquals(written.length, 1);
    assertEquals(written[0].spec, "query");
    assertEquals(written[0].name, "tx");
    assertEquals(written[0].data.query, "SELECT count(*) FROM Transaction");
    assertEquals(written[0].data.results, [{ count: 3 }]);
  }),
);

Deno.test(
  "nrql defaults the resource name to result",
  withFetchRestore(async () => {
    stubFetch({ actor: { account: { nrql: { results: [] } } } });
    const { ctx, written } = mockContext();
    await runNrql({ query: "SELECT count(*) FROM Transaction" }, ctx);
    assertEquals(written[0].name, "result");
  }),
);

Deno.test(
  "nrql throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "invalid nrql" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => runNrql({ query: "nonsense" }, ctx),
      Error,
      "invalid nrql",
    );
  }),
);
