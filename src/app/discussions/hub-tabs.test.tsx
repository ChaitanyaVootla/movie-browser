import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { getHubFollowing } = vi.hoisted(() => ({ getHubFollowing: vi.fn() }));
vi.mock("@/server/actions/discussions-hub", () => ({ getHubFollowing }));
vi.mock("./hub-thread-card", () => ({
  HubThreadCard: ({ card }: { card: { id: string; body: string } }) => <div>{card.body}</div>,
}));
vi.mock("@/components/features/discussion/audience-filter-slot", () => ({
  AudienceFilterSlot: () => null,
}));

import { HubTabs, hubTabFromSearch } from "./hub-tabs";
import type { HubThreadCard as Card } from "@/server/db/postgres/social/discussion-hub";

const card = (id: string, body: string) => ({ id, body }) as unknown as Card;

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  cleanup();
  getHubFollowing.mockReset();
  window.history.replaceState(null, "", "/discussions");
});

describe("hubTabFromSearch", () => {
  it("parses ?tab and defaults to hot", () => {
    expect(hubTabFromSearch("")).toBe("hot");
    expect(hubTabFromSearch("?tab=new")).toBe("new");
    expect(hubTabFromSearch("?tab=following")).toBe("following");
    expect(hubTabFromSearch("?tab=junk")).toBe("hot");
  });
});

describe("HubTabs", () => {
  it("renders Hot by default and never fetches viewer data for it", () => {
    render(wrap(<HubTabs initialHot={[card("1", "hot thread")]} initialNew={[card("2", "new thread")]} />));
    expect(screen.getByText("hot thread")).toBeInTheDocument();
    expect(getHubFollowing).not.toHaveBeenCalled();
  });

  it("adopts the URL tab after mount (Back into ?tab=new)", async () => {
    window.history.replaceState(null, "", "/discussions?tab=new");
    render(wrap(<HubTabs initialHot={[card("1", "hot thread")]} initialNew={[card("2", "new thread")]} />));
    expect(await screen.findByText("new thread")).toBeInTheDocument();
  });

  it("writes the tab to the URL without a new history entry; Following is client-fetched", async () => {
    getHubFollowing.mockResolvedValue({ cards: [card("3", "followed thread")], nextCursor: null });
    const before = window.history.length;
    render(wrap(<HubTabs initialHot={[]} initialNew={[]} />));
    fireEvent.click(screen.getByRole("tab", { name: "Following" }));
    expect(await screen.findByText("followed thread")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=following");
    expect(window.history.length).toBe(before);
    expect(getHubFollowing).toHaveBeenCalledWith({ cursor: null });

    fireEvent.click(screen.getByRole("tab", { name: "Hot" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});
