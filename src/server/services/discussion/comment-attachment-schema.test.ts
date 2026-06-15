import { describe, it, expect } from "vitest";
import { CommentAttachmentSchema, CreateCommentSchema } from "./comment-schemas";

describe("CommentAttachmentSchema", () => {
  it("accepts a movie still attachment", () => {
    const a = CommentAttachmentSchema.parse({ entityType: "movie", tmdbId: 550, imagePath: "/abc.jpg" });
    expect(a.entityType).toBe("movie");
  });
  it("rejects an unknown entity type", () => {
    expect(() => CommentAttachmentSchema.parse({ entityType: "list", tmdbId: 1, imagePath: "/x.jpg" })).toThrow();
  });
  it("CreateCommentSchema accepts an optional attachment + defaults it to null", () => {
    const parsed = CreateCommentSchema.parse({ anchor: { type: "movie", movieId: 1 }, body: "hello there" });
    expect(parsed.attachment).toBeNull();
  });
});
