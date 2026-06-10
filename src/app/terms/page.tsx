import type { Metadata } from "next";
import Link from "next/link";
import { PageMain } from "@/components/features/layout/page-main";
import { SectionHeading } from "@/components/features/layout/section-heading";
import { OVERLINE } from "@/lib/design";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using The Movie Browser, a free movie and TV discovery site powered by TMDB data.",
};

const GITHUB_URL = "https://github.com/ChaitanyaVootla/movie-browser";

export default function TermsPage() {
  return (
    <PageMain>
      <article className="max-w-2xl mx-auto space-y-8">
        <header className="space-y-2">
          <p className={OVERLINE}>Legal</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-xs font-medium text-muted-foreground">Last updated June 10, 2026</p>
        </header>

        <p className="text-sm leading-relaxed text-muted-foreground">
          The Movie Browser is a free service for discovering movies and TV shows and finding
          where to watch them. By using the site you agree to these terms — they&apos;re short and
          honest.
        </p>

        <section className="space-y-3">
          <SectionHeading>The service</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We provide movie and TV information, ratings, watch availability, and personal
            tracking tools (watchlist, ratings, watch history). The service is provided free of
            charge, as-is, and may change or be discontinued at any time. We do our best to keep
            it accurate and available, but we make no guarantees about uptime or correctness of
            catalog data.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Your account</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign-in is via Google OAuth. You&apos;re responsible for activity on your account.
            We store only your email, name, avatar, and the activity you create on the site — see
            the{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 text-foreground hover:text-brand transition-colors"
            >
              Privacy Policy
            </Link>{" "}
            for details. You can stop using the service at any time and request deletion of your
            data.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Acceptable use</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Don&apos;t abuse the service: no scraping at disruptive volumes, no attempts to
            disrupt or gain unauthorized access to our infrastructure, and no use of the site for
            anything unlawful. We may rate-limit or block traffic that degrades the service for
            others.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Content and attribution</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Movie and TV metadata, images, and related catalog content are supplied by TMDB. This
            product uses the TMDB API but is not endorsed or certified by TMDB. Streaming
            availability is informational and may lag behind the providers&apos; actual catalogs.
            All titles, artwork, and trademarks belong to their respective owners.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Disclaimer of warranties</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The service is provided &quot;as is&quot; without warranties of any kind. To the
            maximum extent permitted by law, we are not liable for any damages arising from your
            use of the site.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Changes to these terms</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We may update these terms occasionally; the date above reflects the latest revision.
            Continued use of the site after a change means you accept the updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <SectionHeading>Contact</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Questions about these terms: open an issue on{" "}
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
              href="/privacy"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </footer>
      </article>
    </PageMain>
  );
}
