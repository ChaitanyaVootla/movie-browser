import { describe, it, expect } from "vitest";
import { describeNotification } from "./describe";
import type { NotificationDto } from "@/server/actions/notifications";

function dto(over: Partial<NotificationDto>): NotificationDto {
  return {
    id: 1,
    type: "REPLY",
    read: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    actor: { id: 2, username: "ada", name: "Ada", image: null },
    payload: {},
    ...over,
  };
}

describe("describeNotification", () => {
  it("describes EPISODE_DROP from the payload title", () => {
    const text = describeNotification(
      dto({ type: "EPISODE_DROP", actor: null, payload: { title: "Severance" } })
    );
    expect(text).toMatch(/Severance/);
    expect(text).toMatch(/discussion is now open/i);
  });

  it("describes a batched-likes notification", () => {
    const text = describeNotification(
      dto({ type: "LIKES_BATCH", actor: null, payload: { count: 3, sampleActor: "Ada" } as never })
    );
    expect(text).toMatch(/Ada/);
    expect(text).toMatch(/2 others/);
  });

  it("falls back to the existing REPLY copy", () => {
    expect(describeNotification(dto({ type: "REPLY", payload: { title: "Heat" } }))).toMatch(
      /replied to your comment/i
    );
  });
});
