import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiscussionPageHeader } from "./discussion-page-header";

afterEach(cleanup);

describe("DiscussionPageHeader", () => {
  const base = {
    basePath: "/movie/603/the-matrix",
    title: "The Matrix",
    year: 1999,
    posterPath: "/poster.jpg",
    publishedCount: 12,
  };

  it("renders the title, year and a back link to the detail page", () => {
    render(<DiscussionPageHeader {...base} />);
    expect(screen.getByText("The Matrix")).toBeTruthy();
    expect(screen.getByText("1999")).toBeTruthy();
    const back = screen.getByText(/Back to The Matrix/i).closest("a");
    expect(back?.getAttribute("href")).toBe("/movie/603/the-matrix");
  });

  it("prefixes the TMDB image base on the poster path", () => {
    const { container } = render(<DiscussionPageHeader {...base} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("image.tmdb.org");
    expect(img?.getAttribute("src")).toContain("/poster.jpg");
  });

  it("pluralizes the comment count", () => {
    render(<DiscussionPageHeader {...base} publishedCount={1} />);
    expect(screen.getByText("1 comment")).toBeTruthy();
    cleanup();
    render(<DiscussionPageHeader {...base} publishedCount={0} />);
    expect(screen.getByText("0 comments")).toBeTruthy();
  });

  it("shows participant count only when positive", () => {
    const { rerender } = render(<DiscussionPageHeader {...base} participantCount={3} />);
    expect(screen.getByText(/3 people/)).toBeTruthy();
    rerender(<DiscussionPageHeader {...base} participantCount={0} />);
    expect(screen.queryByText(/people/)).toBeNull();
  });

  it("renders without a poster (no path) without crashing", () => {
    const { container } = render(<DiscussionPageHeader {...base} posterPath={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("The Matrix")).toBeTruthy();
  });
});
