import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";

const { useSession } = vi.hoisted(() => ({
  useSession: vi.fn(() => ({ status: "loading" as string })),
}));
vi.mock("next-auth/react", () => ({ useSession }));
vi.mock("@/components/features/auth/sign-in-button", () => ({
  SignInButton: () => <button type="button">Sign in</button>,
}));

import { HubEmptyState } from "./hub-empty-state";

beforeEach(() => {
  useSession.mockClear();
  useSession.mockReturnValue({ status: "loading" });
});
afterEach(cleanup);

describe("HubEmptyState", () => {
  it.each(["hot", "new"] as const)("%s: points somewhere useful, never a dead end", (tab) => {
    render(<HubEmptyState tab={tab} />);
    expect(screen.getByRole("link", { name: /Browse trending titles/ })).toHaveAttribute(
      "href",
      "/browse"
    );
    expect(screen.getByRole("link", { name: /Find a title/ })).toHaveAttribute("href", "/search");
  });

  it("hot/new never read the session (they can be in the force-static HTML)", () => {
    const html = renderToString(<HubEmptyState tab="hot" />);
    expect(html).toContain('href="/browse"');
    expect(useSession).not.toHaveBeenCalled();
  });

  it("following, signed out: offers sign-in", async () => {
    useSession.mockReturnValue({ status: "unauthenticated" });
    render(<HubEmptyState tab="following" />);
    expect(screen.getByText(/Sign in to see discussions/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("following, signed in: links to the library and browse, no sign-in", () => {
    useSession.mockReturnValue({ status: "authenticated" });
    render(<HubEmptyState tab="following" />);
    expect(screen.getByRole("link", { name: "Your library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: /Browse trending titles/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
