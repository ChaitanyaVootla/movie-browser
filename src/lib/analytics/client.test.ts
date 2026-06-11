/**
 * Tests for the ClickHouse client's in-process batching transport.
 *
 * The ClickHouse "client" is the raw HTTP interface, so the transport is
 * mocked at the `fetch` boundary. Module state (config cache, buffers,
 * beforeExit hook) is reset between tests via vi.resetModules().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { warnMock, errorMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  dataLogger: {
    warn: warnMock,
    error: errorMock,
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

type ClientModule = typeof import("./client");
type TrackModule = typeof import("./track");

const T0 = new Date("2026-06-11T10:00:00.000Z");
const T0_CLICKHOUSE = "2026-06-11 10:00:00.000";

const okResponse = { ok: true, text: async () => "" } as Response;

let fetchMock: ReturnType<typeof vi.fn>;

async function loadClient(configured = true): Promise<ClientModule> {
  vi.resetModules();
  if (configured) {
    process.env.CLICKHOUSE_HOST = "localhost";
    process.env.CLICKHOUSE_PASSWORD = "test-password";
  } else {
    delete process.env.CLICKHOUSE_HOST;
    delete process.env.CLICKHOUSE_PASSWORD;
  }
  return import("./client");
}

/** Parse the JSONEachRow body of the nth fetch call into row objects */
function fetchRows(callIndex: number): Record<string, unknown>[] {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error(`fetch call ${callIndex} has no string body`);
  }
  return body.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

function fetchUrl(callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex]?.[0]);
}

/** Let pending insert promises settle (microtasks + 0ms timers) */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  fetchMock = vi.fn().mockResolvedValue(okResponse);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  process.removeAllListeners("beforeExit");
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("queueEvent batching", () => {
  it("does not insert per event — flushes one multi-row insert on the 5s timer", async () => {
    const client = await loadClient();

    client.queueEvent("page_views", { path: "/a" });
    client.queueEvent("page_views", { path: "/b" });
    client.queueEvent("page_views", { path: "/c" });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const rows = fetchRows(0);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.path)).toEqual(["/a", "/b", "/c"]);
  });

  it("flushes immediately when the batch size (200) is reached", async () => {
    const client = await loadClient();

    for (let i = 0; i < 200; i++) {
      client.queueEvent("page_views", { path: `/p${i}` });
    }

    // No timer advance needed — size threshold triggers the flush
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchRows(0)).toHaveLength(200);
  });

  it("uses separate queues per table", async () => {
    const client = await loadClient();

    client.queueEvent("page_views", { path: "/a" });
    client.queueEvent("api_calls", { endpoint: "/3/movie" });

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = [fetchUrl(0), fetchUrl(1)].join(" ");
    expect(urls).toContain("page_views");
    expect(urls).toContain("api_calls");
  });

  it("enables server-side async_insert on the insert URL", async () => {
    const client = await loadClient();

    client.queueEvent("page_views", { path: "/a" });
    await vi.advanceTimersByTimeAsync(5000);

    const url = new URL(fetchUrl(0));
    expect(url.searchParams.get("async_insert")).toBe("1");
    expect(url.searchParams.get("wait_for_async_insert")).toBe("0");
  });

  it("is a no-op when ClickHouse is not configured", async () => {
    const client = await loadClient(false);

    client.queueEvent("page_views", { path: "/a" });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("timestamps", () => {
  it("stamps timestamp at enqueue time, not flush time", async () => {
    const client = await loadClient();

    client.queueEvent("user_actions", { action: "watchlist_add" });
    await vi.advanceTimersByTimeAsync(5000); // flush happens 5s later

    const rows = fetchRows(0);
    expect(rows[0]?.timestamp).toBe(T0_CLICKHOUSE); // enqueue time, not T0+5s
  });

  it("preserves a caller-provided timestamp", async () => {
    const client = await loadClient();

    client.queueEvent("page_views", { path: "/a", timestamp: "2026-06-10 09:00:00.000" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchRows(0)[0]?.timestamp).toBe("2026-06-10 09:00:00.000");
  });
});

describe("bounded queue", () => {
  it("drops oldest events beyond 5000 and logs a warning", async () => {
    const client = await loadClient();

    // First 200 events trigger a flush; keep that insert in-flight so the
    // queue backs up (single-flight prevents further inserts)
    let resolveFirst: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );

    for (let i = 0; i < 200; i++) {
      client.queueEvent("page_views", { seq: i });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Queue 5100 more while the insert is stuck — exceeds the 5000 cap by 100
    for (let i = 200; i < 5300; i++) {
      client.queueEvent("page_views", { seq: i });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // still single-flight

    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "analytics_queue_overflow", table: "page_views" })
    );

    // Release the stuck insert — the backlog flushes as ONE bounded insert
    resolveFirst(okResponse);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const rows = fetchRows(1);
    expect(rows).toHaveLength(5000); // bounded, not 5100
    expect(rows[0]?.seq).toBe(300); // oldest 100 (seq 200-299) were dropped
    expect(rows[4999]?.seq).toBe(5299);
  });

  it("rate-limits overflow warnings", async () => {
    const client = await loadClient();

    let resolveFirst: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );

    // Overflow repeatedly within the warn interval — only one warning
    for (let i = 0; i < 5500; i++) {
      client.queueEvent("page_views", { seq: i });
    }
    expect(warnMock).toHaveBeenCalledTimes(1);

    resolveFirst(okResponse);
    await settle();
  });
});

