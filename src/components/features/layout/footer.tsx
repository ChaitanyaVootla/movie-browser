import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { buildBrowseUrl } from "@/lib/discover";

interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn("border-t border-border/40 bg-muted/30", className)}>
      {/* pb-24 (not py-12): the AI assistant pill is fixed at bottom-6 with h-10
          (24–64px viewport band) — the copyright row needs to clear it at full scroll */}
      <div className="px-4 md:px-8 lg:px-12 pt-12 pb-24">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-4">
              <Image src="/popcorn-lite.png" alt="TMB" width={24} height={24} />
              <span className="tracking-wider font-extrabold">TMB</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Track, discover and find where to watch TV shows and movies.
            </p>
          </div>

          {/* Discover */}
          <div>
            <h3 className="font-semibold mb-4">Discover</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {/* /movie and /series listing routes don't exist (404) — link the
                  browse views, same targets as the home "Browse All" CTAs */}
              <li>
                <Link
                  href={buildBrowseUrl({ media_type: "movie", sort_by: "popularity.desc" })}
                  className="hover:text-foreground transition-colors"
                >
                  Movies
                </Link>
              </li>
              <li>
                <Link
                  href={buildBrowseUrl({ media_type: "tv", sort_by: "popularity.desc" })}
                  className="hover:text-foreground transition-colors"
                >
                  TV Shows
                </Link>
              </li>
              <li>
                <Link href="/browse" className="hover:text-foreground transition-colors">
                  Browse
                </Link>
              </li>
              <li>
                <Link href="/topics" className="hover:text-foreground transition-colors">
                  Topics
                </Link>
              </li>
              <li>
                <Link href="/discussions" className="hover:text-foreground transition-colors">
                  Discussions
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="font-semibold mb-4">Account</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/library" className="hover:text-foreground transition-colors">
                  Library
                </Link>
              </li>
              <li>
                <Link href="/watched" className="hover:text-foreground transition-colors">
                  Watched
                </Link>
              </li>
              <li>
                <Link href="/ratings" className="hover:text-foreground transition-colors">
                  Ratings
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/content-policy" className="hover:text-foreground transition-colors">
                  Content Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom — copyright left, then the two attributions (creator, data
            source) as a single right-aligned group so they read as one line on
            desktop and stack centred on mobile. */}
        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Movie Browser. All rights reserved.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {/* `rel="me author"` is the IndieWeb/HTML identity signal for the
                creator link. `noreferrer` is deliberately OMITTED here (unlike
                the TMDB link below): this is the site owner's own domain, and
                dropping the referrer would hide the referral in their
                analytics. The app-wide Referrer-Policy
                (strict-origin-when-cross-origin) already trims it to the
                origin. */}
            <p>
              Built by{" "}
              <a
                href="https://vootlachaitanya.com"
                target="_blank"
                rel="noopener me author"
                className="font-medium text-foreground/80 underline decoration-border decoration-1 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/60"
              >
                Chaitanya Vootla
              </a>
            </p>
            <p>
              Data provided by{" "}
              <a
                href="https://www.themoviedb.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                TMDB
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
