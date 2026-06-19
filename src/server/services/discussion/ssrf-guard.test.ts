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
  it("rejects hex-compressed IPv4-mapped private addresses (the bypass)", () => {
    for (const ip of [
      "::ffff:7f00:1", // 127.0.0.1 in hex form
      "::ffff:0a00:0001", // 10.0.0.1 in hex form
      "::ffff:a9fe:a9fe", // 169.254.169.254 metadata in hex form
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("rejects 6to4 / NAT64 embeddings of private IPv4", () => {
    expect(isPublicIp("2002:7f00:1::"), "6to4 127.0.0.1").toBe(false); // 6to4 2002::/16
    expect(isPublicIp("2002:a9fe:a9fe::"), "6to4 metadata").toBe(false);
    expect(isPublicIp("64:ff9b::7f00:1"), "NAT64 127.0.0.1").toBe(false); // NAT64 64:ff9b::/96
    expect(isPublicIp("64:ff9b::a00:1"), "NAT64 10.0.0.1").toBe(false);
  });
  it("accepts real public IPs", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
    expect(isPublicIp("2001:4860:4860::8888")).toBe(true); // Google public DNS v6
    // 6to4 / NAT64 wrapping a PUBLIC v4 must still pass.
    expect(isPublicIp("2002:0808:0808::"), "6to4 8.8.8.8").toBe(true);
    expect(isPublicIp("64:ff9b::808:808"), "NAT64 8.8.8.8").toBe(true);
    expect(isPublicIp("::ffff:8.8.8.8"), "mapped 8.8.8.8").toBe(true);
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
