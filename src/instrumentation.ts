/**
 * Next.js instrumentation file.
 * This runs once when the server starts.
 *
 * Note: This file runs in Node.js runtime only, not Edge.
 */
export async function register() {
  // Only run DNS configuration in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Dynamic import to avoid Edge Runtime issues
    const dns = await import("dns");
    dns.setDefaultResultOrder("ipv4first");
    console.log("DNS resolver set to IPv4 first");
  }
}
