"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Sparkles, Compass, Shield, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountrySelector } from "./country-selector";
import { UserMenu, LoginDialog, useLoginDialog, SettingsMenu } from "@/components/features/auth";
import { useSearch } from "@/components/features/search";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/topics", label: "Topics", icon: Sparkles },
];

const authNavItems = [{ href: "/watchlist", label: "Watchlist", icon: Bookmark }];

export function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isOpen, openLoginDialog, setIsOpen } = useLoginDialog();
  const { open: isSearchOpen, setOpen: setSearchOpen } = useSearch();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isAdmin = session?.user?.role === "admin";

  // Only home + movie/series detail pages render dark imagery under the
  // transparent navbar (person hero is a themed gradient). White text is only
  // correct while transparent over that imagery; everywhere else (including the
  // scrolled bg-background/95 state) text must follow the theme.
  const isHeroRoute =
    pathname === "/" || pathname?.startsWith("/movie/") || pathname?.startsWith("/series/");
  const overHero = !isScrolled && Boolean(isHeroRoute);

  const navLinkClass = (active: boolean) =>
    cn(
      "gap-2 cursor-pointer",
      overHero
        ? "text-white/90 hover:text-white hover:bg-white/10"
        : "text-foreground/80 hover:text-foreground",
      active && (overHero ? "text-white bg-white/10" : "text-foreground bg-accent")
    );

  // Detect OS for keyboard shortcut display (client-side only)
  const [isMac, setIsMac] = useState(() => {
    // Default to true for SSR, will be corrected on client
    if (typeof window === "undefined") return true;
    return navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  });
  useEffect(() => {
    // Re-check on client mount in case SSR value differs
    const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    if (isMac !== isMacOS) {
      setIsMac(isMacOS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset scroll state on navigation, then track scroll position
  useEffect(() => {
    setIsScrolled(window.scrollY > 20);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return (
    <>
      <header
        data-testid="nav-header"
        className={cn(
          "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300",
          "pt-[env(safe-area-inset-top,0px)]",
          "hidden md:block", // Hide on mobile - using MobileBottomNav instead
          isScrolled
            ? "bg-background/95 backdrop-blur-xl border-b border-border/40 shadow-sm"
            : "bg-transparent"
        )}
      >
        <div className="flex h-16 items-center justify-between px-3 md:px-4 lg:px-6">
          {/* Left side: Logo + Navigation */}
          <div className="flex items-center gap-2 md:gap-4">
            {/* Logo */}
            <Link
              href="/"
              data-testid="nav-logo"
              // Always-rendered on every page; prefetching home's 22KB RSC
              // payload per page view is wasted weight — home loads on demand.
              prefetch={false}
              className="flex items-center gap-2 font-bold text-xl group"
            >
              <Image
                src="/popcorn-lite.png"
                alt="TMB"
                width={28}
                height={28}
                className="group-hover:rotate-6 group-hover:scale-110 transition-all duration-200"
              />
              <span
                className={cn(
                  "hidden sm:inline-block tracking-wider font-extrabold",
                  overHero ? "text-white drop-shadow-md" : "text-foreground"
                )}
              >
                TMB
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav data-testid="nav-desktop" className="hidden md:flex items-center gap-0.5">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} data-testid={`nav-${label.toLowerCase()}`}>
                  <Button
                    variant="ghost"
                    className={navLinkClass(Boolean(pathname?.startsWith(href)))}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
              {/* Auth-only nav items */}
              {isAuthenticated &&
                authNavItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} data-testid={`nav-${label.toLowerCase()}`}>
                    <Button
                      variant="ghost"
                      className={navLinkClass(Boolean(pathname?.startsWith(href)))}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  </Link>
                ))}
              {/* Admin link - only visible to admins */}
              {isAdmin && (
                <Link href="/admin" data-testid="nav-admin">
                  <Button
                    variant="ghost"
                    className={navLinkClass(Boolean(pathname?.startsWith("/admin")))}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
            </nav>
          </div>

          {/* Right side: Search & Actions */}
          <div className="flex items-center gap-3">
            {/* Desktop Search Trigger - Compact */}
            <button
              data-testid="nav-search"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm transition-colors",
                overHero
                  ? "bg-white/10 hover:bg-white/15 text-white/70"
                  : "bg-muted/50 hover:bg-muted text-muted-foreground"
              )}
            >
              <Search className="h-3.5 w-3.5" />
              <kbd
                className={cn(
                  "inline-flex h-5 items-center gap-0.5 rounded border px-1.5 font-mono text-[10px]",
                  overHero
                    ? "border-white/20 bg-white/10 text-white/60"
                    : "border-border bg-background text-muted-foreground"
                )}
              >
                {isMac ? "⌘" : "Ctrl"}K
              </kbd>
            </button>

            {/* Country Selector */}
            <CountrySelector compact className="hidden sm:flex" />

            {/* Auth: User Menu with theme toggle, or Settings + Sign In for non-auth */}
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <>
                {/* Settings dropdown for non-authenticated users */}
                <SettingsMenu />
                <Button
                  variant="default"
                  size="sm"
                  className="hidden sm:flex"
                  onClick={() => openLoginDialog()}
                  disabled={isLoading}
                >
                  {isLoading ? "..." : "Sign In"}
                </Button>
              </>
            )}

            {/* Mobile hamburger menu removed - using MobileBottomNav instead */}
          </div>
        </div>
      </header>

      {/* Login Dialog */}
      <LoginDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
