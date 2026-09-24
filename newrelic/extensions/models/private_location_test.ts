import { assertEquals, assertRejects } from "@std/assert";
import { model } from "./private_location.ts";
import {
  mockContext,
  stubFetch,
  stubFetchErrors,
  withFetchRestore,
} from "./test_helpers.ts";

Deno.test(
  "create stores private location",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsCreatePrivateLocation: {
        guid: "g1",
        name: "DC1",
        key: "k1",
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.create.execute({ name: "DC1" }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "create throws on mutation errors",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsCreatePrivateLocation: {
        guid: null,
        errors: [{ description: "dup", type: "x" }],
      },
    });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.create.execute({ name: "DC1" }, ctx),
      Error,
      "syntheticsCreatePrivateLocation failed",
    );
  }),
);

Deno.test(
  "update stores updated location",
  withFetchRestore(async () => {
    stubFetch({
      syntheticsUpdatePrivateLocation: {
        guid: "g1",
        name: "DC1",
        description: "updated",
        errors: [],
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.update.execute(
      { guid: "g1", description: "updated" },
      ctx,
    );
    assertEquals(written[0].data.description, "updated");
  }),
);

Deno.test(
  "delete removes state",
  withFetchRestore(async () => {
    stubFetch({ syntheticsDeletePrivateLocation: { errors: [] } });
    const { ctx, deleted } = mockContext();
    await model.methods.delete.execute({ guid: "g1" }, ctx);
    assertEquals(deleted, ["current"]);
  }),
);

Deno.test(
  "lookup by name via entity search",
  withFetchRestore(async () => {
    stubFetch({
      actor: {
        entitySearch: {
          results: { entities: [{ guid: "g1", name: "DC1", accountId: 1 }] },
        },
      },
    });
    const { ctx, written } = mockContext();
    await model.methods.lookup.execute({ name: "DC1" }, ctx);
    assertEquals(written[0].data.guid, "g1");
  }),
);

Deno.test(
  "lookup throws when not found",
  withFetchRestore(async () => {
    stubFetch({ actor: { entitySearch: { results: { entities: [] } } } });
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ name: "gone" }, ctx),
      Error,
      "No private location",
    );
  }),
);

Deno.test(
  "throws on GraphQL errors",
  withFetchRestore(async () => {
    stubFetchErrors([{ message: "nope" }]);
    const { ctx } = mockContext();
    await assertRejects(
      () => model.methods.lookup.execute({ guid: "g1" }, ctx),
      Error,
      "nope",
    );
  }),
);
