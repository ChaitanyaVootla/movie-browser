import { describe, it, expect } from "vitest";
import { isPublicIp, assertPublicAddresses, type DnsLookup } from "./ssrf-guard";

describe("isPublicIp", () => {
  it("rejects IPv4 loopback / RFC1918 / link-local / CGNAT", () => {
    for (const ip of [
      "127.0.0.1",
      "127.5.5.5",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata endpoint — the classic SSRF target
      "100.64.0.1", // CGNAT
      "0.0.0.0",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("rejects IPv6 loopback / link-local / ULA / v4-mapped private", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("accepts real public IPs", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
  it("rejects non-IP garbage", () => {
    expect(isPublicIp("not-an-ip")).toBe(false);
    expect(isPublicIp("")).toBe(false);
  });
});

describe("assertPublicAddresses (DNS-resolved hostname → all IPs must be public)", () => {
  const publicLookup: DnsLookup = async () => [{ address: "8.8.8.8", family: 4 }];
  const privateLookup: DnsLookup = async () => [{ address: "169.254.169.254", family: 4 }];
  const mixedLookup: DnsLookup = async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 }, // DNS-rebinding: one public, one private
  ];
  const throwingLookup: DnsLookup = async () => {
    throw new Error("ENOTFOUND");
  };

  it("passes when every resolved address is public", async () => {
    await expect(assertPublicAddresses("good.example.com", publicLookup)).resolves.toBe(true);
  });
  it("FAILS CLOSED (returns false) when any resolved address is private/link-local", async () => {
    await expect(assertPublicAddresses("evil.example.com", privateLookup)).resolves.toBe(false);
    await expect(assertPublicAddresses("rebind.example.com", mixedLookup)).resolves.toBe(false);
  });
  it("FAILS OPEN-AS-BLOCK (returns false, never throws) when DNS errors", async () => {
    await expect(assertPublicAddresses("nx.example.com", throwingLookup)).resolves.toBe(false);
  });
});
