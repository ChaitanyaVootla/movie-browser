import { describe, it, expect } from "vitest";
import { toCommentDto } from "./comments";

const base = {
  id: 1, parentId: null, body: "hi", spoilerScope: "NONE", scopeSeason: null,
  scopeEpisode: null, scopeTmdbEpisodeId: null, status: "PUBLISHED", likeCount: 3,
  createdAt: new Date("2026-06-15T00:00:00Z"), editedAt: null, aiLabels: null,
  userId: 7, movieId: 550, seriesId: null, seasonNumber: null, episodeNumber: null,
  listId: null, circleId: null,
  attachmentEntityType: "movie", attachmentMovieId: 550, attachmentSeriesId: null,
  attachmentPersonId: null, attachmentImagePath: "/abc.jpg",
  user: { id: 7, username: "ada", name: "Ada", image: null },
  entityMentions: [] as never[],
};

describe("toCommentDto attachment", () => {
  it("maps a TMDB attachment into the DTO", () => {
    const dto = toCommentDto(base as never);
    expect(dto.attachment).toEqual({ entityType: "movie", tmdbId: 550, imagePath: "/abc.jpg" });
    expect(dto.likeCount).toBe(3);
  });
  it("nulls attachment on a deleted comment (scrubbed)", () => {
    const dto = toCommentDto({ ...base, status: "DELETED_BY_USER" } as never);
    expect(dto.attachment).toBeNull();
    expect(dto.body).toBe("");
  });
});
