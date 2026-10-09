/**
 * Tests for the factory-pattern methods (`discoverAll`, `getDefinitions`) and
 * the dashboard `tag` method.
 *
 * @module
 */
import { assertEquals, assertRejects } from "@std/assert";
import { model as account } from "./account.ts";
import { model as alertPolicy } from "./alert_policy.ts";
import { model as dashboard } from "./dashboard.ts";
import { model as mutingRule } from "./muting_rule.ts";
import {
  mockContext,
  stubFetch,
  stubFetchQueue,
  withFetchRestore,
} from "./test_helpers.ts";

const ok = (data: unknown) => () =>
  new Response(JSON.stringify({ data }), { status: 200 });

Deno.test(
  "account discoverAll writes one accounts instance per account",
  withFetchRestore(async () => {
    stubFetch({
      actor: { accounts: [{ id: 1, name: "a" }, { id: 2, name: "b" }] },
    });
    const { ctx, written } = mockContext();
    await account.methods.discoverAll.execute({}, ctx);
    const items = written.filter((w) => w.spec === "accounts");
    assertEquals(items.map((w) => [w.spec, w.name]), [
      ["accounts", "1"],
      ["accounts", "2"],
    ]);
    const summary = written.find((w) => w.spec === "discovery");
    assertEquals(summary?.name, "last-run");
    assertEquals(summary?.data.truncated, false);
    assertEquals(summary?.data.count, 2);
  }),
);

Deno.test(
  "discoverAll follows nextCursor across pages",
  withFetchRestore(async () => {
    const counter = stubFetchQueue([
      ok({
        actor: {
          account: {
            alerts: {
              policiesSearch: {
                policies: [{
                  id: "1",
                  name: "p1",
                  incidentPreference: "PER_POLICY",
                }],
                nextCursor: "c1",
              },
            },
          },
        },
      }),
      ok({
        actor: {
          account: {
            alerts: {
              policiesSearch: {
                policies: [{
                  id: "2",
                  name: "p2",
                  incidentPreference: "PER_POLICY",
                }],
                nextCursor: null,
              },
            },
          },
        },
      }),
    ]);
    const { ctx, written } = mockContext();
    await alertPolicy.methods.discoverAll.execute({}, ctx);
    assertEquals(counter.calls, 2);
    const items = written.filter((w) => w.spec === "state");
    assertEquals(items.map((w) => [w.spec, w.name]), [
      ["state", "1"],
      ["state", "2"],
    ]);
  }),
);

Deno.test(
  "unpaginated discoverAll (muting rules) writes every rule",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        account: {
          alerts: {
            mutingRules: [
              { id: "9", name: "m", enabled: true },
            ],
          },
        },
      },
    });
    const { ctx, written } = mockContext();
    await mutingRule.methods.discoverAll.execute({}, ctx);
    assertEquals(written[0].name, "9");
  }),
);

Deno.test(
  "dashboard tag adds tags and merges them into state",
  withFetchRestore(async () => {
    stubFetch({ taggingAddTagsToEntity: { errors: [] } });
    const { ctx, written } = mockContext({
      current: { guid: "g1", name: "D" },
    });
    const tags = [{ key: "team", values: ["sre"] }];
    await dashboard.methods.tag.execute({ tags }, ctx);
    assertEquals(written[0].data, { guid: "g1", name: "D", tags });
  }),
);

Deno.test(
  "dashboard tag throws without stored guid",
  withFetchRestore(async () => {
    const { ctx } = mockContext();
    await assertRejects(
      () =>
        dashboard.methods.tag.execute(
          { tags: [{ key: "k", values: ["v"] }] },
          ctx,
        ),
      Error,
      "no stored dashboard state",
    );
  }),
);

Deno.test(
  "dashboard tag throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({ taggingAddTagsToEntity: { errors: [{ message: "nope" }] } });
    const { ctx } = mockContext({ current: { guid: "g1", name: "D" } });
    await assertRejects(
      () =>
        dashboard.methods.tag.execute(
          { tags: [{ key: "k", values: ["v"] }] },
          ctx,
        ),
      Error,
      "taggingAddTagsToEntity failed",
    );
  }),
);

Deno.test(
  "getDefinition writes a definition instance, throws when missing",
  withFetchRestore(async () => {
    stubFetch({ actor: { entity: { guid: "g1", name: "D", pages: [] } } });
    const { ctx, written } = mockContext();
    await dashboard.methods.getDefinition.execute({ guid: "g1" }, ctx);
    assertEquals([written[0].spec, written[0].name], ["definition", "g1"]);

    stubFetch({ actor: { entity: null } });
    await assertRejects(
      () => dashboard.methods.getDefinition.execute({ guid: "g2" }, ctx),
      Error,
      "not found",
    );
  }),
);

Deno.test(
  "getDefinitions records failed chunks and keeps going",
  withFetchRestore(async () => {
    const guids = Array.from({ length: 30 }, (_, i) => `g${i}`);
    stubFetchQueue([
      // First chunk (25 guids) fails at GraphQL level, second succeeds with one
      // entity and one null (not found).
      () =>
        new Response(JSON.stringify({ errors: [{ message: "bad guid" }] }), {
          status: 200,
        }),
      ok({
        actor: { entities: [{ guid: "g25", name: "D" }, null] },
      }),
    ]);
    const { ctx, written } = mockContext();
    await dashboard.methods.getDefinitions.execute({ guids }, ctx);
    assertEquals(written.map((w) => [w.spec, w.name]), [
      ["definition", "g25"],
      ["definitionFailures", "last-run"],
    ]);
    const failures = written[1].data.failedChunks as { guids: string[] }[];
    assertEquals(failures[0].guids.length, 25);
  }),
);

Deno.test(
  "getDefinition throws when the guid is not a dashboard entity",
  withFetchRestore(async () => {
    stubFetch({ actor: { entity: { __typename: "AlertPolicyEntity" } } });
    const { ctx } = mockContext();
    await assertRejects(
      () => dashboard.methods.getDefinition.execute({ guid: "g1" }, ctx),
      Error,
      "not found",
    );
  }),
);

Deno.test(
  "getDefinitions rethrows when every chunk fails",
  withFetchRestore(async () => {
    stubFetchQueue([
      () =>
        new Response(
          JSON.stringify({ errors: [{ message: "unauthorized" }] }),
          { status: 200 },
        ),
    ]);
    const { ctx } = mockContext();
    await assertRejects(
      () => dashboard.methods.getDefinitions.execute({ guids: ["g1"] }, ctx),
      Error,
      "all 1 chunk(s) failed",
    );
  }),
);
