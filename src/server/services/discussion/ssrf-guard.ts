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

/**
 * Expand a v6 textual address (possibly with `::` compression and/or a trailing
 * dotted-decimal v4 tail) into its 8 16-bit hextet values. Returns null if it is
 * not a well-formed v6 literal. Used to inspect embedded v4 regardless of the
 * textual form the v4 was written in (`::ffff:127.0.0.1` vs `::ffff:7f00:1`).
 */
function ipv6ToHextets(ip: string): number[] | null {
  let s = ip.toLowerCase();
  // Strip a zone id (fe80::1%eth0) — irrelevant to the address value.
  const pct = s.indexOf("%");
  if (pct !== -1) s = s.slice(0, pct);

  // Split off an embedded dotted-decimal IPv4 tail into two hextets.
  let tailHextets: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const tail = lastColon === -1 ? "" : s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToParts(tail);
    if (!v4) return null;
    tailHextets = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    s = s.slice(0, lastColon + 1); // keep the trailing ':' for splitting below
    if (s.endsWith(":") && !s.endsWith("::")) s = s.slice(0, -1);
  }

  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      groups.push(parseInt(g, 16));
    }
    return groups;
  };

  const dblIdx = s.indexOf("::");
  let hextets: number[];
  if (dblIdx !== -1) {
    if (s.indexOf("::", dblIdx + 1) !== -1) return null; // more than one "::"
    const head = parseGroups(s.slice(0, dblIdx));
    const afterRaw = s.slice(dblIdx + 2);
    const after = parseGroups(afterRaw);
    if (head === null || after === null) return null;
    const known = head.length + after.length + tailHextets.length;
    if (known > 8) return null;
    const fill = new Array<number>(8 - known).fill(0);
    hextets = [...head, ...fill, ...after, ...tailHextets];
  } else {
    const groups = parseGroups(s);
    if (groups === null) return null;
    hextets = [...groups, ...tailHextets];
  }
  return hextets.length === 8 ? hextets : null;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  const h = ipv6ToHextets(lower);
  if (!h) return true; // unparseable → treat as unsafe

  // IPv4-mapped ::ffff:0:0/96 — first 5 hextets 0, sixth 0xffff. The embedded
  // v4 lives in the last two hextets regardless of textual form
  // (::ffff:127.0.0.1 == ::ffff:7f00:1). Validate it as v4.
  if (h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff) {
    return isPrivateIpv4(hextetsToIpv4(h[6], h[7]));
  }
  // 6to4 2002::/16 — embeds a v4 in hextets 1..2 (2002:V4hi:V4lo::/48).
  if (h[0] === 0x2002) {
    return isPrivateIpv4(hextetsToIpv4(h[1], h[2]));
  }
  // NAT64 well-known prefix 64:ff9b::/96 — embedded v4 in the last two hextets.
  if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
    return isPrivateIpv4(hextetsToIpv4(h[6], h[7]));
  }
  if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((h[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7 (fc/fd)
  return false;
}

/** Two 16-bit hextets → dotted-decimal IPv4 string. */
function hextetsToIpv4(hi: number, lo: number): string {
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
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
