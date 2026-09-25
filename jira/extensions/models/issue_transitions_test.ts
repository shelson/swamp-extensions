/**
 * Unit tests for the issue_transitions extension methods.
 */

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  adfParagraph,
  CommentArgsSchema,
  CommentSchema,
} from "./issue_transitions.ts";

Deno.test("adfParagraph: wraps plain text in a minimal ADF doc with one paragraph", () => {
  const result = adfParagraph("The plan is approved.");
  assertEquals(result, {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The plan is approved." },
        ],
      },
    ],
  });
});

Deno.test("adfParagraph: empty string still produces valid ADF", () => {
  const result = adfParagraph("");
  assertEquals(result.type, "doc");
  assertEquals(result.version, 1);
  assertEquals(
    (result.content as Array<Record<string, unknown>>).length,
    1,
  );
});

Deno.test("CommentSchema: validates a complete comment record", () => {
  const record = {
    idOrKey: "KAN-123",
    commentId: "12345",
    body: "Plan summary here",
    commentedAt: "2026-08-21T12:00:00.000Z",
  };
  const parsed = CommentSchema.parse(record);
  assertEquals(parsed.commentId, "12345");
  assertEquals(parsed.body, "Plan summary here");
});

Deno.test("CommentSchema: rejects missing required fields", () => {
  assertThrows(() => CommentSchema.parse({ idOrKey: "KAN-123" }));
  assertThrows(() =>
    CommentSchema.parse({
      idOrKey: "KAN-123",
      commentId: "123",
    })
  );
});

Deno.test("CommentArgsSchema: requires idOrKey and body", () => {
  const valid = CommentArgsSchema.parse({
    idOrKey: "KAN-123",
    body: "A comment",
  });
  assertEquals(valid.body, "A comment");
});

Deno.test("CommentArgsSchema: rejects empty body", () => {
  assertThrows(() =>
    CommentArgsSchema.parse({ idOrKey: "KAN-123", body: "" })
  );
});

Deno.test("CommentArgsSchema: rejects missing idOrKey", () => {
  assertThrows(() =>
    CommentArgsSchema.parse({ body: "A comment" })
  );
});