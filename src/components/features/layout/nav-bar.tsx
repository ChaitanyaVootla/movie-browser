"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Search, Menu, Users, Compass, Shield, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { CountrySelector } from "./country-selector";
import { UserMenu, LoginDialog, useLoginDialog } from "@/components/features/auth";
import { SearchCommand, useSearchCommand } from "@/components/features/search";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/topics", label: "Topics", icon: Users },
];

const authNavItems = [
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
];

export function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isOpen, openLoginDialog, setIsOpen } = useLoginDialog();
  const { open: isSearchOpen, setOpen: setSearchOpen } = useSearchCommand();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isAdmin = session?.user?.role === "admin";
  
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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300",
          isScrolled
            ? "bg-background/95 backdrop-blur-xl border-b border-border/40 shadow-sm"
            : "bg-transparent"
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 md:px-8 lg:px-12">
          {/* Left side: Logo + Navigation */}
          <div className="flex items-center gap-8">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-bold text-xl group">
              <Image
                src="/popcorn-lite.png"
                alt="TMB"
                width={28}
                height={28}
                className="group-hover:rotate-6 group-hover:scale-110 transition-all duration-200"
              />
              <span className="hidden sm:inline-block tracking-wider font-extrabold text-white drop-shadow-md">
                TMB
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "gap-2 text-muted-foreground hover:text-foreground hover:bg-white/10",
                      pathname?.startsWith(href) && "text-foreground bg-white/10"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
              {/* Auth-only nav items */}
              {isAuthenticated &&
                authNavItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "gap-2 text-muted-foreground hover:text-foreground hover:bg-white/10",
                        pathname?.startsWith(href) && "text-foreground bg-white/10"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  </Link>
                ))}
              {/* Admin link - only visible to admins */}
              {isAdmin && (
                <Link href="/admin">
                  <Button
                    variant="ghost"
                    className={cn(
                      "gap-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10",
                      pathname?.startsWith("/admin") && "text-amber-400 bg-amber-500/10"
                    )}
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
            {/* Desktop Search Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className={cn(
                "hidden md:flex items-center gap-3 h-9 w-64 px-3 rounded-md text-sm transition-colors",
                isScrolled
                  ? "bg-muted/50 hover:bg-muted text-muted-foreground"
                  : "bg-white/10 hover:bg-white/15 text-white/70"
              )}
            >
              <Search className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className={cn(
                "hidden lg:inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px]",
                isScrolled
                  ? "border-border bg-background text-muted-foreground"
                  : "border-white/20 bg-white/10 text-white/60"
              )}>
                {isMac ? "⌘" : "Ctrl"}K
              </kbd>
            </button>

            {/* Mobile Search Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 hover:bg-white/10"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="sr-only">Search</span>
            </Button>

            {/* Country Selector */}
            <CountrySelector compact className="hidden sm:flex" />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Auth: User Menu or Sign In Button */}
            {isAuthenticated ? (
              <UserMenu />
            ) : (
              <Button
                variant="default"
                size="sm"
                className="hidden sm:flex"
                onClick={() => openLoginDialog()}
                disabled={isLoading}
              >
                {isLoading ? "..." : "Sign In"}
              </Button>
            )}

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-white/10">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="text-left mb-6">Menu</SheetTitle>
                <nav className="flex flex-col gap-2">
                  {navItems.map(({ href, label, icon: Icon }) => (
                    <Link key={href} href={href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
                          pathname?.startsWith(href) && "text-foreground bg-accent"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        {label}
                      </Button>
                    </Link>
                  ))}
                  {/* Auth-only nav items in mobile menu */}
                  {isAuthenticated &&
                    authNavItems.map(({ href, label, icon: Icon }) => (
                      <Link key={href} href={href}>
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
                            pathname?.startsWith(href) && "text-foreground bg-accent"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {label}
                        </Button>
                      </Link>
                    ))}
                  {/* Admin link in mobile menu */}
                  {isAdmin && (
                    <Link href="/admin">
                      <Button
                        variant="ghost"
                        className={cn(
                          "w-full justify-start gap-3 text-amber-500 hover:text-amber-400",
                          pathname?.startsWith("/admin") && "text-amber-400 bg-amber-500/10"
                        )}
                      >
                        <Shield className="h-5 w-5" />
                        Admin
                      </Button>
                    </Link>
                  )}
                  <div className="pt-4 border-t border-border mt-4 space-y-3">
                    {/* Country selector in mobile menu */}
                    <div className="flex items-center justify-between px-2">
                      <span className="text-sm text-muted-foreground">Region</span>
                      <CountrySelector />
                    </div>
                    {isAuthenticated ? (
                      <UserMenu className="w-full" />
                    ) : (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => openLoginDialog()}
                        disabled={isLoading}
                      >
                        {isLoading ? "Loading..." : "Sign In"}
                      </Button>
                    )}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>

      </header>

      {/* Search Command Dialog */}
      <SearchCommand open={isSearchOpen} onOpenChange={setSearchOpen} />

      {/* Login Dialog */}
      <LoginDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}
