import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DiscussionPageHeader } from "./discussion-page-header";

afterEach(cleanup);

describe("DiscussionPageHeader", () => {
  const base = {
    basePath: "/movie/603/the-matrix",
    mediaType: "movie" as const,
    mediaId: 603,
    title: "The Matrix",
    year: 1999,
    publishedCount: 12,
  };

  it("renders an sr-only title heading, year and a back link to the detail page", () => {
    render(<DiscussionPageHeader {...base} />);
    // The visual title is the logo image; the canonical heading is sr-only.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The Matrix discussion");
    expect(screen.getByText("1999")).toBeTruthy();
    const back = screen.getByText(/Back to The Matrix/i).closest("a");
    expect(back?.getAttribute("href")).toBe("/movie/603/the-matrix");
  });

  it("renders the title logo via HeroLogoShell (CDN logo by id, title as alt)", () => {
    render(<DiscussionPageHeader {...base} />);
    const logo = screen.getByTestId("hero-logo").querySelector("img");
    expect(logo?.getAttribute("src")).toBe(
      "https://image.themoviebrowser.com/movie/603/logo.webp"
    );
    expect(logo?.getAttribute("alt")).toBe("The Matrix");
  });

  it("renders the deterministic CDN backdrop by media type + id", () => {
    const { container } = render(<DiscussionPageHeader {...base} />);
    // First <img> is the backdrop (aria-hidden); the logo follows.
    const img = container.querySelector("img[aria-hidden]");
    expect(img?.getAttribute("src")).toBe(
      "https://image.themoviebrowser.com/movie/603/backdrop.webp"
    );
  });

  it("uses the series CDN path for a series anchor", () => {
    const { container } = render(
      <DiscussionPageHeader {...base} mediaType="series" mediaId={1396} title="Breaking Bad" />
    );
    const img = container.querySelector("img[aria-hidden]");
    expect(img?.getAttribute("src")).toBe(
      "https://image.themoviebrowser.com/series/1396/backdrop.webp"
    );
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
});
