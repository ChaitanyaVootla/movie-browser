import { describe, it, expect } from "vitest";
import { mergeLikesPayload, likesBatchMessage } from "./likes-batch";

describe("mergeLikesPayload", () => {
  it("starts a fresh payload from no prior row", () => {
    const next = mergeLikesPayload(null, { actorName: "Ada", commentId: 9, url: "/x" });
    expect(next.count).toBe(1);
    expect(next.sampleActor).toBe("Ada");
    expect(next.commentId).toBe(9);
  });

  it("increments the count and keeps the newest actor as the sample", () => {
    const first = mergeLikesPayload(null, { actorName: "Ada", commentId: 9, url: "/x" });
    const second = mergeLikesPayload(first, { actorName: "Bea", commentId: 9, url: "/x" });
    expect(second.count).toBe(2);
    expect(second.sampleActor).toBe("Bea");
  });
});

describe("likesBatchMessage", () => {
  it("renders a single liker", () => {
    expect(likesBatchMessage({ count: 1, sampleActor: "Ada", commentId: 9, url: "/x" })).toBe(
      "Ada liked your comment"
    );
  });
  it("renders Ada + N others for many likers", () => {
    expect(likesBatchMessage({ count: 4, sampleActor: "Ada", commentId: 9, url: "/x" })).toBe(
      "Ada + 3 others liked your comment"
    );
  });
});
