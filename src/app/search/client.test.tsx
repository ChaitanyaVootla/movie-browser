import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { enhancedSearch, params } = vi.hoisted(() => ({
  enhancedSearch: vi.fn(),
  params: { value: new URLSearchParams() },
}));
vi.mock("@/server/actions/search", () => ({ enhancedSearch }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.value,
  usePathname: () => "/search",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { SearchClient } from "./client";

const result = (id: number, mediaType: "movie" | "series", title: string) => ({
  id,
  mediaType,
  title,
  year: "2010",
  genres: [],
  voteAverage: 8,
  posterPath: null,
});

function renderClient(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchClient initialQuery={query} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  cleanup();
  enhancedSearch.mockReset();
  enhancedSearch.mockResolvedValue({
    results: [result(1, "movie", "Inception"), result(2, "series", "Dark")],
    suggestions: [],
    stats: { hybridResultCount: 2, tmdbResultCount: 0 },
    intent: { extractedFilters: {}, cleanedQuery: "inc" },
  });
});

describe("SearchClient (after the module split)", () => {
  it("restores the type tab from ?type= and keeps the URL in place", async () => {
    params.value = new URLSearchParams("q=inc&type=movie");
    window.history.replaceState(null, "", "/search?q=inc&type=movie");
    const before = window.history.length;
    renderClient("inc");
    const movies = await screen.findByRole("tab", { name: /Movies/ });
    expect(movies).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Dark")).not.toBeInTheDocument();
    expect(screen.getAllByText("Inception").length).toBeGreaterThan(0);
    await waitFor(() => expect(window.location.search).toBe("?q=inc&type=movie"));
    expect(window.history.length).toBe(before); // replaceState, never push
    expect(enhancedSearch).toHaveBeenCalledWith({ query: "inc", page: 1, semantic: false });
  });

  it("defaults to All when ?type is missing or junk", async () => {
    params.value = new URLSearchParams("q=inc&type=nope");
    window.history.replaceState(null, "", "/search?q=inc&type=nope");
    renderClient("inc");
    const all = await screen.findByRole("tab", { name: /All/ });
    expect(all).toHaveAttribute("aria-selected", "true");
  });
});
