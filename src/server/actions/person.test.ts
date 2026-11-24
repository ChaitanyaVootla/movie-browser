import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getPersonDetailsMock, logMock } = vi.hoisted(() => ({
  getPersonDetailsMock: vi.fn(),
  logMock: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/server/services/tmdb", () => ({
  getPersonDetails: getPersonDetailsMock,
  getPersonBasicInfo: vi.fn(),
  searchPerson: vi.fn(),
}));
vi.mock("@/server/services/person-persist", () => ({ persistPersonDetails: vi.fn() }));
vi.mock("@/lib/logger", () => ({ dataLogger: logMock }));

import { getPerson } from "./person";

describe("getPerson logging", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getPersonDetailsMock.mockReset();
    Object.values(logMock).forEach((m) => m.mockClear());
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("TMDB 404 → null, logged at info, not as an error", async () => {
    getPersonDetailsMock.mockRejectedValueOnce(new Error("TMDB API error: 404 Not Found"));

    expect(await getPerson(123)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    expect(logMock.info).toHaveBeenCalledWith({ event: "person_tmdb_not_found", id: 123 });
  });

  it("other failures → null, still logged as an error", async () => {
    getPersonDetailsMock.mockRejectedValueOnce(new Error("TMDB API error: 500 Internal Server Error"));

    expect(await getPerson(123)).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});
