import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LinkCard } from "./link-card";
import type { LinkCardLite } from "@/server/db/postgres/comments";

const generic: LinkCardLite = {
  url: "https://example.com/article",
  domain: "example.com",
  status: "OK",
  provider: "GENERIC",
  title: "Great Article",
  description: "All about movies",
  imageUrl: "https://external.cdn/x.jpg", // arbitrary host — must NOT be hotlinked (rung 7 deferred)
  faviconUrl: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
  youtubeId: null,
};

describe("LinkCard", () => {
  it("renders a generic card with title, domain, and a safe outbound link", () => {
    render(<LinkCard card={generic} />);
    expect(screen.getByText("Great Article")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
    const anchor = screen.getByRole("link") as HTMLAnchorElement;
    expect(anchor.getAttribute("rel")).toBe("nofollow ugc noopener noreferrer");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("href")).toBe("https://example.com/article");
  });

  it("does NOT hotlink an arbitrary external og:image (rung 7 deferred)", () => {
    const { container } = render(<LinkCard card={generic} />);
    const img = container.querySelector('img[src="https://external.cdn/x.jpg"]');
    expect(img).toBeNull();
  });

  it("renders the lite-YouTube facade for a YOUTUBE card (no raw iframe at rest)", () => {
    const yt: LinkCardLite = {
      ...generic,
      url: "https://youtu.be/dQw4w9WgXcQ",
      domain: "youtu.be",
      provider: "YOUTUBE",
      youtubeId: "dQw4w9WgXcQ",
      title: null,
      imageUrl: null,
    };
    const { container } = render(<LinkCard card={yt} />);
    expect(container.querySelector("iframe")).toBeNull(); // facade, not raw embed
  });
});
