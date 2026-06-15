import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Injectable DNS resolver (real one is dns/promises.lookup with {all:true}). */
export type DnsLookup = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: DnsLookup = (hostname) => dnsLookup(hostname, { all: true });

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isPrivateIpv4(ip: string): boolean {
  const p = ipv4ToParts(ip);
  if (!p) return true; // unparseable → treat as unsafe
  const [a, b] = p;
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF) + 192.0.2.0/24 (TEST-NET)
  if (a >= 224) return true; // multicast + reserved (224-255)
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // v4-mapped (::ffff:a.b.c.d): defer to the v4 check.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local fc00::/7
  return false;
}

/** True only for a routable public IP literal. Unparseable / private → false. */
export function isPublicIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return !isPrivateIpv4(ip);
  if (fam === 6) return !isPrivateIpv6(ip);
  return false; // not an IP at all
}

/**
 * Resolve a hostname and require EVERY returned address to be public. Fails CLOSED:
 * any private/link-local address, an empty result, OR a DNS error returns false
 * (block). Never throws — the caller is on a fail-open render-adjacent path.
 */
export async function assertPublicAddresses(
  hostname: string,
  lookup: DnsLookup = defaultLookup
): Promise<boolean> {
  try {
    const addresses = await lookup(hostname);
    if (addresses.length === 0) return false;
    return addresses.every((a) => isPublicIp(a.address));
  } catch {
    return false;
  }
}
