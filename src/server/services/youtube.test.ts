import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cacheStore, logMock } = vi.hoisted(() => {
  process.env.YOUTUBE_API_KEY = "test-key";
  return {
    cacheStore: new Map<string, unknown>(),
    logMock: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  };
});

vi.mock("@/lib/logger", () => ({ dataLogger: logMock }));

vi.mock("@/lib/cache", () => ({
  cacheGet: (ns: string, key: string) => cacheStore.get(`${ns}:${key}`),
  cacheSet: (ns: string, key: string, value: unknown) => {
    cacheStore.set(`${ns}:${key}`, value);
  },
  cachedFetch: async (_ns: string, _key: string, fn: () => Promise<unknown>) => fn(),
}));

import {
  classifyYouTubeError,
  getVideoComments,
  getVideoStats,
  __resetYouTubeQuotaBackoffForTests,
} from "./youtube";

function errorResponse(status: number, reason?: string): Response {
  const body = reason ? { error: { code: status, errors: [{ reason }] } } : { error: { code: status } };
  return new Response(JSON.stringify(body), { status });
}

describe("classifyYouTubeError", () => {
  it("treats commentsDisabled / videoNotFound / forbidden as unavailable", () => {
    expect(classifyYouTubeError(403, "commentsDisabled")).toBe("unavailable");
    expect(classifyYouTubeError(404, "videoNotFound")).toBe("unavailable");
    expect(classifyYouTubeError(403, "forbidden")).toBe("unavailable");
    expect(classifyYouTubeError(403, null)).toBe("unavailable");
  });

  it("treats quota / rate limits as quota — a 403 is NOT always commentsDisabled", () => {
    expect(classifyYouTubeError(403, "quotaExceeded")).toBe("quota");
    expect(classifyYouTubeError(403, "dailyLimitExceeded")).toBe("quota");
    expect(classifyYouTubeError(403, "rateLimitExceeded")).toBe("quota");
    expect(classifyYouTubeError(429, null)).toBe("quota");
  });

  it("treats everything else as a real error", () => {
    expect(classifyYouTubeError(500, null)).toBe("error");
    expect(classifyYouTubeError(400, "invalidParameter")).toBe("error");
  });
});

describe("getVideoComments error handling", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cacheStore.clear();
    __resetYouTubeQuotaBackoffForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.values(logMock).forEach((m) => m.mockClear());
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleError.mockRestore();
  });

  it.each([
    [404, "videoNotFound"],
    [403, "commentsDisabled"],
  ])("%i %s → empty result, cached, no error log, no refetch", async (status, reason) => {
    fetchMock.mockResolvedValueOnce(errorResponse(status, reason));

    const first = await getVideoComments("vid1", 20);
    const second = await getVideoComments("vid1", 20);

    expect(first).toEqual({ comments: [], totalCount: 0 });
    expect(second).toEqual({ comments: [], totalCount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    expect(logMock.error).not.toHaveBeenCalled();
    expect(logMock.warn).not.toHaveBeenCalled();
  });

  it("quota exhaustion → empty, NOT cached, warns once, then skips the API during backoff", async () => {
    fetchMock.mockResolvedValue(errorResponse(403, "quotaExceeded"));

    expect(await getVideoComments("vidA", 20)).toEqual({ comments: [], totalCount: 0 });
    expect(await getVideoComments("vidB", 20)).toEqual({ comments: [], totalCount: 0 });
    expect((await getVideoStats(["vidC"])).size).toBe(0);

    expect(fetchMock).toHaveBeenCalledTimes(1); // later calls short-circuit
    expect(logMock.warn).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    expect(cacheStore.size).toBe(0); // a quota blip must not poison the per-video cache

    // After the backoff the API is called again.
    __resetYouTubeQuotaBackoffForTests();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], pageInfo: { totalResults: 0, resultsPerPage: 20 } }), {
        status: 200,
      })
    );
    await getVideoComments("vidA", 20);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a real failure (5xx) still logs an error and returns the empty shape", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500));

    expect(await getVideoComments("vid5", 20)).toEqual({ comments: [], totalCount: 0 });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(cacheStore.size).toBe(0);
  });
});
