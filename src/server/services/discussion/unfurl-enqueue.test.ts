import { describe, it, expect, vi } from "vitest";
import { unfurlFirstLink } from "./unfurl";

// unfurlFirstLink: given a published comment body, enqueue the first link (if any).
describe("unfurlFirstLink", () => {
  it("enqueues the first link in a body", async () => {
    const enqueue = vi.fn(async () => {});
    await unfurlFirstLink("check https://example.com/a out", enqueue);
    expect(enqueue).toHaveBeenCalledWith("https://example.com/a");
  });
  it("does nothing when there is no link", async () => {
    const enqueue = vi.fn(async () => {});
    await unfurlFirstLink("no links", enqueue);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
