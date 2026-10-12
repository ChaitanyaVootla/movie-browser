import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const requirePgUserId = vi.fn();
const getTasteProfile = vi.fn();
const getProfileTaste = vi.fn();
const fetchUserById = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => auth() }));
vi.mock("@/lib/user-id", () => ({ requirePgUserId: () => requirePgUserId() }));
vi.mock("@/lib/logger", () => ({ dataLogger: { warn: vi.fn() } }));
vi.mock("@/server/services/taste", () => ({
  getTasteProfile: (...a: unknown[]) => getTasteProfile(...a),
  getProfileTaste: (...a: unknown[]) => getProfileTaste(...a),
}));
vi.mock("@/server/db/postgres/social/taste-recs", () => ({
  fetchUserById: (...a: unknown[]) => fetchUserById(...a),
}));

import { getViewerHasTasteProfile } from "./taste-explore";

describe("getViewerHasTasteProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "g" } });
    requirePgUserId.mockResolvedValue(7);
  });

  it("is false when signed out, without touching the taste service", async () => {
    auth.mockResolvedValue(null);
    await expect(getViewerHasTasteProfile()).resolves.toBe(false);
    expect(getTasteProfile).not.toHaveBeenCalled();
  });

  it("is true once the FULL profile has enough positives for a centroid", async () => {
    getTasteProfile.mockResolvedValue({ positiveCount: 3 });
    await expect(getViewerHasTasteProfile()).resolves.toBe(true);
    expect(getTasteProfile).toHaveBeenCalledWith(7, { scope: "full" });
  });

  it("is false for a cold profile or no row", async () => {
    getTasteProfile.mockResolvedValue({ positiveCount: 2 });
    await expect(getViewerHasTasteProfile()).resolves.toBe(false);
    getTasteProfile.mockResolvedValue(null);
    await expect(getViewerHasTasteProfile()).resolves.toBe(false);
  });

  it("fails closed (false) when the taste read throws", async () => {
    getTasteProfile.mockRejectedValue(new Error("db down"));
    await expect(getViewerHasTasteProfile()).resolves.toBe(false);
  });
});
