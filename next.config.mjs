import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // geoip-lite reads .dat files from node_modules at runtime — must not be bundled
  serverExternalPackages: ["geoip-lite"],

  // Disable streaming metadata for ALL user agents (not just the default bot
  // list). With streaming metadata (Next 15.2+ default), generateMetadata no
  // longer blocks the first flush, which silently breaks notFound() /
  // permanentRedirect() thrown from generateMetadata: garbage media IDs
  // returned 200 soft-404s and wrong-slug URLs couldn't 308. Blocking metadata
  // restores real status codes and keeps meta/JSON-LD in <head> (not streamed
  // into <body>, which some crawlers/social scrapers never parse). Cost: a
  // cache-miss render waits for data before first byte — acceptable since ISR
  // serves most hits from cache.
  htmlLimitedBots: /.*/,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "image.themoviebrowser.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN", // Prevent clickjacking
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // Prevent MIME type sniffing
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin", // Control referrer info
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()", // Disable unused features
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
