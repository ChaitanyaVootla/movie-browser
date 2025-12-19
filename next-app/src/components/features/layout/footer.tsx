import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="px-4 md:px-8 lg:px-12 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg mb-4">
              <Image
                src="/popcorn-lite.png"
                alt="TMB"
                width={24}
                height={24}
              />
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
              <li>
                <Link href="/movie" className="hover:text-foreground transition-colors">
                  Movies
                </Link>
              </li>
              <li>
                <Link href="/series" className="hover:text-foreground transition-colors">
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
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="font-semibold mb-4">Account</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/watchlist" className="hover:text-foreground transition-colors">
                  Watchlist
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
              <li>
                <Link href="/profile" className="hover:text-foreground transition-colors">
                  Profile
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
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Movie Browser. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
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
    </footer>
  );
}
