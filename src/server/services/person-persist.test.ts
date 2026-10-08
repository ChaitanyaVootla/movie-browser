import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const createMany = vi.fn();
vi.mock("@/server/db/postgres", () => ({
  prisma: { person: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a), createMany: (...a: unknown[]) => createMany(...a) } },
}));

import { buildPersonDetail, changedPersonFields, persistPersonDetails } from "./person-persist";

const tmdb = {
  id: 6193,
  name: "Leonardo DiCaprio",
  biography: "Bio",
  birthday: "1974-11-11",
  deathday: null,
  place_of_birth: "Los Angeles",
  gender: 2,
  homepage: null,
  known_for_department: "Acting",
  profile_path: "/x.jpg",
  popularity: 40.1,
  adult: false,
};

const stored = {
  name: "Leonardo DiCaprio",
  biography: "Bio",
  birthday: new Date("1974-11-11"),
  deathday: null,
  placeOfBirth: "Los Angeles",
  gender: 2,
  homepage: null,
  knownFor: "Acting",
  profilePath: "/x.jpg",
  adult: false,
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  createMany.mockReset();
});

describe("persistPersonDetails (change-detected)", () => {
  it("unchanged person → one read, ZERO writes (was an UPDATE on every render)", async () => {
    findUnique.mockResolvedValue(stored);
    await persistPersonDetails(tmdb);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it("writes only the changed fields", async () => {
    findUnique.mockResolvedValue({ ...stored, biography: null, profilePath: "/old.jpg" });
    await persistPersonDetails(tmdb);
    expect(update).toHaveBeenCalledWith({
      where: { tmdbId: 6193 },
      data: { biography: "Bio", profilePath: "/x.jpg" },
    });
  });

  it("missing row → race-safe create (skipDuplicates) incl. popularity", async () => {
    findUnique.mockResolvedValue(null);
    await persistPersonDetails(tmdb);
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: [expect.objectContaining({ tmdbId: 6193, popularity: 40.1, name: "Leonardo DiCaprio" })],
      }),
    );
  });

  it("never throws", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    await expect(persistPersonDetails(tmdb)).resolves.toBeUndefined();
    await expect(persistPersonDetails({ id: "x" })).resolves.toBeUndefined();
  });
});

describe("changedPersonFields", () => {
  it("never clobbers a backfilled adult=true when TMDB omits the field", () => {
    const built = buildPersonDetail({ ...tmdb, adult: undefined });
    expect(built).not.toBeNull();
    expect(changedPersonFields({ ...stored, adult: true }, built!.detail)).toEqual({});
  });

  it("compares dates by value", () => {
    const built = buildPersonDetail({ ...tmdb, birthday: "1974-11-12" });
    expect(changedPersonFields(stored, built!.detail)).toEqual({ birthday: new Date("1974-11-12") });
  });
});
