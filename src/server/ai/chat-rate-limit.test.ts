import { describe, it, expect, vi, afterEach } from "vitest";
import { checkChatRateLimit, getClientIp } from "./chat-rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("checkChatRateLimit", () => {
  it("allows anon requests up to the burst limit, then blocks", () => {
    const ip = `test-anon-${Math.random()}`;
    for (let i = 0; i < 15; i++) {
      expect(checkChatRateLimit({ userId: null, ip }).allowed).toBe(true);
    }
    const blocked = checkChatRateLimit({ userId: null, ip });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys anon requests by IP — one abusive IP doesn't block others", () => {
    const abuser = `test-abuser-${Math.random()}`;
    const bystander = `test-bystander-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkChatRateLimit({ userId: null, ip: abuser });
    expect(checkChatRateLimit({ userId: null, ip: bystander }).allowed).toBe(true);
  });

  it("gives authenticated users a higher limit, keyed by userId", () => {
    const userId = `test-user-${Math.random()}`;
    for (let i = 0; i < 40; i++) {
      expect(checkChatRateLimit({ userId, ip: "shared-ip" }).allowed).toBe(true);
    }
    expect(checkChatRateLimit({ userId, ip: "shared-ip" }).allowed).toBe(false);
  });

  it("frees the burst window after time passes", () => {
    vi.useFakeTimers();
    const ip = `test-window-${Math.random()}`;
    for (let i = 0; i < 15; i++) checkChatRateLimit({ userId: null, ip });
    expect(checkChatRateLimit({ userId: null, ip }).allowed).toBe(false);

    vi.advanceTimersByTime(11 * 60 * 1000); // past the 10-min burst window
    expect(checkChatRateLimit({ userId: null, ip }).allowed).toBe(true);
  });

  it("enforces the daily cap even with spaced-out bursts", () => {
    vi.useFakeTimers();
    const ip = `test-daily-${Math.random()}`;
    let accepted = 0;
    // 10 requests every 11 minutes → never hits the burst cap
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < 10; i++) {
        if (checkChatRateLimit({ userId: null, ip }).allowed) accepted++;
      }
      vi.advanceTimersByTime(11 * 60 * 1000);
    }
    expect(accepted).toBe(60); // anon daily cap
  });
});

describe("getClientIp", () => {
  it("takes the first X-Forwarded-For entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
