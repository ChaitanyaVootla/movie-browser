import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

// Compile-time guard: the generated client must expose the new model + columns.
// (No DB needed — this fails to typecheck/run until schema is pushed & generated.)
describe("CommentEntityMention schema", () => {
  it("exposes typed anchor columns on the create input", () => {
    const sample: Prisma.CommentEntityMentionCreateManyInput = {
      commentId: 1,
      movieId: 550,
      seriesId: null,
      personId: null,
      seasonNumber: null,
      episodeNumber: null,
    };
    expect(sample.commentId).toBe(1);
    expect(sample.movieId).toBe(550);
  });

  it("exposes attachment columns on the comment create input", () => {
    const c: Prisma.CommentUncheckedCreateInput = {
      body: "x",
      attachmentEntityType: "movie",
      attachmentMovieId: 550,
      attachmentImagePath: "/abc.jpg",
    };
    expect(c.attachmentMovieId).toBe(550);
  });
});
