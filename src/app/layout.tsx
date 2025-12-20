import type { Metadata, Viewport } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavBar } from "@/components/features/layout/nav-bar";
import { Footer } from "@/components/features/layout/footer";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
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
    site: "@movie-browser",
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://api.themoviedb.org" />
      </head>
      <body
        className={`${montserrat.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <Providers>
          <NavBar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
