import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cacheStore, logMock } = vi.hoisted(() => ({
  cacheStore: new Map<string, unknown>(),
  logMock: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({ dataLogger: logMock }));

vi.mock("@/lib/cache", () => ({
  cacheGet: (ns: string, key: string) => cacheStore.get(`${ns}:${key}`),
  cacheSet: (ns: string, key: string, value: unknown) => {
    cacheStore.set(`${ns}:${key}`, value);
  },
}));

import {
  classifyDislikeStatus,
  dislikeCountToStore,
  getVideoDislike,
  getVideoDislikes,
  lookupVideoDislike,
  DISLIKE_BACKOFF_MS,
  __resetDislikeStateForTests,
} from "./youtube-dislike";

const VID = "dQw4w9WgXcQ";
const VID2 = "oonJeN3iaDY";

function okResponse(dislikes: number): Response {
  return new Response(
    JSON.stringify({
      id: VID,
      dateCreated: "2026-01-01T00:00:00Z",
      likes: 10,
      dislikes,
      rating: 4.5,
      viewCount: 100,
      deleted: false,
    }),
    { status: 200 }
  );
}

describe("classifyDislikeStatus", () => {
  it("treats unknown / invalid video ids as unavailable", () => {
    expect(classifyDislikeStatus(404)).toBe("unavailable");
    expect(classifyDislikeStatus(400)).toBe("unavailable");
  });

  it("treats rate limits and server errors as backoff", () => {
    expect(classifyDislikeStatus(429)).toBe("backoff");
    expect(classifyDislikeStatus(500)).toBe("backoff");
    expect(classifyDislikeStatus(503)).toBe("backoff");
  });

  it("treats other statuses as unexpected errors", () => {
    expect(classifyDislikeStatus(401)).toBe("error");
    expect(classifyDislikeStatus(418)).toBe("error");
  });
});

describe("dislikeCountToStore", () => {
  it("stores the count on success, 0 for an unknown video, nothing on a transient failure", () => {
    expect(
      dislikeCountToStore({
        status: "ok",
        data: {
          id: VID,
          dateCreated: "",
          likes: 1,
          dislikes: 7,
          rating: 4,
          viewCount: 1,
          deleted: false,
        },
      })
    ).toBe(7);
    expect(dislikeCountToStore({ status: "unavailable" })).toBe(0);
    expect(dislikeCountToStore({ status: "failed" })).toBeUndefined();
  });
});

describe("lookupVideoDislike", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cacheStore.clear();
    __resetDislikeStateForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.values(logMock).forEach((m) => m.mockClear());
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    consoleError.mockRestore();
  });

  function expectNoErrorLogs(): void {
    expect(consoleError).not.toHaveBeenCalled();
    expect(logMock.error).not.toHaveBeenCalled();
  }

  it("returns and caches a successful lookup", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(42));

    expect(await lookupVideoDislike(VID)).toMatchObject({ status: "ok", data: { dislikes: 42 } });
    expect(await getVideoDislike(VID)).toMatchObject({ dislikes: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logMock.warn).not.toHaveBeenCalled();
    expectNoErrorLogs();
  });

  it("404 → unavailable, negative-cached, debug only, not re-fetched", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    expect(await lookupVideoDislike(VID)).toEqual({ status: "unavailable" });
    expect(await lookupVideoDislike(VID)).toEqual({ status: "unavailable" });
    expect(await getVideoDislike(VID)).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logMock.debug).toHaveBeenCalledTimes(1);
    expect(logMock.warn).not.toHaveBeenCalled();
    expectNoErrorLogs();
  });

  it("an invalid video id never reaches the API", async () => {
    expect(await lookupVideoDislike("not a video id")).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("429 → failed, NOT cached per video, warns once, then skips RYD for the backoff window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValue(new Response("Too Many Requests", { status: 429 }));

    expect(await lookupVideoDislike(VID)).toEqual({ status: "failed" });
    expect(await lookupVideoDislike(VID2)).toEqual({ status: "failed" });
    expect((await getVideoDislikes([VID, VID2])).size).toBe(0);

    expect(fetchMock).toHaveBeenCalledTimes(1); // later calls short-circuit
    expect(logMock.warn).toHaveBeenCalledTimes(1);
    expect(logMock.warn.mock.calls[0]?.[0]).toMatchObject({
      event: "youtube_dislike_backoff",
      cause: "http_429",
    });
    expect(cacheStore.size).toBe(0); // a rate limit must not poison the per-video cache
    expectNoErrorLogs();

    // After the window, the API is asked again.
    vi.setSystemTime(Date.now() + DISLIKE_BACKOFF_MS + 1);
    fetchMock.mockResolvedValueOnce(okResponse(3));
    expect(await lookupVideoDislike(VID)).toMatchObject({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failure after the window expires opens a new window and warns again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));

    await lookupVideoDislike(VID);
    vi.setSystemTime(Date.now() + DISLIKE_BACKOFF_MS + 1);
    await lookupVideoDislike(VID);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(logMock.warn).toHaveBeenCalledTimes(2);
  });

  it("timeouts / network errors → failed + backoff, never an error log", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeout);

    expect(await lookupVideoDislike(VID)).toEqual({ status: "failed" });
    expect(await lookupVideoDislike(VID2)).toEqual({ status: "failed" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logMock.warn).toHaveBeenCalledTimes(1);
    expect(logMock.warn.mock.calls[0]?.[0]).toMatchObject({ cause: "timeout" });
    expect(cacheStore.size).toBe(0);
    expectNoErrorLogs();
  });

  it("concurrent lookups for the same video share one request", async () => {
    let resolve: (r: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (resolve = r)));

    const a = lookupVideoDislike(VID);
    const b = lookupVideoDislike(VID);
    resolve(okResponse(5));

    expect(await a).toMatchObject({ status: "ok" });
    expect(await b).toMatchObject({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an unexpected status warns but does not open a backoff", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    fetchMock.mockResolvedValueOnce(okResponse(1));

    expect(await lookupVideoDislike(VID)).toEqual({ status: "failed" });
    expect(await lookupVideoDislike(VID2)).toMatchObject({ status: "ok" });
    expect(logMock.warn).toHaveBeenCalledTimes(1);
    expect(logMock.warn.mock.calls[0]?.[0]).toMatchObject({ event: "youtube_dislike_error" });
  });
});
