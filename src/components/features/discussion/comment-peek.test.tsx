import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CommentPeek } from "./comment-peek";
import type { CommentPeekDto } from "@/server/db/postgres/comments";

afterEach(cleanup);

const peek = (over: Partial<CommentPeekDto> = {}): CommentPeekDto => ({
  id: 1,
  snippet: "This finale was perfect",
  likeCount: 4,
  isCue: false,
  author: { username: "ada", name: "Ada", image: null, avatarUrl: null, accent: "default" },
  ...over,
});

const href = "/series/1396/breaking-bad/discussions";

describe("CommentPeek", () => {
  it("shows an inviting 'Start the discussion' CTA when there are no comments", () => {
    render(<CommentPeek peeks={[]} publishedCount={0} dedicatedHref={href} />);
    expect(screen.getByText("Start the discussion")).toBeTruthy();
    expect(screen.queryByText(/Join the discussion/)).toBeNull();
  });

  it("renders the top comment snippet + a join CTA with the count", () => {
    render(<CommentPeek peeks={[peek()]} publishedCount={12} dedicatedHref={href} />);
    expect(screen.getByText("This finale was perfect")).toBeTruthy();
    expect(screen.getByText("12 comments")).toBeTruthy();
    expect(screen.getByText("Join the discussion")).toBeTruthy();
  });

  it("links the whole card to the dedicated page with NO nested anchors", () => {
    const { container } = render(
      <CommentPeek peeks={[peek()]} publishedCount={5} dedicatedHref={href} />
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute("href")).toBe(href);
    expect(anchors[0].hasAttribute("data-discussion-strip")).toBe(true);
    expect(anchors[0].querySelector("a")).toBeNull();
  });

  it("renders the author handle as plain text (not a /u/ link → no nested anchor)", () => {
    const { container } = render(
      <CommentPeek peeks={[peek()]} publishedCount={5} dedicatedHref={href} />
    );
    expect(screen.getByText("@ada")).toBeTruthy();
    expect(container.querySelector('a[href="/u/ada"]')).toBeNull();
  });

  it("singularizes a single comment", () => {
    render(<CommentPeek peeks={[peek()]} publishedCount={1} dedicatedHref={href} />);
    expect(screen.getByText("1 comment")).toBeTruthy();
  });
});
