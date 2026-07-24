import type { Metadata } from "next";
import Link from "next/link";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { OVERLINE } from "@/lib/design";
import { SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How The Movie Browser handles your data: Google sign-in, first-party analytics, and no third-party ad trackers.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
};

const GITHUB_URL = "https://github.com/ChaitanyaVootla/movie-browser";

export default function PrivacyPage() {
  return (
    <PageMain>
      <article className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className={OVERLINE}>Legal</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-xs font-medium text-muted-foreground">Last updated June 10, 2026</p>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          The Movie Browser is a free movie and TV discovery site. We collect the minimum we need
          to run it, we don&apos;t sell your data, and we don&apos;t run third-party ad trackers.
          This page explains exactly what we store and why.
        </p>

        <section className="space-y-3">
          <SectionHeading>What we collect</SectionHeading>
          <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="text-foreground">Account info.</span> Signing in uses Google OAuth.
              We store your email address, display name, and avatar URL from your Google account —
              nothing else, and never your password.
            </li>
            <li>
              <span className="text-foreground">Your activity on the site.</span> Watchlist,
              ratings, and watch history you create are stored in our own PostgreSQL database so
              they sync across your devices.
            </li>
            <li>
              <span className="text-foreground">Usage analytics.</span> We run self-hosted,
              first-party analytics (page views, searches, feature clicks) on our own
              infrastructure. No data is shared with third-party analytics or advertising
              companies. If your browser sends the Do Not Track signal, analytics events are not
              recorded.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <SectionHeading>How we use it</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Account data identifies you when you sign in. Watchlist, ratings, and watch history
            power your library and personalized recommendations. Analytics help us understand
            which features are used so we can improve the site. That&apos;s it — we don&apos;t
            sell, rent, or share your personal data with advertisers or data brokers.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Cookies</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We use cookies only to keep you signed in and remember your preferences (theme,
            region). There are no advertising or cross-site tracking cookies.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Where your data lives</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            All user data is stored in our own PostgreSQL database on infrastructure we operate.
            Catalog data (titles, posters, ratings metadata) comes from TMDB — this product uses
            the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Your choices</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You can browse the entire site without an account. You can remove watchlist items,
            ratings, and watch history at any time from the site. To delete your account and all
            associated data, contact us and we&apos;ll remove it.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Contact</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Questions or data requests: open an issue on{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 text-foreground hover:text-brand transition-colors"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        <footer className="pt-2 border-t border-border/40">
          <p className="text-xs font-medium text-muted-foreground">
            See also our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>
            .
          </p>
        </footer>
      </article>
    </PageMain>
  );
}
