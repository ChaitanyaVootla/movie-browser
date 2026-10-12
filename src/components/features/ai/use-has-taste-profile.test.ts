import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewerHasTasteProfile = vi.fn();
vi.mock("@/server/actions/taste-explore", () => ({
  getViewerHasTasteProfile: () => getViewerHasTasteProfile(),
}));

import { useTasteUiStore } from "@/stores/taste-ui";
import { resetTasteProfileLookup, useHasTasteProfile } from "./use-has-taste-profile";

const DETAIL = "/movie/157336/interstellar";

describe("useHasTasteProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTasteProfileLookup();
    useTasteUiStore.setState({ hasProfile: false, reason: null });
  });

  it("uses the home island's published flag without a request", () => {
    useTasteUiStore.setState({ hasProfile: true, reason: "ok" });
    const { result } = renderHook(() => useHasTasteProfile(true, DETAIL));
    expect(result.current).toBe(true);
    expect(getViewerHasTasteProfile).not.toHaveBeenCalled();
  });

  it("asks the server once on a directly-loaded detail page", async () => {
    getViewerHasTasteProfile.mockResolvedValue(true);
    const a = renderHook(() => useHasTasteProfile(true, DETAIL));
    const b = renderHook(() => useHasTasteProfile(true, "/series/1399/game-of-thrones"));
    await waitFor(() => expect(a.result.current).toBe(true));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(getViewerHasTasteProfile).toHaveBeenCalledTimes(1);
  });

  it("never asks for guests or off detail pages", async () => {
    renderHook(() => useHasTasteProfile(false, DETAIL));
    renderHook(() => useHasTasteProfile(true, "/u/cinephile_ada"));
    await act(async () => {});
    expect(getViewerHasTasteProfile).not.toHaveBeenCalled();
  });

  it("trusts a known 'no profile' from home over the lookup", async () => {
    useTasteUiStore.setState({ hasProfile: false, reason: "cold_start" });
    const { result } = renderHook(() => useHasTasteProfile(true, DETAIL));
    await act(async () => {});
    expect(result.current).toBe(false);
    expect(getViewerHasTasteProfile).not.toHaveBeenCalled();
  });
});
