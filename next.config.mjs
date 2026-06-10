import { withSerwist } from "@serwist/turbopack";

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
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

  // 301s for URLs indexed from the legacy Nuxt site that have no Next.js
  // route: removed/renamed theme topics (Google still sends traffic) and the
  // old /movie + /series listing hubs. Targets verified to return 200.
  async redirects() {
    const goneThemeToTarget = {
      "theme-timetravel-movie": "/topics/theme-time-travel-movie",
      "theme-timetravel-tv": "/topics/theme-time-travel-tv",
      "theme-alien-movie": "/topics/theme-space-movie",
      "theme-alien-tv": "/topics/theme-space-tv",
      "theme-apocalyptic-movie": "/topics/theme-dystopia-movie",
      "theme-apocalyptic-tv": "/topics/theme-dystopia-tv",
      "theme-nuclear-movie": "/topics/theme-dystopia-movie",
      "theme-nuclear-tv": "/topics/theme-dystopia-tv",
      "theme-mythology-movie": "/topics/genre-fantasy-movie",
      "theme-mythology-tv": "/topics/genre-scifi-fantasy-tv",
      "theme-demon-movie": "/topics/genre-horror-movie",
      "theme-ghost-movie": "/topics/genre-horror-movie",
      "theme-monster-movie": "/topics/genre-horror-movie",
      "theme-possession-movie": "/topics/genre-horror-movie",
      "theme-vampire-movie": "/topics/genre-horror-movie",
      "theme-werewolf-movie": "/topics/genre-horror-movie",
      "theme-witch-movie": "/topics/genre-horror-movie",
      "theme-demon-tv": "/topics/genre-mystery-tv",
      "theme-ghost-tv": "/topics/genre-mystery-tv",
      "theme-monster-tv": "/topics/genre-mystery-tv",
      "theme-possession-tv": "/topics/genre-mystery-tv",
      "theme-vampire-tv": "/topics/genre-mystery-tv",
      "theme-werewolf-tv": "/topics/genre-mystery-tv",
      "theme-witch-tv": "/topics/genre-mystery-tv",
    };
    return [
      ...Object.entries(goneThemeToTarget).map(([slug, destination]) => ({
        source: `/topics/${slug}`,
        destination,
        permanent: true,
      })),
      // Legacy listing hubs (indexed on the old site, 404 on Next.js)
      { source: "/movie", destination: "/browse", permanent: true },
      { source: "/series", destination: "/browse", permanent: true },
    ];
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
