import { describe, it, expect } from "vitest";
import { mergeLikesPayload, likesBatchMessage } from "./likes-batch";

describe("mergeLikesPayload", () => {
  it("starts a fresh payload from no prior row", () => {
    const next = mergeLikesPayload(null, {
      actorName: "Ada",
      targetType: "comment",
      commentId: 9,
      url: "/x",
    });
    expect(next.count).toBe(1);
    expect(next.sampleActor).toBe("Ada");
    expect(next.commentId).toBe(9);
    expect(next.targetType).toBe("comment");
  });

  it("increments the count and keeps the newest actor as the sample", () => {
    const first = mergeLikesPayload(null, {
      actorName: "Ada",
      targetType: "comment",
      commentId: 9,
      url: "/x",
    });
    const second = mergeLikesPayload(first, {
      actorName: "Bea",
      targetType: "comment",
      commentId: 9,
      url: "/x",
    });
    expect(second.count).toBe(2);
    expect(second.sampleActor).toBe("Bea");
  });

  it("carries a review target through the batch", () => {
    const next = mergeLikesPayload(null, {
      actorName: "Cy",
      targetType: "review",
      reviewId: 42,
      url: "/r",
    });
    expect(next.targetType).toBe("review");
    expect(next.reviewId).toBe(42);
    expect(next.commentId).toBeUndefined();
  });
});

describe("likesBatchMessage", () => {
  it("renders a single liker on a comment", () => {
    expect(
      likesBatchMessage({ count: 1, sampleActor: "Ada", targetType: "comment", commentId: 9, url: "/x" })
    ).toBe("Ada liked your comment");
  });
  it("renders Ada + N others for many likers on a comment", () => {
    expect(
      likesBatchMessage({ count: 4, sampleActor: "Ada", targetType: "comment", commentId: 9, url: "/x" })
    ).toBe("Ada + 3 others liked your comment");
  });
  it("renders a review-target like line", () => {
    expect(
      likesBatchMessage({ count: 1, sampleActor: "Ada", targetType: "review", reviewId: 42, url: "/r" })
    ).toBe("Ada liked your review");
    expect(
      likesBatchMessage({ count: 3, sampleActor: "Ada", targetType: "review", reviewId: 42, url: "/r" })
    ).toBe("Ada + 2 others liked your review");
  });
});
