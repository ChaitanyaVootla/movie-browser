import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("NotificationType enum", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const block = schema.slice(schema.indexOf("enum NotificationType"));
  const body = block.slice(0, block.indexOf("}"));

  it("includes EPISODE_DROP (a show-I-track new-episode signal)", () => {
    expect(body).toContain("EPISODE_DROP");
  });

  it("includes LIKES_BATCH (coalesced likes-on-my-comment)", () => {
    expect(body).toContain("LIKES_BATCH");
  });

  it("keeps the existing REPLY/MENTION/FOLLOW values", () => {
    expect(body).toContain("REPLY");
    expect(body).toContain("MENTION");
    expect(body).toContain("FOLLOW");
  });
});
