/**
 * ASN classification is the humanity signal of last resort — pinned because a
 * silent regression here re-corrupts every "human" number on the dashboard
 * (Jul 30 2026: the admin Human line read 873k for a period whose real human
 * traffic was a few hundred sessions/day).
 */
import { describe, it, expect } from "vitest";
import { isDatacenterAsn, DATACENTER_ASNS } from "./datacenter-asn";

describe("isDatacenterAsn", () => {
  it("flags the observed fleet networks", () => {
    expect(isDatacenterAsn("20473")).toBe(true); // Vultr — the Jul 29 fleet
    expect(isDatacenterAsn("14061")).toBe(true); // DigitalOcean
    expect(isDatacenterAsn("45102")).toBe(true); // Alibaba SG — the Jul 28 fleet
  });

  it("flags hyperscalers, which the SHED deliberately does not block", () => {
    // Blocking these would break search crawlers and link-unfurl bots; labelling
    // them is free. The two lists differ on purpose — see the module doc.
    for (const asn of [16509, 15169, 8075, 13335]) {
      expect(isDatacenterAsn(String(asn))).toBe(true);
    }
  });

  it("does not flag consumer ISPs", () => {
    expect(isDatacenterAsn("55836")).toBe(false); // Reliance Jio
    expect(isDatacenterAsn("7922")).toBe(false); // Comcast
    expect(isDatacenterAsn("45899")).toBe(false); // VNPT (a real top-traffic ISP here)
  });

  it("never guesses when the header is missing or junk", () => {
    // The header only arrives via CloudFront; a direct-to-origin request has none.
    expect(isDatacenterAsn(null)).toBe(false);
    expect(isDatacenterAsn("")).toBe(false);
    expect(isDatacenterAsn("not-a-number")).toBe(false);
    expect(isDatacenterAsn("0")).toBe(false);
    expect(isDatacenterAsn("-20473")).toBe(false);
  });

  it("tolerates whitespace from header parsing", () => {
    expect(isDatacenterAsn(" 20473 ")).toBe(true);
  });

  it("keeps the two policy lists from silently merging", () => {
    // If someone copies the shed list over this one we lose hyperscaler labelling;
    // if they copy this one into the shed we start 429ing Googlebot.
    expect(DATACENTER_ASNS.has(16509)).toBe(true);
    expect(DATACENTER_ASNS.size).toBeGreaterThan(20);
  });
});
