import type { Metadata, Viewport } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavBar } from "@/components/features/layout/nav-bar";
import { MobileBottomNav } from "@/components/features/layout/mobile-bottom-nav";
import { Footer } from "@/components/features/layout/footer";
import { ScrollToTop } from "@/components/features/layout/scroll-to-top";
import { ThemeColorSync } from "@/components/features/layout/theme-color-sync";
import { UsernameClaimPrompt } from "@/components/features/settings/username-claim-prompt";
import { ViewTransitions } from "@/lib/view-transitions";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: the virtual keyboard resizes the layout viewport (dvh + fixed-bottom
  // elements track it) instead of only the visual viewport. iOS ignores this.
  interactiveWidget: "resizes-content",
  // First-paint values only — ThemeColorSync replaces these with the live computed
  // background so the Android status bar always blends with the current theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL("https://themoviebrowser.com"),
  alternates: {
    canonical: "/",
  },
  title: {
    template: "%s - Movie Browser",
    default: "Movie Browser - Discover Movies & TV Shows",
  },
  description:
    "Track, discover and find where to watch TV shows and movies. Browse trending content, create watchlists, and get personalized recommendations.",
  keywords: [
    "movies",
    "tv shows",
    "streaming",
    "watchlist",
    "movie database",
    "tv series",
    "where to watch",
  ],
  authors: [{ name: "Movie Browser" }],
  creator: "Movie Browser",
  publisher: "Movie Browser",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://themoviebrowser.com",
    siteName: "Movie Browser",
    title: "Movie Browser - Discover Movies & TV Shows",
    description: "Track, discover and find where to watch TV shows and movies.",
    images: [
      {
        url: "/backdrop.webp",
        width: 1200,
        height: 630,
        alt: "Movie Browser",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ChaitanyaVootla",
    creator: "@ChaitanyaVootla",
    title: "Movie Browser",
    description: "Track, discover and find where to watch TV shows and movies.",
    images: ["/backdrop.webp"],
  },
  verification: {
    yandex: "0fae8749627beb1f",
  },
  icons: {
    icon: "/popcorn-lite.png",
    apple: "/images/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Movie Browser",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // ViewTransitions wraps document.startViewTransition around App Router
    // client navigations. It feature-detects (no startViewTransition → normal
    // nav) and is a no-op for routes without matching view-transition-name
    // elements, so unrelated navigations get at most a default cross-fade.
    // The detail↔discussions morph is opted in via shared `hero-backdrop` /
    // `hero-logo` names on those two routes' heroes (see globals.css for the
    // scoped timing + the prefers-reduced-motion kill switch).
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning>
        <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://api.themoviedb.org" />
      </head>
      <body
        className={`${montserrat.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <Providers>
          <ThemeColorSync />
          <ScrollToTop />
          <NavBar />
          <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-0">{children}</main>
          <Footer className="hidden md:block" />
          <MobileBottomNav />
          <UsernameClaimPrompt />
        </Providers>
      </body>
      </html>
    </ViewTransitions>
  );
}
