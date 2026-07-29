/**
 * Hosting/cloud ASNs — for CLASSIFYING traffic as non-human in analytics.
 *
 * WHY THIS IS SEPARATE FROM THE SHED. `src/proxy.ts` has its own, deliberately
 * NARROWER `BLOCKED_HOSTING_ASNS`: blocking is a policy decision with real
 * downside (a false positive 429s a person), so it only lists cheap-VPS networks
 * an abusive fleet was actually observed on, and never AWS/Google/Azure/
 * Cloudflare because search crawlers and link-unfurl bots live there. This list
 * is the opposite trade-off: it only affects a `bot_type` label, so it can be
 * broad — a mislabelled VPN user costs nothing, while an unlabelled fleet
 * silently corrupts every "human" number on the dashboard.
 *
 * WHY IT IS NEEDED AT ALL (Jul 30 2026). Until Jul 28 the CloudFront
 * origin-request policy did not forward the viewer User-Agent, so ~94-95% of all
 * page views arrived as `User-Agent: Amazon CloudFront` and `bot-filter.ts`
 * force-classified them as bots. When UA forwarding shipped, that share went to
 * 0% overnight and the same requests started landing with their real — usually
 * FORGED Chrome — user agents, so the admin "Human" line leapt from ~0 to
 * 15-30k/hour with no change in actual traffic. UA is not a usable humanity
 * signal against fleets that forge it (and they also forge `Referer: google.com`,
 * which is why referer-derived counts overshoot Search Console clicks by ~20x).
 * The network a request comes FROM is much harder to fake: a crawl fleet has to
 * rent cloud IPs. Hence: classify by ASN.
 *
 * Real humans on a cloud VPN are the accepted false-positive. Search crawlers are
 * unaffected in practice because UA detection runs FIRST and keeps their specific
 * `bot_type` (googlebot/bingbot/…) — see `buildTrackingContext`.
 */

/** Cloud/hosting ASNs. Additive list — extend when a new fleet network shows up. */
export const DATACENTER_ASNS: ReadonlySet<number> = new Set([
  // Cheap VPS / the observed fleet networks (mirror of the shed list)
  20473, // AS-CHOOPA / Vultr (The Constant Company)
  14061, // DigitalOcean
  45102, // Alibaba Cloud (Singapore)
  37963, // Alibaba Cloud (Hangzhou)
  45103, // Alibaba Cloud US
  136907, // Huawei Cloud
  55990, // Huawei Cloud (2)
  51167, // Contabo
  24940, // Hetzner
  16276, // OVH
  63949, // Akamai / Linode
  132203, // Tencent Cloud
  45090, // Tencent Cloud (2)
  9009, // M247
  49981, // WorldStream
  // Hyperscalers — NOT shed (crawlers + unfurl bots live here) but still not
  // human traffic, so they belong in the analytics label.
  16509, // Amazon AWS
  14618, // Amazon AWS (2)
  15169, // Google
  396982, // Google Cloud
  8075, // Microsoft / Azure
  13335, // Cloudflare
  // Other common crawl/proxy hosts
  212238, // Datacamp / CDN77
  60068, // Datacamp
  62240, // Clouvider
  35916, // MULTACOM
  46652, // ServerPlan
]);

/**
 * True when the request's CloudFront-forwarded viewer ASN is a hosting network.
 * Returns false when the header is absent or unparseable — never guess.
 */
export function isDatacenterAsn(asnHeader: string | null): boolean {
  if (!asnHeader) return false;
  const asn = Number(asnHeader.trim());
  return Number.isFinite(asn) && asn > 0 && DATACENTER_ASNS.has(asn);
}