describe("single-flight + recovery", () => {
  it("queues events during an in-flight insert and flushes them after it settles", async () => {
    const client = await loadClient();

    let resolveFirst: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        })
    );

    for (let i = 0; i < 200; i++) {
      client.queueEvent("page_views", { seq: i });
    }
    client.queueEvent("page_views", { seq: 200 });
    client.queueEvent("page_views", { seq: 201 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(okResponse);
    await settle();

    // Below batch size: re-armed on the timer, then flushed
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchRows(1).map((r) => r.seq)).toEqual([200, 201]);
  });

  it("never throws into the caller and keeps working after a transport error", async () => {
    const client = await loadClient();

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    expect(() => {
      client.queueEvent("page_views", { path: "/fails" });
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(5000);

    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: "clickhouse_insert_error", table: "page_views" })
    );

    // Next batch goes through fine
    client.queueEvent("page_views", { path: "/recovers" });
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchRows(1)[0]?.path).toBe("/recovers");
  });
});

describe("shutdown flush", () => {
  it("flushes pending events on process beforeExit", async () => {
    const client = await loadClient();

    client.queueEvent("page_views", { path: "/a" });
    client.queueEvent("page_views", { path: "/b" });
    expect(fetchMock).not.toHaveBeenCalled();

    process.emit("beforeExit", 0);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchRows(0)).toHaveLength(2);
  });
});

describe("insertAnalyticsEvent (former per-event path)", () => {
  it("routes through the batch queue instead of an immediate HTTP insert", async () => {
    const client = await loadClient();

    client.insertAnalyticsEvent("ai_usage", { event_type: "ai_usage", total_cost: 0.01 });
    client.insertAnalyticsEvent("ai_usage", { event_type: "ai_usage", total_cost: 0.02 });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchUrl(0)).toContain("ai_usage");
    expect(fetchRows(0)).toHaveLength(2);
  });
});

describe("track.ts integration", () => {
  it("trackUserAction events carry an enqueue-time timestamp through the queue", async () => {
    vi.resetModules();
    process.env.CLICKHOUSE_HOST = "localhost";
    process.env.CLICKHOUSE_PASSWORD = "test-password";
    const track: TrackModule = await import("./track");

    track.trackUserAction({
      sessionId: "s1",
      userId: null,
      isAuthenticated: false,
      country: "IN",
      isBot: false,
      action: "watchlist_add",
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = fetchRows(0);
    expect(rows[0]?.timestamp).toBe(T0_CLICKHOUSE);
    expect(rows[0]?.action).toBe("watchlist_add");
  });
});
